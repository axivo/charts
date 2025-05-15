# Migration: updateDocumentation

## Current Implementation
- Location: [update-docs.js - updateDocumentation()](https://github.com/fluxcd/charts/blob/main/.github/scripts/update-docs.js#L47-L79)
- Purpose: Generates and updates chart documentation using helm-docs
- Dependencies: exec, fs, path modules, helm-docs binary
- Used by: Chart maintenance workflows, PR automation

## Code Analysis
The function runs helm-docs to generate documentation for Helm charts, updates the Chart.yaml description, and handles the git staging of modified files.

### Current Logic Flow
1. Executes helm-docs for each chart directory
2. Updates Chart.yaml with generated description
3. Updates README.md with generated content
4. Stages modified files in git
5. Reports documentation status

## Target Architecture
- Target Class: DocumentationService
- Target Method: updateDocumentation
- New Dependencies: Base Service class, Error handler, Logger, FileService, GitService

## Implementation Steps
1. Create updateDocumentation method in DocumentationService
2. Implement chart enumeration logic
3. Add documentation generation
4. Create git staging integration
5. Create backward compatibility wrapper
6. Test with multiple chart structures

## Backward Compatibility
```javascript
// update-docs.js
const DocumentationService = require('./.github/actions/services/Documentation');
let docService;

async function updateDocumentation({ exec, core }) {
  if (!docService) {
    docService = new DocumentationService({ exec, core });
  }
  return docService.updateDocumentation();
}

module.exports = {
  updateDocumentation,
  // other functions...
};
```

## Testing Strategy
1. Unit test chart discovery
2. Mock helm-docs execution
3. Test file update logic
4. Verify git staging
5. Integration test with real charts

## Code Examples

### Before (Legacy Implementation)
```javascript
const updateDocumentation = async ({ exec, core }) => {
  const charts = await utils.findCharts('charts');
  
  for (const chart of charts) {
    core.info(`Updating documentation for ${chart.name}...`);
    
    // Run helm-docs
    await exec.exec('/tmp/helm-docs', [chart.path]);
    
    // Update Chart.yaml description
    const chartYaml = path.join(chart.path, 'Chart.yaml');
    const readmePath = path.join(chart.path, 'README.md');
    
    if (await utils.fileExists(readmePath)) {
      const readme = await fs.readFile(readmePath, 'utf8');
      const descMatch = readme.match(/^# .+\n\n(.+)/);
      
      if (descMatch) {
        const chartContent = await fs.readFile(chartYaml, 'utf8');
        const updatedChart = chartContent.replace(
          /description: .*/,
          `description: ${descMatch[1]}`
        );
        await fs.writeFile(chartYaml, updatedChart);
      }
    }
    
    // Stage changes
    await exec.exec('git', ['add', chartYaml, readmePath]);
    core.info(`Documentation updated for ${chart.name}`);
  }
};
```

### After (New Implementation)
```javascript
const BaseService = require('../core/Service');
const path = require('path');

class DocumentationService extends BaseService {
  constructor(context) {
    super(context);
    this.helmDocsPath = '/tmp/helm-docs';
  }

  /**
   * Updates documentation for all charts
   * 
   * @returns {Promise<Object>} Summary of updates
   */
  async updateDocumentation() {
    try {
      const charts = await this.fileService.findCharts('charts');
      const results = { updated: 0, failed: 0, charts: [] };
      for (const chart of charts) {
        try {
          await this.updateChartDocumentation(chart);
          results.updated++;
          results.charts.push(chart.name);
        } catch (error) {
          this.logger.error(`Failed to update docs for ${chart.name}: ${error.message}`);
          results.failed++;
        }
      }
      this.logger.info(`Documentation update complete: ${results.updated} updated, ${results.failed} failed`);
      return results;
    } catch (error) {
      throw this.errorHandler.handle(error, {
        operation: 'update documentation'
      });
    }
  }

  async updateChartDocumentation(chart) {
    this.logger.info(`Updating documentation for ${chart.name}...`);
    await this.exec.exec(this.helmDocsPath, [chart.path]);
    await this.updateChartDescription(chart);
    await this.stageDocumentationFiles(chart);
    this.logger.info(`Documentation updated for ${chart.name}`);
  }

  async updateChartDescription(chart) {
    const chartYaml = path.join(chart.path, 'Chart.yaml');
    const readmePath = path.join(chart.path, 'README.md');
    if (!await this.fileService.exists(readmePath)) {
      return;
    }
    const readme = await this.fileService.read(readmePath);
    const descMatch = readme.match(/^# .+\n\n(.+)/);
    if (descMatch) {
      const chartContent = await this.fileService.read(chartYaml);
      const updatedChart = chartContent.replace(
        /description: .*/,
        `description: ${descMatch[1]}`
      );
      await this.fileService.write(chartYaml, updatedChart);
    }
  }

  async stageDocumentationFiles(chart) {
    const files = [
      path.join(chart.path, 'Chart.yaml'),
      path.join(chart.path, 'README.md')
    ];
    await this.gitService.add(files);
  }
}

module.exports = DocumentationService;
```

### Usage Example
```javascript
const DocumentationService = require('./services/Documentation');

async function example(context) {
  const docService = new DocumentationService(context);
  await docService.installHelmDocs();
  const results = await docService.updateDocumentation();
  context.core.info(`Updated documentation for: ${results.charts.join(', ')}`);
}
```

## Migration Impact
- Improved error handling per chart
- Better separation of concerns
- Structured results reporting
- Consistent with new architecture patterns

## Success Criteria
- [ ] Documentation generation works correctly
- [ ] Chart descriptions updated properly
- [ ] Files staged in git correctly
- [ ] Error handling per chart
- [ ] All existing workflows continue to work
- [ ] Documentation is updated
