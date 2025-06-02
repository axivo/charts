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
  * @param {Object} context - GitHub Actions context
  * @param {string} chart - Chart name to filter releases
  * @returns {Promise<Array<Object>>} - Array of release objects
  */
  async #getReleaseIds(context, chart) {
    let result = [];
    try {
      this.logger.info(`Getting release IDs for '${chart}' chart...`);
      result = await this.execute('listReleases', async () => {
        return await this.paginate('repos', 'listReleases', {
          owner: context.repo.owner,
          repo: context.repo.repo
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
      const word = result.length === 1 ? 'release' : 'releases';
      this.logger.info(`Found ${result.length} ${word} for '${chart}' chart`);
      return result;
    } catch (error) {
      this.actionError.report({
        operation: 'get release IDs',
        fatal: false
      }, error);
      return result;
    }
  }

  /**
  * Creates a label in a repository
  *
  * @param {Object} params - Function parameters
  * @param {Object} params.context - GitHub Actions context
  * @param {Object} params.label - Label configuration
  * @param {string} params.label.name - Label name
  * @param {string} params.label.color - Label color (hex without #)
  * @param {string} params.label.description - Label description
  * @returns {Promise<Object>} - Created label
  */
  async createLabel({ context, label }) {
    let result = {};
    const { name, color, description } = label;
    try {
      const response = await this.execute('createLabel', async () => {
        return await this.github.rest.issues.createLabel({
          owner: context.repo.owner,
          repo: context.repo.repo,
          name,
          color,
          description
        });
      });
      this.logger.info(`Successfully created '${name}' label`);
      result = {
        id: response.data.id,
        name: response.data.name,
        color: response.data.color,
        description: response.data.description
      };
      return result;
    } catch (error) {
      this.actionError.report({
        operation: `create '${name}' label`,
        fatal: false
      }, error);
      return result;
    }
  }

  /**
  * Creates a GitHub release
  *
  * @param {Object} params - Function parameters
  * @param {Object} params.context - GitHub Actions context
  * @param {Object} params.release - Release configuration
  * @param {string} params.release.tag - Release tag
  * @param {string} params.release.name - Release name
  * @param {string} params.release.body - Release body
  * @param {boolean} [params.release.draft=false] - Whether the release is a draft
  * @param {boolean} [params.release.prerelease=false] - Whether the release is a prerelease
  * @returns {Promise<Object>} - Created release
  */
  async createRelease({ context, release }) {
    let result = {};
    const { tag, name, body, draft = false, prerelease = false } = release;
    try {
      const response = await this.execute('createRelease', async () => {
        return await this.github.rest.repos.createRelease({
          owner: context.repo.owner,
          repo: context.repo.repo,
          tag_name: tag,
          name,
          body,
          draft,
          prerelease
        });
      });
      this.logger.info(`Successfully created '${response.data.name}' release`);
      result = {
        id: response.data.id,
        htmlUrl: response.data.html_url,
        uploadUrl: response.data.upload_url,
        tagName: response.data.tag_name,
        name: response.data.name
      };
      return result;
    } catch (error) {
      this.actionError.report({
        operation: `create '${name}' release`,
        fatal: true
      }, error);
      return result;
    }
  }

  /**
  * Deletes OCI package from GitHub Container Registry
  * 
  * @param {Object} params - Function parameters
  * @param {Object} params.context - GitHub Actions context
  * @param {Object} params.chart - Chart object
  * @param {string} params.chart.name - Chart name
  * @param {string} params.chart.type - Chart type (application/library)
   * @returns {Promise<boolean>} - True if deletion succeeded
   */
  async deleteOciPackage({ context, chart }) {
    const chartName = `${chart.type}/${chart.name}`;
    try {
      this.logger.info(`Deleting OCI package for '${chartName}' chart...`);
      const ownerType = await this.graphqlService.getRepositoryType(context.repo.owner);
      const packageName = `${context.repo.repo}/${chartName}`;
      const ownerParam = ownerType === 'organization' ? { org: context.repo.owner } : { username: context.repo.owner };
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
      if (error.status === 404) return false;
      this.actionError.report({
        operation: `delete OCI package for '${chartName}' chart`,
        fatal: false
      }, error);
      return false;
    }
  }

  /**
   * Deletes all releases for a specific chart
   *
   * @param {Object} params - Function parameters
   * @param {Object} params.context - GitHub Actions context
   * @param {string} params.chart - Chart name to delete releases for
   * @returns {Promise<number>} - Count of deleted releases
   */
  async deleteReleases({ context, chart }) {
    let result = 0;
    try {
      this.logger.info(`Deleting releases for ${chart} chart...`);
      const releases = await this.#getReleaseIds(context, chart);
      for (const release of releases) {
        try {
          await this.execute('deleteRelease', async () => {
            return await this.github.rest.repos.deleteRelease({
              owner: context.repo.owner,
              repo: context.repo.repo,
              release_id: release.id
            });
          });
          await this.execute('deleteRef', async () => {
            return await this.github.rest.git.deleteRef({
              owner: context.repo.owner,
              repo: context.repo.repo,
              ref: `tags/${release.tagName}`
            });
          });
          result++;
        } catch (error) {
          this.actionError.report({
            operation: `delete '${release.tagName}' release`,
            fatal: false
          }, error);
        }
      }
      const word = result === 1 ? 'release' : 'releases';
      this.logger.info(`Successfully deleted ${result} ${word} for ${chart} chart`);
      return result;
    } catch (error) {
      this.actionError.report({
        operation: `delete releases for '${chart}' chart`,
        fatal: false
      }, error);
      return result;
    }
  }

  /**
  * Gets a label from a repository
  *
  * @param {Object} params - Function parameters
  * @param {Object} params.context - GitHub Actions context
  * @param {string} params.name - Label name
  * @returns {Promise<Object|null>} - Label or null if not found
  */
  async getLabel({ context, name }) {
    let result = null;
    try {
      const response = await this.execute('getLabel', async () => {
        return await this.github.rest.issues.getLabel({
          owner: context.repo.owner,
          repo: context.repo.repo,
          name
        });
      }, false);
      if (!response) {
        this.logger.info(`Label '${name}' not found`);
        return result;
      }
      result = {
        id: response.data.id,
        name: response.data.name,
        color: response.data.color,
        description: response.data.description
      };
      return result;
    } catch (error) {
      this.actionError.report({
        operation: `get '${name}' label`,
        fatal: false
      }, error);
      return result;
    }
  }

  /**
   * Gets a release by tag
   *
   * @param {Object} params - Function parameters
   * @param {Object} params.context - GitHub Actions context
   * @param {string} params.tag - Release tag
   * @returns {Promise<Object|null>} - Release or null if not found
   */
  async getReleaseByTag({ context, tag }) {
    let result = null;
    try {
      const response = await this.execute('getReleaseByTag', async () => {
        return await this.github.rest.repos.getReleaseByTag({
          owner: context.repo.owner,
          repo: context.repo.repo,
          tag
        });
      }, false);
      if (!response) {
        this.logger.info(`Release with '${tag}' tag not found`);
        return result;
      }
      result = {
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
      return result;
    } catch (error) {
      this.actionError.report({
        operation: `get release by '${tag}' tag`,
        fatal: false
      }, error);
      return result;
    }
  }

  /**
   * Gets updated files in a repository based on event type
   * 
   * @param {Object} params - Function parameters
   * @param {Object} params.context - GitHub Actions context
   * @returns {Promise<Object>} - Map of files to their statuses
   */
  async getUpdatedFiles({ context }) {
    let result = {};
    try {
      const payload = this.validateContextPayload(context);
      if (!payload.valid) return result;
      const eventName = payload.eventName;
      switch (eventName) {
        case 'pull_request':
          return await this.paginate('pulls', 'listFiles', {
            owner: context.repo.owner,
            repo: context.repo.repo,
            pull_number: context.payload.pull_request.number
          }, (data, currentMap = {}) => {
            result = { ...currentMap };
            data.forEach(file => { result[file.filename] = file.status; });
            return result;
          });
        default:
          const response = await this.execute('compareCommits', async () => {
            return await this.github.rest.repos.compareCommits({
              owner: context.repo.owner,
              repo: context.repo.repo,
              base: context.payload.before,
              head: context.payload.after
            });
          });
          response.data.files.forEach(file => { result[file.filename] = file.status; });
          this.logger.info(`Found ${Object.keys(result).length} files in ${eventName} event`);
          return result;
      }
    } catch (error) {
      this.actionError.report({
        operation: 'get updated files',
        fatal: false
      }, error);
      return result;
    }
  }

  /**
   * Gets workflow run data
   * 
   * @param {Object} params - Function parameters
   * @param {Object} params.context - GitHub Actions context
   * @param {number} params.id - Workflow run ID
   * @returns {Promise<Object>} - Workflow run data
   */
  async getWorkflowRun({ context, id }) {
    let result = {};
    try {
      const response = await this.execute('getWorkflowRun', async () => {
        return await this.github.rest.actions.getWorkflowRun({
          owner: context.repo.owner,
          repo: context.repo.repo,
          run_id: id
        });
      });
      result = {
        id: response.data.id,
        status: response.data.status,
        conclusion: response.data.conclusion,
        url: response.data.html_url,
        createdAt: response.data.created_at,
        updatedAt: response.data.updated_at
      };
      return result;
    } catch (error) {
      this.actionError.report({
        operation: `get workflow run '${id}' ID`,
        fatal: false
      }, error);
      return result;
    }
  }

  /**
   * Lists jobs for a workflow run
   * 
   * @param {Object} context - GitHub Actions context
   * @param {number} context.runId - Workflow run ID
   * @param {Object} context.repo - Repository information
   * @param {string} context.repo.owner - Repository owner
   * @param {string} context.repo.repo - Repository name
   * @returns {Promise<Array<Object>>} - Array of job objects with steps
   */
  async listJobs(context) {
    const result = [];
    try {
      const response = await this.execute('listJobs', async () => {
        return await this.github.rest.actions.listJobsForWorkflowRun({
          owner: context.repo.owner,
          repo: context.repo.repo,
          run_id: context.runId
        });
      });
      if (response?.data?.jobs) result.push(...response.data.jobs);
      return result;
    } catch (error) {
      if (error.status === 404) return result;
      this.actionError.report({
        operation: 'list jobs',
        fatal: false
      }, error);
      return result;
    }
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
   * @param {Object} params.context - GitHub Actions context
   * @param {Object} params.asset - Asset configuration
   * @param {number} params.asset.releaseId - Release ID
   * @param {string} [params.asset.assetPath] - Path to asset file
   * @param {Buffer|string} [params.asset.assetData] - Asset data (alternative to assetPath)
   * @param {string} params.asset.assetName - Asset name
   * @param {string} [params.asset.contentType] - Asset content type
   * @returns {Promise<Object>} - Uploaded asset
   */
  async uploadReleaseAsset({ context, asset }) {
    let result = {};
    const { releaseId, assetPath, assetData, assetName, contentType } = asset;
    try {
      const data = assetData || fs.readFileSync(assetPath);
      const response = await this.execute('uploadReleaseAsset', async () => {
        return await this.github.rest.repos.uploadReleaseAsset({
          owner: context.repo.owner,
          repo: context.repo.repo,
          release_id: releaseId,
          name: assetName,
          data,
          headers: {
            'content-type': contentType || 'application/octet-stream',
            'content-length': data.length
          }
        });
      });
      result = {
        id: response.data.id,
        name: response.data.name,
        url: response.data.browser_download_url,
        size: response.data.size
      };
      return result;
    } catch (error) {
      this.actionError.report({
        operation: `upload '${assetName}' asset to release ${releaseId}`,
        fatal: true
      }, error);
      return result;
    }
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
