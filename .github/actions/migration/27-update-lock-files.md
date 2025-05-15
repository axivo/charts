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
- Target Class: HelmService
- Target Method: updateLockFiles
- New Dependencies: Base Service class, Error handler, Logger, GitService

## Implementation Steps
1. Create updateLockFiles method in HelmService
2. Add dependency detection
3. Implement parallel processing
4. Create backward compatibility wrapper
5. Test with charts having various dependency structures

## Backward Compatibility
```javascript
// update-charts.js
const HelmService = require('./.github/actions/services/Helm');
let helmService;

async function _updateLockFiles(charts, { exec, core }) {
  if (!helmService) {
    helmService = new HelmService({ exec, core });
  }
  return helmService.updateLockFiles(charts);
}

module.exports = {
  _updateLockFiles,
  // other functions...
};
```

## Testing Strategy
1. Unit test dependency detection
2. Mock helm commands
3. Test parallel processing
4. Verify error handling
5. Test with charts without dependencies

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
const BaseService = require('../core/Service');
const path = require('path');

class HelmService extends BaseService {
  constructor(context) {
    super(context);
  }

  /**
   * Updates lock files for charts with dependencies
   * 
   * @param {Array} charts - Array of chart objects
   * @returns {Promise<Object>} Update summary
   */
  async updateLockFiles(charts) {
    try {
      this.logger.info('Updating lock files...');
      const results = { total: charts.length, updated: 0, skipped: 0, failed: 0 };
      await Promise.all(
        charts.map(async (chart) => {
          try {
            const updated = await this.updateChartLock(chart);
            if (updated) {
              results.updated++;
            } else {
              results.skipped++;
            }
          } catch (error) {
            this.logger.error(`Failed to update lock for ${chart.name}: ${error.message}`);
            results.failed++;
          }
        })
      );
      this.logger.info(`Lock files: ${results.updated} updated, ${results.skipped} skipped, ${results.failed} failed`);
      return results;
    } catch (error) {
      throw this.errorHandler.handle(error, {
        operation: 'update lock files',
        context: { chartCount: charts.length }
      });
    }
  }

  async updateChartLock(chart) {
    const hasDependencies = await this.chartHasDependencies(chart);
    if (!hasDependencies) {
      this.logger.info(`${chart.name} has no dependencies, skipping...`);
      return false;
    }
    this.logger.info(`Updating dependencies for ${chart.name}...`);
    await this.exec.exec('helm', ['dependency', 'build', chart.path]);
    const lockFile = path.join(chart.path, 'Chart.lock');
    await this.gitService.add([lockFile]);
    this.logger.info(`Lock file updated for ${chart.name}`);
    return true;
  }

  async chartHasDependencies(chart) {
    const chartYaml = path.join(chart.path, 'Chart.yaml');
    const content = await this.fileService.read(chartYaml);
    const parsed = this.yamlService.parse(content);
    return parsed.dependencies && parsed.dependencies.length > 0;
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
    { name: 'kustomize-controller', path: 'charts/kustomize-controller' },
    { name: 'source-controller', path: 'charts/source-controller' }
  ];
  const results = await helmService.updateLockFiles(charts);
  context.core.info(`Updated ${results.updated} lock files`);
}
```

## Migration Impact
- Parallel processing for better performance
- Structured result reporting
- Better dependency detection
- Consistent with new architecture patterns

## Success Criteria
- [ ] Lock files updated correctly
- [ ] Charts without dependencies skipped
- [ ] Parallel processing works
- [ ] All existing workflows continue to work
- [ ] New implementation has comprehensive tests
- [ ] Documentation is updated
