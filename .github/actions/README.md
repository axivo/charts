# GitHub Actions Core 

This repository contains modular, object-oriented JavaScript components for GitHub Actions workflows.

## Contents

1. [Configuration System](#configuration-system)
2. [Base Action Class](#base-action-class)
3. [Error Handling](#error-handling)

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

// Modify configuration values
config.set('custom.setting', 'new value');

// Merge additional configuration
config.merge({
  custom: {
    settings: {
      advanced: true
    }
  }
});

// Load environment variables (ENV_CONFIG_* pattern)
// Example: ENV_CONFIG_REPOSITORY_URL becomes repository.url
config.loadEnvironmentVariables();

// Validate required configuration exists
config.validate();
```

### Creating Custom Instances

```javascript
const { Configuration } = require('../core');
const customConfig = new Configuration({
  custom: {
    setting: 'value'
  }
});
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

### Usage

```javascript
const { Action } = require('../core');

class ChartUpdateAction extends Action {
  async run() {
    const charts = await this.findCharts();
    await this.updateCharts(charts);
    return 'Charts updated successfully';
  }
  
  async findCharts() {
    // Implementation here
  }
  
  async updateCharts(charts) {
    // Implementation here
  }
}

module.exports = ChartUpdateAction;
```

### Lifecycle Hooks

The Action class provides several hooks to customize behavior:

1. `beforeInitialize()` - Runs before initialization
2. `afterInitialize()` - Runs after initialization
3. `beforeExecute()` - Runs before the main execution
4. `run()` - Main action implementation (must be overridden)
5. `afterExecute(result)` - Runs after execution with the result

### Creating Action Instances

```javascript
const core = require('@actions/core');
const github = require('@actions/github');
const exec = require('@actions/exec');
const { Configuration } = require('../core');
const ChartUpdateAction = require('./ChartUpdateAction');
const config = require('../config');

async function run() {
  try {
    const configuration = new Configuration(config);
    configuration.validate();
    
    const action = new ChartUpdateAction({
      core,
      github,
      exec,
      config: configuration
    });
    
    const result = await action.execute();
    core.setOutput('result', result);
  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}

run();
```

## Error Handling

The Error handling system provides standardized error management:

- Consistent error formatting
- GitHub annotations for file-related errors
- Error categorization (fatal vs. non-fatal)
- Stack trace preservation

### Using ErrorHandler

```javascript
const { createErrorHandler, createErrorContext } = require('../utils/errorUtils');

// In a class constructor
this.errorHandler = createErrorHandler(core);

// Handling errors
try {
  // Some operation
} catch (error) {
  this.errorHandler.handle(error, createErrorContext('operation name', {
    fatal: true,
    file: 'path/to/file.yml',
    line: 42
  }));
}
```