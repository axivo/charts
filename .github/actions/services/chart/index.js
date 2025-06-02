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
const File = require('../File');
const Helm = require('../helm');
const Shell = require('../Shell');
const Update = require('./Update');

class Chart extends Action {
  /**
   * Creates a new Chart instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.fileService = new File(params);
    this.helmService = new Helm(params);
    this.shellService = new Shell(params);
  }

  /**
   * Discovers all charts in the repository
   * 
   * @returns {Promise<Object>} - Object containing application and library chart paths
   */
  async discover() {
    return this.execute('discover charts', async () => {
      const charts = { application: [], library: [], total: 0 };
      const types = [
        { name: 'application', path: this.config.get('repository.chart.type.application') },
        { name: 'library', path: this.config.get('repository.chart.type.library') }
      ];
      for (const type of types) {
        const dirs = await this.fileService.listDir(type.path);
        for (const dir of dirs) {
          if (dir.endsWith('.yaml') || dir.endsWith('.yml') || dir.endsWith('.md')) continue;
          const chartPath = path.basename(dir);
          const chartYamlPath = path.join(type.path, chartPath, 'Chart.yaml');
          if (await this.fileService.exists(chartYamlPath)) {
            charts[type.name].push(path.join(type.path, chartPath));
            charts.total++;
          }
        }
      }
      const word = charts.total === 1 ? 'chart' : 'charts';
      this.logger.info(`Discovered ${charts.total} ${word} in repository`);
      return charts;
    }, false);
  }

  /**
   * Finds charts affected by file changes
   * 
   * @param {Array<string>} files - List of changed files to check
   * @returns {Promise<Object>} - Object containing application and library chart paths
   */
  async find(files) {
    return this.execute('find modified charts', async () => {
      const charts = { application: [], library: [], total: 0 };
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
   * Lints multiple charts
   * 
   * @param {Array<string>} charts - Charts to lint
   * @returns {Promise<boolean>} - True if all charts passed linting
   */
  async lint(charts) {
    if (!charts || !charts.length) return true;
    return this.execute('lint charts', async () => {
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

Chart.Update = Update;

module.exports = Chart;
