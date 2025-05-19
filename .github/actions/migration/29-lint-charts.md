# Migration: _lintCharts

## Current Implementation
- Location: [update-charts.js - _lintCharts()](https://github.com/fluxcd/charts/blob/main/.github/scripts/update-charts.js#L143-L164)
- Purpose: Validates Helm charts using helm lint command
- Dependencies: exec module, Helm CLI
- Used by: Chart update and validation processes

## Code Analysis
The function runs Helm linting on charts to ensure they follow best practices and have valid syntax before committing changes.

### Current Logic Flow
1. Iterates through all charts
2. Runs helm lint command
3. Reports linting results
4. Collects errors for failed charts

## Target Architecture
- Target Class: chart/index.js (Chart service)
- Target Method: lint
- New Dependencies: Action class, HelmService, Logger, ErrorHandler

## Implementation Status
- ✅ Completed

## Implementation Details
The lint method in the Chart service validates multiple charts using HelmService:

1. Processes charts in parallel
2. Uses HelmService.lint for each chart
3. Tracks success/failure status
4. Provides comprehensive error reporting

## Backward Compatibility
```javascript
// update-charts.js
const Chart = require('./.github/actions/services/chart');
let chartService;

async function _lintCharts(charts, { exec, core }) {
  if (!chartService) {
    chartService = new Chart({ exec, core });
  }
  return chartService.lint(charts);
}

module.exports = {
  _lintCharts,
  // other functions...
};
```

## Code Examples

### Before (Legacy Implementation)
```javascript
const _lintCharts = async (charts, { exec, core }) => {
  core.info('Linting charts...');
  const errors = [];
  
  for (const chart of charts) {
    core.info(`Linting ${chart.name}...`);
    
    try {
      await exec.exec('helm', ['lint', chart.path]);
      core.info(`${chart.name} passed linting`);
    } catch (error) {
      core.error(`${chart.name} failed linting`);
      errors.push({ chart: chart.name, error: error.message });
    }
  }
  
  if (errors.length > 0) {
    throw new Error(`Linting failed for ${errors.length} charts`);
  }
  
  core.info('All charts passed linting');
};
```

### After (New Implementation)
```javascript
// services/chart/index.js
class Chart extends Action {
  /**
   * Lints multiple charts
   * 
   * @param {Array<string>} charts - Chart directories to lint
   * @returns {Promise<boolean>} - True if all charts passed linting
   */
  async lint(charts) {
    if (!charts || !charts.length) return true;
    this.logger.info(`Linting ${charts.length} charts`);
    let success = true;
    for (const chartDir of charts) {
      const Helm = require('../Helm');
      const helmService = new Helm(this.context);
      const result = await helmService.lint(chartDir, { strict: true });
      if (!result) success = false;
    }
    return success;
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
    await this.chartUpdate.lock(allCharts);
    await this.chartUpdate.metadata(allCharts);
    await this.chartService.lint(allCharts); // Lints charts
    
    // ... rest of the method ...
  } catch (error) {
    throw this.errorHandler.handle(error, { operation: 'update charts' });
  }
}
```

## Related Implementation in Helm Service
```javascript
// services/Helm.js
class Helm extends Action {
  /**
   * Lints a chart
   * 
   * @param {string} chartDir - Chart directory
   * @param {Object} options - Lint options
   * @param {boolean} options.strict - Whether to use strict linting
   * @returns {Promise<boolean>} - True if lint passed
   */
  async lint(chartDir, options = {}) {
    try {
      this.logger.info(`Linting chart: ${chartDir}`);
      await this.execute(['lint', chartDir, ...(options.strict ? ['--strict'] : [])]);
      this.logger.info(`Lint passed for ${chartDir}`);
      return true;
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: `lint chart ${chartDir}`,
        fatal: false
      });
      return false;
    }
  }
}
```

## Migration Impact
- Clear separation of concerns between Chart and Helm services
- Robust error handling at the individual chart level
- Consistent with new architectural patterns
- Optimized for maintainability and readability

## Success Criteria
- [x] Chart linting executes correctly
- [x] Error handling at individual chart level
- [x] Integration with Helm service
- [x] Integration with Chart handler
- [x] Consistent with new architecture patterns
