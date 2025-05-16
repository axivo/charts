# Migration Overview

## Goal
Migrate procedural JavaScript to object-oriented architecture for GitHub Actions.

## 🚫 MANDATORY CODING GUIDELINES

**THESE RULES ARE NON-NEGOTIABLE:**

1. **NO EMPTY LINES INSIDE METHODS OR FUNCTIONS** - Functions must be compact with no blank lines
2. **NO COMMENTS INSIDE METHODS OR FUNCTIONS** - Zero comments allowed inside function bodies
3. **JSDOC ONLY** - All documentation goes in JSDoc format above the function
4. **NO COMMENTS IN CODE** - No inline comments, no block comments, no explanatory comments
5. **METHODS IN ALPHABETICAL ORDER** - All class methods must be in alphabetical order
6. **FOLLOW EXISTING PATTERNS** - Copy the exact style from the current codebase

### EXAMPLE OF CORRECT CODE:

```javascript
/**
 * Configures Git repository with user identity
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.core - GitHub Actions Core API
 * @param {Object} params.exec - GitHub Actions exec helper
 * @returns {Promise<void>}
 */
async function configureGitRepository({ core, exec }) {
  try {
    const userEmail = config('repository').user.email;
    const userName = config('repository').user.name;
    await exec.exec('git', ['config', 'user.email', userEmail]);
    await exec.exec('git', ['config', 'user.name', userName]);
    core.info('Git repository configured successfully');
  } catch (error) {
    utils.handleError(error, core, 'set Git identity');
  }
}
```

### EXAMPLE OF INCORRECT CODE:

```javascript
// DO NOT DO THIS
async function configureGitRepository({ core, exec }) {
  try {
    // Get user configuration
    const userEmail = config('repository').user.email;
    const userName = config('repository').user.name;
    
    // Set git configuration
    await exec.exec('git', ['config', 'user.email', userEmail]);
    await exec.exec('git', ['config', 'user.name', userName]);
    
    // Log success
    core.info('Git repository configured successfully');
  } catch (error) {
    utils.handleError(error, core, 'set Git identity');
  }
}
```

⚠️ **FAILURE TO FOLLOW THESE GUIDELINES MEANS THE WORK IS INCORRECT**

## Structure
```
.github/
├── scripts/         # Current (will be replaced)
└── actions/         # New
    ├── core/        # Base classes (Action, Configuration, Logger)
    ├── services/    # External operations (Git, Helm, File)
    │   └── github/  # Split by API type (Rest, GraphQL)
    ├── handlers/    # Workflows (Chart, Release, Issue)
    └── utils/       # Helpers (Validators, ErrorHandler)
```

## Principles
- **No redundant suffixes**: Git.js not GitService.js
- **Small methods**: 5-20 lines each, single responsibility
- **CommonJS only**: No ES6 imports (GitHub Actions constraint)
- **Dependency injection**: Services get context via constructor
- **No example files**: Documentation in JSDoc only
- **No tests**: Workflows are tested in production with feature flags
- **No example implementations**: No demonstration code, only production code

## Error Handling Design Pattern

**THIS PATTERN IS MANDATORY FOR ALL SERVICE CLASSES:**

1. **Specialized Error Classes**: Each service must have its own error class that extends `AppError`
   - Create error class in `/utils/errors/{ServiceName}.js`
   - Export via `/utils/errors/index.js`

2. **Command Execution Pattern**: Service classes that execute commands MUST follow this pattern:
   - Create an `execute` method that wraps `this.executeCommand` and throws specialized errors
   - All other methods in the service MUST use this `execute` method, NOT `executeCommand` directly

3. **Error Propagation**: Methods should generally propagate errors and NOT handle them internally
   - Exceptions: methods like `configure()` that should handle their own errors

### Example Git.js Pattern:

```javascript
// In Git.js
async execute(args, options = {}) {
  try {
    return await this.executeCommand('git', args, options);
  } catch (error) {
    throw new GitError(`git ${args[0]}`, error);
  }
}

// Method using execute - do NOT call executeCommand directly
async add(files) {
  if (!files || !files.length) return '';
  return this.execute(['add', ...files]);
}
```

### Example Helm.js Pattern:

```javascript
// In Helm.js
async execute(args, options = {}) {
  try {
    return await this.executeCommand('helm', args, options);
  } catch (error) {
    throw new HelmError(`helm ${args[0]}`, error);
  }
}

// Method using execute - do NOT call executeCommand directly
async lint(chartDir, options = {}) {
  try {
    this.logger.info(`Linting chart: ${chartDir}`);
    await this.execute(['lint', chartDir, ...(options.strict ? ['--strict'] : [])]);
    this.logger.info(`Lint passed for ${chartDir}`);
    return true;
  } catch (error) {
    this.errorHandler.handle(error, {
      operation: `lint chart ${chartDir}`,
      fatal: false
    });
    return false;
  }
}
```

### Example File.js Pattern (for non-command services):

```javascript
// In File.js
async execute(operation, action, filePath) {
  try {
    return await action();
  } catch (error) {
    throw new FileError(operation, error, filePath);
  }
}

// Method using execute
async read(filePath, options = {}) {
  return this.execute('read file', async () => {
    if (!await this.exists(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }
    return await fs.readFile(filePath, options.encoding || 'utf8');
  }, filePath);
}
```

⚠️ **IMPORTANT**: Using `executeCommand` directly in service methods instead of through an `execute` method is considered an error. All command execution must be encapsulated by service-specific error handling.

## Additional Implementation Patterns

### Method Spacing and Organization

1. **Method Spacing**: All methods must be separated by exactly one blank line
   - No extra blank lines between methods
   - Ensure there's always one blank line between methods

2. **Methods in Alphabetical Order**: Methods must be in strict alphabetical order
   - The `execute` method is the only exception - it should appear in proper alphabetical position
   - Constructor should always be first
   - Method ordering is non-negotiable and enforced

### Method Implementation Patterns

1. **No Empty Lines Inside Methods**: Methods should have compact implementation without blank lines
   - All statements must be consecutive with no blank lines between them

2. **Method Return Values**: 
   - Methods should have consistent return types
   - Promise-returning methods should be explicitly async
   - Methods that can fail should return a boolean success indicator when appropriate

3. **Logging Pattern**:
   - Use `this.logger.info()` for informational messages
   - Log before and after significant operations
   - Keep log messages concise and consistent in format

### Error Handling Strategy

1. **Two-Tier Error Handling**:
   - Core operations throw domain-specific errors (via `execute`)
   - Public/convenience methods can catch errors and use `errorHandler.handle()` with `fatal: false`

2. **Operation Context**:
   - Always provide clear operation context in error handling
   - Include specific identifiers (file path, chart name, etc.) in error context

3. **Error Classification**:
   - Only mark errors as non-fatal (`fatal: false`) when the operation can safely continue
   - Use fatal errors by default for serious issues

### Example of Proper Method Organization:

```javascript
class ExampleService extends Action {
  /**
   * Creates a new ExampleService instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    // initialization
  }

  /**
   * Core operation A
   */
  async coreOperationA() {
    // implementation without blank lines
  }

  /**
   * Core operation B
   */
  async coreOperationB() {
    // implementation without blank lines
  }

  /**
   * Executes the primary service command
   */
  async execute() {
    // Error handling and command execution
  }

  /**
   * Helper method Z
   */
  helperMethodZ() {
    // implementation without blank lines
  }
}
```

⚠️ **IMPORTANT**: Following these patterns consistently is critical for maintainability. Deviation from these patterns will result in rejected code.

## Migration Phases

### Phase 1: Core Infrastructure

#### ✓ 1.1 Configuration System
- Created: `actions/core/Configuration.js`
- Replaced: `config()` function
- Features: dot notation access, validation
- Status: **Complete**

#### ✓ 1.2 Error Handler
- Created: `actions/utils/ErrorHandler.js`
- Created: `actions/utils/errors.js`
- Features: fatal/non-fatal, GitHub annotations, consistent logging
- Status: **Complete**

#### ✓ 1.3 Base Action Class
- Created: `actions/core/Action.js`
- Features: dependency injection, context management, lifecycle hooks
- Status: **Complete**

#### ✓ 1.4 Logger
- Created: `actions/core/Logger.js`
- Wrap: core.info, core.warning, core.error
- Features: structured logging, timing, log levels
- Status: **Complete**

### Phase 2: Services

#### ✓ 2.1 Git Service
- Created: `actions/services/Git.js`
- Created: `actions/utils/errors/Git.js`
- Migrated: `configureGitRepository()`, `getGitStagedChanges()`
- Methods: add, commit, configure, execute, fetch, getStatus, etc.
- Status: **Complete**

#### ✓ 2.2 File Service
- Created: `actions/services/File.js`
- Created: `actions/utils/errors/File.js`
- Migrated: `fileExists()`, direct fs calls
- Methods: execute, copy, createDir, delete, exists, read, write, etc.
- Status: **Complete**

#### 2.3 GitHub Services
- Create: `actions/services/github/Rest.js`
  - Migrate: createRelease, uploadReleaseAsset, checkWorkflowRunStatus
- Create: `actions/services/github/GraphQL.js`
  - Migrate: getReleases, getIssuesSince, createSignedCommit
  - Extract: paginateQuery helper, common patterns

#### ✓ 2.4 Helm Service
- Created: `actions/services/Helm.js`
- Created: `actions/utils/errors/Helm.js`
- Methods: execute, generateIndex, lint, package, updateDependencies
- Status: **Complete**

#### 2.5 Template Service
- Create: `actions/services/Template.js`
- Migrate: `registerHandlebarsHelpers()`
- Methods: registerHelpers, render, compile

### Phase 3: Handlers

#### 3.1 Chart Handler
- Create: `actions/handlers/Chart.js`
- Migrate: `updateCharts()` and all _update* functions
- Decompose: process, updateApplicationCharts, updateLibraryCharts, validateCharts

#### 3.2 Release Handler
- Create: `actions/handlers/Release.js`
- Migrate: `processReleases()` and all _generate*, _publish* functions
- Decompose: process, buildReleases, publishToGitHub, publishToOCI

#### 3.3 Local Release Handler
- Create: `actions/handlers/LocalRelease.js`
- Migrate: `processLocalReleases()` and all validation functions
- Decompose: process, validateEnvironment, packageCharts

#### 3.4 Documentation Handler
- Create: `actions/handlers/Documentation.js`
- Migrate: `installHelmDocs()`, `updateDocumentation()`
- Decompose: process, installTools, generateDocs

#### 3.5 Issue Handler
- Create: `actions/handlers/Issue.js`
- Migrate: `addLabel()`, `updateIssueLabels()`, `reportWorkflowIssue()`
- Decompose: process, addLabels, createIssue

### Phase 4: Testing & Deployment

#### 4.1 Backward Compatibility
- Add adapters in original files
- Maintain same function signatures
- Route to new classes

#### 4.2 Workflow Testing
- Create test workflows
- Compare old vs new outputs
- Validate error handling

#### 4.3 Feature Flag Rollout
- Add environment toggle
- Test in development first
- Gradual production rollout

#### 4.4 Performance Validation
- Monitor execution times
- Check memory usage
- Optimize bottlenecks

### Phase 5: Cleanup

#### 5.1 Remove Legacy Code
- Delete old functions
- Remove adapters
- Clean dependencies

#### 5.2 Documentation
- Update README
- Create architecture docs
- Document patterns

## Critical Constraints
- Must work with `actions/github-script@v7`
- No build step - runs directly in GitHub Actions
- Packages installed via workflow: js-yaml, handlebars, sharp

## Code Example
```javascript
// Old
async function processLocalReleases({ core, exec }) {
  // 100+ lines of mixed concerns
}

// New
class LocalRelease {
  async process() {
    if (this.shouldSkip()) return;
    const charts = await this.findCharts();
    await this.validateAndPackage(charts);
  }
  
  shouldSkip() { return this.config.isProduction(); }
  async findCharts() { /* 10 lines */ }
  async validateAndPackage() { /* 15 lines */ }
}
```

## Function Index

### Configuration
- [x] config() → [01-config-function.md]

### Utilities (11 functions)
- [x] handleError() → [02-handle-error.md]
- [x] configureGitRepository() → [03-configure-git-repository.md]
- [x] fileExists() → [04-file-exists.md]
- [x] findCharts() → [05-find-charts.md]
- [x] getGitStagedChanges() → [06-get-git-staged-changes.md]
- [x] addLabel() → [07-add-label.md]
- [x] updateIssueLabels() → [08-update-issue-labels.md]
- [x] reportWorkflowIssue() → [09-report-workflow-issue.md]
- [x] deleteOciPackage() → [10-delete-oci-package.md]
- [x] registerHandlebarsHelpers() → [11-register-handlebars-helpers.md]

### GitHub API (9 functions)
- [x] createRelease() → [12-create-release.md]
- [x] createSignedCommit() → [13-create-signed-commit.md]
- [x] getReleaseByTag() → [14-get-release-by-tag.md]
- [x] getReleases() → [15-get-releases.md]
- [x] checkWorkflowRunStatus() → [16-check-workflow-run-status.md]
- [x] getUpdatedFiles() → [17-get-updated-files.md]
- [x] getReleaseIssues() → [18-get-release-issues.md]
- [x] uploadReleaseAsset() → [19-upload-release-asset.md]
- [x] deleteReleases() → [21-delete-releases.md]

### Documentation (2 functions)
- [x] installHelmDocs() → [22-install-helm-docs.md]
- [x] updateDocumentation() → [23-update-documentation.md]

### Chart Management (6 functions)
- [x] updateCharts() → [24-update-charts.md]
- [x] _performGitCommit() → [25-perform-git-commit.md]
- [x] _updateAppFiles() → [26-update-app-files.md]
- [x] _updateLockFiles() → [27-update-lock-files.md]
- [x] _updateMetadataFiles() → [28-update-metadata-files.md]
- [x] _lintCharts() → [29-lint-charts.md]

### Release Process (8 functions)
- [x] processReleases() → [30-process-releases.md]
- [x] setupBuildEnvironment() → [31-setup-build-environment.md]
- [x] _buildChartRelease() → [32-build-chart-release.md]
- [x] _publishChartReleases() → [33-publish-chart-releases.md]
- [x] _generateChartsIndex() → [34-generate-charts-index.md]
- [x] _generateChartRelease() → [35-generate-chart-release.md]
- [x] _generateFrontpage() → [36-generate-frontpage.md]
- [x] _processOciReleases() → [37-process-oci-releases.md]

### Local Release (6 functions)
- [x] processLocalReleases() → [38-process-local-releases.md]
- [x] _checkDependencies() → [39-check-dependencies.md]
- [x] _generateLocalIndex() → [40-generate-local-index.md]
- [x] _packageChart() → [41-package-chart.md]
- [x] _validateChart() → [42-validate-chart.md]
- [x] _validateIcon() → [43-validate-icon.md]

**Total: 43/43 Complete**

⚠️ **Note**: Individual migration documents need revision - they don't show proper decomposition into small methods.

## Next Steps
1. Complete GitHub Services Implementation
   - Create GitHub Rest API service class
   - Create GitHub GraphQL service class
   - Ensure proper error handling pattern

2. Begin Handler Classes Implementation
   - Start with Chart Handler
   - Implement all handlers with consistent patterns
   - Apply error handling strategy across handlers

3. Testing
   - Test all implemented services in isolation
   - Validate error handling scenarios
   - Ensure backward compatibility
