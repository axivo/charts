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
    labels: {
      bug: {
        color: 'd73a4a',
        description: "Something isn't working"
      },
      workflow: {
        color: 'b60205',
        description: 'Workflow execution related issue'
      }
    },
    template: '.github/templates/issue.md.hbs',
    title: 'workflow: Issues Detected'
  }
}

/**
 * Adds a label to a repository if it doesn't exist
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client
 * @param {Object} params.context - GitHub Actions context for repository info
 * @param {Object} params.core - GitHub Actions Core API for logging
 * @param {string} params.labelName - Name of the label to add
 * @param {string} [params.color] - Color of the label in hex format (with or without # prefix)
 * @param {string} [params.description] - Description of the label
 * @returns {Promise<boolean>} - True if label was created, false if it already existed
 */
async function addLabel({
  github,
  context,
  core,
  labelName,
  color,
  description
}) {
  if (!labelName) handleError(new Error('Label name is required'), core, 'add label');
  const labelConfig = CONFIG.issue.labels[labelName] || {};
  const labelColor = color || labelConfig.color || 'ededed';
  const labelDescription = description || labelConfig.description || '';
  try {
    core.info(`Checking if label '${labelName}' exists...`);
    await github.rest.issues.getLabel({
      owner: context.repo.owner,
      repo: context.repo.repo,
      name: labelName
    });
    core.info(`Label '${labelName}' already exists`);
    return false;
  } catch (error) {
    if (error.status === 404) {
      core.info(`Creating label '${labelName}'...`);
      await github.rest.issues.createLabel({
        owner: context.repo.owner,
        repo: context.repo.repo,
        name: labelName,
        color: labelColor,
        description: labelDescription
      });
      core.info(`Successfully created label '${labelName}'`);
      return true;
    }
    handleError(error, core, `check or create label '${labelName}'`, false);
    return false;
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
 * Reports workflow issues by creating a GitHub issue
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client
 * @param {Object} params.context - GitHub Actions context for repository info
 * @param {Object} params.core - GitHub Actions Core API for logging
 * @returns {Promise<void>}
 */
async function reportWorkflowIssue({
  github,
  context,
  core
}) {
  let hasWarnings = false;
  try {
    const { data: logs } = await github.rest.actions.downloadWorkflowRunLogs({
      owner: context.repo.owner,
      repo: context.repo.repo,
      run_id: context.runId
    });
    hasWarnings = ['##[error]', '##[warning]'].some(marker => logs.includes(marker));
  } catch (logError) {
    hasWarnings = true;
  }
  if (!hasWarnings) {
    core.info('No failures or warnings detected, skipping issue creation');
    return;
  }
  try {
    core.info('Creating workflow issue...');
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
    const labelNames = Object.keys(CONFIG.issue.labels);
    await Promise.all(labelNames.map(label =>
      addLabel({ github, context, core, labelName: label })
    ));
    await github.rest.issues.create({
      owner: context.repo.owner,
      repo: context.repo.repo,
      title: CONFIG.issue.title,
      body: issueBody,
      labels: labelNames
    });
    core.info('Successfully created workflow issue');
  } catch (error) {
    handleError(error, core, 'create workflow issue', false);
  }
}

module.exports = {
  addLabel,
  fileExists,
  handleError,
  reportWorkflowIssue,
  registerHandlebarsHelpers
};
