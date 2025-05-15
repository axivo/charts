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
- Target Class: ChartService
- Target Method: updateMetadataFiles
- New Dependencies: Base Service class, Error handler, Logger, FileService, YamlService

## Implementation Steps
1. Create updateMetadataFiles method in ChartService
2. Implement metadata update logic
3. Add validation for metadata fields
4. Create backward compatibility wrapper
5. Test with various metadata scenarios

## Backward Compatibility
```javascript
// update-charts.js
const ChartService = require('./.github/actions/services/Chart');
let chartService;

async function _updateMetadataFiles(charts, { exec, core }) {
  if (!chartService) {
    chartService = new ChartService({ exec, core });
  }
  return chartService.updateMetadataFiles(charts);
}

module.exports = {
  _updateMetadataFiles,
  // other functions...
};
```

## Testing Strategy
1. Unit test metadata updates
2. Mock file operations
3. Test YAML parsing/updating
4. Verify annotation updates
5. Test error handling

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
const BaseService = require('../core/Service');
const path = require('path');

class ChartService extends BaseService {
  constructor(context) {
    super(context);
  }

  /**
   * Updates metadata files for charts
   * 
   * @param {Array} charts - Array of chart objects
   * @returns {Promise<Object>} Update summary
   */
  async updateMetadataFiles(charts) {
    try {
      this.logger.info('Updating metadata files...');
      const results = { updated: 0, failed: 0 };
      for (const chart of charts) {
        try {
          await this.updateChartMetadata(chart);
          results.updated++;
        } catch (error) {
          this.logger.error(`Failed to update metadata for ${chart.name}: ${error.message}`);
          results.failed++;
        }
      }
      this.logger.info(`Metadata: ${results.updated} updated, ${results.failed} failed`);
      return results;
    } catch (error) {
      throw this.errorHandler.handle(error, {
        operation: 'update metadata files',
        context: { chartCount: charts.length }
      });
    }
  }

  async updateChartMetadata(chart) {
    const chartYaml = path.join(chart.path, 'Chart.yaml');
    const content = await this.fileService.read(chartYaml);
    const parsed = this.yamlService.parse(content);
    this.ensureAnnotations(parsed);
    this.updateChangeAnnotation(parsed);
    this.updateSourceUrls(parsed);
    const updated = this.yamlService.stringify(parsed);
    await this.fileService.write(chartYaml, updated);
    await this.gitService.add([chartYaml]);
    this.logger.info(`Metadata updated for ${chart.name}`);
  }

  ensureAnnotations(chartData) {
    if (!chartData.annotations) {
      chartData.annotations = {};
    }
  }

  updateChangeAnnotation(chartData) {
    chartData.annotations['artifacthub.io/changes'] = this.yamlService.stringify([
      {
        kind: 'changed',
        description: 'Updated dependencies'
      }
    ]);
  }

  updateSourceUrls(chartData) {
    if (chartData.sources) {
      chartData.sources = chartData.sources.map(source => 
        this.normalizeSourceUrl(source)
      );
    }
  }

  normalizeSourceUrl(url) {
    return url.replace(/github\.com/, 'github.com');
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
    { name: 'flux2', path: 'charts/flux2' },
    { name: 'flux2-notification', path: 'charts/flux2-notification' }
  ];
  const results = await chartService.updateMetadataFiles(charts);
  context.core.info(`Updated metadata for ${results.updated} charts`);
}
```

## Migration Impact
- Better error handling per chart
- Structured metadata updates
- Cleaner separation of concerns
- Consistent with new architecture patterns

## Success Criteria
- [ ] Metadata updated correctly
- [ ] Annotations properly formatted
- [ ] Source URLs normalized
- [ ] All existing workflows continue to work
- [ ] New implementation has comprehensive tests
- [ ] Documentation is updated
