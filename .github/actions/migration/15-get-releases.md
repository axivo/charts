# Migration: getReleases

## Current Implementation
- Location: [github-api.js - getReleases()](https://github.com/fluxcd/charts/blob/main/.github/scripts/github-api.js#L119-L131)
- Purpose: Fetches multiple GitHub releases with optional filtering by tag prefix
- Dependencies: Octokit REST API client
- Used by: Release listing, cleanup operations, statistics

## Code Analysis
The function retrieves releases from a repository with support for pagination and optional tag filtering. It returns an array of releases that match the specified criteria.

### Current Logic Flow
1. Calls GitHub API to list releases
2. Applies optional tag prefix filtering
3. Handles pagination automatically via Octokit
4. Returns filtered release array

## Target Architecture
- Target Class: GitHubAPI
- Target Method: getReleases
- New Dependencies: Base GitHub API class, Error handler, Logger

## Implementation Steps
1. Create getReleases method in GitHubAPI class
2. Implement tag filtering logic
3. Add comprehensive logging
4. Create backward compatibility wrapper
5. Test with various tag patterns
6. Update calling code to use new API

## Backward Compatibility
```javascript
// github-api.js
const GitHubAPI = require('./.github/actions/services/GitHub');
let githubInstance;

async function getReleases(owner, repo, tagStartsWith = null) {
  if (!githubInstance) {
    githubInstance = new GitHubAPI({
      core: global.core,
      github: global.github
    });
  }
  return githubInstance.getReleases(owner, repo, tagStartsWith);
}

module.exports = {
  getReleases,
  // other functions...
};
```

## Testing Strategy
1. Unit test with mocked GitHub client
2. Test pagination handling
3. Test tag prefix filtering
4. Verify empty results handling
5. Integration test with real repository

## Code Examples

### Before (Legacy Implementation)
```javascript
const getReleases = async (owner, repo, tagStartsWith = null) => {
  const releases = await github.paginate(github.rest.repos.listReleases, {
    owner,
    repo
  });
  
  if (tagStartsWith) {
    return releases.filter(release => release.tag_name.startsWith(tagStartsWith));
  }
  
  return releases;
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
   * Gets releases from a repository with optional tag filtering
   * 
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string|null} tagStartsWith - Optional tag prefix filter
   * @returns {Promise<Array>} Array of releases
   */
  async getReleases(owner, repo, tagStartsWith = null) {
    try {
      this.logger.debug(`Fetching releases for ${owner}/${repo}`);
      const releases = await this.github.paginate(this.github.rest.repos.listReleases, {
        owner,
        repo
      });
      if (tagStartsWith) {
        const filtered = releases.filter(release => release.tag_name.startsWith(tagStartsWith));
        this.logger.debug(`Filtered ${filtered.length} releases with prefix: ${tagStartsWith}`);
        return filtered;
      }
      this.logger.debug(`Retrieved ${releases.length} releases`);
      return releases;
    } catch (error) {
      throw this.errorHandler.handle(error, {
        operation: 'get releases',
        context: { owner, repo, tagStartsWith }
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
  const allReleases = await github.getReleases('fluxcd', 'charts');
  context.core.info(`Found ${allReleases.length} total releases`);
  const helmReleases = await github.getReleases('fluxcd', 'charts', 'helm-');
  context.core.info(`Found ${helmReleases.length} Helm releases`);
}
```

## Migration Impact
- No breaking changes due to backward compatibility wrapper
- Enhanced error context and logging
- Consistent with new architecture patterns
- Improved debugging capabilities

## Success Criteria
- [ ] Function behavior remains identical
- [ ] Tag filtering works correctly
- [ ] Pagination is handled properly
- [ ] All existing workflows continue to work
- [ ] New implementation has comprehensive tests
- [ ] Documentation is updated
