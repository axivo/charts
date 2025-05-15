# Migration: findCharts()

## 🚫 MANDATORY CODING GUIDELINES

### THESE RULES ARE NON-NEGOTIABLE:
1. **NO EMPTY LINES INSIDE FUNCTIONS**
2. **NO COMMENTS INSIDE FUNCTIONS**
3. **JSDOC ONLY FOR DOCUMENTATION**
4. **NO INLINE COMMENTS IN CODE**
5. **FOLLOW EXISTING PATTERNS**

## Current Implementation

- Location: `utils.js - findCharts()`
- Purpose: Find charts affected by file changes
- Dependencies: `config()`, `fileExists()`
- Used by: `updateCharts()`, `processReleases()`

```javascript
/**
 * Finds deployed charts in application and library paths
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.core - GitHub Actions Core API
 * @param {Array<string>} params.files - List of changed files to check
 * @returns {Promise<Object>} - Object containing application and library chart paths
 */
async function findCharts({ core, files }) {
  const charts = { application: [], library: [], total: 0 };
  const chartTypes = Object.keys(charts).filter(type => type !== 'total');
  const chartDirs = new Set();
  try {
    for (const file of files) {
      for (const type of chartTypes) {
        const typePattern = config('repository').chart.type[type];
        if (file.startsWith(`${typePattern}/`)) {
          const parts = file.split('/');
          if (parts.length >= 3) {
            const chartPath = path.join(parts[0], parts[1]);
            chartDirs.add(`${type}:${chartPath}`);
          }
        }
      }
    }
    for (const chartDir of chartDirs) {
      const [type, chartPath] = chartDir.split(':');
      const chartYamlPath = path.join(chartPath, 'Chart.yaml');
      if (await fileExists(chartYamlPath)) {
        charts[type].push(chartPath);
        charts.total++;
      }
    }
    if (charts.total) {
      const word = charts.total === 1 ? 'chart' : 'charts';
      core.info(`Found ${charts.total} modified ${word}`);
    }
  } catch (error) {
    utils.handleError(error, core, 'find modified charts', false);
  }
  return charts;
}
```

## Code Analysis

This function identifies which charts are affected by file changes in a pull request or push. It:
1. Analyzes changed files to find chart directories
2. Validates each chart by checking for Chart.yaml
3. Returns categorized lists of affected charts (application/library)

## Target Architecture

- Target Class: `File`
- Target Method: `findCharts()`
- New Dependencies: `Config`, `Error` classes

## Implementation Steps

### Step 1: Add Method to File Service

Update `services/File.js`:

```javascript
const fs = require('fs/promises');
const path = require('path');
const Action = require('../core/Action');

class File extends Action {
  constructor(context) {
    super(context);
  }
  
  async exists(path) {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Finds deployed charts in application and library paths
   * 
   * @param {Array<string>} files - List of changed files to check
   * @returns {Promise<Object>} - Object containing application and library chart paths
   */
  async findCharts(files) {
    const charts = { application: [], library: [], total: 0 };
    const chartTypes = Object.keys(charts).filter(type => type !== 'total');
    const chartDirs = new Set();
    try {
      for (const file of files) {
        for (const type of chartTypes) {
          const typePattern = this.config.get(`repository.chart.type.${type}`);
          if (file.startsWith(`${typePattern}/`)) {
            const parts = file.split('/');
            if (parts.length >= 3) {
              const chartPath = path.join(parts[0], parts[1]);
              chartDirs.add(`${type}:${chartPath}`);
            }
          }
        }
      }
      for (const chartDir of chartDirs) {
        const [type, chartPath] = chartDir.split(':');
        const chartYamlPath = path.join(chartPath, 'Chart.yaml');
        if (await this.exists(chartYamlPath)) {
          charts[type].push(chartPath);
          charts.total++;
        }
      }
      if (charts.total) {
        const word = charts.total === 1 ? 'chart' : 'charts';
        this.logger.info(`Found ${charts.total} modified ${word}`);
      }
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'find modified charts',
        fatal: false
      });
    }
    return charts;
  }
}

module.exports = File;
```

### Step 2: Add Backward Compatibility

Update `utils.js`:

```javascript
const File = require('./.github/actions/services/File');
let fileInstance;

/**
 * Finds deployed charts in application and library paths
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.core - GitHub Actions Core API
 * @param {Array<string>} params.files - List of changed files to check
 * @returns {Promise<Object>} - Object containing application and library chart paths
 */
async function findCharts({ core, files }) {
  if (!fileInstance) {
    fileInstance = new File({ core });
  }
  return fileInstance.findCharts(files);
}
```

### Step 3: Update Calling Code

Search for uses of `findCharts()` and update them:

```javascript
// Before
const charts = await utils.findCharts({ core, files });

// After
const fileService = new File(context);
const charts = await fileService.findCharts(files);
```

## Testing Strategy

```javascript
const File = require('../services/File');

describe('File Service - findCharts', () => {
  let fileService;
  let mockContext;
  
  beforeEach(() => {
    mockContext = {
      core: { info: jest.fn() }
    };
    fileService = new File(mockContext);
  });
  
  it('should identify application charts from changed files', async () => {
    jest.spyOn(fileService, 'exists').mockResolvedValue(true);
    const files = ['application/my-app/Chart.yaml', 'application/my-app/values.yaml'];
    const result = await fileService.findCharts(files);
    expect(result.application).toContain('application/my-app');
    expect(result.total).toBe(1);
  });
  
  it('should ignore non-chart directories', async () => {
    jest.spyOn(fileService, 'exists').mockResolvedValue(false);
    const files = ['docs/README.md', 'scripts/test.js'];
    const result = await fileService.findCharts(files);
    expect(result.total).toBe(0);
  });
});
```

## Backward Compatibility

The wrapper maintains the same function signature, allowing existing code to work without modification.

## Code Examples

### Before Migration

```javascript
const files = Object.keys(await api.getUpdatedFiles({ github, context, core }));
const charts = await utils.findCharts({ core, files });
if (charts.total) {
  await docs.updateDocumentation({ github, context, core, exec, dirs: [...charts.application, ...charts.library] });
}
```

### After Migration

```javascript
const fileService = new File(context);
const files = Object.keys(await api.getUpdatedFiles({ github, context, core }));
const charts = await fileService.findCharts(files);
if (charts.total) {
  await docs.updateDocumentation({ github, context, core, exec, dirs: [...charts.application, ...charts.library] });
}
```

## Success Criteria

- [ ] Method added to File service
- [ ] Backward compatibility wrapper works
- [ ] All tests passing
- [ ] No breaking changes
- [ ] Existing workflows continue to function
