# Migration: getReleaseByTag

## Current Implementation
- Location: [github-api.js - getReleaseByTag()](https://github.com/fluxcd/charts/blob/main/.github/scripts/github-api.js#L100-L117)
- Purpose: Fetches a specific GitHub release by its tag name
- Dependencies: Octokit REST API client
- Used by: Release deletion workflow, release verification

## Code Analysis
The function retrieves a release by tag, returning complete release metadata. It includes special handling for cases where the release does not exist, returning `undefined` rather than throwing an error.

### Current Logic Flow
1. Attempts to retrieve release by tag
2. Returns full release data if found
3. Returns `undefined` if release doesn't exist (404 error)
4. Re-throws other errors

## Target Architecture
- Target Class: GitHubAPI
- Target Method: getReleaseByTag
- New Dependencies: Base GitHub API class, Error handler, Logger

## Implementation Steps
1. Create getReleaseByTag method in GitHubAPI class
2. Implement error handling for 404 cases
3. Add logging for debugging
4. Create backward compatibility wrapper
5. Test with existing workflows
6. Update calling code to use new API

## Backward Compatibility
```javascript
// github-api.js
const GitHubAPI = require('./.github/actions/services/GitHub');
let githubInstance;

async function getReleaseByTag(owner, repo, tag) {
  if (!githubInstance) {
    githubInstance = new GitHubAPI({
      core: global.core,
      github: global.github
    });
  }
  return githubInstance.getReleaseByTag(owner, repo, tag);
}

module.exports = {
  getReleaseByTag,
  // other functions...
};
```

## Testing Strategy
1. Unit test in isolation with mocked GitHub client
2. Integration test with test repository
3. Test 404 handling returns `undefined`
4. Verify non-404 errors are re-thrown
5. Compare results with legacy implementation

## Code Examples

### Before (Legacy Implementation)
```javascript
const getReleaseByTag = async (owner, repo, tag) => {
  try {
    const response = await github.rest.repos.getReleaseByTag({
      owner,
      repo,
      tag
    });
    return response.data;
  } catch (error) {
    if (error.status === 404) {
      return undefined;
    }
    throw error;
  }
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
   * Gets a release by its tag name
   * 
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} tag - Release tag
   * @returns {Promise<Object|undefined>} Release data or undefined if not found
   */
  async getReleaseByTag(owner, repo, tag) {
    try {
      const response = await this.github.rest.repos.getReleaseByTag({
        owner,
        repo,
        tag
      });
      this.logger.debug(`Retrieved release for tag: ${tag}`);
      return response.data;
    } catch (error) {
      if (error.status === 404) {
        this.logger.debug(`Release not found for tag: ${tag}`);
        return undefined;
      }
      throw this.errorHandler.handle(error, {
        operation: 'get release by tag',
        context: { owner, repo, tag }
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
  const release = await github.getReleaseByTag('fluxcd', 'charts', 'v1.0.0');
  if (!release) {
    context.core.info('Release not found');
    return;
  }
  context.core.info(`Found release: ${release.name}`);
}
```

## Migration Impact
- No breaking changes due to backward compatibility wrapper
- Enhanced error context and logging
- Consistent with new architecture patterns
- Simplified error handling in calling code

## Success Criteria
- [ ] Function behavior remains identical
- [ ] 404 errors return `undefined`
- [ ] Non-404 errors are properly re-thrown
- [ ] All existing workflows continue to work
- [ ] New implementation has comprehensive tests
- [ ] Documentation is updated
