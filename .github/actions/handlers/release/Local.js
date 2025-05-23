/**
 * Local Release handler for local development chart operations
 * 
 * @class Local
 * @module handlers/release
 * @author AXIVO
 * @license BSD-3-Clause
 */
const path = require('path');
const Action = require('../../core/Action');
const { File, GitHub, Helm, Release: ReleaseService } = require('../../services');
const { ReleaseError } = require('../../utils/errors');

class Local extends Action {
  /**
   * Creates a new Local instance
   * 
   * @param {Object} params - Handler parameters
   */
  constructor(params) {
    super(params);
    this.fileService = new File(params);
    this.githubService = new GitHub.Rest(params);
    this.helmService = new Helm(params);
    this.releaseService = new ReleaseService(params);
    this.packageService = new ReleaseService.Package(params);
  }

  /**
   * Executes a release operation with error handling
   * 
   * @param {string} operation - Operation name
   * @param {Function} action - Action to execute
   * @param {Object} details - Additional error details
   * @returns {Promise<any>} Operation result
   */
  async execute(operation, action, details) {
    try {
      return await action();
    } catch (error) {
      throw new ReleaseError(operation, error, details);
    }
  }

  /**
   * Process local chart releases
   * 
   * @returns {Promise<Object>} Process results
   */
  async process() {
    return this.execute('process local releases', async () => {
      this.logger.info('Starting local chart release process...');
      const files = await this.githubService.getUpdatedFiles();
      const charts = await this.releaseService.find(files);
      if (!charts.total && !charts.deleted.length) {
        this.logger.info(`No ${charts.word} chart releases found`);
        return { processed: 0, published: 0 };
      }
      const result = {
        processed: charts.total,
        published: 0,
        deleted: charts.deleted.length
      };
      let packages = [];
      if (charts.total > 0) {
        const packaged = await this.packageService.package(charts);
        const config = this.config.get();
        const packagesDir = config.repository.release.packages;
        packages = await this.packageService.get(packagesDir);
      }
      if (charts.deleted.length) {
        await this.releaseService.delete(charts.deleted);
      }
      this.logger.info('Successfully completed the local chart release process');
      return result;
    });
  }

  /**
   * Run the handler
   * 
   * @returns {Promise<Object>} Process results
   */
  async run() {
    return this.process();
  }
}

module.exports = Local;
