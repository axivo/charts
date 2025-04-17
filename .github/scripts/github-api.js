/**
 * GitHub API Utilities
 * 
 * This module provides centralized functions for interacting with the GitHub API:
 * - Fetching repository issues
 * - Retrieving release information
 * - Creating GitHub releases
 * - Uploading release assets
 * 
 * @module github-api
 */

const utils = require('./utils');

/**
 * Configuration constants for GitHub API module
 * Contains settings for release issue labels filtering and other API-related parameters
 */
const CONFIG = {
  release: {
    labels: ['bug', 'feature']
  }
};

/**
 * Gets the date of the last release for a chart
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
 * Creates a new GitHub release
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
    const relevantIssues = allIssues.filter(issue => {
      const chartDropdownRegex = /### Related Chart\s*\n\s*([^\n]+)/;
      const dropdownMatch = issue.bodyText.match(chartDropdownRegex);
      const isChartRelated = dropdownMatch && dropdownMatch[1].trim() === `${chartName} (${chartType})`;
      const isLabelRelated = issue.labels.nodes.some(label => CONFIG.release.labels.includes(label.name));
      return isChartRelated && isLabelRelated
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

module.exports = {
  createRelease,
  getReleaseByTag,
  getReleaseIssues,
  uploadReleaseAsset
};
