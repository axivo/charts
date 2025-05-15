# Migration: `_checkDependencies()`

## Current Implementation
- **Location**: `.github/scripts/release-local.js` - `_checkDependencies()`
- **Purpose**: Checks if all required dependencies (tools and packages) are installed
- **Dependencies**: `exec` from GitHub Actions
- **Used by**: `processLocalReleases()`

## Code Analysis

The function validates:
1. Kubernetes cluster connectivity
2. CLI tools: git, helm, and kubectl with version checking
3. Node.js packages: @actions/exec, handlebars, js-yaml, sharp

It provides detailed console output showing the status of each dependency with colored checkmarks/crosses. Returns a boolean indicating whether all dependencies are available.

## Target Architecture
- **Target Class**: `ValidatorService`
- **Target Method**: `checkDependencies()`
- **New Dependencies**: None (already receives exec)

## Implementation Steps

### Step 1: Create ValidatorService class

```javascript
// services/ValidatorService.js
class ValidatorService {
  constructor({ exec }) {
    this.exec = exec;
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

### Step 2: Update LocalReleaseHandler to use ValidatorService

```javascript
// handlers/LocalReleaseHandler.js
const ValidatorService = require('../services/ValidatorService');

class LocalReleaseHandler extends Action {
  constructor(context) {
    super(context);
    this.validatorService = new ValidatorService(context);
  }
  async process() {
    try {
      const depsAvailable = await this.validatorService.checkDependencies();
      if (!depsAvailable) {
        console.error('Missing required dependencies');
        return;
      }
      // ... rest of the process method
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'process local releases',
        fatal: false
      });
    }
  }
}
```

### Step 3: Create backward compatibility adapter

```javascript
// release-local.js (temporary adapter during migration)
const ValidatorService = require('./.github/actions/services/ValidatorService');

async function _checkDependencies({ exec }) {
  const validator = new ValidatorService({ exec });
  return validator.checkDependencies();
}
```

## Backward Compatibility

The implementation maintains backward compatibility by:
1. Keeping the same function signature
2. Returning the same boolean result
3. Preserving all console output formatting
4. Maintaining identical error handling

## Testing Strategy

1. **Unit Testing**:
   - Test with all dependencies available
   - Test with some tools missing
   - Test with packages missing
   - Test with no Kubernetes cluster
   - Test version parsing for different tool outputs

2. **Integration Testing**:
   - Test in environments with various dependency states
   - Verify console output matches original format
   - Test with real CLI tools and packages

3. **Regression Testing**:
   - Compare output between old and new implementations
   - Verify identical behavior for all dependency states

## Code Examples

### Before (standalone function)
```javascript
async function _checkDependencies({ exec }) {
  const requiredTools = [
    { name: 'git', command: ['--version'] },
    { name: 'helm', command: ['version', '--short'] },
    { name: 'kubectl', command: ['version', '--client'] }
  ];
  let allDepsAvailable = true;
  // ... validation logic
  return allDepsAvailable;
}
```

### After (service method)
```javascript
class ValidatorService {
  constructor({ exec }) {
    this.exec = exec;
  }
  async checkDependencies() {
    const requiredTools = [
      { name: 'git', command: ['--version'] },
      { name: 'helm', command: ['version', '--short'] },
      { name: 'kubectl', command: ['version', '--client'] }
    ];
    let allDepsAvailable = true;
    // ... validation logic
    return allDepsAvailable;
  }
}
```

## Migration Considerations

1. **Tool Version Parsing**: The version parsing logic is specific to each tool's output format
2. **Package Version Detection**: Falls back gracefully when package.json can't be accessed
3. **Error Handling**: Catches errors for each check individually to continue validation
4. **Console Output**: Uses colored Unicode symbols (✅/❌) for visual feedback
5. **Kubernetes Connectivity**: Checks cluster access as the first validation step
