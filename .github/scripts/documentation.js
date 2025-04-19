/**
 * Chart Documentation Utilities
 * 
 * This module provides functions for automating Helm chart documentation updates,
 * including installing the helm-docs tool and generating updated documentation.
 * It handles the process of generating and committing documentation changes to
 * pull requests, ensuring consistency across chart documentation.
 * 
 * @module documentation
 * @author AXIVO
 * @license BSD-3-Clause
 */

const os = require('os');
const commit = require('./git-signed-commit');
const utils = require('./utils');

/**
 * Installs the helm-docs package for generating Helm chart documentation
 * 
 * This function downloads and installs the helm-docs package from the official
 * GitHub repository. It handles the process of getting the package, installing it
 * using system package management, and making it available for chart documentation
 * generation.
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {Object} params.exec - GitHub Actions exec helpers for running commands
 * @param {string} [params.version] - Version of helm-docs to install
 * @returns {Promise<void>}
 */
async function installHelmDocs({
  core,
  exec,
  version
}) {
  try {
    const tmpDir = os.tmpdir();
    const packageFile = `helm-docs_${version}_Linux_x86_64.deb`;
    const packagePath = [tmpDir, packageFile].join('/');
    const packageBaseUrl = 'https://github.com/norwoodj/helm-docs/releases/download';
    const packageUrl = [packageBaseUrl, `v${version}`, packageFile].join('/');
    core.info(`Installing helm-docs v${version}...`);
    const runSudo = async (args) => (await exec.getExecOutput('sudo', args)).stdout.trim();
    await runSudo(['wget', '-qP', tmpDir, '-t', '10', '-T', '60', packageUrl]);
    await runSudo(['apt-get', '-y', 'install', packagePath]);
    core.info('Successfully installed helm-docs');
  } catch (error) {
    utils.handleError(error, core, 'install helm-docs');
  }
}

/**
 * Updates documentation in a pull request by generating docs and committing changes
 * 
 * This function runs the helm-docs tool to automatically update all chart documentation
 * based on the Chart.yaml files and templates. It detects changes to documentation files
 * and creates a signed commit with these changes to the pull request branch.
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
    if (!files.length) {
      core.info('No file changes detected, documentation is up to date');
      return;
    }
    const { additions, deletions } = await commit.getGitStagedChanges(runGit);
    if (additions.length + deletions.length > 0) {
      const currentHead = await runGit(['rev-parse', 'HEAD']);
      await commit.createSignedCommit({
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

/**
 * Exports the module's functions
 * 
 * This module exports functions for installing helm-docs and updating chart
 * documentation. These functions are designed to be used within GitHub Actions
 * workflows to automate the process of keeping chart documentation up-to-date.
 */
module.exports = {
  installHelmDocs,
  updateDocumentation
};
