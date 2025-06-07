/**
 * Release service for managing chart releases
 * 
 * @module services/release
 * @author AXIVO
 * @license BSD-3-Clause
 */
const path = require('path');
const Action = require('../../core/Action');
const ChartService = require('../chart');
const FileService = require('../File');
const GitHubService = require('../github');
const HelmService = require('../helm');

/**
 * Release service for managing chart releases
 * 
 * Provides comprehensive chart release management including packaging,
 * validation, deletion, and file-based chart discovery.
 * 
 * @class ReleaseService
 */
class ReleaseService extends Action {
  /**
   * Creates a new ReleaseService instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.chartService = new ChartService(params);
    this.fileService = new FileService(params);
    this.githubService = new GitHubService.Rest(params);
    this.helmService = new HelmService(params);
  }

  /**
   * Deletes GitHub releases for deleted charts
   * 
   * @param {Array} [files=[]] - List of deleted chart files
   * @returns {Promise<number>} Number of deleted releases
   */
  async delete(files = []) {
    let result = 0;
    return this.execute('delete releases', async () => {
      if (!files.length) return result;
      const word = files.length === 1 ? 'release' : 'releases';
      this.logger.info(`Deleting ${files.length} chart ${word}...`);
      for (const filePath of files) {
        const deleted = await this.execute(`delete releases for '${filePath}' chart`, async () => {
          const appType = this.config.get('repository.chart.type.application');
          const chartPath = path.dirname(filePath);
          const name = path.basename(chartPath);
          const type = chartPath.startsWith(appType) ? 'application' : 'library';
          if (this.config.get('repository.chart.packages.enabled')) {
            await this.githubService.deleteReleases(name);
          }
          if (this.config.get('repository.oci.packages.enabled')) {
            await this.githubService.deletePackage(name, type);
          }
          return true;
        }, false);
        if (deleted) result++;
      }
      return result;
    }, false);
  }

  /**
   * Finds release-eligible charts based on file changes
   * 
   * @param {Object} [files={}] - Object mapping file paths to their Git change status
   * @returns {Promise<Object>} Object containing categorized charts
   */
  async find(files = {}) {
    let result = { application: [], library: [], deleted: [], total: 0 };
    return this.execute('find release-eligible charts', async () => {
      this.logger.info('Finding charts...');
      const appType = this.config.get('repository.chart.type.application');
      const libType = this.config.get('repository.chart.type.library');
      const fileList = Object.keys(files);
      for (const file of fileList) {
        if (!file.endsWith('Chart.yaml')) continue;
        const dir = path.dirname(file);
        const isApp = dir.startsWith(appType);
        const isLib = dir.startsWith(libType);
        if (!isApp && !isLib) continue;
        if (files[file] === 'removed') {
          result.deleted.push(file);
          continue;
        }
        if (isApp) result.application.push(dir);
        else result.library.push(dir);
      }
      result.total = result.application.length + result.library.length;
      const word = (count) => count === 1 ? 'chart' : 'charts';
      const released = `${result.total} released ${word(result.total)}`;
      const deleted = `${result.deleted.length} deleted ${word(result.deleted.length)}`;
      this.logger.info(`Found ${released} and ${deleted}`);
      return result;
    }, false);
  }

  /**
   * Packages charts for release
   * 
   * @param {Object} charts - Object with application and library charts
   * @returns {Promise<Array>} List of packaged charts
   */
  async package(charts) {
    let result = [];
    return this.execute('package release', async () => {
      if (!charts.application.length && !charts.library.length) {
        this.logger.info('No charts to package');
        return result;
      }
      const root = this.config.get('repository.release.packages');
      const appType = this.config.get('repository.chart.type.application');
      const libType = this.config.get('repository.chart.type.library');
      await this.fileService.createDir(root);
      const application = path.join(root, appType);
      const library = path.join(root, libType);
      await this.fileService.createDir(application);
      await this.fileService.createDir(library);
      const directory = { root, application, library };
      const chartDirs = [...charts.application, ...charts.library];
      this.logger.info(`Packaging ${chartDirs.length} charts...`);
      const packageResults = await Promise.all(chartDirs.map(async (chartDir) => {
        return this.execute(`package '${chartDir}' chart`, async () => {
          this.logger.info(`Packaging '${chartDir}' chart...`);
          this.logger.info(`Updating dependencies for '${chartDir}' chart...`);
          await this.helmService.updateDependencies(chartDir);
          const isAppChartType = chartDir.startsWith(appType);
          const packageDest = isAppChartType ? directory.application : directory.library;
          await this.helmService.package(chartDir, { destination: packageDest });
          return {
            chartDir,
            success: true,
            type: isAppChartType ? 'application' : 'library'
          };
        }, false);
      }));
      result = packageResults.filter(operation => operation && operation.success);
      const successCount = result.length;
      const word = successCount === 1 ? 'chart' : 'charts';
      this.logger.info(`Successfully packaged ${successCount} ${word}`);
      return result;
    }, false);
  }

  /**
   * Validates a release-eligible chart
   * 
   * @param {string} directory - Chart directory path
   * @returns {Promise<boolean>} True if chart is eligible for release
   */
  async validate(directory) {
    return this.execute('validate release-eligible chart', async () => {
      return await this.chartService.validate(directory);
    }, false);
  }
}

// Attach specialized services
ReleaseService.Local = require('./Local');
ReleaseService.Package = require('./Package');
ReleaseService.Publish = require('./Publish');

module.exports = ReleaseService;
