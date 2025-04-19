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
 * Searches through all GitHub releases to find the most recent one
 * for a specific chart and returns its creation date.
 * 
 * @param {Object} options - Function parameters
 * @param {Object} options.github - GitHub API client
 * @param {Object} options.context - GitHub Actions context for repository info
 * @param {Object} options.core - GitHub Actions Core API for logging and output
 * @param {string} options.chartName - Name of the chart
 * @returns {Promise<string|null>} - ISO date string of the last release or null if none found
 */
async function _getLastReleaseDate({
  github,
  context,
  core,
  chartName
}) {
  try {
    core.info(`Fetching last release date for ${chartName} chart...`);
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
    const chartReleases = releases.filter(release =>
      release.tagName.startsWith(`${chartName}-v`)
    ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (chartReleases.length > 0) {
      core.info(`Found last release date for ${chartName} chart: ${chartReleases[0].createdAt}`);
      return chartReleases[0].createdAt;
    }
    core.info(`No previous releases found for ${chartName} chart`);
    return null;
  } catch (error) {
    utils.handleError(error, core, `get last release date for ${chartName}`);
  }
}

/**
 * Checks if a workflow run has any warnings or errors using GraphQL API
 * 
 * Analyzes a specific workflow run to determine if it has encountered any issues,
 * including failures, warnings, or annotations. This helps identify problematic
 * runs that may require attention.
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client
 * @param {Object} params.context - GitHub Actions context for repository info
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {number} params.runId - The workflow run ID to check
 * @returns {Promise<boolean>} - True if the workflow run has warnings or errors, false otherwise
 */
async function checkWorkflowRunStatus({
  github,
  context,
  core,
  runId
}) {
  try {
    core.info(`Checking workflow run ${runId} status...`);
    const query = `
      query($owner: String!, $repo: String!, $runId: Int!) {
        repository(owner: $owner, name: $repo) {
          workflowRuns(first: 1, where: {runId: $runId}) {
            nodes {
              conclusion
              checkSuites(first: 20) {
                nodes {
                  conclusion
                  checkRuns(first: 20) {
                    nodes {
                      conclusion
                      annotations(first: 20) {
                        nodes {
                          annotationLevel
                        }
                      }
                    }
                  }
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
      runId: parseInt(runId, 10)
    };
    const result = await github.graphql(query, variables);
    const workflowRuns = result.repository?.workflowRuns?.nodes || [];
    const workflowRun = workflowRuns[0];
    if (!workflowRun) {
      core.info(`No workflow run found with ID ${runId}`);
      return false;
    }
    if (workflowRun.conclusion === 'SUCCESS' || workflowRun.conclusion === null) {
      return false;
    }
    if (workflowRun.conclusion === 'FAILURE' || workflowRun.conclusion === 'CANCELLED') {
      core.info(`Workflow run concluded with ${workflowRun.conclusion}`);
      return true;
    }
    const hasIssues = workflowRun.checkSuites.nodes.some(suite =>
      suite.conclusion === 'FAILURE' ||
      suite.checkRuns.nodes.some(run =>
        run.conclusion === 'FAILURE' ||
        run.annotations.nodes.some(annotation =>
          annotation.annotationLevel === 'WARNING' ||
          annotation.annotationLevel === 'FAILURE'
        )
      )
    );
    core.info(`Workflow run status check completed. Issues found: ${hasIssues}`);
    return hasIssues;
  } catch (error) {
    utils.handleError(error, core, 'check workflow run status', false);
    return true;
  }
}

/**
 * Creates a new GitHub release
 * 
 * Publishes a new release on GitHub with the specified tag, name, and content.
 * The function handles all the necessary API calls and returns the created release
 * data with standardized format.
 * 
 * @param {Object} options - Function parameters
 * @param {Object} options.github - GitHub API client
 * @param {Object} options.context - GitHub Actions context for repository info
 * @param {Object} options.core - GitHub Actions Core API for logging and output
 * @param {string} options.tagName - Tag name for the release
 * @param {string} options.name - Display name for the release
 * @param {string} options.body - Body content of the release
 * @param {boolean} [options.draft=false] - Whether the release is a draft
 * @param {boolean} [options.prerelease=false] - Whether the release is a prerelease
 * @returns {Promise<Object>} - The created release data
 */
async function createRelease({
  github,
  context,
  core,
  tagName,
  name,
  body,
  draft = false,
  prerelease = false
}) {
  try {
    core.info(`Creating ${name} release with ${tagName} tag...`);
    const response = await github.rest.repos.createRelease({
      owner: context.repo.owner,
      repo: context.repo.repo,
      tag_name: tagName,
      name: name,
      body: body,
      draft: draft,
      prerelease: prerelease
    });
    const release = response.data;
    const releaseData = {
      id: release.id,
      name: release.name,
      tag_name: release.tag_name,
      body: release.body,
      created_at: release.created_at,
      draft: release.draft,
      prerelease: release.prerelease,
      html_url: release.html_url
    };
    core.info(`Successfully created ${name} release with ${releaseData.id} id`);
    return releaseData;
  } catch (error) {
    utils.handleError(error, core, 'create release');
  }
}

/**
 * Checks if a GitHub release with the specified tag exists
 * 
 * Queries the GitHub API to determine if a release with the given tag name
 * already exists in the repository. If found, it returns detailed information
 * about the release in a standardized format.
 * 
 * @param {Object} options - Function parameters
 * @param {Object} options.github - GitHub API client
 * @param {Object} options.context - GitHub Actions context for repository info
 * @param {Object} options.core - GitHub Actions Core API for logging and output
 * @param {string} options.tagName - The tag name to check
 * @returns {Promise<Object|null>} - Release data if found, null if not found
 */
async function getReleaseByTag({
  github,
  context,
  core,
  tagName
}) {
  try {
    core.info(`Checking for release with tag ${tagName}...`);
    const query = `
      query($owner: String!, $repo: String!, $tagName: String!) {
        repository(owner: $owner, name: $repo) {
          release(tagName: $tagName) {
            id
            databaseId
            name
            description
            tagName
            createdAt
            isDraft
            isPrerelease
            url
          }
        }
      }
    `;
    const variables = {
      owner: context.repo.owner,
      repo: context.repo.repo,
      tagName: tagName
    };
    const result = await github.graphql(query, variables);
    if (result.repository.release) {
      core.info(`Found existing release with tag ${tagName}...`);
      return {
        id: result.repository.release.databaseId,
        name: result.repository.release.name,
        body: result.repository.release.description,
        tag_name: result.repository.release.tagName,
        created_at: result.repository.release.createdAt,
        draft: result.repository.release.isDraft,
        prerelease: result.repository.release.isPrerelease,
        html_url: result.repository.release.url
      };
    }
    return null;
  } catch (error) {
    if (error.errors && error.errors.some(e => e.type === 'NOT_FOUND')) {
      return null;
    }
    utils.handleError(error, core, `check for release with tag ${tagName}`);
  }
}

/**
 * Fetches issues related to a specific chart since the last release
 * 
 * Identifies and filters issues that are related to a particular chart based on
 * specific criteria including issue body content and labels. It uses GraphQL to
 * efficiently query issues and returns only those relevant to the specified chart.
 * 
 * @param {Object} options - Function parameters
 * @param {Object} options.github - GitHub API client
 * @param {Object} options.context - GitHub Actions context for repository info
 * @param {Object} options.core - GitHub Actions Core API for logging and output
 * @param {string} options.chartType - Type of chart (application/library)
 * @param {string} options.chartName - Name of the chart
 * @param {number} [options.maxIssues=50] - Maximum number of issues to retrieve
 * @returns {Promise<Array>} - Array of issues with details
 */
async function getReleaseIssues({
  github,
  context,
  core,
  chartType,
  chartName,
  maxIssues = 50
}) {
  const chartPath = `${chartType}/${chartName}`;
  try {
    core.info(`Fetching issues for ${chartPath} chart...`);
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
    core.info(`Querying GitHub API for ${chartPath} related issues...`);
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
    const chartHeaderText = config('issue').header;
    const chartDropdownRegex = new RegExp(`${chartHeaderText}\\s*\\n\\s*([^\\n]+)`);
    const relevantIssues = allIssues.filter(issue => {
      const dropdownMatch = issue.bodyText.match(chartDropdownRegex);
      const isChartRelated = dropdownMatch && dropdownMatch[1].trim() === `${chartName} (${chartType})`;
      return isChartRelated;
    });
    core.info(`Found ${relevantIssues.length} relevant issues for ${chartPath} chart`);
    const issues = relevantIssues.map(issue => ({
      Labels: issue.labels.nodes.map(label => label.name),
      Number: issue.number,
      State: issue.state,
      Title: issue.title,
      URL: issue.url
    }));
    return issues;
  } catch (error) {
    utils.handleError(error, core, `fetch issues for ${chartPath} chart`);
  }
}

/**
 * Uploads an asset to a GitHub release
 * 
 * Attaches a file as an asset to an existing GitHub release. This function handles
 * the binary data upload process and ensures proper association with the specified
 * release ID. It returns detailed information about the uploaded asset.
 * 
 * @param {Object} options - Function parameters
 * @param {Object} options.github - GitHub API client
 * @param {Object} options.context - GitHub Actions context for repository info
 * @param {Object} options.core - GitHub Actions Core API for logging and output
 * @param {number} options.releaseId - ID of the release to attach the asset to
 * @param {string} options.assetName - Name of the asset to upload
 * @param {Buffer|string} options.assetData - Content of the asset to upload
 * @returns {Promise<Object>} - The uploaded asset data
 */
async function uploadReleaseAsset({
  github,
  context,
  core,
  releaseId,
  assetName,
  assetData
}) {
  try {
    core.info(`Uploading ${assetName} asset to ${releaseId} release id...`);
    const asset = await github.rest.repos.uploadReleaseAsset({
      owner: context.repo.owner,
      repo: context.repo.repo,
      release_id: releaseId,
      name: assetName,
      data: assetData
    });
    core.info(`Successfully uploaded ${assetName} asset`);
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
  getReleaseByTag,
  getReleaseIssues,
  uploadReleaseAsset
};
