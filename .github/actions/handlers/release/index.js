/**
 * Release handler for release operations
 * 
 * @class Release
 * @module handlers/release
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Action = require('../../core/Action');
const ChartService = require('../../services/chart');
const FileService = require('../../services/File');
const GitHubService = require('../../services/github');
const ReleaseService = require('../../services/release');

class ReleaseHandler extends Action {
  /**
   * Creates a new Release instance
   * 
   * @param {Object} params - Handler parameters
   */
  constructor(params) {
    super(params);
    this.chartService = new ChartService(params);
    this.fileService = new FileService(params);
    this.githubService = new GitHubService.Rest(params);
    this.packageService = new ReleaseService.Package(params);
    this.publishService = new ReleaseService.Publish(params);
    this.releaseService = new ReleaseService(params);
  }

  /**
   * Process chart releases
   * 
   * @returns {Promise<void>}
   */
  async process() {
    return this.execute('process releases', async () => {
      this.logger.info('Starting chart release process...');
      const chartTypes = this.config.getChartTypes();
      const inventory = await Promise.all(chartTypes.map(type => this.chartService.getInventory(type)));
      for (const [index, type] of chartTypes.entries()) {
        const charts = inventory[index];
        const deletedCharts = charts.filter(chart => chart.status === 'removed');
        for (const chart of deletedCharts) {
          await this.githubService.deleteReleases(chart.name);
          await this.githubService.deletePackage(chart.name, type);
        }
        if (deletedCharts.length) await this.chartService.deleteInventory(type, 'removed');
      }
      const charts = { application: [], library: [], total: 0 };
      chartTypes.forEach((type, index) => {
        const typeCharts = inventory[index].filter(chart => chart.status !== 'removed');
        const typePath = this.config.get(`repository.chart.type.${type}`);
        charts[type] = typeCharts.map(chart => path.join(typePath, chart.name));
        charts.total += typeCharts.length;
      });
      if (!charts.total) {
        this.logger.info('No chart releases found');
        return;
      }
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
      if (packages.length) {
        await this.publishService.github(packages, packagesDir);
        if (this.config.get('repository.chart.packages.enabled')) {
          await this.publishService.generateIndexes();
        }
        if (this.config.get('repository.oci.packages.enabled')) {
          await this.publishService.registry(packages, packagesDir);
        }
      } else {
        this.logger.info('No chart packages available for publishing');
      }
      const word = charts.total === 1 ? 'release' : 'releases';
      this.logger.info(`Successfully processed ${charts.total} chart ${word}`);
    });
  }
}

ReleaseHandler.Local = require('./Local');

module.exports = ReleaseHandler;
