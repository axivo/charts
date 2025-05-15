/**
 * Git-specific error class
 * 
 * @class GitError
 * @module utils/errors/Git
 * @author AXIVO
 * @license BSD-3-Clause
 */
const AppError = require('./App');

class GitError extends AppError {
  /**
   * Creates a new GitError instance
   * 
   * @param {string} operation - Git operation that failed
   * @param {Error} originalError - Original error that was caught
   */
  constructor(operation, originalError) {
    super({
      message: `Git operation failed: ${operation}`,
      operation,
      originalError
    });
    this.name = 'GitError';
  }
}

module.exports = GitError;
