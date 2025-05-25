/**
 * Issue handler for issue and label operations
 * 
 * @class Issue
 * @module handlers/Issue
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Action = require('../core/Action');
const { IssueError } = require('../utils/errors');
const { File, GitHub, Template, Issue } = require('../services');
const Label = require('../services/issue/Label');

class Issue extends Action {
  /**
   * Creates a new Issue instance
   * 
   * @param {Object} params - Handler parameters
   */
  constructor(params) {
    super(params);
    this.fileService = new File(params);
    this.githubService = new GitHub.Rest(params);
    this.issueService = new Issue(params);
    this.labelService = new Label(params);
    this.templateService = new Template(params);
  }

  /**
   * Adds one or more labels to the repository
   * 
   * @param {string|string[]} names - Names of the labels to add
   * @returns {Promise<boolean[]>} - Results of label operations
   */
  async addLabel(names) {
    try {
      const labels = Array.isArray(names) ? names : [names];
      const results = await Promise.all(labels.map(name =>
        this.labelService.add(name)
      ));
      return results;
    } catch (error) {
      throw this.errorHandler.handle(error, {
        operation: 'add label',
        fatal: false
      });
    }
  }

  /**
   * Creates an issue with the specified parameters
   * 
   * @param {Object} params - Issue creation parameters
   * @param {string} params.title - Issue title
   * @param {string} params.body - Issue body content
   * @param {string[]} params.labels - Issue labels
   * @returns {Promise<Object>} - Created issue data
   */
  async create(params) {
    try {
      if (params.labels && this.config.get('issue.createLabels')) {
        await this.addLabel(params.labels);
      }
      return await this.issueService.create(params);
    } catch (error) {
      throw this.errorHandler.handle(error, {
        operation: 'create issue',
        fatal: false
      });
    }
  }

  /**
   * Executes an issue operation with error handling
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
      throw new IssueError(operation, error, details);
    }
  }

  /**
   * Process issues based on handler type
   * 
   * @returns {Promise<Object>} Processing results
   */
  async process() {
    return this.execute('process issues', async () => {
      const action = this.context.payload.action;
      switch (action) {
        case 'labeled':
          this.logger.info('Processing labeled action');
          return { processed: true, action: 'labeled' };
        case 'opened':
          this.logger.info('Processing opened action');
          return { processed: true, action: 'opened' };
        default:
          this.logger.info(`No handler for action: ${action}`);
          return { processed: false };
      }
    });
  }

  /**
   * Report workflow issues by detecting failures and creating issues
   * 
   * @returns {Promise<Object>} Issue creation result
   */
  async report() {
    try {
      const githubRest = this.github.rest || this.github;
      const hasIssues = await this.validate();
      if (this.config.get('issue.createLabels') && this.context.workflow === 'Chart') {
        this.logger.warning('Set "createLabels: false" in config.js after initial setup, to optimize workflow performance.');
      }
      if (!hasIssues) {
        this.logger.info('No failures or warnings detected, skipping issue creation');
        return { created: false };
      }
      this.logger.info('Creating workflow issue...');
      const templatePath = this.config.get('workflow.template');
      const templateContent = await this.fileService.read(templatePath);
      const issue = await this.issueService.report({
        context: this.context,
        templateContent,
        templateService: this.templateService,
        labelService: this.labelService
      });
      return { created: true, issue };
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'report workflow issue',
        fatal: false
      });
      return { created: false, error: error.message };
    }
  }

  /**
   * Required run method
   * 
   * @returns {Promise<Object>} Process results
   */
  async run() {
    return this.process();
  }

  /**
   * Update repository labels based on configuration
   * 
   * @returns {Promise<string[]>} Array of created label names
   */
  async updateLabels() {
    try {
      return await this.labelService.update();
    } catch (error) {
      throw this.errorHandler.handle(error, {
        operation: 'update labels',
        fatal: false
      });
    }
  }

  /**
   * Validate workflow run status
   * 
   * @returns {Promise<boolean>} True if there are issues
   */
  async validate() {
    try {
      const runId = this.context.runId;
      const result = await this.githubService.getWorkflowRun({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        runId
      });
      const hasIssues = result.conclusion !== 'success' ||
        result.status === 'failure' ||
        result.status === 'cancelled';
      this.logger.info(`Workflow run status: ${result.status}, conclusion: ${result.conclusion}, hasIssues: ${hasIssues}`);
      return hasIssues;
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'check workflow run status',
        fatal: false
      });
      return true; // Assume there are issues if we can't check
    }
  }
}

module.exports = Issue;
