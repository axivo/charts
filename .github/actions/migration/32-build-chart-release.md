# Migration: _buildChartRelease

## Current Implementation
- Location: release.js - _buildChartRelease()
- Purpose: Creates a GitHub release for a single chart and uploads the chart package as an asset
- Dependencies: api.getReleaseByTag, api.createRelease, api.uploadReleaseAsset, _generateChartRelease (internal), config, utils, fs
- Used by: _publishChartReleases

## Code Analysis

The current `_buildChartRelease` function is a private function that:
1. Generates a tag name using templated pattern from configuration
2. Checks if a release with this tag already exists
3. Generates release content using chart metadata
4. Creates the GitHub release via API
5. Uploads the packaged chart file (.tgz) as a release asset
6. Handles errors as non-fatal to allow other charts to be released

This function encapsulates the entire release creation process for a single chart.

## Target Architecture
- Target Class: ReleaseService (already exists in processReleases migration)
- Target Method: createChartRelease
- New Dependencies: GitHubService, TemplateService, FileService

## Implementation Steps

The ReleaseService was already partially implemented in the processReleases migration. This migration will complete the implementation with proper separation of concerns.

### Phase 1: Enhance ReleaseService Class
```javascript
// services/ReleaseService.js
const Action = require('../core/Action');
const yaml = require('js-yaml');
const path = require('path');

class ReleaseService extends Action {
  constructor(context) {
    super(context);
    this.githubService = new GitHubService(context);
    this.templateService = new TemplateService(context);
  }

  async createChartRelease(chart) {
    try {
      const tagName = this.generateTagName(chart.name, chart.version);
      this.logger.info(`Processing '${tagName}' repository release...`);
      const existingRelease = await this.githubService.getReleaseByTag(tagName);
      if (existingRelease) {
        this.logger.info(`Release '${tagName}' already exists, skipping`);
        return;
      }
      const body = await this.generateReleaseContent(chart);
      const release = await this.githubService.createRelease({
        name: tagName,
        body
      });
      await this.uploadChartAsset(release.id, chart);
      this.logger.info(`Successfully created '${tagName}' repository release`);
    } catch (error) {
      const tagName = this.generateTagName(chart.name, chart.version);
      this.errorHandler.handle(error, {
        operation: `create '${tagName}' repository release`,
        fatal: false
      });
    }
  }

  generateTagName(name, version) {
    const config = this.config.get();
    return config.repository.release.title
      .replace('{{ .Name }}', name)
      .replace('{{ .Version }}', version);
  }

  async uploadChartAsset(releaseId, chart) {
    const assetName = [chart.type, 'tgz'].join('.');
    const assetData = await this.fileService.readFile(chart.path);
    await this.githubService.uploadReleaseAsset({
      releaseId,
      assetName,
      assetData
    });
  }

  async generateReleaseContent(chart) {
    try {
      this.logger.info(`Generating repository release content for '${chart.type}/${chart.name}' chart...`);
      const config = this.config.get();
      const releaseTemplate = config.repository.release.template;
      try {
        await this.fileService.access(releaseTemplate);
      } catch (accessError) {
        this.errorHandler.handle(accessError, {
          operation: `find ${releaseTemplate} template`,
          fatal: false
        });
      }
      const templateContent = await this.fileService.readFile(releaseTemplate);
      const issues = await this.githubService.getReleaseIssues(chart);
      const tagName = this.generateTagName(chart.name, chart.version);
      const templateContext = this.buildTemplateContext(chart, tagName, issues);
      return this.templateService.renderTemplate(templateContent, templateContext);
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'generate chart release',
        fatal: false
      });
      throw error;
    }
  }

  buildTemplateContext(chart, tagName, issues) {
    const config = this.config.get();
    const repoUrl = this.context.payload.repository.html_url;
    return {
      AppVersion: chart.metadata.appVersion || '',
      Branch: this.context.payload.repository.default_branch,
      Dependencies: (chart.metadata.dependencies || []).map(dependency => ({
        Name: dependency.name,
        Repository: dependency.repository,
        Source: [repoUrl, 'blob', tagName, chart.type, chart.name, 'Chart.yaml'].join('/'),
        Version: dependency.version
      })),
      Description: chart.metadata.description || '',
      Icon: chart.icon ? config.repository.chart.icon : null,
      Issues: issues.length ? issues : null,
      KubeVersion: chart.metadata.kubeVersion || '',
      Name: chart.name,
      RepoURL: repoUrl,
      Type: chart.type,
      Version: chart.version
    };
  }
}

module.exports = ReleaseService;
```

### Phase 2: Update Backward Compatibility
```javascript
// release.js
const ReleaseService = require('./.github/actions/services/ReleaseService');
let releaseServiceInstance;

/**
 * Builds a GitHub release for a single chart and uploads the chart package as an asset
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context
 * @param {Object} params.core - GitHub Actions Core API
 * @param {Object} params.chart - Chart object containing all chart information
 * @returns {Promise<void>}
 */
async function _buildChartRelease({ github, context, core, chart }) {
  if (!releaseServiceInstance) {
    releaseServiceInstance = new ReleaseService({ github, context, core });
  }
  return releaseServiceInstance.createChartRelease(chart);
}

module.exports = {
  _buildChartRelease,
  // ... other functions
};
```

## Testing Strategy

### 1. Unit Tests
```javascript
// tests/services/ReleaseService.test.js
const ReleaseService = require('../../.github/actions/services/ReleaseService');

describe('ReleaseService', () => {
  let service;
  let mockContext;

  beforeEach(() => {
    mockContext = {
      github: mockGitHub(),
      context: mockActionContext(),
      core: mockCore()
    };
    service = new ReleaseService(mockContext);
  });

  describe('createChartRelease', () => {
    const chart = {
      name: 'nginx',
      version: '1.2.3',
      type: 'application',
      path: '/path/to/nginx-1.2.3.tgz',
      metadata: {
        description: 'NGINX web server'
      }
    };

    test('should create release when it does not exist', async () => {
      mockContext.github.getReleaseByTag.mockResolvedValue(null);
      mockContext.github.createRelease.mockResolvedValue({ id: 123 });
      
      await service.createChartRelease(chart);
      
      expect(mockContext.github.createRelease).toHaveBeenCalled();
      expect(mockContext.github.uploadReleaseAsset).toHaveBeenCalled();
    });

    test('should skip when release already exists', async () => {
      mockContext.github.getReleaseByTag.mockResolvedValue({ id: 123 });
      
      await service.createChartRelease(chart);
      
      expect(mockContext.github.createRelease).not.toHaveBeenCalled();
    });

    test('should handle errors as non-fatal', async () => {
      mockContext.github.getReleaseByTag.mockRejectedValue(new Error('API error'));
      
      await service.createChartRelease(chart);
      
      expect(mockContext.errorHandler.handle).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ fatal: false })
      );
    });
  });

  describe('generateTagName', () => {
    test('should generate correct tag name', () => {
      mockContext.config.repository.release.title = '{{ .Name }}-{{ .Version }}';
      
      const tagName = service.generateTagName('nginx', '1.2.3');
      
      expect(tagName).toBe('nginx-1.2.3');
    });
  });
});
```

### 2. Integration Tests
```javascript
// tests/integration/release-creation.test.js
describe('Release Creation Integration', () => {
  test('should create release with all components', async () => {
    const service = new ReleaseService(mockContext);
    const chart = {
      name: 'nginx',
      version: '1.2.3',
      type: 'application',
      path: '/tmp/nginx-1.2.3.tgz',
      metadata: {
        description: 'NGINX web server',
        dependencies: [{
          name: 'common',
          version: '0.1.0',
          repository: 'https://example.com'
        }]
      }
    };
    
    await service.createChartRelease(chart);
    
    expect(mockGitHub.createRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('NGINX web server')
      })
    );
  });
});
```

### 3. Template Rendering Tests
```javascript
// tests/services/ReleaseService.template.test.js
describe('ReleaseService Template Rendering', () => {
  test('should build correct template context', () => {
    const service = new ReleaseService(mockContext);
    const chart = {
      name: 'nginx',
      version: '1.2.3',
      type: 'application',
      metadata: {
        appVersion: '1.21.0',
        dependencies: []
      }
    };
    
    const context = service.buildTemplateContext(chart, 'nginx-1.2.3', []);
    
    expect(context).toEqual({
      AppVersion: '1.21.0',
      Name: 'nginx',
      Version: '1.2.3',
      Type: 'application',
      // ... other expected properties
    });
  });
});
```

## Migration Order

Since ReleaseService was partially created in the processReleases migration:
1. Enhance existing ReleaseService with complete implementation
2. Extract helper methods (generateTagName, uploadChartAsset, buildTemplateContext)
3. Update backward compatibility in release.js

## Code Examples

### Before (Procedural)
```javascript
async function _buildChartRelease({ github, context, core, chart }) {
  try {
    const tagName = config('repository').release.title
      .replace('{{ .Name }}', chart.name)
      .replace('{{ .Version }}', chart.version);
    core.info(`Processing '${tagName}' repository release...`);
    const existingRelease = await api.getReleaseByTag({ github, context, core, tagName });
    if (existingRelease) {
      core.info(`Release '${tagName}' already exists, skipping`);
      return;
    }
    // ... more code
  } catch (error) {
    utils.handleError(error, core, `create '${tagName}' repository release`, false);
  }
}
```

### After (Object-Oriented)
```javascript
class ReleaseService extends Action {
  async createChartRelease(chart) {
    try {
      const tagName = this.generateTagName(chart.name, chart.version);
      this.logger.info(`Processing '${tagName}' repository release...`);
      const existingRelease = await this.githubService.getReleaseByTag(tagName);
      if (existingRelease) {
        this.logger.info(`Release '${tagName}' already exists, skipping`);
        return;
      }
      // ... cleaner, more maintainable code
    } catch (error) {
      const tagName = this.generateTagName(chart.name, chart.version);
      this.errorHandler.handle(error, {
        operation: `create '${tagName}' repository release`,
        fatal: false
      });
    }
  }
}
```

## Dependencies to Address

- External: github, context, core, fs
- Internal: config, utils, api, _generateChartRelease
- New: GitHubService, TemplateService, FileService

## Risks and Mitigation

1. **Risk**: Tag name generation consistency
   - **Mitigation**: Extract to dedicated method with tests

2. **Risk**: Template rendering complexity
   - **Mitigation**: Separate template context building from rendering

3. **Risk**: Asset upload failure handling
   - **Mitigation**: Maintain non-fatal error handling pattern

## Notes

- This function is already partially migrated as part of ReleaseService
- The non-fatal error handling is crucial for batch processing
- Template rendering should be delegated to TemplateService
- GitHub API calls should be delegated to GitHubService
