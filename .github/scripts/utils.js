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
 * It first attempts to retrieve the label using the GitHub API, and if a 404 error is
 * returned, it creates the label with the specified color and description. The function
 * uses label configurations from the central config module when explicit values aren't provided.
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {string} params.labelName - Name of the label to add or check for
 * @param {string} [params.color] - Optional color of the label in hex format (without # prefix)
 * @param {string} [params.description] - Optional description of the label
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
 * Configures Git repository for GitHub Actions workflows
 * 
 * This function sets up the Git repository with the GitHub Actions bot identity for making commits
 * in workflows. It configures the user name and email to match the GitHub Actions bot,
 * ensuring that commits made by automated workflows are properly attributed and appear as verified
 * in GitHub's interface.
 * 
 * The function returns a utility function for executing Git commands that standardizes
 * output formatting, trims whitespace, and provides consistent error handling for Git operations
 * throughout the workflow.
 * 
 * Note: This function is in utils.js instead of github-api.js because it operates on the local
 * Git repository configuration, which cannot be accessed or modified through GitHub's GraphQL or
 * REST APIs. These operations must be performed using Git CLI commands on the local repository.
 * 
 * @param {Object} options - Function parameters
 * @param {Object} options.core - GitHub Actions Core API for logging and output
 * @param {Object} options.exec - GitHub Actions exec helpers for running commands
 * @returns {Promise<Function>} - Async function to run Git commands that returns trimmed stdout
 */
async function configureGitRepository({
  core,
  exec
}) {
  const runGit = async (args) => (await exec.getExecOutput('git', args)).stdout.trim();
  try {
    core.info('Configuring Git repository...');
    await Promise.all([
      runGit(['config', 'user.email', config('repository').user.email]),
      runGit(['config', 'user.name', config('repository').user.name])
    ]);
    core.info('Git repository configured with GitHub Actions bot identity');
    return runGit;
  } catch (error) {
    handleError(error, core, 'configure Git repository');
  }
}

/**
 * Checks if a file exists in the filesystem
 * 
 * This function provides a simple promise-based way to check if a file exists
 * without throwing exceptions. It uses fs.access() under the hood, but catches
 * any errors and returns false instead of propagating the exception. This makes
 * it ideal for conditional logic that depends on file existence before attempting
 * operations on the file.
 * 
 * @param {string} filePath - Path to the file to check for existence
 * @returns {Promise<boolean>} - True if file exists and is accessible, false otherwise
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
 * When a files array is provided, the function filters the results to only include charts
 * that have files within their directories, which is useful for detecting which charts
 * have been modified in a pull request or push event.
 * 
 * The function handles directory access errors gracefully, logging warnings but continuing
 * execution to find as many valid charts as possible.
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {string} params.appDir - Path to application charts directory
 * @param {string} params.libDir - Path to library charts directory
 * @param {string[]} [params.files=[]] - Optional array of file paths to filter charts by
 * @returns {Promise<{application: string[], library: string[]}>} - Object containing arrays of chart directories by type
 */
async function findCharts({
  core,
  appDir,
  libDir,
  files = []
}) {
  const word = files.length > 0 ? 'updated' : 'available';
  core.info(`Finding ${word} charts...`);
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
      const directoryEntries = entries.filter(entry => entry.isDirectory());
      const results = await Promise.all(
        directoryEntries.map(async entry => {
          const chartDir = path.join(dir, entry.name);
          const chartYamlPath = path.join(chartDir, 'Chart.yaml');
          const chartUpdatedFiles = files.some(file => file.startsWith(chartDir));
          if (await fileExists(chartYamlPath) && (!files.length || chartUpdatedFiles)) {
            return chartDir;
          }
          return null;
        })
      );
      charts[type] = [...charts[type], ...results.filter(Boolean)];
    } catch (error) {
      handleError(error, core, `read directory ${dir}`, false);
    }
  }));
  core.info(`Found ${charts.application.length} 'application' and ${charts.library.length} 'library' charts`);
  return charts;
}

/**
 * Handles errors in a standardized way across workflows
 * 
 * This function provides a centralized error handling mechanism that can be configured
 * for different levels of severity. For fatal errors, it logs the error using core.setFailed,
 * then throws a new exception to terminate execution. For non-fatal errors, it logs a warning
 * using core.warning and allows execution to continue.
 * 
 * The standardized error message format includes the operation context to make debugging
 * easier by providing clear information about what specific action failed.
 * 
 * @param {Error} error - The error object that was caught
 * @param {Object} core - GitHub Actions Core API for logging and output
 * @param {string} operation - The operation that failed (for context in the error message)
 * @param {boolean} [fatal=true] - Whether to treat the error as fatal (throw exception) or non-fatal (warning)
 * @returns {string} - The formatted error message that was logged
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
 * Helper function to prepare file additions and deletions from Git staged changes
 * 
 * This function processes Git staged changes and prepares them in the format required
 * by the GitHub API for creating commits. It identifies added, modified, and deleted files,
 * reads the content of changed files, encodes them in base64, and organizes both additions
 * and deletions into the specific structure expected by the GitHub GraphQL API.
 * 
 * The function uses different Git diff filters to separately identify:
 * - Additions/modifications (--diff-filter=ACMR): files that need content uploaded
 * - Deletions (--diff-filter=D): files that need to be removed from the repository
 * 
 * Note: This function is in utils.js instead of github-api.js because it operates on local
 * Git repositories and requires file system access to read staged but uncommitted changes.
 * These operations cannot be performed through GitHub's GraphQL or REST APIs, which only
 * have access to committed content that has been pushed to the remote repository.
 * 
 * @param {Function} runGit - Function to run git commands and return trimmed stdout
 * @returns {Promise<Object>} - Object with additions and deletions arrays in GitHub API format
 */
async function getGitStagedChanges(runGit) {
  const additions = await Promise.all(
    (await runGit(['diff', '--name-only', '--staged', '--diff-filter=ACMR']))
      .split('\n')
      .filter(Boolean)
      .map(async file => {
        const contents = await fs.readFile(file, 'utf-8');
        return { path: file, contents: Buffer.from(contents).toString('base64') };
      })
  );
  const deletions = (await runGit(['diff', '--name-only', '--staged', '--diff-filter=D']))
    .split('\n')
    .filter(Boolean)
    .map(file => ({ path: file }));
  return { additions, deletions };
}

/**
 * Registers common Handlebars helpers for templates
 * 
 * This function sets up commonly used Handlebars helper functions that are used across
 * different templates in the repository. It provides utility functions like equality
 * comparison and URL transformations that make template creation more maintainable
 * and consistent.
 * 
 * Current helpers include:
 * - eq: Compares two values for equality (useful in conditional blocks)
 * - RepoRawURL: Transforms GitHub repository URLs to raw content URLs
 * 
 * @param {string} repoUrl - Repository URL used for URL transformation helpers
 * @returns {Object} - Configured Handlebars instance with registered helpers
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
 * and creates a detailed issue in the repository to track these problems. It first
 * checks if the workflow had any failures or warnings using the checkWorkflowRunStatus
 * function, then generates an issue with detailed context about the workflow run.
 * 
 * The issue includes:
 * - Information about the workflow and run ID
 * - Branch and commit SHA
 * - Links to the repository and workflow
 * - Standardized labels for categorization
 * 
 * The function also has special handling for the initial setup workflow when label
 * creation is enabled.
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing workflow information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
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
    const templateContent = await fs.readFile(config('workflow').template, 'utf8');
    const handlebars = registerHandlebarsHelpers(repoUrl);
    const template = handlebars.compile(templateContent);
    const issueBody = template({
      Workflow: context.workflow,
      RunID: context.runId,
      Sha: commitSha,
      Branch: branchName,
      RepoURL: repoUrl
    });
    const labelNames = config('workflow').labels;
    if (config('issue').createLabels) {
      const results = await Promise.all(labelNames.map(async label => {
        return await addLabel({ github, context, core, labelName: label });
      }));
    }
    await github.rest.issues.create({
      owner: context.repo.owner,
      repo: context.repo.repo,
      title: config('workflow').title,
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
 * This function ensures all required labels defined in the configuration exist in the repository
 * when issue.createLabels is enabled. It iterates through the labels section of the
 * configuration and creates any missing labels with their specified colors and descriptions.
 * 
 * The function is conditional on the createLabels flag in the configuration, allowing
 * the repository to control whether automatic label creation is enabled or disabled.
 * This is particularly useful after initial repository setup, as automatic label
 * creation can generate a large number of notifications.
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @returns {Promise<string[]>} - Array of label names that were created, or empty array if skipped
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
    const labelNames = Object.keys(config('issue').labels);
    const results = await Promise.all(
      labelNames.map(async labelName => {
        const created = await addLabel({ github, context, core, labelName });
        return created ? labelName : null;
      })
    );
    const createdLabels = results.filter(Boolean);
    if (createdLabels.length > 0) {
      core.info(`Successfully updated ${createdLabels.length} issue labels`);
    }
    return createdLabels;
  } catch (error) {
    handleError(error, core, 'update repository issue labels', false);
  }
}

/**
 * Exports the module's functions
 */
module.exports = {
  addLabel,
  configureGitRepository,
  fileExists,
  findCharts,
  getGitStagedChanges,
  handleError,
  registerHandlebarsHelpers,
  reportWorkflowIssue,
  updateIssueLabels
};
