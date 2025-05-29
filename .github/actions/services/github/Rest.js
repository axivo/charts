/**
 * GitHub REST API service
 * 
 * @class Rest
 * @module services/github/Rest
 * @author AXIVO
 * @license BSD-3-Clause
 */
const fs = require('fs');
const Api = require('./Api');
const GraphQL = require('./GraphQL');

class Rest extends Api {
  /**
   * Creates a new Rest service instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.graphqlService = new GraphQL(params);
  }

  /**
  * Gets all release IDs for a specific chart
  *
  * @param {string} chart - Chart name to filter releases
  * @returns {Promise<Array<Object>>} - Array of release objects
  */
  async #getReleaseIds(chart) {
    try {
      this.logger.info(`Getting release IDs for '${chart}' chart...`);
      const releases = await this.execute('listReleases', async () => {
        return await this.paginate('repos', 'listReleases', {
          owner: this.context.repo.owner,
          repo: this.context.repo.repo
        }, (data, currentResults = []) => {
          const filteredReleases = data.filter(release =>
            release.tag_name.startsWith(`${chart}-`)
          );
          return currentResults.concat(filteredReleases.map(release => ({
            id: release.id,
            tagName: release.tag_name
          })));
        });
      });
      const word = releases.length === 1 ? 'release' : 'releases';
      this.logger.info(`Found ${releases.length} ${word} for '${chart}' chart`);
      return releases;
    } catch (error) {
      this.actionError.handle(error, {
        operation: 'get release IDs',
        fatal: false
      });
      return [];
    }
  }

  /**
  * Creates a label in a repository
  *
  * @param {Object} params - Function parameters
  * @param {string} params.owner - Repository owner
  * @param {string} params.repo - Repository name
  * @param {string} params.name - Label name
  * @param {string} params.color - Label color (hex without #)
  * @param {string} params.description - Label description
  * @returns {Promise<Object>} - Created label
  */
  async createLabel({ owner, repo, name, color, description }) {
    const response = await this.execute('createLabel', async () => {
      return await this.github.rest.issues.createLabel({
        owner,
        repo,
        name,
        color,
        description
      });
    });
    this.logger.info(`Successfully created '${name}' label`);
    return {
      id: response.data.id,
      name: response.data.name,
      color: response.data.color,
      description: response.data.description
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
    const response = await this.execute('createRelease', async () => {
      return await this.github.rest.repos.createRelease({
        owner,
        repo,
        tag_name: tag,
        name,
        body,
        draft,
        prerelease
      });
    });
    this.logger.info(`Successfully created '${response.data.name}' release`);
    return {
      id: response.data.id,
      htmlUrl: response.data.html_url,
      uploadUrl: response.data.upload_url,
      tagName: response.data.tag_name,
      name: response.data.name
    };
  }

  /**
  * Deletes OCI package from GitHub Container Registry
  * 
  * @param {Object} params - Function parameters
  * @param {string} params.owner - Repository owner
  * @param {string} params.repo - Repository name
  * @param {Object} params.chart - Chart object
  * @param {string} params.chart.name - Chart name
  * @param {string} params.chart.type - Chart type (application/library)
   * @returns {Promise<boolean>} - True if deletion succeeded
   */
  async deleteOciPackage({ owner, repo, chart }) {
    const chartName = `${chart.type}/${chart.name}`;
    try {
      this.logger.info(`Deleting OCI package for '${chartName}' chart...`);
      const ownerType = await this.graphqlService.getRepositoryType(owner);
      const packageName = `${repo}/${chartName}`;
      const ownerParam = ownerType === 'organization' ? { org: owner } : { username: owner };
      const methodName = ownerType === 'organization' ? 'deletePackageForOrg' : 'deletePackageForUser';
      await this.execute('deleteOciPackage', async () => {
        return await this.github.rest.packages[methodName]({
          package_type: 'container',
          package_name: packageName,
          ...ownerParam
        });
      });
      this.logger.info(`Successfully deleted '${packageName}' OCI package`);
      return true;
    } catch (error) {
      if (error.status === 404) {
        this.logger.info(`OCI package not found for '${chartName}' chart`);
        return false;
      }
      this.actionError.handle(error, {
        operation: `delete OCI package for '${chartName}' chart`,
        fatal: false
      });
      return false;
    }
  }

  /**
   * Deletes all releases for a specific chart
   *
   * @param {string} chart - Chart name to delete releases for
   * @returns {Promise<number>} - Count of deleted releases
   */
  async deleteReleases(chart) {
    try {
      this.logger.info(`Deleting releases for ${chart} chart...`);
      const releases = await this.#getReleaseIds(chart);
      let deletedCount = 0;
      for (const release of releases) {
        try {
          await this.execute('deleteRelease', async () => {
            return await this.github.rest.repos.deleteRelease({
              owner: this.context.repo.owner,
              repo: this.context.repo.repo,
              release_id: release.id
            });
          });
          await this.execute('deleteRef', async () => {
            return await this.github.rest.git.deleteRef({
              owner: this.context.repo.owner,
              repo: this.context.repo.repo,
              ref: `tags/${release.tagName}`
            });
          });
          deletedCount++;
        } catch (error) {
          this.actionError.handle(error, {
            operation: `delete '${release.tagName}' release`,
            fatal: false
          });
        }
      }
      const word = deletedCount === 1 ? 'release' : 'releases';
      this.logger.info(`Successfully deleted ${deletedCount} ${word} for ${chart} chart`);
      return deletedCount;
    } catch (error) {
      this.actionError.handle(error, {
        operation: 'delete releases',
        fatal: true
      });
    }
  }

  /**
  * Gets a label from a repository
  *
  * @param {Object} params - Function parameters
  * @param {string} params.owner - Repository owner
  * @param {string} params.repo - Repository name
  * @param {string} params.name - Label name
  * @returns {Promise<Object|null>} - Label or null if not found
  */
  async getLabel({ owner, repo, name }) {
    const response = await this.execute('getLabel', async () => {
      return await this.github.rest.issues.getLabel({
        owner,
        repo,
        name
      });
    }, false);
    if (!response) {
      this.logger.info(`Label '${name}' not found`);
      return null;
    }
    return {
      id: response.data.id,
      name: response.data.name,
      color: response.data.color,
      description: response.data.description
    };
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
    const response = await this.execute('getReleaseByTag', async () => {
      return await this.github.rest.repos.getReleaseByTag({
        owner,
        repo,
        tag
      });
    }, false);
    if (!response) {
      this.logger.info(`Release with '${tag}' tag not found`);
      return null;
    }
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
  }

  /**
   * Gets updated files in a repository based on event type
   * 
   * @param {Object} params - Function parameters
   * @param {Object} params.context - GitHub Actions context
   * @returns {Promise<Object>} - Map of files to their statuses
   */
  async getUpdatedFiles({ context }) {
    const fileMap = {};
    try {
      const result = this.validateContextPayload(context);
      if (!result.valid) return fileMap;
      const eventName = result.eventName;
      switch (eventName) {
        case 'pull_request':
          return await this.paginate('pulls', 'listFiles', {
            owner: context.repo.owner,
            repo: context.repo.repo,
            pull_number: context.payload.pull_request.number
          }, (data, currentMap = {}) => {
            const updatedMap = { ...currentMap };
            data.forEach(file => { updatedMap[file.filename] = file.status; });
            return updatedMap;
          });
        case 'workflow_dispatch':
          return fileMap;
        default:
          const response = await this.execute('compareCommits', async () => {
            return await this.github.rest.repos.compareCommits({
              owner: context.repo.owner,
              repo: context.repo.repo,
              base: context.payload.before,
              head: context.payload.after
            });
          });
          response.data.files.forEach(file => { fileMap[file.filename] = file.status; });
          this.logger.info(`Found ${Object.keys(fileMap).length} files in ${eventName} event`);
          return fileMap;
      }
    } catch (error) {
      this.actionError.handle(error, {
        operation: 'get updated files',
        fatal: false
      });
      return fileMap;
    }
  }

  /**
   * Gets workflow run data
   * 
   * @param {Object} params - Function parameters
   * @param {string} params.owner - Repository owner
   * @param {string} params.repo - Repository name
   * @param {number} params.runId - Workflow run ID
   * @returns {Promise<Object>} - Workflow run data
   */
  async getWorkflowRun({ owner, repo, runId }) {
    const response = await this.execute('getWorkflowRun', async () => {
      return await this.github.rest.actions.getWorkflowRun({
        owner,
        repo,
        run_id: runId
      });
    });
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
   * Paginates through REST API results
   * 
   * @param {string} namespace - REST API namespace (e.g., 'repos', 'pulls')
   * @param {string} method - REST API method name (e.g., 'listFiles')
   * @param {Object} params - Method parameters
   * @param {Function} resultProcessor - Function to process each page of results
   * @param {number} size - Number of items per page
   * @returns {Promise<Object>} - Aggregated results
   */
  async paginate(namespace, method, params, resultProcessor, size = 100) {
    let results = {};
    let page = 1;
    let hasMorePages = true;
    while (hasMorePages) {
      const response = await this.execute(`paginate`, async () => {
        return await this.github.rest[namespace][method]({
          ...params,
          per_page: size,
          page
        });
      });
      const processedResults = resultProcessor(response.data, results);
      results = processedResults || results;
      hasMorePages = response.data.length === size;
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
    const data = fs.readFileSync(assetPath);
    const response = await this.execute('uploadReleaseAsset', async () => {
      return await this.github.rest.repos.uploadReleaseAsset({
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
    });
    return {
      id: response.data.id,
      name: response.data.name,
      url: response.data.browser_download_url,
      size: response.data.size
    };
  }

  /**
   * Validates context payload for specific event types
   * 
   * @param {Object} context - GitHub Actions context
   * @returns {Object} - Validation result with valid flag and reason
   */
  validateContextPayload(context) {
    const eventName = context.eventName || 'push';
    switch (eventName) {
      case 'pull_request':
        if (!context.payload.pull_request || !context.payload.pull_request.number) {
          this.logger.warning('Pull request data missing from context');
          return { valid: false, reason: 'missing_pull_request_data' };
        }
        break;
      case 'workflow_dispatch':
        break;
      default:
        if (!context.payload.before || !context.payload.after) {
          this.logger.warning('Commit data missing from context');
          return { valid: false, reason: 'missing_commit_data' };
        }
    }
    return { valid: true, eventName };
  }
}

module.exports = Rest;
