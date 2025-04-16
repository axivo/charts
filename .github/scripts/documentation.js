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

const os = require('os');
const gitSignedCommit = require('./git-signed-commit');

/**
 * Configuration constants for Documentation module
 * Contains settings for helm-docs install and other Git-related parameters
 */
const CONFIG = {
  helmDocs: {
    baseUrl: 'https://github.com/norwoodj/helm-docs/releases/download',
    version: '1.14.2'
  }
};

/**
 * Sets up the helm-docs package for generating Helm chart documentation
 * 
 * @param {Object} options - Options for installing helm-docs
 * @param {Object} options.core - GitHub Actions Core API for logging and output
 * @param {Object} options.exec - GitHub Actions exec helpers for running commands
 * @param {string} [options.version=CONFIG.helmDocs.version] - Version of helm-docs to install
 * @returns {Promise<void>}
 */
async function setupHelmDocs({
  core,
  exec,
  version = CONFIG.helmDocs.version
}) {
  try {
    const tmpDir = os.tmpdir();
    const packageFile = `helm-docs_${version}_Linux_x86_64.deb`;
    const packagePath = `${tmpDir}/${packageFile}`;
    const packageUrl = `${CONFIG.helmDocs.baseUrl}/v${version}/${packageFile}`;
    core.info(`Setting up helm-docs v${version}...`);
    const runSudo = async (args) => (await exec.getExecOutput('sudo', args)).stdout.trim();
    await runSudo(['wget', '-qP', tmpDir, packageUrl]);
    await runSudo(['apt-get', '-y', 'install', packagePath]);
    core.info('Successfully setup helm-docs package');
  } catch (error) {
    const errorMsg = `Failed to setup helm-docs package: ${error.message}`;
    core.setFailed(errorMsg);
    throw new Error(errorMsg);
  }
}

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
    core.info(`Successfully updated ${files.length} documentation files`);
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
      core.info('Successfully updated and committed documentation');
    } else {
      core.info('No documentation changes to commit');
    }
  } catch (error) {
    const errorMsg = `Failed to update documentation: ${error.message}`;
    core.setFailed(errorMsg);
    throw new Error(errorMsg);
  }
}

module.exports = {
  CONFIG,
  setupHelmDocs,
  updateDocumentation
};
