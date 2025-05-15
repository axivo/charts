/**
 * Utility modules export
 * 
 * This module provides a central export point for all utility classes
 * and functions.
 * 
 * @module utils
 * @author AXIVO
 * @license BSD-3-Clause
 */
const ErrorHandler = require('./ErrorHandler');
const errors = require('./errors');
const errorUtils = require('./errorUtils');

module.exports = {
  ErrorHandler,
  errors,
  errorUtils
};
