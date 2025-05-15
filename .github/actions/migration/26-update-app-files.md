# Migration: _updateAppFiles

## Current Implementation
- Location: [update-charts.js - _updateAppFiles()](https://github.com/fluxcd/charts/blob/main/.github/scripts/update-charts.js#L64-L89)
- Purpose: Updates Flux app version in chart files and kustomization
- Dependencies: fs module, YAML parsing
- Used by: Chart update process

## Code Analysis
The function updates the appVersion in Chart.yaml files and corresponding versions in kustomization files to maintain consistency across the repository.

### Current Logic Flow
1. Reads Chart.yaml files
2. Extracts current app version
3. Updates version in kustomization files
4. Ensures consistent versioning

## Target Architecture
- Target Class: ChartService
- Target Method: updateAppVersions
- New Dependencies: Base Service class, Error handler, Logger, FileService, YamlService

## Implementation Steps
1. Create updateAppVersions method in ChartService
2. Implement YAML parsing and updating
3. Add version validation
4. Create backward compatibility wrapper
5. Test with various chart structures

## Backward Compatibility
```javascript
// update-charts.js
const ChartService = require('./.github/actions/services/Chart');
let chartService;

async function _updateAppFiles(charts, { exec, core }) {
  if (!chartService) {
    chartService = new ChartService({ exec, core });
  }
  return chartService.updateAppVersions(charts);
}

module.exports = {
  _updateAppFiles,
  // other functions...
};
```

## Testing Strategy
1. Unit test version extraction
2. Mock file operations
3. Test YAML parsing/updating
4. Verify kustomization updates
5. Test error handling

## Code Examples

### Before (Legacy Implementation)
```javascript
const _updateAppFiles = async (charts, { exec, core }) => {
  core.info('Updating app versions...');
  
  for (const chart of charts) {
    const chartYaml = path.join(chart.path, 'Chart.yaml');
    const content = await fs.readFile(chartYaml, 'utf8');
    const parsed = yaml.load(content);
    const appVersion = parsed.appVersion;
    
    if (!appVersion) {
      core.warning(`No appVersion found in ${chart.name}`);
      continue;
    }
    
    // Update kustomization
    const kustomizationPath = path.join(chart.path, 'kustomization.yaml');
    if (await utils.fileExists(kustomizationPath)) {
      const kustomization = await fs.readFile(kustomizationPath, 'utf8');
      const updated = kustomization.replace(
        /newTag: .*/g,
        `newTag: ${appVersion}`
      );
      await fs.writeFile(kustomizationPath, updated);
      await exec.exec('git', ['add', kustomizationPath]);
    }
    
    core.info(`Updated app version for ${chart.name} to ${appVersion}`);
  }
};
```

### After (New Implementation)
```javascript
const BaseService = require('../core/Service');
const path = require('path');

class ChartService extends BaseService {
  constructor(context) {
    super(context);
  }

  /**
   * Updates app versions across chart files
   * 
   * @param {Array} charts - Array of chart objects
   * @returns {Promise<Object>} Update summary
   */
  async updateAppVersions(charts) {
    try {
      this.logger.info('Updating app versions...');
      const results = { updated: 0, skipped: 0, failed: 0 };
      for (const chart of charts) {
        try {
          const updated = await this.updateChartAppVersion(chart);
          if (updated) {
            results.updated++;
          } else {
            results.skipped++;
          }
        } catch (error) {
          this.logger.error(`Failed to update ${chart.name}: ${error.message}`);
          results.failed++;
        }
      }
      this.logger.info(`App versions: ${results.updated} updated, ${results.skipped} skipped, ${results.failed} failed`);
      return results;
    } catch (error) {
      throw this.errorHandler.handle(error, {
        operation: 'update app versions',
        context: { chartCount: charts.length }
      });
    }
  }

  async updateChartAppVersion(chart) {
    const chartYaml = path.join(chart.path, 'Chart.yaml');
    const chartContent = await this.fileService.read(chartYaml);
    const chartData = this.yamlService.parse(chartContent);
    const appVersion = chartData.appVersion;
    if (!appVersion) {
      this.logger.warn(`No appVersion found in ${chart.name}`);
      return false;
    }
    await this.updateKustomization(chart, appVersion);
    this.logger.info(`Updated app version for ${chart.name} to ${appVersion}`);
    return true;
  }

  async updateKustomization(chart, appVersion) {
    const kustomizationPath = path.join(chart.path, 'kustomization.yaml');
    if (!await this.fileService.exists(kustomizationPath)) {
      return;
    }
    const content = await this.fileService.read(kustomizationPath);
    const updated = content.replace(
      /newTag: .*/g,
      `newTag: ${appVersion}`
    );
    await this.fileService.write(kustomizationPath, updated);
    await this.gitService.add([kustomizationPath]);
  }
}

module.exports = ChartService;
```

### Usage Example
```javascript
const ChartService = require('./services/Chart');

async function example(context) {
  const chartService = new ChartService(context);
  const charts = [
    { name: 'flux', path: 'charts/flux' },
    { name: 'helm-controller', path: 'charts/helm-controller' }
  ];
  const results = await chartService.updateAppVersions(charts);
  context.core.info(`Updated ${results.updated} app versions`);
}
```

## Migration Impact
- Better error handling per chart
- Structured results reporting
- Cleaner separation of concerns
- Consistent with new architecture patterns

## Success Criteria
- [ ] App versions updated correctly
- [ ] Kustomization files updated
- [ ] Missing versions handled gracefully
- [ ] All existing workflows continue to work
- [ ] New implementation has comprehensive tests
- [ ] Documentation is updated
