/**
 * Template-specific error class
 * 
 * @class TemplateError
 * @module utils/errors/Template
 * @author AXIVO
 * @license BSD-3-Clause
 */
const AppError = require('./App');

class TemplateError extends AppError {
  /**
   * Creates a new TemplateError instance
   * 
   * @param {string} operation - Template operation that failed
   * @param {Error} originalError - Original error that was caught
   */
  constructor(operation, originalError) {
    super({
      message: `Template operation failed: ${operation}`,
      operation,
      originalError
    });
    this.name = 'TemplateError';
  }
}

module.exports = TemplateError;
