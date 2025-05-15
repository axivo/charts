# Migration: _generateChartRelease

## Current Implementation
- Location: release.js - _generateChartRelease()
- Purpose: Generates release content using the template file
- Dependencies: fs, config, utils, api, context
- Used by: _buildChartRelease

## Code Analysis

The current `_generateChartRelease` function:
1. Loads a release template file specified in configuration
2. Fetches related issues for the chart via GitHub API
3. Builds a comprehensive template context with chart metadata
4. Renders the template using Handlebars to create release notes

This function is responsible for creating properly formatted release notes with all relevant chart information.

## Target Architecture
- Target Class: ReleaseService (existing)
- Target Method: generateReleaseContent
- New Dependencies: TemplateService, GitHubService

## Implementation Steps

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
    this.fileService = new FileService(context);
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

  generateTagName(name, version) {
    const config = this.config.get();
    return config.repository.release.title
      .replace('{{ .Name }}', name)
      .replace('{{ .Version }}', version);
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
 * Generates release content using the template file
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {Object} params.chart - Chart object containing all chart information
 * @returns {Promise<string>} - Generated release content in markdown format
 */
async function _generateChartRelease({ github, context, core, chart }) {
  if (!releaseServiceInstance) {
    releaseServiceInstance = new ReleaseService({ github, context, core });
  }
  return releaseServiceInstance.generateReleaseContent(chart);
}

module.exports = {
  _generateChartRelease,
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

  describe('generateReleaseContent', () => {
    const chart = {
      name: 'nginx',
      version: '1.2.3',
      type: 'application',
      icon: true,
      metadata: {
        description: 'NGINX web server',
        appVersion: '1.21.0',
        kubeVersion: '>=1.19.0',
        dependencies: [{
          name: 'common',
          version: '0.1.0',
          repository: 'https://example.com'
        }]
      }
    };

    test('should generate release content with template', async () => {
      const templateContent = '# {{Name}} v{{Version}}\n{{Description}}';
      const issues = [{ number: 123, title: 'Fix bug' }];
      mockContext.fileService.readFile.mockResolvedValue(templateContent);
      mockContext.githubService.getReleaseIssues.mockResolvedValue(issues);
      mockContext.templateService.renderTemplate.mockReturnValue('# nginx v1.2.3\nNGINX web server');
      
      const result = await service.generateReleaseContent(chart);
      
      expect(result).toBe('# nginx v1.2.3\nNGINX web server');
    });

    test('should handle missing template file gracefully', async () => {
      mockContext.fileService.access.mockRejectedValue(new Error('File not found'));
      mockContext.fileService.readFile.mockResolvedValue('Default template');
      
      await service.generateReleaseContent(chart);
      
      expect(mockContext.errorHandler.handle).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ fatal: false })
      );
    });

    test('should handle empty issues array', async () => {
      mockContext.githubService.getReleaseIssues.mockResolvedValue([]);
      mockContext.fileService.readFile.mockResolvedValue('{{#if Issues}}...{{/if}}');
      
      const result = await service.generateReleaseContent(chart);
      
      const context = mockContext.templateService.renderTemplate.mock.calls[0][1];
      expect(context.Issues).toBeNull();
    });
  });

  describe('buildTemplateContext', () => {
    test('should build complete template context', () => {
      const chart = {
        name: 'nginx',
        version: '1.2.3',
        type: 'application',
        icon: true,
        metadata: {
          appVersion: '1.21.0',
          dependencies: [{
            name: 'common',
            version: '0.1.0',
            repository: 'https://example.com'
          }]
        }
      };
      const issues = [{ number: 123 }];
      
      const context = service.buildTemplateContext(chart, 'nginx-1.2.3', issues);
      
      expect(context).toMatchObject({
        Name: 'nginx',
        Version: '1.2.3',
        Type: 'application',
        AppVersion: '1.21.0',
        Dependencies: expect.arrayContaining([
          expect.objectContaining({
            Name: 'common',
            Version: '0.1.0'
          })
        ]),
        Issues: issues
      });
    });

    test('should handle missing metadata gracefully', () => {
      const chart = {
        name: 'minimal',
        version: '0.1.0',
        type: 'library',
        icon: false,
        metadata: {}
      };
      
      const context = service.buildTemplateContext(chart, 'minimal-0.1.0', []);
      
      expect(context).toMatchObject({
        AppVersion: '',
        Description: '',
        Dependencies: [],
        Issues: null,
        KubeVersion: ''
      });
    });
  });

  describe('generateTagName', () => {
    test('should generate tag name from template', () => {
      mockContext.config.repository.release.title = '{{ .Name }}-{{ .Version }}';
      
      const tagName = service.generateTagName('nginx', '1.2.3');
      
      expect(tagName).toBe('nginx-1.2.3');
    });

    test('should handle custom tag patterns', () => {
      mockContext.config.repository.release.title = 'v{{ .Version }}/{{ .Name }}';
      
      const tagName = service.generateTagName('redis', '6.2.5');
      
      expect(tagName).toBe('v6.2.5/redis');
    });
  });
});
```

### 2. Integration Tests
```javascript
// tests/integration/release-content-generation.test.js
describe('Release Content Generation Integration', () => {
  test('should generate complete release notes', async () => {
    const service = new ReleaseService(mockContext);
    const chart = {
      name: 'nginx',
      version: '1.2.3',
      type: 'application',
      metadata: {
        description: 'NGINX web server',
        dependencies: []
      }
    };
    const template = `
# {{Name}} {{Version}}

{{Description}}

{{#if Dependencies}}
## Dependencies
{{#each Dependencies}}
- {{Name}} {{Version}}
{{/each}}
{{/if}}
    `;
    mockContext.fileService.readFile.mockResolvedValue(template);
    mockContext.githubService.getReleaseIssues.mockResolvedValue([]);
    
    const result = await service.generateReleaseContent(chart);
    
    expect(result).toContain('# nginx 1.2.3');
    expect(result).toContain('NGINX web server');
  });
});
```

### 3. Template Context Tests
```javascript
// tests/services/ReleaseService.context.test.js
describe('ReleaseService Template Context', () => {
  test('should format dependency source URLs correctly', () => {
    const service = new ReleaseService(mockContext);
    const chart = {
      name: 'nginx',
      version: '1.2.3',
      type: 'application',
      metadata: {
        dependencies: [{
          name: 'common',
          version: '0.1.0',
          repository: 'https://example.com'
        }]
      }
    };
    
    const context = service.buildTemplateContext(chart, 'nginx-1.2.3', []);
    
    expect(context.Dependencies[0].Source).toBe(
      'https://github.com/user/repo/blob/nginx-1.2.3/application/nginx/Chart.yaml'
    );
  });

  test('should handle icon configuration correctly', () => {
    const service = new ReleaseService(mockContext);
    mockContext.config.repository.chart.icon = 'icon.png';
    
    const chartWithIcon = { icon: true, name: 'nginx', metadata: {} };
    const chartWithoutIcon = { icon: false, name: 'redis', metadata: {} };
    
    const contextWithIcon = service.buildTemplateContext(chartWithIcon, 'nginx-1.0.0', []);
    const contextWithoutIcon = service.buildTemplateContext(chartWithoutIcon, 'redis-1.0.0', []);
    
    expect(contextWithIcon.Icon).toBe('icon.png');
    expect(contextWithoutIcon.Icon).toBeNull();
  });
});
```

## Migration Order

This function is already partially migrated in the _buildChartRelease migration:
1. Extract generateReleaseContent method from existing implementation
2. Move template context building to dedicated method
3. Ensure proper error handling for template access
4. Update backward compatibility wrapper

## Code Examples

### Before (Procedural)
```javascript
async function _generateChartRelease({ github, context, core, chart }) {
  try {
    core.info(`Generating repository release content for '${chart.type}/${chart.name}' chart...`);
    releaseTemplate = config('repository').release.template;
    try {
      await fs.access(releaseTemplate);
    } catch (accessError) {
      utils.handleError(accessError, core, `find ${releaseTemplate} template`, false);
    }
    const repoUrl = context.payload.repository.html_url;
    const templateContent = await fs.readFile(releaseTemplate, 'utf8');
    // ... more code
  } catch (error) {
    utils.handleError(error, core, 'generate chart release', false);
    throw error;
  }
}
```

### After (Object-Oriented)
```javascript
class ReleaseService extends Action {
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
      // ... cleaner, more maintainable code
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'generate chart release',
        fatal: false
      });
      throw error;
    }
  }
}
```

## Dependencies to Address

- External: github, context, core, fs
- Internal: config, utils, api
- New: TemplateService, GitHubService, FileService

## Risks and Mitigation

1. **Risk**: Template file access failures
   - **Mitigation**: Graceful fallback with error logging

2. **Risk**: Complex template context building
   - **Mitigation**: Separate context building into testable method

3. **Risk**: Issue fetching failures
   - **Mitigation**: Continue with empty issues array

## Notes

- This function is already partially migrated in previous work
- The error handling preserves the throw behavior for caller handling
- Template rendering is delegated to TemplateService
- GitHub API calls are delegated to GitHubService
