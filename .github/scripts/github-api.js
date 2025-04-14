/**
 * GitHub API Utilities
 * 
 * This module provides centralized functions for interacting with the GitHub API:
 * - Fetching repository issues
 * - Retrieving release information
 * 
 * @module github-api
 */

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
    const releases = await github.rest.repos.listReleases({
      owner: context.repo.owner,
      repo: context.repo.repo,
      per_page: 100
    });
    const chartReleases = releases.data.filter(release =>
      release.tag_name.startsWith(`${chartName}-v`)
    ).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (chartReleases.length > 0) {
      return chartReleases[0].created_at;
    }
    return null;
  } catch (error) {
    core.warning(`Failed to get last release date for ${chartName}: ${error.message}`);
    return null;
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
    core.info(`Fetching closed issues for ${chartPath} chart ...`);
    const lastReleaseDate = await _getLastReleaseDate({
      github,
      context,
      core,
      chartName
    });
    const dateQuery = lastReleaseDate ? `closed:>=${lastReleaseDate}` : '';
    const query = `repo:${context.repo.owner}/${context.repo.repo} is:issue is:closed ${dateQuery} path:${chartPath}`;
    core.info(`Searching for issues with query: ${query}`);
    const issuesResponse = await github.rest.search.issuesAndPullRequests({
      q: query,
      per_page: maxIssues,
      sort: 'updated',
      order: 'desc'
    });
    core.info(`Found ${issuesResponse.data.items.length} closed issues for ${chartPath} chart.`);
    const issues = issuesResponse.data.items.map(issue => ({
      Labels: issue.labels.map(label => label.name),
      Number: issue.number,
      State: issue.state,
      Title: issue.title,
      URL: issue.html_url
    }));
    return issues;
  } catch (error) {
    core.warning(`Failed to fetch closed issues for ${chartPath} chart: ${error.message}`);
    return [];
  }
}

module.exports = {
  getReleaseIssues
};
