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
   * Gets all charts from inventory
   * 
   * @returns {Promise<Object>} Object containing categorized charts
   */
  async getCharts() {
    let result = { application: [], library: [], total: 0 };
    return this.execute('get inventory charts', async () => {
      const chartTypes = this.config.getChartTypes();
      for (const type of chartTypes) {
        const typePath = this.config.get(`repository.chart.type.${type}`);
        const inventory = await this.chartService.getInventory(type);
        result[type] = inventory.map(chart => path.join(typePath, chart.name));
      }
      result.total = result.application.length + result.library.length;
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
    return this.execute('package charts', async () => {
      const root = this.config.get('repository.release.packages');
      const chartTypes = this.config.getChartTypes();
      await this.fileService.createDir(root);
      const directories = {};
      await Promise.all(chartTypes.map(async type => {
        directories[type] = path.join(root, this.config.get(`repository.chart.type.${type}`));
        await this.fileService.createDir(directories[type]);
      }));
      this.logger.info(`Packaging ${charts.total} charts...`);
      const allChartPromises = chartTypes.flatMap(type =>
        charts[type].map(chartDir =>
          this.execute(`package '${chartDir}' chart`, async () => {
            await this.helmService.updateDependencies(chartDir);
            await this.helmService.package(chartDir, { destination: directories[type] });
            return { chartDir, success: true, type };
          }, false)
        )
      );
      result = (await Promise.all(allChartPromises)).filter(operation => operation && operation.success);
      const word = result.length === 1 ? 'chart' : 'charts';
      this.logger.info(`Successfully packaged ${result.length} ${word}`);
      return result;
    }, false);
  }
}

ReleaseService.Local = require('./Local');
ReleaseService.Package = require('./Package');
ReleaseService.Publish = require('./Publish');

module.exports = ReleaseService;
