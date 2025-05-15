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
- Target Class: HelmService
- Target Method: lintCharts
- New Dependencies: Base Service class, Error handler, Logger

## Implementation Steps
1. Create lintCharts method in HelmService
2. Implement parallel linting
3. Add detailed error reporting
4. Create backward compatibility wrapper
5. Test with various chart errors

## Backward Compatibility
```javascript
// update-charts.js
const HelmService = require('./.github/actions/services/Helm');
let helmService;

async function _lintCharts(charts, { exec, core }) {
  if (!helmService) {
    helmService = new HelmService({ exec, core });
  }
  return helmService.lintCharts(charts);
}

module.exports = {
  _lintCharts,
  // other functions...
};
```

## Testing Strategy
1. Unit test linting logic
2. Mock helm lint commands
3. Test parallel processing
4. Verify error collection
5. Test with invalid charts

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
const BaseService = require('../core/Service');

class HelmService extends BaseService {
  constructor(context) {
    super(context);
  }

  /**
   * Lints Helm charts for validation
   * 
   * @param {Array} charts - Array of chart objects
   * @returns {Promise<Object>} Linting results
   */
  async lintCharts(charts) {
    try {
      this.logger.info('Linting charts...');
      const results = { total: charts.length, passed: 0, failed: 0, errors: [] };
      await Promise.all(
        charts.map(async (chart) => {
          const result = await this.lintChart(chart);
          if (result.success) {
            results.passed++;
          } else {
            results.failed++;
            results.errors.push(result);
          }
        })
      );
      if (results.failed > 0) {
        const errorDetail = results.errors
          .map(e => `${e.chart}: ${e.error}`)
          .join('\n');
        throw new Error(`Linting failed for ${results.failed} charts:\n${errorDetail}`);
      }
      this.logger.info('All charts passed linting');
      return results;
    } catch (error) {
      throw this.errorHandler.handle(error, {
        operation: 'lint charts',
        context: { chartCount: charts.length }
      });
    }
  }

  async lintChart(chart) {
    this.logger.info(`Linting ${chart.name}...`);
    try {
      await this.exec.exec('helm', ['lint', chart.path]);
      this.logger.info(`${chart.name} passed linting`);
      return { chart: chart.name, success: true };
    } catch (error) {
      this.logger.error(`${chart.name} failed linting`);
      return { chart: chart.name, success: false, error: error.message };
    }
  }
}

module.exports = HelmService;
```

### Usage Example
```javascript
const HelmService = require('./services/Helm');

async function example(context) {
  const helmService = new HelmService(context);
  const charts = [
    { name: 'flux2', path: 'charts/flux2' },
    { name: 'flux2-sync', path: 'charts/flux2-sync' }
  ];
  try {
    const results = await helmService.lintCharts(charts);
    context.core.info(`All ${results.passed} charts passed linting`);
  } catch (error) {
    context.core.error(`Linting failed: ${error.message}`);
  }
}
```

## Migration Impact
- Parallel linting improves performance
- Detailed error reporting
- Better failure aggregation
- Consistent with new architecture patterns

## Success Criteria
- [ ] Linting executes correctly
- [ ] Parallel processing works
- [ ] Error details captured
- [ ] All existing workflows continue to work
- [ ] New implementation has comprehensive tests
- [ ] Documentation is updated
