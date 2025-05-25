/**
 * GitHub GraphQL API service
 * 
 * @class GraphQL
 * @module services/github/GraphQL
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Api = require('./Api');
const { GitHubApiError } = require('../../utils/errors');

class GraphQL extends Api {
  /**
   * Creates a signed commit using GitHub API
   * 
   * @param {Object} params - Function parameters
   * @param {string} params.owner - Repository owner
   * @param {string} params.repo - Repository name
   * @param {string} params.branchName - Branch name
   * @param {string} params.expectedHeadOid - Expected HEAD OID
   * @param {Array<Object>} params.additions - Files to add/modify
   * @param {Array<Object>} params.deletions - Files to delete
   * @param {string} params.commitMessage - Commit message
   * @returns {Promise<Object>} - Commit details
   */
  async createSignedCommit({ owner, repo, branchName, expectedHeadOid, additions, deletions, commitMessage }) {
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
    const query = `mutation CreateCommit($input: CreateCommitOnBranchInput!) {
        createCommitOnBranch(input: $input) {
          commit {
            url
            oid
          }
        }
      }`;
    const variables = {
      input: {
        branch: {
          repositoryNameWithOwner: this.getPath(owner, repo),
          branchName
        },
        message: {
          headline: commitMessage
        },
        expectedHeadOid,
        fileChanges
      }
    };
    const response = await this.execute('createSignedCommit', query, variables);
    const commit = response.createCommitOnBranch.commit;
    this.logger.info(`Created signed commit: ${commit.oid}`);
    return {
      url: commit.url,
      oid: commit.oid
    };
  }

  /**
   * Executes a GraphQL query with error handling
   * 
   * @param {string} operationName - Name of the operation (for error reporting)
   * @param {string} query - GraphQL query
   * @param {Object} variables - Query variables
   * @returns {Promise<Object>} - Query response
   */
  async execute(operationName, query, variables) {
    try {
      return await this.github.graphql(query, variables);
    } catch (error) {
      throw new GitHubApiError(operationName, error);
    }
  }

  /**
   * Gets release issues since a specified date
   * 
   * @param {Object} params - Function parameters
   * @param {string} params.owner - Repository owner
   * @param {string} params.repo - Repository name
   * @param {string} params.chartName - Chart name
   * @param {string} params.chartType - Chart type (application or library)
   * @param {Date} params.since - Date to get issues since
   * @returns {Promise<Array<Object>>} - Issues
   */
  async getReleaseIssues({ owner, repo, chartName, chartType, since }) {
    const sinceDate = since ? new Date(since) : new Date(0);
    const query = `query GetIssues($owner: String!, $repo: String!, $chartLabel: String!, $typeLabel: String!, $cursor: String) {
        repository(owner: $owner, name: $repo) {
          issues(
            first: 100,
            after: $cursor,
            states: [CLOSED],
            labels: [$chartLabel, $typeLabel],
            orderBy: {field: CREATED_AT, direction: DESC}
          ) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              number
              title
              url
              closedAt
              labels(
                first: 10
              ) {
                nodes {
                  name
                }
              }
            }
          }
        }
      }`;
    const issues = await this.paginate(query,
      this.setVariables({ owner, repo }, {
        chartLabel: chartName,
        typeLabel: chartType
      }),
      (data) => data.repository.issues,
      (issue) => issue.closedAt && new Date(issue.closedAt) > sinceDate
    );
    this.logger.info(`Found ${issues.length} issues for ${chartName} (${chartType}) since ${sinceDate.toISOString()}`);
    return this.transform(issues, issue => ({
      number: issue.number,
      title: issue.title,
      url: issue.url,
      closedAt: issue.closedAt,
      labels: issue.labels.nodes.map(label => label.name)
    }));
  }

  /**
   * Gets releases for a repository
   * 
   * @param {Object} params - Function parameters
   * @param {string} params.owner - Repository owner
   * @param {string} params.repo - Repository name
   * @param {number} params.limit - Maximum number of releases to return
   * @returns {Promise<Array<Object>>} - Releases
   */
  async getReleases({ owner, repo, limit = 100 }) {
    const query = `query GetReleases($owner: String!, $repo: String!, $cursor: String) {
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
      }`;
    const releases = await this.paginate(query,
      this.setVariables({ owner, repo }),
      (data) => data.repository.releases,
      () => true,
      limit
    );
    this.logger.info(`Found ${releases.length} releases in ${owner}/${repo}`);
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
  }

  /**
   * Helper method to paginate through GraphQL results
   * 
   * @param {string} query - GraphQL query
   * @param {Object} variables - Query variables
   * @param {Function} extractor - Function to extract nodes and page info
   * @param {Function} filter - Function to filter results
   * @param {number} limit - Maximum number of results to return
   * @returns {Promise<Array<Object>>} - Paginated results
   */
  async paginate(query, variables, extractor, filter = () => true, limit = Infinity) {
    const results = [];
    let hasNextPage = true;
    let cursor = null;
    while (hasNextPage && results.length < limit) {
      const currentVars = { ...variables, cursor };
      const response = await this.execute('paginate', query, currentVars);
      const data = extractor(response);
      if (!data || !data.nodes || !data.pageInfo) {
        throw new Error('Invalid GraphQL response structure');
      }
      const filteredNodes = data.nodes.filter(filter);
      results.push(...filteredNodes);
      hasNextPage = data.pageInfo.hasNextPage && results.length < limit;
      cursor = data.pageInfo.endCursor;
    }
    return results.slice(0, limit);
  }
}

module.exports = GraphQL;
