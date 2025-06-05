/**
 * GitHub GraphQL API service
 * 
 * @class GraphQLService
 * @module services/github/GraphQL
 * @author AXIVO
 * @license BSD-3-Clause
 */
const ApiService = require('./Api');

class GraphQLService extends ApiService {
  /**
   * Creates a new GraphQLService instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
  }

  /**
   * Helper method to paginate through GraphQL results
   * 
   * @private
   * @param {string} query - GraphQL query
   * @param {Object} variables - Query variables
   * @param {Function} extractor - Function to extract nodes and page info
   * @param {Object} [options={}] - Pagination options
   * @param {Function} [options.filter] - Function to filter results
   * @param {number} [options.limit] - Maximum number of results to return
   * @returns {Promise<Array<Object>>} - Paginated results
   */
  async #paginate(query, variables, extractor, options = {}) {
    const { filter = () => true, limit = Infinity } = options;
    const result = [];
    let hasNextPage = true;
    let cursor = null;
    while (hasNextPage && result.length < limit) {
      const currentVars = { ...variables, cursor };
      const response = await this.execute('paginate', async () => {
        return await this.github.graphql(query, currentVars);
      });
      const data = extractor(response);
      if (!data || !data.nodes || !data.pageInfo) {
        throw new Error('Invalid GraphQL response structure');
      }
      const filteredNodes = data.nodes.filter(filter);
      result.push(...filteredNodes);
      hasNextPage = data.pageInfo.hasNextPage && result.length < limit;
      cursor = data.pageInfo.endCursor;
    }
    return result.slice(0, limit);
  }

  /**
   * Creates a signed commit using GitHub API
   * 
   * @param {string} branch - Branch name
   * @param {Object} options - Function options
   * @param {string} options.oid - Expected HEAD OID
   * @param {Array<Object>} options.additions - Files to add/modify
   * @param {Array<Object>} options.deletions - Files to delete
   * @param {string} options.message - Commit message
   * @returns {Promise<Object>} - Commit details
   */
  async createSignedCommit(branch, options = {}) {
    const { oid, additions, deletions, message } = options;
    return this.execute(`create signed commit on '${branch}' branch`, async () => {
      const fileChanges = {};
      if (additions?.length) {
        fileChanges.additions = additions.map(file => ({
          path: file.path,
          contents: file.contents
        }));
      }
      if (deletions?.length) {
        fileChanges.deletions = deletions.map(file => ({
          path: file.path
        }));
      }
      const query = `
        mutation CreateCommit($input: CreateCommitOnBranchInput!) {
          createCommitOnBranch(input: $input) {
            commit {
              url
              oid
            }
          }
        }
      `;
      const variables = {
        input: {
          branch: {
            repositoryNameWithOwner: `${this.context.repo.owner}/${this.context.repo.repo}`,
            branchName: branch
          },
          message: {
            headline: message
          },
          expectedHeadOid: oid,
          fileChanges
        }
      };
      const response = await this.github.graphql(query, variables);
      const commitData = response.createCommitOnBranch.commit;
      this.logger.info(`Successfully created '${commitData.oid}' signed commit`);
      return {
        url: commitData.url,
        oid: commitData.oid
      };
    });
  }

  /**
   * Gets release issues for a chart since a specified date
   * 
   * @param {Object} chart - Chart configuration
   * @param {string} chart.name - Chart name
   * @param {string} chart.type - Chart type (application or library)
   * @param {Object} [options={}] - Function options
   * @param {Date} [options.since] - Date to get issues since
   * @param {number} [options.issues=50] - Maximum number of issues to return
   * @returns {Promise<Array<Object>>} - Issues
   */
  async getReleaseIssues(chart, options = {}) {
    const { since, issues = 50 } = options;
    const { name, type } = chart;
    const chartName = `${type}/${name}`;
    const sinceDate = since ? new Date(since) : null;
    return this.execute(`get release issues for '${chartName}' chart`, async () => {
      const query = `
        query GetIssues($owner: String!, $repo: String!, $issues: Int!) {
          repository(owner: $owner, name: $repo) {
            issues(
              first: $issues,
              states: [OPEN, CLOSED],
              orderBy: {field: UPDATED_AT, direction: DESC}
            ) {
              nodes {
                number
                state
                title
                url
                bodyText
                createdAt
                updatedAt
                labels(first: 10) {
                  nodes {
                    name
                  }
                }
              }
            }
          }
        }
      `;
      const variables = {
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        issues
      };
      const response = await this.github.graphql(query, variables);
      const allIssues = sinceDate
        ? response.repository.issues.nodes.filter(issue => new Date(issue.createdAt) > sinceDate)
        : response.repository.issues.nodes;
      const word = allIssues.length === 1 ? 'issue' : 'issues';
      this.logger.info(`Found ${allIssues.length} ${word} for '${chartName}' chart`);
      return this.transform(allIssues, issue => ({
        Number: issue.number,
        State: issue.state,
        Title: issue.title,
        URL: issue.url,
        Labels: issue.labels.nodes.map(label => label.name),
        bodyText: issue.bodyText
      }));
    }, false);
  }

  /**
   * Gets releases for a repository
   * 
   * @param {string} [prefix] - Optional tag prefix to filter releases
   * @param {number} [limit=100] - Maximum number of releases to return
   * @returns {Promise<Array<Object>>} - Releases
   */
  async getReleases(prefix, limit = 100) {
    return this.execute(`get releases`, async () => {
      const query = `
        query GetReleases($owner: String!, $repo: String!, $cursor: String) {
          repository(owner: $owner, name: $repo) {
            releases(
              first: 100,
              after: $cursor,
              orderBy: {field: CREATED_AT, direction: DESC}
            ) {
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                id
                name
                tagName
                createdAt
                description
                isDraft
                isPrerelease
                releaseAssets(
                  first: 100
                ) {
                  nodes {
                    name
                    downloadUrl
                    contentType
                    size
                  }
                }
              }
            }
          }
        }
      `;
      const releases = await this.#paginate(query, 
        { owner: this.context.repo.owner, repo: this.context.repo.repo },
        (data) => data.repository.releases,
        {
          filter: prefix ? (release) => release.tagName.startsWith(prefix) : () => true,
          limit
        }
      );
      const filterMessage = prefix ? ` with '${prefix}' tag prefix` : '';
      this.logger.info(`Found ${releases.length} releases${filterMessage}`);
      return this.transform(releases, release => ({
        id: release.id,
        name: release.name,
        tagName: release.tagName,
        createdAt: release.createdAt,
        description: release.description,
        isDraft: release.isDraft,
        isPrerelease: release.isPrerelease,
        assets: release.releaseAssets.nodes.map(asset => ({
          name: asset.name,
          downloadUrl: asset.downloadUrl,
          contentType: asset.contentType,
          size: asset.size
        }))
      }));
    }, false);
  }

  /**
   * Determines repository owner type for API routing
   * 
   * @param {string} owner - Repository owner
   * @returns {Promise<string>} - 'organization' or 'user'
   */
  async getRepositoryType(owner) {
    return this.execute('get repository type', async () => {
      const query = `
        query GetOwnerType($owner: String!) {
          repositoryOwner(login: $owner) {
            __typename
          }
        }
      `;
      const variables = { owner };
      const response = await this.github.graphql(query, variables);
      const ownerType = response.repositoryOwner.__typename.toLowerCase();
      this.logger.info(`Repository is '${ownerType}' type`);
      return ownerType;
    }, false);
  }
}

module.exports = GraphQLService;
