# Migration: `processLocalReleases()`

## Current Implementation
- **Location**: `.github/scripts/release-local.js` - `processLocalReleases()`
- **Purpose**: Validates and packages charts for local development environment
- **Dependencies**: `config`, `utils`, `fs/promises`, `path`
- **Used by**: Local development workflows for chart testing

## Code Analysis

The function performs these main steps:
1. Checks deployment mode (skips if production)
2. Validates required dependencies (git, helm, kubectl, and Node packages)
3. Finds modified charts using git status
4. Validates each chart (lint, template, Kubernetes API validation, icon validation)
5. Packages valid charts
6. Generates a local Helm repository index

It also calls several private helper functions:
- `_checkDependencies()` - Checks for required tools and packages
- `_validateChart()` - Validates chart using multiple methods
- `_validateIcon()` - Validates chart icon dimensions
- `_packageChart()` - Updates dependencies and packages chart
- `_generateLocalIndex()` - Generates Helm repository index

## Target Architecture
- **Target Class**: `LocalReleaseHandler`
- **Target Method**: `process()`
- **New Dependencies**: 
  - `Configuration` (for config management)
  - `FileService` (for file operations)
  - `GitService` (for git operations)
  - `HelmService` (for Helm operations)
  - `ValidatorService` (for chart validation)
  - `ChartValidator` (for specific validation logic)

## Implementation Steps

### Step 1: Create ValidatorService class

```javascript
// services/ValidatorService.js
class ValidatorService {
  constructor({ exec, fileService }) {
    this.exec = exec;
    this.fileService = fileService;
  }
  async checkDependencies() {
    const requiredTools = [
      { name: 'git', command: ['--version'] },
      { name: 'helm', command: ['version', '--short'] },
      { name: 'kubectl', command: ['version', '--client'] }
    ];
    let allDepsAvailable = true;
    console.log('Checking required dependencies...');
    try {
      console.log('Connecting to Kubernetes cluster (this may take a moment)...');
      const { exitCode, stdout } = await this.exec.getExecOutput('kubectl', ['cluster-info'], { silent: true });
      if (exitCode !== 0) {
        console.error(`❌ No Kubernetes cluster is accessible`);
        allDepsAvailable = false;
      } else {
        const clusterInfo = stdout.split('\n')[0];
        console.log(`✅ Kubernetes cluster endpoint ${clusterInfo.replace('Kubernetes control plane is running at ', '')}`);
      }
    } catch (error) {
      console.error(`❌ No Kubernetes cluster is accessible`);
      allDepsAvailable = false;
    }
    for (const tool of requiredTools) {
      try {
        const { exitCode, stdout } = await this.exec.getExecOutput(tool.name, tool.command, { silent: true });
        if (exitCode !== 0) {
          console.error(`❌ ${tool.name} is not properly installed or configured`);
          allDepsAvailable = false;
        } else {
          const version = stdout.trim().split('\n')[0];
          let displayName = tool.name;
          switch (tool.name) {
            case 'git':
              displayName = `${tool.name} ${version.replace('git version ', '')}`;
              break;
            case 'helm':
              displayName = `${tool.name} ${version}`;
              break;
            case 'kubectl':
              displayName = `${tool.name} ${version.toLowerCase().replace('client version: ', 'client ')}`;
              break;
          }
          console.log(`✅ ${displayName}`);
        }
      } catch (error) {
        console.error(`❌ ${tool.name} is not installed or not in PATH`);
        allDepsAvailable = false;
      }
    }
    const requiredPackages = ['@actions/exec', 'handlebars', 'js-yaml', 'sharp'];
    for (const pkg of requiredPackages) {
      try {
        const pkgPath = require.resolve(pkg);
        let version = 'installed';
        try {
          const pkgJson = require(`${pkg}/package.json`);
          version = pkgJson.version || 'installed';
        } catch (versionError) {
          console.log(`Note: Could not determine version for '${pkg}': ${versionError.message}`);
        }
        console.log(`✅ Node.js package '${pkg}' ${version}`);
      } catch (error) {
        console.error(`❌ Node.js package '${pkg}' is missing. Run: npm install ${pkg}`);
        allDepsAvailable = false;
      }
    }
    return allDepsAvailable;
  }
}

module.exports = ValidatorService;
```

### Step 2: Create ChartValidator class

```javascript
// utils/ChartValidator.js
const path = require('path');
const sharp = require('sharp');

class ChartValidator {
  constructor({ exec, fileService }) {
    this.exec = exec;
    this.fileService = fileService;
  }
  async validateIcon(chartDir) {
    try {
      console.log(`Validating icon for '${chartDir}' chart...`);
      const iconPath = path.join(chartDir, 'icon.png');
      try {
        await this.fileService.access(iconPath);
      } catch (error) {
        throw new Error(`icon.png not found in '${chartDir}' directory`);
      }
      try {
        const metadata = await sharp(iconPath).metadata();
        if (metadata.width !== 256 || metadata.height !== 256) {
          throw new Error(`Icon in '${chartDir}' has dimensions ${metadata.width}x${metadata.height}px, required size is 256x256px`);
        }
        if (metadata.format !== 'png') {
          throw new Error(`Icon in ${chartDir} is not in PNG format, required format is PNG`);
        }
      } catch (error) {
        if (error.message.includes('Input file is missing')) {
          throw new Error(`Cannot read icon file at ${iconPath}, file may be corrupt`);
        }
        throw error;
      }
      console.log(`Icon validation successful for '${chartDir}' chart`);
      return true;
    } catch (error) {
      console.error(`Failed to validate icon for ${chartDir} chart: ${error.message}`);
      return false;
    }
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
      await this.fileService.writeFile(tempFile, templateResult.stdout, 'utf8');
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

module.exports = ChartValidator;
```

### Step 3: Create LocalReleaseHandler class

```javascript
// handlers/LocalReleaseHandler.js
const path = require('path');
const Action = require('../core/Action');
const Configuration = require('../config/Configuration');
const FileService = require('../services/FileService');
const GitService = require('../services/GitService');
const HelmService = require('../services/HelmService');
const ValidatorService = require('../services/ValidatorService');
const ChartValidator = require('../utils/ChartValidator');

class LocalReleaseHandler extends Action {
  constructor(context) {
    super(context);
    this.config = new Configuration();
    this.fileService = new FileService(context);
    this.gitService = new GitService(context);
    this.helmService = new HelmService(context);
    this.validatorService = new ValidatorService(context);
    this.chartValidator = new ChartValidator(context);
  }
  async process() {
    try {
      if (this.config.get('repository.release.deployment') === 'production') {
        console.log("In 'production' deployment mode, skipping local releases process");
        return;
      }
      const depsAvailable = await this.validatorService.checkDependencies();
      if (!depsAvailable) {
        console.error('Missing required dependencies');
        return;
      }
      const appChartType = this.config.get('repository.chart.type.application');
      const libChartType = this.config.get('repository.chart.type.library');
      const files = await this.gitService.getModifiedFiles(['--porcelain']);
      const filteredFiles = files.filter(file => 
        file.startsWith(appChartType) || file.startsWith(libChartType)
      );
      const charts = await this.fileService.findCharts(filteredFiles);
      if (!(charts.total)) {
        this.context.core.info(`No ${charts.word} chart releases found`);
        return;
      }
      const chartDirs = [...charts.application, ...charts.library];
      const localPackagesDir = './.cr-local-packages';
      console.log(`Creating ${localPackagesDir} directory...`);
      await this.fileService.createDirectory(localPackagesDir);
      console.log(`Successfully created ${localPackagesDir} directory`);
      const validCharts = [];
      for (const chartDir of chartDirs) {
        if (await this.chartValidator.validateChart(chartDir, localPackagesDir)) {
          if (await this.packageChart(chartDir, localPackagesDir)) {
            validCharts.push(chartDir);
          }
        }
      }
      if (!validCharts.length) {
        console.log('No charts required for packaging');
        return;
      }
      const word = validCharts.length === 1 ? 'chart' : 'charts';
      console.log(`Successfully packaged ${validCharts.length} ${word}`);
      await this.generateLocalIndex(localPackagesDir);
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'process local releases',
        fatal: false
      });
    }
  }
  async packageChart(chartDir, outputDir) {
    try {
      console.log(`Packaging '${chartDir}' chart for local testing...`);
      console.log(`Updating dependencies for '${chartDir}' chart...`);
      await this.helmService.updateDependencies(chartDir);
      await this.helmService.packageChart(chartDir, outputDir);
      return true;
    } catch (error) {
      console.error(`Failed to package ${chartDir} chart: ${error.message}`);
      return false;
    }
  }
  async generateLocalIndex(packagesDir) {
    try {
      console.log('Generating local Helm repository index...');
      const indexPath = path.join(packagesDir, 'index.yaml');
      await this.helmService.generateRepositoryIndex(packagesDir);
      console.log(`Successfully generated ${indexPath} repository index`);
      return true;
    } catch (error) {
      console.error(`Failed to generate local Helm repository index: ${error.message}`);
      return false;
    }
  }
}

module.exports = LocalReleaseHandler;
```

### Step 4: Create backward compatibility adapter

```javascript
// release-local.js (temporary adapter during migration)
const LocalReleaseHandler = require('./.github/actions/handlers/LocalReleaseHandler');

async function processLocalReleases({ core, exec }) {
  const handler = new LocalReleaseHandler({ core, exec });
  return handler.process();
}

module.exports = processLocalReleases;
```

## Backward Compatibility

The implementation maintains backward compatibility by:
1. Keeping the same function signature in the adapter
2. Returning the same result structure
3. Maintaining identical error handling behavior
4. Preserving all console output

## Testing Strategy

1. **Unit Testing**:
   - Test `LocalReleaseHandler.process()` with mock dependencies
   - Test `ValidatorService.checkDependencies()` with various tool availability scenarios
   - Test `ChartValidator.validateChart()` with valid and invalid charts
   - Test `ChartValidator.validateIcon()` with various icon conditions

2. **Integration Testing**:
   - Test the complete flow with real charts in a local environment
   - Test with missing dependencies to verify error handling
   - Test with no modified charts to verify early exit

3. **Regression Testing**:
   - Compare output between old and new implementations
   - Verify identical behavior for all edge cases
   - Ensure the same charts are packaged in both versions

## Code Examples

### Before (procedural style)
```javascript
async function processLocalReleases({ core, exec }) {
  try {
    if (config('repository').release.deployment === 'production') {
      console.log("In 'production' deployment mode, skipping local releases process");
      return;
    }
    const depsAvailable = await _checkDependencies({ exec });
    if (!depsAvailable) {
      console.error('Missing required dependencies');
      return;
    }
    // ... more procedural code
  } catch (error) {
    console.error(`Error processing local releases: ${error.message}`);
  }
}
```

### After (object-oriented style)
```javascript
class LocalReleaseHandler extends Action {
  async process() {
    try {
      if (this.config.get('repository.release.deployment') === 'production') {
        console.log("In 'production' deployment mode, skipping local releases process");
        return;
      }
      const depsAvailable = await this.validatorService.checkDependencies();
      if (!depsAvailable) {
        console.error('Missing required dependencies');
        return;
      }
      // ... more OOP code
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'process local releases',
        fatal: false
      });
    }
  }
}
```

## Migration Considerations

1. **Dependency Validation**: The `_checkDependencies()` function is moved to `ValidatorService`
2. **Chart Validation**: The `_validateChart()` and `_validateIcon()` functions are moved to `ChartValidator`
3. **Packaging Logic**: The `_packageChart()` method is integrated into the main handler
4. **Index Generation**: The `_generateLocalIndex()` method is also integrated into the handler
5. **Sharp Dependency**: The `sharp` library dependency is isolated in the `ChartValidator` class
