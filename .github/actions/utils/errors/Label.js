/**
 * Label-specific error class
 * 
 * @class LabelError
 * @module utils/errors/Label
 * @author AXIVO
 * @license BSD-3-Clause
 */
const AppError = require('./App');

class LabelError extends AppError {
  /**
   * Creates a new LabelError instance
   * 
   * @param {string} operation - Label operation that failed
   * @param {Error} originalError - Original error that was caught
   * @param {Object} details - Additional error details
   */
  constructor(operation, originalError, details = {}) {
    super({
      message: `Label operation failed: ${operation}`,
      operation,
      originalError
    });
    this.name = 'LabelError';
    this.details = details;
  }
}

module.exports = LabelError;
