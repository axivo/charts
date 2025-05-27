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
const ErrorHandler = require('../utils/Error');
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
  constructor({ core, github, context, exec, config }) {
    this.core = core;
    this.github = github;
    this.context = context;
    this.exec = exec;
    this.config = config;
    this.errorHandler = new ErrorHandler(core);
    this.logger = new Logger(core, { context: this.constructor.name });
  }

  /**
   * Executes an operation with error handling
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
      this.errorHandler.handle(error, {
        operation,
        fatal
      });
      return null;
    }
  }
}

module.exports = Action;
