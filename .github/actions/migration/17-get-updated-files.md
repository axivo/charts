# Migration: getUpdatedFiles

## Current Implementation
- Location: [github-api.js - getUpdatedFiles()](https://github.com/fluxcd/charts/blob/main/.github/scripts/github-api.js#L172-L193)
- Purpose: Retrieves list of files changed in a pull request or between commits
- Dependencies: Octokit REST API client
- Used by: PR validation, change detection, CI/CD decisions

## Code Analysis
The function fetches files that were modified in a pull request, providing information about what changed to enable targeted processing or validation.

### Current Logic Flow
1. Retrieves pull request file changes
2. Handles pagination for large changesets
3. Returns array of file information
4. Includes status (added, modified, deleted) and filenames

## Target Architecture
- Target Class: GitHubAPI
- Target Method: getUpdatedFiles
- New Dependencies: Base GitHub API class, Error handler, Logger

## Implementation Steps
1. Create getUpdatedFiles method in GitHubAPI class
2. Implement pagination handling
3. Add filtering capabilities
4. Create backward compatibility wrapper
5. Test with various PR sizes
6. Update calling code to use new API

## Backward Compatibility
```javascript
// github-api.js
const GitHubAPI = require('./.github/actions/services/GitHub');
let githubInstance;

async function getUpdatedFiles(owner, repo, pullNumber) {
  if (!githubInstance) {
    githubInstance = new GitHubAPI({
      core: global.core,
      github: global.github
    });
  }
  return githubInstance.getUpdatedFiles(owner, repo, pullNumber);
}

module.exports = {
  getUpdatedFiles,
  // other functions...
};
```

## Testing Strategy
1. Unit test with mocked GitHub responses
2. Test pagination for large file lists
3. Test various file statuses
4. Verify empty changeset handling
5. Integration test with real PR

## Code Examples

### Before (Legacy Implementation)
```javascript
const getUpdatedFiles = async (owner, repo, pullNumber) => {
  const files = await github.paginate(github.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: pullNumber
  });
  
  return files;
};
```

### After (New Implementation)
```javascript
const BaseGitHub = require('../core/GitHub');

class GitHubAPI extends BaseGitHub {
  constructor(context) {
    super(context);
  }

  /**
   * Gets list of files changed in a pull request
   * 
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} pullNumber - Pull request number
   * @returns {Promise<Array>} Array of changed files
   */
  async getUpdatedFiles(owner, repo, pullNumber) {
    try {
      this.logger.debug(`Fetching changed files for PR #${pullNumber}`);
      const files = await this.github.paginate(this.github.rest.pulls.listFiles, {
        owner,
        repo,
        pull_number: pullNumber
      });
      this.logger.info(`Retrieved ${files.length} changed files`);
      const summary = files.reduce((acc, file) => {
        acc[file.status] = (acc[file.status] || 0) + 1;
        return acc;
      }, {});
      this.logger.debug(`File changes: ${JSON.stringify(summary)}`);
      return files;
    } catch (error) {
      throw this.errorHandler.handle(error, {
        operation: 'get updated files',
        context: { owner, repo, pullNumber }
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
  const files = await github.getUpdatedFiles('fluxcd', 'charts', 123);
  const chartFiles = files.filter(file => file.filename.endsWith('/Chart.yaml'));
  context.core.info(`Found ${chartFiles.length} modified charts`);
  for (const file of chartFiles) {
    context.core.info(`${file.status}: ${file.filename}`);
  }
}
```

## Migration Impact
- Enhanced logging for debugging
- Better error context
- Summary statistics for file changes
- Consistent with new architecture patterns

## Success Criteria
- [ ] Function behavior remains identical
- [ ] Pagination works correctly
- [ ] File status information preserved
- [ ] All existing workflows continue to work
- [ ] New implementation has comprehensive tests
- [ ] Documentation is updated
