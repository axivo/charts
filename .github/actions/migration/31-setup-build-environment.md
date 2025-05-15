# Migration: setupBuildEnvironment

## Current Implementation
- Location: release.js - setupBuildEnvironment()
- Purpose: Prepares the build environment for GitHub Pages site generation
- Dependencies: utils, config, filesystem operations, _generateFrontpage (internal)
- Used by: release.yml workflow

## Code Analysis

The current `setupBuildEnvironment` function:
1. Generates a frontpage with all chart information
2. Copies Jekyll configuration file to root
3. Creates and copies custom Jekyll head content
4. Creates and copies custom Jekyll layout content
5. Determines if deployment should be published (production/staging)
6. Sets GitHub Actions output for conditional deployment

Key responsibilities include theme setup, file copying, and environment preparation for Jekyll site generation.

## Target Architecture
- Target Class: BuildHandler
- Target Method: setupEnvironment
- New Dependencies: FileService, TemplateService, Config

## Implementation Steps

### Phase 1: Create Site Generation Service
```javascript
// services/SiteService.js
const Action = require('../core/Action');
const yaml = require('js-yaml');
const path = require('path');

class SiteService extends Action {
  constructor(context) {
    super(context);
    this.templateService = new TemplateService(context);
  }

  async generateFrontpage() {
    try {
      const config = this.config.get();
      const chartDirs = await this.repositoryService.findCharts();
      const chartEntries = {};
      const allChartDirs = [...chartDirs.application, ...chartDirs.library];
      await Promise.all(allChartDirs.map(async (chartDir) => {
        try {
          const chartName = path.basename(chartDir);
          const chartType = chartDir.startsWith(config.repository.chart.type.application) ? 'application' : 'library';
          const chartYamlPath = path.join(chartDir, 'Chart.yaml');
          const chartContent = await this.fileService.readFile(chartYamlPath);
          const chartYaml = yaml.load(chartContent);
          Object.assign(chartEntries, {
            [chartName]: {
              description: chartYaml.description || '',
              type: chartType,
              version: chartYaml.version || ''
            }
          });
        } catch (error) {
          this.errorHandler.handle(error, {
            operation: `read chart metadata for ${chartDir} directory`,
            fatal: false
          });
        }
      }));
      const index = {
        apiVersion: 'v1',
        entries: chartEntries,
        generated: new Date().toISOString()
      };
      const template = await this.fileService.readFile(config.theme.frontpage.template);
      const charts = Object.entries(index.entries)
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
      const templateContext = {
        Charts: charts,
        RepoURL: this.context.payload.repository.html_url,
        Branch: this.context.payload.repository.default_branch
      };
      const content = this.templateService.renderTemplate(template, templateContext);
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

### Phase 2: Create Theme Management Service
```javascript
// services/ThemeService.js
const Action = require('../core/Action');
const path = require('path');

class ThemeService extends Action {
  constructor(context) {
    super(context);
  }

  async copyJekyllConfig() {
    try {
      const config = this.config.get();
      this.logger.info(`Copying Jekyll theme config to ./_config.yml...`);
      await this.fileService.copyFile(config.theme.configuration.file, './_config.yml');
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'copy Jekyll theme config',
        fatal: true
      });
    }
  }

  async copyCustomHead() {
    try {
      const config = this.config.get();
      this.logger.info(`Copying Jekyll theme custom head content to ./_includes/head-custom.html...`);
      await this.fileService.createDirectory('./_includes');
      await this.fileService.copyFile(config.theme.head.template, './_includes/head-custom.html');
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'copy Jekyll theme custom head content',
        fatal: false
      });
    }
  }

  async copyCustomLayout() {
    try {
      const config = this.config.get();
      this.logger.info(`Copying Jekyll theme custom layout content to ./_layouts/default.html...`);
      await this.fileService.createDirectory('./_layouts');
      await this.fileService.copyFile(config.theme.layout.template, './_layouts/default.html');
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'copy Jekyll theme custom layout content',
        fatal: false
      });
    }
  }
}
```

### Phase 3: Create Build Handler
```javascript
// handlers/Build.js
const Action = require('../core/Action');
const SiteService = require('../services/SiteService');
const ThemeService = require('../services/ThemeService');

class BuildHandler extends Action {
  constructor(context) {
    super(context);
    this.siteService = new SiteService(context);
    this.themeService = new ThemeService(context);
  }

  async setupEnvironment() {
    const config = this.config.get();
    this.logger.info(`Setting up build environment for '${config.repository.release.deployment}' deployment`);
    await this.siteService.generateFrontpage();
    await this.themeService.copyJekyllConfig();
    await this.themeService.copyCustomHead();
    await this.themeService.copyCustomLayout();
    const isPrivate = this.context.payload.repository.private === true;
    const publish = !isPrivate && config.repository.release.deployment === 'production';
    this.context.core.setOutput('publish', publish);
    this.logger.info(`Successfully completed setup for '${config.repository.release.deployment}' deployment`);
  }
}

module.exports = BuildHandler;
```

### Phase 4: Create Backward Compatibility Adapter
```javascript
// release.js
const BuildHandler = require('./.github/actions/handlers/Build');
let buildHandlerInstance;

/**
 * Setup the build environment for generating the static site
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.context - GitHub Actions context
 * @param {Object} params.core - GitHub Actions Core API
 * @returns {Promise<void>}
 */
async function setupBuildEnvironment({ context, core }) {
  if (!buildHandlerInstance) {
    buildHandlerInstance = new BuildHandler({ context, core });
  }
  return buildHandlerInstance.setupEnvironment();
}

module.exports = {
  setupBuildEnvironment,
  // ... other functions
};
```

## Testing Strategy

### 1. Unit Tests
```javascript
// tests/handlers/Build.test.js
const BuildHandler = require('../../.github/actions/handlers/Build');

describe('BuildHandler', () => {
  let handler;
  let mockContext;

  beforeEach(() => {
    mockContext = {
      context: mockActionContext(),
      core: mockCore()
    };
    handler = new BuildHandler(mockContext);
  });

  describe('setupEnvironment', () => {
    test('should setup environment for production deployment', async () => {
      mockContext.config.repository.release.deployment = 'production';
      mockContext.context.payload.repository.private = false;
      await handler.setupEnvironment();
      expect(mockContext.core.setOutput).toHaveBeenCalledWith('publish', true);
    });

    test('should not publish for private repositories', async () => {
      mockContext.config.repository.release.deployment = 'production';
      mockContext.context.payload.repository.private = true;
      await handler.setupEnvironment();
      expect(mockContext.core.setOutput).toHaveBeenCalledWith('publish', false);
    });
  });
});
```

### 2. Service Integration Tests
```javascript
// tests/services/Site.test.js
describe('SiteService', () => {
  test('should generate frontpage with chart entries', async () => {
    const service = new SiteService(mockContext);
    mockContext.repositoryService.findCharts.mockResolvedValue({
      application: ['application/nginx'],
      library: ['library/common']
    });
    await service.generateFrontpage();
    expect(mockContext.fileService.writeFile).toHaveBeenCalledWith(
      './index.md',
      expect.stringContaining('Charts:')
    );
  });
});
```

### 3. Theme Service Tests
```javascript
// tests/services/Theme.test.js
describe('ThemeService', () => {
  test('should copy all theme files', async () => {
    const service = new ThemeService(mockContext);
    await service.copyJekyllConfig();
    await service.copyCustomHead();
    await service.copyCustomLayout();
    expect(mockContext.fileService.copyFile).toHaveBeenCalledTimes(3);
  });
});
```

## Migration Order

1. Create SiteService (for frontpage generation)
2. Create ThemeService (for Jekyll configuration)
3. Create BuildHandler (main orchestrator)
4. Update release.js with adapter

## Code Examples

### Before (Procedural)
```javascript
async function setupBuildEnvironment({ context, core }) {
  core.info(`Setting up build environment for '${config('repository').release.deployment}' deployment`);
  await _generateFrontpage({ context, core });
  try {
    core.info(`Copying Jekyll theme config to ./_config.yml...`);
    await fs.copyFile(config('theme').configuration.file, './_config.yml');
  } catch (error) {
    utils.handleError(error, core, 'copy Jekyll theme config');
  }
  // ... more procedural code
}
```

### After (Object-Oriented)
```javascript
class BuildHandler extends Action {
  async setupEnvironment() {
    const config = this.config.get();
    this.logger.info(`Setting up build environment for '${config.repository.release.deployment}' deployment`);
    await this.siteService.generateFrontpage();
    await this.themeService.copyJekyllConfig();
    await this.themeService.copyCustomHead();
    await this.themeService.copyCustomLayout();
    // ... cleaner OOP approach
  }
}
```

## Dependencies to Address

- External: context, core
- Internal: config, utils, _generateFrontpage
- New: SiteService, ThemeService

## Risks and Mitigation

1. **Risk**: Jekyll configuration compatibility
   - **Mitigation**: Preserve exact file copying behavior

2. **Risk**: Error handling for non-critical files
   - **Mitigation**: Maintain non-fatal error handling for optional files

3. **Risk**: Output compatibility with GitHub Actions
   - **Mitigation**: Use same core.setOutput API

## Notes

- The frontpage generation is complex enough to warrant its own service
- Theme operations should be grouped in a dedicated service
- The determination of publish status must remain consistent with current logic
- Error handling for optional files (head, layout) must remain non-fatal
