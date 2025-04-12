/**
 * Git helper functions for GitHub Actions workflows
 * 
 * @module git-helpers
 */

/**
 * Pushes changes to a Git repository with retry logic to handle concurrent update conflicts
 * 
 * This function attempts to push changes to the specified branch, and if it fails due to
 * remote changes, it fetches and pulls the latest changes before retrying. This is useful
 * in CI environments where multiple workflows might update the same branch concurrently.
 * 
 * @param {Object} options - Options for the retryGitPush function
 * @param {Function} options.runGit - Function to execute Git commands
 * @param {Object} options.core - GitHub Actions Core module for logging
 * @param {string} options.branch - Branch name to push to
 * @param {number} [options.maxAttempts=3] - Maximum number of push attempts before failing
 * @returns {boolean} - Returns true if push succeeded
 * @throws {Error} - Throws an error if all push attempts fail
 * 
 * @example
 * const retryGitPush = require('./.github/scripts/git-helpers.js');
 * const runGit = async (args) => (await exec.getExecOutput('git', args)).stdout.trim();
 * 
 * // Push to the main branch with 3 retry attempts
 * await retryGitPush({
 *   runGit,
 *   core,
 *   branch: 'main'
 * });
 */
async function retryGitPush({ runGit, core, branch, maxAttempts = 3 }) {
  let pushAttempts = 0;
  let pushSuccess = false;
  
  while (!pushSuccess && pushAttempts < maxAttempts) {
    try {
      await runGit(['push', 'origin', branch]);
      pushSuccess = true;
    } catch (pushError) {
      pushAttempts++;
      if (pushAttempts >= maxAttempts) {
        throw new Error(`Failed to push to ${branch} after ${maxAttempts} attempts`);
      }
      
      await runGit(['fetch', 'origin', branch]);
      await runGit(['pull', 'origin', branch]);
    }
  }
  
  return pushSuccess;
}

/**
 * Creates a Git stash and manages its lifecycle for safely switching branches
 * 
 * This function stashes changes before performing operations that require a clean
 * working directory (like switching branches), and then optionally restores those
 * changes afterward. It handles tracking whether a stash was actually created.
 * 
 * @param {Object} options - Options for the withGitStash function
 * @param {Function} options.runGit - Function to execute Git commands
 * @param {Object} options.core - GitHub Actions Core module for logging
 * @param {string} options.message - Descriptive message for the stash
 * @param {Function} options.operation - Async function to run while changes are stashed
 * @returns {Promise<any>} - Returns the result of the operation function
 * 
 * @example
 * const { withGitStash } = require('./.github/scripts/git-helpers.js');
 * const runGit = async (args) => (await exec.getExecOutput('git', args)).stdout.trim();
 * 
 * // Stash changes, switch branch, then restore changes
 * await withGitStash({
 *   runGit,
 *   core,
 *   message: 'Stash for branch switch',
 *   operation: async () => {
 *     await runGit(['checkout', 'other-branch']);
 *     // Do work on other branch
 *     return 'operation result';
 *   }
 * });
 */
async function withGitStash({ runGit, core, message, operation }) {
  let hasStash = false;
  
  try {
    core.info(`Stashing changes with message: ${message}`);
    await runGit(['stash', 'push', '--include-untracked', '--message', message]);
    const stashList = await runGit(['stash', 'list']);
    hasStash = stashList.includes(message);
    
    if (hasStash) {
      core.info('Changes stashed successfully');
    } else {
      core.info('No changes to stash');
    }
    
    // Run the provided operation while changes are stashed
    const result = await operation();
    
    // Restore stashed changes if they exist
    if (hasStash) {
      core.info('Restoring stashed changes');
      await runGit(['stash', 'pop']);
    }
    
    return result;
  } catch (error) {
    core.error(`Error during stash operation: ${error.message}`);
    
    // Try to restore stash if it exists and there was an error
    if (hasStash) {
      try {
        core.info('Attempting to restore stashed changes after error');
        await runGit(['stash', 'pop']);
      } catch (stashError) {
        core.warning(`Failed to restore stash: ${stashError.message}`);
      }
    }
    
    throw error;
  }
}

module.exports = retryGitPush;
module.exports.withGitStash = withGitStash;
