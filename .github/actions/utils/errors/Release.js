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
   * @param {string} operation - The release operation that failed
   * @param {Error} error - The original error
   * @param {Object} [details] - Additional error details
   */
  constructor(operation, error, details) {
    super('Release', operation, error, details);
  }
}

module.exports = ReleaseError;
