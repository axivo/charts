/**
 * Error classes exports
 * 
 * @module utils/errors
 * @author AXIVO
 * @license BSD-3-Clause
 */
const AppError = require('./App');
const GitError = require('./Git');
const GitHubApiError = require('./GitHubApi');

module.exports = {
  AppError,
  GitError,
  GitHubApiError
};
