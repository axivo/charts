# Session 2: Handlers & Basic Services

## handlers/ (High-Level Workflow Orchestration)

### handlers/Chart.js
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

### handlers/Workflow.js
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

### handlers/release/Local.js
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

### handlers/release/index.js
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

## Basic Services

### services/File.js
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

### services/Frontpage.js
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

### services/Git.js
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
- **Issue**: Mixed parameter patterns - some methods use individual params, need consistent object pattern
- **Current**: `fetch(remote, reference)`, `pull(remote, branch)`, `push(remote, branch, options)`
- **Proposed**: `fetch({ remote, reference })`, `pull({ remote, branch })`, `push({ remote, branch, options })`
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
- **Current**: `signedCommit(branch, files, message)`
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

### services/Issue.js
**Class Methods**:

**`constructor(params)`** ✅ **COMPLIANT**
- **Role**: Creates issue service with GitHub API dependencies
- **Functionality**: Initializes GraphQL and REST services
- **Usage**: Handles GitHub issue operations

**`create(params)`** ⚠️ **STANDARDIZATION NEEDED**
- **Issue**: Parameter name `params` is too generic, should use descriptive destructuring
- **Current**: `create(params)`
- **Proposed**: `create({ context, issue })` with proper destructuring
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
- **Issue**: Parameter name `params` is too generic, should use descriptive destructuring
- **Current**: `report(params)`
- **Proposed**: `report({ context, templateContent, templateService, labelService })`
- **Role**: Reports workflow issues
- **Functionality**:
  - Validates workflow for issues
  - Renders issue template
  - Creates GitHub issue if needed
- **Returns**: Created issue data or null
- **Usage**: Called by workflow handlers

### services/Label.js
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

## Session 2 Standardization Summary

### ⚠️ **METHODS NEEDING STANDARDIZATION**: 5 methods

1. **services/Git.js#fetch** - Convert to object parameter pattern
2. **services/Git.js#pull** - Convert to object parameter pattern  
3. **services/Git.js#push** - Convert to object parameter pattern
4. **services/Git.js#signedCommit** - Convert to object parameter pattern
5. **services/Issue.js#create** - Use descriptive parameter destructuring
6. **services/Issue.js#report** - Use descriptive parameter destructuring

### ✅ **COMPLIANT METHODS**: 35+ methods
- All handler methods follow standardization guidelines
- Majority of service methods already compliant
- File service is fully compliant (12 methods)
- Frontpage service is fully compliant (3 methods)  
- Label service is fully compliant (3 methods)

### Next Session Preview
Session 3 will cover advanced services: Shell, Template, chart/, and github/ modules with their standardization analysis.
