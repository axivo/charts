# GitHub Actions Code Migration Mapping - Detailed Behavioral Analysis

## Migration Analysis by File

## /Users/floren/github/charts-old/.github/scripts/chart.js

### 1. _lintCharts
**Old Function Behavior:**
- Accepts core, exec, and charts object containing application and library chart arrays
- Combines all chart directories into a single array
- Executes `ct lint` command once with all charts passed via --charts flag as comma-separated list
- Uses --skip-helm-dependencies flag to avoid dependency resolution during linting
- Returns true on success, false on error
- Handles errors as non-fatal

**Migrated to:**
- `Chart.lint()` in `/Users/floren/github/charts/.github/actions/services/chart/index.js`
- `Helm.lint()` in `/Users/floren/github/charts/.github/actions/services/helm/index.js`

**New Implementation Behavior:**
- Chart.lint() accepts array of chart directories
- Iterates through each chart individually
- Creates new Helm service instance for each chart
- Calls Helm.lint() with --strict flag for each chart directory
- Returns true only if ALL charts pass linting
- Helm.lint() executes `helm lint` command (not ct lint)

**Critical Differences:**
- **Tool Change**: Uses helm lint instead of chart-testing (ct) tool
- **Execution Pattern**: Individual commands per chart vs single command for all
- **Dependency Handling**: No longer skips dependencies during linting
- **Strictness**: Always uses --strict flag in new implementation
- **Performance**: Potentially slower due to multiple command executions

### 2. _performGitCommit
**Old Function Behavior:**
- Generic function accepting github, context, core, exec, files array, and type string
- Creates runGit helper function for executing git commands
- Pulls latest changes from the head branch (PR branch)
- Stages all specified files using git add
- Gets staged changes including file additions/deletions with base64 encoded content
- Only commits if there are actual changes
- Uses GitHub GraphQL API to create a signed commit
- Commit message follows pattern: "chore(github-action): update {type}"
- Handles errors as non-fatal warnings

**Migrated to:**
- `Docs.commit()` in `/Users/floren/github/charts/.github/actions/services/helm/Docs.js`

**New Implementation Behavior:**
- Specialized only for documentation commits
- No generic file type support
- Uses local git commit instead of GraphQL API
- Fixed commit message for documentation only

**CRITICAL MISSING FUNCTIONALITY:**
- **No general-purpose commit function exists**
- Cannot commit application files, lock files, or metadata files
- No GraphQL signed commit capability for non-documentation files
- No support for different commit types/messages

### 3. _updateAppFiles
**Old Function Behavior:**
- Processes application.yaml files in all application chart directories
- For each chart:
  1. Checks if application.yaml exists, skips if not
  2. Loads application.yaml and checks for spec.source field
  3. Loads Chart.yaml to get current chart version
  4. Creates tag name using template pattern from config (e.g., "chartname-1.2.3")
  5. Compares current targetRevision with new tag name
  6. Updates targetRevision only if different
  7. Writes updated YAML with lineWidth: -1 (no line wrapping)
  8. Tracks modified files for commit
- After processing all charts, commits changes via _performGitCommit
- Handles individual chart errors as non-fatal

**Migrated to:**
- `Update.application()` in `/Users/floren/github/charts/.github/actions/services/chart/Update.js`

**New Implementation Behavior:**
- Accepts array of chart directories (both application and library)
- For each chart:
  1. Checks if application.yaml exists
  2. Reads the YAML file
  3. Immediately writes it back unchanged
- Returns true/false based on success
- No actual update logic implemented

**CRITICAL MISSING FUNCTIONALITY:**
- **Does not read Chart.yaml for version information**
- **Does not create tag name from template**
- **Does not update targetRevision field**
- **Does not check if update is needed**
- **Does not track which files were modified**
- **Does not commit changes**
- **Writes file even when no changes made**

### 4. _updateLockFiles
**Old Function Behavior:**
- Processes all chart directories (application and library)
- For each chart:
  1. Reads Chart.yaml to check if dependencies array exists and has entries
  2. If dependencies exist:
     - Runs `helm dependency update` to refresh Chart.lock
     - Adds Chart.lock path to files list
  3. If no dependencies but Chart.lock exists:
     - Deletes the Chart.lock file
     - Still adds path to files list (for git to track deletion)
- After processing, commits all lock file changes/deletions
- Handles errors per chart as non-fatal

**Migrated to:**
- `Update.lock()` in `/Users/floren/github/charts/.github/actions/services/chart/Update.js`
- `Helm.updateDependencies()` in `/Users/floren/github/charts/.github/actions/services/helm/index.js`

**New Implementation Behavior:**
- Update.lock() accepts chart directories array
- For each chart, calls Helm.updateDependencies()
- Helm.updateDependencies() always runs `helm dependency update`
- No checking if dependencies exist
- No lock file deletion logic
- No file tracking or commit

**Critical Differences:**
- **Missing Conditional Logic**: Always updates instead of checking dependencies first
- **Missing Deletion**: Cannot remove Chart.lock when dependencies removed
- **Missing Commit**: No git operations to persist changes
- **Potential Issues**: May create lock files for charts without dependencies

### 5. _updateMetadataFiles
**Old Function Behavior:**
- Most complex update function, maintains chart version history in metadata.yaml
- For each chart:
  1. Checks if metadata.yaml exists and loads it
  2. Checks if current version already in metadata, skips if yes
  3. Determines chart type (application/library) from directory path
  4. Creates temporary directory for clean package generation
  5. Packages chart using `helm package` to temp directory
  6. Generates index using `helm repo index` with base URL
  7. Updates URLs in index to point to GitHub releases:
     - Pattern: {baseUrl}/releases/download/{tagName}/{chartType}.tgz
  8. If existing metadata:
     - Merges new version with existing entries
     - Sorts by version (newest first)
     - Removes duplicates
     - Applies retention policy (keeps only N recent versions)
  9. Writes updated index as metadata.yaml
- Commits all updated metadata files

**Migrated to:**
- `Update.metadata()` in `/Users/floren/github/charts/.github/actions/services/chart/Update.js`

**New Implementation Behavior:**
- Accepts chart directories array
- For each chart:
  1. Checks if metadata.yaml exists
  2. Reads the file
  3. Immediately writes it back unchanged
- No actual update logic

**CRITICAL MISSING FUNCTIONALITY:**
- **Does not check current version against metadata**
- **Does not package chart**
- **Does not generate index with helm repo index**
- **Does not update download URLs**
- **Does not merge with existing entries**
- **Does not sort versions**
- **Does not remove duplicates**
- **Does not apply retention policy**
- **Does not use temporary directory**
- **Does not commit changes**

### 6. updateCharts
**Old Function Behavior:**
- Main orchestration function for all chart updates
- Execution flow:
  1. Gets list of updated files from GitHub API
  2. Finds charts affected by those files
  3. If charts found:
     - Extracts all chart directories into dirs array
     - Updates documentation (helm-docs)
     - Updates application files (targetRevision)
     - Updates lock files (dependencies)
     - Updates metadata files (if packages.enabled in config)
     - Runs linting on all charts
- Each update function handles its own commits
- Catches and handles all errors at top level

**Migrated to:**
- `Chart.process()` in `/Users/floren/github/charts/.github/actions/handlers/Chart.js`
- `Workflow.updateCharts()` in `/Users/floren/github/charts/.github/actions/handlers/Workflow.js`

**New Implementation Behavior:**
- Workflow.updateCharts() creates Chart handler and calls process()
- Chart.process() flow:
  1. Gets updated files from GitHub API
  2. Finds affected charts
  3. Updates application files
  4. Updates lock files
  5. Updates metadata files
  6. Runs linting
  7. Generates documentation
  8. Filters for modified files
  9. Stages and commits changes locally

**Critical Differences:**
- **Order Change**: Documentation generation moved to end
- **Missing Config Check**: Always updates metadata regardless of packages.enabled
- **Commit Pattern**: Single commit at end vs multiple commits per update type
- **Missing Push**: Commits locally but never pushes to remote
- **Different Git Approach**: Uses Git service instead of GraphQL commits

## /Users/floren/github/charts-old/.github/scripts/config.js

### 1. const CONFIG
**Old Implementation:**
- Single CONFIG object containing all configuration sections
- Sections: issue, repository, theme, workflow
- Deeply nested structure with sub-objects

**Migrated to:**
- `/Users/floren/github/charts/.github/actions/config/production.js`

**Behavior:**
- Identical structure and values preserved
- Same nested organization maintained

### 2. config() function
**Old Function Behavior:**
- Simple accessor function
- Accepts optional section parameter
- Returns entire CONFIG if no section specified
- Returns CONFIG[section] if section specified
- No validation or error handling

**Migrated to:**
- `Configuration` class in `/Users/floren/github/charts/.github/actions/core/Configuration.js`
- Singleton instance in `/Users/floren/github/charts/.github/actions/config/index.js`

**New Implementation Behavior:**
- Class-based configuration manager
- Supports dot-notation path access (e.g., 'repository.chart.icon')
- get() method traverses nested objects
- Returns undefined for invalid paths
- Singleton pattern ensures single instance

**Enhancement:**
- More flexible access pattern
- Better encapsulation
- Path-based navigation instead of single-level sections

## /Users/floren/github/charts-old/.github/scripts/documentation.js

### 1. installHelmDocs
**Old Function Behavior:**
- Downloads helm-docs debian package from GitHub releases
- Constructs download URL with provided version
- Uses wget with retry logic (10 attempts, 60 second timeout)
- Installs package using apt-get
- All commands run with sudo
- Uses silent execution mode

**Migrated to:**
- `Docs.install()` in `/Users/floren/github/charts/.github/actions/services/helm/Docs.js`
- `Workflow.installHelmDocs()` in `/Users/floren/github/charts/.github/actions/handlers/Workflow.js`

**New Implementation Behavior:**
- Docs.install() maintains same download/install logic
- Workflow.installHelmDocs() wraps the service call
- Same wget and apt-get approach
- Same sudo usage pattern

**Behavior Preserved:** Installation process identical

### 2. updateDocumentation
**Old Function Behavior:**
- Comprehensive documentation update and commit process:
  1. Creates runGit helper for git commands
  2. Fetches latest changes from PR branch (GITHUB_HEAD_REF)
  3. Switches to PR branch
  4. Runs helm-docs with log level from config
  5. If dirs provided, uses -g flag with comma-separated list
  6. Stages all changes with git add .
  7. Gets list of changed files
  8. If changes exist:
     - Gets staged changes with base64 encoded content
     - Gets current HEAD revision
     - Creates signed commit via GraphQL API
- Handles all operations in single function

**Migrated to:**
- `Docs.generate()` in `/Users/floren/github/charts/.github/actions/services/helm/Docs.js`
- `Docs.commit()` in `/Users/floren/github/charts/.github/actions/services/helm/Docs.js`

**New Implementation Behavior:**
- Split into two methods:
- generate():
  - Runs helm-docs for specified directories
  - No git operations
- commit():
  - Handles git operations
  - Uses local git commit instead of GraphQL

**Critical Differences:**
- **No Branch Operations**: Doesn't fetch or switch branches
- **No GraphQL Commits**: Uses local git instead
- **Split Responsibility**: Generation separated from commit
- **Missing Staged Changes**: Doesn't get file content for GraphQL

## /Users/floren/github/charts-old/.github/scripts/github-api.js

### 1. _getLastReleaseDate
**Old Function Behavior:**
- Private helper to find most recent release date for a chart
- GraphQL query fetches 100 most recent releases
- Filters releases by tag name pattern (chartname-*)
- Sorts by creation date descending
- Returns ISO date string of most recent release
- Returns null if no releases found
- Used to determine cutoff date for issue filtering

**Migrated to:**
- Logic partially embedded in `GraphQL.getReleaseIssues()`

**New Implementation:**
- No standalone function exists
- Date filtering logic integrated into issue query
- Cannot be reused for other purposes

**MISSING:** Standalone method to get last release date

### 2. _getReleaseIds
**Old Function Behavior:**
- Gets all release IDs for a specific chart
- Uses pagination to fetch all releases
- Filters by tag name prefix pattern
- Returns array of objects with databaseId and tagName
- Handles pagination with while loop
- Used for bulk release deletion

**NOT MIGRATED**

**CRITICAL MISSING FUNCTIONALITY:**
- No way to get all releases for a chart
- Required for deleteReleases implementation
- Pagination logic not replicated elsewhere

### 3. _getReleases
**Old Function Behavior:**
- Private utility for fetching releases with flexible filtering
- Supports exact tag match or prefix match
- Implements pagination handling
- Supports result limit
- Returns normalized release objects
- Maps GraphQL response to REST-like format

**Migrated to:**
- `GraphQL.getReleases()` in `/Users/floren/github/charts/.github/actions/services/github/GraphQL.js`

**New Implementation:**
- Made public method
- Same pagination logic
- Same filtering capabilities
- Uses paginate() helper method

### 4. _getRepositoryType
**Old Function Behavior:**
- Determines if repository owner is organization or user
- Uses GraphQL to get __typename field
- Returns lowercase string: 'organization' or 'user'
- Required for package deletion API (different endpoints)
- Handles errors gracefully

**NOT MIGRATED**

**CRITICAL MISSING FUNCTIONALITY:**
- Required for OCI package deletion
- No alternative implementation exists
- Blocks deleteOciPackage functionality

### 5. checkWorkflowRunStatus
**Old Function Behavior:**
- Comprehensive workflow analysis:
  1. Lists all jobs for workflow run
  2. Checks each job's steps for failures
  3. Downloads complete workflow logs as zip
  4. Searches logs for warning patterns using regex
  5. Returns true if failures OR warnings found
- Returns false for 404 errors (workflow not found)
- Used to determine if workflow issues should be created

**Migrated to:**
- `Rest.getWorkflowRun()` in `/Users/floren/github/charts/.github/actions/services/github/Rest.js`
- `Workflow.reportIssue()` in `/Users/floren/github/charts/.github/actions/handlers/Workflow.js`

**New Implementation:**
- Rest.getWorkflowRun() only gets basic workflow info
- Workflow.reportIssue() uses services directly without workflow validation
- No job step analysis
- No log download
- No warning detection
- **ARCHITECTURAL CHANGE**: Issue handler eliminated to resolve naming conflicts

**CRITICAL MISSING FUNCTIONALITY:**
- **Cannot detect warnings in logs**
- **Cannot analyze individual job steps**
- **Less comprehensive issue detection**
- **No workflow status validation** (removed due to flawed logic causing false positives)

### 6. createRelease
**Old Function Behavior:**
- Creates GitHub release using REST API
- Parameters: name (tag), body (description), draft, prerelease flags
- Returns standardized data structure
- Maps API response to consistent format
- Logs creation with release ID

**Migrated to:**
- `Rest.createRelease()` in `/Users/floren/github/charts/.github/actions/services/github/Rest.js`

**New Implementation:**
- Same REST API usage
- Same parameter handling
- Standardized response format maintained

**Behavior Preserved**

### 7. createSignedCommit
**Old Function Behavior:**
- Creates verified commit using GitHub GraphQL API
- Validates required parameters (branchName, expectedHeadOid, commitMessage)
- Accepts additions array with path and base64 contents
- Accepts deletions array with just paths
- Uses createCommitOnBranch GraphQL mutation
- Returns commit OID on success
- Returns null if no changes or on error

**Migrated to:**
- `GraphQL.createSignedCommit()` in `/Users/floren/github/charts/.github/actions/services/github/GraphQL.js`

**New Implementation:**
- Same GraphQL mutation used
- Key difference: Encodes file contents to base64 internally
- Old expected pre-encoded content, new encodes it

**Critical Difference:**
- **Input Format Change**: Must adjust how additions are prepared

### 8. deleteOciPackage
**Old Function Behavior:**
- Deletes container package from GitHub registry
- Constructs package name as: repo/type/chartname
- Determines if owner is org or user (using _getRepositoryType)
- Uses different API endpoints for org vs user
- Returns true on success, false on error
- Handles errors as non-fatal

**NOT MIGRATED**

**CRITICAL MISSING FUNCTIONALITY:**
- Complete function missing
- Depends on missing _getRepositoryType
- Required for OCI cleanup operations

### 9. deleteReleases
**Old Function Behavior:**
- Deletes all releases for a specific chart
- Process:
  1. Gets all release IDs using _getReleaseIds
  2. For each release:
     - Deletes git tag reference
     - Deletes release itself
  3. Tracks success/failure per release
  4. Returns true if at least one deleted
- Handles errors per release as non-fatal
- Provides detailed success count

**NOT MIGRATED**

**CRITICAL MISSING FUNCTIONALITY:**
- Complete function missing
- Depends on missing _getReleaseIds
- Required for chart cleanup operations

### 10. getReleaseByTag
**Old Function Behavior:**
- Checks if release exists with specific tag
- Uses _getReleases helper with exact tag match
- Returns release object if found, null if not
- Used to prevent duplicate releases

**Migrated to:**
- `Rest.getReleaseByTag()` in `/Users/floren/github/charts/.github/actions/services/github/Rest.js`

**New Implementation:**
- Direct REST API call instead of GraphQL
- Same null/object return pattern
- Simpler implementation

### 11. getReleases
**Old Function Behavior:**
- Public wrapper around _getReleases
- Supports optional tag prefix filtering
- Supports result limit
- Delegates to private helper

**Migrated to:**
- `GraphQL.getReleases()` in `/Users/floren/github/charts/.github/actions/services/github/GraphQL.js`

**New Implementation:**
- Direct implementation (no wrapper)
- Same filtering and limit support
- Uses paginate() helper method

### 12. getReleaseIssues
**Old Function Behavior:**
- Complex issue filtering for chart releases:
  1. Gets last release date using _getLastReleaseDate
  2. Queries issues updated since that date
  3. Filters by both:
     - Regex match on body text for "chart: {chartname}"
     - Label match for chart type (application/library)
  4. Returns formatted issue objects
- Handles both OPEN and CLOSED issues
- Orders by UPDATED_AT descending
- Limits to maxIssues (default 50)

**Migrated to:**
- `GraphQL.getReleaseIssues()` in `/Users/floren/github/charts/.github/actions/services/github/GraphQL.js`

**New Implementation:**
- Filters by label matching only (chart name AND type labels)
- Only gets CLOSED issues
- Orders by CREATED_AT descending
- No regex filtering on body text

**Critical Differences:**
- **Different Filtering**: Labels only vs regex + labels
- **Different States**: Only closed vs open + closed
- **Different Ordering**: Created vs updated date
- **Less Flexible**: Requires specific label structure

### 13. getUpdatedFiles
**Old Function Behavior:**
- Gets all changed files from push or pull request
- For pull requests:
  - Uses GraphQL with pagination
  - Gets all files with change types
- For push events:
  - Uses REST compareCommits API
  - Maps status to change types
- Returns object mapping paths to change types
- Validates event has required fields

**Migrated to:**
- `Rest.getUpdatedFiles()` in `/Users/floren/github/charts/.github/actions/services/github/Rest.js`

**New Implementation:**
- Same dual approach (GraphQL for PR, REST for push)
- Same validation logic
- Same return format
- Wrapped in try-catch for safety

**Behavior Preserved**

### 14. uploadReleaseAsset
**Old Function Behavior:**
- Uploads file to GitHub release
- Parameters: releaseId, assetName, assetData (Buffer)
- Uses REST API upload endpoint
- Returns uploaded asset data
- Returns empty object on error

**Migrated to:**
- `Rest.uploadReleaseAsset()` in `/Users/floren/github/charts/.github/actions/services/github/Rest.js`

**New Implementation:**
- Same REST API usage
- Now reads file inside method (old accepted Buffer)
- Returns full response with data and headers

**Key Difference:**
- **File Reading**: New reads file, old accepted pre-read data

## /Users/floren/github/charts-old/.github/scripts/release-local.js

### 1. _validateIcon
**Old Function Behavior:**
- Validates chart icon requirements:
  1. Checks icon.png exists in chart directory
  2. Uses sharp library to read image metadata
  3. Verifies dimensions are exactly 256x256 pixels
  4. Verifies format is PNG
- Provides specific error messages for each failure
- Returns true/false
- Handles corrupt file errors specially

**NOT MIGRATED**

**CRITICAL MISSING FUNCTIONALITY:**
- No icon validation in new codebase
- Sharp library dependency not included
- Required for chart quality assurance

### 2. _checkDependencies
**Old Function Behavior:**
- Comprehensive dependency verification:
  1. Tests Kubernetes cluster connectivity
  2. Checks git, helm, kubectl tools installed
  3. Verifies tool versions
  4. Checks required Node packages
- Provides visual feedback with ✅/❌ symbols
- Shows versions for each tool
- Returns false if any dependency missing

**NOT MIGRATED**

**CRITICAL MISSING FUNCTIONALITY:**
- No dependency verification system
- No cluster connectivity check
- No tool version validation

### 3. _generateLocalIndex
**Old Function Behavior:**
- Generates Helm repository index for local testing
- Runs `helm repo index` on packages directory
- Creates index.yaml file
- Enables local repository testing
- Simple wrapper around helm command

**NOT MIGRATED**

**CRITICAL MISSING FUNCTIONALITY:**
- No local index generation
- Cannot test repository locally

### 4. _packageChart
**Old Function Behavior:**
- Packages chart for local testing:
  1. Updates chart dependencies first
  2. Packages chart to output directory
- Provides console feedback
- Returns true/false for success

**Migrated to:**
- Uses `Helm.package()` in `/Users/floren/github/charts/.github/actions/services/helm/index.js`

**New Implementation:**
- Helm.package() provides same functionality
- Reused existing service

### 5. _validateChart
**Old Function Behavior:**
- Comprehensive chart validation pipeline:
  1. Runs `helm lint --strict`
  2. Renders templates with `helm template`
  3. Validates rendered YAML is not empty
  4. Writes rendered content to temp file
  5. Validates against Kubernetes API with kubectl
  6. Deletes temp file
  7. Validates icon using _validateIcon
- Returns false if any step fails

**Migrated to:**
- `Chart.validate()` in `/Users/floren/github/charts/.github/actions/services/chart/index.js`

**New Implementation:**
- Only runs helm lint with --strict
- No template rendering
- No Kubernetes validation
- No icon validation

**CRITICAL MISSING FUNCTIONALITY:**
- **Missing 75% of validation pipeline**
- No template validation
- No Kubernetes API validation
- No icon checking

### 6. processLocalReleases
**Old Function Behavior:**
- Main function for local development workflow:
  1. Checks deployment mode (skips if production)
  2. Verifies all dependencies available
  3. Gets modified files using git status
  4. Finds affected charts
  5. Creates local packages directory
  6. For each chart:
     - Validates comprehensively
     - Packages if valid
  7. Generates local repository index
- Provides detailed console output
- Enables local testing before commit

**Migrated to:**
- `Local.process()` in `/Users/floren/github/charts/.github/actions/handlers/release/Local.js`

**New Implementation Missing:**
- Dependency checking
- Full validation pipeline  
- Local index generation
- Incomplete local testing capability

## /Users/floren/github/charts-old/.github/scripts/release.js

### 1. _buildChartRelease
**Old Function Behavior:**
- Creates individual chart release:
  1. Generates tag name from template
  2. Checks if release already exists
  3. Generates release body content
  4. Creates GitHub release
  5. Reads packaged chart file
  6. Uploads as release asset
- Asset name pattern: {type}.tgz
- Handles errors as non-fatal

**Migrated to:**
- Logic integrated into `Publish.github()` in `/Users/floren/github/charts/.github/actions/services/release/Publish.js`

**New Implementation:**
- Same logical flow preserved
- Integrated into larger publish process
- Same error handling approach

### 2. _extractChartInfo
**Old Function Behavior:**
- Parses chart package filename
- Extracts name and version from pattern: name-version.tgz
- Uses lastIndexOf to handle names with dashes
- Returns [name, version] array
- Synchronous string manipulation only

**Migrated to:**
- `Package.parseInfo()` in `/Users/floren/github/charts/.github/actions/services/release/Package.js`

**New Implementation:**
- Same string parsing logic
- Simple method rename
- Identical behavior

### 3. _generateChartIndexes
**Old Function Behavior:**
- Creates chart-specific index pages:
  1. Finds all charts in repository
  2. For each chart:
     - Creates output directory structure
     - Copies metadata.yaml as index.yaml
     - Generates HTML redirect page
  3. Uses Handlebars template for redirects
- Creates structure: /{type}/{name}/index.yaml
- Handles missing metadata files gracefully

**Migrated to:**
- `Publish.generateIndexes()` in `/Users/floren/github/charts/.github/actions/services/release/Publish.js`
- `Publish.createIndex()` in `/Users/floren/github/charts/.github/actions/services/release/Publish.js`

**New Implementation:**
- Split into orchestration and individual processing
- Same directory structure created
- Same file copying approach
- Same redirect generation

### 4. _generateChartRelease
**Old Function Behavior:**
- Generates release notes content:
  1. Loads release template
  2. Registers Handlebars helpers
  3. Gets related issues via API
  4. Builds template context with:
     - Version info
     - Dependencies with links
     - Icon status
     - Related issues
  5. Renders template
- Rich context object with multiple data points

**Migrated to:**
- `Publish.generateContent()` in `/Users/floren/github/charts/.github/actions/services/release/Publish.js`

**New Implementation:**
- Same template approach
- Same context building
- Same Handlebars usage
- Preserved rich release notes

### 5. _generateFrontpage
**Old Function Behavior:**
- Creates repository landing page:
  1. Finds all charts
  2. Extracts metadata for each
  3. Builds index object
  4. Sorts charts by type then name
  5. Renders frontpage template
  6. Writes index.md
- Groups charts by type
- Handles missing metadata gracefully

**Migrated to:**
- `Frontpage.generate()` in `/Users/floren/github/charts/.github/actions/services/Frontpage.js`

**New Implementation:**
- Dedicated service for frontpage
- Same sorting logic
- Same template approach
- Same output format

### 6. _getChartPackages
**Old Function Behavior:**
- Scans for packaged charts:
  1. Checks application and library directories
  2. Filters for .tgz files
  3. Returns array with source and type
- Handles missing directories
- Non-fatal error handling

**Migrated to:**
- `Package.get()` in `/Users/floren/github/charts/.github/actions/services/release/Package.js`

**New Implementation:**
- Same directory scanning
- Same filtering logic
- Same return format

### 7. _packageCharts
**Old Function Behavior:**
- Packages all modified charts:
  1. Creates package directory structure
  2. For each chart:
     - Updates dependencies
     - Packages to appropriate directory
  3. Separates application/library packages
- Creates: .cr-release-packages/{type}/

**Migrated to:**
- `Package.createDirectories()` in `/Users/floren/github/charts/.github/actions/services/release/Package.js`
- `Package.package()` in `/Users/floren/github/charts/.github/actions/services/release/Package.js`

**New Implementation:**
- Split into directory creation and packaging
- Same directory structure
- Same packaging approach

### 8. _publishChartReleases
**Old Function Behavior:**
- Publishes releases to GitHub:
  1. Deletes releases for removed charts
  2. Gets all packaged charts
  3. For each package:
     - Extracts chart info
     - Loads metadata
     - Creates release
     - Uploads asset
  4. Generates chart indexes if enabled
- Handles deleted charts first

**Migrated to:**
- `Publish.github()` in `/Users/floren/github/charts/.github/actions/services/release/Publish.js`

**New Implementation:**
- Same deletion-first approach
- Same package processing
- Missing: deleteReleases implementation

### 9. _publishOciReleases
**Old Function Behavior:**
- Publishes to OCI registry:
  1. Authenticates with registry
  2. Deletes existing OCI packages
  3. Filters packages for modified charts only
  4. Pushes each package to registry
- Registry path: oci://registry/owner/repo/type
- Handles auth failures gracefully

**Migrated to:**
- `Publish.oci()` in `/Users/floren/github/charts/.github/actions/services/release/Publish.js`

**New Implementation:**
- Same authentication approach
- Same push logic
- Missing: deleteOciPackage implementation
- Cannot delete existing packages

### 10. processReleases
**Old Function Behavior:**
- Main release orchestration:
  1. Gets updated files
  2. Finds affected charts
  3. Identifies deleted charts
  4. Packages charts
  5. Publishes to GitHub
  6. Publishes to OCI if enabled
- Handles both additions and deletions

**Migrated to:**
- `Workflow.processReleases()` in `/Users/floren/github/charts/.github/actions/handlers/Workflow.js`

**New Implementation:**
- Delegates to Release handler
- Same logical flow
- Abstracted to handler pattern

### 11. setupBuildEnvironment
**Old Function Behavior:**
- Prepares GitHub Pages build:
  1. Generates frontpage content
  2. Copies Jekyll config files
  3. Copies theme files to _includes
  4. Sets deployment output flag
- Creates directory structure for Jekyll
- Determines if should publish (not private + production)

**Migrated to:**
- `Frontpage.setTheme()` in `/Users/floren/github/charts/.github/actions/services/Frontpage.js`
- `Workflow.setFrontpage()` in `/Users/floren/github/charts/.github/actions/handlers/Workflow.js`

**New Implementation:**
- Split between service methods
- Same file copying
- Same directory creation
- Same publish logic

## /Users/floren/github/charts-old/.github/scripts/utils.js

### 1. addLabel
**Old Function Behavior:**
- Creates GitHub label if missing:
  1. Tries to get existing label
  2. If 404, creates with color/description
  3. Uses config for default values
  4. Returns true if created, false if exists
- Validates label name required
- Non-fatal error handling

**Migrated to:**
- `Label.add()` in `/Users/floren/github/charts/.github/actions/services/Label.js`

**New Implementation:**
- Dedicated Label service
- Same existence check
- Same creation logic
- Same return pattern

### 2. configureGitRepository
**Old Function Behavior:**
- Sets up git identity:
  1. Creates runGit helper function
  2. Configures user.email from config
  3. Configures user.name from config
  4. Returns runGit for reuse
- Helper trims stdout automatically
- Used throughout for git operations

**Migrated to:**
- `Git.configure()` in `/Users/floren/github/charts/.github/actions/services/Git.js`

**New Implementation:**
- Git service method
- Same configuration values
- No helper function returned
- Service maintains state internally

**Critical Difference:**
- **No runGit helper returned**
- Must use Git service methods instead

### 3. fileExists
**Old Function Behavior:**
- Promise-based file existence check
- Uses fs.access internally
- Returns true if accessible
- Returns false on any error
- Never throws exceptions

**Migrated to:**
- `File.exists()` in `/Users/floren/github/charts/.github/actions/services/File.js`

**New Implementation:**
- Same approach
- Same true/false return
- Same error suppression

### 4. findCharts
**Old Function Behavior:**
- Discovers charts in repository:
  1. Scans application and library directories
  2. Checks for Chart.yaml in each subdirectory
  3. If files array provided:
     - Only includes charts with modified files
  4. Returns object with arrays and counts
- Labels as "updated" or "available"
- Non-fatal directory errors

**Migrated to:**
- `Chart.discover()` in `/Users/floren/github/charts/.github/actions/services/chart/index.js`
- `Chart.find()` in `/Users/floren/github/charts/.github/actions/services/chart/index.js`

**New Implementation:**
- Split into two methods
- discover(): Finds all charts
- find(): Filters by changed files
- Same return structure

### 5. getGitStagedChanges
**Old Function Behavior:**
- Prepares staged changes for GraphQL commit:
  1. Gets added/modified files with paths
  2. Reads each file content
  3. Encodes content as base64
  4. Gets deleted files separately
  5. Returns additions with content, deletions with paths
- Critical for createSignedCommit API
- Handles different diff filters

**Migrated to:**
- `Git.getStagedChanges()` in `/Users/floren/github/charts/.github/actions/services/Git.js`

**New Implementation:**
- Returns paths and status only
- No file content reading
- No base64 encoding

**CRITICAL MISSING FUNCTIONALITY:**
- **Cannot prepare data for GraphQL commits**
- Missing content encoding required by API
- Breaks signed commit functionality

### 6. handleError
**Old Function Behavior:**
- Centralized error handling:
  1. Formats error message with operation context
  2. If fatal: Uses setFailed and throws
  3. If non-fatal: Uses warning only
  4. Returns formatted message
- Consistent error messaging
- Configurable severity

**Migrated to:**
- `ErrorHandler` class in `/Users/floren/github/charts/.github/actions/utils/ErrorHandler.js`
- Custom error classes in `/Users/floren/github/charts/.github/actions/utils/errors/`

**New Implementation:**
- Class-based error handling
- Typed errors (ReleaseError, AppError, etc.)
- More structured approach
- Same fatal/non-fatal concept

### 7. registerHandlebarsHelpers
**Old Function Behavior:**
- Registers template helpers:
  1. 'eq' helper for equality comparison
  2. 'RepoRawURL' helper for URL transformation
- Modifies GitHub URLs to raw URLs
- Returns configured Handlebars instance

**Migrated to:**
- `Template.isEqual()` in `/Users/floren/github/charts/.github/actions/services/Template.js`
- `Template.setRepoRawUrl()` in `/Users/floren/github/charts/.github/actions/services/Template.js`

**New Implementation:**
- Split into individual methods
- Same helper functionality
- More modular approach

### 8. reportWorkflowIssue
**Old Function Behavior:**
- Creates issue for workflow problems:
  1. Checks workflow run status
  2. Special check for createLabels flag
  3. If issues found:
     - Loads template
     - Renders with context
     - Creates labels if needed
     - Creates issue
- Comprehensive workflow context

**Migrated to:**
- `Issue.report()` in `/Users/floren/github/charts/.github/actions/services/Issue.js`
- `Workflow.reportIssue()` in `/Users/floren/github/charts/.github/actions/handlers/Workflow.js`

**New Implementation:**
- Direct service usage without handler layer
- **ARCHITECTURAL CHANGE**: Issue handler removed to fix naming conflicts
- Workflow validation logic eliminated (was causing false positives)
- Same issue creation logic via services
- Missing: Log analysis for warnings

### 9. updateIssueLabels
**Old Function Behavior:**
- Creates all missing labels:
  1. Checks createLabels config flag
  2. Gets all label definitions
  3. Creates each missing label
  4. Returns array of created labels
- Bulk label creation
- Conditional on config

**Migrated to:**
- `Label.update()` in `/Users/floren/github/charts/.github/actions/services/Label.js`
- `Workflow.updateLabels()` in `/Users/floren/github/charts/.github/actions/handlers/Workflow.js`

**New Implementation:**
- Direct service usage without handler layer
- **ARCHITECTURAL CHANGE**: Issue handler removed to fix naming conflicts
- Same config check
- Same bulk creation
- Returns created label names

## Summary of Completed Implementations - UPDATED

### 1. Chart Update Logic - ✅ COMPLETED
- **`Update.application()`**: ✅ IMPLEMENTED - Now includes version lookup, tag creation, targetRevision update logic, file tracking, and signed commit
- **`Update.lock()`**: ✅ IMPLEMENTED - Now includes dependency checking, Chart.lock deletion when no dependencies, file tracking, and signed commit
- **`Update.metadata()`**: ✅ IMPLEMENTED - Now includes chart packaging, index generation, URL updates, merging, sorting, retention logic, file tracking, and signed commit

### 2. Git Operations - ✅ PARTIALLY COMPLETED
- **Git signed commit operations**: ✅ IMPLEMENTED - `Git.signedCommit()` provides GraphQL signed commit functionality for all update operations
- **Documentation signed commits**: ✅ IMPLEMENTED - `Docs.generate()` uses `Git.signedCommit()` for documentation updates
- **`Git.getStagedChanges()`**: ⚠️ PARTIAL - Returns paths and status, but signed commit method handles file content encoding internally

### 3. Issue Handler Architecture - ✅ RESOLVED
- **Issue handler naming conflict**: ✅ FIXED - Removed redundant Issue handler to eliminate SyntaxError
- **Workflow issue reporting**: ✅ REFACTORED - Uses services directly via `Workflow.reportIssue()`
- **Label management**: ✅ REFACTORED - Uses Label service directly via `Workflow.updateLabels()`
- **Workflow validation**: ✅ REMOVED - Eliminated flawed validation logic causing false positives

### 4. GitHub API Methods - ❌ STILL MISSING
- **`deleteReleases()`**: ❌ Still needed for cleanup operations
- **`deleteOciPackage()`**: ❌ Still needed for OCI cleanup
- **`_getReleaseIds()`**: ❌ Helper for bulk operations still missing
- **`_getRepositoryType()`**: ❌ Helper for API routing still missing

## Migration Status Updates

### ✅ COMPLETED MIGRATIONS:

#### /Users/floren/github/charts-old/.github/scripts/chart.js

**2. _performGitCommit**
**Status:** ✅ FULLY MIGRATED
**Migrated to:**
- `Git.signedCommit()` in `/Users/floren/github/charts/.github/actions/services/Git.js`
- Used by `Update.application()`, `Update.lock()`, `Update.metadata()`, and `Docs.generate()`

**New Implementation Behavior:**
- Generic signed commit functionality available to all services
- Maintains same GraphQL API usage pattern
- Handles git operations (fetch, switch, add, getStagedChanges) internally
- Creates signed commits with customizable messages
- Returns structured results for tracking

**Migration Success:** ✅ COMPLETE - All chart update operations now use signed commits

**3. _updateAppFiles**
**Status:** ✅ FULLY IMPLEMENTED
**Migrated to:**
- `Update.application()` in `/Users/floren/github/charts/.github/actions/services/chart/Update.js`

**New Implementation Behavior:**
- ✅ Reads Chart.yaml for version information
- ✅ Creates tag name from template using config pattern
- ✅ Updates targetRevision field only when different
- ✅ Tracks modified files for commit
- ✅ Uses signed commit with appropriate message
- ✅ Handles errors as non-fatal per chart
- ✅ Follows exact old logic pattern

**Migration Success:** ✅ COMPLETE - Full functionality restored

**4. _updateLockFiles**
**Status:** ✅ FULLY IMPLEMENTED  
**Migrated to:**
- `Update.lock()` in `/Users/floren/github/charts/.github/actions/services/chart/Update.js`
- `Helm.updateDependencies()` in `/Users/floren/github/charts/.github/actions/services/helm/index.js`

**New Implementation Behavior:**
- ✅ Checks if dependencies exist before running helm update
- ✅ Runs `helm dependency update` only when dependencies present
- ✅ Deletes Chart.lock when no dependencies but file exists
- ✅ Tracks modified/deleted files for commit
- ✅ Uses signed commit with appropriate message
- ✅ Handles errors as non-fatal per chart

**Migration Success:** ✅ COMPLETE - All conditional logic and cleanup implemented

**5. _updateMetadataFiles**
**Status:** ✅ FULLY IMPLEMENTED
**Migrated to:**
- `Update.metadata()` in `/Users/floren/github/charts/.github/actions/services/chart/Update.js`

**New Implementation Behavior:**
- ✅ Checks if current version already exists in metadata
- ✅ Determines chart type from directory path
- ✅ Creates temporary directory for clean package generation
- ✅ Packages chart using `helm package` via `helmService.package()`
- ✅ Generates index using `helm repo index` via `helmService.generateIndex()`
- ✅ Updates URLs with GitHub release download paths
- ✅ Merges new version with existing metadata entries
- ✅ Sorts by version (newest first)
- ✅ Removes duplicate versions
- ✅ Applies retention policy configuration
- ✅ Tracks modified files for commit
- ✅ Uses signed commit with appropriate message

**Migration Success:** ✅ COMPLETE - Full complex metadata logic implemented

#### /Users/floren/github/charts-old/.github/scripts/documentation.js

**2. updateDocumentation**
**Status:** ✅ FULLY MIGRATED
**Migrated to:**
- `Docs.generate()` in `/Users/floren/github/charts/.github/actions/services/helm/Docs.js`

**New Implementation Behavior:**
- ✅ Fetches and switches to PR branch
- ✅ Runs helm-docs with config log level
- ✅ Handles both global and directory-specific generation
- ✅ Stages changes and detects modified files
- ✅ Uses `Git.signedCommit()` for GraphQL signed commits
- ✅ Returns structured results with update counts

**Migration Success:** ✅ COMPLETE - Documentation workflow fully functional

### 4. Local Development - QUALITY
- **Icon validation**: 256x256 PNG validation missing
- **Dependency checking**: No tool/cluster verification
- **Local index generation**: Cannot test locally
- **Full chart validation**: Only lints, missing template and K8s validation

### 5. Workflow Validation - COMPLETENESS
- **Log analysis**: Cannot detect warnings in workflow logs

## Established Implementation Guidelines

### 1. Service Layer Pattern
- Services are stateless classes with static methods
- Single responsibility per service
- Throw typed errors with context information
- Alphabetical method ordering after constructor

### 2. Error Handling Pattern
- Use ReleaseError for release-related failures
- Use AppError for application-level failures
- Include context object with debugging information
- Avoid try-catch unless necessary

### 3. File Operations Pattern
- Always use File service for operations
- Check existence before reading
- Use async/await consistently
- Return parsed content directly

### 4. Git Operations Pattern
- Configure Git instance once per handler
- Use instance methods for operations
- Stage changes before getting staged changes

### 5. GraphQL/REST API Pattern
- GraphQL for complex queries and mutations
- REST for simple CRUD operations
- Standardize response format
- Use Octokit instances from services

### 6. Handler Pattern
- Orchestrate service calls
- Create service instances in constructor
- Main method is process() or action-specific
- Return structured results

### 7. Configuration Access
- Use singleton configuration instance
- Access nested values with dot notation
- Never modify configuration at runtime

### 8. Template Processing
- Register helpers before rendering
- Use Handlebars for all templating
- Keep templates in separate files

### 9. Helm Command Execution
- Build command arrays, not strings
- Use execute() for generic commands
- Create specific methods for common operations

### 10. Method Implementation Rules
- NO comments inside method bodies
- NO blank lines inside methods
- Exact pattern matching from existing code
- Preserve original parameter names
- Return same data structures

### 11. Missing Functionality Implementation
1. Find exact pattern in existing similar methods
2. Copy pattern structure exactly
3. Adapt only specific logic needed
4. Maintain same error handling approach
5. Use same service dependencies

### 12. Code Organization
- Alphabetical method ordering
- Group related functionality
- Keep handlers thin
- One class per file
- Index files only export