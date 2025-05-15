/**
 * Base application error class
 * 
 * @class AppError
 * @module utils/errors/AppError
 * @author AXIVO
 * @license BSD-3-Clause
 */
class AppError extends Error {
  /**
   * Creates a new AppError instance
   * 
   * @param {Object} info - Error information
   * @param {string} info.message - Error message
   * @param {string} info.operation - Operation that failed
   * @param {Error} info.originalError - Original error that was caught
   * @param {string} info.timestamp - Timestamp when error occurred
   */
  constructor(info) {
    super(info.message);
    this.name = 'AppError';
    this.operation = info.operation;
    this.originalError = info.originalError;
    this.timestamp = info.timestamp || new Date().toISOString();
  }
}

module.exports = AppError;
