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
- Target Class: ReleaseHandler
- Target Method: processReleases
- New Dependencies: Core services (GitHubService, FileService, HelmService, RepositoryService), configuration

## Implementation Steps

### Phase 1: Create Release Service Classes
```javascript
// services/RepositoryService.js
const Action = require('../core/Action');
const path = require('path');

class RepositoryService extends Action {
  constructor(context) {
    super(context);
    this.chartHelper = new ChartHelper(context);
  }

  async findCharts(modifiedFiles) {
    const config = this.config.get();
    const appDir = config.repository.chart.type.application;
    const libDir = config.repository.chart.type.library;
    const app = [];
    const lib = [];
    if (!modifiedFiles) {
      const appCharts = await this.fileService.listDirectory(appDir);
      const libCharts = await this.fileService.listDirectory(libDir);
      app.push(...appCharts.filter(dir => !dir.startsWith('.')));
      lib.push(...libCharts.filter(dir => !dir.startsWith('.')));
    } else {
      const chartYamlFiles = modifiedFiles
        .filter(file => file.endsWith('Chart.yaml'))
        .map(file => path.dirname(file))
        .filter(dir => dir !== '.')
        .map(dir => dir.startsWith(appDir) || dir.startsWith(libDir) ? dir : null)
        .filter(Boolean);
      const uniqueCharts = [...new Set(chartYamlFiles)];
      for (const chart of uniqueCharts) {
        if (chart.startsWith(appDir)) {
          app.push(chart);
        } else if (chart.startsWith(libDir)) {
          lib.push(chart);
        }
      }
    }
    const total = app.length + lib.length;
    const word = total === 1 ? 'modified' : 'total';
    return { application: app, library: lib, total, word };
  }

  getChartInfo(fileName) {
    const source = fileName.replace('.tgz', '');
    const lastDashIndex = source.lastIndexOf('-');
    const name = source.substring(0, lastDashIndex);
    const version = source.substring(lastDashIndex + 1);
    return { name, version };
  }
}

// services/ReleaseService.js
const Action = require('../core/Action');
const yaml = require('js-yaml');
const path = require('path');

class ReleaseService extends Action {
  constructor(context) {
    super(context);
    this.githubService = new GitHubService(context);
    this.helmService = new HelmService(context);
    this.templateService = new TemplateService(context);
  }

  async createChartRelease(chart) {
    try {
      const config = this.config.get();
      const tagName = config.repository.release.title
        .replace('{{ .Name }}', chart.name)
        .replace('{{ .Version }}', chart.version);
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
      const assetName = [chart.type, 'tgz'].join('.');
      const assetData = await this.fileService.readFile(chart.path);
      await this.githubService.uploadReleaseAsset({
        releaseId: release.id,
        assetName,
        assetData
      });
      this.logger.info(`Successfully created '${tagName}' repository release`);
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: `create ${tagName} repository release`,
        fatal: false
      });
    }
  }

  async generateReleaseContent(chart) {
    try {
      this.logger.info(`Generating release content for '${chart.type}/${chart.name}' chart...`);
      const config = this.config.get();
      const releaseTemplate = config.repository.release.template;
      await this.fileService.validateFile(releaseTemplate);
      const templateContent = await this.fileService.readFile(releaseTemplate);
      const issues = await this.githubService.getReleaseIssues(chart);
      const tagName = config.repository.release.title
        .replace('{{ .Name }}', chart.name)
        .replace('{{ .Version }}', chart.version);
      const templateContext = {
        AppVersion: chart.metadata.appVersion || '',
        Branch: this.context.payload.repository.default_branch,
        Dependencies: (chart.metadata.dependencies || []).map(dependency => ({
          Name: dependency.name,
          Repository: dependency.repository,
          Source: [this.context.payload.repository.html_url, 'blob', tagName, chart.type, chart.name, 'Chart.yaml'].join('/'),
          Version: dependency.version
        })),
        Description: chart.metadata.description || '',
        Icon: chart.icon ? config.repository.chart.icon : null,
        Issues: issues.length ? issues : null,
        KubeVersion: chart.metadata.kubeVersion || '',
        Name: chart.name,
        RepoURL: this.context.payload.repository.html_url,
        Type: chart.type,
        Version: chart.version
      };
      return this.templateService.renderTemplate(templateContent, templateContext);
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

### Phase 2: Create Package Management Service
```javascript
// services/PackageService.js
const Action = require('../core/Action');
const path = require('path');

class PackageService extends Action {
  constructor(context) {
    super(context);
    this.exec = context.exec;
  }

  async packageCharts(charts) {
    const config = this.config.get();
    const packagesPath = config.repository.release.packages;
    const appChartType = config.repository.chart.type.application;
    const libChartType = config.repository.chart.type.library;
    this.logger.info(`Creating ${packagesPath} directory...`);
    await this.fileService.createDirectory(packagesPath);
    const appPackagesDir = path.join(packagesPath, appChartType);
    const libPackagesDir = path.join(packagesPath, libChartType);
    await this.fileService.createDirectory(appPackagesDir);
    await this.fileService.createDirectory(libPackagesDir);
    this.logger.info(`Successfully created ${packagesPath} directory`);
    const chartDirs = [...charts.application, ...charts.library];
    await Promise.all(chartDirs.map(async (chartDir) => {
      try {
        this.logger.info(`Packaging '${chartDir}' chart...`);
        this.logger.info(`Updating dependencies for '${chartDir}' chart...`);
        await this.exec.exec('helm', ['dependency', 'update', chartDir], { silent: true });
        const isAppChartType = chartDir.startsWith(appChartType);
        const packageDest = isAppChartType ? appPackagesDir : libPackagesDir;
        await this.exec.exec('helm', ['package', chartDir, '--destination', packageDest], { silent: true });
      } catch (error) {
        this.errorHandler.handle(error, {
          operation: `package ${chartDir} chart`,
          fatal: false
        });
      }
    }));
    const word = chartDirs.length === 1 ? 'chart' : 'charts';
    this.logger.info(`Successfully packaged ${chartDirs.length} ${word}`);
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
          const files = await this.fileService.listDirectory(dir);
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
}
```

### Phase 3: Create OCI Registry Service
```javascript
// services/OciService.js
const Action = require('../core/Action');
const path = require('path');

class OciService extends Action {
  constructor(context) {
    super(context);
    this.exec = context.exec;
  }

  async authenticate() {
    const config = this.config.get();
    const ociRegistry = config.repository.oci.registry;
    this.logger.info('Authenticating to OCI registry...');
    try {
      await this.exec.exec('helm', ['registry', 'login', ociRegistry, '-u', this.context.repo.owner, '--password-stdin'], {
        input: Buffer.from(process.env['INPUT_GITHUB-TOKEN']),
        silent: true
      });
      this.logger.info('Successfully authenticated to OCI registry');
    } catch (authError) {
      this.errorHandler.handle(authError, {
        operation: 'authenticate to OCI registry',
        fatal: false
      });
      throw authError;
    }
  }

  async publishPackage(package, packagesPath) {
    try {
      const config = this.config.get();
      const ociRegistry = config.repository.oci.registry;
      this.logger.info(`Publishing '${package.source}' chart package to OCI registry...`);
      const chartPath = path.join(packagesPath, package.type, package.source);
      const registry = ['oci:/', ociRegistry, this.context.payload.repository.full_name, package.type].join('/');
      await this.exec.exec('helm', ['push', chartPath, registry], { silent: true });
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: `push '${package.source}' package`,
        fatal: false
      });
    }
  }
}
```

### Phase 4: Create Main ReleaseHandler
```javascript
// handlers/Release.js
const Action = require('../core/Action');
const PackageService = require('../services/PackageService');
const ReleaseService = require('../services/ReleaseService');
const OciService = require('../services/OciService');
const RepositoryService = require('../services/RepositoryService');

class ReleaseHandler extends Action {
  constructor(context) {
    super(context);
    this.packageService = new PackageService(context);
    this.releaseService = new ReleaseService(context);
    this.ociService = new OciService(context);
    this.repositoryService = new RepositoryService(context);
  }

  async processReleases() {
    try {
      const files = await this.githubService.getUpdatedFiles();
      const charts = await this.repositoryService.findCharts(Object.keys(files));
      const deletedCharts = Object.entries(files)
        .filter(([file, status]) => file.endsWith('Chart.yaml') && status === 'removed')
        .map(([file]) => file);
      if (!(charts.total + deletedCharts.length)) {
        this.logger.info(`No ${charts.word} chart releases found`);
        return;
      }
      if (charts.total) {
        await this.packageService.packageCharts(charts);
      }
      await this.publishChartReleases(deletedCharts);
      const config = this.config.get();
      if (config.repository.oci.packages.enabled) {
        await this.publishOciReleases(deletedCharts, charts);
      }
      this.logger.info('Successfully completed the chart releases process');
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'process chart releases',
        fatal: true
      });
    }
  }

  async publishChartReleases(deletedCharts) {
    try {
      if (deletedCharts.length) {
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
      const config = this.config.get();
      const packagesPath = config.repository.release.packages;
      const packages = await this.packageService.getChartPackages(packagesPath);
      if (!packages.length) {
        this.logger.info('No chart packages available for publishing');
        return;
      }
      const word = packages.length === 1 ? 'package' : 'packages'
      this.logger.info(`Preparing ${packages.length} ${word} to release...`);
      await Promise.all(packages.map(async (package) => {
        try {
          const { name, version } = this.repositoryService.getChartInfo(package.source);
          const type = package.type === config.repository.chart.type.library ? 'library' : 'application';
          const chartDir = path.join(config.repository.chart.type[type], name);
          const chartPath = path.join(packagesPath, package.type, package.source);
          const chartYamlPath = path.join(chartDir, 'Chart.yaml');
          const iconExists = await this.fileService.exists(path.join(chartDir, config.repository.chart.icon));
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
          const chart = {
            icon: iconExists,
            metadata,
            name,
            path: chartPath,
            type,
            version
          }
          await this.releaseService.createChartRelease(chart);
        } catch (error) {
          this.errorHandler.handle(error, {
            operation: `process '${package.source}' package`,
            fatal: false
          });
        }
      }));
      if (config.repository.chart.packages.enabled) {
        await this.generateChartIndexes();
      }
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'publish chart releases',
        fatal: true
      });
    }
  }

  async publishOciReleases(deletedCharts, charts) {
    try {
      const config = this.config.get();
      const packagesPath = config.repository.release.packages;
      if (!config.repository.oci.packages.enabled) {
        this.logger.info('Publishing of OCI packages is disabled');
        return;
      }
      await this.ociService.authenticate();
      if (deletedCharts.length) {
        const word = deletedCharts.length === 1 ? 'package' : 'packages';
        this.logger.info(`Deleting ${deletedCharts.length} OCI ${word}...`);
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
      const allPackages = await this.packageService.getChartPackages(packagesPath);
      if (!allPackages.length) {
        this.logger.info('No packages available for OCI registry publishing');
        return;
      }
      const chartNames = [
        ...charts.application.map(dir => path.basename(dir)),
        ...charts.library.map(dir => path.basename(dir))
      ];
      const packages = [];
      for (const package of allPackages) {
        const { name } = this.repositoryService.getChartInfo(package.source);
        if (chartNames.includes(name)) {
          packages.push(package);
        }
      }
      if (!packages.length) {
        this.logger.info('No packages available for OCI registry publishing');
        return;
      }
      for (const package of packages) {
        await this.ociService.publishPackage(package, packagesPath);
      }
      const word = packages.length === 1 ? 'package' : 'packages';
      this.logger.info(`Successfully published ${packages.length} chart ${word} to OCI registry`);
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'publish packages to OCI registry',
        fatal: true
      });
    }
  }

  async generateChartIndexes() {
    try {
      const config = this.config.get();
      this.logger.info('Generating chart indexes...');
      const charts = await this.repositoryService.findCharts();
      const chartDirs = [...charts.application, ...charts.library];
      const results = await Promise.all(chartDirs.map(async (chartDir) => {
        const chartName = path.basename(chartDir);
        const chartType = charts.application.includes(chartDir)
          ? config.repository.chart.type.application
          : config.repository.chart.type.library;
        const outputDir = path.join('./', chartType, chartName);
        try {
          await this.fileService.createDirectory(outputDir);
          const indexPath = path.join(outputDir, 'index.yaml');
          const metadataPath = path.join(chartDir, 'metadata.yaml');
          const metadataPathExists = await this.fileService.exists(metadataPath);
          if (!metadataPathExists) return false;
          await this.fileService.copyFile(metadataPath, indexPath);
          this.logger.info(`Successfully generated '${chartType}/${chartName}' chart index`);
          const redirectTemplate = config.repository.chart.redirect.template;
          const redirectContent = await this.fileService.readFile(redirectTemplate);
          const redirectContext = {
            RepoURL: config.repository.url,
            Type: chartType,
            Name: chartName
          };
          const redirectHtml = this.templateService.renderTemplate(redirectContent, redirectContext);
          const redirectPath = path.join(outputDir, 'index.html');
          await this.fileService.writeFile(redirectPath, redirectHtml);
          return true;
        } catch (error) {
          this.errorHandler.handle(error, {
            operation: `process '${chartType}/${chartName}' chart`,
            fatal: false
          });
          return false;
        }
      }));
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
}

module.exports = ReleaseHandler;
```

### Phase 5: Create Backward Compatibility Adapter
```javascript
// release.js
const ReleaseHandler = require('./.github/actions/handlers/Release');
let releaseHandlerInstance;

/**
 * Process chart releases for affected charts
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client
 * @param {Object} params.context - GitHub Actions context
 * @param {Object} params.core - GitHub Actions Core API
 * @param {Object} params.exec - GitHub Actions exec helper
 * @returns {Promise<void>}
 */
async function processReleases({ github, context, core, exec }) {
  if (!releaseHandlerInstance) {
    releaseHandlerInstance = new ReleaseHandler({ github, context, core, exec });
  }
  return releaseHandlerInstance.processReleases();
}

module.exports = {
  processReleases,
  // ... other functions
};
```

## Testing Strategy

### 1. Unit Tests
```javascript
// tests/handlers/Release.test.js
const ReleaseHandler = require('../../.github/actions/handlers/Release');

describe('ReleaseHandler', () => {
  let handler;
  let mockContext;

  beforeEach(() => {
    mockContext = {
      github: mockGitHub(),
      context: mockActionContext(),
      core: mockCore(),
      exec: mockExec()
    };
    handler = new ReleaseHandler(mockContext);
  });

  describe('processReleases', () => {
    test('should process releases when charts are modified', async () => {
      mockContext.github.getUpdatedFiles.mockResolvedValue({
        'application/nginx/Chart.yaml': 'modified'
      });
      await handler.processReleases();
      expect(handler.packageService.packageCharts).toHaveBeenCalled();
      expect(handler.publishChartReleases).toHaveBeenCalled();
    });

    test('should skip when no charts are modified', async () => {
      mockContext.github.getUpdatedFiles.mockResolvedValue({});
      await handler.processReleases();
      expect(handler.packageService.packageCharts).not.toHaveBeenCalled();
    });
  });
});
```

### 2. Integration Tests
```javascript
// tests/integration/release-workflow.test.js
describe('Release Workflow Integration', () => {
  test('should complete full release process', async () => {
    const result = await runWorkflow('release.yml', {
      files: {
        'application/nginx/Chart.yaml': 'modified'
      }
    });
    expect(result.releases).toHaveLength(1);
    expect(result.packages.oci).toHaveLength(1);
  });
});
```

### 3. Parallel Testing
Compare outputs between old and new implementations to ensure consistency.

## Migration Order

1. RepositoryService (for finding charts)
2. PackageService (for chart packaging)
3. ReleaseService (for creating releases)
4. OciService (for OCI publishing)
5. ReleaseHandler (main orchestrator)
6. Update release.js with adapter

## Code Examples

### Before (Procedural)
```javascript
async function processReleases({ github, context, core, exec }) {
  try {
    const files = await api.getUpdatedFiles({ github, context, core });
    const charts = await utils.findCharts({ core, files: Object.keys(files) });
    // ... more procedural code
  } catch (error) {
    utils.handleError(error, core, 'process chart releases');
  }
}
```

### After (Object-Oriented)
```javascript
class ReleaseHandler extends Action {
  async processReleases() {
    try {
      const files = await this.githubService.getUpdatedFiles();
      const charts = await this.repositoryService.findCharts(Object.keys(files));
      // ... more OOP code with clear separation of concerns
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'process chart releases',
        fatal: true
      });
    }
  }
}
```

## Dependencies to Address

- External: github, context, core, exec (passed via constructor)
- Internal: config, utils, github-api
- New: Service classes (PackageService, ReleaseService, OciService, RepositoryService)

## Risks and Mitigation

1. **Risk**: Complex orchestration logic
   - **Mitigation**: Break into smaller service classes with single responsibilities

2. **Risk**: Error handling across multiple services
   - **Mitigation**: Consistent error handling pattern with ErrorHandler

3. **Risk**: Dependency injection complexity
   - **Mitigation**: Clear constructor patterns and factory methods

## Notes

- This function orchestrates multiple complex operations and should be broken into focused services
- The parallel processing with Promise.all should be maintained for performance
- Error handling must remain non-fatal for individual chart failures
- The OCI registry operations are optional and should be cleanly separated
