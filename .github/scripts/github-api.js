/**
 * GitHub API Utilities
 * 
 * This module provides centralized functions for interacting with the GitHub API:
 * - Fetching repository issues
 * - Processing issue references from commit messages
 * - Retrieving release information
 * 
 * @module github-api
 */

/**
 * Extract issue numbers from commit messages
 * 
 * @param {string} message - Commit message to analyze
 * @returns {Array<number>} - Array of issue numbers
 */
function extractIssueReferences(message) {
  const issueNumbers = [];
  const regex = /#(\d+)|issues\/(\d+)/g;
  let match;
  while ((match = regex.exec(message)) !== null) {
    const issueNumber = parseInt(match[1] || match[2], 10);
    if (!isNaN(issueNumber) && !issueNumbers.includes(issueNumber)) {
      issueNumbers.push(issueNumber);
    }
  }
  return issueNumbers;
}

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
async function getLastReleaseDate({
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
 * Fetches issues referenced in commits for a specific chart since the last release
 * 
 * @param {Object} options - Options for fetching issues
 * @param {Object} options.github - GitHub API client
 * @param {Object} options.context - GitHub Actions context
 * @param {Object} options.core - GitHub Actions Core API for logging
 * @param {string} options.chartType - Type of chart (application/library)
 * @param {string} options.chartName - Name of the chart
 * @param {number} [options.maxCommits=50] - Maximum number of commits to analyze
 * @returns {Promise<Array>} - Array of issues with details
 */
async function getReleaseIssues({
  github,
  context,
  core,
  chartType,
  chartName,
  maxCommits = 50
}) {
  try {
    const chartPath = `${chartType}/${chartName}`;
    core.info(`Fetching commits for chart: ${chartPath}`);
    const lastReleaseDate = await getLastReleaseDate({
      github,
      context,
      core,
      chartName
    });
    const commitParams = {
      owner: context.repo.owner,
      repo: context.repo.repo,
      path: chartPath,
      per_page: maxCommits
    };
    if (lastReleaseDate) {
      core.info(`Fetching commits since last release on ${lastReleaseDate}`);
      commitParams.since = lastReleaseDate;
    } else {
      core.info('No previous release found, fetching all recent commits');
    }
    const commitsResponse = await github.rest.repos.listCommits(commitParams);
    core.info(`Found ${commitsResponse.data.length} commits for ${chartPath}${lastReleaseDate ? ' since ' + lastReleaseDate : ''}`);
    const allIssueNumbers = [];
    commitsResponse.data.forEach(commit => {
      const commitMessage = commit.commit.message;
      const issueRefs = extractIssueReferences(commitMessage);
      issueRefs.forEach(issueNum => {
        if (!allIssueNumbers.includes(issueNum)) {
          allIssueNumbers.push(issueNum);
        }
      });
    });
    core.info(`Found ${allIssueNumbers.length} referenced issues in commits`);
    const issues = [];
    for (const issueNumber of allIssueNumbers) {
      try {
        const issueResponse = await github.rest.issues.get({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: issueNumber
        });
        issues.push({
          Labels: issueResponse.data.labels.map(label => label.name),
          Number: issueResponse.data.number,
          State: issueResponse.data.state,
          Title: issueResponse.data.title,
          URL: issueResponse.data.html_url
        });
      } catch (error) {
        core.warning(`Error fetching issue #${issueNumber}: ${error.message}`);
      }
    }
    core.info(`Successfully fetched ${issues.length} issues for ${chartPath}`);
    return issues;
  } catch (error) {
    core.warning(`Failed to fetch issues for chart ${chartType}/${chartName}: ${error.message}`);
    return [];
  }
}

module.exports = {
  extractIssueReferences,
  getLastReleaseDate,
  getReleaseIssues
};
