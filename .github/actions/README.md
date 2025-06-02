# GitHub Actions Core 

This repository contains modular, object-oriented JavaScript components for GitHub Actions workflows.

## Contents

1. [Configuration System](#configuration-system)
2. [Base Action Class](#base-action-class)
3. [Error Handling](#error-handling)
4. [Architecture Overview](#architecture-overview)
5. [Service Layer Patterns](#service-layer-patterns)
6. [Coding Standards Compliance](#coding-standards-compliance)
7. [GitHub API Integration](#github-api-integration)

## Architecture Overview

The codebase follows a modular, layered architecture designed for maintainability and consistency:

### Directory Structure

```
.github/actions/
├── README.md               # This documentation file
├── config/                 # Configuration management
│   ├── index.js            # Singleton configuration instance
│   └── production.js       # Production configuration values
├── core/                   # Base classes and utilities
│   ├── Action.js           # Base Action class with lifecycle hooks
│   ├── Configuration.js    # Configuration management class
│   ├── Error.js            # Error reporter class
│   ├── Logger.js           # Standardized logging class
│   └── index.js            # Core module exports
├── handlers/               # High-level workflow orchestration
│   ├── Chart.js            # Chart update handler
│   ├── Workflow.js         # Common workflow operations
│   ├── index.js            # Handlers module exports
│   └── release/            # Release-specific handlers
│       ├── Local.js        # Local development release handler
│       └── index.js        # Release handler with Local export
├── services/               # Business logic services
│   ├── File.js             # File system operations service
│   ├── Frontpage.js        # Repository frontpage generation service
│   ├── Git.js              # Git operations service
│   ├── Issue.js            # GitHub issue management service
│   ├── Label.js            # Repository label management service
│   ├── Shell.js            # Shell command execution service
│   ├── Template.js         # Handlebars template rendering service
│   ├── chart/              # Chart-specific services
│   │   ├── Update.js       # Chart update operations service
│   │   └── index.js        # Chart service with Update export
│   ├── github/             # GitHub API services
│   │   ├── Api.js          # Base GitHub API service
│   │   ├── GraphQL.js      # GitHub GraphQL API service
│   │   ├── Rest.js         # GitHub REST API service
│   │   └── index.js        # GitHub services module exports
│   ├── helm/               # Helm tool services
│   │   ├── Docs.js         # Helm-docs operations service
│   │   └── index.js        # Helm service exports
│   ├── index.js            # Services module exports
│   └── release/            # Release management services
│       ├── Local.js        # Local development release service
│       ├── Package.js      # Chart packaging service
│       ├── Publish.js      # Release publishing service
│       └── index.js        # Release service with Package/Publish exports
└── templates/              # Handlebars templates
    ├── config.yml          # Jekyll configuration template
    ├── head-custom.html    # Custom HTML head content template
    ├── index.md.hbs        # Repository frontpage template
    ├── layout.html         # Custom HTML layout template
    ├── redirect.html.hbs   # Chart redirection template
    ├── release.md.hbs      # GitHub release notes template
    └── workflow.md.hbs     # Workflow issue template
```

### Architectural Principles

- **Single Responsibility**: Each service handles one specific domain
- **Dependency Injection**: Services receive dependencies through constructors
- **Stateless Services**: Services maintain no state between operations
- **Consistent Error Handling**: All services use typed errors with context
- **Alphabetical Organization**: Methods are ordered alphabetically for consistency

## Service Layer Patterns

Services form the core business logic layer with standardized patterns:

### Service Implementation Pattern

Services are stateless classes that extend the Action base class and provide domain-specific functionality. They follow strict implementation guidelines for consistency and maintainability.

### Service Composition

- Services use dependency injection via constructor parameters
- Each service focuses on a single domain (GitHub API, Helm operations, file management)
- Services throw typed errors with contextual information
- All methods follow alphabetical ordering after the constructor

### Error Handling in Services

Services use the `execute()` pattern for consistent error handling and context preservation. Operations are wrapped with appropriate error types that include operation context and debugging information.

## Coding Standards Compliance

See below, the critical implementation requirements.

### File Structure Standards

- **Import Order**: Node.js built-ins, third-party modules, internal modules (all alphabetical)
- **Class Structure**: Constructor first, then methods in alphabetical order
- **Export Pattern**: Single default export per file

### Method Implementation Rules

- **No Comments**: Method bodies contain no comments under any circumstances
- **No Blank Lines**: Method bodies contain no blank lines
- **Single Responsibility**: Each method performs one clear operation
- **Consistent Returns**: Methods return consistent data structures

### Error Handling Standards

- **Typed Errors**: Use specific error classes (ReleaseError, GitError, etc.)
- **Error Context**: Include operation name and debugging details
- **Fatal vs Non-Fatal**: Distinguish between blocking and non-blocking errors
- **Consistent Patterns**: Follow established error handling patterns exactly

### Service Layer Requirements

- **Stateless Design**: Services maintain no instance state
- **Constructor Injection**: Dependencies injected via constructor
- **Alphabetical Methods**: All methods ordered alphabetically after constructor
- **Parameter Objects**: Methods accept parameter objects for flexibility

### Git Operations Pattern

- **Signed Commits**: All file updates use GraphQL signed commit pattern
- **File Tracking**: Track modified files for atomic commits
- **Branch Operations**: Fetch and switch to correct branches before operations
- **Error Isolation**: Individual file errors don't block entire operations

## GitHub API Integration

The system provides comprehensive GitHub API integration through specialized services:

### REST API Service

Handles standard CRUD operations, file uploads, and repository management. Uses parameter objects for all methods and provides consistent error handling with proper GitHub API error translation.

### GraphQL API Service

Manages complex queries, signed commits, and advanced repository operations. Includes pagination support for large result sets and batch operations for efficiency.

### API Usage Patterns

- **REST for Simple Operations**: Basic CRUD, uploads, standard repository operations
- **GraphQL for Complex Operations**: Signed commits, complex queries, batch operations
- **Consistent Parameters**: All methods use parameter objects with owner/repo/additional params
- **Error Translation**: GitHub API errors translated to typed application errors
- **Rate Limit Handling**: Built-in handling for GitHub API rate limits and retry logic

### Release Management Integration

Specialized services handle GitHub releases, OCI package management, and chart publishing with automatic cleanup and error recovery. The system supports both traditional Helm repositories and OCI registries.

## Configuration System

The Configuration system provides a centralized way to manage settings with support for:

- Dot notation access to nested values
- Environment variable integration
- Configuration validation
- Value caching for performance

### Usage

```javascript
// Import the singleton configuration instance
const config = require('../config');

// Access configuration values with dot notation
const repoUrl = config.get('repository.url');
const defaultValue = config.get('some.missing.path', 'default value');
```

### Environment Variables

Environment variables that start with `ENV_CONFIG_` will be automatically loaded:

- `ENV_CONFIG_REPOSITORY_URL` → `repository.url`
- `ENV_CONFIG_WORKFLOW_LABELS` → `workflow.labels`

Values are automatically converted to appropriate types:

- `"true"` and `"false"` become boolean values
- Numeric strings become numbers
- Other values remain as strings

## Base Action Class

The Action class provides a foundation for building GitHub Actions with:

- Dependency injection for GitHub Actions context objects
- Standardized lifecycle hooks
- Integrated error handling
- Common utility methods

### Lifecycle Hooks

The Action class provides several hooks to customize behavior:

1. `beforeInitialize()` - Runs before initialization
2. `afterInitialize()` - Runs after initialization
3. `beforeExecute()` - Runs before the main execution
4. `run()` - Main action implementation (must be overridden)
5. `afterExecute(result)` - Runs after execution with the result

## Error Handling

The Error handling system provides standardized error management:

- Consistent error formatting
- GitHub annotations for file-related errors
- Error categorization (fatal vs. non-fatal)
- Stack trace preservation

### Error Classes

The system uses typed error classes for different domains:

- **AppError**: Base error class for all application errors
- **ReleaseError**: Release and publishing operation errors  
- **GitError**: Git operation and repository errors
- **GitHubApiError**: GitHub API communication errors
- **HelmError**: Helm CLI and chart operation errors
- **FileError**: File system operation errors

### Error Context

All errors include contextual information for debugging:
- Operation name and description
- File paths and line numbers (when applicable)
- Original error details and stack traces
- Severity level (fatal vs non-fatal)

### Error Handling Patterns

Services use consistent error handling patterns with proper context preservation and GitHub Actions integration for annotations and workflow failure management.
