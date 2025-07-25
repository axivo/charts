/**
 * Local Release handler for local development chart operations
 * 
 * @module handlers/release/Local
 * @author AXIVO
 * @license BSD-3-Clause
 */
const path = require('path');
const Action = require('../../core/Action');
const FileService = require('../../services/File');
const GitHubService = require('../../services/github');
const HelmService = require('../../services/helm');
const ReleaseService = require('../../services/release');

/**
 * Local Release handler for local development chart operations
 * 
 * Provides specialized handling for local development workflows including
 * dependency validation, chart processing, and local packaging operations.
 * 
 * @class LocalHandler
 */
class LocalHandler extends Action {
  /**
   * Creates a new LocalHandler instance
   * 
   * @param {Object} params - Handler parameters
   */
  constructor(params) {
    super(params);
    this.fileService = new FileService(params);
    this.githubService = new GitHubService.Rest(params);
    this.helmService = new HelmService(params);
    this.localService = new ReleaseService.Local(params);
    this.packageService = new ReleaseService.Package(params);
    this.releaseService = new ReleaseService(params);
  }

  /**
   * Process local chart releases
   * 
   * @returns {Promise<Object>} Process results
   */
  async process() {
    return this.execute('process local releases', async () => {
      if (this.config.get('repository.release.deployment') === 'production') {
        this.logger.info("In 'production' deployment mode, skipping local releases process");
        return { processed: 0, published: 0 };
      }
      const depsAvailable = await this.localService.checkDependencies();
      if (!depsAvailable) {
        this.logger.error('Missing required dependencies');
        return { processed: 0, published: 0 };
      }
      this.logger.info('Starting local chart release process...');
      const files = await this.localService.getLocalFiles();
      const charts = await this.releaseService.find(files);
      if (!charts.total && !charts.deleted.length) {
        this.logger.info(`No ${charts.total === 1 ? 'chart' : 'charts'} chart releases found`);
        return { processed: 0, published: 0 };
      }
      const chartResult = await this.localService.processCharts(charts);
      const result = {
        processed: chartResult.processed,
        published: chartResult.published,
        deleted: charts.deleted.length
      };
      let packages = [];
      if (charts.total) {
        const packagesDir = this.config.get('repository.release.packages');
        packages = await this.packageService.get(packagesDir);
      }
      if (charts.deleted.length) {
        await this.releaseService.delete(charts.deleted);
      }
      this.logger.info('Successfully completed the local chart release process');
      return result;
    });
  }
}

module.exports = LocalHandler;
