/**
 * Git Configuration Utilities
 * 
 * This module provides functions for configuring Git in GitHub Actions workflows:
 * - Setting up Git with GitHub Actions bot identity
 * - Configuring Git authentication and user information
 * 
 * @module git-config
 */

/**
 * Configure Git for GitHub Actions
 * 
 * This script sets up Git with the GitHub Actions bot identity for making commits
 * in workflows. Returns the runGit function that can be used for additional Git operations.
 * 
 * @param {Object} options - Function parameters
 * @param {Object} options.github - GitHub API client (unused but kept for workflow compatibility)
 * @param {Object} options.context - GitHub Actions context for repository info
 * @param {Object} options.core - GitHub Actions Core API for logging and output
 * @param {Object} options.exec - GitHub Actions exec helpers for running commands
 * @returns {Promise<Function>} - Async function to run Git commands
 */
async function configureGit({ github, context, core, exec }) {
  const runGit = async (args) => (await exec.getExecOutput('git', args)).stdout.trim();
  try {
    await Promise.all([
      runGit(['config', 'user.name', 'github-actions[bot]']),
      runGit(['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'])
    ]);
    core.info('Git configured with GitHub Actions bot identity');
    return runGit;
  } catch (error) {
    const errorMsg = `Failed to configure Git: ${error.message}`;
    core.setFailed(errorMsg);
    throw new Error(errorMsg);
  }
}

module.exports = {
  configureGit
};
