# Migration: _processOciReleases

## Current Implementation
- Location: release.js - _publishOciReleases()
- Purpose: Publishes charts to OCI registry
- Dependencies: fs, path, config, utils, api, exec, context
- Used by: processReleases

## Code Analysis

The current `_publishOciReleases` function (note: function name is _publishOciReleases in source):
1. Checks if OCI publishing is enabled in configuration
2. Authenticates with the OCI registry using Helm
3. Deletes OCI packages for any deleted charts
4. Gets all available packages and filters for modified charts
5. Publishes each modified chart to the OCI registry

This function provides an alternative distribution mechanism using OCI registries.

## Target Architecture
- Target Class: OCIService
- Target Method: publishReleases
- New Dependencies: FileService, GitHubService, ChartService

## Implementation Steps

### Phase 1: Create OCIService Class
```javascript
// services/OCIService.js
const Action = require('../core/Action');
const path = require('path');

class OCIService extends Action {
  constructor(context) {
    super(context);
    this.exec = context.exec;
    this.fileService = new FileService(context);
    this.githubService = new GitHubService(context);
  }

  async publishReleases(deletedCharts) {
    try {
      const config = this.config.get();
      if (!config.repository.oci.packages.enabled) {
        this.logger.info('Publishing of OCI packages is disabled');
        return;
      }
      const ociRegistry = config.repository.oci.registry;
      const authenticated = await this.authenticate(ociRegistry);
      if (!authenticated) {
        return;
      }
      if (deletedCharts.length) {
        await this.deletePackages(deletedCharts);
      }
      await this.publishModifiedPackages();
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'publish packages to OCI registry',
        fatal: true
      });
    }
  }

  async authenticate(registry) {
    this.logger.info('Authenticating to OCI registry...');
    try {
      await this.exec('helm', ['registry', 'login', registry, '-u', this.context.repo.owner, '--password-stdin'], {
        input: Buffer.from(process.env['INPUT_GITHUB-TOKEN']),
        silent: true
      });
      this.logger.info('Successfully authenticated to OCI registry');
      return true;
    } catch (authError) {
      this.errorHandler.handle(authError, {
        operation: 'authenticate to OCI registry',
        fatal: false
      });
      return false;
    }
  }

  async deletePackages(deletedCharts) {
    const word = deletedCharts.length === 1 ? 'package' : 'packages';
    this.logger.info(`Deleting ${deletedCharts.length} OCI ${word}...`);
    const config = this.config.get();
    const appChartType = config.repository.chart.type.application;
    await Promise.all(deletedCharts.map(async (deletedChart) => {
      try {
        const packagePath = path.dirname(deletedChart);
        const package = {
          name: path.basename(packagePath),
          type: packagePath.startsWith(appChartType) ? 'application' : 'library'
        };
        await this.githubService.deleteOciPackage(package);
      } catch (error) {
        this.errorHandler.handle(error, {
          operation: `delete OCI packages`,
          fatal: false
        });
      }
    }));
  }

  async publishModifiedPackages() {
    const packages = await this.getModifiedPackages();
    if (!packages.length) {
      this.logger.info('No packages available for OCI registry publishing');
      return;
    }
    for (const package of packages) {
      await this.publishPackage(package);
    }
    const word = packages.length === 1 ? 'package' : 'packages';
    this.logger.info(`Successfully published ${packages.length} chart ${word} to OCI registry`);
  }

  async getModifiedPackages() {
    const config = this.config.get();
    const packagesPath = config.repository.release.packages;
    const allPackages = await this.getChartPackages(packagesPath);
    if (!allPackages.length) {
      return [];
    }
    const files = Object.keys(await this.githubService.getUpdatedFiles());
    const charts = await this.findModifiedCharts(files);
    const chartNames = [
      ...charts.application.map(dir => path.basename(dir)),
      ...charts.library.map(dir => path.basename(dir))
    ];
    const packages = [];
    for (const package of allPackages) {
      const [name] = this.extractChartInfo(package);
      if (chartNames.includes(name)) {
        packages.push(package);
      }
    }
    return packages;
  }

  async getChartPackages(packagesPath) {
    const config = this.config.get();
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

  extractChartInfo(package) {
    const source = package.source.replace('.tgz', '');
    const lastDashIndex = source.lastIndexOf('-');
    const name = source.substring(0, lastDashIndex);
    const version = source.substring(lastDashIndex + 1);
    return [name, version];
  }

  async publishPackage(package) {
    try {
      this.logger.info(`Publishing '${package.source}' chart package to OCI registry...`);
      const config = this.config.get();
      const packagesPath = config.repository.release.packages;
      const ociRegistry = config.repository.oci.registry;
      const chartPath = path.join(packagesPath, package.type, package.source);
      const registry = ['oci:/', ociRegistry, this.context.payload.repository.full_name, package.type].join('/');
      await this.exec('helm', ['push', chartPath, registry], { silent: true });
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: `push '${package.source}' package`,
        fatal: false
      });
    }
  }

  async findModifiedCharts(files) {
    const config = this.config.get();
    const appType = config.repository.chart.type.application;
    const libType = config.repository.chart.type.library;
    const charts = {
      application: [],
      library: []
    };
    for (const file of files) {
      if (!file.endsWith('Chart.yaml')) continue;
      const dir = path.dirname(file);
      if (dir.startsWith(appType)) {
        charts.application.push(dir);
      } else if (dir.startsWith(libType)) {
        charts.library.push(dir);
      }
    }
    return charts;
  }
}

module.exports = OCIService;
```

### Phase 2: Update Backward Compatibility
```javascript
// release.js
const OCIService = require('./.github/actions/services/OCIService');
let ociServiceInstance;

/**
 * Publishes charts to OCI registry
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {Object} params.exec - GitHub Actions exec helpers for running commands
 * @param {Object} params.deletedCharts - Deleted charts
 * @returns {Promise<void>}
 */
async function _publishOciReleases({ github, context, core, exec, deletedCharts }) {
  if (!ociServiceInstance) {
    ociServiceInstance = new OCIService({ github, context, core, exec });
  }
  return ociServiceInstance.publishReleases(deletedCharts);
}

module.exports = {
  _publishOciReleases,
  // ... other functions
};
```

## Testing Strategy

### 1. Unit Tests
```javascript
// tests/services/OCIService.test.js
const OCIService = require('../../.github/actions/services/OCIService');

describe('OCIService', () => {
  let service;
  let mockContext;

  beforeEach(() => {
    mockContext = {
      github: mockGitHub(),
      context: mockActionContext(),
      core: mockCore(),
      exec: mockExec()
    };
    service = new OCIService(mockContext);
  });

  describe('publishReleases', () => {
    test('should skip when OCI publishing disabled', async () => {
      mockContext.config.repository.oci.packages.enabled = false;
      
      await service.publishReleases([]);
      
      expect(mockContext.exec).not.toHaveBeenCalled();
    });

    test('should authenticate and publish packages', async () => {
      mockContext.config.repository.oci.packages.enabled = true;
      jest.spyOn(service, 'authenticate').mockResolvedValue(true);
      jest.spyOn(service, 'publishModifiedPackages').mockResolvedValue();
      
      await service.publishReleases([]);
      
      expect(service.authenticate).toHaveBeenCalled();
      expect(service.publishModifiedPackages).toHaveBeenCalled();
    });

    test('should handle authentication failure', async () => {
      mockContext.config.repository.oci.packages.enabled = true;
      jest.spyOn(service, 'authenticate').mockResolvedValue(false);
      
      await service.publishReleases([]);
      
      expect(service.publishModifiedPackages).not.toHaveBeenCalled();
    });
  });

  describe('authenticate', () => {
    test('should authenticate with OCI registry', async () => {
      const registry = 'ghcr.io';
      mockContext.exec.mockResolvedValue();
      
      const result = await service.authenticate(registry);
      
      expect(result).toBe(true);
      expect(mockContext.exec).toHaveBeenCalledWith(
        'helm',
        ['registry', 'login', registry, '-u', 'owner', '--password-stdin'],
        expect.objectContaining({ silent: true })
      );
    });

    test('should handle authentication errors', async () => {
      mockContext.exec.mockRejectedValue(new Error('Auth failed'));
      
      const result = await service.authenticate('ghcr.io');
      
      expect(result).toBe(false);
    });
  });

  describe('publishPackage', () => {
    test('should push package to OCI registry', async () => {
      const package = { source: 'nginx-1.2.3.tgz', type: 'application' };
      mockContext.exec.mockResolvedValue();
      
      await service.publishPackage(package);
      
      expect(mockContext.exec).toHaveBeenCalledWith(
        'helm',
        expect.arrayContaining(['push']),
        { silent: true }
      );
    });
  });

  describe('getModifiedPackages', () => {
    test('should filter packages for modified charts', async () => {
      const allPackages = [
        { source: 'nginx-1.2.3.tgz', type: 'application' },
        { source: 'redis-6.2.5.tgz', type: 'application' }
      ];
      jest.spyOn(service, 'getChartPackages').mockResolvedValue(allPackages);
      mockContext.githubService.getUpdatedFiles.mockResolvedValue({
        'application/nginx/Chart.yaml': 'modified'
      });
      
      const packages = await service.getModifiedPackages();
      
      expect(packages).toHaveLength(1);
      expect(packages[0].source).toBe('nginx-1.2.3.tgz');
    });
  });

  describe('deletePackages', () => {
    test('should delete OCI packages for deleted charts', async () => {
      const deletedCharts = ['application/old-app/Chart.yaml'];
      
      await service.deletePackages(deletedCharts);
      
      expect(mockContext.githubService.deleteOciPackage).toHaveBeenCalledWith({
        name: 'old-app',
        type: 'application'
      });
    });
  });
});
```

### 2. Integration Tests
```javascript
// tests/integration/oci-publishing.test.js
describe('OCI Publishing Integration', () => {
  test('should complete full OCI publishing flow', async () => {
    const service = new OCIService(mockContext);
    mockContext.config.repository.oci.packages.enabled = true;
    mockContext.exec.mockResolvedValue();
    mockFilesystem({
      'packages/application/nginx-1.2.3.tgz': 'package content',
      'packages/library/common-0.1.0.tgz': 'package content'
    });
    
    await service.publishReleases([]);
    
    expect(mockContext.exec).toHaveBeenCalledWith(
      'helm',
      expect.arrayContaining(['registry', 'login']),
      expect.any(Object)
    );
    expect(mockContext.exec).toHaveBeenCalledWith(
      'helm',
      expect.arrayContaining(['push']),
      expect.any(Object)
    );
  });
});
```

### 3. Error Handling Tests
```javascript
// tests/services/OCIService.errors.test.js
describe('OCIService Error Handling', () => {
  test('should continue after individual package push failure', async () => {
    const packages = [
      { source: 'nginx-1.2.3.tgz', type: 'application' },
      { source: 'redis-6.2.5.tgz', type: 'application' }
    ];
    jest.spyOn(service, 'getModifiedPackages').mockResolvedValue(packages);
    mockContext.exec
      .mockRejectedValueOnce(new Error('Push failed'))
      .mockResolvedValueOnce();
    
    await service.publishModifiedPackages();
    
    expect(mockContext.exec).toHaveBeenCalledTimes(2);
  });
});
```

## Migration Order

1. Create OCIService class
2. Implement authentication logic
3. Add package discovery and filtering
4. Implement publish and delete operations
5. Update backward compatibility

## Code Examples

### Before (Procedural)
```javascript
async function _publishOciReleases({ github, context, core, exec, deletedCharts }) {
  try {
    const ociRegistry = config('repository').oci.registry;
    if (!config('repository').oci.packages.enabled) {
      core.info('Publishing of OCI packages is disabled');
      return;
    }
    core.info('Authenticating to OCI registry...');
    try {
      await exec.exec('helm', ['registry', 'login', ociRegistry, '-u', context.repo.owner, '--password-stdin'], {
        input: Buffer.from(process.env['INPUT_GITHUB-TOKEN']),
        silent: true
      });
      // ... more code
    } catch (authError) {
      utils.handleError(authError, core, 'authenticate to OCI registry', false);
      return;
    }
    // ... more code
  } catch (error) {
    utils.handleError(error, core, 'publish packages to OCI registry');
  }
}
```

### After (Object-Oriented)
```javascript
class OCIService extends Action {
  async publishReleases(deletedCharts) {
    try {
      const config = this.config.get();
      if (!config.repository.oci.packages.enabled) {
        this.logger.info('Publishing of OCI packages is disabled');
        return;
      }
      const ociRegistry = config.repository.oci.registry;
      const authenticated = await this.authenticate(ociRegistry);
      if (!authenticated) {
        return;
      }
      // ... cleaner, more maintainable code
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'publish packages to OCI registry',
        fatal: true
      });
    }
  }
}
```

## Dependencies to Address

- External: github, context, core, exec, path
- Internal: config, utils, api, _getChartPackages, _extractChartInfo
- New: FileService, GitHubService

## Risks and Mitigation

1. **Risk**: Authentication token exposure
   - **Mitigation**: Use secure input handling with Buffer

2. **Risk**: Registry connectivity issues
   - **Mitigation**: Graceful error handling with clear messages

3. **Risk**: Package push failures
   - **Mitigation**: Continue with other packages on individual failures

## Notes

- Function name discrepancy (_publishOciReleases vs _processOciReleases) should be resolved
- Authentication uses GitHub token from environment
- Package discovery logic is similar to other release functions
- Sequential pushing (for loop) may be intentional for rate limiting
