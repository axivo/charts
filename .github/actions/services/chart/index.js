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
const Update = require('./Update');
const { File, Helm } = require('../');

class Chart extends Action {
  /**
   * Discovers all charts in the repository
   * 
   * @returns {Promise<Object>} - Object containing application and library chart paths
   */
  async discover() {
    const charts = { application: [], library: [], total: 0 };
    try {
      const fileService = new File({
        github: this.github,
        context: this.context,
        core: this.core,
        exec: this.exec,
        config: this.config
      });
      const config = this.config.get();
      const appType = config.repository.chart.type.application;
      const libType = config.repository.chart.type.library;
      const types = [
        { name: 'application', path: appType },
        { name: 'library', path: libType }
      ];
      for (const type of types) {
        const dirs = await fileService.listDir(type.path);
        for (const dir of dirs) {
          if (dir.endsWith('.yaml') || dir.endsWith('.yml') || dir.endsWith('.md')) continue;
          const chartPath = path.basename(dir);
          const chartYamlPath = path.join(type.path, chartPath, 'Chart.yaml');
          if (await fileService.exists(chartYamlPath)) {
            charts[type.name].push(path.join(type.path, chartPath));
            charts.total++;
          }
        }
      }
      const word = charts.total === 1 ? 'chart' : 'charts';
      this.logger.info(`Discovered ${charts.total} ${word} in repository`);
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'discover charts',
        fatal: false
      });
    }
    return charts;
  }

  /**
   * Finds charts affected by file changes
   * 
   * @param {Array<string>} files - List of changed files to check
   * @returns {Promise<Object>} - Object containing application and library chart paths
   */
  async find(files) {
    const charts = { application: [], library: [], total: 0 };
    try {
      const fileService = new File({
        github: this.github,
        context: this.context,
        core: this.core,
        exec: this.exec,
        config: this.config
      });
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
   * Lints multiple charts
   * 
   * @param {Array<string>} charts - Chart directories to lint
   * @returns {Promise<boolean>} - True if all charts passed linting
   */
  async lint(charts) {
    if (!charts || !charts.length) return true;
    this.logger.info(`Linting ${charts.length} charts`);
    let success = true;
    for (const chartDir of charts) {
      const helmService = new Helm({
        github: this.github,
        context: this.context,
        core: this.core,
        exec: this.exec,
        config: this.config
      });
      const result = await helmService.lint(chartDir, { strict: true });
      if (!result) success = false;
    }
    return success;
  }

  /**
   * Validates a chart for release
   * 
   * @param {string} chartDir - Chart directory
   * @returns {Promise<boolean>} - True if validation passed
   */
  async validate(chartDir) {
    try {
      const helmService = new Helm({
        github: this.github,
        context: this.context,
        core: this.core,
        exec: this.exec,
        config: this.config
      });
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

Chart.Update = Update;

module.exports = Chart;
