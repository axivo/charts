/**
 * Chart handler for chart operations
 * 
 * @class Chart
 * @module handlers/Chart
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Action = require('../core/Action');
const ChartService = require('../services/chart');
const DocsService = require('../services/helm/Docs');
const FileService = require('../services/File');
const GitService = require('../services/Git');
const GitHubService = require('../services/github');

class ChartHandler extends Action {
  /**
   * Creates a new Chart instance
   * 
   * @param {Object} params - Handler parameters
   */
  constructor(params) {
    super(params);
    this.chartService = new ChartService(params);
    this.chartUpdate = new ChartService.Update(params);
    this.docsService = new DocsService(params);
    this.fileService = new FileService(params);
    this.gitService = new GitService(params);
    this.githubService = new GitHubService.Rest(params);
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
      const chartFiles = Object.keys(files)
        .filter(file => file.endsWith('Chart.yaml'))
        .reduce((obj, file) => {
          obj[file] = files[file];
          return obj;
        }, {});
      await this.chartUpdate.inventory(chartFiles);
      return { charts: charts.total, updated: charts.total };
    });
  }
}

module.exports = ChartHandler;
