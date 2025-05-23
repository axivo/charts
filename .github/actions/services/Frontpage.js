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
const { FrontpageError } = require('../utils/errors');

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
   * @param {string} operation - Operation name
   * @param {Function} action - Action to execute
   * @param {Object} details - Additional error details
   * @returns {Promise<any>} Operation result
   */
  async execute(operation, action, details) {
    try {
      return await action();
    } catch (error) {
      throw new FrontpageError(operation, error, details);
    }
  }

  /**
   * Generates the repository frontpage
   * 
   * @returns {Promise<void>}
   */
  async generate() {
    return this.execute('generate frontpage', async () => {
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
        ...charts.application.map(dir => ({ dir, type: 'application' })),
        ...charts.library.map(dir => ({ dir, type: 'library' }))
      ];
      await Promise.all(allCharts.map(async ({ dir, type }) => {
        try {
          const chartName = path.basename(dir);
          const chartYamlPath = path.join(dir, 'Chart.yaml');
          const chartContent = await this.fileService.read(chartYamlPath);
          const chartYaml = yaml.load(chartContent);
          chartEntries[chartName] = {
            description: chartYaml.description || '',
            type,
            version: chartYaml.version || ''
          };
        } catch (error) {
          this.errorHandler.handle(error, {
            operation: `read chart metadata for ${dir}`,
            fatal: false
          });
        }
      }));
      const sortedCharts = Object.entries(chartEntries)
        .sort(([aName, aData], [bName, bData]) => {
          return aData.type.localeCompare(bData.type) || aName.localeCompare(bName);
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
    });
  }

  /**
   * Sets up Jekyll theme files for the frontpage
   * 
   * @returns {Promise<void>}
   */
  async setTheme() {
    return this.execute('set Jekyll theme', async () => {
      const config = this.config.get();
      this.logger.info(`Setting up Jekyll theme for '${config.repository.release.deployment}' deployment...`);
      try {
        this.logger.info('Copying Jekyll theme config to ./_config.yml...');
        await this.fileService.copy(config.theme.configuration.file, './_config.yml');
      } catch (error) {
        throw this.errorHandler.handle(error, { operation: 'copy Jekyll theme config' });
      }
      try {
        this.logger.info('Copying Jekyll theme custom head content to ./_includes/head-custom.html...');
        await this.fileService.createDir('./_includes');
        await this.fileService.copy(config.theme.head.template, './_includes/head-custom.html');
      } catch (error) {
        this.errorHandler.handle(error, {
          operation: 'copy Jekyll theme custom head content',
          fatal: false
        });
      }
      try {
        this.logger.info('Copying Jekyll theme custom layout content to ./_layouts/default.html...');
        await this.fileService.createDir('./_layouts');
        await this.fileService.copy(config.theme.layout.template, './_layouts/default.html');
      } catch (error) {
        this.errorHandler.handle(error, {
          operation: 'copy Jekyll theme custom layout content',
          fatal: false
        });
      }
      const isPrivate = this.context.payload.repository.private === true;
      const publish = !isPrivate && config.repository.release.deployment === 'production';
      this.core.setOutput('publish', publish);
      this.logger.info(`Successfully set up Jekyll theme for '${config.repository.release.deployment}' deployment`);
    });
  }
}

module.exports = Frontpage;
