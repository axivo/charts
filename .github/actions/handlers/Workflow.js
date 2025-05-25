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
  }

  /**
   * Static method to configure repository
   * 
   * @param {Object} params - Handler parameters
   * @returns {Promise<void>}
   */
  static async configureRepository(params) {
    const workflow = new Workflow(params);
    try {
      workflow.logger.info('Configuring repository for workflow operations...');
      const gitService = new Git(params);
      await gitService.configure();
      workflow.logger.info('Repository configuration complete');
    } catch (error) {
      throw workflow.errorHandler.handle(error, { operation: 'configure repository' });
    }
  }

  /**
   * Static method to install helm-docs
   * 
   * @param {Object} params - Handler parameters
   * @param {string} params.version - Version of helm-docs to install
   * @returns {Promise<void>}
   */
  static async installHelmDocs(params) {
    const workflow = new Workflow(params);
    try {
      workflow.logger.info('Installing helm-docs...');
      const docsService = new Docs({
        github: params.github,
        context: params.context,
        core: params.core,
        exec: params.exec,
        config: params.config
      });
      await docsService.install(params.version);
      workflow.logger.info('Helm-docs installation complete');
    } catch (error) {
      throw workflow.errorHandler.handle(error, { operation: 'install helm-docs' });
    }
  }

  /**
   * Static method to process chart releases
   * 
   * @param {Object} params - Handler parameters
   * @returns {Promise<void>}
   */
  static async processReleases(params) {
    const workflow = new Workflow(params);
    try {
      workflow.logger.info('Processing chart releases...');
      const releaseHandler = new Release({
        github: params.github,
        context: params.context,
        core: params.core,
        exec: params.exec,
        config: params.config
      });
      await releaseHandler.process();
      workflow.logger.info('Chart release process complete');
    } catch (error) {
      throw workflow.errorHandler.handle(error, { operation: 'process chart releases' });
    }
  }

  /**
   * Static method to report workflow issues
   * 
   * @param {Object} params - Handler parameters
   * @returns {Promise<Object>} - Issue creation result
   */
  static async reportIssue(params) {
    const workflow = new Workflow(params);
    try {
      workflow.logger.info('Checking for workflow issues...');
      const issueService = new Issue(params);
      const templateService = new Template(params);
      const labelService = new Label(params);
      const fileService = new File(params);
      if (workflow.config.get('issue.createLabels') === true && params.context.workflow === 'Chart') {
        workflow.logger.warning('Set "createLabels: false" in config.js after initial setup, to optimize workflow performance.');
      }
      const templatePath = workflow.config.get('workflow.template');
      const templateContent = await fileService.read(templatePath);
      const issue = await issueService.report({ context: params.context, templateContent, templateService, labelService });
      if (issue) {
        workflow.logger.info('Workflow issue reported successfully');
        return { created: true, issue };
      } else {
        workflow.logger.info('No workflow issues to report');
        return { created: false };
      }
    } catch (error) {
      workflow.errorHandler.handle(error, { operation: 'report workflow issue', fatal: false });
      return { created: false, error: error.message };
    }
  }

  /**
   * Static method to setup frontpage for GitHub Pages
   * 
   * @param {Object} params - Handler parameters
   * @returns {Promise<void>}
   */
  static async setFrontpage(params) {
    const workflow = new Workflow(params);
    try {
      workflow.logger.info('Setting up build environment...');
      const frontpageService = new Frontpage(params);
      await frontpageService.generate();
      await frontpageService.setTheme();
      workflow.logger.info('Build environment setup complete');
    } catch (error) {
      throw workflow.errorHandler.handle(error, { operation: 'setup build environment' });
    }
  }

  /**
   * Static method to update charts
   * 
   * @param {Object} params - Handler parameters
   * @returns {Promise<Object>} - Update results
   */
  static async updateCharts(params) {
    const workflow = new Workflow(params);
    try {
      workflow.logger.info('Starting chart update process...');
      const chartHandler = new Chart({
        github: params.github,
        context: params.context,
        core: params.core,
        exec: params.exec,
        config: params.config
      });
      const result = await chartHandler.process();
      workflow.logger.info('Chart update process complete');
      return result;
    } catch (error) {
      throw workflow.errorHandler.handle(error, { operation: 'update charts' });
    }
  }

  /**
   * Static method to update issue labels
   * 
   * @param {Object} params - Handler parameters
   * @returns {Promise<string[]>} - Array of created label names
   */
  static async updateLabels(params) {
    const workflow = new Workflow(params);
    try {
      workflow.logger.info('Updating repository issue labels...');
      const labelService = new Label(params);
      const result = await labelService.update();
      workflow.logger.info('Issue labels update complete');
      return result;
    } catch (error) {
      throw workflow.errorHandler.handle(error, { operation: 'update issue labels', fatal: false });
    }
  }
}

module.exports = Workflow;
