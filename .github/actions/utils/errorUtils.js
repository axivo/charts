/**
 * Utility functions for error handling
 * 
 * This module provides helper functions for common error handling scenarios.
 * 
 * @module utils/errorUtils
 * @author AXIVO
 * @license BSD-3-Clause
 */
const ErrorHandler = require('./ErrorHandler');

/**
 * Creates a configured ErrorHandler instance
 * 
 * @param {Object} core - GitHub Actions Core API
 * @returns {ErrorHandler} - Configured ErrorHandler instance
 */
function createErrorHandler(core) {
  return new ErrorHandler(core);
}

/**
 * Creates an error context object
 * 
 * @param {string} operation - Operation that failed
 * @param {Object} options - Additional context options
 * @returns {Object} - Error context object
 */
function createErrorContext(operation, options = {}) {
  return {
    operation,
    ...options
  };
}

module.exports = {
  createErrorHandler,
  createErrorContext
};
