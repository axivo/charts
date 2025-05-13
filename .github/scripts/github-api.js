/**
 * GitHub API Utilities Module
 * 
 * This module provides centralized functions for interacting with the GitHub API,
 * including repository issues, releases, and assets management. It handles all
 * communication with GitHub's REST and GraphQL APIs, providing a consistent
 * interface for other modules.
 * 
 * The module includes functions for:
 * - Managing GitHub releases and their assets
 * - Fetching and filtering repository issues
 * - Checking workflow run status
 * 
 * @module github-api
 * @author AXIVO
 * @license BSD-3-Clause
 */

const config = require('./config');
const utils = require('./utils');

/**
 * Gets the date of the last release for a chart
 * 
 * Searches through all GitHub releases using GraphQL to find the most recent release
 * for a specific chart and returns its creation date. The function filters releases
 * by matching the tag name pattern defined in the configuration, extracting only
 * those releases that belong to the specified chart.
 * 
 * The function is used to determine the cutoff date for issues that should be included
 * in release notes, ensuring only issues created or updated since the last release
 * are considered.
 * 
 * @private
 * @param {Object} options - Function parameters
 * @param {Object} options.github - GitHub API client for making API calls
 * @param {Object} options.context - GitHub Actions context containing repository information
 * @param {Object} options.core - GitHub Actions Core API for logging and output
 * @param {string} options.chartName - Name of the chart to find releases for
 * @returns {Promise<string|null>} - ISO date string of the last release or null if none found
 */
async function _getLastReleaseDate({ github, context, core, chartName }) {
  try {
    const query = `
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          releases(first: 100, orderBy: {field: CREATED_AT, direction: DESC}) {
            nodes {
              tagName
              createdAt
            }
          }
        }
      }
    `;
    const variables = {
      owner: context.repo.owner,
      repo: context.repo.repo
    };
    const result = await github.graphql(query, variables);
    const releases = result.repository.releases.nodes;
    const titlePattern = config('release').title
      .replace('{{ .Name }}', chartName)
      .replace('{{ .Version }}', '');
    const tagPrefix = titlePattern.substring(0, titlePattern.indexOf('{{ .Version }}'));
    const chartReleases = releases.filter(release =>
      release.tagName.startsWith(tagPrefix)
    ).sort((current, previous) => new Date(previous.createdAt) - new Date(current.createdAt));
    if (chartReleases.length > 0) {
      return chartReleases[0].createdAt;
    }
    core.info(`No previous releases found for '${chartName}' chart`);
    return null;
  } catch (error) {
    utils.handleError(error, core, `get last release date for '${chartName}' chart`);
  }
}

/**
 * Gets all version IDs for an OCI package in GitHub Container Registry
 * 
 * This helper function queries the GitHub GraphQL API to get all package version IDs
 * in the GitHub Container Registry using pagination.
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {Object} params.package - Package information
 * @param {string} params.package.name - Name of the package
 * @param {string} params.package.type - Type of package ('application' or 'library')
 * @returns {Promise<Array>} - Array of version objects with id and version properties
 */
async function _getOciPackageVersionIds({ github, context, core, package }) {
  const packageName = [context.repo.repo, package.type, package.name].join('/');
  core.info(`Searching for all versions of '${packageName}' package...`);
  const repoType = await _getRepositoryType({ github, core, owner: context.repo.owner });
  const isOrg = repoType === 'organization';
  const perPage = 100;
  let versionIds = [];
  try {
    while (true) {
      const { data } = await github.rest.packages[isOrg
        ? 'getAllPackageVersionsForPackageOwnedByOrg'
        : 'getAllPackageVersionsForPackageOwnedByUser']({
          [isOrg ? 'org' : 'username']: context.repo.owner,
          package_name: encodeURIComponent(packageName),
          package_type: 'container',
          per_page: perPage
        });
      if (!data.length) {
        break;
      }
      const versions = data.map(version => ({
        id: version.id,
        version: version.name
      }));
      versionIds = versionIds.concat(versions);
      if (data.length < perPage) {
        break;
      }
    }
    const word = versionIds.length === 1 ? 'version' : 'versions';
    core.info(`Found ${versionIds.length} ${word} for '${packageName}' OCI package`);
    return versionIds;
  } catch (error) {
    utils.handleError(error, core, `get versions for '${packageName}' package`, false);
    return [];
  }
}

/**
 * Gets all release IDs for a specific chart
 * 
 * This helper function queries the GitHub GraphQL API to get all release IDs
 * for a chart based on its name, using the tag naming pattern.
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {string} params.chart - Name of the chart
 * @returns {Promise<Array>} - Array of release objects with databaseId and tagName properties
 */
async function _getReleaseIds({ github, context, core, chart }) {
  const titlePrefix = config('release').title
    .replace('{{ .Name }}', chart)
    .replace('{{ .Version }}', '');
  core.info(`Searching for all releases of '${chart}' chart...`);
  const query = `
    query($owner: String!, $repo: String!, $cursor: String) {
      repository(owner: $owner, name: $repo) {
        releases(first: 100, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            databaseId
            tagName
          }
        }
      }
    }
  `;
  let releaseIds = [];
  let hasNextPage = true;
  let endCursor = null;
  try {
    while (hasNextPage) {
      const result = await github.graphql(query, {
        owner: context.repo.owner,
        repo: context.repo.repo,
        cursor: endCursor
      });
      const releases = result.repository.releases.nodes
        .filter(release => release.tagName.startsWith(titlePrefix))
        .map(release => ({
          databaseId: release.databaseId,
          tagName: release.tagName
        }));
      releaseIds = releaseIds.concat(releases);
      const pageInfo = result.repository.releases.pageInfo;
      hasNextPage = pageInfo.hasNextPage;
      endCursor = pageInfo.endCursor;
    }
    const word = releaseIds.length === 1 ? 'release' : 'releases';
    core.info(`Found ${releaseIds.length} ${word} for '${chart}' chart`);
    return releaseIds;
  } catch (error) {
    utils.handleError(error, core, `get releases for '${chart}' chart`, false);
    return [];
  }
}

/**
 * Fetches GitHub releases based on specified query parameters
 * 
 * This private utility function provides a consistent interface for fetching releases
 * through GraphQL, supporting both exact tag matches and tag prefix filtering with proper pagination.
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {Object} params.options - Query options
 * @param {string} [params.options.tagName] - Exact tag name to match (exclusive with tagPrefix)
 * @param {string} [params.options.tagPrefix] - Tag name prefix to match (exclusive with tagName)
 * @param {number} [params.options.limit=0] - Maximum number of releases to return (0 for all)
 * @returns {Promise<Array>} - Array of matching release objects or empty array if none found
 */
async function _getReleases({ github, context, core, options = {} }) {
  try {
    const { tagName, tagPrefix, limit = 0 } = options;
    const message = tagName
      ? `release with '${tagName}' tag`
      : tagPrefix
        ? `releases with '${tagPrefix}' tag prefix`
        : 'all repository releases';
    core.info(`Getting ${message}...`);
    const query = `
      query($owner: String!, $repo: String!, $cursor: String) {
        repository(owner: $owner, name: $repo) {
          releases(first: 100, after: $cursor, orderBy: {field: CREATED_AT, direction: DESC}) {
            pageInfo { hasNextPage endCursor }
            nodes {
              databaseId tagName name description createdAt
              isDraft isPrerelease url
              releaseAssets(first: 10) {
                nodes { name downloadUrl }
              }
            }
          }
        }
      }
    `;
    let allReleases = [];
    let hasNextPage = true;
    let endCursor = null;
    while (hasNextPage) {
      const result = await github.graphql(query, {
        owner: context.repo.owner,
        repo: context.repo.repo,
        cursor: endCursor
      });
      const releases = result.repository.releases.nodes;
      const newReleases = releases.map(release => ({
        id: release.databaseId,
        name: release.name,
        tag_name: release.tagName,
        body: release.description,
        created_at: release.createdAt,
        draft: release.isDraft,
        prerelease: release.isPrerelease,
        html_url: release.url,
        assets: release.releaseAssets.nodes.map(asset => ({
          name: asset.name,
          browser_download_url: asset.downloadUrl,
          content_type: asset.contentType
        }))
      }));
      allReleases = allReleases.concat(newReleases);
      if (tagName) {
        allReleases = allReleases.filter(release => release.tag_name === tagName);
        if (allReleases.length > 0) break;
      } else if (tagPrefix) {
        allReleases = allReleases.filter(release => release.tag_name.startsWith(tagPrefix));
      }
      if (limit > 0 && allReleases.length >= limit) {
        allReleases = allReleases.slice(0, limit);
        break;
      }
      const pageInfo = result.repository.releases.pageInfo;
      hasNextPage = pageInfo.hasNextPage;
      endCursor = pageInfo.endCursor;
    }
    const word = allReleases.length === 1 ? 'release' : 'releases';
    core.info(allReleases.length > 0 ? `Found ${allReleases.length} ${word}` : 'No releases found');
    return allReleases;
  } catch (error) {
    const context = tagName
      ? `fetch release with tag ${tagName}`
      : tagPrefix
        ? `fetch releases with tag prefix ${tagPrefix}`
        : 'fetch repository releases';
    utils.handleError(error, core, context, false);
    return [];
  }
}

/**
 * Get repository owner type
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {string} params.owner - Repository owner name
 * @returns {Promise<string>} Owner type in lowercase ('user' or 'organization')
 */
async function _getRepositoryType({ github, core, owner }) {
  const query = `
    query($owner: String!) {
      repositoryOwner(login: $owner) {
        __typename
      }
    }
  `;
  try {
    const response = await github.graphql(query, { owner });
    return response.repositoryOwner.__typename.toLowerCase();
  } catch (error) {
    utils.handleError(error, core, 'determine repository type', false);
  }
}

/**
 * Checks if a workflow run has any warnings or errors using GraphQL API
 * 
 * Analyzes a specific workflow run by its run ID to determine if it encountered any issues,
 * including failures, warnings, or cancellations. This function provides a way to
 * programmatically detect problematic workflows that may require attention without
 * manually checking the workflow logs.
 * 
 * The function checks the conclusion status of the workflow run, considering
 * 'cancelled' and 'failure' as error conditions, while null (in-progress) and 'success'
 * are considered successful states.
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {number} params.runId - The workflow run ID to check
 * @returns {Promise<boolean>} - True if the workflow run has warnings or errors, false otherwise
 */
async function checkWorkflowRunStatus({ github, context, core, runId }) {
  try {
    core.info(`Checking workflow run ${runId} ID status...`);
    let hasFailures = false;
    const jobsResponse = await github.rest.actions.listJobsForWorkflowRun({
      owner: context.repo.owner,
      repo: context.repo.repo,
      run_id: parseInt(runId, 10)
    });
    for (const job of jobsResponse.data.jobs) {
      if (job.steps) {
        const failedSteps = job.steps.filter(step => step.conclusion !== 'success');
        if (failedSteps.length > 0) {
          hasFailures = true;
          break;
        }
      }
    }
    const logsResponse = await github.rest.actions.downloadWorkflowRunLogs({
      owner: context.repo.owner,
      repo: context.repo.repo,
      run_id: parseInt(runId, 10)
    });
    const regex = /(^|:)warning:/i;
    const hasWarnings = regex.test(logsResponse.data);
    return hasFailures || hasWarnings;
  } catch (error) {
    if (error.status === 404) return false;
    utils.handleError(error, core, 'check workflow run status', false);
    return true;
  }
}

/**
 * Creates a new GitHub release
 * 
 * This function handles the GitHub REST API call to create the release and returns
 * a standardized data structure with the release details.
 * 
 * The function is used during the chart release process to create versioned
 * releases for charts, with appropriate naming and content based on the templates
 * and chart metadata.
 * 
 * @param {Object} options - Function parameters
 * @param {Object} options.github - GitHub API client for making API calls
 * @param {Object} options.context - GitHub Actions context containing repository information
 * @param {Object} options.core - GitHub Actions Core API for logging and output
 * @param {string} options.name - Tag name for the release (e.g., "chart-name-1.0.0")
 * @param {string} options.body - Body content/description of the release in markdown format
 * @param {boolean} [options.draft=false] - Whether the release should be created as a draft
 * @param {boolean} [options.prerelease=false] - Whether the release should be marked as a prerelease
 * @returns {Promise<Object>} - Standardized object containing the created release data
 */
async function createRelease({ github, context, core, name, body, draft = false, prerelease = false }) {
  try {
    core.info(`Creating '${name}' release...`);
    const response = await github.rest.repos.createRelease({
      owner: context.repo.owner,
      repo: context.repo.repo,
      name: name,
      tag_name: name,
      body: body,
      draft: draft,
      prerelease: prerelease
    });
    const release = response.data;
    const releaseData = {
      id: release.id,
      name: release.name,
      tag_name: release.name,
      body: release.body,
      created_at: release.created_at,
      draft: release.draft,
      prerelease: release.prerelease,
      html_url: release.html_url
    };
    core.info(`Successfully created '${name}' release with ${releaseData.id} ID`);
    return releaseData;
  } catch (error) {
    utils.handleError(error, core, 'create release');
  }
}

/**
 * Creates a signed commit using GitHub's GraphQL API
 * 
 * This function creates a verified commit through GitHub's GraphQL API instead of
 * using the Git command line. This approach produces commits that are marked as "verified"
 * in the GitHub UI, as they're created through the API with GitHub's authentication.
 * 
 * The function handles:
 * - Validation of input parameters
 * - Creation of commits with multiple file additions and deletions
 * - Proper branch targeting and HEAD validation to prevent conflicts
 * - Error handling for the GraphQL operation
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls 
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {Object} params.git - Git-related parameters for the commit
 * @param {string} params.git.branchName - Branch name to commit to
 * @param {string} params.git.expectedHeadOid - Expected HEAD SHA of the branch (for validation)
 * @param {Array<Object>} params.git.additions - Files to add/modify, each having {path, contents} where contents is base64 encoded
 * @param {Array<Object>} params.git.deletions - Files to delete, each having {path}
 * @param {string} params.git.commitMessage - Commit message headline
 * @returns {Promise<string|null>} - OID (SHA) of the created commit or null if no changes
 */
async function createSignedCommit({ github, context, core, git }) {
  try {
    core.info('Creating signed commit...');
    if (!git.branchName) {
      throw new Error('branchName is required');
    }
    if (!git.expectedHeadOid) {
      throw new Error('expectedHeadOid is required');
    }
    if (!git.commitMessage) {
      throw new Error('commitMessage is required');
    }
    if (!(git.additions.length + git.deletions.length)) {
      core.info('No changes to commit');
      return null;
    }
    const input = {
      branch: {
        repositoryNameWithOwner: context.payload.repository.full_name,
        branchName: git.branchName
      },
      expectedHeadOid: git.expectedHeadOid,
      fileChanges: {
        additions: git.additions,
        deletions: git.deletions
      },
      message: { headline: git.commitMessage }
    };
    const mutation = `
      mutation($input: CreateCommitOnBranchInput!) {
        createCommitOnBranch(input: $input) {
          commit {
            oid
          }
        }
      }
    `;
    const { createCommitOnBranch } = await github.graphql(mutation, { input });
    const commitOid = createCommitOnBranch.commit.oid;
    core.info(`Successfully created signed commit with '${commitOid}' OID`);
    return commitOid;
  } catch (error) {
    utils.handleError(error, core, 'create signed commit');
  }
}

/**
 * Deletes all versions of a package from GitHub Container Registry
 * 
 * This function finds and deletes all versions of a package from GitHub Container Registry
 * using REST API. It uses the _getOciPackageVersionIds helper to retrieve all version IDs
 * and then deletes each version in sequence.
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {Object} params.package - Package information
 * @param {string} params.package.name - Name of the package
 * @param {string} params.package.type - Type of package ('application' or 'library')
 * @returns {Promise<boolean>} - True if at least one package version was deleted successfully, false otherwise
 */
async function deleteOciPackage({ github, context, core, package }) {
  const packageName = [context.repo.repo, package.type, package.name].join('/');
  try {
    core.info(`Deleting '${packageName}' OCI package...`);
    const versionIds = await _getOciPackageVersionIds({ github, context, core, package });
    if (!versionIds.length) return false;
    const repoType = await _getRepositoryType({ github, core, owner: context.repo.owner });
    const isOrg = repoType === 'organization';
    let counter = 0;
    for (const version of versionIds) {
      try {
        await github.rest.packages[isOrg
          ? 'deletePackageVersionForOrg'
          : 'deletePackageVersionForUser']({
            [isOrg ? 'org' : 'username']: context.repo.owner,
            package_name: encodeURIComponent(packageName),
            package_type: 'container',
            version_id: version.id
          });
        counter++;
      } catch (error) {
        utils.handleError(error, core, `delete version ${version.version} of '${packageName}' OCI package`, false);
      }
    }
    core.info(`Successfully deleted '${packageName}' OCI package`);
    return counter > 0;
  } catch (error) {
    utils.handleError(error, core, `delete '${packageName}' OCI package`, false);
    return false;
  }
}

/**
 * Deletes all releases for a chart from GitHub
 * 
 * This function finds and deletes all releases for a specific chart from GitHub
 * using the REST API. It uses the _getReleaseIds helper to retrieve all release IDs
 * and then deletes each release in sequence.
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {string} params.chart - Name of the chart whose releases should be deleted
 * @returns {Promise<boolean>} - True if at least one release was deleted successfully, false otherwise
 */
async function deleteReleases({ github, context, core, chart }) {
  try {
    core.info(`Deleting releases for '${chart}' chart...`);
    const releaseIds = await _getReleaseIds({ github, context, core, chart });
    if (!releaseIds.length) {
      core.info(`No releases found for '${chart}' chart`);
      return false;
    }
    let counter = 0;
    const promises = releaseIds.map(async (release) => {
      try {
        await github.rest.git.deleteRef({
          owner: context.repo.owner,
          repo: context.repo.repo,
          ref: ['tags', release.tagName].join('/')
        });
        await github.rest.repos.deleteRelease({
          owner: context.repo.owner,
          repo: context.repo.repo,
          release_id: release.databaseId
        });
        return { success: true, tagName: release.tagName };
      } catch (error) {
        utils.handleError(error, core, `delete release '${release.tagName}'`, false);
        return { success: false, tagName: release.tagName };
      }
    });
    const results = await Promise.all(promises);
    counter = results.filter((result) => result.success).length;
    const word = counter === 1 ? 'release' : 'releases';
    core.info(`Successfully deleted ${counter} ${word} for '${chart}' chart`);
    return counter > 0;
  } catch (error) {
    utils.handleError(error, core, `delete releases for '${chart}' chart`, false);
    return false;
  }
}

/**
 * Checks if a GitHub release with the specified tag exists
 * 
 * Queries the GitHub API using GraphQL to determine if a release with the given tag name
 * already exists in the repository. This is used to prevent duplicate releases and
 * to determine whether to create a new release or skip the existing one based on the
 * skipExisting configuration setting.
 * 
 * The function returns detailed information about the release in a standardized format
 * if found, or null if no matching release exists.
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {string} params.tagName - The tag name to check for
 * @returns {Promise<Object|null>} - Standardized release data if found, null if not found
 */
async function getReleaseByTag({ github, context, core, tagName }) {
  try {
    const releases = await _getReleases({ github, context, core, options: { tagName } });
    return releases.length > 0 ? releases[0] : null;
  } catch (error) {
    if (error.errors && error.errors.some(e => e.type === 'NOT_FOUND')) {
      return null;
    }
    utils.handleError(error, core, `check for release with tag ${tagName}`);
  }
}

/**
 * Gets GitHub releases with optional tag prefix filtering
 * 
 * This function retrieves GitHub releases with flexible filtering options:
 * - When tagPrefix is provided, it returns releases where tag_name starts with that prefix
 * - When tagPrefix is omitted, it returns all repository releases
 * - The limit parameter can be used to restrict the number of results
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {string} [params.tagPrefix] - Optional prefix to match for tag names
 * @param {number} [params.limit=0] - Maximum number of releases to return (0 for all)
 * @returns {Promise<Array>} - Array of matching release objects or empty array if none found
 */
async function getReleases({ github, context, core, tagPrefix, limit = 0 }) {
  return _getReleases({ github, context, core, options: tagPrefix ? { tagPrefix, limit } : { limit } });
}

/**
 * Fetches issues related to a specific chart since the last release
 * 
 * Identifies and filters issues that are related to a particular chart based on
 * content in the issue body. It uses GraphQL to efficiently query issues and
 * returns only those that are specifically related to the specified chart.
 * 
 * The function:
 * 1. Determines the date of the last release for the chart
 * 2. Queries for issues created or updated since that date
 * 3. Filters issues by analyzing their body content to find chart-related issues
 * 4. Returns a standardized array of relevant issues with their details
 * 
 * These issues are used in generating release notes for new chart versions.
 * 
 * @param {Object} options - Function parameters
 * @param {Object} options.github - GitHub API client for making API calls
 * @param {Object} options.context - GitHub Actions context containing repository information
 * @param {Object} options.core - GitHub Actions Core API for logging and output
 * @param {string} options.chartName - Name of the chart to find issues for
 * @param {string} options.chartType - Type of chart ('application' or 'library')
 * @param {number} [options.maxIssues=50] - Maximum number of issues to retrieve
 * @returns {Promise<Array>} - Array of chart-related issues with standardized properties
 */
async function getReleaseIssues({ github, context, core, chartName, chartType, maxIssues = 50 }) {
  const chartPath = `${chartType}/${chartName}`;
  try {
    core.info(`Fetching '${chartPath}' chart issues...`);
    const lastReleaseDate = await _getLastReleaseDate({
      github,
      context,
      core,
      chartName
    });
    const queryParams = lastReleaseDate
      ? '($owner: String!, $repo: String!, $maxIssues: Int!, $lastReleaseDate: DateTime)'
      : '($owner: String!, $repo: String!, $maxIssues: Int!)';
    const filterByClause = lastReleaseDate
      ? 'filterBy: {since: $lastReleaseDate},'
      : '';
    const query = `
      query${queryParams} {
        repository(owner: $owner, name: $repo) {
          issues(
            first: $maxIssues, 
            states: [OPEN, CLOSED], 
            orderBy: {field: UPDATED_AT, direction: DESC},
            ${filterByClause}
          ) {
            nodes { number state title url bodyText labels(first: 10) { nodes { name } } }
          }
        }
      }
    `;
    const variables = {
      owner: context.repo.owner,
      repo: context.repo.repo,
      maxIssues: maxIssues
    };
    if (lastReleaseDate) {
      variables.lastReleaseDate = lastReleaseDate;
    }
    const result = await github.graphql(query, variables);
    const allIssues = result.repository.issues.nodes;
    const chartNameRegex = new RegExp(`chart:\\s*${chartName}\\b`, 'i');
    const relevantIssues = allIssues.filter(issue => {
      const hasChartName = chartNameRegex.test(issue.bodyText);
      const hasChartTypeLabel = issue.labels.nodes.some(label => label.name === chartType);
      return hasChartName && hasChartTypeLabel;
    });
    if (!relevantIssues.length) {
      core.info(`Found no issues for '${chartPath}' chart`);
    } else {
      const word = relevantIssues.length === 1 ? 'issue' : 'issues';
      core.info(`Successfully fetched ${relevantIssues.length} ${word} for '${chartPath}' chart`);
    }
    const issues = relevantIssues.map(issue => ({
      Labels: issue.labels.nodes.map(label => label.name),
      Number: issue.number,
      State: issue.state,
      Title: issue.title,
      URL: issue.url
    }));
    return issues;
  } catch (error) {
    utils.handleError(error, core, `fetch issues for '${chartPath}' chart`);
  }
}

/**
 * Gets the list of updated files from a push event or pull request
 * 
 * This function retrieves all files that were changed, added, or removed in either
 * a push event or a pull request. It detects the event type and uses the appropriate
 * GitHub API to fetch comprehensive file information.
 * 
 * For pull requests, it uses GraphQL with pagination to get all changed files.
 * For push events, it uses the compareCommits REST API to get files between commits.
 * 
 * The function is used to identify which charts have been modified and need
 * to be repackaged, have their dependencies updated, or be released.
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @returns {Promise<Object>} - Object mapping file paths to their Git change types (added, deleted, modified, renamed)
 */
async function getUpdatedFiles({ github, context, core }) {
  const files = {};
  const eventName = context.eventName;
  try {
    if (eventName === 'pull_request' && (!context.payload.pull_request || !context.payload.pull_request.number)) {
      return files;
    }
    if (eventName === 'push' && (!context.payload.before || !context.payload.after)) {
      return files;
    }
  } catch (error) {
    utils.handleError(error, core, 'validate event name', false);
    return files;
  }
  try {
    if (eventName === 'pull_request') {
      const query = `
        query($owner: String!, $repo: String!, $prNumber: Int!, $cursor: String) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $prNumber) {
              files(first: 100, after: $cursor) {
                nodes {
                  path
                  changeType
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        }
      `;
      let endCursor = null;
      let hasNextPage = true;
      while (hasNextPage) {
        const variables = {
          owner: context.repo.owner,
          repo: context.repo.repo,
          prNumber: context.payload.pull_request.number,
          cursor: endCursor
        };
        const result = await github.graphql(query, variables);
        result.repository.pullRequest.files.nodes.forEach(node => {
          files[node.path] = node.changeType.toLowerCase();
        });
        const pageInfo = result.repository.pullRequest.files.pageInfo;
        hasNextPage = pageInfo.hasNextPage;
        endCursor = pageInfo.endCursor;
      }
      const fileCount = Object.keys(files).length;
      if (fileCount > 0) {
        const word = fileCount === 1 ? 'file' : 'files';
        core.info(`Found ${fileCount} updated ${word} in pull request #${context.payload.pull_request.number}`);
      }
      return files;
    }
    if (eventName === 'push') {
      const response = await github.rest.repos.compareCommits({
        owner: context.repo.owner,
        repo: context.repo.repo,
        base: context.payload.before,
        head: context.payload.after
      });
      response.data.files.forEach(file => {
        files[file.filename] = file.status;
      });
      const fileCount = Object.keys(files).length;
      if (fileCount > 0) {
        const word = fileCount === 1 ? 'file' : 'files';
        core.info(`Found ${fileCount} updated ${word} in push event`);
      }
      return files;
    }
    return files;
  } catch (error) {
    utils.handleError(error, core, `get updated files for '${eventName}' event`, false);
    return files;
  }
}

/**
 * Uploads an asset to a GitHub release
 * 
 * Attaches a file as an asset to an existing GitHub release using the REST API.
 * This function is used to upload packaged chart files (.tgz) to their corresponding
 * GitHub releases, making them available for download.
 * 
 * The function handles binary data upload and returns detailed information about
 * the uploaded asset from the GitHub API response.
 * 
 * @param {Object} options - Function parameters
 * @param {Object} options.github - GitHub API client for making API calls
 * @param {Object} options.context - GitHub Actions context containing repository information
 * @param {Object} options.core - GitHub Actions Core API for logging and output
 * @param {number} options.releaseId - ID of the GitHub release to attach the asset to
 * @param {string} options.assetName - Name of the asset file to upload
 * @param {Buffer|string} options.assetData - Content of the asset to upload
 * @returns {Promise<Object>} - The uploaded asset data from GitHub API
 */
async function uploadReleaseAsset({ github, context, core, releaseId, assetName, assetData }) {
  try {
    core.info(`Uploading '${assetName}' asset to ${releaseId} ID...`);
    const asset = await github.rest.repos.uploadReleaseAsset({
      owner: context.repo.owner,
      repo: context.repo.repo,
      release_id: releaseId,
      name: assetName,
      data: assetData
    });
    return asset.data;
  } catch (error) {
    utils.handleError(error, core, 'upload release asset');
  }
}

/**
 * Exports the module's functions
 */
module.exports = {
  checkWorkflowRunStatus,
  createRelease,
  createSignedCommit,
  deleteReleases,
  deleteOciPackage,
  getReleaseByTag,
  getReleases,
  getReleaseIssues,
  getUpdatedFiles,
  uploadReleaseAsset
};
