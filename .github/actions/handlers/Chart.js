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
   * @returns {Promise<void>}
   */
  async process() {
    return this.execute('process charts', async () => {
      const updatedFilesMap = await this.githubService.getUpdatedFiles();
      const files = Object.keys(updatedFilesMap);
      const charts = await this.chartService.find(files);
      if (charts.total) {
        const updatedCharts = [...charts.application, ...charts.library];
        await this.chartUpdate.application(updatedCharts);
        await this.chartUpdate.lock(updatedCharts);
        await this.chartUpdate.metadata(updatedCharts);
        await this.chartService.lint(updatedCharts);
        await this.docsService.generate(updatedCharts);
      }
      const updatedFiles = Object.keys(updatedFilesMap)
        .filter(file => file.endsWith('Chart.yaml'))
        .reduce((obj, file) => {
          obj[file] = updatedFilesMap[file];
          return obj;
        }, {});
      await this.chartUpdate.inventory(updatedFiles);
    });
  }
}

module.exports = ChartHandler;
