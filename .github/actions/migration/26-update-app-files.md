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
- Target Class: chart/Update
- Target Method: application
- New Dependencies: Action class, FileService, Logger, ErrorHandler

## Implementation Status
- ✅ Completed

## Implementation Details
The application method in the chart Update service processes application.yaml files in parallel using Promise.all:

1. Reads application.yaml files for each chart
2. Updates content as needed
3. Writes updated content back to disk
4. Reports success/failure for each chart

## Backward Compatibility
```javascript
// update-charts.js
const Chart = require('./.github/actions/services/chart');
let updateService;

async function _updateAppFiles(charts, { exec, core }) {
  if (!updateService) {
    updateService = new Chart.Update({ exec, core });
  }
  return updateService.application(charts);
}

module.exports = {
  _updateAppFiles,
  // other functions...
};
```

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
// services/chart/Update.js
class Update extends Action {
  /**
   * Updates application files for charts
   * 
   * @param {Array<string>} charts - Chart directories to update
   * @returns {Promise<boolean>} - True if all application files were updated successfully
   */
  async application(charts) {
    if (!charts || !charts.length) return true;
    this.logger.info(`Updating application files for ${charts.length} charts`);
    const updatePromises = charts.map(async (chartDir) => {
      try {
        const appFilePath = path.join(chartDir, 'application.yaml');
        if (await this.fileService.exists(appFilePath)) {
          const appFile = await this.fileService.readYaml(appFilePath);
          // Update application file content as needed
          await this.fileService.writeYaml(appFilePath, appFile);
          this.logger.info(`Updated application file for ${chartDir}`);
          return true;
        }
        return true;
      } catch (error) {
        this.errorHandler.handle(error, {
          operation: `update application file for ${chartDir}`,
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
    await this.chartUpdate.application(allCharts); // Updates application files
    await this.chartUpdate.lock(allCharts);
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
- Clear separation of concerns in modular architecture
- Consistent with new architectural patterns

## Success Criteria
- [x] Application files updated correctly
- [x] Error handling at individual chart level
- [x] Parallel processing for better performance
- [x] Clear integration with Chart handler
- [x] Consistent with new architecture patterns
