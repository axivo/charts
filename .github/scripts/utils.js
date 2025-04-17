/**
 * Utility Functions for GitHub Actions Workflows
 * 
 * This module provides utility functions for GitHub Actions workflows:
 * - Status check creation
 * - Warning detection and reporting
 * 
 * @module utils
 */

const fs = require('fs/promises');
const Handlebars = require('handlebars');

/**
 * Configuration constants for Utility Functions module
 * Contains settings for GitHub status checks, API interactions and other customizable parameters
 */
const CONFIG = {
  commit: {
    context: 'workflow-warnings'
  }
}

/**
 * Creates a status check for warnings detected during workflow execution
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client
 * @param {Object} params.context - GitHub Actions context for repository info
 * @param {Object} params.core - GitHub Actions Core API for logging
 * @returns {Promise<void>}
 */
async function createWarningStatusCheck({
  github,
  context,
  core
}) {
  try {
    core.info('Creating warning status check...');
    const ref = context.payload.after || context.sha;
    await github.rest.repos.createCommitStatus({
      owner: context.repo.owner,
      repo: context.repo.repo,
      sha: ref,
      state: 'success',
      description: 'Warnings detected in workflow execution',
      context: CONFIG.commit.context
    });
    core.info('Successfully created warning status check');
  } catch (error) {
    handleError(error, core, 'create warning status check', false);
  }
}

/**
 * Checks if a file exists
 * 
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>} - True if file exists, false otherwise
 */
async function fileExists(filePath) {
  return fs.access(filePath).then(() => true).catch(() => false);
}

/**
 * Handles errors in a standardized way
 * 
 * @param {Error} error - The error that occurred
 * @param {Object} core - GitHub Actions Core API for logging
 * @param {string} operation - The operation that failed
 * @param {boolean} [fatal=true] - Whether to treat the error as fatal
 * @returns {string} - The formatted error message
 */
function handleError(error, core, operation, fatal = true) {
  const errorMsg = `Failed to ${operation}: ${error.message}`;
  if (fatal) {
    core.setFailed(errorMsg);
    throw new Error(errorMsg);
  } else {
    core.warning(errorMsg);
  }
  return errorMsg;
}

/**
 * Registers common Handlebars helpers
 * 
 * @param {string} repoUrl - Repository URL
 * @returns {Object} - Handlebars instance with registered helpers
 */
function registerHandlebarsHelpers(repoUrl) {
  Handlebars.registerHelper('eq', function (a, b) {
    return a === b;
  });
  Handlebars.registerHelper('RepoRawURL', function () {
    return String(repoUrl).replace('github.com', 'raw.githubusercontent.com');
  });
  return Handlebars;
}

module.exports = {
  createWarningStatusCheck,
  fileExists,
  handleError,
  registerHandlebarsHelpers
};
