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
 * @param {Object} options - Function parameters
 * @param {Object} options.github - GitHub API client for making API calls 
 * @param {Object} options.context - GitHub Actions context containing repository information
 * @param {Object} options.core - GitHub Actions Core API for logging and output
 * @param {string} options.branchName - Branch name to commit to
 * @param {string} options.expectedHeadOid - Expected HEAD SHA of the branch (for validation)
 * @param {Array<Object>} options.additions - Files to add/modify, each having {path, contents} where contents is base64 encoded
 * @param {Array<Object>} options.deletions - Files to delete, each having {path}
 * @param {string} options.commitMessage - Commit message headline
 * @returns {Promise<string|null>} - OID (SHA) of the created commit or null if no changes
 */
async function createSignedCommit({ github, context, core, branchName, expectedHeadOid, additions = [], deletions = [], commitMessage }) {
  try {
    core.info('Creating signed commit...');
    if (!branchName) {
      throw new Error('branchName is required');
    }
    if (!expectedHeadOid) {
      throw new Error('expectedHeadOid is required');
    }
    if (!commitMessage) {
      throw new Error('commitMessage is required');
    }
    if (!(additions.length + deletions.length)) {
      core.info('No changes to commit');
      return null;
    }
    const input = {
      branch: {
        repositoryNameWithOwner: context.payload.repository.full_name,
        branchName: branchName
      },
      expectedHeadOid: expectedHeadOid,
      fileChanges: {
        additions: additions,
        deletions: deletions
      },
      message: { headline: commitMessage }
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
 * Deletes a specific package version from GitHub Container Registry
 * 
 * This function finds and deletes a specific package version from GitHub Container Registry
 * using GraphQL API. It first queries for the exact package version by name and version,
 * then deletes it if found. This is used during OCI chart publishing to ensure clean
 * re-publishing of versions without conflicts.
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {Object} params.package - Package information
 * @param {string} params.package.name - Name of the package
 * @param {string} params.package.type - Type of package ('application' or 'library')
 * @param {string} params.package.version - Version of the package
 * @returns {Promise<boolean>} - True if package was deleted successfully, false otherwise
 */
async function deleteOciPackage({ github, context, core, package }) {
  const packageName = [package.type, package.name].join('/');
  try {
    core.info(`Searching for '${packageName}:${package.version}' package...`);
    const query = `
      query($owner: String!, $repo: String!, $packageName: String!, $version: String!) {
        repository(owner: $owner, name: $repo) {
          packages(first: 1, names: [$packageName]) {
            nodes {
              name
              version(version: $version) {
                id
              }
            }
          }
        }
      }
    `;
    const result = await github.graphql(query, {
      owner: context.repo.owner,
      repo: context.repo.repo,
      packageName,
      version: package.version
    });
    const nodes = result.repository.packages.nodes;
    if (!nodes.length || !nodes[0].version) {
      core.info(`Package '${packageName}:${package.version}' not found, skipping deletion`);
      return false;
    }
    const versionId = nodes[0].version.id;
    core.info(`Deleting '${packageName}:${package.version}' package with '${versionId}' ID...`);
    const mutation = `
      mutation($versionId: ID!) {
        deletePackageVersion(input: { packageVersionId: $versionId }) {
          success
        }
      }
    `;
    const deleteResult = await github.graphql(mutation, { versionId });
    if (deleteResult.deletePackageVersion.success) {
      core.info(`Successfully deleted '${packageName}:${package.version}' package`);
      return true;
    }
    return false;
  } catch (error) {
    utils.handleError(error, core, `delete '${packageName}:${package.version}' package`, false);
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
 * @param {string} [params.eventType='pull_request'] - Event type to process ('pull_request' or 'push')
 * @returns {Promise<string[]>} - Array of file paths that were changed or added
 */
async function getUpdatedFiles({ github, context, core, eventType = 'pull_request' }) {
  const files = [];
  try {
    if (!['pull_request', 'push'].includes(eventType)) {
      throw new Error(`'${eventType}'`);
    }
    if (eventType === 'pull_request' && (!context.payload.pull_request || !context.payload.pull_request.number)) {
      return files;
    }
    if (eventType === 'push' && (!context.payload.before || !context.payload.after)) {
      return files;
    }
  } catch (error) {
    utils.handleError(error, core, 'validate event type', false);
    return files;
  }
  try {
    if (eventType === 'pull_request') {
      const query = `
        query($owner: String!, $repo: String!, $prNumber: Int!, $cursor: String) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $prNumber) {
              files(first: 100, after: $cursor) {
                nodes {
                  path
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
        const newFiles = result.repository.pullRequest.files.nodes.map(node => node.path);
        files.push(...newFiles);
        const pageInfo = result.repository.pullRequest.files.pageInfo;
        hasNextPage = pageInfo.hasNextPage;
        endCursor = pageInfo.endCursor;
      }
      if (files.length > 0) {
        const word = files.length === 1 ? 'file' : 'files';
        core.info(`Found ${files.length} updated ${word} in pull request #${context.payload.pull_request.number}`);
      }
      return files;
    }
    if (eventType === 'push') {
      const response = await github.rest.repos.compareCommits({
        owner: context.repo.owner,
        repo: context.repo.repo,
        base: context.payload.before,
        head: context.payload.after
      });
      response.data.files.forEach(file => {
        files.push(file.filename);
      });
      if (files.length > 0) {
        const word = files.length === 1 ? 'file' : 'files';
        core.info(`Found ${files.length} updated ${word} in push event`);
      }
      return files;
    }
    return files;
  } catch (error) {
    utils.handleError(error, core, `get updated files for '${eventType}' event`, false);
    return files;
  }
}

/**
 * Sets OCI package visibility to public, private or internal
 * 
 * This function changes the visibility of a package in GitHub Container Registry
 * using Octokit REST API. It makes the package public (accessible to anyone),
 * private (accessible only to organization members with proper permissions) or
 * internal (accessible only to all organization members).
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {Object} params.package - Package information
 * @param {string} params.package.name - Name of the package
 * @param {string} params.package.type - Type of package ('application' or 'library')
 * @param {string} params.package.visibility - Whether to make the package public, private or internal
 * @returns {Promise<boolean>} - True if visibility was updated successfully, false otherwise
 */
async function setOciPackageVisibility({ github, context, core, package }) {
  const packageName = [context.repo.repo, package.type, package.name].join('/');
  try {
    const visibility = package.visibility;
    core.info(`Setting '${packageName}' package visibility to '${visibility}'...`);
    let params = {
      package_name: packageName,
      package_type: config('repository').oci.packages.type,
      visibility
    };
    const { data: response } = await github.rest.users.getByUsername({ username: context.repo.owner });
    if (response.type === 'User') {
      params.username = context.repo.owner;
      await github.request('PATCH /user/packages/{package_type}/{package_name}', params);
    } else {
      params.org = context.repo.owner;
      await github.request('PATCH /orgs/{org}/packages/{package_type}/{package_name}', params);
    }
    core.info(`Successfully set '${packageName}' package visibility to '${visibility}'`);
    return true;
  } catch (error) {
    utils.handleError(error, core, `set visibility for '${packageName}' package`, false);
    return false;
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
  deleteOciPackage,
  getReleaseByTag,
  getReleases,
  getReleaseIssues,
  getUpdatedFiles,
  setOciPackageVisibility,
  uploadReleaseAsset
};
