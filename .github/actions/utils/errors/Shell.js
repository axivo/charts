/**
 * Shell operation error class
 * 
 * @class ShellError
 * @module utils/errors/Shell
 * @author AXIVO
 * @license BSD-3-Clause
 */
const AppError = require('./App');

class ShellError extends AppError {
  /**
   * Creates a new ShellError instance
   * 
   * @param {string} operation - Shell operation that failed
   * @param {Error} originalError - Original error that was caught
   */
  constructor(operation, originalError) {
    super({
      message: `Shell operation failed: ${operation}`,
      operation,
      originalError
    });
    this.name = 'ShellError';
  }
}

module.exports = ShellError;
