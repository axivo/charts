/**
 * Chart handler for chart operations
 * 
 * @class Chart
 * @module handlers/Chart
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Action = require('../core/Action');
const { Chart, File, Git, Helm, GitHub } = require('../services');

class ChartHandler extends Action {
  /**
   * Creates a new Chart handler instance
   * 
   * @param {Object} params - Handler parameters
   */
  constructor(params) {
    super(params);
    this.chartService = new Chart(params);
    this.fileService = new File(params);
    this.gitService = new Git(params);
    this.helmService = new Helm(params);
    this.githubService = new GitHub.Rest(params);
    this.chartUpdate = new Chart.Update(params);
  }

  /**
   * Main process method for chart updates
   * 
   * @returns {Promise<Object>} - Update results
   */
  async process() {
    try {
      const files = Object.keys(await this.githubService.getUpdatedFiles({ context: this.github.context }));
      const charts = await this.chartService.find({ core: this.core, files });
      if (charts.total === 0) {
        this.logger.info('No charts found');
        return { charts: 0, updated: 0 };
      }
      this.logger.info(`Found ${charts.total} charts`);
      const allCharts = [...charts.application, ...charts.library];
      await this.chartUpdate.application(allCharts);
      await this.chartUpdate.lock(allCharts);
      await this.chartUpdate.metadata(allCharts);
      await this.chartService.lint(allCharts);
      const modifiedFiles = await this.fileService.filter(allCharts);
      if (modifiedFiles.length) {
        await this.gitService.add(modifiedFiles);
        await this.gitService.commit('Update charts', { signoff: true });
        this.logger.info(`Committed ${modifiedFiles.length} modified files`);
      } else {
        this.logger.info('No files were modified');
      }
      this.logger.info('Chart update complete');
      return { charts: charts.total, updated: charts.total };
    } catch (error) {
      throw this.errorHandler.handle(error, { operation: 'update charts' });
    }
  }

  /**
   * Required run method
   * 
   * @returns {Promise<Object>} - Process results
   */
  async run() {
    return this.process();
  }
}

module.exports = ChartHandler;