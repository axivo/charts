/**
 * Frontpage service for repository frontpage operations
 * 
 * @class Frontpage
 * @module services/Frontpage
 * @author AXIVO
 * @license BSD-3-Clause
 */
const path = require('path');
const yaml = require('js-yaml');
const Action = require('../core/Action');
const Chart = require('./chart');
const File = require('./File');
const Template = require('./Template');

class Frontpage extends Action {
  /**
   * Creates a new Frontpage instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.fileService = new File(params);
    this.templateService = new Template(params);
  }

  /**
   * Executes a frontpage operation with error handling
   * 
   * @param {string} operation - Operation name for error reporting
   * @param {Function} action - Function to execute
   * @param {boolean} fatal - Whether errors should be fatal
   * @returns {Promise<any>} - Result of the operation or null on error
   */
  async execute(operation, action, fatal = true) {
    try {
      return await action();
    } catch (error) {
      this.errorHandler.handle(error, { operation, fatal });
      return null;
    }
  }

  /**
   * Generates the repository frontpage
   * 
   * @returns {Promise<void>}
   */
  async generate() {
    return this.execute('generate repository frontpage', async () => {
      this.logger.info('Generating repository frontpage...');
      const chartService = new Chart({
        github: this.github,
        context: this.context,
        core: this.core,
        exec: this.exec,
        config: this.config
      });
      const charts = await chartService.discover();
      const chartEntries = {};
      const allCharts = [
        ...charts.application.map(directory => ({ directory, type: 'application' })),
        ...charts.library.map(directory => ({ directory, type: 'library' }))
      ];
      await Promise.all(allCharts.map(async ({ directory, type }) => {
        const chartName = path.basename(directory);
        const chartYamlPath = path.join(directory, 'Chart.yaml');
        const chartContent = await this.fileService.read(chartYamlPath);
        const chartYaml = yaml.load(chartContent);
        chartEntries[chartName] = {
          description: chartYaml.description || '',
          type,
          version: chartYaml.version || ''
        };
      }));
      const sortedCharts = Object.entries(chartEntries)
        .sort(([currentName, currentData], [nextName, nextData]) => {
          return currentData.type.localeCompare(nextData.type) || currentName.localeCompare(nextName);
        })
        .map(([name, data]) => ({
          Description: data.description || '',
          Name: name,
          Type: data.type || 'application',
          Version: data.version || ''
        }));
      const config = this.config.get();
      const templatePath = config.theme.frontpage.template;
      const templateContent = await this.fileService.read(templatePath);
      const repoUrl = this.context.payload.repository.html_url;
      const defaultBranch = this.context.payload.repository.default_branch;
      const content = this.templateService.render(templateContent, {
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
    return this.execute('set Jekyll theme for GitHub Pages', async () => {
      const config = this.config.get();
      this.logger.info(`Setting up Jekyll theme for '${config.repository.release.deployment}' deployment...`);
      this.logger.info('Copying Jekyll theme config to ./_config.yml...');
      await this.fileService.copy(config.theme.configuration.file, './_config.yml');
      this.logger.info('Copying Jekyll theme custom head content to ./_includes/head-custom.html...');
      await this.fileService.createDir('./_includes');
      await this.fileService.copy(config.theme.head.template, './_includes/head-custom.html');
      this.logger.info('Copying Jekyll theme custom layout content to ./_layouts/default.html...');
      await this.fileService.createDir('./_layouts');
      await this.fileService.copy(config.theme.layout.template, './_layouts/default.html');
      const isPrivate = this.context.payload.repository.private === true;
      const publish = !isPrivate && config.repository.release.deployment === 'production';
      this.core.setOutput('publish', publish);
      this.logger.info(`Successfully set up Jekyll theme for '${config.repository.release.deployment}' deployment`);
    }, false);
  }
}

module.exports = Frontpage;
