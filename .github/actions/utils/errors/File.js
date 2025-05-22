/**
 * File-specific error class
 * 
 * @class FileError
 * @module utils/errors/File
 * @author AXIVO
 * @license BSD-3-Clause
 */
const AppError = require('./App');

class FileError extends AppError {
  /**
   * Creates a new FileError instance
   * 
   * @param {string} operation - File operation that failed
   * @param {Error} originalError - Original error that was caught
   * @param {string} [filePath] - Path to the file involved in the operation
   */
  constructor(operation, originalError, filePath) {
    super({
      message: `File operation failed: ${operation}${filePath ? ` (${filePath})` : ''}`,
      operation,
      originalError
    });
    this.name = 'FileError';
    this.filePath = filePath;
  }
}

module.exports = FileError;
