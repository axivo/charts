# Migration: deleteOciPackage

## Current Implementation

- **Location**: `.github/scripts/github-api.js - deleteOciPackage()`
- **Purpose**: Deletes a package from GitHub Container Registry (GHCR)
- **Dependencies**: 
  - `_getRepositoryType()` private helper function
  - `utils.handleError()` for error handling
- **Used by**: `_publishOciReleases()` in release.js for removing old OCI packages

## Code Analysis

```javascript
async function deleteOciPackage({ github, context, core, package }) {
  const packageName = [context.repo.repo, package.type, package.name].join('/');
  try {
    core.info(`Deleting '${packageName}' OCI package...`);
    const repoType = await _getRepositoryType({ github, core, owner: context.repo.owner });
    const isOrg = repoType === 'organization';
    await github.rest.packages[isOrg
      ? 'deletePackageForOrg'
      : 'deletePackageForUser'
    ]({
      [isOrg ? 'org' : 'username']: context.repo.owner,
      package_name: packageName,
      package_type: 'container'
    });
    core.info(`Successfully deleted '${packageName}' OCI package`);
    return true;
  } catch (error) {
    utils.handleError(error, core, `delete '${packageName}' OCI package`, false);
    return false;
  }
}
```

The function:
1. Constructs the full package name from repo name, chart type, and chart name
2. Determines if the repository owner is an organization or user
3. Uses the appropriate GitHub API endpoint to delete the package
4. Returns true on success, false on failure
5. Handles errors as non-fatal

## Target Architecture

- **Target Class**: `GitHub` (in `/core/GitHub.js`)
- **Target Method**: `deleteOciPackage()`
- **New Dependencies**: 
  - Error class for error handling
  - Base API wrapper class functionality

## Implementation Steps

1. Add the `deleteOciPackage()` method to the `GitHub` class
2. Add the `getRepositoryType()` helper method
3. Implement the same logic using the new architecture
4. Create backward compatibility adapter
5. Test with OCI registry operations
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
   * Delete a package from GitHub Container Registry
   * @param {Object} package - Package information
   * @param {string} package.name - Name of the package
   * @param {string} package.type - Type of package ('application' or 'library')
   * @returns {Promise<boolean>} True if successful, false otherwise
   */
  async deleteOciPackage(package) {
    const packageName = [this.context.repo.repo, package.type, package.name].join('/');
    try {
      this.logger.info(`Deleting '${packageName}' OCI package...`);
      const repoType = await this.getRepositoryType(this.context.repo.owner);
      const isOrg = repoType === 'organization';
      await this.github.rest.packages[isOrg
        ? 'deletePackageForOrg'
        : 'deletePackageForUser'
      ]({
        [isOrg ? 'org' : 'username']: this.context.repo.owner,
        package_name: packageName,
        package_type: 'container'
      });
      this.logger.info(`Successfully deleted '${packageName}' OCI package`);
      return true;
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: `delete '${packageName}' OCI package`,
        fatal: false
      });
      return false;
    }
  }

  /**
   * Get repository owner type
   * @param {string} owner - Repository owner name
   * @returns {Promise<string>} Owner type ('user' or 'organization')
   */
  async getRepositoryType(owner) {
    const query = `
      query($owner: String!) {
        repositoryOwner(login: $owner) {
          __typename
        }
      }
    `;
    try {
      const response = await this.github.graphql(query, { owner });
      return response.repositoryOwner.__typename.toLowerCase();
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'determine repository type',
        fatal: false
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

async function deleteOciPackage({ github, context, core, package }) {
  if (!githubInstance) {
    githubInstance = new GitHub({ github, context, core });
  }
  return githubInstance.deleteOciPackage(package);
}

module.exports = {
  deleteOciPackage,
  // ... other functions
};
```

## Testing Strategy

1. Create unit tests for the `GitHub.deleteOciPackage()` method
2. Test organization vs user repository detection
3. Test successful package deletion
4. Test error handling (non-fatal)
5. Mock GitHub API responses
6. Test with different package types (application/library)
7. Run integration tests with mock OCI registry

## Migration Validation

1. Verify package name is constructed correctly
2. Verify repository type detection works
3. Verify correct API endpoint is called for org vs user
4. Verify successful deletion returns true
5. Verify failed deletion returns false (non-fatal)
6. Verify logging messages are preserved

## Considerations

- The function depends on repository type detection which needs to be migrated as well
- The API endpoints differ between organization and user accounts
- Error handling remains non-fatal as in the original
- The package parameter structure must be preserved for compatibility
- The function is used in OCI release workflows
