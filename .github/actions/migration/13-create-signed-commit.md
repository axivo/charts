# Migration: createSignedCommit

## Current Implementation

- **Location**: `.github/scripts/github-api.js - createSignedCommit()`
- **Purpose**: Creates a verified commit using GitHub's GraphQL API
- **Dependencies**: 
  - `utils.handleError()` for error handling
  - GitHub GraphQL API
- **Used by**: `_performGitCommit()` in chart.js for committing automated changes

## Code Analysis

```javascript
async function createSignedCommit({ github, context, core, git }) {
  try {
    core.info('Creating signed commit...');
    if (!git.branchName) {
      throw new Error('branchName is required');
    }
    if (!git.expectedHeadOid) {
      throw new Error('expectedHeadOid is required');
    }
    if (!git.commitMessage) {
      throw new Error('commitMessage is required');
    }
    if (!(git.additions.length + git.deletions.length)) {
      core.info('No changes to commit');
      return null;
    }
    const input = {
      branch: {
        repositoryNameWithOwner: context.payload.repository.full_name,
        branchName: git.branchName
      },
      expectedHeadOid: git.expectedHeadOid,
      fileChanges: {
        additions: git.additions,
        deletions: git.deletions
      },
      message: { headline: git.commitMessage }
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
    core.info(`Successfully created signed commit with '${commitOid}' OID`);
    return commitOid;
  } catch (error) {
    utils.handleError(error, core, 'create signed commit');
    return null;
  }
}
```

The function:
1. Validates required parameters (branchName, expectedHeadOid, commitMessage)
2. Returns null if no files to commit
3. Creates a GraphQL mutation input structure
4. Executes the mutation to create a signed commit
5. Returns the commit OID (SHA) on success, null on failure
6. Handles errors as fatal (throws)

## Target Architecture

- **Target Class**: `GitHub` (in `/core/GitHub.js`)
- **Target Method**: `createSignedCommit()`
- **New Dependencies**: 
  - Error class for error handling
  - GraphQL mutation execution

## Implementation Steps

1. Add the `createSignedCommit()` method to the `GitHub` class
2. Implement validation and GraphQL mutation logic
3. Maintain error handling behavior
4. Create backward compatibility adapter
5. Test with commit workflows
6. Update calling code in chart.js
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
   * Create a signed commit using GitHub's GraphQL API
   * @param {Object} git - Git commit parameters
   * @param {string} git.branchName - Branch name to commit to
   * @param {string} git.expectedHeadOid - Expected HEAD SHA for validation
   * @param {Array<Object>} git.additions - Files to add/modify [{path, contents}]
   * @param {Array<Object>} git.deletions - Files to delete [{path}]
   * @param {string} git.commitMessage - Commit message headline
   * @returns {Promise<string|null>} Commit OID or null if no changes
   */
  async createSignedCommit(git) {
    try {
      this.logger.info('Creating signed commit...');
      if (!git.branchName) {
        throw new Error('branchName is required');
      }
      if (!git.expectedHeadOid) {
        throw new Error('expectedHeadOid is required');
      }
      if (!git.commitMessage) {
        throw new Error('commitMessage is required');
      }
      if (!(git.additions.length + git.deletions.length)) {
        this.logger.info('No changes to commit');
        return null;
      }
      const input = {
        branch: {
          repositoryNameWithOwner: this.context.payload.repository.full_name,
          branchName: git.branchName
        },
        expectedHeadOid: git.expectedHeadOid,
        fileChanges: {
          additions: git.additions,
          deletions: git.deletions
        },
        message: { headline: git.commitMessage }
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
      const { createCommitOnBranch } = await this.github.graphql(mutation, { input });
      const commitOid = createCommitOnBranch.commit.oid;
      this.logger.info(`Successfully created signed commit with '${commitOid}' OID`);
      return commitOid;
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'create signed commit',
        fatal: true
      });
      return null;
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

async function createSignedCommit({ github, context, core, git }) {
  if (!githubInstance) {
    githubInstance = new GitHub({ github, context, core });
  }
  return githubInstance.createSignedCommit(git);
}

module.exports = {
  createSignedCommit,
  // ... other functions
};
```

## Testing Strategy

1. Create unit tests for the `GitHub.createSignedCommit()` method
2. Test parameter validation (required fields)
3. Test with no changes (returns null)
4. Test successful commit creation
5. Test GraphQL mutation structure
6. Test error handling (fatal)
7. Mock GraphQL responses
8. Run integration tests with mock commits

## Migration Validation

1. Verify parameter validation works correctly
2. Verify null return when no changes
3. Verify GraphQL mutation is constructed properly
4. Verify commit OID is returned on success
5. Verify error handling is fatal (throws)
6. Verify logging messages are preserved
7. Verify null return on error

## Considerations

- The function uses GraphQL instead of REST API for verified commits
- Parameter validation is critical for preventing API errors
- The git parameter structure must be preserved for compatibility
- Returns null for both no changes and errors
- Error handling is fatal which is consistent with other mutation operations
- Used in automated workflow commits so reliability is important
