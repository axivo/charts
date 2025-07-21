/**
 * Workflow handler for common workflow operations
 * 
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
const ReleaseHandler = require('./release');
const TemplateService = require('../services/Template');

/**
 * Workflow handler for common workflow operations
 * 
 * Provides orchestration for repository configuration, chart processing,
 * release management, and issue reporting across different workflow contexts.
 * 
 * @class WorkflowHandler
 */
class WorkflowHandler extends Action {
  /**
   * Creates a new WorkflowHandler instance
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
    this.releaseHandler = new ReleaseHandler(params);
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
      await this.releaseHandler.process();
      this.logger.info('Chart release process complete');
    });
  }

  /**
   * Report workflow issues
   * 
   * @returns {Promise<void>}
   */
  async reportIssue() {
    return this.execute('report workflow issue', async () => {
      this.logger.info('Checking for workflow issues...');
      const templatePath = this.config.get('workflow.template');
      const templateContent = await this.fileService.read(templatePath);
      const issue = await this.issueService.report(
        this.context,
        {
          content: templateContent,
          service: this.templateService
        }
      );
      let message = 'No workflow issues to report';
      if (issue) message = 'Successfully reported workflow issue';
      this.logger.info(`${message}`);
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
   * @returns {Promise<Object>} Update results
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
   * @returns {Promise<void>}
   */
  async updateLabels() {
    return this.execute('update issue labels', async () => {
      this.logger.info('Updating repository issue labels...');
      await this.labelService.update();
      this.logger.info('Repository issue labels update complete');
    }, false);
  }
}

module.exports = WorkflowHandler;
