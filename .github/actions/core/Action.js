/**
 * Base Action class for GitHub Actions
 * 
 * Provides dependency injection, context management, and lifecycle hooks
 * for implementing GitHub Actions functionality.
 * 
 * @class Action
 * @module core
 * @author AXIVO
 * @license BSD-3-Clause
 */
const { createErrorHandler, createErrorContext } = require('../utils/errorUtils');
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
    this.errorHandler = createErrorHandler(core);
    this.logger = new Logger(core, { context: this.constructor.name });
    this.initialized = false;
  }

  /**
   * Hook that runs after execution
   * 
   * @param {any} result - Result from the run method
   * @returns {Promise<void>}
   */
  async afterExecute(result) {
    return;
  }

  /**
   * Hook that runs after initialization
   * 
   * @returns {Promise<void>}
   */
  async afterInitialize() {
    return;
  }

  /**
   * Hook that runs before execution
   * 
   * @returns {Promise<void>}
   */
  async beforeExecute() {
    return;
  }

  /**
   * Hook that runs before initialization
   * 
   * @returns {Promise<void>}
   */
  async beforeInitialize() {
    return;
  }

  /**
   * Executes the action logic
   * 
   * @returns {Promise<any>} - Action result
   */
  async execute() {
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      const timer = this.logger.startTimer('Action execution');
      this.logger.info('Starting action execution');
      await this.beforeExecute();
      const result = await this.run();
      await this.afterExecute(result);
      this.logger.info('Action execution completed', { elapsed: true });
      timer();
      return result;
    } catch (error) {
      this.errorHandler.handle(error, createErrorContext('execute action'));
    }
  }

  /**
   * Helper method to handle errors
   * 
   * @param {Error} error - The error object
   * @param {string} operation - Operation that failed
   * @param {Object} options - Additional error context
   * @returns {string} - Formatted error message
   */
  handleError(error, operation, options = {}) {
    return this.errorHandler.handle(error, createErrorContext(operation, options));
  }

  /**
   * Initializes the action and its dependencies
   * 
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      this.logger.info('Initializing action');
      await this.beforeInitialize();
      this.initialized = true;
      await this.afterInitialize();
      this.logger.info('Action initialized successfully');
    } catch (error) {
      this.errorHandler.handle(error, createErrorContext('initialize action'));
    }
  }

  /**
   * Main action implementation
   * 
   * @abstract
   * @returns {Promise<any>} - Action result
   */
  async run() {
    throw new Error('Action.run() must be implemented by subclass');
  }
}

module.exports = Action;
