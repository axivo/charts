# Migration: _updateLockFiles

## Current Implementation
- Location: [update-charts.js - _updateLockFiles()](https://github.com/fluxcd/charts/blob/main/.github/scripts/update-charts.js#L91-L115)
- Purpose: Updates Chart.lock files for dependency management
- Dependencies: exec module, Helm CLI
- Used by: Chart update process

## Code Analysis
The function updates Helm chart lock files by running dependency build commands, ensuring all chart dependencies are properly locked to specific versions.

### Current Logic Flow
1. Iterates through charts with dependencies
2. Runs helm dependency build
3. Stages updated lock files
4. Reports update status

## Target Architecture
- Target Class: chart/Update
- Target Method: lock
- New Dependencies: Action class, HelmService, Logger, ErrorHandler

## Implementation Status
- ✅ Completed

## Implementation Details
The lock method in the chart Update service uses the HelmService to update chart lock files in parallel:

1. Processes charts in parallel using Promise.all
2. Calls helmService.updateDependencies for each chart
3. Maintains success/failure tracking for each chart
4. Returns overall success status

## Backward Compatibility
```javascript
// update-charts.js
const Chart = require('./.github/actions/services/chart');
let updateService;

async function _updateLockFiles(charts, { exec, core }) {
  if (!updateService) {
    updateService = new Chart.Update({ exec, core });
  }
  return updateService.lock(charts);
}

module.exports = {
  _updateLockFiles,
  // other functions...
};
```

## Code Examples

### Before (Legacy Implementation)
```javascript
const _updateLockFiles = async (charts, { exec, core }) => {
  core.info('Updating lock files...');
  
  for (const chart of charts) {
    const chartYaml = path.join(chart.path, 'Chart.yaml');
    const content = await fs.readFile(chartYaml, 'utf8');
    const parsed = yaml.load(content);
    
    if (!parsed.dependencies || parsed.dependencies.length === 0) {
      core.info(`${chart.name} has no dependencies, skipping...`);
      continue;
    }
    
    core.info(`Updating dependencies for ${chart.name}...`);
    await exec.exec('helm', ['dependency', 'build', chart.path]);
    
    const lockFile = path.join(chart.path, 'Chart.lock');
    await exec.exec('git', ['add', lockFile]);
    
    core.info(`Lock file updated for ${chart.name}`);
  }
};
```

### After (New Implementation)
```javascript
// services/chart/Update.js
class Update extends Action {
  /**
   * Updates lock files for charts
   * 
   * @param {Array<string>} charts - Chart directories to update
   * @returns {Promise<boolean>} - True if all lock files were updated successfully
   */
  async lock(charts) {
    if (!charts || !charts.length) return true;
    this.logger.info(`Updating lock files for ${charts.length} charts`);
    const updatePromises = charts.map(async (chartDir) => {
      try {
        return await this.helmService.updateDependencies(chartDir);
      } catch (error) {
        this.errorHandler.handle(error, {
          operation: `update lock file for ${chartDir}`,
          fatal: false
        });
        return false;
      }
    });
    const results = await Promise.all(updatePromises);
    return results.every(result => result === true);
  }
}
```

### Usage in Chart Handler
```javascript
// handlers/Chart.js
async process() {
  try {
    // ... existing code ...
    
    // Combine both chart types for operations
    const allCharts = [...charts.application, ...charts.library];
    
    // Execute update operations
    await this.chartUpdate.application(allCharts);
    await this.chartUpdate.lock(allCharts); // Updates lock files
    await this.chartUpdate.metadata(allCharts);
    await this.chartService.lint(allCharts);
    
    // ... rest of the method ...
  } catch (error) {
    throw this.errorHandler.handle(error, { operation: 'update charts' });
  }
}
```

## Migration Impact
- Parallel execution using Promise.all for better performance
- Robust error handling at the individual chart level
- Leverages HelmService for dependency operations
- Consistent with new architectural patterns

## Success Criteria
- [x] Lock files updated correctly
- [x] Error handling at individual chart level
- [x] Parallel processing for better performance
- [x] Integration with HelmService
- [x] Consistent with new architecture patterns
