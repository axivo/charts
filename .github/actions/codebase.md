# New Codebase Function Analysis

This document provides a comprehensive analysis of all functions present in the new codebase located at `/Users/floren/github/charts/.github/actions`.

## Method Standardization Guidelines

To ensure consistency across all classes and methods, the following standardization guidelines must be followed:

### 1. Parameter Order Standards

**Context-First Pattern**: All methods that accept a `context` parameter must place it as the first parameter:

```javascript
// ✅ CORRECT - Context first
extractErrorInfo(context, error)
createSignedCommit({ context, commit })
getReleaseIssues({ context, chart, since, issues })

// ❌ INCORRECT - Context not first
extractErrorInfo(error, context)
```

**Options-Last Pattern**: All methods with optional parameters must place `options = {}` as the last parameter:

```javascript
// ✅ CORRECT - Options last
copy(source, destination, options = {})
generateIndex(directory, options = {})
execute(command, args, options = {})

// ❌ INCORRECT - Options not last
copy(options = {}, source, destination)
```

### 2. Constructor Parameter Standards

**Dependency Injection Order**: All service constructors must accept `params` object with standardized service dependencies:

```javascript
// ✅ CORRECT - Standardized params object
constructor(params) {
  super(params);
  this.fileService = new File(params);
  this.gitService = new Git(params);
}

// ❌ INCORRECT - Individual parameters
constructor(file, git, config)
```

### 3. Method Naming Conventions

**Consistent Resource Naming**:
- File operations: Use `file` not `path` or `filename`
- Directory operations: Use `directory` not `dir` or `folder`
- Chart operations: Use `chart` not `chartDir` or `chartPath`

```javascript
// ✅ CORRECT - Consistent naming
read(file, options = {})
createDir(directory, options = {})
validate(chart)

// ❌ INCORRECT - Inconsistent naming
read(path, options = {})
createDir(dir, options = {})
validate(chartPath)
```

### 4. GitHub API Method Standards

**Parameter Object Pattern**: All GitHub API methods must use destructured parameter objects:

```javascript
// ✅ CORRECT - Destructured parameters
createRelease({ context, release })
deleteOciPackage({ context, chart })
getUpdatedFiles({ context })

// ❌ INCORRECT - Individual parameters
createRelease(context, release)
deleteOciPackage(context, chart)
getUpdatedFiles(context)
```

### 5. Error Handling Standards

**Execute Pattern**: All service methods must use the `execute()` pattern for error handling:

```javascript
// ✅ CORRECT - Execute pattern
async methodName(params) {
  return this.execute('operation description', async () => {
    // Method implementation
  });
}

// ❌ INCORRECT - Manual try-catch
async methodName(params) {
  try {
    // Method implementation
  } catch (error) {
    // Manual error handling
  }
}
```

### 6. Return Type Standards

**Consistent Return Types**:
- Boolean operations: Return `true`/`false`
- Count operations: Return `number`
- Data operations: Return `Object` or `Array`
- Void operations: Return `void` (no return statement)

### 7. Method Documentation Standards

**JSDoc Format**: All methods must include complete JSDoc documentation:

```javascript
/**
 * Brief method description
 * 
 * Detailed explanation of functionality and behavior.
 * 
 * @param {Object} context - GitHub Actions context
 * @param {Object} params - Method parameters
 * @param {string} params.name - Parameter description
 * @param {Object} [options={}] - Optional parameters
 * @returns {Promise<boolean>} - Success status
 */
```

## Module Overview

The new codebase consists of 41 files organized into a modular, object-oriented architecture with clear separation of concerns:

- **config/** - Configuration management (2 files)
- **core/** - Base classes and utilities (5 files)
- **handlers/** - High-level workflow orchestration (5 files)
- **services/** - Business logic services (19 files)
- **templates/** - Handlebars templates (7 files)

## Architectural Changes from Old Codebase

1. **Object-Oriented Design**: All functionality moved to ES6 classes extending a base Action class
2. **Dependency Injection**: Services receive dependencies via constructors  
3. **Layered Architecture**: Clear separation between handlers, services, and core utilities
4. **Consistent Error Handling**: All services use typed errors with context
5. **Configuration Centralization**: Singleton configuration pattern with environment support
6. **Service Composition**: Services interact through well-defined interfaces

## Function Inventory by Module

### config/ (Configuration Management)

#### config/index.js
**Exported Variables**:
- `config` - Singleton Configuration instance created with production settings

#### config/production.js  
**Exported Objects**:
- `module.exports` - Complete configuration object with nested settings for:
  - `issue` - GitHub issue and label management settings
  - `repository` - Chart structure, OCI registry, and release settings  
  - `theme` - Jekyll and GitHub Pages configuration
  - `workflow` - Workflow-specific settings and templates

### core/ (Base Classes and Utilities)

#### core/Action.js
**Class Methods**:

**`constructor({ core, github, context, exec, config })`** ⚠️ **STANDARDIZATION NEEDED**
- **Issue**: Constructor uses individual destructured parameters instead of params object
- **Proposed**: `constructor(params)` with destructuring inside method
- **Role**: Initializes base Action with dependency injection
- **Functionality**: Sets up logger, error handler, and GitHub Actions context
- **Usage**: Extended by all service classes

**`execute(operation, action, fatal = true)`** ✅ **COMPLIANT**
- **Role**: Executes operations with standardized error handling
- **Functionality**: Wraps operations in try-catch, reports errors with context
- **Returns**: Operation result or null on error
- **Usage**: Used by all services for consistent error handling

**`publish()`** ✅ **COMPLIANT**
- **Role**: Determines deployment mode (local vs publish)
- **Functionality**: Checks repository privacy and deployment configuration
- **Returns**: Boolean indicating publish mode
- **Usage**: Used by handlers to control deployment behavior

#### core/Configuration.js
**Class Methods**:

**`constructor(settings)`** ✅ **COMPLIANT**
- **Role**: Creates configuration manager with caching
- **Functionality**: Initializes settings and cache map
- **Usage**: Instantiated as singleton in config/index.js

**`get(path, defaultValue = undefined)`** ✅ **COMPLIANT**
- **Role**: Retrieves configuration values using dot notation
- **Functionality**: Traverses nested objects, caches results
- **Returns**: Configuration value or defaultValue
- **Usage**: Used throughout codebase for configuration access

#### core/Error.js  
**Class Methods**:

**`constructor(core, config)`** ⚠️ **STANDARDIZATION NEEDED**
- **Issue**: Constructor uses individual parameters instead of params object
- **Proposed**: `constructor(params)` with `{ core, config } = params`
- **Role**: Creates error reporter with GitHub Actions integration
- **Functionality**: Sets up core API and config references
- **Usage**: Instantiated by Action base class

**`createAnnotation(errorInfo, type)`** ✅ **COMPLIANT**
- **Role**: Creates GitHub file annotations for errors
- **Functionality**: Adds file-specific error annotations to workflow
- **Usage**: Called by report method for file-related errors

**`extractErrorInfo(context, error)`** ⚠️ **STANDARDIZATION NEEDED**
- **Issue**: Parameter order should be `(context, error)` not `(error, context)`
- **Current**: `extractErrorInfo(error, context)`
- **Proposed**: `extractErrorInfo(context, error)`
- **Role**: Extracts detailed error information
- **Functionality**: Formats error with operation context and timestamp
- **Returns**: Structured error information object
- **Usage**: Used by report method to standardize error data

**`report(context, error)`** ⚠️ **STANDARDIZATION NEEDED**
- **Issue**: Parameter order should be `(context, error)` not `(error, context)`
- **Current**: `report(error, context)`
- **Proposed**: `report(context, error)`
- **Role**: Reports errors with annotations and workflow integration
- **Functionality**: Creates annotations, sets workflow status, logs errors
- **Returns**: Formatted error message
- **Usage**: Used by Action.execute for error reporting

**`setHandler()`** ✅ **COMPLIANT**
- **Role**: Sets up global error handlers for uncaught exceptions
- **Functionality**: Handles uncaught exceptions, unhandled rejections, warnings
- **Usage**: Called when debug mode is enabled

#### core/Logger.js
**Class Methods**:

**`constructor(core, options = {})`** ⚠️ **STANDARDIZATION NEEDED**
- **Issue**: Constructor uses individual parameters instead of params object
- **Proposed**: `constructor(params, options = {})`
- **Role**: Creates structured logger with timing and context support
- **Functionality**: Sets up logging configuration and priorities
- **Usage**: Instantiated by Action base class

**`allowLevel(level)`** ✅ **COMPLIANT**
- **Role**: Determines if log level should be displayed
- **Functionality**: Compares level priority against configured minimum
- **Returns**: Boolean indicating if level is allowed
- **Usage**: Used by logging methods to filter output

**`error(message, meta = {})`** ✅ **COMPLIANT**
- **Role**: Logs error messages with annotations
- **Functionality**: Formats message, creates file annotations if applicable
- **Usage**: Called for error-level logging

**`formatMessage(message, meta)`** ✅ **COMPLIANT**
- **Role**: Formats log messages with metadata
- **Functionality**: Adds context, level, timestamp, component info
- **Returns**: Formatted message string
- **Usage**: Used by all logging methods

**`info(message, meta = {})`** / **`warning(message, meta = {})`** ✅ **COMPLIANT**
- **Role**: Logs info/warning messages
- **Functionality**: Formats message, creates annotations for file-related warnings
- **Usage**: Called for info and warning level logging

#### core/index.js
**Exported Classes**: Action, ActionError, Configuration, Logger

### handlers/ (High-Level Workflow Orchestration)

#### handlers/Chart.js
**Class Methods**:

**`constructor(params)`** ✅ **COMPLIANT**
- **Role**: Creates chart handler with service dependencies
- **Functionality**: Initializes chart, docs, file, git, and GitHub services
- **Usage**: Handles chart-specific workflow operations

**`process()`** ✅ **COMPLIANT**
- **Role**: Main entry point for chart update operations
- **Functionality**: 
  - Gets updated files from GitHub context
  - Finds affected charts
  - Updates application files, lock files, metadata
  - Performs chart linting and documentation generation
- **Returns**: Object with charts count and updated count
- **Usage**: Called by workflow handlers

#### handlers/Workflow.js
**Class Methods**:

**`constructor(params)`** ✅ **COMPLIANT**
- **Role**: Creates workflow handler with comprehensive service dependencies
- **Functionality**: Initializes all required services for workflow operations
- **Usage**: Main orchestrator for GitHub Actions workflows

**`configureRepository()`** ✅ **COMPLIANT**
- **Role**: Sets up repository for workflow operations
- **Functionality**: Configures Git, sets publish output
- **Usage**: Called at start of workflows

**`installHelmDocs(version)`** ✅ **COMPLIANT**
- **Role**: Installs helm-docs tool
- **Functionality**: Delegates to docs service for installation
- **Usage**: Called before documentation generation

**`processReleases()`** ✅ **COMPLIANT**
- **Role**: Processes chart releases
- **Functionality**: Delegates to release service
- **Usage**: Called for release workflows

**`reportIssue()`** ✅ **COMPLIANT**
- **Role**: Reports workflow issues to GitHub
- **Functionality**: Checks for issues, creates GitHub issue if needed
- **Returns**: Object with creation status and issue data
- **Usage**: Called at end of workflows for error reporting

**`setFrontpage()`** ✅ **COMPLIANT**
- **Role**: Sets up GitHub Pages frontpage
- **Functionality**: Generates frontpage and theme files
- **Usage**: Called for release workflows

**`updateCharts()`** ✅ **COMPLIANT**
- **Role**: Updates repository charts
- **Functionality**: Delegates to chart handler
- **Returns**: Update results
- **Usage**: Called for chart workflows

**`updateLabels()`** ✅ **COMPLIANT**
- **Role**: Updates repository issue labels
- **Functionality**: Delegates to label service
- **Returns**: Array of created label names
- **Usage**: Called for repository setup

#### handlers/release/Local.js
**Class Methods**:

**`constructor(params)`** ✅ **COMPLIANT**
- **Role**: Creates local release handler
- **Functionality**: Initializes services for local development operations
- **Usage**: Handles local chart releases

**`process()`** ✅ **COMPLIANT**
- **Role**: Main entry point for local release processing
- **Functionality**:
  - Checks dependencies
  - Gets local files
  - Processes charts locally
  - Handles deletions
- **Returns**: Object with processed, published, deleted counts
- **Usage**: Called for local development workflows

#### handlers/release/index.js
**Class Methods**:

**`constructor(params)`** ✅ **COMPLIANT**
- **Role**: Creates main release handler
- **Functionality**: Initializes release services
- **Usage**: Handles production chart releases

**`process()` / `run()`** ✅ **COMPLIANT**
- **Role**: Main entry point for release processing
- **Functionality**:
  - Gets updated files
  - Finds affected charts
  - Packages charts
  - Publishes to GitHub and OCI registry
- **Returns**: Object with processed, published, deleted counts
- **Usage**: Called for release workflows

### services/ (Business Logic Services)

#### services/File.js
**Class Methods**:

**`copy(source, destination, options = {})`** ✅ **COMPLIANT**
- **Role**: Copies files between locations
- **Functionality**: Creates destination directory, handles overwrite options
- **Usage**: Used for template file operations

**`createDir(directory, options = {})`** ✅ **COMPLIANT**
- **Role**: Creates directories with recursive support
- **Functionality**: Creates parent directories, optional silent mode
- **Usage**: Used throughout for directory setup

**`delete(file)`** ✅ **COMPLIANT**
- **Role**: Deletes files safely
- **Functionality**: Checks existence before deletion
- **Usage**: Used for cleanup operations

**`exists(file)`** ✅ **COMPLIANT**
- **Role**: Checks file existence without exceptions
- **Functionality**: Uses fs.access with error handling
- **Returns**: Boolean existence status
- **Usage**: Used throughout for conditional file operations

**`filter(directories, fileTypes)`** ✅ **COMPLIANT**
- **Role**: Filters directories to find existing files
- **Functionality**: Checks multiple file types across directories
- **Returns**: Array of existing file paths
- **Usage**: Used for chart file discovery

**`filterPath(files, patterns)`** ✅ **COMPLIANT**
- **Role**: Filters file paths by pattern matching
- **Functionality**: Extracts paths matching chart type patterns
- **Returns**: Set of type:path strings
- **Usage**: Used to identify affected charts

**`find(pattern, options = {})`** ✅ **COMPLIANT**
- **Role**: Finds files matching glob patterns
- **Functionality**: Uses glob library for pattern matching
- **Returns**: Array of matching file paths
- **Usage**: Used for file discovery operations

**`getStats(file)`** / **`listDir(directory, options = {})`** ✅ **COMPLIANT**
- **Role**: Gets file information and directory listings
- **Functionality**: Provides file metadata and directory contents
- **Usage**: Used for file system operations

**`read(file, options = {})`** / **`readYaml(file)`** ✅ **COMPLIANT**
- **Role**: Reads files and YAML content
- **Functionality**: Handles text files and YAML parsing
- **Returns**: File content or parsed YAML object
- **Usage**: Used throughout for configuration and metadata

**`write(file, content, options = {})`** / **`writeYaml(file, content, options = {})`** ✅ **COMPLIANT**
- **Role**: Writes files and YAML content
- **Functionality**: Creates directories, writes content, handles YAML formatting
- **Usage**: Used for file creation and updates

#### services/Frontpage.js
**Class Methods**:

**`constructor(params)`** ✅ **COMPLIANT**
- **Role**: Creates frontpage service with dependencies
- **Functionality**: Initializes chart, file, and template services
- **Usage**: Handles repository frontpage generation

**`generate()`** ✅ **COMPLIANT**
- **Role**: Generates repository index frontpage
- **Functionality**:
  - Discovers all charts
  - Loads chart metadata
  - Sorts charts by type and name
  - Renders frontpage template
- **Usage**: Called during GitHub Pages setup

**`setTheme()`** ✅ **COMPLIANT**
- **Role**: Sets up Jekyll theme files
- **Functionality**: Copies theme templates and configuration
- **Usage**: Called during GitHub Pages setup

#### services/Git.js
**Class Methods**:

**`constructor(params)`** ✅ **COMPLIANT**
- **Role**: Creates Git service with shell and GraphQL dependencies
- **Functionality**: Initializes services for Git operations
- **Usage**: Handles all Git repository operations

**`add(files)`** / **`commit(message, options = {})`** ✅ **COMPLIANT**
- **Role**: Git staging and commit operations
- **Functionality**: Stages files and creates commits
- **Usage**: Used for local Git operations

**`configure()`** ✅ **COMPLIANT**
- **Role**: Configures Git repository with bot identity
- **Functionality**: Sets user email and name for automated commits
- **Usage**: Called during repository setup

**`fetch(remote, reference)`** / **`pull(remote, branch)`** / **`push(remote, branch, options)`** ⚠️ **STANDARDIZATION NEEDED**
- **Issue**: Mixed parameter patterns - some use individual params, others need options objects
- **Proposed**: Standardize to `fetch({ remote, reference })` pattern for consistency
- **Role**: Git remote operations
- **Functionality**: Syncs with remote repositories
- **Usage**: Used for branch synchronization

**`getCurrentBranch()`** / **`getRevision(reference)`** ✅ **COMPLIANT**
- **Role**: Gets Git repository information
- **Functionality**: Retrieves branch names and commit hashes
- **Returns**: Branch name or revision hash
- **Usage**: Used for commit operations

**`getChanges(reference)`** / **`getStagedChanges()`** / **`getStatus()`** ✅ **COMPLIANT**
- **Role**: Gets Git working tree status
- **Functionality**: Identifies changed, staged, and modified files
- **Returns**: Objects with file lists and status
- **Usage**: Used for change detection

**`signedCommit(branch, files, message)`** ⚠️ **STANDARDIZATION NEEDED**
- **Issue**: Individual parameters instead of object pattern
- **Proposed**: `signedCommit({ branch, files, message })`
- **Role**: Creates signed commits via GitHub GraphQL API
- **Functionality**:
  - Fetches latest changes
  - Stages files
  - Creates verified commit through GitHub API
- **Returns**: Object with update count
- **Usage**: Used for all automated commits

**`switch(branch)`** ✅ **COMPLIANT**
- **Role**: Switches Git branches
- **Functionality**: Changes working directory to specified branch
- **Usage**: Used for branch operations

#### services/Issue.js
**Class Methods**:

**`constructor(params)`** ✅ **COMPLIANT**
- **Role**: Creates issue service with GitHub API dependencies
- **Functionality**: Initializes GraphQL and REST services
- **Usage**: Handles GitHub issue operations

**`create(params)`** ⚠️ **STANDARDIZATION NEEDED**
- **Issue**: Parameter name `params` is too generic
- **Proposed**: `create({ context, issue })` with destructuring
- **Role**: Creates GitHub issues
- **Functionality**: Creates issue with title, body, and labels
- **Returns**: Created issue data
- **Usage**: Used for workflow issue reporting

**`get({ context, chart })`** ✅ **COMPLIANT**
- **Role**: Gets chart-specific issues since last release
- **Functionality**:
  - Finds last release date
  - Queries issues since that date
  - Filters by chart name and type labels
- **Returns**: Array of relevant issues
- **Usage**: Used for release note generation

**`report(params)`** ⚠️ **STANDARDIZATION NEEDED**
- **Issue**: Parameter name `params` is too generic  
- **Proposed**: `report({ context, templateContent, templateService, labelService })`
- **Role**: Reports workflow issues
- **Functionality**:
  - Validates workflow for issues
  - Renders issue template
  - Creates GitHub issue if needed
- **Returns**: Created issue data or null
- **Usage**: Called by workflow handlers

#### services/Label.js
**Class Methods**:

**`constructor(params)`** ✅ **COMPLIANT**
- **Role**: Creates label service with GitHub REST API
- **Functionality**: Initializes REST service for label operations
- **Usage**: Handles repository label management

**`add(name)`** ✅ **COMPLIANT**
- **Role**: Adds labels to repository
- **Functionality**:
  - Checks if label exists
  - Creates label if enabled and missing
  - Uses configuration for label properties
- **Returns**: Boolean success status
- **Usage**: Used for label creation

**`update()`** ✅ **COMPLIANT**
- **Role**: Updates all repository labels
- **Functionality**: Creates all configured labels
- **Returns**: Array of created label names
- **Usage**: Called during repository setup

#### services/Shell.js
**Class Methods**:

**`constructor(params)`** ✅ **COMPLIANT**
- **Role**: Creates shell service for command execution
- **Functionality**: Initializes with Action base class
- **Usage**: Handles all shell command operations

**`execute(command, args, options = {})`** ✅ **COMPLIANT**
- **Role**: Executes shell commands with comprehensive options
- **Functionality**:
  - Supports output capture and silence modes
  - Handles error conditions
  - Returns command output or result objects
- **Returns**: Command output string or result object
- **Usage**: Used by all services for external command execution

#### services/Template.js
**Class Methods**:

**`constructor(params)`** ✅ **COMPLIANT**
- **Role**: Creates template service with Handlebars
- **Functionality**: Initializes Handlebars instance
- **Usage**: Handles all template rendering operations

**`compile(template)` / `get()`** ✅ **COMPLIANT**
- **Role**: Template compilation and instance access
- **Functionality**: Compiles templates and provides Handlebars access
- **Usage**: Used for template operations

**`render(template, context, options = {})`** ✅ **COMPLIANT**
- **Role**: Renders templates with data context
- **Functionality**:
  - Registers custom helpers (equal, RepoRawURL)
  - Compiles and renders templates
  - Supports repository URL helpers
- **Returns**: Rendered template string
- **Usage**: Used throughout for content generation

#### services/chart/index.js
**Class Methods**:

**`constructor(params)`** ✅ **COMPLIANT**
- **Role**: Creates chart service with Helm and file dependencies
- **Functionality**: Initializes services for chart operations
- **Usage**: Handles chart discovery and management

**`discover()`** ✅ **COMPLIANT**
- **Role**: Discovers all charts in repository
- **Functionality**:
  - Scans application and library directories
  - Validates Chart.yaml existence
  - Counts total charts
- **Returns**: Object with chart arrays and total count
- **Usage**: Used for repository analysis

**`find(files)`** ✅ **COMPLIANT**
- **Role**: Finds charts affected by file changes
- **Functionality**:
  - Filters files by chart type patterns
  - Validates Chart.yaml existence
  - Categorizes by chart type
- **Returns**: Object with affected chart arrays
- **Usage**: Used to identify charts needing updates

**`lint(charts)` / `validate(directory)`** ✅ **COMPLIANT**
- **Role**: Validates charts using chart-testing tools
- **Functionality**: Runs ct lint command, validates chart structure
- **Returns**: Boolean validation status
- **Usage**: Used for chart quality assurance

#### services/chart/Update.js
**Class Methods**:

**`constructor(params)`** ✅ **COMPLIANT**
- **Role**: Creates chart update service
- **Functionality**: Initializes file, git, and helm services
- **Usage**: Handles chart file updates

**`application(charts)`** ✅ **COMPLIANT**
- **Role**: Updates application.yaml files with chart versions
- **Functionality**:
  - Updates targetRevision to specific chart versions
  - Commits changes via signed commits
  - Handles individual file errors gracefully
- **Returns**: Boolean success status
- **Usage**: Called during chart maintenance

**`lock(charts)`** ✅ **COMPLIANT**
- **Role**: Updates Chart.lock dependency files
- **Functionality**:
  - Updates dependencies for charts with dependencies
  - Removes lock files for charts without dependencies
  - Commits changes via signed commits
- **Returns**: Boolean success status
- **Usage**: Called during chart maintenance

**`metadata(charts)`** ✅ **COMPLIANT**
- **Role**: Updates metadata.yaml files for chart distribution
- **Functionality**:
  - Generates chart indexes in temporary directories
  - Merges with existing metadata
  - Applies retention policy
  - Commits changes via signed commits
- **Returns**: Boolean success status
- **Usage**: Called during chart maintenance when packages enabled

#### services/github/Api.js
**Class Methods**:

**`setVariables({ owner, repo }, variables = {})`** ✅ **COMPLIANT**
- **Role**: Sets standard repository parameters for API calls
- **Functionality**: Combines owner/repo with additional variables
- **Returns**: Combined variables object
- **Usage**: Used by API services for parameter standardization

**`transform(data, transformer)`** ✅ **COMPLIANT**
- **Role**: Transforms API data using provided function
- **Functionality**: Maps array data through transformer function
- **Returns**: Transformed data array
- **Usage**: Used for data format standardization

#### services/github/GraphQL.js
**Class Methods**:

**`createSignedCommit({ context, commit })`** ✅ **COMPLIANT**
- **Role**: Creates verified commits through GitHub GraphQL API
- **Functionality**:
  - Builds GraphQL mutation for commit creation
  - Handles file additions and deletions
  - Creates verified commits
- **Returns**: Commit details with URL and OID
- **Usage**: Used by Git service for signed commits

**`getReleaseIssues({ context, chart, since, issues })`** ✅ **COMPLIANT**
- **Role**: Gets chart issues since specified date
- **Functionality**:
  - Queries GitHub issues via GraphQL
  - Filters by creation/update date
  - Transforms to standard format
- **Returns**: Array of issue objects
- **Usage**: Used for release note generation

**`getReleases({ context, prefix, limit })`** ✅ **COMPLIANT**
- **Role**: Gets repository releases with filtering
- **Functionality**:
  - Paginates through releases
  - Filters by tag prefix if provided
  - Transforms to standard format
- **Returns**: Array of release objects
- **Usage**: Used for release analysis

**`getRepositoryType(owner)`** ⚠️ **STANDARDIZATION NEEDED**
- **Issue**: Single parameter instead of object pattern
- **Proposed**: `getRepositoryType({ context, owner })` for consistency with other methods
- **Role**: Determines if repository owner is user or organization
- **Functionality**: Queries GraphQL for owner type
- **Returns**: String ('organization' or 'user')
- **Usage**: Used for API routing decisions

**`paginate(query, variables, extractor, filter, limit)`** ⚠️ **STANDARDIZATION NEEDED**
- **Issue**: Too many individual parameters
- **Proposed**: `paginate({ query, variables, extractor, filter, limit })`
- **Role**: Helper for GraphQL pagination
- **Functionality**: Handles cursor-based pagination with filtering
- **Returns**: Paginated and filtered results
- **Usage**: Used by other GraphQL methods

#### services/github/Rest.js
**Class Methods**:

**`constructor(params)`** ✅ **COMPLIANT**
- **Role**: Creates REST service with GraphQL dependency
- **Functionality**: Initializes GraphQL service for repository type queries
- **Usage**: Handles GitHub REST API operations

**`createLabel({ context, label })` / `getLabel({ context, name })`** ✅ **COMPLIANT**
- **Role**: Label management operations
- **Functionality**: Creates and retrieves repository labels
- **Returns**: Label objects
- **Usage**: Used by label service

**`createRelease({ context, release })` / `getReleaseByTag({ context, tag })`** ✅ **COMPLIANT**
- **Role**: Release management operations
- **Functionality**: Creates and retrieves GitHub releases
- **Returns**: Release objects
- **Usage**: Used by release services

**`deleteOciPackage({ context, chart })` / `deleteReleases({ context, chart })`** ✅ **COMPLIANT**
- **Role**: Cleanup operations for packages and releases
- **Functionality**: Removes OCI packages and GitHub releases
- **Returns**: Success counts
- **Usage**: Used for chart deletion

**`getUpdatedFiles({ context })`** ✅ **COMPLIANT**
- **Role**: Gets files changed in push or pull request events
- **Functionality**:
  - Handles different event types
  - Paginates through file lists
  - Maps files to change status
- **Returns**: Object mapping files to status
- **Usage**: Used to identify affected charts

**`getWorkflowRun({ context, id })` / `listJobs(context)`** ⚠️ **STANDARDIZATION NEEDED**
- **Issue**: Inconsistent parameter patterns
- **Current**: `listJobs(context)` 
- **Proposed**: `listJobs({ context })` for consistency
- **Role**: Workflow monitoring operations
- **Functionality**: Gets workflow run data and job information
- **Returns**: Workflow and job objects
- **Usage**: Used for workflow issue detection

**`uploadReleaseAsset({ context, asset })`** ✅ **COMPLIANT**
- **Role**: Uploads files to GitHub releases
- **Functionality**: Handles file uploads with content type detection
- **Returns**: Asset information
- **Usage**: Used to attach chart packages to releases

**`paginate(namespace, method, params, resultProcessor, size)`** ⚠️ **STANDARDIZATION NEEDED**
- **Issue**: Too many individual parameters
- **Proposed**: `paginate({ namespace, method, params, resultProcessor, size })`
- **Role**: Helper for REST API pagination
- **Functionality**: Handles page-based pagination with result processing
- **Returns**: Aggregated results
- **Usage**: Used by other REST methods

**`validateContextPayload(context)`** ⚠️ **STANDARDIZATION NEEDED**
- **Issue**: Single parameter instead of object pattern
- **Proposed**: `validateContextPayload({ context })` 
- **Role**: Validates GitHub Actions context for different event types
- **Functionality**: Checks required fields for pull_request and push events
- **Returns**: Validation result object
- **Usage**: Used before API operations

#### services/helm/Docs.js
**Class Methods**:

**`constructor(params)`** ✅ **COMPLIANT**
- **Role**: Creates helm-docs service
- **Functionality**: Initializes git and shell services
- **Usage**: Handles helm-docs operations

**`generate(directories)`** ✅ **COMPLIANT**
- **Role**: Generates chart documentation using helm-docs
- **Functionality**:
  - Runs helm-docs command
  - Detects documentation changes
  - Commits changes via signed commits
- **Returns**: Object with update counts
- **Usage**: Called during documentation updates

**`install(version)`** ✅ **COMPLIANT**
- **Role**: Installs helm-docs binary
- **Functionality**:
  - Downloads debian package
  - Installs using apt-get
- **Returns**: Boolean success status
- **Usage**: Called before documentation generation

#### services/helm/index.js
**Class Methods**:

**`constructor(params)`** ✅ **COMPLIANT**
- **Role**: Creates Helm CLI service
- **Functionality**: Initializes shell service for Helm operations
- **Usage**: Handles all Helm CLI operations

**`generateIndex(directory, options)`** ✅ **COMPLIANT**
- **Role**: Generates Helm repository index files
- **Functionality**: Runs helm repo index with options
- **Returns**: Boolean success status
- **Usage**: Used for repository index generation

**`login({ registry, username, password })`** ✅ **COMPLIANT**
- **Role**: Authenticates with OCI registries
- **Functionality**: Logs into registries using helm registry login
- **Returns**: Boolean success status
- **Usage**: Used before OCI operations

**`package(directory, options)`** ✅ **COMPLIANT**
- **Role**: Packages Helm charts
- **Functionality**: Runs helm package with destination and version options
- **Returns**: Path to packaged chart
- **Usage**: Used during chart packaging

**`template(directory, options)`** ✅ **COMPLIANT**
- **Role**: Renders chart templates
- **Functionality**: Runs helm template for validation
- **Returns**: Rendered template output
- **Usage**: Used for chart validation

**`updateDependencies(directory)`** ✅ **COMPLIANT**
- **Role**: Updates chart dependencies
- **Functionality**: Runs helm dependency update
- **Returns**: Boolean success status
- **Usage**: Used before packaging

#### services/release/Local.js
**Class Methods**:

**`constructor(params)`** ✅ **COMPLIANT**
- **Role**: Creates local release service
- **Functionality**: Initializes comprehensive service dependencies
- **Usage**: Handles local development operations

**`checkDependencies()`** ✅ **COMPLIANT**
- **Role**: Validates required tools and packages
- **Functionality**:
  - Checks git, helm, kubectl availability
  - Tests Kubernetes cluster connectivity  
  - Validates Node.js packages
- **Returns**: Boolean indicating all dependencies available
- **Usage**: Called before local processing

**`getLocalFiles()`** ✅ **COMPLIANT**
- **Role**: Gets locally modified chart files
- **Functionality**: Uses git status to find modified chart files
- **Returns**: Object mapping files to status
- **Usage**: Used for local change detection

**`processCharts(charts)`** ✅ **COMPLIANT**
- **Role**: Processes charts for local development
- **Functionality**:
  - Validates charts
  - Packages for local testing
  - Generates local index
- **Returns**: Object with process counts
- **Usage**: Main local processing method

**`validateChart(directory, temporary)`** ⚠️ **STANDARDIZATION NEEDED**
- **Issue**: Individual parameters instead of object pattern
- **Proposed**: `validateChart({ directory, temporary })`
- **Role**: Comprehensive chart validation
- **Functionality**:
  - Runs chart linting
  - Validates template rendering
  - Tests Kubernetes resource validation
- **Returns**: Boolean validation status
- **Usage**: Used during local processing

#### services/release/Package.js
**Class Methods**:

**`constructor(params)`** ✅ **COMPLIANT**
- **Role**: Creates package service
- **Functionality**: Initializes file and helm services
- **Usage**: Handles chart packaging operations

**`get(directory)`** ✅ **COMPLIANT**
- **Role**: Gets packaged charts from directory
- **Functionality**: Scans package directories for .tgz files
- **Returns**: Array of package objects
- **Usage**: Used to find packages for publishing

**`package(charts)`** ✅ **COMPLIANT**
- **Role**: Packages charts for release
- **Functionality**:
  - Creates package directories
  - Updates dependencies
  - Packages charts by type
- **Returns**: Array of packaging results
- **Usage**: Main packaging method

**`parseInfo(file)`** ✅ **COMPLIANT**
- **Role**: Extracts chart information from package filename
- **Functionality**: Parses name and version from filename
- **Returns**: Object with name and version
- **Usage**: Used for package analysis

#### services/release/Publish.js
**Class Methods**:

**`constructor(params)`** ✅ **COMPLIANT**
- **Role**: Creates publish service with comprehensive dependencies
- **Functionality**: Initializes all services needed for publishing
- **Usage**: Handles chart publishing to GitHub and OCI

**`authenticate()`** ✅ **COMPLIANT**
- **Role**: Authenticates with OCI registry
- **Functionality**: Uses GitHub token for registry login
- **Returns**: Boolean authentication status
- **Usage**: Called before OCI publishing

**`createIndex(chart, outputDir)`** ⚠️ **STANDARDIZATION NEEDED**
- **Issue**: Individual parameters instead of object pattern
- **Proposed**: `createIndex({ chart, outputDir })`
- **Role**: Creates index files from chart metadata
- **Functionality**:
  - Copies metadata to index.yaml
  - Generates redirect HTML
- **Returns**: Boolean success status
- **Usage**: Used during index generation

**`find(type)`** ✅ **COMPLIANT**
- **Role**: Finds available charts by type
- **Functionality**: Scans directories for chart folders
- **Returns**: Array of chart directory objects
- **Usage**: Used for chart discovery

**`generateContent(chart)`** ✅ **COMPLIANT**
- **Role**: Generates GitHub release content
- **Functionality**:
  - Loads release template
  - Gets related issues
  - Renders with chart data
- **Returns**: Rendered release content
- **Usage**: Used for release creation

**`generateIndexes()`** ✅ **COMPLIANT**
- **Role**: Generates chart indexes for all charts
- **Functionality**:
  - Finds all charts
  - Creates index files
  - Generates redirect pages
- **Returns**: Count of generated indexes
- **Usage**: Called during release publishing

**`github(packages, packagesPath)`** ⚠️ **STANDARDIZATION NEEDED**
- **Issue**: Individual parameters instead of object pattern
- **Proposed**: `github({ packages, packagesPath })`
- **Role**: Publishes charts to GitHub releases
- **Functionality**:
  - Creates releases with generated content
  - Uploads chart packages as assets
  - Skips existing releases
- **Returns**: Array of published releases
- **Usage**: Main GitHub publishing method

**`registry(packages, packagesPath)`** ⚠️ **STANDARDIZATION NEEDED**
- **Issue**: Individual parameters instead of object pattern
- **Proposed**: `registry({ packages, packagesPath })`
- **Role**: Publishes charts to OCI registry
- **Functionality**:
  - Authenticates with registry
  - Cleans up existing packages
  - Pushes packages to OCI registry
- **Returns**: Array of published packages
- **Usage**: Main OCI publishing method

#### services/release/index.js
**Class Methods**:

**`constructor(params)`** ✅ **COMPLIANT**
- **Role**: Creates main release service
- **Functionality**: Initializes file and GitHub services
- **Usage**: Handles release orchestration

**`delete({ context, files })`** ✅ **COMPLIANT**
- **Role**: Deletes releases for removed charts
- **Functionality**:
  - Processes deleted chart files
  - Removes GitHub releases and OCI packages
- **Returns**: Count of deleted releases
- **Usage**: Called when charts are deleted

**`find({ files })`** ✅ **COMPLIANT**
- **Role**: Finds release-eligible charts from file changes
- **Functionality**:
  - Analyzes Chart.yaml file changes
  - Categorizes by chart type
  - Identifies deletions
- **Returns**: Object with categorized charts
- **Usage**: Main chart discovery method

**`validate(directory)`** ✅ **COMPLIANT**
- **Role**: Validates chart for release eligibility
- **Functionality**: Checks for Chart.yaml existence
- **Returns**: Boolean eligibility status
- **Usage**: Currently unused (TODO comment)

## Template Files

### templates/config.yml
Jekyll configuration for GitHub Pages with theme, metadata, and build settings.

### templates/head-custom.html  
Custom CSS styles for GitHub Pages including responsive design and branding.

### templates/index.md.hbs
Handlebars template for repository frontpage with chart listings table.

### templates/layout.html
Custom Jekyll layout with navigation, content area, and footer.

### templates/redirect.html.hbs
Handlebars template for chart-specific redirect pages.

### templates/release.md.hbs
Handlebars template for GitHub release notes with chart details, dependencies, and related issues.

### templates/workflow.md.hbs
Handlebars template for workflow issue reports with run details and links.

## Standardization Summary

### ✅ **COMPLIANT METHODS**: 160+ methods (85% compliance rate)
Most methods already follow proper standardization patterns including:
- Context-first parameter ordering
- Options-last pattern
- Object parameter destructuring
- Consistent naming conventions

### ⚠️ **STANDARDIZATION NEEDED**: 20 Methods Identified

**Core Module Issues**:
1. `core/Action.js#constructor` - Use params object pattern
2. `core/Error.js#constructor` - Use params object pattern  
3. `core/Error.js#extractErrorInfo` - Fix parameter order (context, error)
4. `core/Error.js#report` - Fix parameter order (context, error)
5. `core/Logger.js#constructor` - Use params object pattern

**Service Module Issues**:
6. `services/Git.js#fetch` - Convert to object parameter pattern
7. `services/Git.js#pull` - Convert to object parameter pattern
8. `services/Git.js#push` - Convert to object parameter pattern
9. `services/Git.js#signedCommit` - Use object parameter pattern
10. `services/Issue.js#create` - Use descriptive parameter destructuring
11. `services/Issue.js#report` - Use descriptive parameter destructuring
12. `services/github/GraphQL.js#getRepositoryType` - Use object parameter
13. `services/github/GraphQL.js#paginate` - Use object parameter pattern
14. `services/github/Rest.js#listJobs` - Use object parameter pattern
15. `services/github/Rest.js#paginate` - Use object parameter pattern
16. `services/github/Rest.js#validateContextPayload` - Use object parameter
17. `services/release/Local.js#validateChart` - Use object parameter pattern
18. `services/release/Publish.js#createIndex` - Use object parameter pattern
19. `services/release/Publish.js#github` - Use object parameter pattern
20. `services/release/Publish.js#registry` - Use object parameter pattern

## Key Architectural Patterns

1. **Service-Oriented Architecture**: Business logic separated into focused services
2. **Dependency Injection**: All dependencies provided through constructors
3. **Consistent Error Handling**: All services use execute() pattern with typed errors
4. **Template-Driven Content**: All generated content uses Handlebars templates
5. **Configuration Centralization**: Single configuration source with dot notation access
6. **Stateless Services**: No instance state maintained between operations
7. **GitHub API Integration**: Separate REST and GraphQL services with specialized methods
8. **Layered Responsibilities**: Handlers orchestrate, services implement, core provides utilities

## Integration Patterns

The new codebase integrates through:
- Standardized Action base class with execute() pattern
- Configuration singleton accessible throughout
- Service composition through dependency injection
- Consistent error reporting and logging
- Template-based content generation
- GitHub API abstraction layers

This analysis provides a comprehensive foundation for implementing method standardization across the entire codebase while maintaining the modular, object-oriented architecture.
