/**
 * GitHub REST API service
 * 
 * @module services/github/Rest
 * @author AXIVO
 * @license BSD-3-Clause
 */
const ApiService = require('./Api');
const GraphQLService = require('./GraphQL');

/**
 * GitHub REST API service
 * 
 * Provides GitHub REST API operations including CRUD operations,
 * file uploads, repository management, and pagination support.
 * 
 * @class RestService
 */
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
  * @private
  * @param {string} chart - Chart name to filter releases
  * @returns {Promise<Array<Object>>} Array of release objects
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
   * @private
   * @param {string} namespace - REST API namespace (e.g., 'repos', 'pulls')
   * @param {string} method - REST API method name (e.g., 'listFiles')
   * @param {Object} [options={}] - Pagination options
   * @param {Object} [options.params] - Method parameters
   * @param {Function} [options.transformer] - Function to transform and merge page results
   * @param {number} [options.size=100] - Number of items per page
   * @returns {Promise<Object>} Aggregated results
   */
  async #paginate(namespace, method, options = {}) {
    const { params, transformer, size = 100 } = options;
    let result = {};
    let page = 1;
    let pages = true;
    while (pages) {
      const response = await this.execute(`paginate`, async () => {
        return await this.github.rest[namespace][method]({
          ...params,
          per_page: size,
          page
        });
      });
      result = transformer(response.data, result) || result;
      pages = response.data.length === size;
      page++;
    }
    return result;
  }

  /**
  * Creates a GitHub issue
  *
  * @param {string} title - Issue title
  * @param {string} body - Issue body
  * @param {Array<string>} [labels=[]] - Issue labels
  * @returns {Promise<Object>} Created issue
  */
  async createIssue(title, body, labels = []) {
    return this.execute(`create issue: '${title}'`, async () => {
      const response = await this.github.rest.issues.create({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        title,
        body,
        labels
      });
      this.logger.info(`Successfully created issue #${response.data.number}: ${response.data.title}`);
      return {
        id: response.data.id,
        number: response.data.number,
        title: response.data.title,
        url: response.data.html_url
      };
    });
  }

  /**
  * Creates a label in a repository
  *
  * @param {string} name - Label name
  * @param {string} color - Label color (hex without #)
  * @param {string} description - Label description
  * @returns {Promise<Object>} Created label
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
    }, false, true);
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
  * @returns {Promise<Object>} Created release
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
  * @returns {Promise<boolean>} True if deletion succeeded
  */
  async deletePackage(name, type) {
    const chartName = `${type}/${name}`;
    return this.execute(`delete OCI package for '${chartName}' chart`, async () => {
      this.logger.info(`Deleting OCI package for '${chartName}' chart...`);
      const ownerType = await this.graphqlService.getRepositoryType(this.context.repo.owner);
      const packageName = `${this.context.repo.repo}/${chartName}`;
      const ownerParam = ownerType === 'organization' ? { org: this.context.repo.owner } : { username: this.context.repo.owner };
      const methodName = ownerType === 'organization' ? 'deletePackageForOrg' : 'deletePackageForUser';
      await this.github.rest.packages[methodName]({
        package_type: 'container',
        package_name: packageName,
        ...ownerParam
      });
      this.logger.info(`Successfully deleted '${packageName}' OCI package`);
      return true;
    }, false, true);
  }

  /**
   * Deletes all releases for a specific chart
   *
   * @param {string} name - Chart name to delete releases for
   * @returns {Promise<number>} Count of deleted releases
   */
  async deleteReleases(name) {
    return this.execute(`delete releases for '${name}' chart`, async () => {
      this.logger.info(`Deleting releases for ${name} chart...`);
      const releases = await this.#getReleaseIds(name);
      let result = 0;
      for (const release of releases) {
        const deleted = await this.execute(`delete '${release.tagName}' release`, async () => {
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
          return true;
        }, false);
        if (deleted) result++;
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
  * @returns {Promise<Object|null>} Label or null if not found
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
   * @returns {Promise<Object|null>} Release or null if not found
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
  * @returns {Promise<Object>} Map of files to their statuses
  */
  async getUpdatedFiles() {
    return this.execute('get updated files', async () => {
      const payload = this.validateContextPayload(this.context);
      if (!payload.valid) return {};
      const eventName = payload.eventName;
      let result = {};
      switch (eventName) {
        case 'pull_request':
          return await this.#paginate('pulls', 'listFiles', {
            params: {
              owner: this.context.repo.owner,
              repo: this.context.repo.repo,
              pull_number: this.context.payload.pull_request.number
            },
            transformer: (data, currentMap = {}) => {
              result = { ...currentMap };
              data.forEach(file => { result[file.filename] = file.status; });
              return result;
            }
          });
        default:
          const response = await this.github.rest.repos.compareCommits({
            owner: this.context.repo.owner,
            repo: this.context.repo.repo,
            base: this.context.payload.before,
            head: this.context.payload.after
          });
          response.data.files.forEach(file => { result[file.filename] = file.status; });
          this.logger.info(`Found ${Object.keys(result).length} files in ${eventName} event`);
          return result;
      }
    }, false);
  }

  /**
   * Gets workflow run data
   * 
   * @param {number} id - Workflow run ID
   * @returns {Promise<Object>} Workflow run data
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
   * Gets workflow run logs
   * 
   * @param {number} id - Workflow run ID
   * @returns {Promise<string>} Workflow run logs data
   */
  async getWorkflowRunLogs(id) {
    return this.execute(`get workflow run '${id}' logs`, async () => {
      const response = await this.github.rest.actions.downloadWorkflowRunLogs({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        run_id: parseInt(id, 10)
      });
      return response.data;
    }, false, true);
  }

  /**
   * Lists jobs for a workflow run
   * 
   * @returns {Promise<Array<Object>>} Array of job objects with steps
   */
  async listJobs() {
    return this.execute('list jobs', async () => {
      const response = await this.github.rest.actions.listJobsForWorkflowRun({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        run_id: this.context.runId
      });
      return response?.data?.jobs || [];
    }, false, true);
  }

  /**
   * Uploads an asset to a release
   * 
   * @param {number} id - Release ID
   * @param {Object} [options={}] - Asset options
   * @param {string} options.name - Asset name
   * @param {Buffer|string} [options.data] - Asset data
   * @returns {Promise<Object>} Uploaded asset
   */
  async uploadReleaseAsset(id, options = {}) {
    const { name, data } = options;
    return this.execute(`upload '${name}' asset to release ${id}`, async () => {
      const response = await this.github.rest.repos.uploadReleaseAsset({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        release_id: id,
        name,
        data
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
   * @returns {Object} Validation result with valid flag and reason
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
