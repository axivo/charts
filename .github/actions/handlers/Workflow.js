/**
 * Workflow handler for common workflow operations
 * 
 * @class Workflow
 * @module handlers/Workflow
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Action = require('../core/Action');
const ChartHandler = require('./Chart');
const config = require('../config');
const DocsService = require('../services/helm/Docs');
const FileService = require('../services/File');
const FrontpageService = require('../services/Frontpage');
const GitService = require('../services/Git');
const IssueService = require('../services/Issue');
const LabelService = require('../services/Label');
const ReleaseService = require('../services/release');
const TemplateService = require('../services/Template');

class WorkflowHandler extends Action {
  /**
   * Creates a new Workflow instance
   * 
   * @param {Object} params - Handler parameters
   */
  constructor(params) {
    params.config = config;
    super(params);
    this.chartHandler = new ChartHandler(params);
    this.docsService = new DocsService(params);
    this.fileService = new FileService(params);
    this.frontpageService = new FrontpageService(params);
    this.gitService = new GitService(params);
    this.issueService = new IssueService(params);
    this.labelService = new LabelService(params);
    this.releaseService = new ReleaseService(params);
    this.templateService = new TemplateService(params);
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
      this.core.setOutput('publish', this.publish());
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
      await this.docsService.install(version);
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
      await this.releaseService.process();
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
      await this.chartHandler.process();
      this.logger.info('Successfully completed the charts update process');
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

module.exports = WorkflowHandler;
