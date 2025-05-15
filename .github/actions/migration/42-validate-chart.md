# Migration: `_validateChart()`

## Current Implementation
- **Location**: `.github/scripts/release-local.js` - `_validateChart()`
- **Purpose**: Validates a Helm chart using multiple validation methods
- **Dependencies**: `fs/promises`, `path`, `exec`, and `_validateIcon()`
- **Used by**: `processLocalReleases()`

## Code Analysis

The function performs comprehensive chart validation through:
1. Helm lint with strict mode (`helm lint --strict`)
2. Template rendering validation (`helm template`)
3. Kubernetes API validation (`kubectl apply --validate=true --dry-run=server`)
4. Icon validation (delegates to `_validateIcon()`)

It creates temporary files for Kubernetes validation and cleans them up afterward. Returns a boolean indicating validation success.

## Target Architecture
- **Target Class**: `ChartValidator`
- **Target Method**: `validateChart()`
- **New Dependencies**: 
  - `FileService` (for file operations)
  - `exec` (from context)

## Implementation Steps

### Step 1: Create ChartValidator class

```javascript
// utils/ChartValidator.js
const path = require('path');

class ChartValidator {
  constructor({ exec, fileService }) {
    this.exec = exec;
    this.fileService = fileService;
  }
  async validateChart(chartDir, tempDir) {
    try {
      console.log(`Validating '${chartDir}' chart...`);
      await this.exec.exec('helm', ['lint', '--strict', chartDir], { silent: true });
      console.log(`Checking template rendering for '${chartDir}' chart...`);
      const templateResult = await this.exec.getExecOutput('helm', ['template', chartDir], { silent: true });
      if (!templateResult.stdout.trim()) {
        throw new Error(`Chart ${chartDir} produced empty template output`);
      }
      console.log(`Validating Kubernetes resources for '${chartDir}' chart (this may take a moment)...`);
      const tempFile = path.join(tempDir, `${path.basename(chartDir)}-k8s-validation.yaml`);
      await this.fileService.writeFile(tempFile, templateResult.stdout);
      await this.exec.exec('kubectl', ['apply', '--validate=true', '--dry-run=server', '-f', tempFile], { silent: true });
      await this.fileService.unlink(tempFile);
      if (!await this.validateIcon(chartDir)) {
        return false;
      }
      return true;
    } catch (error) {
      console.error(`Failed to validate ${chartDir} chart: ${error.message}`);
      return false;
    }
  }
  async validateIcon(chartDir) {
    const IconValidator = require('./IconValidator');
    const iconValidator = new IconValidator({ fileService: this.fileService });
    return iconValidator.validate(chartDir);
  }
}

module.exports = ChartValidator;
```

### Step 2: Update LocalReleaseHandler to use ChartValidator

```javascript
// handlers/LocalReleaseHandler.js
const ChartValidator = require('../utils/ChartValidator');

class LocalReleaseHandler extends Action {
  constructor(context) {
    super(context);
    this.chartValidator = new ChartValidator(context);
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
const ChartValidator = require('./.github/actions/utils/ChartValidator');
const FileService = require('./.github/actions/services/FileService');

async function _validateChart({ exec, chartDir, tempDir }) {
  const fileService = new FileService({ exec });
  const validator = new ChartValidator({ exec, fileService });
  return validator.validateChart(chartDir, tempDir);
}
```

## Backward Compatibility

The implementation maintains backward compatibility by:
1. Keeping the same function signature
2. Returning the same boolean result
3. Preserving all console output messages
4. Maintaining identical validation steps
5. Delegating to the same icon validation logic

## Testing Strategy

1. **Unit Testing**:
   - Test successful chart validation
   - Test lint failures
   - Test template rendering failures
   - Test Kubernetes validation failures
   - Test icon validation failures
   - Mock exec and file operations
   - Verify temp file cleanup

2. **Integration Testing**:
   - Test with valid Helm charts
   - Test with charts having lint errors
   - Test with charts having template errors
   - Test with invalid Kubernetes resources
   - Test with missing or invalid icons

3. **Regression Testing**:
   - Compare validation results between implementations
   - Verify identical error messages
   - Check temp file cleanup behavior

## Code Examples

### Before (standalone function)
```javascript
async function _validateChart({ exec, chartDir, tempDir }) {
  try {
    console.log(`Validating '${chartDir}' chart...`);
    await exec.exec('helm', ['lint', '--strict', chartDir], { silent: true });
    console.log(`Checking template rendering for '${chartDir}' chart...`);
    const templateResult = await exec.getExecOutput('helm', ['template', chartDir], { silent: true });
    if (!templateResult.stdout.trim()) {
      throw new Error(`Chart ${chartDir} produced empty template output`);
    }
    console.log(`Validating Kubernetes resources for '${chartDir}' chart (this may take a moment)...`);
    const tempFile = path.join(tempDir, `${path.basename(chartDir)}-k8s-validation.yaml`);
    await fs.writeFile(tempFile, templateResult.stdout, 'utf8');
    await exec.exec('kubectl', ['apply', '--validate=true', '--dry-run=server', '-f', tempFile], { silent: true });
    await fs.unlink(tempFile);
    if (!await _validateIcon({ chartDir })) {
      return false;
    }
    return true;
  } catch (error) {
    console.error(`Failed to validate ${chartDir} chart: ${error.message}`);
    return false;
  }
}
```

### After (class method)
```javascript
class ChartValidator {
  async validateChart(chartDir, tempDir) {
    try {
      console.log(`Validating '${chartDir}' chart...`);
      await this.exec.exec('helm', ['lint', '--strict', chartDir], { silent: true });
      console.log(`Checking template rendering for '${chartDir}' chart...`);
      const templateResult = await this.exec.getExecOutput('helm', ['template', chartDir], { silent: true });
      if (!templateResult.stdout.trim()) {
        throw new Error(`Chart ${chartDir} produced empty template output`);
      }
      console.log(`Validating Kubernetes resources for '${chartDir}' chart (this may take a moment)...`);
      const tempFile = path.join(tempDir, `${path.basename(chartDir)}-k8s-validation.yaml`);
      await this.fileService.writeFile(tempFile, templateResult.stdout);
      await this.exec.exec('kubectl', ['apply', '--validate=true', '--dry-run=server', '-f', tempFile], { silent: true });
      await this.fileService.unlink(tempFile);
      if (!await this.validateIcon(chartDir)) {
        return false;
      }
      return true;
    } catch (error) {
      console.error(`Failed to validate ${chartDir} chart: ${error.message}`);
      return false;
    }
  }
}
```

## Migration Considerations

1. **Multi-stage Validation**: Performs multiple validation steps in sequence
2. **Temp File Management**: Creates and cleans up temporary files for K8s validation
3. **Icon Validation**: Delegates to a separate icon validation method
4. **Error Handling**: Returns false on any validation error
5. **Silent Execution**: CLI commands run silently to reduce output noise
6. **Kubernetes API**: Requires active cluster connection for validation
