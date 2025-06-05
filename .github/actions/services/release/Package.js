/**
 * Chart packaging service
 * 
 * @class Package
 * @module services/release/Package
 * @author AXIVO
 * @license BSD-3-Clause
 */
const path = require('path');
const Action = require('../../core/Action');
const File = require('../File');
const GitHub = require('../github');
const Shell = require('../Shell');

class Package extends Action {
  /**
   * Creates a new Package service instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.fileService = new File(params);
    this.restService = new GitHub.Rest(params);
    this.shellService = new Shell(params);
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
        const filename = source.replace('.tgz', '');
        const lastDashIndex = filename.lastIndexOf('-');
        const name = filename.substring(0, lastDashIndex);
        return { source, name };
      });
  }

  /**
   * Gets packaged charts from the package directory
   * 
   * @param {string} directory - Path to packages directory
   * @returns {Promise<Array>} List of package objects
   */
  async get(directory) {
    let result = [];
    return this.execute('get packages', async () => {
      const appType = this.config.get('repository.chart.type.application');
      const libType = this.config.get('repository.chart.type.library');
      const appPackagesDir = path.join(directory, appType);
      const libPackagesDir = path.join(directory, libType);
      const [appPackages, libPackages] = await Promise.all([
        this.#getPackages(appPackagesDir),
        this.#getPackages(libPackagesDir)
      ]);
      appPackages.forEach(pkg => pkg.type = appType);
      libPackages.forEach(pkg => pkg.type = libType);
      result.push(...appPackages, ...libPackages);
      return result;
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
   * @param {Object} package - Package object with source and type
   * @param {string} package.source - Package source file
   * @param {string} package.type - Package type
   * @param {string} directory - Path to packages directory
   * @returns {Promise<Object|null>} Package publish result or null on failure
   */
  async publish(registry, package, directory) {
    const { source, type } = package;
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

module.exports = Package;
