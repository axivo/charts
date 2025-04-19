/**
 * Git Configuration Utilities
 * 
 * This module provides functions for configuring Git in GitHub Actions workflows.
 * It handles the setup of Git identity for automated commits and returns a utility
 * function for executing Git commands in a standardized way.
 * 
 * The module simplifies the process of configuring Git with the proper identity
 * for GitHub Actions, ensuring that commits made by automated workflows are properly
 * attributed to the GitHub Actions bot.
 * 
 * @module git-config
 * @author AXIVO
 * @license BSD-3-Clause
 */

const utils = require('./utils');

/**
 * Configure Git for GitHub Actions workflows
 * 
 * This function sets up Git with the GitHub Actions bot identity for making commits
 * in workflows. It configures the user name and email to match the GitHub Actions bot,
 * ensuring that commits made by automated workflows are properly attributed.
 * 
 * After configuration, it returns a utility function for executing Git commands
 * that handles proper output formatting and error handling.
 * 
 * @param {Object} options - Function parameters
 * @param {Object} options.github - GitHub API client (unused but kept for workflow compatibility)
 * @param {Object} options.context - GitHub Actions context for repository info
 * @param {Object} options.core - GitHub Actions Core API for logging and output
 * @param {Object} options.exec - GitHub Actions exec helpers for running commands
 * @returns {Promise<Function>} - Async function to run Git commands with standardized output handling
 */
async function configureGit({ github, context, core, exec }) {
  const runGit = async (args) => (await exec.getExecOutput('git', args)).stdout.trim();
  try {
    core.info('Configuring Git repository...');
    await Promise.all([
      runGit(['config', 'user.name', 'github-actions[bot]']),
      runGit(['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'])
    ]);
    core.info('Git configured with GitHub Actions bot identity');
    return runGit;
  } catch (error) {
    utils.handleError(error, core, 'configure Git');
  }
}

/**
 * Exports the module's functions
 */
module.exports = {
  configureGit
};
