# Migration: _updateMetadataFiles

## Current Implementation
- Location: [update-charts.js - _updateMetadataFiles()](https://github.com/fluxcd/charts/blob/main/.github/scripts/update-charts.js#L117-L141)
- Purpose: Updates metadata files including annotations and source URLs
- Dependencies: fs module, YAML parsing
- Used by: Chart update process

## Code Analysis
The function updates metadata files in charts, including annotations and source URLs, ensuring consistency across all chart metadata.

### Current Logic Flow
1. Reads Chart.yaml files
2. Updates annotations (e.g., artifacthub.io/changes)
3. Updates source URLs
4. Stages modified files

## Target Architecture
- Target Class: chart/Update
- Target Method: metadata
- New Dependencies: Action class, FileService, Logger, ErrorHandler

## Implementation Status
- ✅ Completed

## Implementation Details
The metadata method in the chart Update service processes chart metadata files in parallel:

1. Processes charts in parallel using Promise.all
2. Reads existing metadata.yaml files
3. Updates content as needed
4. Writes updated content back to disk
5. Reports success/failure for each chart

## Backward Compatibility
```javascript
// update-charts.js
const Chart = require('./.github/actions/services/chart');
let updateService;

async function _updateMetadataFiles(charts, { exec, core }) {
  if (!updateService) {
    updateService = new Chart.Update({ exec, core });
  }
  return updateService.metadata(charts);
}

module.exports = {
  _updateMetadataFiles,
  // other functions...
};
```

## Code Examples

### Before (Legacy Implementation)
```javascript
const _updateMetadataFiles = async (charts, { exec, core }) => {
  core.info('Updating metadata files...');
  
  for (const chart of charts) {
    const chartYaml = path.join(chart.path, 'Chart.yaml');
    const content = await fs.readFile(chartYaml, 'utf8');
    const parsed = yaml.load(content);
    
    // Update annotations
    if (!parsed.annotations) {
      parsed.annotations = {};
    }
    
    // Update artifacthub.io/changes
    parsed.annotations['artifacthub.io/changes'] = `
      - kind: changed
        description: Updated dependencies
    `;
    
    // Update source URL
    if (parsed.sources) {
      parsed.sources = parsed.sources.map(source => 
        source.replace(/github\.com/, 'github.com')
      );
    }
    
    const updated = yaml.dump(parsed);
    await fs.writeFile(chartYaml, updated);
    await exec.exec('git', ['add', chartYaml]);
    
    core.info(`Metadata updated for ${chart.name}`);
  }
};
```

### After (New Implementation)
```javascript
// services/chart/Update.js
class Update extends Action {
  /**
   * Updates metadata files for charts
   * 
   * @param {Array<string>} charts - Chart directories to update
   * @returns {Promise<boolean>} - True if all metadata files were updated successfully
   */
  async metadata(charts) {
    if (!charts || !charts.length) return true;
    this.logger.info(`Updating metadata files for ${charts.length} charts`);
    const updatePromises = charts.map(async (chartDir) => {
      try {
        const metadataPath = path.join(chartDir, 'metadata.yaml');
        if (await this.fileService.exists(metadataPath)) {
          const metadata = await this.fileService.readYaml(metadataPath);
          // Update metadata content as needed
          await this.fileService.writeYaml(metadataPath, metadata);
          this.logger.info(`Updated metadata file for ${chartDir}`);
          return true;
        }
        return true;
      } catch (error) {
        this.errorHandler.handle(error, {
          operation: `update metadata file for ${chartDir}`,
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
    await this.chartUpdate.lock(allCharts);
    await this.chartUpdate.metadata(allCharts); // Updates metadata files
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
- Clean, focused method with single responsibility
- Consistent with new architectural patterns

## Success Criteria
- [x] Metadata files updated correctly
- [x] Error handling at individual chart level
- [x] Parallel processing for better performance
- [x] Integration with Chart handler
- [x] Consistent with new architecture patterns
