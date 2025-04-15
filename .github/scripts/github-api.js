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
 * @param {Object} options - Options for fetching the last release
 * @param {Object} options.github - GitHub API client
 * @param {Object} options.context - GitHub Actions context
 * @param {Object} options.core - GitHub Actions Core API for logging
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
      return chartReleases[0].createdAt;
    }
    return null;
  } catch (error) {
    const errorMessage = error.errors ? error.errors.map(e => e.message).join(', ') : error.message;
    core.warning(`Failed to get last release date for ${chartName}: ${errorMessage}`);
    return null;
  }
}

/**
 * Creates a new GitHub release
 * 
 * @param {Object} options - Options for creating the release
 * @param {Object} options.github - GitHub API client
 * @param {Object} options.context - GitHub Actions context
 * @param {Object} options.core - GitHub Actions Core API for logging
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
    const query = `
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          id
        }
      }
    `;
    const variables = {
      owner: context.repo.owner,
      repo: context.repo.repo
    };
    const result = await github.graphql(query, variables);
    const repositoryId = result.repository.id;
    const mutation = `
      mutation($input: CreateReleaseInput!) {
        createRelease(input: $input) {
          release {
            id
            databaseId
            name
            tagName
            createdAt
            isDraft
            isPrerelease
            url
            description
          }
        }
      }
    `;
    const mutationVariables = {
      input: {
        repositoryId: repositoryId,
        tagName: tagName,
        name: name,
        description: body,
        isDraft: draft,
        isPrerelease: prerelease
      }
    };
    const mutationResult = await github.graphql(mutation, mutationVariables);
    const release = mutationResult.createRelease.release;
    const releaseData = {
      id: release.databaseId,
      name: release.name,
      tag_name: release.tagName,
      body: release.description,
      created_at: release.createdAt,
      draft: release.isDraft,
      prerelease: release.isPrerelease,
      html_url: release.url
    };
    core.info(`Successfully created ${name} release with ${releaseData.id} id`);
    return releaseData;
  } catch (error) {
    const errorMessage = error.errors ? error.errors.map(e => e.message).join(', ') : error.message;
    core.warning(`Failed to create release: ${errorMessage}`);
    throw error;
  }
}

/**
 * Checks if a GitHub release with the specified tag exists
 * 
 * @param {Object} options - Options for checking the release
 * @param {Object} options.github - GitHub API client
 * @param {Object} options.context - GitHub Actions context
 * @param {Object} options.core - GitHub Actions Core API for logging
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
      core.info(`Found existing release with tag ${tagName}`);
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
    const errorMessage = error.errors ? error.errors.map(e => e.message).join(', ') : error.message;
    core.warning(`Error checking for release with tag ${tagName}: ${errorMessage}`);
    throw error;
  }
}

/**
 * Fetches issues related to a specific chart since the last release
 * 
 * @param {Object} options - Options for fetching issues
 * @param {Object} options.github - GitHub API client
 * @param {Object} options.context - GitHub Actions context
 * @param {Object} options.core - GitHub Actions Core API for logging
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
      const hasRequiredLabel = issue.labels.nodes.some(label => CONFIG.release.labels.includes(label.name));
      return hasRequiredLabel;
    });
    core.info(`Found ${relevantIssues.length} closed issues for ${chartPath} chart`);
    const issues = relevantIssues.map(issue => ({
      Labels: issue.labels.nodes.map(label => label.name),
      Number: issue.number,
      State: issue.state,
      Title: issue.title,
      URL: issue.url
    }));
    return issues;
  } catch (error) {
    const errorMessage = error.errors ? error.errors.map(e => e.message).join(', ') : error.message;
    core.warning(`Failed to fetch issues for ${chartPath} chart: ${errorMessage}`);
    return [];
  }
}

/**
 * Uploads an asset to a GitHub release
 * 
 * @param {Object} options - Options for uploading the asset
 * @param {Object} options.github - GitHub API client
 * @param {Object} options.context - GitHub Actions context
 * @param {Object} options.core - GitHub Actions Core API for logging
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
    // GraphQL API doesn't support file uploads, using REST API for this specific function
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
    core.warning(`Failed to upload release asset: ${error.message}`);
    throw error;
  }
}

module.exports = {
  createRelease,
  getReleaseByTag,
  getReleaseIssues,
  uploadReleaseAsset
};
