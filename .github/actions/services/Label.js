/**
 * Label service for repository label operations
 * 
 * @class Label
 * @module services/Label
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Action = require('../core/Action');
const { IssueError } = require('../utils/errors');

class Label extends Action {
  /**
   * Creates a new Label instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
  }

  /**
   * Adds a label to the repository if it doesn't exist
   * 
   * @param {string} name - Name of the label to add
   * @returns {Promise<boolean>} - True if label was created or exists
   */
  async add(name) {
    if (!name) {
      this.logger.warning('Label name is required');
      return false;
    }
    const labelConfig = this.config.get(`issue.labels.${name}`);
    if (!labelConfig) {
      this.logger.warning(`Label configuration not found for '${name}'`);
      return false;
    }
    const githubRest = this.github.rest || this.github;
    try {
      await githubRest.issues.getLabel({
        owner: this.github.context.repo.owner,
        repo: this.github.context.repo.repo,
        name: name
      });
      return true;
    } catch (error) {
      if (error.status === 404) {
        try {
          if (!this.config.get('issue.createLabels')) {
            this.logger.warning(`Label '${name}' not found and createLabels is disabled`);
            return false;
          }
          await githubRest.issues.createLabel({
            owner: this.github.context.repo.owner,
            repo: this.github.context.repo.repo,
            name: name,
            color: labelConfig.color,
            description: labelConfig.description
          });
          this.logger.info(`Created '${name}' label`);
          return true;
        } catch (createError) {
          this.errorHandler.handle(createError, {
            operation: `create '${name}' label`,
            fatal: false
          });
          return false;
        }
      }
      this.errorHandler.handle(error, {
        operation: `check '${name}' label`,
        fatal: false
      });
      return false;
    }
  }

  /**
   * Executes a label operation with error handling
   * 
   * @param {string} operation - Operation name for error reporting
   * @param {Function} action - Function to execute
   * @returns {Promise<any>} - Result of the operation
   */
  async execute(operation, action) {
    try {
      return await action();
    } catch (error) {
      throw new IssueError(operation, error);
    }
  }

  /**
   * Update repository labels based on configuration
   * 
   * @returns {Promise<string[]>} Array of created label names
   */
  async update() {
    if (!this.config.get('issue.createLabels')) {
      this.logger.info('Label creation is disabled in configuration, skipping label updates');
      return [];
    }
    try {
      this.logger.info('Updating repository issue labels...');
      const labelNames = Object.keys(this.config.get('issue.labels'));
      const results = await Promise.all(
        labelNames.map(async labelName => {
          const created = await this.add(labelName);
          return created ? labelName : null;
        })
      );
      const createdLabels = results.filter(Boolean);
      if (createdLabels.length) {
        this.logger.info(`Successfully updated ${createdLabels.length} issue labels`);
      }
      return createdLabels;
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'update repository issue labels',
        fatal: false
      });
      return [];
    }
  }
}

module.exports = Label;
