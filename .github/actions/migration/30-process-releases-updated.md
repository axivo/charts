# Migration: processReleases

## Current Implementation
- Location: release.js - processReleases()
- Purpose: Handles the complete Helm chart release process including packaging, GitHub releases, and OCI publishing
- Dependencies: External (github, context, core, exec), internal functions, utils, config, github-api
- Used by: release.yml workflow

## Code Analysis

The current `processReleases` function:
1. Gets updated files from GitHub API to identify modified charts
2. Finds affected charts and identifies deleted charts
3. Packages the modified charts using Helm CLI
4. Publishes chart releases to GitHub with assets
5. Optionally publishes charts to OCI registry
6. Handles errors gracefully during all operations

This function orchestrates several internal helper functions:
- `_packageCharts`: Creates package directory structure and packages charts
- `_publishChartReleases`: Creates GitHub releases for packaged charts
- `_publishOciReleases`: Publishes charts to OCI registry (optional)

## Target Architecture

Following the same design patterns established in Phase 3.1:

### Handler Class
- Target Class: `handlers/Release.js` - Main orchestrator for release operations
- Target Methods: `process()`, `run()`, auxiliary helper methods

### Service Classes
- `services/release/index.js` - Core release service functionality
- `services/release/Publish.js` - Specialized service for publishing releases
- `services/release/Package.js` - Specialized service for packaging charts

This follows the same pattern we established with:
- `services/chart/index.js` - Core chart service functionality
- `services/chart/Update.js` - Specialized service for updating charts

## Implementation Strategy

### 1. Create Release Service Structure

```
services/
└── release/
    ├── index.js         # Core release functionality (find, validate)
    ├── Package.js       # Specialized service for packaging
    └── Publish.js       # Specialized service for publishing (GitHub, OCI)
```

### 2. Create Release Handler

```
handlers/
└── Release.js           # Main orchestrator for release operations
```

### 3. Update Handler Index

```
handlers/
├── index.js             # Update to include Release handler
├── Chart.js             # Existing chart handler
└── Release.js           # New release handler
```

## Implementation Details

### Release Service (services/release/index.js)

The main Release service will handle core functionality:

```javascript
/**
 * Release service for managing chart releases
 * 
 * @class Release
 * @module services/release
 * @author AXIVO
 * @license BSD-3-Clause
 */
const path = require('path');
const Action = require('../../core/Action');
const Package = require('./Package');
const Publish = require('./Publish');

class Release extends Action {
  /**
   * Finds release-eligible charts based on file changes
   * 
   * @param {Array<string>} files - List of changed files
   * @returns {Promise<Object>} - Object containing eligible charts and deleted charts
   */
  async find(files) {
    // Implementation to find charts that need to be released
  }
  
  /**
   * Validates a chart for release eligibility
   * 
   * @param {string} chartDir - Chart directory
   * @returns {Promise<boolean>} - True if chart is eligible for release
   */
  async validate(chartDir) {
    // Implementation to validate if chart can be released
  }
  
  // Other core release functionality
}

// Attach specialized services
Release.Package = Package;
Release.Publish = Publish;

module.exports = Release;
```

### Package Service (services/release/Package.js)

Specializes in packaging charts:

```javascript
/**
 * Chart packaging service
 * 
 * @class Package
 * @module services/release/Package
 * @author AXIVO
 * @license BSD-3-Clause
 */
const path = require('path');
const Action = require('../../core/Action');

class Package extends Action {
  /**
   * Creates a new Package service instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    const File = require('../File');
    const Helm = require('../Helm');
    this.fileService = new File(params);
    this.helmService = new Helm(params);
  }
  
  /**
   * Packages multiple charts
   * 
   * @param {Array<string>} charts - Chart directories to package
   * @returns {Promise<Array>} - List of packaged charts
   */
  async charts(charts) {
    // Implementation to package multiple charts
  }
  
  /**
   * Creates package directory structure
   * 
   * @returns {Promise<string>} - Path to package directory
   */
  async createDirectories() {
    // Implementation to create package directories
  }
}

module.exports = Package;
```

### Publish Service (services/release/Publish.js)

Specializes in publishing releases:

```javascript
/**
 * Release publishing service
 * 
 * @class Publish
 * @module services/release/Publish
 * @author AXIVO
 * @license BSD-3-Clause
 */
const path = require('path');
const Action = require('../../core/Action');

class Publish extends Action {
  /**
   * Creates a new Publish service instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    const File = require('../File');
    const { Rest, GraphQL } = require('../github');
    this.fileService = new File(params);
    this.restService = new Rest(params);
    this.graphqlService = new GraphQL(params);
  }
  
  /**
   * Publishes charts to GitHub
   * 
   * @param {Array<Object>} charts - Charts to publish
   * @returns {Promise<Array>} - Published releases
   */
  async github(charts) {
    // Implementation to publish to GitHub
  }
  
  /**
   * Publishes charts to OCI registry
   * 
   * @param {Array<Object>} charts - Charts to publish
   * @returns {Promise<Array>} - Published OCI packages
   */
  async oci(charts) {
    // Implementation to publish to OCI
  }
  
  /**
   * Generates release content
   * 
   * @param {Object} chart - Chart information
   * @returns {Promise<string>} - Generated release content
   */
  async generateContent(chart) {
    // Implementation to generate release content/notes
  }
}

module.exports = Publish;
```

### Release Handler (handlers/Release.js)

Main orchestrator:

```javascript
/**
 * Release handler for release operations
 * 
 * @class Release
 * @module handlers/Release
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Action = require('../core/Action');
const Release = require('../services/release');
const File = require('../services/File');
const Git = require('../services/Git');
const { Rest } = require('../services/github');

class ReleaseHandler extends Action {
  /**
   * Creates a new Release handler instance
   * 
   * @param {Object} params - Handler parameters
   */
  constructor(params) {
    super(params);
    this.releaseService = new Release(params);
    this.fileService = new File(params);
    this.gitService = new Git(params);
    this.githubService = new Rest(params);
    this.packageService = new Release.Package(params);
    this.publishService = new Release.Publish(params);
  }
  
  /**
   * Main process method for releases
   * 
   * @returns {Promise<Object>} - Release results
   */
  async process() {
    try {
      // Implementation orchestrating release process
      const files = Object.keys(await this.githubService.getUpdatedFiles({ context: this.github.context }));
      const charts = await this.releaseService.find(files);
      
      // Package charts
      const packages = await this.packageService.charts(charts.modified);
      
      // Publish to GitHub
      await this.publishService.github(packages);
      
      // Publish to OCI if enabled
      if (this.config.get('repository.oci.enabled')) {
        await this.publishService.oci(packages);
      }
      
      return { charts: charts.total, published: packages.length };
    } catch (error) {
      throw this.errorHandler.handle(error, { operation: 'process releases' });
    }
  }
  
  /**
   * Required run method
   * 
   * @returns {Promise<Object>} - Process results
   */
  async run() {
    return this.process();
  }
}

module.exports = ReleaseHandler;
```

## Migration Impact
- Better orchestration and error handling
- Parallel processing with Promise.all
- Clear separation of concerns:
  - Release service for core functionality
  - Package service for packaging operations
  - Publish service for publishing operations
- Consistent with the architecture established in Phase 3.1

## Testing Strategy
1. Unit test each service independently
2. Integration test the handler with mock services
3. Compare outputs with the original implementation
4. Verify error handling behavior

## Success Criteria
- [ ] All release functionality properly migrated
- [ ] Proper use of services for separation of concerns
- [ ] Error handling consistent with architecture
- [ ] Performance improved with parallel execution
- [ ] Backward compatibility maintained
