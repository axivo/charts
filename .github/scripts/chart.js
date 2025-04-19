/**
 * Chart Maintenance and Update Utilities
 * 
 * This module provides functions for Helm chart management and repository maintenance:
 * - Issue template updates with current chart options
 * - Repository maintenance and dependency updates
 * - Chart lock file management
 * - Application file targetRevision updates
 * 
 * The module is designed to be used within GitHub Actions workflows and provides
 * automated maintenance for chart-related repository files.
 * 
 * @module chart
 * @author AXIVO
 * @license BSD-3-Clause
 */

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const yaml = require('js-yaml');
const config = require('./config');
const commit = require('./git-signed-commit');
const utils = require('./utils');

/**
 * Performs a Git commit for the specified files
 * 
 * This function handles the process of committing a group of changed files to the
 * repository. It fetches the latest changes from the head branch, stages the
 * specified files, and creates a signed commit using the GitHub API.
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client
 * @param {Object} params.context - GitHub Actions context
 * @param {Object} params.core - GitHub Actions Core API for logging
 * @param {Object} params.exec - GitHub Actions exec helpers
 * @param {Array<string>} params.files - Array of files to commit
 * @param {string} params.fileType - Type of files being committed (for log messages)
 * @returns {Promise<void>}
 */
async function _performCommit({
  github,
  context,
  core,
  exec,
  files,
  fileType
}) {
  try {
    const runGit = async (args) => (await exec.getExecOutput('git', args)).stdout.trim();
    const headRef = process.env.GITHUB_HEAD_REF;
    core.info(`Getting the latest changes for ${headRef} branch...`);
    await runGit(['fetch', 'origin', headRef]);
    await runGit(['switch', headRef]);
    await runGit(['pull', 'origin', headRef]);
    core.info(`Committing ${files.length} ${fileType}...`);
    await runGit(['add', ...files]);
    const { additions, deletions } = await commit.getGitStagedChanges(runGit);
    if (additions.length + deletions.length > 0) {
      const currentHead = await runGit(['rev-parse', 'HEAD']);
      await commit.createSignedCommit({
        github, context, core,
        branchName: headRef,
        expectedHeadOid: currentHead,
        additions, deletions,
        commitMessage: `chore(github-action): update ${fileType}`
      });
      core.info(`Successfully committed ${fileType}`);
    }
  } catch (error) {
    utils.handleError(error, core, `commit ${fileType}`, false);
  }
}

/**
 * Updates application files content with latest chart versions
 * 
 * This function processes all application files in chart directories, updating
 * the targetRevision in application.yaml files to point to the latest chart version.
 * It uses the chart metadata to determine the correct version and commits the changes.
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client
 * @param {Object} params.context - GitHub Actions context
 * @param {Object} params.core - GitHub Actions Core API for logging
 * @param {Object} params.exec - GitHub Actions exec helpers
 * @param {Object} params.charts - Object containing application and library chart paths
 * @returns {Promise<string[]>} - Array of updated application file paths
 */
async function _updateAppFiles({
  github,
  context,
  core,
  exec,
  charts
}) {
  try {
    core.info('Updating application files with chart versions...');
    const appFiles = [];
    for (const chartDir of charts.application) {
      const chartName = path.basename(chartDir);
      const appYamlPath = path.join(chartDir, 'application.yaml');
      if (!await utils.fileExists(appYamlPath)) continue;
      try {
        const appConfig = yaml.load(await fs.readFile(appYamlPath, 'utf8'));
        if (!appConfig.spec?.source) continue;
        const chartMetadata = yaml.load(await fs.readFile(path.join(chartDir, 'Chart.yaml'), 'utf8'));
        const tagName = config('release').title
          .replace('{{ .Name }}', chartName)
          .replace('{{ .Version }}', chartMetadata.version);
        if (appConfig.spec.source.targetRevision === tagName) continue;
        appConfig.spec.source.targetRevision = tagName;
        await fs.writeFile(appYamlPath, yaml.dump(appConfig, { lineWidth: -1 }), 'utf8');
        core.info(`Updated ${tagName} target revision in ${appYamlPath}`);
        appFiles.push(appYamlPath);
      } catch (error) {
        utils.handleError(error, core, `update application file for ${chartName}`, false);
      }
    }
    if (appFiles.length > 0) {
      core.info(`Successfully updated ${appFiles.length} application files`);
      await _performCommit({ github, context, core, exec, files: appFiles, fileType: 'application files' });
    }
  } catch (error) {
    utils.handleError(error, core, 'update application files', false);
  }
}

/**
 * Updates issue templates with current chart options
 * 
 * This function updates dropdown options in issue templates based on current charts
 * in the repository. It dynamically generates options for the dropdown based on
 * the available application and library charts, and updates the templates accordingly.
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client
 * @param {Object} params.context - GitHub Actions context
 * @param {Object} params.core - GitHub Actions Core API for logging
 * @param {Object} params.exec - GitHub Actions exec helpers
 * @param {Object} params.charts - Object containing application and library chart paths
 * @returns {Promise<string[]>} - Array of updated template file paths
 */
async function _updateIssueTemplates({
  github,
  context,
  core,
  exec,
  charts
}) {
  try {
    core.info('Updating issue templates with chart options...');
    const templateFiles = [];
    const bugTemplatePath = config('issue').template.bug;
    const featureTemplatePath = config('issue').template.feature;
    const templatePaths = [bugTemplatePath, featureTemplatePath];
    const allChartDirs = [...charts.application, ...charts.library];
    if (!allChartDirs.length) {
      core.info('No charts found, skipping issue templates update');
      return templateFiles;
    }
    const appCharts = charts.application;
    const libCharts = charts.library;
    const appChartOptions = appCharts.map(dir => `${path.basename(dir)} (application)`).sort();
    const libChartOptions = libCharts.map(dir => `${path.basename(dir)} (library)`).sort();
    const chartOptions = ['none', ...appChartOptions, ...libChartOptions];
    const indentationRegex = /(\s+)-.+\(.+\)/;
    const optionsRegex = /(id:\s+chart[\s\S]+options:)([\r\n]+\s+)[\s\S]+?(\s+default:\s+0)/;
    for (const templatePath of templatePaths) {
      try {
        let content = await fs.readFile(templatePath, 'utf8');
        if (!content.includes('id: chart')) {
          continue;
        }
        const indentation = content.match(indentationRegex)[1];
        const optionsText = chartOptions.map(option => `${indentation}- ${option}`).join('');
        const replacementText = `$1${optionsText}$3`;
        content = content.replace(optionsRegex, replacementText);
        await fs.writeFile(templatePath, content, 'utf8');
        core.info(`Updated chart options in ${templatePath} issue template`);
        templateFiles.push(templatePath);
      } catch (error) {
        utils.handleError(error, core, `update ${templatePath} issue template`, false);
      }
    }
    if (templateFiles.length > 0) {
      core.info(`Successfully updated issue templates with ${chartOptions.length} chart options`);
      await _performCommit({ github, context, core, exec, files: templateFiles, fileType: 'issue templates' });
    }
  } catch (error) {
    utils.handleError(error, core, 'update issue templates');
  }
}

/**
 * Updates dependency lock files for charts in a pull request
 * 
 * This function runs 'helm dependency update' for all charts in a repository,
 * updating their Chart.lock files to reference the latest versions of dependencies.
 * It compares file hashes to detect changes and commits any updated files.
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client
 * @param {Object} params.context - GitHub Actions context for repository info
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {Object} params.exec - GitHub Actions exec helpers for running commands
 * @param {Object} params.charts - Object containing application and library chart paths
 * @returns {Promise<void>}
 */
async function _updateLockFiles({
  github,
  context,
  core,
  exec,
  charts
}) {
  try {
    core.info('Updating dependency lock files with latest chart versions...');
    const lockFiles = [];
    const chartDirs = [...charts.application, ...charts.library];
    for (const chartDir of chartDirs) {
      const lockFilePath = path.join(chartDir, 'Chart.lock');
      let originalLockHash = null;
      if (await utils.fileExists(lockFilePath)) {
        const originalContent = await fs.readFile(lockFilePath);
        originalLockHash = crypto.createHash('sha256').update(originalContent).digest('hex');
      }
      core.info(`Updating dependency lock file for ${chartDir} chart...`);
      await exec.exec('helm', ['dependency', 'update', chartDir]);
      if (await utils.fileExists(lockFilePath)) {
        const newContent = await fs.readFile(lockFilePath);
        const newHash = crypto.createHash('sha256').update(newContent).digest('hex');
        if (originalLockHash !== newHash) {
          lockFiles.push(lockFilePath);
          core.info(`Successfully updated dependency lock file for ${chartDir} chart`);
        }
      }
    }
    if (lockFiles.length > 0) {
      core.info(`Successfully updated ${lockFiles.length} dependency lock files`);
      await _performCommit({ github, context, core, exec, files: lockFiles, fileType: 'dependency lock files' });
    }
  } catch (error) {
    utils.handleError(error, core, 'update dependency lock files');
  }
}

/**
 * Performs all required repository updates for charts
 * 
 * This function orchestrates multiple chart repository maintenance tasks in sequence:
 * 1. Updates application files with latest chart versions
 * 2. Updates dependency lock files for all charts
 * 3. Updates issue templates with current chart options
 * 
 * It centralizes chart directory discovery and handles all error conditions,
 * making it the primary entry point for chart-related maintenance operations.
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client
 * @param {Object} params.context - GitHub Actions context for repository info
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {Object} params.exec - GitHub Actions exec helpers for running commands
 * @returns {Promise<void>}
 */
async function performUpdates({
  github,
  context,
  core,
  exec
}) {
  try {
    const appChartType = config('repository').chart.type.application;
    const libChartType = config('repository').chart.type.library;
    const charts = await utils.findCharts({
      core,
      appDir: appChartType,
      libDir: libChartType
    });
    await _updateAppFiles({ github, context, core, exec, charts });
    await _updateLockFiles({ github, context, core, exec, charts });
    await _updateIssueTemplates({ github, context, core, exec, charts });
  } catch (error) {
    utils.handleError(error, core, 'perform repository updates');
  }
}

/**
 * Exports the module's functions
 */
module.exports = {
  performUpdates
};
