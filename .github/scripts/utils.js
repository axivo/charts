/**
 * Utility Functions for GitHub Actions Workflows
 * 
 * This module provides utility functions for GitHub Actions workflows:
 * - Issue creation for warnings
 * - Warning detection and reporting
 * 
 * @module utils
 */

const fs = require('fs/promises');
const Handlebars = require('handlebars');

/**
 * Configuration constants for Utility Functions module
 * Contains settings for GitHub issues, API interactions and other customizable parameters
 */
const CONFIG = {
  issue: {
    labels: ['bug', 'workflow'],
    template: '.github/pages/issue.md.hbs',
    title: 'workflow: Warnings Detected'
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

/**
 * Reports warnings detected during workflow execution by creating a GitHub issue
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client
 * @param {Object} params.context - GitHub Actions context for repository info
 * @param {Object} params.core - GitHub Actions Core API for logging
 * @returns {Promise<void>}
 */
async function reportWorkflowWarnings({
  github,
  context,
  core
}) {
  try {
    core.info('Reporting workflow warnings...');
    const repoUrl = context.payload.repository.html_url;
    const isPullRequest = Boolean(context.payload.pull_request);
    const branchName = isPullRequest
      ? context.payload.pull_request.head.ref
      : context.payload.repository.default_branch;
    const commitSha = isPullRequest
      ? context.payload.pull_request.head.sha
      : context.payload.after;
    const templateContent = await fs.readFile(CONFIG.issue.template, 'utf8');
    const handlebars = registerHandlebarsHelpers(repoUrl);
    const template = handlebars.compile(templateContent);
    const issueBody = template({
      Workflow: context.workflow,
      RunID: context.runId,
      Sha: commitSha,
      Branch: branchName,
      RepoURL: repoUrl
    });
    await github.rest.issues.create({
      owner: context.repo.owner,
      repo: context.repo.repo,
      title: CONFIG.issue.title,
      body: issueBody,
      labels: CONFIG.issue.labels
    });
    core.info('Successfully reported workflow warnings');
  } catch (error) {
    handleError(error, core, 'report workflow warnings', false);
  }
}

module.exports = {
  fileExists,
  handleError,
  registerHandlebarsHelpers,
  reportWorkflowWarnings
};
