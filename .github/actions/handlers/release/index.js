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
    this.fileService = new File(params);
    this.githubService = new GitHub.Rest(params);
    this.packageService = new ReleaseService.Package(params);
    this.publishService = new ReleaseService.Publish(params);
    this.releaseService = new ReleaseService(params);
  }

  /**
   * Process chart releases
   * 
   * @returns {Promise<Object>} Release processing results
   */
  async process() {
    return this.execute('process releases', async () => {
      this.logger.info('Starting chart release process...');
      const files = await this.githubService.getUpdatedFiles({ context: this.context });
      const charts = await this.releaseService.find({ files });
      if (!charts.total && !charts.deleted.length) {
        this.logger.info('No chart releases found');
        return { processed: 0, published: 0 };
      }
      const result = {
        processed: charts.total,
        published: 0,
        deleted: charts.deleted.length
      };
      let packages = [];
      const packagesDir = this.config.get('repository.release.packages');
      if (charts.total) {
        await this.packageService.package(charts);
        packages = await this.packageService.get(packagesDir);
      }
      if (charts.deleted.length) await this.releaseService.delete({ 
        context: this.context, 
        files: charts.deleted 
      });
      if (packages.length) {
        const releases = await this.publishService.github(packages, packagesDir);
        result.published = releases.length;
        if (this.config.get('repository.chart.packages.enabled')) {
          await this.publishService.generateIndexes();
        }
        if (this.config.get('repository.oci.packages.enabled')) {
          await this.publishService.registry(packages, packagesDir);
        }
      } else {
        this.logger.info('No chart packages available for publishing');
      }
      this.logger.info('Successfully completed the chart releases process');
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

Release.Local = require('./Local');

module.exports = Release;
