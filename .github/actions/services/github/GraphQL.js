/**
 * GitHub GraphQL API service
 * 
 * @class GraphQL
 * @module services/github/GraphQL
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Api = require('./Api');

class GraphQL extends Api {
  /**
   * Creates a signed commit using GitHub API
   * 
   * @param {Object} params - Function parameters
   * @param {Object} params.context - GitHub Actions context
   * @param {Object} params.commit - Commit configuration
   * @param {string} params.commit.branch - Branch name
   * @param {string} params.commit.oid - Expected HEAD OID
   * @param {Array<Object>} params.commit.additions - Files to add/modify
   * @param {Array<Object>} params.commit.deletions - Files to delete
   * @param {string} params.commit.message - Commit message
   * @returns {Promise<Object>} - Commit details
   */
  async createSignedCommit({ context, commit }) {
    let result = {};
    const { branch, oid, additions, deletions, message } = commit;
    try {
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
            repositoryNameWithOwner: `${context.repo.owner}/${context.repo.repo}`,
            branchName: branch
          },
          message: {
            headline: message
          },
          expectedHeadOid: oid,
          fileChanges
        }
      };
      const response = await this.execute('createSignedCommit', async () => {
        return await this.github.graphql(query, variables);
      });
      const commitData = response.createCommitOnBranch.commit;
      this.logger.info(`Successfully created '${commitData.oid}' signed commit`);
      result = {
        url: commitData.url,
        oid: commitData.oid
      };
      return result;
    } catch (error) {
      this.actionError.report(error, {
        operation: `create signed commit on '${branch}' branch`,
        fatal: true
      });
      return result;
    }
  }

  /**
   * Gets release issues for a chart since a specified date
   * 
   * @param {Object} params - Function parameters
   * @param {Object} params.context - GitHub Actions context
   * @param {Object} params.chart - Chart configuration
   * @param {string} params.chart.name - Chart name
   * @param {string} params.chart.type - Chart type (application or library)
   * @param {Date} params.since - Date to get issues since
   * @param {number} [params.issues=50] - Maximum number of issues to return
   * @returns {Promise<Array<Object>>} - Issues
   */
  async getReleaseIssues({ context, chart, since, issues = 50 }) {
    let result = [];
    const { name, type } = chart;
    const chartName = `${type}/${name}`;
    try {
      const sinceDate = since ? new Date(since) : new Date(0);
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
        owner: context.repo.owner,
        repo: context.repo.repo,
        issues
      };
      const response = await this.execute('getReleaseIssues', async () => {
        return await this.github.graphql(query, variables);
      });
      const allIssues = response.repository.issues.nodes.filter(issue => {
        return !since || new Date(issue.createdAt || issue.updatedAt) > sinceDate;
      });
      const word = allIssues.length === 1 ? 'issue' : 'issues';
      this.logger.info(`Found ${allIssues.length} ${word} for '${chartName}' chart`);
      result = this.transform(allIssues, issue => ({
        Number: issue.number,
        State: issue.state,
        Title: issue.title,
        URL: issue.url,
        Labels: issue.labels.nodes.map(label => label.name),
        bodyText: issue.bodyText
      }));
      return result;
    } catch (error) {
      this.actionError.report(error, {
        operation: `get release issues for '${chartName}' chart`,
        fatal: false
      });
      return result;
    }
  }

  /**
   * Gets releases for a repository
   * 
   * @param {Object} params - Function parameters
   * @param {Object} params.context - GitHub Actions context
   * @param {string} [params.prefix] - Optional tag prefix to filter releases
   * @param {number} [params.limit=100] - Maximum number of releases to return
   * @returns {Promise<Array<Object>>} - Releases
   */
  async getReleases({ context, prefix, limit = 100 }) {
    let result = [];
    try {
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
      const releases = await this.execute('getReleases', async () => {
        return await this.paginate(query,
          this.setVariables({ owner: context.repo.owner, repo: context.repo.repo }),
          (data) => data.repository.releases,
          prefix ? (release) => release.tagName.startsWith(prefix) : () => true,
          limit
        );
      }, false);
      const filterMessage = prefix ? ` with '${prefix}' tag prefix` : '';
      this.logger.info(`Found ${releases.length} releases${filterMessage}`);
      result = this.transform(releases, release => ({
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
      return result;
    } catch (error) {
      this.actionError.report(error, {
        operation: `get releases for ${context.repo.owner}/${context.repo.repo}`,
        fatal: false
      });
      return result;
    }
  }

  /**
   * Determines repository owner type for API routing
   * 
   * @param {string} owner - Repository owner
   * @returns {Promise<string>} - 'organization' or 'user'
   */
  async getRepositoryType(owner) {
    let result = '';
    try {
      const query = `
        query GetOwnerType($owner: String!) {
          repositoryOwner(login: $owner) {
            __typename
          }
        }
      `;
      const variables = { owner };
      const response = await this.execute('getRepositoryType', async () => {
        return await this.github.graphql(query, variables);
      });
      const ownerType = response.repositoryOwner.__typename.toLowerCase();
      this.logger.info(`Repository is of '${ownerType}' type`);
      return ownerType;
    } catch (error) {
      this.actionError.report(error, {
        operation: `get repository type`,
        fatal: false
      });
      return result;
    }
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
      const response = await this.execute('paginate', async () => {
        return await this.github.graphql(query, currentVars);
      });
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
