### Handling Shared Internal Functions

For functions that are used by both chart.js and release.js (like `_findCharts`), we'll follow this approach:

1. **During Migration:**
   - Import internal functions directly from chart.js to release.js
   - This avoids duplication while maintaining functionality
   - Example: `const { _findCharts } = require('./chart.js');`

2. **After Complete Migration:**
   - Evaluate which shared functions belong in utils.js vs. other locations
   - Move general-purpose shared functions to utils.js
   - Refactor as needed based on the complete picture

This pragmatic approach allows us to make progress without creating unnecessary files or making premature architectural decisions.

## Migration Tracking

### CONFIG Variables Migration Status

The following table tracks which CONFIG variables have been migrated from chart.js to release.js:

| Original (chart.js) | Migrated (release.js) | Status | Notes |
|---------------------|----------------------|--------|-------|
| `CONFIG.deployment` | `CONFIG.release.deployment` | ✅ | Used by setupBuildEnvironment |
| `CONFIG.filesystem.configPath` | `CONFIG.release.configuration.path` | ✅ | Restructured for better organization |
| `CONFIG.filesystem.configHome` | `CONFIG.release.configuration.home` | ✅ | Restructured for better organization |
| `CONFIG.filesystem.headCustomPath` | `CONFIG.release.head.path` | ✅ | Restructured for better organization |
| `CONFIG.filesystem.indexMdHome` | `CONFIG.release.frontpage.home` | ✅ | Restructured for better organization |
| `CONFIG.filesystem.indexMdPath` | `CONFIG.release.frontpage.path` | ✅ | Restructured for better organization |
| `CONFIG.filesystem.readmePath` | Hardcoded as './README.md' | ✅ | Removed from CONFIG as it's a constant |
| `CONFIG.filesystem.chart.application` | Not yet migrated | ❌ | - |
| `CONFIG.filesystem.chart.library` | Not yet migrated | ❌ | - |
| `CONFIG.filesystem.distPath` | Not yet migrated | ❌ | - |
| `CONFIG.filesystem.indexPath` | Not yet migrated | ❌ | - |
| `CONFIG.filesystem.indexRegistry` | Not yet migrated | ❌ | - |
| `CONFIG.filesystem.packagesPath` | Not yet migrated | ❌ | - |
| `CONFIG.chart.icon` | Not yet migrated | ❌ | - |
| `CONFIG.chart.indexTemplate` | Not yet migrated | ❌ | - |
| `CONFIG.chart.packagesWithIndex` | Not yet migrated | ❌ | - |
| `CONFIG.chart.releaseTemplate` | Not yet migrated | ❌ | - |
| `CONFIG.chart.releaseTitle` | Not yet migrated | ❌ | - |
| `CONFIG.chart.repoUrl` | Not yet migrated | ❌ | - |
| `CONFIG.chart.skipExisting` | Not yet migrated | ❌ | - |

This tracking table will be updated as more functions are migrated.

## Important Migration Notes

1. **Keep Original Code Intact**: 
   - Do not remove or modify any code in `/Users/floren/github/charts/.github/scripts/chart.js` until the entire migration is completed and thoroughly tested.
   - The original files serve as reference points and fallbacks if issues occur during migration.

2. **Parallel Implementation**:
   - During migration, both implementations (original in chart.js and new in release.js) will exist side by side.
   - This allows for comparison and easy rollback if needed.

3. **Testing Priority**:
   - After each function migration, test thoroughly before proceeding.
   - Only after all functions are migrated and fully tested would we consider removing code from the original files.

# Release Script Migration Plan

## Overview

This document outlines a methodical approach to migrate specific functions from `chart.js` to a consolidated `release.js` file. The goal is to improve code organization, reduce duplication, and create a more maintainable codebase.

## Current Functions Used in Workflow

Based on the `.github/workflows/release.yml` file, the following functions are currently used:

1. From `.github/scripts/chart.js`:
   - `processReleases`
   - `generateIndex`
   - `setupBuildEnvironment`

These are the primary functions we'll migrate to the new `release.js` file.

## Function Dependency Analysis

After analyzing the functions in `chart.js`, here are the dependencies for each target function:

### 1. `processReleases` Dependencies:
- `_packageCharts`
  - `_findCharts`
- `_createChartReleases`
  - `_buildChartRelease`
    - `_generateChartRelease`
- `_generateHelmIndex`

### 2. `generateIndex` Dependencies:
- No internal function dependencies, but uses utils.registerHandlebarsHelpers

### 3. `setupBuildEnvironment` Dependencies:
- No internal function dependencies, but uses utils.fileExists and utils.handleError

## Configuration Requirements

Each function requires specific CONFIG properties:

### `processReleases` CONFIG Requirements:
```javascript
CONFIG.release = {
  packagesPath: '.cr-release-packages',
  chart: {
    repoUrl: 'https://axivo.github.io/charts/',
    skipExisting: true,
    icon: 'icon.png',
    releaseTemplate: '.github/templates/release.md.hbs',
    releaseTitle: '{{ .Name }}-v{{ .Version }}'
  },
  filesystem: {
    chart: {
      application: 'application',
      library: 'library'
    },
    distPath: './_dist',
    indexPath: './_dist/index.yaml',
    indexRegistry: 'index.yaml'
  }
};
```

### `generateIndex` CONFIG Requirements:
```javascript
CONFIG.release = {
  chart: {
    indexTemplate: '.github/templates/index.md.hbs'
  },
  filesystem: {
    indexPath: './_dist/index.yaml',
    indexMdPath: './_dist/index.md',
    indexMdHome: './index.md'
  }
};
```

### `setupBuildEnvironment` CONFIG Requirements:
```javascript
CONFIG.release = {
  deployment: 'production',
  filesystem: {
    configPath: '.github/templates/config.yml',
    configHome: './_config.yml',
    headCustomPath: './_includes/head-custom.html',
    indexMdHome: './index.md',
    indexMdPath: './_dist/index.md',
    readmePath: './README.md'
  }
};
```

## Migration Plan

### Phase 1: Create release.js with Initial Configuration

Create a new file at `.github/scripts/release.js` with an initial configuration structure:

```javascript
/**
 * Chart Release Utilities
 * 
 * This module provides functions for Helm chart management, releases and GitHub Pages generation.
 * 
 * @module release
 */

const fs = require('fs/promises');
const path = require('path');
const yaml = require('js-yaml');
const utils = require('./utils');
const githubApi = require('./github-api');

/**
 * Configuration constants for Release module
 */
const CONFIG = {
  release: {
    // Will be populated as functions are migrated
  }
};

module.exports = {
  CONFIG
};
```

### Phase 2: Migrate Functions One by One

We'll migrate functions in this order:

1. `setupBuildEnvironment` (simplest function with fewest dependencies)
2. `generateIndex` (moderate complexity)
3. `processReleases` and its dependencies (most complex)

For each function, we will:

1. Add the necessary CONFIG properties required by the function
2. Copy the function and its dependencies from chart.js to release.js
3. Update the function to use the new CONFIG.release structure
4. Export the function
5. Update the workflow file to use the function from release.js
6. Test thoroughly before proceeding to the next function

#### Step 1: Migrate `setupBuildEnvironment` ✅

1. Added required CONFIG properties with improved categorization:
```javascript
CONFIG.release = {
  deployment: 'production',
  
  // Organized into logical categories
  configuration: {
    path: '.github/templates/config.yml',
    home: './_config.yml',
  },
  head: {
    path: './_includes/head-custom.html',
  },
  frontpage: {
    home: './index.md',
    path: './_dist/index.md',
  }
  // Removed readme.path as it's a constant that doesn't need configuration
};
```

2. Migrated the function with updated CONFIG references
3. Updated workflow file to use the new function
4. Ready for testing

**Changes made:**
- Added function to `release.js` with full JSDoc documentation
- Organized CONFIG properties into logical categories for better maintainability
- Removed unnecessary configuration for constants (README.md path)
- Updated all references in the function to use the new structure
- Modified workflow file to import from release.js instead of chart.js

#### Step 2: Migrate `generateIndex`

1. Add additional required CONFIG properties:
```javascript
CONFIG.release.chart = {
  indexTemplate: '.github/templates/index.md.hbs'
};
CONFIG.release.filesystem = {
  ...CONFIG.release.filesystem,
  indexPath: './_dist/index.yaml',
  indexMdPath: './_dist/index.md',
  indexMdHome: './index.md'
};
```

2. Migrate the function with updated CONFIG references
3. Update workflow file to use the new function
4. Test deployment

#### Step 3: Migrate `processReleases` and Dependencies

1. Add additional required CONFIG properties:
```javascript
CONFIG.release.packagesPath = '.cr-release-packages';
CONFIG.release.chart = {
  ...CONFIG.release.chart,
  repoUrl: 'https://axivo.github.io/charts/',
  skipExisting: true,
  icon: 'icon.png',
  releaseTemplate: '.github/templates/release.md.hbs',
  releaseTitle: '{{ .Name }}-v{{ .Version }}'
};
CONFIG.release.filesystem = {
  ...CONFIG.release.filesystem,
  chart: {
    application: 'application',
    library: 'library'
  },
  distPath: './_dist',
  indexPath: './_dist/index.yaml',
  indexRegistry: 'index.yaml'
};
```

2. Migrate the helper functions in this order:
   - `_findCharts`
   - `_generateChartRelease`
   - `_buildChartRelease`
   - `_createChartReleases`
   - `_generateHelmIndex`
   - `_packageCharts`
   - `processReleases`

3. Update workflow file to use the new function
4. Test deployment

## Testing Strategy

For each function migration:

1. Create a new branch for the current function being migrated
2. Add the required CONFIG properties and migrate the function with its dependencies
3. Update the workflow file to use the new function
4. Test the changes using workflow_dispatch to manually trigger the workflow
5. Compare results with the original workflow behavior
6. Address any issues immediately before proceeding to the next function
7. Only merge when functionality is confirmed identical

## Future Considerations

After all functions have been migrated and tested:

1. Consider creating helper functions to consolidate duplicate code
2. Review error handling and logging for consistency
3. Add additional JSDoc documentation as needed
4. Consider whether any remaining functions in chart.js should be refactored

This migration approach ensures we maintain a working codebase throughout the process while systematically improving its organization and maintainability.
