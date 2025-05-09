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
const api = require('./github-api');
const config = require('./config');
const docs = require('./documentation');
const utils = require('./utils');

/**
 * Performs a Git commit for the specified files
 * 
 * This function handles the complete process of committing changes to the repository:
 * 1. Pulls the latest changes from the head branch to ensure up-to-date state
 * 2. Stages the specified files for commit
 * 3. Determines which files were actually modified (additions and deletions)
 * 4. Creates a signed commit using the GitHub API if changes are detected
 * 
 * The function uses the GitHub GraphQL API to create verified commits, making
 * automation changes appear as properly authenticated in the GitHub interface.
 * It handles potential errors during the commit process as non-fatal warnings.
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {Object} params.exec - GitHub Actions exec helpers for running commands
 * @param {Array<string>} params.files - Array of file paths to commit
 * @param {string} params.type - Type of files being committed (for log messages)
 * @returns {Promise<void>}
 */
async function _performGitCommit({ github, context, core, exec, files, type }) {
  try {
    const runGit = async (args) => (await exec.getExecOutput('git', args)).stdout.trim();
    const headRef = process.env.GITHUB_HEAD_REF;
    core.info(`Getting latest changes for '${headRef}' branch...`);
    await runGit(['pull', 'origin', headRef]);
    core.info(`Committing ${files.length} ${type}...`);
    await runGit(['add', ...files]);
    const { additions, deletions } = await utils.getGitStagedChanges(runGit);
    if (additions.length + deletions.length > 0) {
      const currentHead = await runGit(['rev-parse', 'HEAD']);
      await api.createSignedCommit({
        github,
        context,
        core,
        branchName: headRef,
        expectedHeadOid: currentHead,
        additions,
        deletions,
        commitMessage: `chore(github-action): update ${type}`
      });
      core.info(`Successfully committed ${type}`);
    }
  } catch (error) {
    utils.handleError(error, core, `commit ${type}`, false);
  }
}

/**
 * Lints charts using the chart-testing (ct) tool
 * 
 * This function runs the 'ct lint' command on the specified charts to identify
 * any issues that might prevent successful deployment. It validates Helm chart
 * structure, requirements, and best practices according to the chart-testing tool's
 * criteria. The function processes both application and library charts.
 * 
 * Any linting errors are handled as non-fatal by default, but the function will
 * return false to indicate failure, allowing the calling function to decide
 * how to proceed based on the linting results.
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {Object} params.exec - GitHub Actions exec helpers for running commands
 * @param {Object} params.charts - Object containing application and library chart paths
 * @returns {Promise<boolean>} - True if linting passed, false if errors were found
 */
async function _lintCharts({ core, exec, charts }) {
  try {
    const chartDirs = [...charts.application, ...charts.library];
    if (!chartDirs.length) {
      core.info('No charts to lint');
      return true;
    }
    const word = chartDirs.length === 1 ? 'chart' : 'charts';
    core.info(`Linting ${chartDirs.length} ${word}...`);
    await exec.exec('ct', ['lint', '--charts', chartDirs.join(',')]);
    core.info(`Successfully linted ${chartDirs.length} ${word}`);
    return true;
  } catch (error) {
    utils.handleError(error, core, 'lint charts', false);
    return false;
  }
}

/**
 * Updates application files content with latest chart versions
 * 
 * This function processes all application.yaml files within chart directories to ensure
 * they reference specific chart versions instead of HEAD. For each application file:
 * 
 * 1. It reads the application.yaml file and extracts the source specification
 * 2. It reads the chart's metadata to determine the current version
 * 3. It formats a proper tag name based on the configured release title pattern
 * 4. It updates the targetRevision field to point to the version-specific tag
 * 5. It writes the updated application.yaml file back to disk
 * 
 * After updating all files, it commits the changes using _performGitCommit().
 * The function handles errors for individual files as non-fatal, allowing it to
 * update as many files as possible even if some fail.
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {Object} params.exec - GitHub Actions exec helpers for running commands
 * @param {Object} params.charts - Object containing application and library chart paths
 * @returns {Promise<string[]>} - Array of updated application file paths
 */
async function _updateAppFiles({ github, context, core, exec, charts }) {
  try {
    core.info('Updating application files with chart versions...');
    const appFiles = [];
    await Promise.all(charts.application.map(async (chartDir) => {
      try {
        const chartName = path.basename(chartDir);
        const appYamlPath = path.join(chartDir, 'application.yaml');
        if (!await utils.fileExists(appYamlPath)) return;
        const appConfig = yaml.load(await fs.readFile(appYamlPath, 'utf8'));
        if (!appConfig.spec?.source) return;
        const chartMetadata = yaml.load(await fs.readFile(path.join(chartDir, 'Chart.yaml'), 'utf8'));
        const tagName = config('release').title
          .replace('{{ .Name }}', chartName)
          .replace('{{ .Version }}', chartMetadata.version);
        if (appConfig.spec.source.targetRevision === tagName) return;
        appConfig.spec.source.targetRevision = tagName;
        await fs.writeFile(appYamlPath, yaml.dump(appConfig, { lineWidth: -1 }), 'utf8');
        appFiles.push(appYamlPath);
        core.info(`Successfully updated '${tagName}' target revision in ${appYamlPath}`);
      } catch (error) {
        utils.handleError(error, core, `update application file for ${chartName}`, false);
      }
    }));
    if (appFiles.length > 0) {
      const word = appFiles.length === 1 ? 'file' : 'files'
      await _performGitCommit({ github, context, core, exec, files: appFiles, type: `application ${word}` });
      core.info(`Successfully updated ${appFiles.length} application ${word}`);
    }
  } catch (error) {
    utils.handleError(error, core, 'update application files', false);
  }
}

/**
 * Updates dependency lock files for charts in a pull request
 * 
 * This function refreshes the Chart.lock files for all charts in the repository by:
 * 
 * 1. Iterating through all application and library charts
 * 2. Calculating a hash of the existing lock file (if any) for change detection
 * 3. Running 'helm dependency update' to refresh dependencies for each chart
 * 4. Detecting if a Chart.lock file was created, updated, or deleted
 * 5. Adding changed lock files to a list for commit
 * 
 * The function handles three scenarios:
 * - When dependencies are added: Chart.lock is created and committed
 * - When dependencies are modified: Chart.lock is updated and committed
 * - When dependencies are removed: Chart.lock deletion is tracked and committed
 * 
 * After processing all charts, it commits the changed lock files using _performGitCommit().
 * This ensures that all charts reference the correct and up-to-date dependency versions,
 * particularly important when chart dependencies have been updated.
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {Object} params.exec - GitHub Actions exec helpers for running commands
 * @param {Object} params.charts - Object containing application and library chart paths
 * @returns {Promise<void>}
 */
async function _updateLockFiles({ github, context, core, exec, charts }) {
  try {
    core.info('Updating dependency lock files...');
    const lockFiles = [];
    const chartDirs = [...charts.application, ...charts.library];
    await Promise.all(chartDirs.map(async (chartDir) => {
      try {
        const lockFilePath = path.join(chartDir, 'Chart.lock');
        const yamlFilePath = path.join(chartDir, 'Chart.yaml');
        const yamlFile = yaml.load(await fs.readFile(yamlFilePath, 'utf8'));
        if (yamlFile.dependencies && yamlFile.dependencies.length > 0) {
          await exec.exec('helm', ['dependency', 'update', chartDir]);
          lockFiles.push(lockFilePath);
          core.info(`Successfully updated dependency lock file for '${chartDir}' chart`);
        } else {
          if (await utils.fileExists(lockFilePath)) {
            await fs.unlink(lockFilePath);
            lockFiles.push(lockFilePath);
            core.info(`Successfully removed dependency lock file for '${chartDir}' chart`);
          }
        }
      } catch (error) {
        utils.handleError(error, core, `process dependency lock file for '${chartDir}' chart`, false);
      }
    }));
    if (lockFiles.length > 0) {
      const word = lockFiles.length === 1 ? 'file' : 'files';
      await _performGitCommit({ github, context, core, exec, files: lockFiles, type: `dependency lock ${word}` });
      core.info(`Successfully updated ${lockFiles.length} dependency lock ${word}`);
    }
  } catch (error) {
    utils.handleError(error, core, 'update dependency lock files');
  }
}

/**
 * Performs all required repository updates for charts
 * 
 * This function orchestrates the complete chart repository maintenance process in a
 * single operation. It:
 * 
 * 1. Gets the list of files updated in the current pull request or push
 * 2. Identifies which charts were affected by these file changes
 * 3. Updates chart documentation using helm-docs (only for modified charts)
 * 4. Updates application files to reference specific chart versions
 * 5. Updates dependency lock files for all modified charts
 * 6. Updates issue templates with a current list of all available charts
 * 
 * The function handles the high-level workflow for chart maintenance, delegating
 * specific tasks to specialized private functions. It provides a single entry point
 * for the chart maintenance process, making it easy to invoke from GitHub Actions.
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {Object} params.exec - GitHub Actions exec helpers for running commands
 * @returns {Promise<void>}
 */
async function updateCharts({ github, context, core, exec }) {
  try {
    const appChartType = config('repository').chart.type.application;
    const libChartType = config('repository').chart.type.library;
    const files = await api.getUpdatedFiles({ github, context, core });
    const updatedCharts = await utils.findCharts({ core, appDir: appChartType, libDir: libChartType, files });
    let updatedChartDirs = [];
    if (updatedCharts.application.length + updatedCharts.library.length > 0) {
      const allUpdatedCharts = [...updatedCharts.application, ...updatedCharts.library];
      updatedChartDirs = allUpdatedCharts.map(chartDir => chartDir);
      await _lintCharts({ core, exec, charts: updatedCharts });
      await docs.updateDocumentation({ github, context, core, exec, dirs: updatedChartDirs });
      await _updateAppFiles({ github, context, core, exec, charts: updatedCharts });
      await _updateLockFiles({ github, context, core, exec, charts: updatedCharts });
    }
  } catch (error) {
    utils.handleError(error, core, 'update repository charts');
  }
}

/**
 * Exports the module's functions
 */
module.exports = {
  updateCharts
};
