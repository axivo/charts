/**
 * Chart service for managing Helm charts
 * 
 * @class Chart
 * @module services/Chart
 * @author AXIVO
 * @license BSD-3-Clause
 */
const path = require('path');
const Action = require('../core/Action');

class Chart extends Action {
  /**
   * Finds charts affected by file changes
   * 
   * @param {Array<string>} files - List of changed files to check
   * @returns {Promise<Object>} - Object containing application and library chart paths
   */
  async find(files) {
    const charts = { application: [], library: [], total: 0 };
    try {
      const File = require('./File');
      const fileService = new File(this.context);
      const chartTypes = this.config.get('repository.chart.type');
      const chartDirs = fileService.filterPath(files, chartTypes);
      for (const chartDir of chartDirs) {
        const [type, chartPath] = chartDir.split(':');
        const chartYamlPath = path.join(chartPath, 'Chart.yaml');
        if (await fileService.exists(chartYamlPath)) {
          charts[type].push(chartPath);
          charts.total++;
        }
      }
      if (charts.total) {
        const word = charts.total === 1 ? 'chart' : 'charts';
        this.logger.info(`Found ${charts.total} modified ${word}`);
      }
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'find modified charts',
        fatal: false
      });
    }
    return charts;
  }

  /**
   * Validates a chart for release
   * 
   * @param {string} chartDir - Chart directory
   * @returns {Promise<boolean>} - True if validation passed
   */
  async validate(chartDir) {
    try {
      const Helm = require('./Helm');
      const helmService = new Helm(this.context);
      if (!await helmService.lint(chartDir, { strict: true })) {
        return false;
      }
      this.logger.info(`Chart validation passed for ${chartDir}`);
      return true;
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: `validate chart ${chartDir}`,
        fatal: false
      });
      return false;
    }
  }
}

module.exports = Chart;
