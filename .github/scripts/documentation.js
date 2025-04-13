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

/**
 * Centralized configuration for the documentation workflow
 */
const CONFIG = {
    helmDocs: {
        version: '1.14.2',
        baseUrl: 'https://github.com/norwoodj/helm-docs/releases/download'
    },
    git: {
        commitMessage: 'docs(github-action): update documentation'
    }
};

/**
 * Installs the helm-docs package for generating Helm chart documentation
 * 
 * @param {Object} options - Options for installing helm-docs
 * @param {Object} options.core - GitHub Actions Core API for logging and output
 * @param {Object} options.exec - GitHub Actions exec helpers for running commands
 * @param {string} [options.version=CONFIG.helmDocs.version] - Version of helm-docs to install
 * @returns {Promise<void>}
 */
async function installHelmDocs({
    core,
    exec,
    version = CONFIG.helmDocs.version
}) {
    try {
        const os = require('os');
        const tmpDir = os.tmpdir();
        const packagePath = `${tmpDir}/helm-docs_${version}_Linux_x86_64.deb`;
        const packageUrl = `${CONFIG.helmDocs.baseUrl}/v${version}/helm-docs_${version}_Linux_x86_64.deb`;

        core.info(`Installing helm-docs version ${version}...`);

        // Helper function to run sudo commands
        const runSudo = async (args) => (await exec.exec('sudo', args));

        // Download and install the package
        await runSudo(['wget', '-qP', tmpDir, packageUrl]);
        await runSudo(['apt-get', '-y', 'install', packagePath]);

        core.info('helm-docs successfully installed');
    } catch (error) {
        const errorMsg = `Failed to install helm-docs: ${error.message}`;
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
 * @param {Object} options.fs - Node.js fs/promises module for file operations
 * @returns {Promise<void>}
 */
async function updateDocumentation({
    github,
    context,
    core,
    exec,
    fs
}) {
    try {
        // Import git utilities
        const { createSignedCommit, getGitStagedChanges } = require('./.github/scripts/git-signed-commit.js');

        // Helper function to run git commands
        const runGit = async (args) => (await exec.getExecOutput('git', args)).stdout.trim();

        // Fetch and switch to the PR branch
        const headRef = process.env.GITHUB_HEAD_REF;
        core.info(`Switching to PR branch: ${headRef}`);
        await runGit(['fetch', 'origin', headRef]);
        await runGit(['switch', headRef]);

        // Generate documentation with helm-docs
        core.info('Generating documentation with helm-docs...');
        await exec.exec('helm-docs');

        // Stage changes
        await runGit(['add', '.']);

        // Check if there are any changes
        const files = (await runGit(['diff', '--staged', '--name-only']))
            .split('\n')
            .filter(Boolean);

        if (files.length === 0) {
            core.info('No file changes detected. Documentation is up to date.');
            return;
        }

        core.info(`${files.length} files have been updated`);

        // Get the changes and create a commit
        const { additions, deletions } = await getGitStagedChanges(runGit, fs);
        await createSignedCommit({
            github,
            context,
            core,
            branchName: context.payload.pull_request.head.ref,
            expectedHeadOid: context.payload.pull_request.head.sha,
            additions,
            deletions,
            commitMessage: CONFIG.git.commitMessage
        });

        core.info('Documentation updated and committed successfully');
    } catch (error) {
        const errorMsg = `Failed to update documentation: ${error.message}`;
        core.setFailed(errorMsg);
        throw new Error(errorMsg);
    }
}

// Export all the functions and constants
module.exports = {
    CONFIG,
    installHelmDocs,
    updateDocumentation
};
