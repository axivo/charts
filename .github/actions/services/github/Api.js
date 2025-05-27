/**
 * Base GitHub API service
 * 
 * @class Api
 * @module services/github/Api
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Action = require('../../core/Action');

class Api extends Action {
  /**
   * Executes a GitHub API operation with error handling
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
      this.errorHandler.handle(error, { operation, fatal });
      return null;
    }
  }

  /**
   * Formats a repository path from owner and repo
   * 
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @returns {string} - Formatted repository path (owner/repo)
   */
  getPath(owner, repo) {
    return `${owner}/${repo}`;
  }

  /**
   * Sets standard variables with common repository parameters
   * 
   * @param {Object} params - Function parameters
   * @param {string} params.owner - Repository owner
   * @param {string} params.repo - Repository name
   * @param {Object} additionalVars - Additional variables to include
   * @returns {Object} - Variables object with common parameters
   */
  setVariables({ owner, repo }, additionalVars = {}) {
    return {
      owner,
      repo,
      ...additionalVars
    };
  }

  /**
   * Transforms raw data using the provided transformer function
   * 
   * @param {Array<Object>} data - Raw data to transform
   * @param {Function} transformer - Function to transform each item
   * @returns {Array<Object>} - Transformed data
   */
  transform(data, transformer) {
    return data.map(transformer);
  }
}

module.exports = Api;
