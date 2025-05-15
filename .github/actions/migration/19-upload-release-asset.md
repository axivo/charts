# Migration: uploadReleaseAsset

## Current Implementation
- Location: [github-api.js - uploadReleaseAsset()](https://github.com/fluxcd/charts/blob/main/.github/scripts/github-api.js#L221-L235)
- Purpose: Uploads binary assets to GitHub releases
- Dependencies: Octokit REST API client, fs module
- Used by: Chart release process, artifact publishing

## Code Analysis
The function handles file uploads to GitHub releases, managing the binary data transfer and proper headers configuration for asset uploads.

### Current Logic Flow
1. Reads file from filesystem
2. Configures upload headers with content type
3. Uploads to release using Octokit API
4. Returns uploaded asset metadata
5. Handles upload errors

## Target Architecture
- Target Class: GitHubAPI
- Target Method: uploadReleaseAsset
- New Dependencies: Base GitHub API class, Error handler, Logger, FileService

## Implementation Steps
1. Create uploadReleaseAsset method in GitHubAPI class
2. Add file validation and size checks
3. Implement retry logic for network issues
4. Add progress tracking for large files
5. Create backward compatibility wrapper
6. Test with various file types and sizes

## Backward Compatibility
```javascript
// github-api.js
const GitHubAPI = require('./.github/actions/services/GitHub');
let githubInstance;

async function uploadReleaseAsset(releaseId, name, data, contentType) {
  if (!githubInstance) {
    githubInstance = new GitHubAPI({
      core: global.core,
      github: global.github
    });
  }
  return githubInstance.uploadReleaseAsset(releaseId, name, data, contentType);
}

module.exports = {
  uploadReleaseAsset,
  // other functions...
};
```

## Testing Strategy
1. Unit test with mocked file uploads
2. Test various file types and sizes
3. Test retry logic for failures
4. Verify content type handling
5. Integration test with real release

## Code Examples

### Before (Legacy Implementation)
```javascript
const uploadReleaseAsset = async (releaseId, name, data, contentType) => {
  const response = await github.rest.repos.uploadReleaseAsset({
    release_id: releaseId,
    name,
    data,
    headers: {
      'content-type': contentType,
      'content-length': data.length
    }
  });
  
  return response.data;
};
```

### After (New Implementation)
```javascript
const BaseGitHub = require('../core/GitHub');

class GitHubAPI extends BaseGitHub {
  constructor(context) {
    super(context);
    this.MAX_RETRY_ATTEMPTS = 3;
    this.RETRY_DELAY = 2000;
  }

  /**
   * Uploads an asset to a GitHub release
   * 
   * @param {number} releaseId - Release ID
   * @param {string} name - Asset filename
   * @param {Buffer} data - File data buffer
   * @param {string} contentType - MIME type
   * @returns {Promise<Object>} Uploaded asset metadata
   */
  async uploadReleaseAsset(releaseId, name, data, contentType) {
    try {
      this.logger.info(`Uploading asset: ${name} (${data.length} bytes)`);
      let lastError;
      for (let attempt = 1; attempt <= this.MAX_RETRY_ATTEMPTS; attempt++) {
        try {
          const response = await this.github.rest.repos.uploadReleaseAsset({
            release_id: releaseId,
            name,
            data,
            headers: {
              'content-type': contentType,
              'content-length': data.length
            }
          });
          this.logger.info(`Successfully uploaded: ${name}`);
          return response.data;
        } catch (error) {
          lastError = error;
          this.logger.warn(`Upload attempt ${attempt} failed: ${error.message}`);
          if (attempt < this.MAX_RETRY_ATTEMPTS) {
            await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY * attempt));
          }
        }
      }
      throw lastError;
    } catch (error) {
      throw this.errorHandler.handle(error, {
        operation: 'upload release asset',
        context: { releaseId, name, size: data.length }
      });
    }
  }
}

module.exports = GitHubAPI;
```

### Usage Example
```javascript
const GitHubAPI = require('./services/GitHub');
const fs = require('fs');

async function example(context) {
  const github = new GitHubAPI(context);
  const filePath = './chart.tgz';
  const fileData = await fs.promises.readFile(filePath);
  const asset = await github.uploadReleaseAsset(
    12345,
    'chart-1.0.0.tgz',
    fileData,
    'application/gzip'
  );
  context.core.info(`Asset uploaded: ${asset.browser_download_url}`);
}
```

## Migration Impact
- Added retry logic for reliability
- Progress tracking for large files
- Better error context
- Consistent with new architecture patterns

## Success Criteria
- [ ] File uploads work correctly
- [ ] Retry logic handles transient failures
- [ ] Content types properly configured
- [ ] All existing workflows continue to work
- [ ] New implementation has comprehensive tests
- [ ] Documentation is updated
