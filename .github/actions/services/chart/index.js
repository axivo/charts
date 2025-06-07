/**
 * Chart service for managing Helm charts
 * 
 * @class Chart
 * @module services/chart
 * @author AXIVO
 * @license BSD-3-Clause
 */
const path = require('path');
const Action = require('../../core/Action');
const FileService = require('../File');
const HelmService = require('../helm');
const ShellService = require('../Shell');
const UpdateService = require('./Update');

class ChartService extends Action {
  /**
   * Creates a new Chart instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.fileService = new FileService(params);
    this.helmService = new HelmService(params);
    this.shellService = new ShellService(params);
  }

  /**
   * Removes all charts with specific status from inventory
   * 
   * @param {string} type - Chart type ('application' or 'library')
   * @param {string} status - Status to remove ('removed' typically)
   * @returns {Promise<void>}
   */
  async deleteInventory(type, status) {
    return this.execute(`delete '${status}' charts from '${type}' inventory`, async () => {
      const inventoryPath = `${type}/inventory.yaml`;
      const inventory = await this.fileService.readYaml(inventoryPath);
      if (!inventory || !inventory[type]) {
        this.logger.info(`No '${type}' inventory found`);
        return;
      }
      const originalCount = inventory[type].length;
      inventory[type] = inventory[type].filter(chart => chart.status !== status);
      const removedCount = originalCount - inventory[type].length;
      if (removedCount > 0) {
        await this.fileService.writeYaml(inventoryPath, inventory);
        this.logger.info(`Removed ${removedCount} '${status}' charts from '${type}' inventory`);
      }
    }, false);
  }

  /**
   * Discovers all charts in the repository
   * 
   * @returns {Promise<Object>} - Object containing application and library chart paths
   */
  async discover() {
    return this.execute('discover charts', async () => {
      const charts = { application: [], library: [], total: 0 };
      const chartTypes = this.config.getChartTypes();
      const inventories = await Promise.all(
        chartTypes.map(type => this.fileService.readYaml(`${this.config.get(`repository.chart.type.${type}`)}/inventory.yaml`))
      );
      chartTypes.forEach((type, index) => {
        const inventory = inventories[index];
        const activeCharts = (inventory?.[this.config.get(`repository.chart.type.${type}`)] || [])
          .filter(chart => chart.status !== 'removed');
        charts[type] = activeCharts.map(chart =>
          path.join(this.config.get(`repository.chart.type.${type}`), chart.name)
        );
        charts.total += activeCharts.length;
      });
      const word = charts.total === 1 ? 'chart' : 'charts';
      this.logger.info(`Discovered ${charts.total} ${word} from inventory`);
      return charts;
    }, false);
  }

  /**
   * Finds charts affected by file changes
   * 
   * @param {Array<string>} files - List of changed files to check
   * @returns {Promise<Object>} - Object containing application and library chart paths
   */
  async find(files = []) {
    return this.execute('find modified charts', async () => {
      const charts = { application: [], library: [], total: 0 };
      if (!files || !files.length) return charts;
      const chartTypes = this.config.get('repository.chart.type');
      const chartDirs = this.fileService.filterPath(files, chartTypes);
      for (const chartDir of chartDirs) {
        const [type, chartPath] = chartDir.split(':');
        const chartYamlPath = path.join(chartPath, 'Chart.yaml');
        if (await this.fileService.exists(chartYamlPath)) {
          charts[type].push(chartPath);
          charts.total++;
        }
      }
      if (charts.total) {
        const word = charts.total === 1 ? 'chart' : 'charts';
        this.logger.info(`Found ${charts.total} modified ${word}`);
      }
      return charts;
    }, false);
  }

  /**
   * Returns all charts from inventory file
   * 
   * @param {string} type - Chart type ('application' or 'library')
   * @returns {Promise<Array<Object>>} - Array of chart objects with metadata
   */
  async getInventory(type) {
    return this.execute(`get '${type}' charts`, async () => {
      const inventoryPath = `${type}/inventory.yaml`;
      const inventory = await this.fileService.readYaml(inventoryPath);
      return inventory && inventory[type] ? inventory[type] : [];
    }, false);
  }

  /**
   * Lints multiple charts
   * 
   * @param {Array<string>} charts - Charts to lint
   * @returns {Promise<boolean>} - True if all charts passed linting
   */
  async lint(charts = []) {
    return this.execute('lint charts', async () => {
      if (!charts || !charts.length) return true;
      const word = charts.length === 1 ? 'chart' : 'charts';
      this.logger.info(`Linting ${charts.length} ${word}...`);
      await this.shellService.execute('ct', ['lint', '--charts', charts.join(','), '--skip-helm-dependencies']);
      this.logger.info(`Successfully linted ${charts.length} ${word}`);
      return true;
    }, false);
  }

  /**
   * Validates a chart for release
   * 
   * @param {string} directory - Chart directory
   * @returns {Promise<boolean>} - True if validation passed
   */
  async validate(directory) {
    return this.execute('validate chart', async () => {
      if (!await this.lint([directory])) {
        return false;
      }
      return true;
    }, false);
  }
}

ChartService.Update = UpdateService;

module.exports = ChartService;
