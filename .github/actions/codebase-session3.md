# Session 3: Advanced Services

## Advanced Core Services

### services/Shell.js
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

### services/Template.js
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

## Chart Services

### services/chart/index.js
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

### services/chart/Update.js
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

## GitHub API Services

### services/github/Api.js
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

### services/github/GraphQL.js
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
- **Issue**: Single parameter instead of object pattern for consistency
- **Current**: `getRepositoryType(owner)`
- **Proposed**: `getRepositoryType({ context, owner })` for consistency with other methods
- **Role**: Determines if repository owner is user or organization
- **Functionality**: Queries GraphQL for owner type
- **Returns**: String ('organization' or 'user')
- **Usage**: Used for API routing decisions

**`paginate(query, variables, extractor, filter, limit)`** ⚠️ **STANDARDIZATION NEEDED**
- **Issue**: Too many individual parameters, should use object pattern
- **Current**: `paginate(query, variables, extractor, filter, limit)`
- **Proposed**: `paginate({ query, variables, extractor, filter, limit })`
- **Role**: Helper for GraphQL pagination
- **Functionality**: Handles cursor-based pagination with filtering
- **Returns**: Paginated and filtered results
- **Usage**: Used by other GraphQL methods

### services/github/Rest.js
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
- **Issue**: Inconsistent parameter patterns between related methods
- **Current**: `getWorkflowRun({ context, id })` ✅ vs `listJobs(context)` ❌
- **Proposed**: `listJobs({ context })` for consistency with getWorkflowRun
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
- **Issue**: Too many individual parameters, should use object pattern
- **Current**: `paginate(namespace, method, params, resultProcessor, size)`
- **Proposed**: `paginate({ namespace, method, params, resultProcessor, size })`
- **Role**: Helper for REST API pagination
- **Functionality**: Handles page-based pagination with result processing
- **Returns**: Aggregated results
- **Usage**: Used by other REST methods

**`validateContextPayload(context)`** ⚠️ **STANDARDIZATION NEEDED**
- **Issue**: Single parameter instead of object pattern for consistency
- **Current**: `validateContextPayload(context)`
- **Proposed**: `validateContextPayload({ context })` for consistency with other context methods
- **Role**: Validates GitHub Actions context for different event types
- **Functionality**: Checks required fields for pull_request and push events
- **Returns**: Validation result object
- **Usage**: Used before API operations

### services/github/index.js
**Exported Classes**: Api, GraphQL, Rest

## Session 3 Standardization Summary

### ⚠️ **METHODS NEEDING STANDARDIZATION**: 5 methods

1. **services/github/GraphQL.js#getRepositoryType** - Convert to object parameter pattern
2. **services/github/GraphQL.js#paginate** - Convert to object parameter pattern
3. **services/github/Rest.js#listJobs** - Convert to object parameter pattern
4. **services/github/Rest.js#paginate** - Convert to object parameter pattern
5. **services/github/Rest.js#validateContextPayload** - Convert to object parameter pattern

### ✅ **COMPLIANT METHODS**: 25+ methods

**Fully Compliant Services**:
- **Shell service** (2 methods) - 100% compliant
- **Template service** (3 methods) - 100% compliant  
- **Chart services** (7 methods) - 100% compliant
- **GitHub Api service** (2 methods) - 100% compliant

**Mostly Compliant Services**:
- **GitHub GraphQL service** (3/5 methods compliant, 2 needing fixes)
- **GitHub REST service** (8/11 methods compliant, 3 needing fixes)

### Key Patterns Identified

**Object Parameter Pattern Adoption**: Most GitHub API methods already follow the `{ context, ...params }` pattern, with only a few utility methods needing standardization.

**Consistency Gaps**: Main issues are with utility/helper methods that use individual parameters instead of the established object pattern.

### Next Session Preview
Session 4 will cover the final services: helm/ and release/ modules, plus templates/ files, with the complete standardization summary and architectural patterns.
