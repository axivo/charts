/**
 * Release handler for release operations
 * 
 * @module handlers/release
 * @author AXIVO
 * @license BSD-3-Clause
 */
const path = require('path');
const Action = require('../../core/Action');
const ChartService = require('../../services/chart');
const FileService = require('../../services/File');
const GitHubService = require('../../services/github');
const ReleaseService = require('../../services/release');

/**
 * Release handler for release operations
 * 
 * Provides high-level orchestration for chart release processing including
 * inventory management, packaging, validation, and publishing to multiple targets.
 * 
 * @class ReleaseHandler
 */
class ReleaseHandler extends Action {
  /**
   * Creates a new ReleaseHandler instance
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
   * Deletes chart releases and packages
   * 
   * @private
   * @param {Array} inventory - Chart inventory data by type
   * @param {Array} type - Chart type identifiers
   * @returns {Promise<void>}
   */
  async #delete(inventory, type) {
    for (const [index, chartType] of type.entries()) {
      const charts = inventory[index];
      const deletedCharts = charts.filter(chart => chart.status === 'removed');
      for (const chart of deletedCharts) {
        await this.githubService.deleteReleases(chart.name);
        await this.githubService.deletePackage(chart.name, chartType);
      }
      if (deletedCharts.length) await this.chartService.deleteInventory(chartType, 'removed');
    }
  }

  /**
   * Validates and packages charts for release
   * 
   * @private
   * @param {Object} charts - Chart directories organized by type
   * @returns {Promise<Array>} Array of packaged charts
   */
  async #package(charts) {
    if (!charts.total) return [];
    const directory = this.config.get('repository.release.packages');
    const allCharts = [...charts.application, ...charts.library];
    for (const chart of allCharts) {
      const isValid = await this.releaseService.validate(chart);
      if (!isValid) {
        this.logger.warning(`Chart '${chart}' failed validation, skipping release`);
        continue;
      }
    }
    await this.releaseService.package(charts);
    return await this.packageService.get(directory);
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
      await this.#delete(inventory, chartTypes);
      const charts = { application: [], library: [], total: 0 };
      chartTypes.forEach((type, index) => {
        const typeChart = inventory[index].filter(chart => chart.status !== 'removed');
        const typePath = this.config.get(`repository.chart.type.${type}`);
        charts[type] = typeChart.map(chart => path.join(typePath, chart.name));
        charts.total += typeChart.length;
      });
      if (!charts.total) {
        this.logger.info('No chart releases found');
        return;
      }
      const packages = await this.#package(charts);
      if (packages.length) {
        const directory = this.config.get('repository.release.packages');
        await this.publishService.github(packages, directory);
        if (this.config.get('repository.chart.packages.enabled')) {
          await this.publishService.generateIndexes();
        }
        if (this.config.get('repository.oci.packages.enabled')) {
          await this.publishService.registry(packages, directory);
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
