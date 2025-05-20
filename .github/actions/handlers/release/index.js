/**
 * Release handler for release operations
 * 
 * @class Release
 * @module handlers/release
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Action = require('../../core/Action');
const { File, GitHub, Release: ReleaseService } = require('../../services');

class Release extends Action {
  /**
   * Creates a new Release instance
   * 
   * @param {Object} params - Handler parameters
   */
  constructor(params) {
    super(params);
    this.releaseService = new ReleaseService(params);
    this.fileService = new File(params);
    this.githubService = new GitHub.Rest(params);
    this.packageService = new ReleaseService.Package(params);
    this.publishService = new ReleaseService.Publish(params);
  }

  /**
   * Process chart releases
   * 
   * @returns {Promise<Object>} Release processing results
   */
  async process() {
    try {
      this.logger.info('Starting chart release process...');
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
      const config = this.config.get();
      const packagesDir = config.repository.release.packages;
      if (packages.length > 0) {
        const releases = await this.publishService.github(packages, packagesDir);
        result.published = releases.length;
        if (config.repository.chart.packages.enabled) {
          await this.publishService.generateIndexes();
        }
        if (config.repository.oci.packages.enabled) {
          await this.publishService.oci(packages, packagesDir);
        }
      } else {
        this.logger.info('No chart packages available for publishing');
      }
      this.logger.info('Successfully completed the chart releases process');
      return result;
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'process releases',
        fatal: true
      });
      return { error: true };
    }
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

module.exports = Release;