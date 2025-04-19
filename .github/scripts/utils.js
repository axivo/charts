/**
 * Common Utility Functions for GitHub Actions Workflows
 * 
 * This module provides a suite of utility functions for GitHub Actions workflows
 * used across different scripts in the repository. It includes functions for
 * error handling, file operations, issue creation, and templating using Handlebars.
 * 
 * These utilities provide consistent behavior for error management, repository
 * operations, and user feedback through issues and GitHub API interactions.
 * 
 * @module utils
 * @author AXIVO
 * @license BSD-3-Clause
 */

const fs = require('fs/promises');
const path = require('path');
const Handlebars = require('handlebars');
const config = require('./config');

/**
 * Adds a label to a repository if it doesn't exist
 * 
 * This function checks if a label exists in the repository and creates it if it doesn't.
 * It uses the GitHub API to manage labels with their colors and descriptions, making
 * it useful for ensuring that required labels are available for issues and PRs.
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
  if (!labelName) handleError(new Error('Label name is required'), core, 'add label', false);
  const labelConfig = config('issue').labels[labelName] || {};
  const labelColor = color || labelConfig.color || 'ededed';
  const labelDescription = description || labelConfig.description || '';
  try {
    core.info(`Checking if '${labelName}' label exists...`);
    await github.rest.issues.getLabel({
      owner: context.repo.owner,
      repo: context.repo.repo,
      name: labelName
    });
    core.info(`Label '${labelName}' already exists`);
    return false;
  } catch (error) {
    if (error.status === 404) {
      core.info(`Creating '${labelName}' label...`);
      await github.rest.issues.createLabel({
        owner: context.repo.owner,
        repo: context.repo.repo,
        name: labelName,
        color: labelColor,
        description: labelDescription
      });
      core.info(`Successfully created '${labelName}' label`);
      return true;
    }
    handleError(error, core, `check or create '${labelName}' label`, false);
    return false;
  }
}

/**
 * Checks if a file exists in the filesystem
 * 
 * This function provides a simple promise-based way to check if a file exists
 * without throwing exceptions. It's useful for conditional logic that depends
 * on file existence before attempting operations on the file.
 * 
 * @param {string} filePath - Path to the file to check
 * @returns {Promise<boolean>} - True if file exists, false otherwise
 */
async function fileExists(filePath) {
  return fs.access(filePath).then(() => true).catch(() => false);
}

/**
 * Finds deployed charts in application and library paths
 * 
 * This function scans the application and library directories to find all valid
 * Helm charts. It identifies charts by checking for the presence of a Chart.yaml file
 * within each subdirectory and categorizes them by chart type (application/library).
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.core - GitHub Actions Core API for logging
 * @param {string} params.appDir - Path to application charts directory
 * @param {string} params.libDir - Path to library charts directory
 * @returns {Promise<{application: string[], library: string[]}>} - Object containing arrays of chart directories by type
 */
async function findCharts({
  core,
  appDir,
  libDir
}) {
  core.info('Finding chart directories...');
  const charts = {
    application: [],
    library: []
  };
  const paths = [
    { dir: appDir, type: 'application' },
    { dir: libDir, type: 'library' }
  ];
  await Promise.all(paths.map(async ({ dir, type }) => {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const chartDir = path.join(dir, entry.name);
          const chartYamlPath = path.join(chartDir, 'Chart.yaml');
          if (await fileExists(chartYamlPath)) {
            charts[type].push(chartDir);
          }
        }
      }
    } catch (error) {
      handleError(error, core, `read directory ${dir}`, false);
    }
  }));
  core.info(`Found ${charts.application.length} application charts and ${charts.library.length} library charts`);
  return charts;
}

/**
 * Handles errors in a standardized way across workflows
 * 
 * This function provides a centralized error handling mechanism that can be configured
 * for different levels of severity. For fatal errors, it logs the error and throws
 * a new exception to terminate execution. For non-fatal errors, it logs a warning
 * and allows execution to continue.
 * 
 * @param {Error} error - The error that occurred
 * @param {Object} core - GitHub Actions Core API for logging
 * @param {string} operation - The operation that failed (for context in the error message)
 * @param {boolean} [fatal=true] - Whether to treat the error as fatal (throw exception)
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
 * Registers common Handlebars helpers for templates
 * 
 * This function sets up commonly used Handlebars helper functions to be used in
 * templates throughout the repository. It provides utilities like equality comparison
 * and URL transformation helpers that simplify template creation and maintenance.
 * 
 * @param {string} repoUrl - Repository URL for use in URL transformation helpers
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
 * This function automatically detects problems in a GitHub Actions workflow run
 * and creates a detailed issue in the repository to track these problems. It uses
 * a template to format the issue and applies appropriate labels for categorization.
 * 
 * The function first checks if the workflow run has any warnings or errors before
 * creating an issue, to avoid unnecessary issue creation for successful runs.
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
  const api = require('./github-api');
  let hasIssues = await api.checkWorkflowRunStatus({
    github,
    context,
    core,
    runId: context.runId
  });
  if (config('issue').createLabels && context.workflow === 'Chart') {
    hasIssues = true;
    core.warning('Set "createLabels: false" in config.js after initial setup, to optimize workflow performance.');
  }
  if (!hasIssues) {
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
    const templateContent = await fs.readFile(config('issue').template.bug, 'utf8');
    const handlebars = registerHandlebarsHelpers(repoUrl);
    const template = handlebars.compile(templateContent);
    const issueBody = template({
      Workflow: context.workflow,
      RunID: context.runId,
      Sha: commitSha,
      Branch: branchName,
      RepoURL: repoUrl
    });
    const labelNames = ['bug', 'triage', 'workflow'];
    if (config('issue').createLabels) {
      const results = await Promise.all(labelNames.map(async label => {
        return await addLabel({ github, context, core, labelName: label });
      }));
      const labelsCreated = results.some(Boolean);
      if (!labelsCreated && context.workflow === 'Chart') {
        core.warning('Labels already exist, setting `createLabels: false` will optimize workflow performance.');
      }
    }
    await github.rest.issues.create({
      owner: context.repo.owner,
      repo: context.repo.repo,
      title: config('issue').title,
      body: issueBody,
      labels: labelNames
    });
    core.info('Successfully created workflow issue');
  } catch (error) {
    handleError(error, core, 'create workflow issue', false);
  }
}

/**
 * Updates repository issue labels based on configuration
 * 
 * This function ensures all labels defined in the configuration exist in the repository
 * when issue.createLabels is enabled. It iterates through the labels configuration
 * and creates any missing labels with their specified colors and descriptions.
 * When createLabels is disabled, this operation is skipped.
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client
 * @param {Object} params.context - GitHub Actions context
 * @param {Object} params.core - GitHub Actions Core API for logging
 * @returns {Promise<string[]>} - Array of label names that were created or empty array if skipped
 */
async function updateIssueLabels({
  github,
  context,
  core
}) {
  try {
    if (!config('issue').createLabels) {
      core.info('Label creation is disabled in configuration, skipping label updates');
      return [];
    }
    core.info('Updating repository issue labels...');
    const createdLabels = [];
    const labelsConfig = config('issue').labels;
    for (const labelName in labelsConfig) {
      const result = await addLabel({ github, context, core, labelName });
      if (result) createdLabels.push(labelName);
    }
    if (createdLabels.length > 0) {
      core.info(`Successfully created ${createdLabels.length} issue labels`);
    }
    return createdLabels;
  } catch (error) {
    handleError(error, core, 'update issue labels', false);
  }
}

/**
 * Exports the module's functions
 */
module.exports = {
  addLabel,
  fileExists,
  findCharts,
  handleError,
  registerHandlebarsHelpers,
  reportWorkflowIssue,
  updateIssueLabels
};
