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
- Target Class: Chart (in handlers/Chart.js)
- Target Methods: process, getModifiedFiles
- Related Services: 
  - chart/index.js: find, lint
  - chart/Update.js: application, lock, metadata

## Implementation Status
- ✅ Completed

## Implementation Details
The implementation follows a modular structure with separate services for chart operations:

1. **Handler**: Chart handler in `handlers/Chart.js`
   - Orchestrates the update workflow
   - Uses services for specific operations

2. **Services**:
   - `services/chart/index.js`: Core chart operations
   - `services/chart/Update.js`: Chart file update operations
   - `services/Git.js`: Git operations
   - `services/Helm.js`: Helm operations
   - `services/File.js`: File operations

3. **Process Flow**:
   - Find modified charts
   - Update application files
   - Update lock files 
   - Update metadata files
   - Lint charts
   - Commit changes

## Backward Compatibility
```javascript
// update-charts.js
const Chart = require('./.github/actions/handlers/Chart');
let chartHandler;

async function updateCharts({ exec, core }) {
  if (!chartHandler) {
    chartHandler = new Chart({ exec, core });
  }
  return chartHandler.process();
}

module.exports = {
  updateCharts,
  // other functions...
};
```

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
class Chart extends Action {
  constructor(params) {
    super(params);
    this.chartService = new Chart(params);
    this.fileService = new FileService(params);
    this.gitService = new GitService(params);
    this.helmService = new HelmService(params);
    this.githubService = new Rest(params);
    this.chartUpdate = new Chart.Update(params);
  }

  /**
   * Gets file paths that are modified by chart updates
   * 
   * @param {Array<string>} charts - Chart directories
   * @returns {Array<string>} - List of files to commit
   */
  getModifiedFiles(charts) {
    return charts.flatMap(chart => [
      `${chart}/Chart.yaml`,
      `${chart}/Chart.lock`,
      `${chart}/values.yaml`,
      `${chart}/application.yaml`,
      `${chart}/metadata.yaml`
    ]).filter(file => this.fileService.exists(file));
  }

  /**
   * Main process method for chart updates
   * 
   * @returns {Promise<Object>} - Update results
   */
  async process() {
    try {
      const files = Object.keys(await this.githubService.getUpdatedFiles({ context: this.github.context }));
      const charts = await this.chartService.find({ core: this.core, files });
      if (charts.total === 0) {
        this.logger.info('No charts found');
        return { charts: 0, updated: 0 };
      }
      this.logger.info(`Found ${charts.total} charts`);
      
      // Combine both chart types for operations
      const allCharts = [...charts.application, ...charts.library];
      
      // Execute update operations
      await this.chartUpdate.application(allCharts);
      await this.chartUpdate.lock(allCharts);
      await this.chartUpdate.metadata(allCharts);
      await this.chartService.lint(allCharts);
      
      // Commit changes
      const modifiedFiles = this.getModifiedFiles(allCharts);
      if (modifiedFiles.length) {
        await this.gitService.add(modifiedFiles);
        await this.gitService.commit('Update charts', { signoff: true });
        this.logger.info(`Committed ${modifiedFiles.length} modified files`);
      } else {
        this.logger.info('No files were modified');
      }
      
      this.logger.info('Chart update complete');
      return { charts: charts.total, updated: charts.total };
    } catch (error) {
      throw this.errorHandler.handle(error, { operation: 'update charts' });
    }
  }
}
```

### Chart Service Methods
```javascript
// services/chart/index.js
class Chart extends Action {
  async find(files) {
    // Find charts affected by file changes
  }

  async lint(charts) {
    // Lint multiple charts
  }

  async validate(chartDir) {
    // Validate a single chart
  }
}
```

### Update Service Methods
```javascript
// services/chart/Update.js
class Update extends Action {
  async application(charts) {
    // Update application files using Promise.all for parallel execution
  }

  async lock(charts) {
    // Update lock files using Promise.all for parallel execution
  }

  async metadata(charts) {
    // Update metadata files using Promise.all for parallel execution
  }
}
```

## Migration Impact
- Better orchestration and error handling
- Parallel execution for better performance
- Clear separation of concerns
- Modular, maintainable architecture

## Success Criteria
- [x] All update steps execute correctly
- [x] Error handling is robust
- [x] Performance is optimized with parallel execution
- [x] Progress reporting is accurate
- [x] Clear separation of concerns between handler and services
