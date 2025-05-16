/**
 * Helm-specific error class
 * 
 * @class HelmError
 * @module utils/errors/Helm
 * @author AXIVO
 * @license BSD-3-Clause
 */
const AppError = require('./App');

class HelmError extends AppError {
  /**
   * Creates a new HelmError instance
   * 
   * @param {string} operation - Helm operation that failed
   * @param {Error} originalError - Original error that was caught
   */
  constructor(operation, originalError) {
    super({
      message: `Helm operation failed: ${operation}`,
      operation,
      originalError
    });
    this.name = 'HelmError';
  }
}

module.exports = HelmError;