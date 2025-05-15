# Migration: _generateFrontpage

## Current Implementation
- Location: release.js - _generateFrontpage()
- Purpose: Generates repository index frontpage
- Dependencies: fs, path, yaml, config, utils, context
- Used by: setupBuildEnvironment

## Code Analysis

The current `_generateFrontpage` function:
1. Scans all application and library directories to find valid charts
2. Extracts metadata from each chart's Chart.yaml file
3. Builds a structured index object with entries for each chart
4. Generates the index.yaml file for Helm repository consumption
5. Creates a markdown index page using the Handlebars template

This function creates the main landing page for the GitHub Pages site.

## Target Architecture
- Target Class: PageService
- Target Method: generateFrontpage
- New Dependencies: ChartService, FileService, TemplateService

## Implementation Steps

### Phase 1: Create PageService Class
```javascript
// services/PageService.js
const Action = require('../core/Action');
const yaml = require('js-yaml');
const path = require('path');

class PageService extends Action {
  constructor(context) {
    super(context);
    this.chartService = new ChartService(context);
    this.fileService = new FileService(context);
    this.templateService = new TemplateService(context);
  }

  async generateFrontpage() {
    try {
      const chartDirs = await this.chartService.findCharts();
      const chartEntries = await this.collectChartEntries(chartDirs);
      const index = this.createRepositoryIndex(chartEntries);
      const content = await this.renderFrontpageContent(index);
      await this.fileService.writeFile('./index.md', content);
      this.logger.info(`Successfully generated frontpage content with ${content.length} bytes`);
      return true;
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'generate frontpage content',
        fatal: true
      });
    }
  }

  async collectChartEntries(chartDirs) {
    const chartEntries = {};
    const allChartDirs = [...chartDirs.application, ...chartDirs.library];
    await Promise.all(allChartDirs.map(async (chartDir) => {
      try {
        const entry = await this.extractChartEntry(chartDir);
        if (entry) {
          chartEntries[entry.name] = entry.data;
        }
      } catch (error) {
        this.errorHandler.handle(error, {
          operation: `read chart metadata for ${chartDir} directory`,
          fatal: false
        });
      }
    }));
    return chartEntries;
  }

  async extractChartEntry(chartDir) {
    const chartName = path.basename(chartDir);
    const config = this.config.get();
    const appType = config.repository.chart.type.application;
    const chartType = chartDir.startsWith(appType) ? 'application' : 'library';
    const chartYamlPath = path.join(chartDir, 'Chart.yaml');
    const chartContent = await this.fileService.readFile(chartYamlPath);
    const chartYaml = yaml.load(chartContent);
    return {
      name: chartName,
      data: {
        description: chartYaml.description || '',
        type: chartType,
        version: chartYaml.version || ''
      }
    };
  }

  createRepositoryIndex(chartEntries) {
    return {
      apiVersion: 'v1',
      entries: chartEntries,
      generated: new Date().toISOString()
    };
  }

  async renderFrontpageContent(index) {
    const config = this.config.get();
    const template = await this.fileService.readFile(config.theme.frontpage.template);
    const repoUrl = this.context.payload.repository.html_url;
    const defaultBranch = this.context.payload.repository.default_branch;
    const charts = this.formatChartsForTemplate(index.entries);
    const templateContext = {
      Charts: charts,
      RepoURL: repoUrl,
      Branch: defaultBranch
    };
    return this.templateService.renderTemplate(template, templateContext);
  }

  formatChartsForTemplate(entries) {
    return Object.entries(entries)
      .sort(([sourceName, sourceData], [targetName, targetData]) => {
        return sourceData.type.localeCompare(targetData.type) || sourceName.localeCompare(targetName);
      })
      .map(([name, data]) => {
        if (!data) return null;
        return {
          Description: data.description || '',
          Name: name,
          Type: data.type || 'application',
          Version: data.version || ''
        };
      })
      .filter(Boolean);
  }
}

module.exports = PageService;
```

### Phase 2: Update Backward Compatibility
```javascript
// release.js
const PageService = require('./.github/actions/services/PageService');
let pageServiceInstance;

/**
 * Generates repository index frontpage
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @returns {Promise<boolean>} - True if successfully generated, false otherwise
 */
async function _generateFrontpage({ context, core }) {
  if (!pageServiceInstance) {
    pageServiceInstance = new PageService({ context, core });
  }
  return pageServiceInstance.generateFrontpage();
}

module.exports = {
  _generateFrontpage,
  // ... other functions
};
```

## Testing Strategy

### 1. Unit Tests
```javascript
// tests/services/PageService.test.js
const PageService = require('../../.github/actions/services/PageService');

describe('PageService', () => {
  let service;
  let mockContext;

  beforeEach(() => {
    mockContext = {
      context: mockActionContext(),
      core: mockCore(),
      chartService: mockChartService(),
      fileService: mockFileService(),
      templateService: mockTemplateService()
    };
    service = new PageService(mockContext);
  });

  describe('generateFrontpage', () => {
    test('should generate frontpage successfully', async () => {
      const chartDirs = {
        application: ['application/nginx'],
        library: ['library/common']
      };
      mockContext.chartService.findCharts.mockResolvedValue(chartDirs);
      mockContext.fileService.readFile.mockImplementation(path => {
        if (path.endsWith('Chart.yaml')) {
          return 'name: nginx\nversion: 1.2.3\ndescription: Web server';
        }
        return 'Template content';
      });
      mockContext.templateService.renderTemplate.mockReturnValue('Rendered content');
      
      const result = await service.generateFrontpage();
      
      expect(result).toBe(true);
      expect(mockContext.fileService.writeFile).toHaveBeenCalledWith('./index.md', 'Rendered content');
    });

    test('should handle errors in chart metadata collection', async () => {
      const chartDirs = {
        application: ['application/broken'],
        library: []
      };
      mockContext.chartService.findCharts.mockResolvedValue(chartDirs);
      mockContext.fileService.readFile.mockRejectedValue(new Error('File not found'));
      
      await service.generateFrontpage();
      
      expect(mockContext.errorHandler.handle).toHaveBeenCalled();
    });
  });

  describe('extractChartEntry', () => {
    test('should extract chart entry correctly', async () => {
      const chartDir = 'application/nginx';
      mockContext.fileService.readFile.mockResolvedValue('name: nginx\nversion: 1.2.3\ndescription: Web server');
      
      const entry = await service.extractChartEntry(chartDir);
      
      expect(entry).toEqual({
        name: 'nginx',
        data: {
          description: 'Web server',
          type: 'application',
          version: '1.2.3'
        }
      });
    });

    test('should handle library charts', async () => {
      const chartDir = 'library/common';
      mockContext.fileService.readFile.mockResolvedValue('name: common\nversion: 0.1.0');
      
      const entry = await service.extractChartEntry(chartDir);
      
      expect(entry.data.type).toBe('library');
    });
  });

  describe('formatChartsForTemplate', () => {
    test('should format and sort charts correctly', () => {
      const entries = {
        redis: { type: 'application', version: '6.2.5', description: 'Redis cache' },
        nginx: { type: 'application', version: '1.2.3', description: 'Web server' },
        common: { type: 'library', version: '0.1.0', description: 'Common charts' }
      };
      
      const formatted = service.formatChartsForTemplate(entries);
      
      expect(formatted).toEqual([
        { Name: 'nginx', Type: 'application', Version: '1.2.3', Description: 'Web server' },
        { Name: 'redis', Type: 'application', Version: '6.2.5', Description: 'Redis cache' },
        { Name: 'common', Type: 'library', Version: '0.1.0', Description: 'Common charts' }
      ]);
    });

    test('should handle missing data gracefully', () => {
      const entries = {
        minimal: { type: 'application' },
        empty: null
      };
      
      const formatted = service.formatChartsForTemplate(entries);
      
      expect(formatted).toEqual([
        { Name: 'minimal', Type: 'application', Version: '', Description: '' }
      ]);
    });
  });

  describe('createRepositoryIndex', () => {
    test('should create valid repository index', () => {
      const chartEntries = {
        nginx: { version: '1.2.3' }
      };
      
      const index = service.createRepositoryIndex(chartEntries);
      
      expect(index).toMatchObject({
        apiVersion: 'v1',
        entries: chartEntries,
        generated: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
      });
    });
  });
});
```

### 2. Integration Tests
```javascript
// tests/integration/frontpage-generation.test.js
describe('Frontpage Generation Integration', () => {
  test('should generate complete frontpage with all charts', async () => {
    const service = new PageService(mockContext);
    mockFilesystem({
      'application/nginx/Chart.yaml': 'name: nginx\nversion: 1.2.3\ndescription: NGINX web server',
      'library/common/Chart.yaml': 'name: common\nversion: 0.1.0\ndescription: Common library charts'
    });
    const template = `
# Helm Repository

{{#each Charts}}
- {{Name}} ({{Type}}): {{Description}} - v{{Version}}
{{/each}}
    `;
    mockContext.fileService.readFile.mockImplementation(path => {
      if (path.includes('template')) return template;
      return fs.readFileSync(path, 'utf8');
    });
    
    await service.generateFrontpage();
    
    const content = mockContext.fileService.writeFile.mock.calls[0][1];
    expect(content).toContain('nginx');
    expect(content).toContain('common');
    expect(content).toContain('application');
    expect(content).toContain('library');
  });
});
```

### 3. Template Context Tests
```javascript
// tests/services/PageService.template.test.js
describe('PageService Template Context', () => {
  test('should build correct template context', async () => {
    const service = new PageService(mockContext);
    const index = {
      entries: {
        nginx: { type: 'application', version: '1.2.3' }
      }
    };
    
    const content = await service.renderFrontpageContent(index);
    
    expect(mockContext.templateService.renderTemplate).toHaveBeenCalledWith(
      expect.any(String),
      {
        Charts: expect.arrayContaining([
          expect.objectContaining({ Name: 'nginx' })
        ]),
        RepoURL: 'https://github.com/owner/repo',
        Branch: 'main'
      }
    );
  });
});
```

## Migration Order

1. Create new PageService class
2. Extract chart collection logic
3. Implement template rendering
4. Add sorting and formatting methods
5. Update backward compatibility

## Code Examples

### Before (Procedural)
```javascript
async function _generateFrontpage({ context, core }) {
  try {
    const chartDirs = await utils.findCharts({ core });
    const chartEntries = {};
    const allChartDirs = [...chartDirs.application, ...chartDirs.library];
    await Promise.all(allChartDirs.map(async (chartDir) => {
      try {
        const chartName = path.basename(chartDir);
        const chartType = chartDir.startsWith(config('repository').chart.type.application) ? 'application' : 'library';
        // ... more code
      } catch (error) {
        utils.handleError(error, core, `read chart metadata for ${chartDir} directory`, false);
      }
    }));
    // ... more code
  } catch (error) {
    utils.handleError(error, core, 'generate frontpage content');
  }
}
```

### After (Object-Oriented)
```javascript
class PageService extends Action {
  async generateFrontpage() {
    try {
      const chartDirs = await this.chartService.findCharts();
      const chartEntries = await this.collectChartEntries(chartDirs);
      const index = this.createRepositoryIndex(chartEntries);
      const content = await this.renderFrontpageContent(index);
      await this.fileService.writeFile('./index.md', content);
      this.logger.info(`Successfully generated frontpage content with ${content.length} bytes`);
      return true;
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'generate frontpage content',
        fatal: true
      });
    }
  }
}
```

## Dependencies to Address

- External: context, core, fs, path, yaml
- Internal: utils, config
- New: ChartService, FileService, TemplateService

## Risks and Mitigation

1. **Risk**: Chart metadata parsing errors
   - **Mitigation**: Continue processing other charts on individual failures

2. **Risk**: Template rendering failures
   - **Mitigation**: Validate template context before rendering

3. **Risk**: Sorting algorithm complexity
   - **Mitigation**: Use simple, tested sort logic

## Notes

- This function generates the main landing page for the repository
- The sorting logic ensures consistent ordering (library charts first, then alphabetically)
- Error handling allows partial success when reading individual charts
- The template context needs to match the expected Handlebars template structure
