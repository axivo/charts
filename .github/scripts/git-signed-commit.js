/**
 * Git Signed Commit Utilities
 * 
 * This module provides functions for creating verified commits using GitHub's GraphQL API.
 * It handles the process of staging changes, preparing file content, and making signed
 * commits directly through the GitHub API rather than using Git command line operations.
 * 
 * Using the GitHub API for commits ensures that commits are properly verified and
 * attributed, even in automated workflows where GPG signing might not be available.
 * 
 * @module git-signed-commit
 * @author AXIVO
 * @license BSD-3-Clause
 */

const fs = require('fs/promises');
const utils = require('./utils');

/**
 * Create a signed commit using GitHub's GraphQL API
 * 
 * This function creates a verified commit through GitHub's GraphQL API instead of
 * using the Git command line. It handles file additions and deletions, validates branch
 * state, and ensures commit integrity using the expected HEAD OID for validation.
 * 
 * The function requires file content to be properly base64 encoded for additions,
 * and handles both the GraphQL mutation and error reporting for the commit process.
 * 
 * @param {Object} options - Function parameters
 * @param {Object} options.github - GitHub API client
 * @param {Object} options.context - GitHub Actions context for repository info
 * @param {Object} options.core - GitHub Actions Core API for logging and output
 * @param {string} options.branchName - Branch name to commit to
 * @param {string} options.expectedHeadOid - Expected HEAD SHA of the branch (for validation)
 * @param {Array<Object>} options.additions - Files to add/modify, each having {path, contents} where contents is base64 encoded
 * @param {Array<Object>} options.deletions - Files to delete, each having {path}
 * @param {string} options.commitMessage - Commit message headline
 * @returns {Promise<string|null>} - OID of the created commit or null if no changes
 */
async function createSignedCommit({
  github,
  context,
  core,
  branchName,
  expectedHeadOid,
  additions = [],
  deletions = [],
  commitMessage
}) {
  try {
    core.info('Creating signed commit...');
    if (!branchName) {
      throw new Error('branchName is required');
    }
    if (!expectedHeadOid) {
      throw new Error('expectedHeadOid is required');
    }
    if (!commitMessage) {
      throw new Error('commitMessage is required');
    }
    if (!(additions.length + deletions.length)) {
      core.info('No changes to commit');
      return null;
    }
    const input = {
      branch: {
        repositoryNameWithOwner: context.payload.repository.full_name,
        branchName: branchName
      },
      expectedHeadOid: expectedHeadOid,
      fileChanges: {
        additions: additions,
        deletions: deletions
      },
      message: { headline: commitMessage }
    };
    const mutation = `
      mutation($input: CreateCommitOnBranchInput!) {
        createCommitOnBranch(input: $input) {
          commit {
            oid
          }
        }
      }
    `;
    const { createCommitOnBranch } = await github.graphql(mutation, { input });
    const commitOid = createCommitOnBranch.commit.oid;
    core.info(`Signed commit created with OID: ${commitOid}`);
    return commitOid;
  } catch (error) {
    utils.handleError(error, core, 'create signed commit');
  }
}

/**
 * Helper function to prepare file additions and deletions from git staged changes
 * 
 * This function processes Git staged changes and prepares them in the format required
 * by the GitHub API for creating commits. It reads the content of added or modified files,
 * encodes them in base64, and organizes both additions and deletions into structured arrays.
 * 
 * The function uses Git diff commands to identify staged changes and categorizes them
 * into additions (including modifications) and deletions for proper handling in the
 * commit process.
 * 
 * @param {Function} runGit - Function to run git commands
 * @returns {Promise<Object>} - Object containing additions and deletions arrays in the format required by GitHub API
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
 * Exports the module's signed commit functions
 * 
 * This module exports functions for creating signed commits through GitHub's API
 * and preparing file changes for those commits. These functions are used in various
 * scripts that need to make authenticated and verified commits to the repository.
 */
module.exports = {
  createSignedCommit,
  getGitStagedChanges
};
