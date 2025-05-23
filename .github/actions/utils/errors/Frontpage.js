/**
 * Frontpage-specific error class
 * 
 * @class FrontpageError
 * @module utils/errors/Frontpage
 * @author AXIVO
 * @license BSD-3-Clause
 */
const AppError = require('./App');

class FrontpageError extends AppError {
  /**
   * Creates a new FrontpageError instance
   * 
   * @param {string} operation - Frontpage operation that failed
   * @param {Error} originalError - Original error that was caught
   * @param {Object} [details] - Additional error details
   */
  constructor(operation, originalError, details) {
    super({
      message: `Frontpage operation failed: ${operation}`,
      operation,
      originalError
    });
    this.name = 'FrontpageError';
    this.details = details;
  }
}

module.exports = FrontpageError;
