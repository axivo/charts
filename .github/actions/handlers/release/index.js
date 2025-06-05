/**
 * Release handler for release operations
 * 
 * @class Release
 * @module handlers/release
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Action = require('../../core/Action');
const { Chart, File, GitHub, Release: ReleaseService } = require('../../services');

class Release extends Action {
  /**
   * Creates a new Release instance
   * 
   * @param {Object} params - Handler parameters
   */
  constructor(params) {
    super(params);
    this.chartService = new Chart(params);
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
      const [appCharts, libCharts] = await Promise.all([
        this.chartService.getInventory('application'),
        this.chartService.getInventory('library')
      ]);
      const deletedAppCharts = appCharts.filter(chart => chart.state === 'deleted');
      const deletedLibCharts = libCharts.filter(chart => chart.state === 'deleted');
      for (const chart of deletedAppCharts) {
        await this.githubService.deleteReleases(chart.name);
        await this.githubService.deletePackage(chart.name, 'application');
      }
      for (const chart of deletedLibCharts) {
        await this.githubService.deleteReleases(chart.name);
        await this.githubService.deletePackage(chart.name, 'library');
      }
      if (deletedAppCharts.length > 0) {
        await this.chartService.deleteInventory('application', 'deleted');
      }
      if (deletedLibCharts.length > 0) {
        await this.chartService.deleteInventory('library', 'deleted');
      }
      const files = await this.githubService.getUpdatedFiles();
      const charts = await this.releaseService.find(files);
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
        const allCharts = [...charts.application, ...charts.library];
        for (const chartDir of allCharts) {
          const isValid = await this.releaseService.validate(chartDir);
          if (!isValid) {
            this.logger.warning(`Chart '${chartDir}' failed validation, skipping release`);
            continue;
          }
        }
        await this.releaseService.package(charts);
        packages = await this.packageService.get(packagesDir);
      }
      if (charts.deleted.length) await this.releaseService.delete(charts.deleted);
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
