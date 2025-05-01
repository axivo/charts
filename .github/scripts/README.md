# Workflow Helper Scripts

This directory contains helper scripts used by GitHub Actions workflows in the repository.

## Coding Guidelines

These guidelines ensure consistency, readability, and maintainability across the codebase.

### Error Handling Strategy

Error handling should be clear, consistent, and appropriate to the importance of each operation:

- Be explicit about when errors should be caught locally vs. propagated up
- Use the standardized `handleError` utility for all error conditions
- Set the `fatal` parameter to `false` for non-critical errors that shouldn't stop workflow execution

Refer to [Error Handling](#error-handling) section, for additional details.

### Function Structure and Organization

Functions should be concise, focused, and structured for clear understanding:

- No comments or empty lines inside function bodies, code should be self-explanatory
- Function parameters should use destructured objects for better readability
- Function parameter validation should happen at the beginning of functions before any operations
- Functions should follow the **single responsibility** principle - do one thing and do it well

### Documentation

Code documentation should be comprehensive but not redundant:

- Use JSDoc comments for all exported functions with the following format:
  ```javascript
  /**
   * Brief function description
   * 
   * More detailed explanation of what the function does and how it works.
   * Include any important context or constraints that apply.
   * 
   * @param {Object} params - Function parameters
   * @param {Object} params.github - GitHub API client for making API calls
   * @param {Object} params.context - GitHub Actions context containing repository information
   * @returns {Promise<void>}
   */
  ```
- Module headers should include `@author` and `@license` tags
- Include parameter descriptions for all destructured parameters
- Document return values and their types
- Don't document obvious information that's clear from the code itself
- Add a JSDoc comment for the module.exports section

### Naming Conventions and Code Style

Consistent naming and style improves readability and reduces cognitive load:

- Variable naming should follow `camelCase` convention
- Use PascalCase for template variables in `Handlebars` templates
- Use consistent log message formats with `core.info`, `core.warning`, and `core.setFailed`
- Avoid nested conditionals, prefer sequential conditions when possible

### File Organization

File organization should follow this order:

- Module imports (Node.js built-in modules first, then third-party modules, then local modules)
- Configuration constants
- Internal functions (in alphabetical order)
- Exported functions (in alphabetical order)

### Configuration Management

Centralized configuration improves maintainability and makes changes easier to implement:

- All configuration values should be in the central `config.js` module
- Use the `config(section)` function to access configuration values
- No hardcoded values in function bodies
- Return data structure should be consistent across similar functions

### API Usage

Consistently approach API interactions for better performance and error handling:

- Use GraphQL API instead of REST API, when possible
- GraphQL queries should use consistent formatting with proper indentation
- Include detailed error messages for GraphQL operations

### Template Handling

Separate template logic from application code for better maintainability:

- Separate template content from application logic using external template files
- Use standardized templates for programmatically creating GitHub issues or PRs

### Target Revision Management

Automatically manage application.yaml targetRevision references to ensure stability:

- Application files reference specific chart version tags instead of HEAD
- Chart version tags follow the format `{chartName}-v{chartVersion}`
- Changes to application files are committed separately from lock files

### Context Awareness

Handle different event contexts appropriately to ensure your code works in all scenarios:

- Functions that work with GitHub event contexts should handle different payload structures appropriately
- Be aware of the differences between `pull_request`, `push` and other event context structures

## Function Parameters

Most functions in these modules accept a destructured object with the following common parameters:

- `github` - GitHub API client for making API calls
- `context` - GitHub Actions context containing repository and workflow information
- `core` - GitHub Actions Core API for logging and output
- `exec` - GitHub Actions exec helpers for running commands
- `fs` - Node.js fs/promises module for file operations

## OCI Registry Integration

The repository supports publishing charts to OCI (Open Container Initiative) registries, such as GitHub Container Registry. This provides an alternative to the traditional Helm repository approach.

### Configuration

OCI registry settings are controlled via the following settings in `config.js`:

```javascript
repository: {
  oci: {
    enabled: false, // Enable/disable OCI publishing
    registry: 'ghcr.io/axivo' // OCI registry URL without protocol
  }
}
```

### Key Functions

- `_processOciReleases` in `release.js`: Handles pushing chart packages to OCI registries and deletion of existing packages

### Deployment Process

When OCI publishing is enabled:

1. The system authenticates with the OCI registry using the GitHub token
2. For each chart package:
   - Any existing package with the same name-version is deleted from the registry
   - The chart package is pushed to the registry using `helm push`
3. Charts become accessible via `oci://[registry]/[chartname]:[version]` syntax

OCI publishing can be used alongside traditional Helm repository publishing, giving users multiple options for chart installation.

## Centralized Configuration

The repository uses a centralized configuration approach through the `config.js` module. This provides:

- A single source of truth for all configuration values
- Consistent access pattern via the `config(section)` function
- Clear organization of configuration into logical sections
- Better maintainability through encapsulated changes

Example usage:

```javascript
// Import the config module
const config = require('./config');

// Get a specific section of configuration
const releaseConfig = config('release');

// Access specific configuration properties
const templatePath = config('release').template;
const chartTypes = config('repository').chart.type;
```

## Deployment Types

The scripts support two deployment types controlled by the `config('release').deployment` setting:

- `production`: Builds charts and deploys to GitHub Pages. This is the default mode used when running on the main repository.
- `staging`: Builds charts locally on the current branch without deploying to GitHub Pages. This mode is useful for testing changes before applying them to production.

The deployment type is made available as an output from the `setupBuildEnvironment` function, which can be accessed in workflows as `steps.setup.outputs.deployment`. This allows conditional execution of deployment steps based on the deployment environment.

## Error Handling

All functions should use the standardized error handling utility `utils.handleError` which provides:

- Consistent error message formatting
- Integration with GitHub Actions Core API for logging
- Configurable fatal vs. non-fatal error handling
- Better error propagation

Example usage:

```javascript
try {
  // function implementation
} catch (error) {
  utils.handleError(error, core, 'operation description', false); // false = non-fatal (warning)
}
```

For fatal errors (default behavior), the utility will:

- Log the error using `core.setFailed`
- Throw a new error with a standardized message

For non-fatal errors (when `fatal = false`), the utility will:

- Log the error using `core.warning`
- Allow execution to continue

## Scripts and Functions Reference

### `config.js`

Centralizes configuration settings for all GitHub Actions workflows in the repository.

#### Exported Function

- `config(section)` - Returns the requested configuration section or the entire config object

### `chart.js`

Provides functions for Helm chart management and repository maintenance.

#### Internal Functions

- `_performGitCommit` - Performs a Git commit for the specified files
- `_updateAppFiles` - Updates application files content with latest chart versions
- `_updateLockFiles` - Updates dependency lock files for charts in a pull request

#### Exported Function

- `updateCharts` - Orchestrates the complete chart repository maintenance process

### `documentation.js`

Provides utilities for automating chart documentation updates.

#### Exported Functions

- `installHelmDocs` - Installs the helm-docs package for generating Helm chart documentation 
- `updateDocumentation` - Generates and commits updated documentation for charts

### `github-api.js`

Provides centralized functions for interacting with the GitHub API.

#### Internal Functions

- `_getLastReleaseDate` - Gets the date of the last release for a chart
- `_getReleases` - Fetches GitHub releases based on specified query parameters

#### Exported Functions

- `checkWorkflowRunStatus` - Checks if a workflow run has any warnings or errors using GraphQL API
- `createRelease` - Creates a new GitHub release
- `createSignedCommit` - Creates a verified commit through GitHub's GraphQL API

- `getReleaseByTag` - Checks if a GitHub release with the specified tag exists
- `getReleases` - Gets GitHub releases with optional tag prefix filtering
- `getReleaseIssues` - Fetches issues related to a specific chart since the last release
- `getUpdatedFiles` - Gets the list of files changed in a pull request or push
- `uploadReleaseAsset` - Uploads an asset to a GitHub release

### `release.js`

Provides functions for Helm chart management, releases, and GitHub Pages generation.

#### Internal Functions

- `_buildChartRelease` - Creates a GitHub release for a chart and uploads its package
- `_publishChartReleases` - Processes chart packages and creates GitHub releases
- `_generateChartsIndex` - Generates Helm repository index files for specific charts
- `_generateChartRelease` - Generates release content using the template file
- `_generateFrontpage` - Generates repository index frontpage
- `_processOciReleases` - Processes chart releases for OCI registry publishing

#### Exported Functions

- `processReleases` - Processes chart releases for affected charts
- `setupBuildEnvironment` - Setup the build environment for generating the static site

### `release-local.js`

Provides functions for local Helm chart validation and testing.

#### Internal Functions

- `_checkDependencies` - Checks if all required dependencies are installed
- `_generateLocalIndex` - Generates a local Helm repository index
- `_packageChart` - Packages a chart after updating its dependencies
- `_validateChart` - Validates a chart using helm lint, template rendering, and kubectl validation
- `_validateIcon` - Validates chart's icon.png file

#### Exported Function

- `processLocalReleases` - Processes chart releases for local development environment

### `utils.js`

Provides utility functions for GitHub Actions workflows.

#### Exported Functions

- `addLabel` - Adds a label to a repository if it doesn't exist
- `configureGitRepository` - Configures Git with GitHub Actions bot identity
- `deleteOciReleases` - Deletes OCI releases from GitHub Container Registry
- `fileExists` - Checks if a file exists without throwing exceptions
- `findCharts` - Finds deployed charts in application and library paths
- `getGitStagedChanges` - Prepares file additions and deletions for commit
- `handleError` - Handles errors with configurable severity levels
- `registerHandlebarsHelpers` - Registers custom Handlebars template helpers
- `reportWorkflowIssue` - Creates GitHub issues for workflow problems
- `updateIssueLabels` - Updates repository issue labels based on configuration

## Workflow Files

The repository uses two main GitHub Actions workflow files that utilize these scripts:

### `chart.yml`

Handles chart updates and documentation generation for pull requests. This workflow:
1. Sets up the environment (Helm, Node)
2. Configures the Git repository
3. Updates repository issue labels
4. Installs helm-docs and updates chart documentation
5. Performs chart maintenance (application files, lock files, issue templates)
6. Reports any workflow issues

### `release.yml`

Handles chart releases and GitHub Pages deployments. This workflow:
1. Sets up the environment (Helm, Node)
2. Configures the Git repository
3. Processes releases for modified charts
4. Sets up the GitHub Pages build environment
5. Builds and deploys the chart repository to GitHub Pages
6. Reports any workflow issues

## Maintenance

When adding new functionality to workflows, consider whether the functionality should be added to these helper scripts to promote code reuse and maintainability. Follow the established patterns and coding guidelines to maintain consistency across the codebase.

## Version Management

All hardcoded software versions present in these scripts (such as Helm, Node.js, or any other external dependencies) are automatically updated by [Renovate](https://github.com/renovatebot/renovate). Do not manually modify version numbers in these scripts, as Renovate will manage these dependencies to ensure the latest compatible versions are used.
