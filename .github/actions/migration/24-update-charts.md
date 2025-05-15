# Migration: updateCharts

## Current Implementation
- Location: [update-charts.js - updateCharts()](https://github.com/fluxcd/charts/blob/main/.github/scripts/update-charts.js#L19-L62)
- Purpose: Updates chart dependencies, locks, and metadata while maintaining consistency
- Dependencies: exec, fs, path modules, Helm CLI
- Used by: Chart maintenance workflows, dependency updates

## Code Analysis
The function orchestrates the chart update process, including dependency updates, lock file regeneration, metadata updates, linting, and git commits.

### Current Logic Flow
1. Discovers all charts in repository
2. Updates chart dependencies
3. Regenerates lock files
4. Updates metadata files
5. Runs chart linting
6. Commits changes to git

## Target Architecture
- Target Class: ChartManager
- Target Method: updateCharts
- New Dependencies: Base Manager class, Error handler, Logger, HelmService, GitService

## Implementation Steps
1. Create updateCharts method in ChartManager
2. Delegate sub-tasks to specialized services
3. Implement transaction-like behavior
4. Add rollback capability
5. Create backward compatibility wrapper
6. Test with various chart scenarios

## Backward Compatibility
```javascript
// update-charts.js
const ChartManager = require('./.github/actions/handlers/Chart');
let chartManager;

async function updateCharts({ exec, core }) {
  if (!chartManager) {
    chartManager = new ChartManager({ exec, core });
  }
  return chartManager.updateCharts();
}

module.exports = {
  updateCharts,
  // other functions...
};
```

## Testing Strategy
1. Unit test orchestration logic
2. Mock service dependencies
3. Test error handling and rollback
4. Verify transaction integrity
5. Integration test with real charts

## Code Examples

### Before (Legacy Implementation)
```javascript
const updateCharts = async ({ exec, core }) => {
  core.info('Scanning for charts...');
  const charts = await utils.findCharts('charts');
  
  if (charts.length === 0) {
    core.info('No charts found');
    return;
  }
  
  core.info(`Found ${charts.length} charts`);
  
  // Update dependencies
  await _updateAppFiles(charts, { exec, core });
  
  // Update lock files
  await _updateLockFiles(charts, { exec, core });
  
  // Update metadata
  await _updateMetadataFiles(charts, { exec, core });
  
  // Lint charts
  await _lintCharts(charts, { exec, core });
  
  // Commit changes
  await _performGitCommit(charts, { exec, core });
  
  core.info('Chart update complete');
};
```

### After (New Implementation)
```javascript
const BaseHandler = require('../core/Handler');

class ChartManager extends BaseHandler {
  constructor(context) {
    super(context);
    this.helmService = new HelmService(context);
    this.gitService = new GitService(context);
  }

  /**
   * Updates all charts in the repository
   * 
   * @returns {Promise<Object>} Update summary
   */
  async updateCharts() {
    try {
      this.logger.info('Scanning for charts...');
      const charts = await this.fileService.findCharts('charts');
      if (charts.length === 0) {
        this.logger.info('No charts found');
        return { charts: 0, updated: 0 };
      }
      this.logger.info(`Found ${charts.length} charts`);
      const results = { charts: charts.length, updated: 0, steps: {} };
      try {
        results.steps.dependencies = await this.updateAppFiles(charts);
        results.steps.locks = await this.updateLockFiles(charts);
        results.steps.metadata = await this.updateMetadataFiles(charts);
        results.steps.lint = await this.lintCharts(charts);
        results.steps.commit = await this.performGitCommit(charts);
        results.updated = charts.length;
        this.logger.info('Chart update complete');
      } catch (error) {
        this.logger.error(`Update failed at step: ${error.step}`);
        await this.rollbackChanges(charts);
        throw error;
      }
      return results;
    } catch (error) {
      throw this.errorHandler.handle(error, {
        operation: 'update charts'
      });
    }
  }

  async updateAppFiles(charts) {
    this.logger.info('Updating chart dependencies...');
    for (const chart of charts) {
      await this.helmService.dependency.update(chart.path);
    }
    return { success: true };
  }

  async updateLockFiles(charts) {
    this.logger.info('Regenerating lock files...');
    for (const chart of charts) {
      await this.helmService.dependency.build(chart.path);
    }
    return { success: true };
  }

  async updateMetadataFiles(charts) {
    this.logger.info('Updating metadata files...');
    for (const chart of charts) {
      await this.updateChartMetadata(chart);
    }
    return { success: true };
  }

  async lintCharts(charts) {
    this.logger.info('Linting charts...');
    const results = [];
    for (const chart of charts) {
      const lintResult = await this.helmService.lint(chart.path);
      results.push(lintResult);
    }
    return { success: true, results };
  }

  async performGitCommit(charts) {
    this.logger.info('Committing changes...');
    const files = charts.flatMap(chart => [
      `${chart.path}/Chart.yaml`,
      `${chart.path}/Chart.lock`,
      `${chart.path}/values.yaml`
    ]);
    await this.gitService.add(files);
    await this.gitService.commit('Update charts');
    return { success: true };
  }

  async rollbackChanges(charts) {
    this.logger.warn('Rolling back changes...');
    const files = charts.flatMap(chart => [
      `${chart.path}/*`
    ]);
    await this.gitService.reset(files);
  }
}

module.exports = ChartManager;
```

### Usage Example
```javascript
const ChartManager = require('./handlers/Chart');

async function example(context) {
  const chartManager = new ChartManager(context);
  const results = await chartManager.updateCharts();
  context.core.info(`Updated ${results.updated} of ${results.charts} charts`);
}
```

## Migration Impact
- Better orchestration and error handling
- Transaction-like behavior with rollback
- Clear separation of concerns
- Improved progress reporting

## Success Criteria
- [ ] All update steps execute correctly
- [ ] Rollback works on failure
- [ ] Progress reporting is accurate
- [ ] All existing workflows continue to work
- [ ] New implementation has comprehensive tests
- [ ] Documentation is updated
