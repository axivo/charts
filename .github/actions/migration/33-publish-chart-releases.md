# Migration: _publishChartReleases

## Current Implementation
- Location: release.js - _publishChartReleases()
- Purpose: Publishes GitHub releases for packaged charts and uploads the chart packages as release assets
- Dependencies: api, utils, path, fs, yaml, config, _getChartPackages, _extractChartInfo, _buildChartRelease, _generateChartIndexes
- Used by: processReleases

## Code Analysis

The current `_publishChartReleases` function is a private function that:
1. Deletes releases for any deleted charts
2. Gets all packaged charts from the packages directory
3. For each package:
   - Extracts chart name and version
   - Determines chart type (application/library)
   - Loads chart metadata from Chart.yaml
   - Checks if icon exists
   - Builds the release via _buildChartRelease
4. Generates chart indexes if enabled in configuration

This is the main orchestrator for the chart release process, handling both deletion and creation of releases.

## Target Architecture
- Target Class: ReleaseService
- Target Method: publishChartReleases
- New Dependencies: GitHubService, FileService, ConfigService

## Implementation Steps

### Phase 1: Create ReleaseService Class
```javascript
// services/ReleaseService.js
const Action = require('../core/Action');
const yaml = require('js-yaml');
const path = require('path');

class ReleaseService extends Action {
  constructor(context) {
    super(context);
    this.githubService = new GitHubService(context);
    this.fileService = new FileService(context);
    this.chartService = new ChartService(context);
  }

  async publishChartReleases(deletedCharts) {
    try {
      if (deletedCharts.length) {
        await this.deleteChartReleases(deletedCharts);
      }
      const packages = await this.getChartPackages();
      if (!packages.length) {
        this.logger.info('No chart packages available for publishing');
        return;
      }
      const word = packages.length === 1 ? 'package' : 'packages';
      this.logger.info(`Preparing ${packages.length} ${word} to release...`);
      await Promise.all(packages.map(package => this.processPackage(package)));
      const config = this.config.get();
      if (config.repository.chart.packages.enabled) {
        await this.chartService.generateChartIndexes('./' );
      }
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'publish chart releases',
        fatal: true
      });
    }
  }

  async deleteChartReleases(deletedCharts) {
    const word = deletedCharts.length === 1 ? 'release' : 'releases';
    this.logger.info(`Deleting ${deletedCharts.length} chart ${word}...`);
    await Promise.all(deletedCharts.map(async (deletedChart) => {
      try {
        const chartPath = path.dirname(deletedChart);
        const chart = path.basename(chartPath);
        await this.githubService.deleteReleases(chart);
      } catch (error) {
        this.errorHandler.handle(error, {
          operation: `delete releases for '${deletedChart}' chart`,
          fatal: false
        });
      }
    }));
  }

  async getChartPackages() {
    const config = this.config.get();
    const packagesPath = config.repository.release.packages;
    const appType = config.repository.chart.type.application;
    const libType = config.repository.chart.type.library;
    const appPackagesDir = path.join(packagesPath, appType);
    const libPackagesDir = path.join(packagesPath, libType);
    let packages = [];
    for (const [dir, type] of [[appPackagesDir, appType], [libPackagesDir, libType]]) {
      try {
        if (await this.fileService.exists(dir)) {
          const files = await this.fileService.readDirectory(dir);
          packages.push(...files.filter(file => file.endsWith('.tgz')).map(file => ({ source: file, type })));
        }
      } catch (error) {
        this.errorHandler.handle(error, {
          operation: `read ${type} packages directory`,
          fatal: false
        });
      }
    }
    return packages;
  }

  async processPackage(package) {
    try {
      const [name, version] = this.extractChartInfo(package);
      const chart = await this.buildChartObject(package, name, version);
      await this.createChartRelease(chart);
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: `process '${package.source}' package`,
        fatal: false
      });
    }
  }

  extractChartInfo(package) {
    const source = package.source.replace('.tgz', '');
    const lastDashIndex = source.lastIndexOf('-');
    const name = source.substring(0, lastDashIndex);
    const version = source.substring(lastDashIndex + 1);
    return [name, version];
  }

  async buildChartObject(package, name, version) {
    const config = this.config.get();
    const type = package.type === config.repository.chart.type.library ? 'library' : 'application';
    const chartDir = path.join(config.repository.chart.type[type], name);
    const packagesPath = config.repository.release.packages;
    const chartPath = path.join(packagesPath, package.type, package.source);
    const chartYamlPath = path.join(chartDir, 'Chart.yaml');
    const iconPath = path.join(chartDir, config.repository.chart.icon);
    const iconExists = await this.fileService.exists(iconPath);
    let metadata = {};
    try {
      const chartYamlContent = await this.fileService.readFile(chartYamlPath);
      metadata = yaml.load(chartYamlContent);
      this.logger.info(`Successfully loaded '${chartDir}' chart metadata`);
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: `load '${chartDir}' chart metadata`,
        fatal: false
      });
    }
    return {
      icon: iconExists,
      metadata,
      name,
      path: chartPath,
      type,
      version
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
 * Publishes GitHub releases for packaged charts and uploads the chart packages as release assets
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {string} params.deletedCharts - Deleted charts
 * @returns {Promise<void>}
 */
async function _publishChartReleases({ github, context, core, deletedCharts }) {
  if (!releaseServiceInstance) {
    releaseServiceInstance = new ReleaseService({ github, context, core });
  }
  return releaseServiceInstance.publishChartReleases(deletedCharts);
}

module.exports = {
  _publishChartReleases,
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

  describe('publishChartReleases', () => {
    test('should delete releases for deleted charts', async () => {
      const deletedCharts = ['application/nginx/Chart.yaml'];
      mockContext.fileService.exists.mockResolvedValue(false);
      
      await service.publishChartReleases(deletedCharts);
      
      expect(service.githubService.deleteReleases).toHaveBeenCalledWith('nginx');
    });

    test('should process all packages when available', async () => {
      const deletedCharts = [];
      const packages = [
        { source: 'nginx-1.2.3.tgz', type: 'application' },
        { source: 'common-0.1.0.tgz', type: 'library' }
      ];
      mockContext.fileService.exists.mockResolvedValue(true);
      mockContext.fileService.readDirectory.mockResolvedValue(['nginx-1.2.3.tgz']);
      
      await service.publishChartReleases(deletedCharts);
      
      expect(service.processPackage).toHaveBeenCalledTimes(2);
    });

    test('should handle empty packages gracefully', async () => {
      const deletedCharts = [];
      mockContext.fileService.exists.mockResolvedValue(false);
      
      await service.publishChartReleases(deletedCharts);
      
      expect(service.createChartRelease).not.toHaveBeenCalled();
    });
  });

  describe('extractChartInfo', () => {
    test('should correctly extract name and version', () => {
      const package = { source: 'nginx-1.2.3.tgz' };
      
      const [name, version] = service.extractChartInfo(package);
      
      expect(name).toBe('nginx');
      expect(version).toBe('1.2.3');
    });

    test('should handle complex names with dashes', () => {
      const package = { source: 'my-complex-app-2.1.0.tgz' };
      
      const [name, version] = service.extractChartInfo(package);
      
      expect(name).toBe('my-complex-app');
      expect(version).toBe('2.1.0');
    });
  });

  describe('buildChartObject', () => {
    test('should build complete chart object', async () => {
      const package = { source: 'nginx-1.2.3.tgz', type: 'application' };
      const metadata = { name: 'nginx', version: '1.2.3' };
      mockContext.fileService.exists.mockResolvedValue(true);
      mockContext.fileService.readFile.mockResolvedValue('name: nginx\nversion: 1.2.3');
      
      const chart = await service.buildChartObject(package, 'nginx', '1.2.3');
      
      expect(chart).toMatchObject({
        name: 'nginx',
        version: '1.2.3',
        type: 'application',
        icon: true,
        metadata: expect.any(Object)
      });
    });

    test('should handle missing metadata gracefully', async () => {
      const package = { source: 'nginx-1.2.3.tgz', type: 'application' };
      mockContext.fileService.exists.mockResolvedValue(false);
      mockContext.fileService.readFile.mockRejectedValue(new Error('File not found'));
      
      const chart = await service.buildChartObject(package, 'nginx', '1.2.3');
      
      expect(chart.metadata).toEqual({});
    });
  });
});
```

### 2. Integration Tests
```javascript
// tests/integration/release-publishing.test.js
describe('Release Publishing Integration', () => {
  test('should complete full release publishing flow', async () => {
    const service = new ReleaseService(mockContext);
    const deletedCharts = ['application/old-app/Chart.yaml'];
    
    mockContext.fileService.exists.mockResolvedValue(true);
    mockContext.fileService.readDirectory.mockImplementation(dir => {
      if (dir.includes('application')) {
        return ['nginx-1.2.3.tgz', 'redis-4.5.6.tgz'];
      }
      return [];
    });
    
    await service.publishChartReleases(deletedCharts);
    
    expect(mockContext.githubService.deleteReleases).toHaveBeenCalledWith('old-app');
    expect(service.createChartRelease).toHaveBeenCalledTimes(2);
  });
});
```

### 3. Error Handling Tests
```javascript
// tests/services/ReleaseService.errors.test.js
describe('ReleaseService Error Handling', () => {
  test('should handle package directory read errors', async () => {
    const service = new ReleaseService(mockContext);
    mockContext.fileService.readDirectory.mockRejectedValue(new Error('Permission denied'));
    
    await service.publishChartReleases([]);
    
    expect(service.errorHandler.handle).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ fatal: false })
    );
  });

  test('should continue processing after single package error', async () => {
    const service = new ReleaseService(mockContext);
    const packages = [
      { source: 'nginx-1.2.3.tgz', type: 'application' },
      { source: 'redis-4.5.6.tgz', type: 'application' }
    ];
    
    jest.spyOn(service, 'processPackage')
      .mockRejectedValueOnce(new Error('Process error'))
      .mockResolvedValueOnce();
    
    await service.publishChartReleases([]);
    
    expect(service.processPackage).toHaveBeenCalledTimes(2);
  });
});
```

## Migration Order

1. Create/extend ReleaseService class (builds on existing migration)
2. Extract helper methods for better organization
3. Move package-related functions to dedicated methods
4. Update backward compatibility wrapper
5. Test incremental migration

## Code Examples

### Before (Procedural)
```javascript
async function _publishChartReleases({ github, context, core, deletedCharts }) {
  try {
    if (deletedCharts.length) {
      const word = deletedCharts.length === 1 ? 'release' : 'releases';
      core.info(`Deleting ${deletedCharts.length} chart ${word}...`);
      await Promise.all(deletedCharts.map(async (deletedChart) => {
        try {
          const chartPath = path.dirname(deletedChart);
          const chart = path.basename(chartPath);
          await api.deleteReleases({ github, context, core, chart });
        } catch (error) {
          utils.handleError(error, core, `delete releases for '${deletedChart}' chart`, false);
        }
      }));
    }
    // ... more code
  } catch (error) {
    utils.handleError(error, core, 'publish chart releases');
  }
}
```

### After (Object-Oriented)
```javascript
class ReleaseService extends Action {
  async publishChartReleases(deletedCharts) {
    try {
      if (deletedCharts.length) {
        await this.deleteChartReleases(deletedCharts);
      }
      const packages = await this.getChartPackages();
      if (!packages.length) {
        this.logger.info('No chart packages available for publishing');
        return;
      }
      // ... cleaner, more maintainable code
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'publish chart releases',
        fatal: true
      });
    }
  }
}
```

## Dependencies to Address

- External: github, context, core, fs, path, yaml
- Internal: api, utils, config, _getChartPackages, _extractChartInfo, _buildChartRelease, _generateChartIndexes
- New: GitHubService, FileService, ChartService

## Risks and Mitigation

1. **Risk**: Package discovery failure
   - **Mitigation**: Implement fallback directory scanning

2. **Risk**: Batch processing errors affecting all releases
   - **Mitigation**: Maintain per-package error isolation

3. **Risk**: Metadata loading failures
   - **Mitigation**: Continue with minimal metadata when Chart.yaml is unavailable

## Notes

- This is a major orchestrator function that depends on several other functions
- The non-fatal error handling for individual packages is critical
- Chart index generation is handled by ChartService (separate migration)
- Deletion handling must remain robust to partial failures
