/**
 * Chart handler for chart operations
 * 
 * @class Chart
 * @module handlers/Chart
 * @author AXIVO
 * @license BSD-3-Clause
 */
const path = require('path');
const Action = require('../core/Action');
const { Chart, Docs, File, Git, GitHub } = require('../services');

class Chart extends Action {
  /**
   * Creates a new Chart instance
   * 
   * @param {Object} params - Handler parameters
   */
  constructor(params) {
    super(params);
    this.chartService = new Chart(params);
    this.chartUpdate = new Chart.Update(params);
    this.docsService = new Docs(params);
    this.fileService = new File(params);
    this.gitService = new Git(params);
    this.githubService = new GitHub.Rest(params);
  }

  /**
   * Main process method for chart updates
   * 
   * @returns {Promise<Object>} - Update results
   */
  async process() {
    return this.execute('process charts', async () => {
      const files = Object.keys(await this.githubService.getUpdatedFiles());
      const charts = await this.chartService.find(files);
      if (charts.total === 0) {
        this.logger.info('No chart updates found');
        return { charts: 0, updated: 0 };
      }
      const allCharts = [...charts.application, ...charts.library];
      await this.chartUpdate.application(allCharts);
      await this.chartUpdate.lock(allCharts);
      await this.chartUpdate.metadata(allCharts);
      await this.chartService.lint(allCharts);
      await this.docsService.generate(allCharts);
      const deletedCharts = Object.keys(files)
        .filter(file => file.endsWith('Chart.yaml') && files[file] === 'removed');
      for (const filePath of deletedCharts) {
        const chartName = path.basename(path.dirname(filePath));
        const chartType = path.dirname(filePath).split('/')[0];
        await this.chartUpdate.inventory(chartType, chartName, 'deleted');
      }
      for (const chartPath of allCharts) {
        const chartName = path.basename(chartPath);
        const chartType = chartPath.startsWith('application') ? 'application' : 'library';
        await this.chartUpdate.inventory(chartType, chartName, 'released');
      }
      return { charts: charts.total, updated: charts.total };
    });
  }
}

module.exports = Chart;
