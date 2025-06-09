/**
 * Frontpage service for repository frontpage operations
 * 
 * @module services/Frontpage
 * @author AXIVO
 * @license BSD-3-Clause
 */
const path = require('path');
const Action = require('../core/Action');
const ChartService = require('./chart');
const FileService = require('./File');
const TemplateService = require('./Template');

/**
 * Frontpage service for repository frontpage operations
 * 
 * Provides repository frontpage generation and Jekyll theme setup
 * for GitHub Pages deployment with chart inventory integration.
 * 
 * @class FrontpageService
 */
class FrontpageService extends Action {
  /**
   * Creates a new FrontpageService instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.chartService = new ChartService(params);
    this.fileService = new FileService(params);
    this.templateService = new TemplateService(params);
  }

  /**
   * Generates the repository frontpage
   * 
   * @returns {Promise<void>}
   */
  async generate() {
    return this.execute('generate repository frontpage', async () => {
      this.logger.info('Generating repository frontpage...');
      const chartTypes = this.config.getChartTypes();
      const inventories = await Promise.all(
        chartTypes.map(type => this.fileService.readYaml(`${this.config.get(`repository.chart.type.${type}`)}/inventory.yaml`))
      );
      const allCharts = chartTypes.flatMap((type, index) => {
        const inventory = inventories[index];
        return (inventory?.[this.config.get(`repository.chart.type.${type}`)] || [])
          .filter(chart => chart.status !== 'removed')
          .map(chart => ({ ...chart, type: this.config.get(`repository.chart.type.${type}`) }));
      });
      const sortedCharts = allCharts
        .sort((current, next) => [
          current.type.localeCompare(next.type), current.name.localeCompare(next.name)
        ].find(Boolean))
        .map(chart => ({
          Description: chart.description,
          Name: chart.name,
          Type: chart.type,
          Version: chart.version
        }));
      const templatePath = this.config.get('theme.frontpage.template');
      const templateContent = await this.fileService.read(templatePath);
      const repoUrl = this.context.payload.repository.html_url;
      const defaultBranch = this.context.payload.repository.default_branch;
      const content = await this.templateService.render(templateContent, {
        Charts: sortedCharts,
        RepoURL: repoUrl,
        Branch: defaultBranch
      }, { repoUrl });
      await this.fileService.write('./index.md', content);
      this.logger.info(`Successfully generated frontpage with ${sortedCharts.length} charts`);
    }, false);
  }

  /**
   * Sets up Jekyll theme files for the frontpage
   * 
   * @returns {Promise<void>}
   */
  async setTheme() {
    return this.execute('set Jekyll theme', async () => {
      const deployment = this.config.get('repository.release.deployment');
      this.logger.info(`Setting up Jekyll theme for '${deployment}' deployment...`);
      await this.fileService.copy(this.config.get('theme.configuration.file'), './_config.yml');
      await this.fileService.createDir('./_includes');
      await this.fileService.copy(this.config.get('theme.head.template'), './_includes/head-custom.html');
      await this.fileService.createDir('./_layouts');
      await this.fileService.copy(this.config.get('theme.layout.template'), './_layouts/default.html');
      this.logger.info(`Successfully set up Jekyll theme for '${deployment}' deployment`);
    }, false);
  }
}

module.exports = FrontpageService;
