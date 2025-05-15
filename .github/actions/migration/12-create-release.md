# Migration: createRelease

## Current Implementation

- **Location**: `.github/scripts/github-api.js - createRelease()`
- **Purpose**: Creates a new GitHub release via the REST API
- **Dependencies**: 
  - `utils.handleError()` for error handling
- **Used by**: `_buildChartRelease()` in release.js for creating chart releases

## Code Analysis

```javascript
async function createRelease({ github, context, core, name, body, draft = false, prerelease = false }) {
  let releaseData = {};
  try {
    core.info(`Creating '${name}' repository release...`);
    const response = await github.rest.repos.createRelease({
      owner: context.repo.owner,
      repo: context.repo.repo,
      name: name,
      tag_name: name,
      body: body,
      draft: draft,
      prerelease: prerelease
    });
    const release = response.data;
    const releaseData = {
      id: release.id,
      name: release.name,
      tag_name: release.name,
      body: release.body,
      created_at: release.created_at,
      draft: release.draft,
      prerelease: release.prerelease,
      html_url: release.html_url
    };
    core.info(`Successfully created '${name}' repository release with ${releaseData.id} ID`);
    return releaseData;
  } catch (error) {
    utils.handleError(error, core, 'create repository release');
    return releaseData;
  }
}
```

The function:
1. Creates a GitHub release using the REST API
2. Standardizes the response data structure
3. Returns release data even on failure (empty object)
4. Uses the same value for both `name` and `tag_name`
5. Handles errors as fatal (throws)

## Target Architecture

- **Target Class**: `GitHub` (in `/core/GitHub.js`)
- **Target Method**: `createRelease()`
- **New Dependencies**: 
  - Error class for error handling
  - Base API wrapper class functionality

## Implementation Steps

1. Add the `createRelease()` method to the `GitHub` class
2. Implement the same logic using the new architecture
3. Maintain the same return structure
4. Create backward compatibility adapter
5. Test with release creation workflows
6. Update calling code in release.js
7. Remove legacy function

## New Implementation

```javascript
// core/GitHub.js
const API = require('./API');

class GitHub extends API {
  constructor(context) {
    super(context);
    this.github = context.github;
    this.context = context.context;
  }

  /**
   * Create a new GitHub release
   * @param {Object} params - Release parameters
   * @param {string} params.name - Tag name for the release
   * @param {string} params.body - Release description in markdown
   * @param {boolean} [params.draft=false] - Whether to create as draft
   * @param {boolean} [params.prerelease=false] - Whether to mark as prerelease
   * @returns {Promise<Object>} Standardized release data
   */
  async createRelease({ name, body, draft = false, prerelease = false }) {
    let releaseData = {};
    try {
      this.logger.info(`Creating '${name}' repository release...`);
      const response = await this.github.rest.repos.createRelease({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        name: name,
        tag_name: name,
        body: body,
        draft: draft,
        prerelease: prerelease
      });
      const release = response.data;
      releaseData = {
        id: release.id,
        name: release.name,
        tag_name: release.name,
        body: release.body,
        created_at: release.created_at,
        draft: release.draft,
        prerelease: release.prerelease,
        html_url: release.html_url
      };
      this.logger.info(`Successfully created '${name}' repository release with ${releaseData.id} ID`);
      return releaseData;
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'create repository release',
        fatal: true
      });
      return releaseData;
    }
  }
}

module.exports = GitHub;
```

## Backward Compatibility

```javascript
// github-api.js (during migration)
const GitHub = require('./.github/actions/core/GitHub');
let githubInstance;

async function createRelease({ github, context, core, name, body, draft = false, prerelease = false }) {
  if (!githubInstance) {
    githubInstance = new GitHub({ github, context, core });
  }
  return githubInstance.createRelease({ name, body, draft, prerelease });
}

module.exports = {
  createRelease,
  // ... other functions
};
```

## Testing Strategy

1. Create unit tests for the `GitHub.createRelease()` method
2. Test successful release creation
3. Test standardized data structure returned
4. Test draft and prerelease flags
5. Test error handling (fatal)
6. Mock GitHub API responses
7. Test that empty releaseData is returned on error
8. Run integration tests with mock releases

## Migration Validation

1. Verify release is created with correct parameters
2. Verify name and tag_name use the same value
3. Verify standardized data structure matches original
4. Verify draft and prerelease flags work correctly
5. Verify error handling is fatal (throws)
6. Verify logging messages are preserved
7. Verify empty object returned on error

## Considerations

- The function uses the same value for `name` and `tag_name`
- Error handling is fatal (throws) which differs from some other API functions
- The standardized data structure must be preserved for compatibility
- The function returns an empty object on error rather than null
- Used in chart release workflows so stability is critical
