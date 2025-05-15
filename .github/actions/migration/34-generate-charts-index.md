# Migration: _generateChartsIndex

## Current Implementation
- Location: release.js - _generateChartIndexes()
- Purpose: Copies pre-built chart index files and generates redirect pages
- Dependencies: utils, fs, path, config
- Used by: _publishChartReleases

## Code Analysis

The current `_generateChartIndexes` function (note: function name is plural in source):
1. Finds all application and library charts
2. Creates output directories in the distribution root
3. Copies metadata.yaml files to index.yaml in each chart directory
4. Generates HTML redirect pages for each chart using Handlebars templates

This function is responsible for creating the Helm repository index structure that allows clients to discover and download charts.

## Target Architecture
- Target Class: ChartService
- Target Method: generateChartIndexes
- New Dependencies: FileService, TemplateService

## Implementation Steps

### Phase 1: Create ChartService Class
```javascript
// services/ChartService.js
const Action = require('../core/Action');
const path = require('path');

class ChartService extends Action {
  constructor(context) {
    super(context);
    this.fileService = new FileService(context);
    this.templateService = new TemplateService(context);
  }

  async generateChartIndexes(distRoot) {
    try {
      this.logger.info('Generating chart indexes...');
      const charts = await this.findCharts();
      const chartDirs = [...charts.application, ...charts.library];
      const results = await Promise.all(chartDirs.map(chartDir => this.generateChartIndex(chartDir, distRoot)));
      const successCount = results.filter(result => result === true).length;
      if (successCount) {
        const word = successCount === 1 ? 'index' : 'indexes';
        this.logger.info(`Successfully generated ${successCount} chart ${word}`);
      }
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'generate charts index',
        fatal: false
      });
    }
  }

  async generateChartIndex(chartDir, distRoot) {
    const chartName = path.basename(chartDir);
    const config = this.config.get();
    const chartType = this.determineChartType(chartDir);
    const outputDir = path.join(distRoot, chartType, chartName);
    try {
      await this.fileService.createDirectory(outputDir);
      const indexPath = path.join(outputDir, 'index.yaml');
      const metadataPath = path.join(chartDir, 'metadata.yaml');
      const metadataExists = await this.fileService.exists(metadataPath);
      if (!metadataExists) {
        return false;
      }
      await this.fileService.copyFile(metadataPath, indexPath);
      this.logger.info(`Successfully generated '${chartType}/${chartName}' chart index`);
      await this.generateRedirectPage(chartType, chartName, outputDir);
      return true;
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: `process '${chartType}/${chartName}' chart`,
        fatal: false
      });
      return false;
    }
  }

  determineChartType(chartDir) {
    const config = this.config.get();
    const appType = config.repository.chart.type.application;
    const libType = config.repository.chart.type.library;
    return chartDir.startsWith(appType) ? appType : libType;
  }

  async generateRedirectPage(chartType, chartName, outputDir) {
    const config = this.config.get();
    const redirectTemplate = config.repository.chart.redirect.template;
    const redirectContent = await this.fileService.readFile(redirectTemplate);
    const repoUrl = config.repository.url;
    const redirectContext = {
      RepoURL: repoUrl,
      Type: chartType,
      Name: chartName
    };
    const redirectHtml = this.templateService.renderTemplate(redirectContent, redirectContext);
    const redirectPath = path.join(outputDir, 'index.html');
    await this.fileService.writeFile(redirectPath, redirectHtml);
  }

  async findCharts(files = null) {
    const config = this.config.get();
    const appType = config.repository.chart.type.application;
    const libType = config.repository.chart.type.library;
    const allCharts = {
      application: [],
      library: [],
      total: 0,
      word: ''
    };
    try {
      const [appDirs, libDirs] = await Promise.all([
        this.findChartDirectories(appType, files),
        this.findChartDirectories(libType, files)
      ]);
      allCharts.application = appDirs;
      allCharts.library = libDirs;
      allCharts.total = appDirs.length + libDirs.length;
      allCharts.word = allCharts.total === 1 ? 'updated' : 'changed';
      if (allCharts.total > 0) {
        const appCount = appDirs.length;
        const libCount = libDirs.length;
        const appWord = appCount === 1 ? 'chart' : 'charts';
        const libWord = libCount === 1 ? 'chart' : 'charts';
        const messages = [];
        if (appCount > 0) messages.push(`${appCount} application ${appWord}`);
        if (libCount > 0) messages.push(`${libCount} library ${libWord}`);
        this.logger.info(`Found ${messages.join(' and ')}`);
      }
      return allCharts;
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'find charts',
        fatal: false
      });
      return allCharts;
    }
  }

  async findChartDirectories(typeDir, files) {
    const config = this.config.get();
    if (!await this.fileService.exists(typeDir)) {
      return [];
    }
    const dirs = await this.fileService.readDirectory(typeDir);
    const chartDirs = [];
    for (const dir of dirs) {
      const fullPath = path.join(typeDir, dir);
      const isDirectory = await this.fileService.isDirectory(fullPath);
      if (!isDirectory) continue;
      const chartYaml = path.join(fullPath, 'Chart.yaml');
      const hasChartYaml = await this.fileService.exists(chartYaml);
      if (!hasChartYaml) continue;
      if (files) {
        const isModified = files.some(file => file.startsWith(fullPath));
        if (isModified) chartDirs.push(fullPath);
      } else {
        chartDirs.push(fullPath);
      }
    }
    return chartDirs;
  }
}

module.exports = ChartService;
```

### Phase 2: Update Backward Compatibility
```javascript
// release.js
const ChartService = require('./.github/actions/services/ChartService');
let chartServiceInstance;

/**
 * Copies pre-built chart index files and generates redirect pages
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {string} params.distRoot - Root directory for distribution files
 * @returns {Promise<void>}
 */
async function _generateChartIndexes({ core, distRoot }) {
  if (!chartServiceInstance) {
    chartServiceInstance = new ChartService({ core });
  }
  return chartServiceInstance.generateChartIndexes(distRoot);
}

module.exports = {
  _generateChartIndexes,
  // ... other functions
};
```

## Testing Strategy

### 1. Unit Tests
```javascript
// tests/services/ChartService.test.js
const ChartService = require('../../.github/actions/services/ChartService');

describe('ChartService', () => {
  let service;
  let mockContext;

  beforeEach(() => {
    mockContext = {
      core: mockCore(),
      fileService: mockFileService(),
      templateService: mockTemplateService()
    };
    service = new ChartService(mockContext);
  });

  describe('generateChartIndexes', () => {
    test('should generate indexes for all charts', async () => {
      const charts = {
        application: ['application/nginx', 'application/redis'],
        library: ['library/common']
      };
      jest.spyOn(service, 'findCharts').mockResolvedValue(charts);
      jest.spyOn(service, 'generateChartIndex').mockResolvedValue(true);
      
      await service.generateChartIndexes('./dist');
      
      expect(service.generateChartIndex).toHaveBeenCalledTimes(3);
    });

    test('should handle partial failures', async () => {
      const charts = {
        application: ['application/nginx', 'application/redis'],
        library: []
      };
      jest.spyOn(service, 'findCharts').mockResolvedValue(charts);
      jest.spyOn(service, 'generateChartIndex')
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      
      await service.generateChartIndexes('./dist');
      
      expect(mockContext.core.info).toHaveBeenCalledWith('Successfully generated 1 index');
    });
  });

  describe('generateChartIndex', () => {
    test('should copy metadata and generate redirect', async () => {
      const chartDir = 'application/nginx';
      mockContext.fileService.exists.mockResolvedValue(true);
      
      const result = await service.generateChartIndex(chartDir, './dist');
      
      expect(mockContext.fileService.copyFile).toHaveBeenCalled();
      expect(service.generateRedirectPage).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    test('should return false when metadata missing', async () => {
      const chartDir = 'application/nginx';
      mockContext.fileService.exists.mockResolvedValue(false);
      
      const result = await service.generateChartIndex(chartDir, './dist');
      
      expect(result).toBe(false);
    });
  });

  describe('determineChartType', () => {
    test('should identify application charts', () => {
      const type = service.determineChartType('application/nginx');
      expect(type).toBe('application');
    });

    test('should identify library charts', () => {
      const type = service.determineChartType('library/common');
      expect(type).toBe('library');
    });
  });

  describe('generateRedirectPage', () => {
    test('should create redirect HTML file', async () => {
      const templateContent = '<html>{{Name}}</html>';
      const expectedHtml = '<html>nginx</html>';
      mockContext.fileService.readFile.mockResolvedValue(templateContent);
      mockContext.templateService.renderTemplate.mockReturnValue(expectedHtml);
      
      await service.generateRedirectPage('application', 'nginx', './dist/application/nginx');
      
      expect(mockContext.fileService.writeFile).toHaveBeenCalledWith(
        './dist/application/nginx/index.html',
        expectedHtml
      );
    });
  });
});
```

### 2. Integration Tests
```javascript
// tests/integration/chart-indexes.test.js
describe('Chart Index Generation Integration', () => {
  test('should generate complete chart structure', async () => {
    const service = new ChartService(mockContext);
    mockFilesystem({
      'application/nginx/metadata.yaml': 'name: nginx',
      'library/common/metadata.yaml': 'name: common'
    });
    
    await service.generateChartIndexes('./dist');
    
    expect(fs.existsSync('./dist/application/nginx/index.yaml')).toBe(true);
    expect(fs.existsSync('./dist/application/nginx/index.html')).toBe(true);
    expect(fs.existsSync('./dist/library/common/index.yaml')).toBe(true);
  });
});
```

### 3. Template Rendering Tests
```javascript
// tests/services/ChartService.template.test.js
describe('ChartService Template Rendering', () => {
  test('should render redirect template correctly', async () => {
    const service = new ChartService(mockContext);
    const template = `
      <meta http-equiv="refresh" content="0; url={{RepoURL}}/{{Type}}/{{Name}}">
    `;
    mockContext.templateService.renderTemplate.mockImplementation((content, context) => {
      return content
        .replace('{{RepoURL}}', context.RepoURL)
        .replace('{{Type}}', context.Type)
        .replace('{{Name}}', context.Name);
    });
    
    const result = await service.generateRedirectPage('application', 'nginx', './dist');
    
    expect(result).toContain('url=https://example.com/application/nginx');
  });
});
```

## Migration Order

1. Create ChartService class
2. Extract chart finding logic (if not already migrated)
3. Implement index generation methods
4. Add template rendering for redirects
5. Update backward compatibility

## Code Examples

### Before (Procedural)
```javascript
async function _generateChartIndexes({ core, distRoot }) {
  try {
    core.info('Generating chart indexes...');
    const charts = await utils.findCharts({ core });
    const chartDirs = [...charts.application, ...charts.library];
    const results = await Promise.all(chartDirs.map(async (chartDir) => {
      const chartName = path.basename(chartDir);
      const chartType = charts.application.includes(chartDir)
        ? config('repository').chart.type.application
        : config('repository').chart.type.library;
      // ... more code
    }));
  } catch (error) {
    utils.handleError(error, core, 'generate charts index', false);
  }
}
```

### After (Object-Oriented)
```javascript
class ChartService extends Action {
  async generateChartIndexes(distRoot) {
    try {
      this.logger.info('Generating chart indexes...');
      const charts = await this.findCharts();
      const chartDirs = [...charts.application, ...charts.library];
      const results = await Promise.all(chartDirs.map(chartDir => this.generateChartIndex(chartDir, distRoot)));
      // ... cleaner, more maintainable code
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'generate charts index',
        fatal: false
      });
    }
  }
}
```

## Dependencies to Address

- External: core, fs, path
- Internal: utils, config
- New: FileService, TemplateService

## Risks and Mitigation

1. **Risk**: Directory creation failures
   - **Mitigation**: Ensure recursive directory creation

2. **Risk**: Template rendering errors
   - **Mitigation**: Validate template context before rendering

3. **Risk**: Missing metadata files
   - **Mitigation**: Skip charts without metadata gracefully

## Notes

- The function name discrepancy (_generateChartIndexes vs _generateChartsIndex) should be resolved
- Chart finding logic may already be migrated in another service
- Redirect page generation is a good candidate for TemplateService
- Non-fatal error handling allows partial success
