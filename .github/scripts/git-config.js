/**
 * Configure Git for GitHub Actions
 * 
 * This script sets up Git with the GitHub Actions bot identity for making commits
 * in workflows. Returns the runGit function that can be used for additional Git operations.
 * 
 * @param {Object} options - Destructured GitHub Actions context and utilities
 * @param {Object} options.github - GitHub API client
 * @param {Object} options.context - Workflow context
 * @param {Object} options.core - GitHub Actions Core
 * @param {Object} options.exec - GitHub Actions Exec
 * @returns {Function} runGit - Async function to run Git commands
 * 
 * @example
 * const configureGit = require('../scripts/git-config.js');
 * const runGit = await configureGit({github, context, core, exec});
 * // Now use runGit for other Git operations
 */
module.exports = async ({ github, context, core, exec }) => {
  const runGit = async (args) => (await exec.getExecOutput('git', args)).stdout.trim();

  try {
    await Promise.all([
      runGit(['config', 'user.name', 'github-actions[bot]']),
      runGit(['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'])
    ]);

    core.info('Git configured with GitHub Actions bot identity');
    return runGit;
  } catch (error) {
    core.setFailed(`Failed to configure Git: ${error.message}`);
    throw error;
  }
};
