# Migration: _performGitCommit

## Current Implementation
- Location: [update-charts.js - _performGitCommit()](https://github.com/fluxcd/charts/blob/main/.github/scripts/update-charts.js#L166-L190)
- Purpose: Creates a git commit with chart changes
- Dependencies: exec module, git CLI
- Used by: Chart update process

## Code Analysis
The function stages modified files and creates a commit with a descriptive message listing the updated charts.

### Current Logic Flow
1. Checks for staged changes
2. Creates commit message with chart names
3. Executes git commit
4. Reports commit status

## Target Architecture
- Target Class: GitService
- Target Method: commitChartUpdates
- New Dependencies: Base Service class, Error handler, Logger

## Implementation Steps
1. Create commitChartUpdates method in GitService
2. Add commit message generation
3. Implement change detection
4. Create backward compatibility wrapper
5. Test with various scenarios

## Backward Compatibility
```javascript
// update-charts.js
const GitService = require('./.github/actions/services/Git');
let gitService;

async function _performGitCommit(charts, { exec, core }) {
  if (!gitService) {
    gitService = new GitService({ exec, core });
  }
  return gitService.commitChartUpdates(charts);
}

module.exports = {
  _performGitCommit,
  // other functions...
};
```

## Testing Strategy
1. Unit test commit message generation
2. Mock git operations
3. Test empty changeset handling
4. Verify multi-chart commits
5. Test error scenarios

## Code Examples

### Before (Legacy Implementation)
```javascript
const _performGitCommit = async (charts, { exec, core }) => {
  // Check for changes
  const { stdout: status } = await exec.getExecOutput('git', ['status', '--porcelain']);
  
  if (!status.trim()) {
    core.info('No changes to commit');
    return;
  }
  
  // Create commit message
  const chartNames = charts.map(c => c.name).join(', ');
  const commitMessage = `Update charts: ${chartNames}`;
  
  // Commit changes
  await exec.exec('git', ['commit', '-m', commitMessage]);
  
  core.info(`Committed updates for: ${chartNames}`);
};
```

### After (New Implementation)
```javascript
const BaseService = require('../core/Service');

class GitService extends BaseService {
  constructor(context) {
    super(context);
  }

  /**
   * Commits chart updates with descriptive message
   * 
   * @param {Array} charts - Array of chart objects
   * @returns {Promise<Object>} Commit result
   */
  async commitChartUpdates(charts) {
    try {
      const hasChanges = await this.hasChanges();
      if (!hasChanges) {
        this.logger.info('No changes to commit');
        return { committed: false, message: 'No changes' };
      }
      const commitMessage = this.generateCommitMessage(charts);
      await this.commit(commitMessage);
      this.logger.info(`Committed updates for: ${charts.map(c => c.name).join(', ')}`);
      return {
        committed: true,
        message: commitMessage,
        charts: charts.length
      };
    } catch (error) {
      throw this.errorHandler.handle(error, {
        operation: 'commit chart updates',
        context: { chartCount: charts.length }
      });
    }
  }

  async hasChanges() {
    const { stdout } = await this.exec.getExecOutput('git', ['status', '--porcelain']);
    return stdout.trim().length > 0;
  }

  generateCommitMessage(charts) {
    const chartNames = charts.map(c => c.name).join(', ');
    if (charts.length === 1) {
      return `Update ${chartNames} chart`;
    }
    return `Update charts: ${chartNames}`;
  }

  async commit(message) {
    await this.exec.exec('git', ['commit', '-m', message]);
  }
}

module.exports = GitService;
```

### Usage Example
```javascript
const GitService = require('./services/Git');

async function example(context) {
  const gitService = new GitService(context);
  const charts = [
    { name: 'chart1', path: 'charts/chart1' },
    { name: 'chart2', path: 'charts/chart2' }
  ];
  const result = await gitService.commitChartUpdates(charts);
  if (result.committed) {
    context.core.info(`Created commit: ${result.message}`);
  }
}
```

## Migration Impact
- Better commit message formatting
- Structured return values
- Improved change detection
- Consistent with new architecture patterns

## Success Criteria
- [ ] Commits created successfully
- [ ] Empty changeset handled correctly
- [ ] Commit messages properly formatted
- [ ] All existing workflows continue to work
- [ ] New implementation has comprehensive tests
- [ ] Documentation is updated
