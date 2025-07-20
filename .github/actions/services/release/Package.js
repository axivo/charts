/**
 * Chart packaging service
 * 
 * @module services/release/Package
 * @author AXIVO
 * @license BSD-3-Clause
 */
const path = require('path');
const Action = require('../../core/Action');
const FileService = require('../File');
const GitHubService = require('../github');
const ShellService = require('../Shell');

/**
 * Chart packaging service
 * 
 * Provides chart package management including retrieval,
 * deletion, and OCI registry publishing operations.
 * 
 * @class PackageService
 */
class PackageService extends Action {
  /**
   * Creates a new PackageService instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.fileService = new FileService(params);
    this.restService = new GitHubService.Rest(params);
    this.shellService = new ShellService(params);
  }

  /**
   * Gets packages from a specific directory
   * 
   * @private
   * @param {string} directory - Directory path
   * @returns {Promise<Array>} List of packages
   */
  async #getPackages(directory) {
    if (!await this.fileService.exists(directory)) {
      return [];
    }
    const sources = await this.fileService.listDir(directory);
    return sources
      .filter(source => source.endsWith('.tgz'))
      .map(source => {
        const filename = path.basename(source).replace('.tgz', '');
        const lastDashIndex = filename.lastIndexOf('-');
        const name = filename.substring(0, lastDashIndex);
        return { source: path.basename(source), name };
      });
  }

  /**
   * Gets packaged charts from the package directory
   * 
   * @param {string} directory - Path to packages directory
   * @returns {Promise<Array>} List of package objects
   */
  async get(directory) {
    return this.execute('get packages', async () => {
      const allPackages = await Promise.all(
        this.config.getChartTypes().map(async type => {
          const packages = await this.#getPackages(path.join(directory, this.config.get(`repository.chart.type.${type}`)));
          return packages.map(pkg => ({ ...pkg, type }));
        })
      );
      return allPackages.flat();
    }, false);
  }

  /**
   * Deletes a package from OCI registry
   * 
   * @param {string} name - Chart name
   * @param {string} type - Package type
   * @returns {Promise<boolean>} True if deletion succeeded, false otherwise
   */
  async delete(name, type) {
    let result = false;
    return this.execute(`delete '${name}' package`, async () => {
      result = await this.restService.deletePackage(name, type);
      if (result) {
        this.logger.info(`Deleted existing OCI package for ${name}`);
      }
      return result;
    }, false);
  }

  /**
   * Publishes a package to OCI registry
   * 
   * @param {string} registry - OCI registry URL
   * @param {Object} name - Package object with source and type
   * @param {string} name.source - Package source file
   * @param {string} name.type - Package type
   * @param {string} directory - Path to packages directory
   * @returns {Promise<Object|null>} Package publish result or null on failure
   */
  async publish(registry, name, directory) {
    const { source, type } = name;
    let result = null;
    return this.execute(`publish '${source}' package`, async () => {
      const chartPath = path.join(directory, type, source);
      const registryPath = `oci://${registry}/${this.context.payload.repository.full_name}/${type}`;
      await this.shellService.execute('helm', ['push', chartPath, registryPath]);
      this.logger.info(`Successfully published '${source}' chart package to OCI registry`);
      result = {
        type,
        source,
        registry: registryPath
      };
      return result;
    }, false);
  }
}

module.exports = PackageService;
