/**
 * Create a signed commit using GitHub's GraphQL API
 * 
 * This script creates a verified commit with the provided changes using GitHub's GraphQL API.
 * 
 * @param {Object} options - The options for creating the commit
 * @param {Object} options.github - GitHub API client
 * @param {Object} options.context - Workflow context
 * @param {Object} options.core - GitHub Actions Core
 * @param {string} options.branchName - Branch name to commit to
 * @param {string} options.expectedHeadOid - Expected HEAD SHA of the branch (for validation)
 * @param {Array<Object>} options.additions - Files to add/modify, each having {path, contents} where contents is base64 encoded
 * @param {Array<Object>} options.deletions - Files to delete, each having {path}
 * @param {string} options.commitMessage - Commit message headline
 * @returns {string} - OID of the created commit
 * 
 * @example
 * const createSignedCommit = require('./.github/scripts/git-signed-commit.js');
 * 
 * // Example for files already staged in git
 * const runGit = async (args) => (await exec.getExecOutput('git', args)).stdout.trim();
 * 
 * const additions = await Promise.all(
 *   (await runGit(['diff', '--name-only', '--staged', '--diff-filter=ACMR']))
 *     .split('\n')
 *     .filter(Boolean)
 *     .map(async file => {
 *       const contents = await fs.readFile(file, 'utf-8');
 *       return { path: file, contents: Buffer.from(contents).toString('base64') };
 *     })
 * );
 * 
 * const deletions = (await runGit(['diff', '--name-only', '--staged', '--diff-filter=D']))
 *   .split('\n')
 *   .filter(Boolean)
 *   .map(file => ({ path: file }));
 * 
 * const commitOid = await createSignedCommit({
 *   github,
 *   context,
 *   core,
 *   branchName: 'main',
 *   expectedHeadOid: await runGit(['rev-parse', 'HEAD']),
 *   additions: additions,
 *   deletions: deletions,
 *   commitMessage: 'feat: update files'
 * });
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
    if (!branchName) {
      throw new Error('branchName is required');
    }
    if (!expectedHeadOid) {
      throw new Error('expectedHeadOid is required');
    }
    if (!commitMessage) {
      throw new Error('commitMessage is required');
    }
    if (additions.length === 0 && deletions.length === 0) {
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
    core.setFailed(`Failed to create signed commit: ${error.message}`);
    throw error;
  }
}

/**
 * Helper function to prepare file additions from git staged changes
 * 
 * @param {Function} runGit - Function to run git commands
 * @param {Object} fs - Node.js fs/promises module
 * @returns {Object} - Object containing additions and deletions arrays
 */
async function getGitStagedChanges(runGit, fs) {
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

module.exports = {
  createSignedCommit,
  getGitStagedChanges
};
