/**
 * Release error class
 *
 * @class ReleaseError
 * @module utils/errors/Release
 * @author AXIVO
 * @license BSD-3-Clause
 */
const AppError = require('./App');

class ReleaseError extends AppError {
  /**
   * Creates a new ReleaseError instance
   *
   * @param {string} operation - Release operation that failed
   * @param {Error} originalError - Original error that was caught
   * @param {Object} details - Additional error details
   */
  constructor(operation, originalError, details = {}) {
    super({
      message: `Release operation failed: ${operation}`,
      operation,
      originalError
    });
    this.name = 'ReleaseError';
    this.details = details;
  }
}

module.exports = ReleaseError;
