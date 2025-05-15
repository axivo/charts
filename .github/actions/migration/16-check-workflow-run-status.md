# Migration: checkWorkflowRunStatus

## Current Implementation
- Location: [github-api.js - checkWorkflowRunStatus()](https://github.com/fluxcd/charts/blob/main/.github/scripts/github-api.js#L148-L170)
- Purpose: Monitors workflow runs and provides real-time status updates
- Dependencies: Octokit REST API client, console logging
- Used by: Workflow monitoring, CI/CD status reporting

## Code Analysis
The function polls a workflow run until it reaches a terminal state (completed, cancelled, failed). It provides real-time status updates through console logging and handles both successful and failed runs.

### Current Logic Flow
1. Retrieves initial workflow run status
2. Enters polling loop if not completed
3. Logs status updates during polling
4. Handles completed, cancelled, and failed states
5. Returns final status

## Target Architecture
- Target Class: GitHubAPI
- Target Method: checkWorkflowRunStatus
- New Dependencies: Base GitHub API class, Error handler, Logger

## Implementation Steps
1. Create checkWorkflowRunStatus method in GitHubAPI class
2. Implement polling logic with configurable interval
3. Use proper logging instead of console output
4. Add timeout protection
5. Create backward compatibility wrapper
6. Test with various workflow states

## Backward Compatibility
```javascript
// github-api.js
const GitHubAPI = require('./.github/actions/services/GitHub');
let githubInstance;

async function checkWorkflowRunStatus(owner, repo, runId) {
  if (!githubInstance) {
    githubInstance = new GitHubAPI({
      core: global.core,
      github: global.github
    });
  }
  return githubInstance.checkWorkflowRunStatus(owner, repo, runId);
}

module.exports = {
  checkWorkflowRunStatus,
  // other functions...
};
```

## Testing Strategy
1. Unit test with mocked workflow states
2. Test polling behavior
3. Test status transitions
4. Verify timeout handling
5. Test error conditions

## Code Examples

### Before (Legacy Implementation)
```javascript
const checkWorkflowRunStatus = async (owner, repo, runId) => {
  console.log(`Checking workflow run ${runId}...`);
  
  let status = 'in_progress';
  let conclusion = null;
  
  while (status === 'in_progress' || status === 'queued') {
    const { data: run } = await github.rest.actions.getWorkflowRun({
      owner,
      repo,
      run_id: runId
    });
    
    status = run.status;
    conclusion = run.conclusion;
    
    console.log(`Status: ${status}, Conclusion: ${conclusion || 'pending'}`);
    
    if (status === 'in_progress' || status === 'queued') {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  return { status, conclusion };
};
```

### After (New Implementation)
```javascript
const BaseGitHub = require('../core/GitHub');

class GitHubAPI extends BaseGitHub {
  constructor(context) {
    super(context);
    this.POLL_INTERVAL = 5000;
    this.MAX_POLL_TIME = 3600000;
  }

  /**
   * Monitors workflow run status until completion
   * 
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} runId - Workflow run ID
   * @returns {Promise<Object>} Final status and conclusion
   */
  async checkWorkflowRunStatus(owner, repo, runId) {
    try {
      this.logger.info(`Checking workflow run ${runId}...`);
      const startTime = Date.now();
      let status = 'in_progress';
      let conclusion = null;
      while (status === 'in_progress' || status === 'queued') {
        if (Date.now() - startTime > this.MAX_POLL_TIME) {
          throw new Error(`Workflow run ${runId} timed out after ${this.MAX_POLL_TIME / 1000} seconds`);
        }
        const { data: run } = await this.github.rest.actions.getWorkflowRun({
          owner,
          repo,
          run_id: runId
        });
        status = run.status;
        conclusion = run.conclusion;
        this.logger.info(`Status: ${status}, Conclusion: ${conclusion || 'pending'}`);
        if (status === 'in_progress' || status === 'queued') {
          await new Promise(resolve => setTimeout(resolve, this.POLL_INTERVAL));
        }
      }
      return { status, conclusion };
    } catch (error) {
      throw this.errorHandler.handle(error, {
        operation: 'check workflow run status',
        context: { owner, repo, runId }
      });
    }
  }
}

module.exports = GitHubAPI;
```

### Usage Example
```javascript
const GitHubAPI = require('./services/GitHub');

async function example(context) {
  const github = new GitHubAPI(context);
  const result = await github.checkWorkflowRunStatus('fluxcd', 'charts', 12345);
  if (result.conclusion === 'success') {
    context.core.info('Workflow completed successfully');
  } else {
    context.core.warning(`Workflow finished with: ${result.conclusion}`);
  }
}
```

## Migration Impact
- Console output replaced with proper logging
- Added timeout protection
- Enhanced error handling
- Consistent with new architecture patterns

## Success Criteria
- [ ] Function behavior remains identical
- [ ] Polling continues to work correctly
- [ ] Status updates are properly logged
- [ ] Timeout protection prevents infinite loops
- [ ] All existing workflows continue to work
- [ ] Documentation is updated
