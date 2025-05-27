/**
 * Error handling utilities
 * 
 * This module provides error handling functionality including the ErrorHandler class
 * and utility functions for common error handling scenarios.
 * 
 * @module utils/error
 * @author AXIVO
 * @license BSD-3-Clause
 */
const ErrorHandler = require('./Handler');

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

/**
 * Creates a configured ErrorHandler instance
 * 
 * @param {Object} core - GitHub Actions Core API
 * @returns {ErrorHandler} - Configured ErrorHandler instance
 */
function createErrorHandler(core) {
  return new ErrorHandler(core);
}

module.exports = {
  createErrorContext,
  createErrorHandler
};
