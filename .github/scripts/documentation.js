/**
 * Documentation Update Utilities
 * 
 * This module provides functions for automating chart documentation updates:
 * - Installing helm-docs
 * - Generating documentation with helm-docs
 * - Committing changes to pull requests
 * 
 * @module documentation
 */

const gitSignedCommit = require('./git-signed-commit');
const utils = require('./utils');

/**
 * Updates documentation in a pull request by generating docs and committing changes
 * 
 * @param {Object} options - Options for updating documentation
 * @param {Object} options.github - GitHub API client
 * @param {Object} options.context - GitHub Actions context for repository info
 * @param {Object} options.core - GitHub Actions Core API for logging and output
 * @param {Object} options.exec - GitHub Actions exec helpers for running commands
 * @returns {Promise<void>}
 */
async function updateDocumentation({
  github,
  context,
  core,
  exec
}) {
  try {
    const runGit = async (args) => (await exec.getExecOutput('git', args)).stdout.trim();
    const headRef = process.env.GITHUB_HEAD_REF;
    core.info(`Getting the latest changes for ${headRef} branch...`);
    await runGit(['fetch', 'origin', headRef]);
    await runGit(['switch', headRef]);
    core.info('Generating documentation with helm-docs...');
    await exec.exec('helm-docs');
    await runGit(['add', '.']);
    const files = (await runGit(['diff', '--staged', '--name-only']))
      .split('\n')
      .filter(Boolean);
    if (files.length === 0) {
      core.info('No file changes detected, documentation is up to date');
      return;
    }
    const { additions, deletions } = await gitSignedCommit.getGitStagedChanges(runGit);
    if (additions.length > 0 || deletions.length > 0) {
      const currentHead = await runGit(['rev-parse', 'HEAD']);
      await gitSignedCommit.createSignedCommit({
        github,
        context,
        core,
        branchName: headRef,
        expectedHeadOid: currentHead,
        additions,
        deletions,
        commitMessage: 'chore(github-action): update documentation'
      });
      core.info(`Successfully updated ${files.length} documentation files`);
    } else {
      core.info('No documentation changes to commit');
    }
  } catch (error) {
    utils.handleError(error, core, 'update documentation');
  }
}

module.exports = {
  updateDocumentation
};
