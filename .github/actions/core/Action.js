/**
 * Base Action class for GitHub Actions
 * 
 * Provides dependency injection, context management, and error handling
 * for implementing GitHub Actions functionality.
 * 
 * @class Action
 * @module core
 * @author AXIVO
 * @license BSD-3-Clause
 */
const ActionError = require('./Error');
const Logger = require('./Logger');

class Action {
  /**
   * Creates a new Action instance
   * 
   * @param {Object} params - Action parameters
   * @param {Object} params.core - GitHub Actions Core API
   * @param {Object} params.github - GitHub API client
   * @param {Object} params.context - GitHub Actions context
   * @param {Object} params.exec - GitHub Actions exec helper
   * @param {Object} params.config - Configuration instance
   */
  constructor(params) {
    const { core, github, context, exec, config } = params;
    this.actionError = new ActionError(params);
    this.config = config;
    this.context = context;
    this.core = core;
    this.exec = exec;
    this.github = github;
    this.logger = new Logger(params, {
      context: this.constructor.name,
      timestamp: this.config.get('workflow.logLevel') === 'debug',
      level: this.config.get('workflow.logLevel') || 'info'
    });
    this.actionError.setHandler();
  }

  /**
   * Executes an operation with error handling
   * 
   * @param {string} operation - Operation name for error reporting
   * @param {Function} action - Action to execute
   * @param {boolean} fatal - Whether errors should be fatal
   * @returns {Promise<any>} - Result of the operation or null on error
   */
  async execute(operation, action, fatal = true) {
    const isDebug = this.config.get('workflow.logLevel') === 'debug';
    const startTime = isDebug ? Date.now() : 0;
    if (isDebug) this.logger.info(`→ ${operation}`, { level: 'debug' });
    try {
      const result = await action();
      if (isDebug) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        this.logger.info(`← ${operation} completed in ${duration}s`, { level: 'debug' });
      }
      return result;
    } catch (error) {
      if (isDebug) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        this.logger.info(`❌ ${operation} failed after ${duration}s`, { level: 'debug' });
      }
      this.actionError.report({
        operation,
        fatal
      }, error);
      return null;
    }
  }

  /**
   * Determines if deployments are in local or publish mode
   * 
   * @returns {boolean} - True if in publish mode
   */
  publish() {
    const isPrivate = this.context.payload.repository.private === true;
    const deployment = this.config.get('repository.release.deployment');
    return !isPrivate && deployment !== 'local';
  }
}

module.exports = Action;
