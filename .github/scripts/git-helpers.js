/**
 * Git helper functions for GitHub Actions workflows
 * 
 * This script provides common Git operations with enhanced error handling
 * and retry mechanisms for GitHub Actions workflows.
 * 
 * @module git-helpers
 */

/**
 * Safely push to a branch with retry and conflict resolution
 * 
 * Attempts to push to the specified branch, and if it fails due to conflicts,
 * fetches and rebases the latest changes before trying again.
 * 
 * @param {Object} options - Options for the push operation
 * @param {Function} options.runGit - Function to run Git commands
 * @param {Object} options.core - GitHub Actions Core module for logging
 * @param {string} options.branch - Branch name to push to
 * @param {number} [options.maxAttempts=3] - Maximum number of push attempts
 * @returns {Promise<boolean>} - True if push was successful
 * @throws {Error} - If all push attempts fail
 * 
 * @example
 * const { safeGitPush } = require('./.github/scripts/git-helpers.js');
 * 
 * // Use in a workflow
 * await safeGitPush({
 *   runGit,
 *   core,
 *   branch: 'gh-pages'
 * });
 */
async function safeGitPush({ runGit, core, branch, maxAttempts = 3 }) {
  let pushAttempts = 0;
  let pushSuccess = false;
  
  while (!pushSuccess && pushAttempts < maxAttempts) {
    try {
      await runGit(['push', 'origin', branch]);
      pushSuccess = true;
      core.info(`Successfully pushed to ${branch} on attempt ${pushAttempts + 1}`);
    } catch (pushError) {
      pushAttempts++;
      if (pushAttempts >= maxAttempts) {
        throw new Error(`Failed to push to ${branch} after ${maxAttempts} attempts: ${pushError.message}`);
      }
      
      core.info(`Push attempt ${pushAttempts} failed, retrying after pulling latest changes...`);
      await runGit(['fetch', 'origin', branch]);
      await runGit(['pull', '--rebase', 'origin', branch]);
    }
  }
  
  return pushSuccess;
}

/**
 * Safely switch to a branch, creating it if it doesn't exist
 * 
 * @param {Object} options - Options for the branch switch operation
 * @param {Function} options.runGit - Function to run Git commands
 * @param {Object} options.core - GitHub Actions Core module for logging
 * @param {string} options.branch - Branch name to switch to
 * @param {string} [options.baseBranch] - Base branch if creating a new branch
 * @param {boolean} [options.createIfNotExists=false] - Create branch if it doesn't exist
 * @returns {Promise<boolean>} - True if branch exists or was created
 */
async function safeBranchSwitch({ runGit, core, branch, baseBranch, createIfNotExists = false }) {
  try {
    // Check if branch exists locally
    const localBranches = (await runGit(['branch', '--list'])).split('\n').map(b => b.trim().replace('* ', ''));
    const branchExists = localBranches.includes(branch);
    
    if (branchExists) {
      await runGit(['switch', branch]);
      core.info(`Switched to branch: ${branch}`);
      return true;
    } else {
      const remoteBranchExists = (await runGit(['ls-remote', '--heads', 'origin', branch])).length > 0;
      
      if (remoteBranchExists) {
        await runGit(['fetch', 'origin', branch]);
        await runGit(['switch', branch]);
        core.info(`Switched to branch: ${branch}`);
        return true;
      } else if (createIfNotExists && baseBranch) {
        await runGit(['checkout', '-b', branch, baseBranch]);
        core.info(`Created and switched to new branch: ${branch} from ${baseBranch}`);
        return true;
      } else if (!createIfNotExists) {
        core.warning(`Branch ${branch} does not exist and creation not requested`);
        return false;
      } else {
        core.warning(`Cannot create branch ${branch} without a base branch`);
        return false;
      }
    }
  } catch (error) {
    core.error(`Failed to switch to branch ${branch}: ${error.message}`);
    throw error;
  }
}

// Export functions
module.exports = safeGitPush;
module.exports.safeBranchSwitch = safeBranchSwitch;
