/**
 * GitHub REST API service
 * 
 * @class Rest
 * @module services/github/Rest
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Api = require('./Api');
const { GitHubApiError } = require('../../utils/errors');

class Rest extends Api {
  /**
   * Checks the status of a workflow run
   * 
   * @param {Object} params - Function parameters
   * @param {string} params.owner - Repository owner
   * @param {string} params.repo - Repository name
   * @param {number} params.runId - Workflow run ID
   * @returns {Promise<Object>} - Workflow run status
   */
  async checkWorkflowRunStatus({ owner, repo, runId }) {
    const response = await this.execute('getWorkflowRun', 'actions', 'getWorkflowRun', {
      owner,
      repo,
      run_id: runId
    });
    this.logger.info(`Workflow run status: ${response.data.status}, conclusion: ${response.data.conclusion}`);
    return {
      id: response.data.id,
      status: response.data.status,
      conclusion: response.data.conclusion,
      url: response.data.html_url,
      createdAt: response.data.created_at,
      updatedAt: response.data.updated_at
    };
  }

  /**
   * Creates a GitHub release
   * 
   * @param {Object} params - Function parameters
   * @param {string} params.owner - Repository owner
   * @param {string} params.repo - Repository name
   * @param {string} params.tag - Release tag
   * @param {string} params.name - Release name
   * @param {string} params.body - Release body
   * @param {boolean} params.draft - Whether the release is a draft
   * @param {boolean} params.prerelease - Whether the release is a prerelease
   * @returns {Promise<Object>} - Created release
   */
  async createRelease({ owner, repo, tag, name, body, draft = false, prerelease = false }) {
    const response = await this.execute('createRelease', 'repos', 'createRelease', {
      owner,
      repo,
      tag_name: tag,
      name,
      body,
      draft,
      prerelease
    });
    this.logger.info(`Created release: ${response.data.name} (${response.data.tag_name})`);
    return {
      id: response.data.id,
      htmlUrl: response.data.html_url,
      uploadUrl: response.data.upload_url,
      tagName: response.data.tag_name,
      name: response.data.name
    };
  }

  /**
   * Executes a REST API call with error handling
   * 
   * @param {string} operationName - Name of the operation (for error reporting)
   * @param {string} namespace - REST API namespace (e.g., 'repos', 'actions')
   * @param {string} method - REST API method name (e.g., 'getWorkflowRun', 'createRelease')
   * @param {Object} params - Method parameters
   * @returns {Promise<Object>} - API response
   */
  async execute(operationName, namespace, method, params) {
    try {
      return await this.github.rest[namespace][method](params);
    } catch (error) {
      throw new GitHubApiError(operationName, error);
    }
  }

  /**
   * Gets a release by tag
   * 
   * @param {Object} params - Function parameters
   * @param {string} params.owner - Repository owner
   * @param {string} params.repo - Repository name
   * @param {string} params.tag - Release tag
   * @returns {Promise<Object|null>} - Release or null if not found
   */
  async getReleaseByTag({ owner, repo, tag }) {
    try {
      const response = await this.execute('getReleaseByTag', 'repos', 'getReleaseByTag', {
        owner,
        repo,
        tag
      });
      this.logger.info(`Found release for tag: ${tag}`);
      return {
        id: response.data.id,
        htmlUrl: response.data.html_url,
        uploadUrl: response.data.upload_url,
        tagName: response.data.tag_name,
        name: response.data.name,
        body: response.data.body,
        createdAt: response.data.created_at,
        draft: response.data.draft,
        prerelease: response.data.prerelease
      };
    } catch (error) {
      if (error.status === 404) {
        this.logger.info(`No release found for tag: ${tag}`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Gets updated files in a pull request
   * 
   * @param {Object} params - Function parameters
   * @param {string} params.owner - Repository owner
   * @param {string} params.repo - Repository name
   * @param {number} params.pullNumber - Pull request number
   * @returns {Promise<Object>} - Map of files to their statuses
   */
  async getUpdatedFiles({ owner, repo, pullNumber }) {
    const fileMap = await this.paginate('pulls', 'listFiles', {
      owner,
      repo,
      pull_number: pullNumber
    }, (data, currentMap = {}) => {
      const updatedMap = { ...currentMap };
      data.forEach(file => {
        updatedMap[file.filename] = file.status;
      });
      return updatedMap;
    });
    this.logger.info(`Found ${Object.keys(fileMap).length} files in pull request #${pullNumber}`);
    return fileMap;
  }

  /**
   * Paginates through REST API results
   * 
   * @param {string} namespace - REST API namespace (e.g., 'repos', 'pulls')
   * @param {string} method - REST API method name (e.g., 'listFiles')
   * @param {Object} params - Method parameters
   * @param {Function} resultProcessor - Function to process each page of results
   * @param {number} pageSize - Number of items per page
   * @returns {Promise<Object>} - Aggregated results
   */
  async paginate(namespace, method, params, resultProcessor, pageSize = 100) {
    let results = {};
    let page = 1;
    let hasMorePages = true;
    while (hasMorePages) {
      const response = await this.execute(`paginate:${namespace}.${method}`, namespace, method, {
        ...params,
        per_page: pageSize,
        page
      });
      const processedResults = resultProcessor(response.data, results);
      results = processedResults || results;
      hasMorePages = response.data.length === pageSize;
      page++;
    }
    return results;
  }

  /**
   * Uploads an asset to a release
   * 
   * @param {Object} params - Function parameters
   * @param {string} params.owner - Repository owner
   * @param {string} params.repo - Repository name
   * @param {number} params.releaseId - Release ID
   * @param {string} params.assetPath - Path to asset file
   * @param {string} params.assetName - Asset name
   * @param {string} params.contentType - Asset content type
   * @returns {Promise<Object>} - Uploaded asset
   */
  async uploadReleaseAsset({ owner, repo, releaseId, assetPath, assetName, contentType }) {
    const fs = require('fs');
    const data = fs.readFileSync(assetPath);
    const response = await this.execute('uploadReleaseAsset', 'repos', 'uploadReleaseAsset', {
      owner,
      repo,
      release_id: releaseId,
      name: assetName,
      data,
      headers: {
        'content-type': contentType || 'application/octet-stream',
        'content-length': data.length
      }
    });
    this.logger.info(`Uploaded asset: ${assetName} to release ${releaseId}`);
    return {
      id: response.data.id,
      name: response.data.name,
      url: response.data.browser_download_url,
      size: response.data.size
    };
  }
}

module.exports = Rest;
