# Migration: `_packageChart()`

## Current Implementation
- **Location**: `.github/scripts/release-local.js` - `_packageChart()`
- **Purpose**: Packages a Helm chart after updating its dependencies
- **Dependencies**: `exec` from GitHub Actions
- **Used by**: `processLocalReleases()`

## Code Analysis

The function:
1. Updates chart dependencies using `helm dependency update`
2. Packages the chart using `helm package` command
3. Saves the packaged chart to a specified output directory
4. Returns a boolean indicating success or failure
5. Provides console logging for each step

The function handles both application and library charts, ensuring all dependencies are resolved before packaging.

## Target Architecture
- **Target Class**: `HelmService`
- **Target Method**: `packageChart()` and `updateDependencies()`
- **New Dependencies**: None (already receives exec)

## Implementation Steps

### Step 1: Add methods to HelmService class

```javascript
// services/HelmService.js
class HelmService {
  constructor({ exec }) {
    this.exec = exec;
  }
  async updateDependencies(chartDir) {
    console.log(`Updating dependencies for '${chartDir}' chart...`);
    await this.exec.exec('helm', ['dependency', 'update', chartDir], { silent: true });
  }
  async packageChart(chartDir, outputDir) {
    await this.exec.exec('helm', ['package', chartDir, '--destination', outputDir], { silent: true });
  }
  async packageChartWithDependencies(chartDir, outputDir) {
    try {
      console.log(`Packaging '${chartDir}' chart for local testing...`);
      await this.updateDependencies(chartDir);
      await this.packageChart(chartDir, outputDir);
      return true;
    } catch (error) {
      console.error(`Failed to package ${chartDir} chart: ${error.message}`);
      return false;
    }
  }
}

module.exports = HelmService;
```

### Step 2: Update LocalReleaseHandler to use HelmService method

```javascript
// handlers/LocalReleaseHandler.js
const HelmService = require('../services/HelmService');

class LocalReleaseHandler extends Action {
  constructor(context) {
    super(context);
    this.helmService = new HelmService(context);
  }
  async process() {
    // ... earlier code
    for (const chartDir of chartDirs) {
      if (await this.chartValidator.validateChart(chartDir, localPackagesDir)) {
        if (await this.helmService.packageChartWithDependencies(chartDir, localPackagesDir)) {
          validCharts.push(chartDir);
        }
      }
    }
    // ... rest of the method
  }
}
```

### Step 3: Create backward compatibility adapter

```javascript
// release-local.js (temporary adapter during migration)
const HelmService = require('./.github/actions/services/HelmService');

async function _packageChart({ exec, chartDir, outputDir }) {
  const helmService = new HelmService({ exec });
  return helmService.packageChartWithDependencies(chartDir, outputDir);
}
```

## Backward Compatibility

The implementation maintains backward compatibility by:
1. Keeping the same function signature
2. Returning the same boolean result
3. Preserving console output messages
4. Maintaining identical error handling behavior

## Testing Strategy

1. **Unit Testing**:
   - Test successful chart packaging
   - Test dependency update failures
   - Test packaging failures
   - Mock exec to verify correct helm commands
   - Verify console logging behavior

2. **Integration Testing**:
   - Test with real Helm charts
   - Verify .tgz files are created in output directory
   - Test with charts having dependencies
   - Test with invalid chart directories

3. **Regression Testing**:
   - Compare packaged chart files between implementations
   - Verify same behavior for error cases
   - Check console output matches exactly

## Code Examples

### Before (standalone function)
```javascript
async function _packageChart({ exec, chartDir, outputDir }) {
  try {
    console.log(`Packaging '${chartDir}' chart for local testing...`);
    console.log(`Updating dependencies for '${chartDir}' chart...`);
    await exec.exec('helm', ['dependency', 'update', chartDir], { silent: true });
    await exec.exec('helm', ['package', chartDir, '--destination', outputDir], { silent: true });
    return true;
  } catch (error) {
    console.error(`Failed to package ${chartDir} chart: ${error.message}`);
    return false;
  }
}
```

### After (service methods)
```javascript
class HelmService {
  async updateDependencies(chartDir) {
    console.log(`Updating dependencies for '${chartDir}' chart...`);
    await this.exec.exec('helm', ['dependency', 'update', chartDir], { silent: true });
  }
  async packageChart(chartDir, outputDir) {
    await this.exec.exec('helm', ['package', chartDir, '--destination', outputDir], { silent: true });
  }
  async packageChartWithDependencies(chartDir, outputDir) {
    try {
      console.log(`Packaging '${chartDir}' chart for local testing...`);
      await this.updateDependencies(chartDir);
      await this.packageChart(chartDir, outputDir);
      return true;
    } catch (error) {
      console.error(`Failed to package ${chartDir} chart: ${error.message}`);
      return false;
    }
  }
}
```

## Migration Considerations

1. **Method Separation**: The functionality is split into three methods for better modularity
2. **Error Handling**: Returns false on error instead of throwing exceptions
3. **Console Logging**: Preserves exact log messages for compatibility
4. **Silent Execution**: Helm commands run silently to avoid output clutter
5. **Dependency Resolution**: Always updates dependencies before packaging
