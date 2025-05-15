# Migration: getReleaseIssues

## Current Implementation
- Location: [github-api.js - getReleaseIssues()](https://github.com/fluxcd/charts/blob/main/.github/scripts/github-api.js#L195-L219)
- Purpose: Extracts issue references from release body and fetches issue details
- Dependencies: Octokit REST API client, regex pattern matching
- Used by: Release notes generation, issue tracking, changelog creation

## Code Analysis
The function parses release bodies for issue references in various formats (closes #123, fixes #456, etc.) and retrieves detailed information about each referenced issue.

### Current Logic Flow
1. Extracts issue numbers from release body using regex
2. Fetches issue details for each reference
3. Handles various issue reference formats
4. Returns array of issue objects
5. Gracefully handles invalid issue references

## Target Architecture
- Target Class: GitHubAPI
- Target Method: getReleaseIssues
- New Dependencies: Base GitHub API class, Error handler, Logger, Issue parser utility

## Implementation Steps
1. Create getReleaseIssues method in GitHubAPI class
2. Extract issue parsing logic to utility
3. Implement parallel issue fetching
4. Add caching for repeated lookups
5. Create backward compatibility wrapper
6. Test with various reference formats

## Backward Compatibility
```javascript
// github-api.js
const GitHubAPI = require('./.github/actions/services/GitHub');
let githubInstance;

async function getReleaseIssues(owner, repo, releaseBody) {
  if (!githubInstance) {
    githubInstance = new GitHubAPI({
      core: global.core,
      github: global.github
    });
  }
  return githubInstance.getReleaseIssues(owner, repo, releaseBody);
}

module.exports = {
  getReleaseIssues,
  // other functions...
};
```

## Testing Strategy
1. Unit test issue number extraction
2. Test various reference patterns
3. Mock issue API responses
4. Test error handling for invalid issues
5. Verify parallel fetching performance

## Code Examples

### Before (Legacy Implementation)
```javascript
const getReleaseIssues = async (owner, repo, releaseBody) => {
  const issuePattern = /(?:closes?|fixes?|resolves?)\s+#(\d+)/gi;
  const matches = [...releaseBody.matchAll(issuePattern)];
  const issueNumbers = [...new Set(matches.map(m => m[1]))];
  
  const issues = [];
  for (const number of issueNumbers) {
    try {
      const { data: issue } = await github.rest.issues.get({
        owner,
        repo,
        issue_number: parseInt(number)
      });
      issues.push(issue);
    } catch (error) {
      console.error(`Failed to get issue #${number}: ${error.message}`);
    }
  }
  
  return issues;
};
```

### After (New Implementation)
```javascript
const BaseGitHub = require('../core/GitHub');

class GitHubAPI extends BaseGitHub {
  constructor(context) {
    super(context);
    this.ISSUE_PATTERNS = [
      /(?:closes?|fixes?|resolves?)\s+#(\d+)/gi,
      /(?:closes?|fixes?|resolves?)\s+(?:issue\s+)?#(\d+)/gi
    ];
  }

  /**
   * Extracts and fetches issues referenced in a release body
   * 
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} releaseBody - Release description text
   * @returns {Promise<Array>} Array of issue objects
   */
  async getReleaseIssues(owner, repo, releaseBody) {
    try {
      const issueNumbers = this.extractIssueNumbers(releaseBody);
      this.logger.debug(`Found ${issueNumbers.size} issue references`);
      const issues = await Promise.all(
        Array.from(issueNumbers).map(async (number) => {
          try {
            const { data: issue } = await this.github.rest.issues.get({
              owner,
              repo,
              issue_number: parseInt(number)
            });
            return issue;
          } catch (error) {
            this.logger.warn(`Failed to get issue #${number}: ${error.message}`);
            return null;
          }
        })
      );
      const validIssues = issues.filter(issue => issue !== null);
      this.logger.info(`Retrieved ${validIssues.length} valid issues`);
      return validIssues;
    } catch (error) {
      throw this.errorHandler.handle(error, {
        operation: 'get release issues',
        context: { owner, repo }
      });
    }
  }

  extractIssueNumbers(text) {
    const numbers = new Set();
    for (const pattern of this.ISSUE_PATTERNS) {
      const matches = [...text.matchAll(pattern)];
      matches.forEach(match => numbers.add(match[1]));
    }
    return numbers;
  }
}

module.exports = GitHubAPI;
```

### Usage Example
```javascript
const GitHubAPI = require('./services/GitHub');

async function example(context) {
  const github = new GitHubAPI(context);
  const releaseBody = `
    This release fixes #123 and closes #456.
    Also resolves issue #789.
  `;
  const issues = await github.getReleaseIssues('fluxcd', 'charts', releaseBody);
  for (const issue of issues) {
    context.core.info(`Issue #${issue.number}: ${issue.title}`);
  }
}
```

## Migration Impact
- Parallel issue fetching improves performance
- Better error handling for invalid issues
- Enhanced pattern matching
- Consistent with new architecture patterns

## Success Criteria
- [ ] All issue reference patterns recognized
- [ ] Invalid issues handled gracefully
- [ ] Performance improved with parallel fetching
- [ ] All existing workflows continue to work
- [ ] New implementation has comprehensive tests
- [ ] Documentation is updated
