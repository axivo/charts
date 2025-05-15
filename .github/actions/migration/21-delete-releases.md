# Migration: deleteReleases

## Current Implementation
- Location: [github-api.js - deleteReleases()](https://github.com/fluxcd/charts/blob/main/.github/scripts/github-api.js#L237-L257)
- Purpose: Bulk deletion of GitHub releases by tag pattern
- Dependencies: Octokit REST API client
- Used by: Cleanup workflows, release management

## Code Analysis
The function enables bulk deletion of releases matching specific tag patterns, useful for cleaning up old releases or removing releases created in error.

### Current Logic Flow
1. Fetches releases matching tag pattern
2. Iterates through matched releases
3. Deletes each release individually
4. Reports deletion progress
5. Handles deletion errors gracefully

## Target Architecture
- Target Class: GitHubAPI
- Target Method: deleteReleases
- New Dependencies: Base GitHub API class, Error handler, Logger

## Implementation Steps
1. Create deleteReleases method in GitHubAPI class
2. Implement batch deletion optimization
3. Add dry-run capability
4. Create progress reporting
5. Create backward compatibility wrapper
6. Test with various patterns and scenarios

## Backward Compatibility
```javascript
// github-api.js
const GitHubAPI = require('./.github/actions/services/GitHub');
let githubInstance;

async function deleteReleases(owner, repo, tagPattern) {
  if (!githubInstance) {
    githubInstance = new GitHubAPI({
      core: global.core,
      github: global.github
    });
  }
  return githubInstance.deleteReleases(owner, repo, tagPattern);
}

module.exports = {
  deleteReleases,
  // other functions...
};
```

## Testing Strategy
1. Unit test with mocked deletion calls
2. Test tag pattern matching
3. Test error handling for failed deletions
4. Verify dry-run functionality
5. Test progress reporting

## Code Examples

### Before (Legacy Implementation)
```javascript
const deleteReleases = async (owner, repo, tagPattern) => {
  const releases = await getReleases(owner, repo, tagPattern);
  
  for (const release of releases) {
    try {
      await github.rest.repos.deleteRelease({
        owner,
        repo,
        release_id: release.id
      });
      console.log(`Deleted release: ${release.tag_name}`);
    } catch (error) {
      console.error(`Failed to delete release ${release.tag_name}: ${error.message}`);
    }
  }
  
  return releases.length;
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
   * Deletes releases matching a tag pattern
   * 
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} tagPattern - Tag prefix to match
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Deletion summary
   */
  async deleteReleases(owner, repo, tagPattern, options = {}) {
    try {
      const dryRun = options.dryRun || false;
      this.logger.info(`${dryRun ? '[DRY RUN] ' : ''}Deleting releases with pattern: ${tagPattern}`);
      const releases = await this.getReleases(owner, repo, tagPattern);
      const results = { total: releases.length, deleted: 0, failed: 0 };
      for (const release of releases) {
        try {
          if (!dryRun) {
            await this.github.rest.repos.deleteRelease({
              owner,
              repo,
              release_id: release.id
            });
          }
          this.logger.info(`${dryRun ? '[DRY RUN] Would delete' : 'Deleted'} release: ${release.tag_name}`);
          results.deleted++;
        } catch (error) {
          this.logger.error(`Failed to delete release ${release.tag_name}: ${error.message}`);
          results.failed++;
        }
      }
      this.logger.info(`Deletion complete: ${results.deleted} deleted, ${results.failed} failed`);
      return results;
    } catch (error) {
      throw this.errorHandler.handle(error, {
        operation: 'delete releases',
        context: { owner, repo, tagPattern }
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
  const dryRunResults = await github.deleteReleases('fluxcd', 'charts', 'test-', { dryRun: true });
  context.core.info(`Would delete ${dryRunResults.total} releases`);
  if (dryRunResults.total > 0) {
    const results = await github.deleteReleases('fluxcd', 'charts', 'test-');
    context.core.info(`Deleted ${results.deleted} releases`);
  }
}
```

## Migration Impact
- Added dry-run capability for safety
- Better progress reporting
- Structured result summary
- Consistent with new architecture patterns

## Success Criteria
- [ ] Bulk deletion works correctly
- [ ] Tag pattern matching functions properly
- [ ] Dry-run mode prevents actual deletions
- [ ] Progress reporting is accurate
- [ ] All existing workflows continue to work
- [ ] Documentation is updated
