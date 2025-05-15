/**
 * GitHub API-specific error class
 * 
 * @class GitHubApiError
 * @module utils/errors/GitHubApi
 * @author AXIVO
 * @license BSD-3-Clause
 */
const AppError = require('./App');

class GitHubApiError extends AppError {
  /**
   * Creates a new GitHubApiError instance
   * 
   * @param {string} operation - GitHub API operation that failed
   * @param {Error} originalError - Original error that was caught
   * @param {number} statusCode - HTTP status code (if applicable)
   */
  constructor(operation, originalError, statusCode) {
    super({
      message: `GitHub API failed: ${operation}`,
      operation,
      originalError
    });
    this.name = 'GitHubApiError';
    this.statusCode = statusCode;
  }
}

module.exports = GitHubApiError;
