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
   * @param {Object} params.github - GitHub API client
   * @param {Object} params.context - GitHub Actions context
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

## Function Parameters

Most functions in these modules accept a destructured object with the following common parameters:

- `github` - GitHub API client for making API calls
- `context` - GitHub Actions context object containing repository and workflow information
- `core` - GitHub Actions Core API for logging and output
- `exec` - GitHub Actions exec helpers for running commands
- `fs` - Node.js fs/promises module for file operations

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

## Scripts Overview

### `config.js`

Centralizes configuration settings for all GitHub Actions workflows in the repository.

#### Exported Function

- `config(section)` - Returns the requested configuration section or the entire config object

### `chart.js`

Provides functions for Helm chart management and repository maintenance.

#### Internal Functions

- `_performCommit` - Generic function to commit changes to files with appropriate messages
- `_updateAppFiles` - Updates application files content with latest chart versions
- `_updateIssueTemplates` - Updates issue templates with current chart options
- `_updateLockFiles` - Updates Chart.lock files for charts in a pull request

#### Exported Functions

- `performUpdates` - Performs repository updates including lock files and issue templates

### `documentation.js`

Provides utilities for automating chart documentation updates.

#### Exported Functions

- `installHelmDocs` - Installs the helm-docs package for generating Helm chart documentation
- `updateDocumentation` - Updates documentation in a pull request by generating docs and committing changes

### `git-config.js`

Configures Git with GitHub Actions bot identity for making commits in workflows.

#### Exported Function

- `configureGit` - Configures Git with GitHub Actions bot identity and returns a `runGit` function

### `git-signed-commit.js`

Creates verified commits using GitHub's GraphQL API.

#### Exported Functions

- `createSignedCommit` - Creates a signed commit with the provided changes using GitHub's GraphQL API
- `getGitStagedChanges` - Helper function to prepare file additions from git staged changes

### `github-api.js`

Provides centralized functions for interacting with the GitHub API.

#### Internal Functions

- `_getLastReleaseDate` - Gets the date of the last release for a chart

#### Exported Functions

- `checkWorkflowRunStatus` - Checks if a workflow run has any warnings or errors
- `createRelease` - Creates a new GitHub release
- `getReleaseByTag` - Checks if a GitHub release with the specified tag exists
- `getReleaseIssues` - Fetches issues related to a specific chart since the last release
- `uploadReleaseAsset` - Uploads an asset to a GitHub release

### `release.js`

Handles Helm chart releases and GitHub Pages generation.

#### Internal Functions

- `_buildChartRelease` - Builds a GitHub release for a single chart and uploads the chart package as an asset
- `_createChartReleases` - Creates GitHub releases for packaged charts and uploads the chart packages as release assets
- `_generateChartRelease` - Generates release content using the template file
- `_generateHelmIndex` - Generates the Helm repository index file
- `_packageCharts` - Packages all charts in a specified directory and updates application references

#### Exported Functions

- `generateIndex` - Generates the chart index page from the index.yaml file
- `processReleases` - Handles the complete Helm chart release process
- `setupBuildEnvironment` - Sets up the build environment for generating the static site

### `utils.js`

Provides utility functions for GitHub Actions workflows.

#### Exported Functions

- `addLabel` - Adds a label to a repository if it doesn't exist
- `fileExists` - Helper function to check if a file exists
- `findCharts` - Finds deployed charts in application and library paths
- `handleError` - Handles errors in a standardized way with configurable severity
- `registerHandlebarsHelpers` - Registers common Handlebars helpers for templates
- `reportWorkflowIssue` - Reports workflow issues by creating a GitHub issue

## Maintenance

When adding new functionality to workflows, consider whether the functionality should be added to these helper scripts to promote code reuse and maintainability. Follow the established patterns and coding guidelines to maintain consistency across the codebase.

## Version Management

All hardcoded software versions present in these scripts (such as Helm, Node.js, or any other external dependencies) are automatically updated by [Renovate](https://github.com/renovatebot/renovate). Do not manually modify version numbers in these scripts, as Renovate will manage these dependencies to ensure the latest compatible versions are used.
