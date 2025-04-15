# Workflow Helper Scripts

This directory contains helper scripts used by GitHub Actions workflows in the repository.

## Deployment Types

The scripts support two deployment types controlled by the `CONFIG.deployment` setting in `pages.js`:

- `production`: Builds charts and deploys to GitHub Pages. This is the default mode used when running on the main repository.
- `staging`: Builds charts locally on the current branch without deploying to GitHub Pages. This mode is useful for testing changes before applying them to production.

The deployment type is made available as an output from the `setupBuildEnvironment` function, which can be accessed in workflows as `steps.setup.outputs.deployment`. This allows conditional execution of deployment steps based on the deployment environment.

## Coding Guidelines

- No comments or empty lines inside function bodies, code should be self-explanatory
- Variable naming should follow camelCase convention
- Function organization within a file should follow the following order (all in alphabetical order):
  - configuration constants
  - internal functions
  - exported functions
- Function parameters should use destructured objects for better readability
- Error handling should include detailed error messages for GraphQL operations
- Use consistent log message formats with `core.info`, `core.warning`, and `core.setFailed`
- Return data structure should be consistent across similar functions
- Function parameter validation should happen immediately at the beginning of functions before any API calls
- Use GraphQL API instead of REST API, when possible
- GraphQL queries should use consistent formatting with proper indentation

## Script Overview

### documentation.js

Provides utilities for automating chart documentation updates.

**Internal Functions:**
- None

**Exported Functions:**
- `installHelmDocs` - Installs the helm-docs package for generating Helm chart documentation
- `updateDocumentation` - Updates documentation in a pull request by generating docs and committing changes

**Configuration:**
- `CONFIG.helmDocs` - Configuration for helm-docs installation
- `CONFIG.git` - Configuration for Git operations during documentation updates

### git-config.js

Configures Git with GitHub Actions bot identity for making commits in workflows.

**Internal Functions:**
- None

**Exported Function:**
- Module exports a single function that configures Git and returns a `runGit` function for executing Git commands

### git-signed-commit.js

Creates verified commits using GitHub's GraphQL API.

**Internal Functions:**
- None

**Exported Functions:**
- `createSignedCommit` - Creates a signed commit with the provided changes using GitHub's GraphQL API
- `getGitStagedChanges` - Helper function to prepare file additions from git staged changes

### github-api.js

Provides centralized functions for interacting with the GitHub API.

**Internal Functions:**
- `_getLastReleaseDate` - Gets the date of the last release for a chart

**Exported Functions:**
- `createRelease` - Creates a new GitHub release
- `getReleaseByTag` - Checks if a GitHub release with the specified tag exists
- `getReleaseIssues` - Fetches issues related to a specific chart since the last release
- `uploadReleaseAsset` - Uploads an asset to a GitHub release

### pages.js

Provides centralized configuration and functions for Helm chart releases and GitHub Pages.

**Internal Functions:**
- `_buildChartRelease` - Builds a GitHub release for a single chart and uploads the chart package as an asset
- `_createChartReleases` - Creates GitHub releases for packaged charts and uploads the chart packages as release assets
- `_fileExists` - Helper function to check if a file exists
- `_findChartYamlFiles` - Recursively finds directories containing Chart.yaml files
- `_generateChartRelease` - Generates release content using the template file
- `_generateHelmIndex` - Generates the Helm repository index file
- `_packageCharts` - Packages all charts in a specified directory
- `_registerHandlebarsHelpers` - Registers common Handlebars helpers

**Exported Functions:**
- `generateChartIndex` - Generates the chart index page from the index.yaml file
- `processChartRelease` - Handles the complete Helm chart release process
- `setupBuildEnvironment` - Sets up the build environment for generating the static site

## Function Parameters

Most functions in these modules accept a destructured object with the following common parameters:
- `github` - GitHub API client for making API calls
- `context` - GitHub Actions context object containing repository and workflow information
- `core` - GitHub Actions Core API for logging and output
- `exec` - GitHub Actions exec helpers for running commands
- `fs` - Node.js fs/promises module for file operations

## Error Handling

All functions implement error handling with:
- Descriptive error messages
- Proper logging via `core.warning` or `core.setFailed`
- GraphQL error detail extraction for better debugging

## Maintenance

When adding new functionality to workflows, consider whether the functionality should be added to these helper scripts to promote code reuse and maintainability. Follow the established patterns and coding guidelines to maintain consistency across the codebase.
