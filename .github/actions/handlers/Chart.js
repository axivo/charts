/**
 * Chart handler for chart operations
 * 
 * @class Chart
 * @module handlers/Chart
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Action = require('../core/Action');
const { Chart: ChartService, Docs, File, Git, GitHub } = require('../services');

class Chart extends Action {
  /**
   * Creates a new Chart instance
   * 
   * @param {Object} params - Handler parameters
   */
  constructor(params) {
    super(params);
    this.chartService = new ChartService(params);
    this.docsService = new Docs(params);
    this.fileService = new File(params);
    this.gitService = new Git(params);
    this.githubService = new GitHub.Rest(params);
    this.chartUpdate = new ChartService.Update(params);
  }

  /**
   * Main process method for chart updates
   * 
   * @returns {Promise<Object>} - Update results
   */
  async process() {
    try {
      const files = Object.keys(await this.githubService.getUpdatedFiles({ context: this.context }));
      const charts = await this.chartService.find(files);
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
      await this.docsService.generate(allCharts);
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

module.exports = Chart;
