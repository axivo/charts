# Migration: `_generateLocalIndex()`

## Current Implementation
- **Location**: `.github/scripts/release-local.js` - `_generateLocalIndex()`
- **Purpose**: Generates a local Helm repository index file (index.yaml)
- **Dependencies**: `path`, `exec` from GitHub Actions
- **Used by**: `processLocalReleases()`

## Code Analysis

The function:
1. Generates a Helm repository index using `helm repo index` command
2. Creates an index.yaml file in the specified directory
3. Returns a boolean indicating success or failure
4. Provides console logging for status and errors

This is a simple wrapper around the Helm CLI command with error handling and logging.

## Target Architecture
- **Target Class**: `HelmService`
- **Target Method**: `generateRepositoryIndex()`
- **New Dependencies**: None (already receives exec)

## Implementation Steps

### Step 1: Add method to HelmService class

```javascript
// services/HelmService.js
const path = require('path');

class HelmService {
  constructor({ exec }) {
    this.exec = exec;
  }
  async generateRepositoryIndex(packagesDir) {
    try {
      console.log('Generating local Helm repository index...');
      const indexPath = path.join(packagesDir, 'index.yaml');
      await this.exec.exec('helm', ['repo', 'index', packagesDir], { silent: true });
      console.log(`Successfully generated ${indexPath} repository index`);
      return true;
    } catch (error) {
      console.error(`Failed to generate local Helm repository index: ${error.message}`);
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
    await this.helmService.generateRepositoryIndex(localPackagesDir);
  }
}
```

### Step 3: Create backward compatibility adapter

```javascript
// release-local.js (temporary adapter during migration)
const HelmService = require('./.github/actions/services/HelmService');

async function _generateLocalIndex({ exec, packagesDir }) {
  const helmService = new HelmService({ exec });
  return helmService.generateRepositoryIndex(packagesDir);
}
```

## Backward Compatibility

The implementation maintains backward compatibility by:
1. Keeping the same function signature
2. Returning the same boolean result
3. Preserving console output format
4. Maintaining identical error handling behavior

## Testing Strategy

1. **Unit Testing**:
   - Test successful index generation
   - Test failure scenarios (invalid directory, helm errors)
   - Mock exec to verify correct helm command execution
   - Verify console logging behavior

2. **Integration Testing**:
   - Test with actual packaged charts directory
   - Verify index.yaml file is created
   - Test with empty directory
   - Test with non-existent directory

3. **Regression Testing**:
   - Compare index.yaml output between implementations
   - Verify same behavior for all edge cases

## Code Examples

### Before (standalone function)
```javascript
async function _generateLocalIndex({ exec, packagesDir }) {
  try {
    console.log('Generating local Helm repository index...');
    const indexPath = path.join(packagesDir, 'index.yaml');
    await exec.exec('helm', ['repo', 'index', packagesDir], { silent: true });
    console.log(`Successfully generated ${indexPath} repository index`);
    return true;
  } catch (error) {
    console.error(`Failed to generate local Helm repository index: ${error.message}`);
    return false;
  }
}
```

### After (service method)
```javascript
class HelmService {
  async generateRepositoryIndex(packagesDir) {
    try {
      console.log('Generating local Helm repository index...');
      const indexPath = path.join(packagesDir, 'index.yaml');
      await this.exec.exec('helm', ['repo', 'index', packagesDir], { silent: true });
      console.log(`Successfully generated ${indexPath} repository index`);
      return true;
    } catch (error) {
      console.error(`Failed to generate local Helm repository index: ${error.message}`);
      return false;
    }
  }
}
```

## Migration Considerations

1. **Path Module**: The function requires the Node.js path module for joining paths
2. **Silent Execution**: The helm command runs silently to avoid cluttering output
3. **Error Handling**: Returns false on error instead of throwing exceptions
4. **Console Logging**: Provides status messages for user feedback
5. **Index Location**: The index.yaml file is created in the packages directory
