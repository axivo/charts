# Migration: updateIssueLabels

## Current Implementation

- **Location**: `.github/scripts/utils.js - updateIssueLabels()`
- **Purpose**: Ensures required labels exist in a repository based on configuration
- **Dependencies**: 
  - `config()` function to get label configurations
  - `addLabel()` function to create individual labels
  - `handleError()` function for error handling
- **Used by**: Chart workflows for initial repository setup

## Code Analysis

```javascript
async function updateIssueLabels({ github, context, core }) {
  try {
    if (!config('issue').createLabels) {
      core.info('Label creation is disabled in configuration, skipping label updates');
      return [];
    }
    core.info('Updating repository issue labels...');
    const labelNames = Object.keys(config('issue').labels);
    const results = await Promise.all(
      labelNames.map(async labelName => {
        const created = await addLabel({ github, context, core, labelName });
        return created ? labelName : null;
      })
    );
    const createdLabels = results.filter(Boolean);
    if (createdLabels.length) {
      core.info(`Successfully updated ${createdLabels.length} issue labels`);
    }
    return createdLabels;
  } catch (error) {
    utils.handleError(error, core, 'update repository issue labels', false);
  }
}
```

The function:
1. Checks if label creation is enabled in configuration
2. Retrieves label names from configuration
3. Uses `addLabel()` to create each label
4. Returns an array of created label names
5. Handles errors as non-fatal

## Target Architecture

- **Target Class**: `Issue` (in `/handlers/Issue.js`)
- **Target Method**: `updateLabels()`
- **New Dependencies**: 
  - `Config` class for configuration access
  - Base handler class for GitHub API access
  - `Error` class for error handling

## Implementation Steps

1. Add the `updateLabels()` method to the `Issue` handler
2. Ensure the `Issue` handler has an `addLabel()` method
3. Implement the same logic using the new architecture
4. Create backward compatibility adapter
5. Test with existing workflows
6. Update calling code
7. Remove legacy function

## New Implementation

```javascript
// handlers/Issue.js
const Handler = require('../core/Handler');

class Issue extends Handler {
  constructor(context) {
    super(context);
  }

  /**
   * Update repository labels based on configuration
   * @returns {Promise<string[]>} Array of created label names
   */
  async updateLabels() {
    if (!this.config.get('issue').createLabels) {
      this.logger.info('Label creation is disabled in configuration, skipping label updates');
      return [];
    }
    try {
      this.logger.info('Updating repository issue labels...');
      const labelNames = Object.keys(this.config.get('issue').labels);
      const results = await Promise.all(
        labelNames.map(async labelName => {
          const created = await this.addLabel(labelName);
          return created ? labelName : null;
        })
      );
      const createdLabels = results.filter(Boolean);
      if (createdLabels.length) {
        this.logger.info(`Successfully updated ${createdLabels.length} issue labels`);
      }
      return createdLabels;
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'update repository issue labels',
        fatal: false
      });
      return [];
    }
  }

  /**
   * Add a label to the repository if it doesn't exist
   * @param {string} labelName - Name of the label
   * @param {string} [color] - Optional color override
   * @param {string} [description] - Optional description override
   * @returns {Promise<boolean>} True if label was created
   */
  async addLabel(labelName, color, description) {
    if (!labelName) {
      this.errorHandler.handle(new Error('Label name is required'), {
        operation: 'add label',
        fatal: false
      });
      return false;
    }
    const labelConfig = this.config.get('issue').labels[labelName] || {};
    const labelColor = color || labelConfig.color || 'ededed';
    const labelDescription = description || labelConfig.description || '';
    try {
      this.logger.info(`Checking if '${labelName}' label exists...`);
      await this.github.rest.issues.getLabel({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        name: labelName
      });
      this.logger.info(`Label '${labelName}' already exists`);
      return false;
    } catch (error) {
      if (error.status === 404) {
        this.logger.info(`Creating '${labelName}' label...`);
        await this.github.rest.issues.createLabel({
          owner: this.context.repo.owner,
          repo: this.context.repo.repo,
          name: labelName,
          color: labelColor,
          description: labelDescription
        });
        this.logger.info(`Successfully created '${labelName}' label`);
        return true;
      }
      this.errorHandler.handle(error, {
        operation: `check or create '${labelName}' label`,
        fatal: false
      });
      return false;
    }
  }
}

module.exports = Issue;
```

## Backward Compatibility

```javascript
// utils.js (during migration)
const Issue = require('./.github/actions/handlers/Issue');
let issueInstance;

async function updateIssueLabels({ github, context, core }) {
  if (!issueInstance) {
    issueInstance = new Issue({ github, context, core });
  }
  return issueInstance.updateLabels();
}

module.exports = {
  updateIssueLabels,
  // ... other functions
};
```

## Testing Strategy

1. Create unit tests for the `Issue.updateLabels()` method
2. Test label creation when enabled/disabled
3. Test handling of existing labels
4. Test error handling (non-fatal)
5. Test array of created labels returned
6. Run integration tests with mock GitHub API
7. Run parallel testing with old implementation

## Migration Validation

1. Verify configuration check works correctly
2. Verify label creation with correct colors/descriptions
3. Verify existing labels are not recreated
4. Verify error handling is non-fatal
5. Verify return value contains created label names
6. Verify logging output matches legacy function

## Considerations

- The new implementation maintains the same non-fatal error handling behavior
- The method signature changes but the adapter handles compatibility
- Both methods should be tested in parallel during migration
- The Issue handler will need the `addLabel()` method
- Configuration access pattern matches the new architecture
