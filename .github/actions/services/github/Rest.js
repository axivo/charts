/**
 * GitHub REST API service
 * 
 * @class RestService
 * @module services/github/Rest
 * @author AXIVO
 * @license BSD-3-Clause
 */
const fs = require('fs');
const ApiService = require('./Api');
const GraphQLService = require('./GraphQL');

class RestService extends ApiService {
  /**
   * Creates a new RestService instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.graphqlService = new GraphQLService(params);
  }

  /**
  * Gets all release IDs for a specific chart
  *
  * @param {string} chart - Chart name to filter releases
  * @returns {Promise<Array<Object>>} - Array of release objects
  */
  async #getReleaseIds(chart) {
    this.logger.info(`Getting release IDs for '${chart}' chart...`);
    return this.execute('get release IDs', async () => {
      const result = await this.paginate('repos', 'listReleases', {
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
      const word = result.length === 1 ? 'release' : 'releases';
      this.logger.info(`Found ${result.length} ${word} for '${chart}' chart`);
      return result;
    }, false);
  }

  /**
   * Paginates through REST API results
   * 
   * @param {string} namespace - REST API namespace (e.g., 'repos', 'pulls')
   * @param {string} method - REST API method name (e.g., 'listFiles')
   * @param {Object} options - Pagination options
   * @param {Object} options.params - Method parameters
   * @param {Function} options.transformer - Function to transform and merge page results
   * @param {number} [options.size=100] - Number of items per page
   * @returns {Promise<Object>} - Aggregated results
   */
  async #paginate(namespace, method, options = {}) {
    const { params, transformer, size = 100 } = options;
    let result = {};
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
      const processedResults = transformer(response.data, result);
      result = processedResults || result;
      hasMorePages = response.data.length === size;
      page++;
    }
    return result;
  }

  /**
  * Creates a label in a repository
  *
  * @param {string} name - Label name
  * @param {string} color - Label color (hex without #)
  * @param {string} description - Label description
  * @returns {Promise<Object>} - Created label
  */
  async createLabel(name, color, description) {
    return this.execute(`create '${name}' label`, async () => {
      const response = await this.github.rest.issues.createLabel({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        name,
        color,
        description
      });
      this.logger.info(`Successfully created '${name}' label`);
      return {
        id: response.data.id,
        name: response.data.name,
        color: response.data.color,
        description: response.data.description
      };
    }, false);
  }

  /**
  * Creates a GitHub release
  *
  * @param {string} tag - Release tag
  * @param {string} name - Release name
  * @param {string} body - Release body
  * @param {Object} [options={}] - Additional options
  * @param {boolean} [options.draft=false] - Whether the release is a draft
  * @param {boolean} [options.prerelease=false] - Whether the release is a prerelease
  * @returns {Promise<Object>} - Created release
  */
  async createRelease(tag, name, body, options = {}) {
    const { draft = false, prerelease = false } = options;
    return this.execute(`create '${name}' release`, async () => {
      const response = await this.github.rest.repos.createRelease({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        tag_name: tag,
        name,
        body,
        draft,
        prerelease
      });
      this.logger.info(`Successfully created '${response.data.name}' release`);
      return {
        id: response.data.id,
        htmlUrl: response.data.html_url,
        uploadUrl: response.data.upload_url,
        tagName: response.data.tag_name,
        name: response.data.name
      };
    });
  }

  /**
  * Deletes an OCI package from GitHub Container Registry
  * 
  * @param {string} name - Chart name
  * @param {string} type - Chart type (application/library)
  * @returns {Promise<boolean>} - True if deletion succeeded
  */
  async deletePackage(name, type) {
    const chartName = `${type}/${name}`;
    return this.execute(`delete OCI package for '${chartName}' chart`, async () => {
      this.logger.info(`Deleting OCI package for '${chartName}' chart...`);
      const ownerType = await this.graphqlService.getRepositoryType(this.context.repo.owner);
      const packageName = `${this.context.repo.repo}/${chartName}`;
      const ownerParam = ownerType === 'organization' ? { org: this.context.repo.owner } : { username: this.context.repo.owner };
      const methodName = ownerType === 'organization' ? 'deletePackageForOrg' : 'deletePackageForUser';
      try {
        await this.github.rest.packages[methodName]({
          package_type: 'container',
          package_name: packageName,
          ...ownerParam
        });
        this.logger.info(`Successfully deleted '${packageName}' OCI package`);
        return true;
      } catch (error) {
        if (error.status === 404) return false;
        throw error;
      }
    }, false);
  }

  /**
   * Deletes all releases for a specific chart
   *
   * @param {string} name - Chart name to delete releases for
   * @returns {Promise<number>} - Count of deleted releases
   */
  async deleteReleases(name) {
    return this.execute(`delete releases for '${name}' chart`, async () => {
      this.logger.info(`Deleting releases for ${name} chart...`);
      const releases = await this.#getReleaseIds(name);
      let result = 0;
      for (const release of releases) {
        try {
          await this.github.rest.repos.deleteRelease({
            owner: this.context.repo.owner,
            repo: this.context.repo.repo,
            release_id: release.id
          });
          await this.github.rest.git.deleteRef({
            owner: this.context.repo.owner,
            repo: this.context.repo.repo,
            ref: `tags/${release.tagName}`
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
      this.logger.info(`Successfully deleted ${result} ${word} for ${name} chart`);
      return result;
    }, false);
  }

  /**
  * Gets a label from a repository
  *
  * @param {string} name - Label name
  * @returns {Promise<Object|null>} - Label or null if not found
  */
  async getLabel(name) {
    return this.execute(`get '${name}' label`, async () => {
      const response = await this.github.rest.issues.getLabel({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        name
      });
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
    }, false);
  }

  /**
   * Gets a release by tag
   *
   * @param {string} name - Release tag name
   * @returns {Promise<Object|null>} - Release or null if not found
   */
  async getReleaseByTag(name) {
    return this.execute(`get release by '${name}' tag`, async () => {
      const response = await this.github.rest.repos.getReleaseByTag({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        tag: name
      });
      if (!response) {
        this.logger.info(`Release with '${name}' tag not found`);
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
    }, false);
  }

  /**
   * Gets updated files in a repository based on event type
   * 
   * @returns {Promise<Object>} - Map of files to their statuses
   */
  async getUpdatedFiles() {
    return this.execute('get updated files', async () => {
      const payload = this.validateContextPayload(this.context);
      // DEBUG start
      this.logger.info(`[DEBUG] getUpdatedFiles() payload: ${JSON.stringify(payload)}`);
      // DEBUG end
      if (!payload.valid) return {};
      const eventName = payload.eventName;
      // DEBUG start
      this.logger.info(`[DEBUG] getUpdatedFiles() eventName: ${eventName}`);
      // DEBUG end
      let result = {};
      switch (eventName) {
        case 'pull_request':
          // DEBUG start
          this.logger.info(`[DEBUG] getUpdatedFiles() processing pull_request event`);
          this.logger.info(`[DEBUG] getUpdatedFiles() PR number: ${this.context.payload.pull_request.number}`);
          // DEBUG end
          return await this.#paginate('pulls', 'listFiles', {
            params: {
              owner: this.context.repo.owner,
              repo: this.context.repo.repo,
              pull_number: this.context.payload.pull_request.number
            },
            transformer: (data, currentMap = {}) => {
              result = { ...currentMap };
              data.forEach(file => { result[file.filename] = file.status; });
              // DEBUG start
              this.logger.info(`[DEBUG] getUpdatedFiles() PR files batch: ${JSON.stringify(data.map(f => ({ filename: f.filename, status: f.status })))}`);
              // DEBUG end
              return result;
            }
          });
        default:
          // DEBUG start
          this.logger.info(`[DEBUG] getUpdatedFiles() processing ${eventName} event`);
          this.logger.info(`[DEBUG] getUpdatedFiles() comparing ${this.context.payload.before} to ${this.context.payload.after}`);
          // DEBUG end
          const response = await this.github.rest.repos.compareCommits({
            owner: this.context.repo.owner,
            repo: this.context.repo.repo,
            base: this.context.payload.before,
            head: this.context.payload.after
          });
          response.data.files.forEach(file => { result[file.filename] = file.status; });
          // DEBUG start
          this.logger.info(`[DEBUG] getUpdatedFiles() commit comparison files: ${JSON.stringify(response.data.files.map(f => ({ filename: f.filename, status: f.status })))}`);
          this.logger.info(`[DEBUG] getUpdatedFiles() final result: ${JSON.stringify(result)}`);
          // DEBUG end
          this.logger.info(`Found ${Object.keys(result).length} files in ${eventName} event`);
          return result;
      }
    }, false);
  }

  /**
   * Gets workflow run data
   * 
   * @param {number} id - Workflow run ID
   * @returns {Promise<Object>} - Workflow run data
   */
  async getWorkflowRun(id) {
    return this.execute(`get workflow run '${id}' ID`, async () => {
      const response = await this.github.rest.actions.getWorkflowRun({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        run_id: id
      });
      return {
        id: response.data.id,
        status: response.data.status,
        conclusion: response.data.conclusion,
        url: response.data.html_url,
        createdAt: response.data.created_at,
        updatedAt: response.data.updated_at
      };
    }, false);
  }

  /**
   * Lists jobs for a workflow run
   * 
   * @returns {Promise<Array<Object>>} - Array of job objects with steps
   */
  async listJobs() {
    return this.execute('list jobs', async () => {
      try {
        const response = await this.github.rest.actions.listJobsForWorkflowRun({
          owner: this.context.repo.owner,
          repo: this.context.repo.repo,
          run_id: this.context.runId
        });
        return response?.data?.jobs || [];
      } catch (error) {
        if (error.status === 404) return [];
        throw error;
      }
    }, false);
  }

  /**
   * Uploads an asset to a release
   * 
   * @param {number} id - Release ID
   * @param {Object} options - Asset options
   * @param {string} options.name - Asset name
   * @param {string} [options.type] - Asset content type
   * @param {string} [options.directory] - Path to asset file
   * @param {Buffer|string} [options.data] - Asset data (alternative to directory)
   * @returns {Promise<Object>} - Uploaded asset
   */
  async uploadReleaseAsset(id, options = {}) {
    const { name, type, directory, data } = options;
    return this.execute(`upload '${name}' asset to release ${id}`, async () => {
      const assetData = data || fs.readFileSync(directory);
      const response = await this.github.rest.repos.uploadReleaseAsset({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        release_id: id,
        name,
        data: assetData,
        headers: {
          'content-type': type || 'application/octet-stream',
          'content-length': data.length
        }
      });
      return {
        id: response.data.id,
        name: response.data.name,
        url: response.data.browser_download_url,
        size: response.data.size
      };
    });
  }

  /**
   * Validates context payload for specific event types
   * 
   * @returns {Object} - Validation result with valid flag and reason
   */
  validateContextPayload() {
    const eventName = this.context.eventName || 'push';
    switch (eventName) {
      case 'pull_request':
        if (!this.context.payload.pull_request || !this.context.payload.pull_request.number) {
          this.logger.warning('Pull request data missing from context');
          return { valid: false, reason: 'missing_pull_request_data' };
        }
        break;
      default:
        if (!this.context.payload.before || !this.context.payload.after) {
          this.logger.warning('Commit data missing from context');
          return { valid: false, reason: 'missing_commit_data' };
        }
    }
    return { valid: true, eventName };
  }
}

module.exports = RestService;
