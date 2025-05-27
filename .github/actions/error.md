# Error Handling Unification - Code Update Plan

## Overview

After analyzing the Label service implementation, we've identified an opportunity to unify error handling across the entire codebase by eliminating typed error classes in favor of a consistent `execute()` pattern with `ErrorHandler`.

## Current Architecture Issues

The codebase currently has **dual error handling patterns**:

1. **Typed Error Classes**: 11 specialized error classes (ChartError, FileError, etc.)
2. **ErrorHandler Pattern**: Direct use of `this.errorHandler.handle()`

This creates inconsistency and unnecessary complexity.

## Unified Execute Method Pattern

### Standard Execute Method
```javascript
async execute(operation, action, fatal = true) {
  try {
    return await action();
  } catch (error) {
    this.errorHandler.handle(error, { operation, fatal });
    return null;
  }
}
```

### Service Method Pattern
```javascript
// Fatal error (default) - stops workflow
async methodName(params) {
  return this.execute('operation description', async () => {
    // pure business logic
  });
}

// Non-fatal error - logs warning, continues workflow
async optionalMethod(params) {
  return this.execute('operation description', async () => {
    // pure business logic
  }, false);
}
```

## Label Service - Perfect Implementation Example

The Label service has been successfully converted to the unified pattern and serves as the **template for all other services**:

### Complete Label Service Implementation
```javascript
/**
 * Label service for repository label operations
 * 
 * @class Label
 * @module services/Label
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Action = require('../core/Action');

class Label extends Action {
  constructor(params) {
    super(params);
  }

  async add(name) {
    return this.execute(`add '${name}' label`, async () => {
      if (!name) {
        this.logger.warning('Label name is required');
        return false;
      }
      const labelConfig = this.config.get(`issue.labels.${name}`);
      if (!labelConfig) {
        this.logger.warning(`Label configuration not found for '${name}'`);
        return false;
      }
      const githubRest = this.github.rest || this.github;
      try {
        await githubRest.issues.getLabel({
          owner: this.context.repo.owner,
          repo: this.context.repo.repo,
          name: name
        });
        return true;
      } catch (error) {
        if (error.status === 404) {
          if (!this.config.get('issue.createLabels')) {
            this.logger.warning(`Label '${name}' not found and createLabels is disabled`);
            return false;
          }
          await githubRest.issues.createLabel({
            owner: this.context.repo.owner,
            repo: this.context.repo.repo,
            name: name,
            color: labelConfig.color,
            description: labelConfig.description
          });
          this.logger.info(`Created '${name}' label`);
          return true;
        }
        throw error;
      }
    }, false);
  }

  async execute(operation, action, fatal = true) {
    try {
      return await action();
    } catch (error) {
      this.errorHandler.handle(error, { operation, fatal });
      return null;
    }
  }

  async update() {
    return this.execute('update repository issue labels', async () => {
      if (!this.config.get('issue.createLabels')) {
        this.logger.info('Label creation is disabled in configuration, skipping label updates');
        return [];
      }
      this.logger.info('Updating repository issue labels...');
      const labelNames = Object.keys(this.config.get('issue.labels'));
      const results = await Promise.all(
        labelNames.map(async labelName => {
          const created = await this.add(labelName);
          return created ? labelName : null;
        })
      );
      const createdLabels = results.filter(Boolean);
      if (createdLabels.length) {
        this.logger.info(`Successfully updated ${createdLabels.length} issue labels`);
      }
      return createdLabels;
    }, false);
  }
}

module.exports = Label;
```

### Key Implementation Points

#### 1. Removed Error Class Import
```javascript
// REMOVED: const { LabelError } = require('../utils/errors');
// Only import Action base class
const Action = require('../core/Action');
```

#### 2. Standard Execute Method
```javascript
// Clean, simple execute method following coding guidelines
async execute(operation, action, fatal = true) {
  try {
    return await action();
  } catch (error) {
    this.errorHandler.handle(error, { operation, fatal });
    return null;
  }
}
```

#### 3. Non-Fatal Operations
```javascript
// Label operations are non-fatal - use fatal = false
async add(name) {
  return this.execute(`add '${name}' label`, async () => {
    // business logic
  }, false); // Non-fatal: label creation shouldn't break workflows
}

async update() {
  return this.execute('update repository issue labels', async () => {
    // business logic
  }, false); // Non-fatal: label updates are supplementary
}
```

#### 4. Error File Cleanup Completed
- **Deleted**: `/utils/errors/Label.js` (entire file removed)
- **Updated**: `/utils/errors/index.js` (removed LabelError export)
- **Result**: Zero references to LabelError anywhere in codebase

## Service-by-Service Implementation

### 1. Chart Service (`/services/chart/`)

**Current Status:** Uses ChartError
**Update Required:** Replace with execute pattern

**Implementation Steps:**
1. Remove `const { ChartError } = require('../utils/errors');`
2. Update execute method to standard pattern
3. Determine fatal/non-fatal for each operation:
   - **Fatal**: Chart updates (metadata, application files)
   - **Non-Fatal**: Chart discovery, linting, validation failures
4. Delete `/utils/errors/Chart.js`
5. Remove ChartError from `/utils/errors/index.js`

### 2. File Service (`/services/File.js`)

**Current Status:** ✅ **COMPLETED - UNIFIED EXECUTE PATTERN**
- Removed FileError import
- Updated execute() method to standard pattern with fatal parameter
- Converted all methods to use unified execute() pattern
- Classified operations as fatal/non-fatal:
  - **Fatal**: copy(), read(), readYaml(), write(), writeYaml() (critical file operations)
  - **Non-Fatal**: createDir(), delete(), find(), getStats(), listDir() (cleanup/exploratory)
- FileError class deleted and removed from exports
- Zero references to FileError remain in codebase

### 3. Git Service (`/services/Git.js`)

**Current Status:** ✅ **COMPLETED - UNIFIED EXECUTE PATTERN**
- Removed GitError import
- Updated execute() method to standard pattern with operation and fatal parameters
- Converted all methods to use unified execute() pattern with descriptive operations
- Classified operations as fatal/non-fatal:
  - **Fatal**: add(), commit(), configure(), fetch(), getCurrentBranch(), getRevision(), getStagedChanges(), pull(), push(), signedCommit(), switch() (critical git operations)
  - **Non-Fatal**: getChanges(), getStatus() (informational operations)
- Enhanced operation descriptions with quotes and context
- Direct Shell service calls within execute() wrappers
- GitError class deleted and removed from exports
- Zero references to GitError remain in codebase

### 4. GitHub API Services (`/services/github/`)

**Current Status:** ✅ **COMPLETED - UNIFIED EXECUTE PATTERN**
- Removed GitHubApiError import (no error class imports found)
- Updated execute() method to standard pattern with operation and fatal parameters
- Converted all methods to use unified execute() pattern with descriptive operations
- Classified operations as fatal/non-fatal:
  - **Fatal**: createRelease(), uploadReleaseAsset(), getWorkflowRun(), createSignedCommit() (critical API operations)
  - **Non-Fatal**: getLabel(), getReleaseByTag(), getReleaseIssues(), getReleases(), getRepositoryType(), deleteOciPackage() (404 handling and optional operations)
- Enhanced operation descriptions with context
- Direct GitHub API calls within execute() wrappers
- GitHubApiError class never existed or already deleted
- Zero references to GitHubApiError remain in codebase

### 5. Helm Service (`/services/helm/`)

**Current Status:** ✅ **COMPLETED - UNIFIED EXECUTE PATTERN**
- Removed HelmError import (no error class imports found)
- Updated execute() method to standard pattern with operation and fatal parameters
- Converted all methods to use unified execute() pattern with descriptive operations
- Classified operations as fatal/non-fatal:
  - **Fatal**: package() when output needed (returns package path)
  - **Non-Fatal**: generateIndex(), updateDependencies() (file operations with graceful degradation)
- Enhanced operation descriptions with quotes and context
- Direct Shell service calls within execute() wrappers
- HelmError class never existed or already deleted
- Zero references to HelmError remain in codebase

### 6. Issue Service (`/services/Issue.js`)

**Current Status:** ✅ **COMPLETED - UNIFIED EXECUTE PATTERN**
- Removed IssueError import
- Updated execute() method to standard pattern with operation and fatal parameters
- Converted all methods to use unified execute() pattern with descriptive operations
- Classified operations as fatal/non-fatal:
  - **Non-Fatal**: create(), report() (issue operations are supplementary, shouldn't break workflows)
- Enhanced operation descriptions with issue titles and context
- Direct GitHub REST API calls within execute() wrappers
- IssueError class deleted and removed from exports
- Zero references to IssueError remain in codebase

### 7. Label Service (`/services/Label.js`)

**Current Status:** ✅ **COMPLETED - PERFECT TEMPLATE**
- Unified execute() pattern implemented
- LabelError removed and deleted
- All operations use fatal = false (non-fatal)

### 8. Shell Service (`/services/Shell.js`)

**Current Status:** Uses ShellError
**Update Required:** Replace with execute pattern

**Implementation Steps:**
1. Remove `const { ShellError } = require('../utils/errors');`
2. Update execute method to standard pattern
3. Determine fatal/non-fatal for each operation:
   - **Fatal**: Required commands (helm, git)
   - **Non-Fatal**: Cleanup commands, optional validation
4. Delete `/utils/errors/Shell.js`
5. Remove ShellError from `/utils/errors/index.js`

### 9. Template Service (`/services/Template.js`)

**Current Status:** Uses TemplateError
**Update Required:** Replace with execute pattern

**Implementation Steps:**
1. Remove `const { TemplateError } = require('../utils/errors');`
2. Update execute method to standard pattern
3. Determine fatal/non-fatal for each operation:
   - **Fatal**: Template compilation, rendering for required output
   - **Non-Fatal**: Helper registration, optional operations
4. Delete `/utils/errors/Template.js`
5. Remove TemplateError from `/utils/errors/index.js`

### 10. Release Services (`/services/release/`)

**Current Status:** Uses ReleaseError
**Update Required:** Replace with execute pattern

**Implementation Steps:**
1. Remove `const { ReleaseError } = require('../utils/errors');`
2. Update execute method to standard pattern
3. Determine fatal/non-fatal for each operation:
   - **Fatal**: Chart packaging, release creation, asset upload
   - **Non-Fatal**: Package discovery, optional cleanup
4. Delete `/utils/errors/Release.js`
5. Remove ReleaseError from `/utils/errors/index.js`

### 11. Frontpage Service (`/services/Frontpage.js`)

**Current Status:** Uses FrontpageError
**Update Required:** Replace with execute pattern

**Implementation Steps:**
1. Remove `const { FrontpageError } = require('../utils/errors');`
2. Update execute method to standard pattern
3. Determine fatal/non-fatal for each operation:
   - **Fatal**: Frontpage generation, theme setup
   - **Non-Fatal**: Optional chart processing
4. Delete `/utils/errors/Frontpage.js`
5. Remove FrontpageError from `/utils/errors/index.js`

## Implementation Plan

### Phase 1: Update Service Execute Methods
1. **Follow Label service template** for each service
2. **Remove typed error imports** from all services
3. **Update existing methods** to use execute() with appropriate fatal flag
4. **Test each service** individually after conversion

### Phase 2: Error Class Cleanup (Critical)
**For each service conversion, immediately clean up error files:**

1. **Delete error class file**: `/utils/errors/[ServiceName].js`
2. **Update error exports**: Remove from `/utils/errors/index.js`
3. **Verify no remaining references** to the error class

### Phase 3: Final Validation
1. **Test all workflows** (chart.yml, release.yml)
2. **Verify error behavior** (fatal vs non-fatal)
3. **Check GitHub annotations** are still created properly
4. **Validate logging output** maintains same quality
5. **Confirm `/utils/errors/` only contains**:
   - `ErrorHandler.js` ✅
   - `errorUtils.js` ✅
   - All typed error classes deleted ✅

## Execute Method Usage Examples

### Fatal Operations (Default)
```javascript
// File operations - critical for workflow
async readFile(path) {
  return this.execute('read file', async () => {
    const content = await fs.readFile(path, 'utf8');
    return content;
  }); // fatal = true (default)
}

// Git operations - must succeed
async commit(message) {
  return this.execute('create commit', async () => {
    await this.shellService.execute('git', ['commit', '-m', message]);
  }); // fatal = true (default)
}

// Release operations - core workflow
async createRelease(data) {
  return this.execute('create release', async () => {
    const release = await this.githubApi.createRelease(data);
    return release;
  }); // fatal = true (default)
}
```

### Non-Fatal Operations
```javascript
// Optional cleanup - don't break workflow
async cleanup() {
  return this.execute('cleanup temporary files', async () => {
    await this.deleteTemporaryFiles();
  }, false); // fatal = false
}

// Chart discovery - work with available charts
async discoverCharts() {
  return this.execute('discover charts', async () => {
    const charts = await this.findChartDirectories();
    return charts;
  }, false); // fatal = false
}

// Issue reporting - supplementary
async reportIssue(data) {
  return this.execute('report workflow issue', async () => {
    const issue = await this.githubApi.createIssue(data);
    return issue;
  }, false); // fatal = false
}
```

## Error Logging Behavior

### When execute() is called:
```javascript
return this.execute('add user label', async () => {
  // business logic that might throw
}, false);
```

### Success Case (No Logs from execute)
- Operation completes successfully
- Returns the actual result
- No error handling logs

### Error Case (Warning Log)
```
[Label] [WARNING] [2025-05-26T15:30:45.123Z] Failed to add user label: GitHub API rate limit exceeded
```

**Because:**
- `fatal = false` creates WARNING log (continues workflow)
- `fatal = true` would create ERROR log (stops workflow)
- Format: `Failed to {operation}: {error.message}`

## Benefits of Unified Approach

### Code Quality
- **Consistency**: Same error pattern everywhere
- **Simplicity**: No complex error class hierarchy
- **Maintainability**: Single place to modify error behavior
- **Clean Methods**: Pure business logic without error handling boilerplate
- **Follows Coding Guidelines**: No empty lines or comments in methods

### Functionality
- **Better Control**: Fatal/non-fatal configurable per operation
- **Centralized Logging**: All errors go through ErrorHandler
- **GitHub Integration**: Consistent annotations and workflow failures
- **Proper Error Context**: Operation names and details preserved

### Architecture
- **Reduced Complexity**: Remove 11 error classes + 11 files
- **Clear Patterns**: Every service method follows same structure
- **Easier Testing**: Mock execute() instead of multiple error types
- **Standard Interface**: Three parameters across all services
- **Zero Dead Code**: No unused error classes

## Success Criteria

1. **All services use unified execute() pattern** ✅ (Label complete)
2. **Zero typed error classes remain** (10 remaining)
3. **All workflows function identically**
4. **Error logging maintains same quality**
5. **GitHub annotations work correctly**
6. **Fatal/non-fatal behavior preserved per operation type**
7. **Code complexity significantly reduced**
8. **All error class files deleted**
9. **Clean `/utils/errors/index.js` with only ErrorHandler exports**

## Current Progress

**Services Converted: 7/11** ✅
- ✅ Label Service (template for others)
- ✅ Chart Service
- ✅ File Service
- ✅ Git Service
- ✅ GitHub API Services
- ✅ Helm Service
- ✅ Issue Service
- ❌ Shell Service
- ❌ Template Service
- ❌ Release Services
- ❌ Frontpage Service

**Error Classes Deleted: 7/11** ✅
- ✅ LabelError (file deleted, export removed)
- ✅ ChartError
- ✅ FileError (file deleted, export removed)
- ✅ GitError (file deleted, export removed)
- ✅ GitHubApiError (never existed or already deleted)
- ✅ HelmError (never existed or already deleted)
- ✅ IssueError (file deleted, export removed)
- ❌ ShellError
- ❌ TemplateError
- ❌ ReleaseError
- ❌ FrontpageError

This unified approach will dramatically simplify the codebase while maintaining superior error handling through the centralized ErrorHandler pattern. The Label service serves as the perfect template for all remaining service conversions.
