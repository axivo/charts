/**
 * Base GitHub API service
 * 
 * @class Api
 * @module services/github/Api
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Action = require('../../core/Action');
const { GitHubApiError } = require('../../utils/errors');

class Api extends Action {
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
