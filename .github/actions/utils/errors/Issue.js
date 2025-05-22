/**
 * Issue-specific error class
 * 
 * @class IssueError
 * @module utils/errors/Issue
 * @author AXIVO
 * @license BSD-3-Clause
 */
const AppError = require('./App');

class IssueError extends AppError {
  /**
   * Creates a new IssueError instance
   * 
   * @param {string} operation - Issue operation that failed
   * @param {Error} originalError - Original error that was caught
   * @param {Object} details - Additional error details
   */
  constructor(operation, originalError, details = {}) {
    super({
      message: `Issue operation failed: ${operation}`,
      operation,
      originalError
    });
    this.name = 'IssueError';
    this.details = details;
  }
}

module.exports = IssueError;
