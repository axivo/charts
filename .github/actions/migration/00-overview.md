# Migration Overview

## Goal
Migrate procedural JavaScript to object-oriented architecture for GitHub Actions.

## 🚫 MANDATORY CODING GUIDELINES

**THESE RULES ARE NON-NEGOTIABLE:**

1. **NO EMPTY LINES INSIDE FUNCTIONS** - Functions must be compact with no blank lines
2. **NO COMMENTS INSIDE FUNCTIONS** - Zero comments allowed inside function bodies
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

#### 1.4 Logger
- Create: `actions/core/Logger.js`
- Wrap: core.info, core.warning, core.error
- Features: structured logging, timing, log levels

### Phase 2: Services

#### 2.1 Git Service
- Create: `actions/services/Git.js`
- Migrate: `configureGitRepository()`, `getGitStagedChanges()`
- Methods: configure, commit, push, getStatus, getChangedFiles

#### 2.2 File Service
- Create: `actions/services/File.js`
- Migrate: `fileExists()`, direct fs calls
- Methods: exists, read, write, mkdir, copy, delete, findFiles

#### 2.3 GitHub Services
- Create: `actions/services/github/Rest.js`
  - Migrate: createRelease, uploadReleaseAsset, checkWorkflowRunStatus
- Create: `actions/services/github/GraphQL.js`
  - Migrate: getReleases, getIssuesSince, createSignedCommit
  - Extract: paginateQuery helper, common patterns

#### 2.4 Helm Service
- Create: `actions/services/Helm.js`
- Methods: lint, package, updateDependencies, generateIndex

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
1. Start with Phase 1.1: Configuration System
2. Look at existing config.js
3. Create Configuration class with get() method
4. Test in actual workflow
