/**
 * Workflow handler for common workflow operations
 * 
 * @class Workflow
 * @module handlers/Workflow
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Action = require('../core/Action');
const Chart = require('./Chart');
const config = require('../config');
const Release = require('./release');
const Frontpage = require('../services/Frontpage');
const { Docs, File, Git, Issue, Label, Template } = require('../services');

class Workflow extends Action {
  /**
   * Creates a new Workflow instance
   * 
   * @param {Object} params - Handler parameters
   */
  constructor(params) {
    params.config = config;
    super(params);
    this.frontpageService = new Frontpage(params);
    this.gitService = new Git(params);
    this.issueService = new Issue(params);
    this.labelService = new Label(params);
    this.templateService = new Template(params);
    this.fileService = new File(params);
  }

  /**
   * Configure repository
   * 
   * @returns {Promise<void>}
   */
  async configureRepository() {
    return this.execute('configure repository', async () => {
      this.logger.info('Configuring repository for workflow operations...');
      await this.gitService.configure();
      const isPrivate = this.context.payload.repository.private === true;
      const deployment = this.config.get('repository.release.deployment');
      const publish = !isPrivate && deployment === 'production';
      this.core.setOutput('publish', publish);
      this.logger.info('Repository configuration complete');
    });
  }

  /**
   * Install helm-docs
   * 
   * @param {string} version - Version of helm-docs to install
   * @returns {Promise<void>}
   */
  async installHelmDocs(version) {
    return this.execute('install helm-docs', async () => {
      const docsService = new Docs({
        github: this.github,
        context: this.context,
        core: this.core,
        exec: this.exec,
        config: this.config
      });
      await docsService.install(version);
    });
  }

  /**
   * Process chart releases
   * 
   * @returns {Promise<void>}
   */
  async processReleases() {
    return this.execute('process chart releases', async () => {
      this.logger.info('Processing chart releases...');
      const releaseHandler = new Release({
        github: this.github,
        context: this.context,
        core: this.core,
        exec: this.exec,
        config: this.config
      });
      await releaseHandler.process();
      this.logger.info('Chart release process complete');
    });
  }

  /**
   * Report workflow issues
   * 
   * @returns {Promise<Object>} - Issue creation result
   */
  async reportIssue() {
    return this.execute('report workflow issue', async () => {
      this.logger.info('Checking for workflow issues...');
      if (this.config.get('issue.createLabels') === true && this.context.workflow === 'Chart') {
        this.logger.warning('Set "createLabels: false" in config.js after initial setup, to optimize workflow performance.');
      }
      const templatePath = this.config.get('workflow.template');
      const templateContent = await this.fileService.read(templatePath);
      const issue = await this.issueService.report({
        context: this.context,
        templateContent,
        templateService: this.templateService,
        labelService: this.labelService
      });
      if (issue) {
        this.logger.info('Successfully reported workflow issue');
        return { created: true, issue };
      } else {
        this.logger.info('No workflow issues to report');
        return { created: false };
      }
    }, false);
  }

  /**
   * Setup frontpage for GitHub Pages
   * 
   * @returns {Promise<void>}
   */
  async setFrontpage() {
    return this.execute('setup build environment', async () => {
      this.logger.info('Setting up build environment...');
      await this.frontpageService.generate();
      await this.frontpageService.setTheme();
      this.logger.info('Build environment setup complete');
    });
  }

  /**
   * Update charts
   * 
   * @returns {Promise<Object>} - Update results
   */
  async updateCharts() {
    return this.execute('update charts', async () => {
      this.logger.info('Starting the charts update process...');
      const chartHandler = new Chart({
        github: this.github,
        context: this.context,
        core: this.core,
        exec: this.exec,
        config: this.config
      });
      const result = await chartHandler.process();
      this.logger.info('Successfully completed the charts update process');
      return result;
    });
  }

  /**
   * Update issue labels
   * 
   * @returns {Promise<string[]>} - Array of created label names
   */
  async updateLabels() {
    return this.execute('update issue labels', async () => {
      this.logger.info('Updating repository issue labels...');
      const result = await this.labelService.update();
      this.logger.info('Repository issue labels update complete');
      return result;
    }, false);
  }
}

module.exports = Workflow;
