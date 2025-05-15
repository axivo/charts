# Migration: addLabel()

## 🚫 MANDATORY CODING GUIDELINES

### THESE RULES ARE NON-NEGOTIABLE:
1. **NO EMPTY LINES INSIDE FUNCTIONS**
2. **NO COMMENTS INSIDE FUNCTIONS**
3. **JSDOC ONLY FOR DOCUMENTATION**
4. **NO INLINE COMMENTS IN CODE**
5. **FOLLOW EXISTING PATTERNS**

## Current Implementation

- Location: `utils.js - addLabel()`
- Purpose: Add a label to repository if it doesn't exist
- Dependencies: `config()`, `handleError()`
- Used by: `updateIssueLabels()`, `reportWorkflowIssue()`

```javascript
/**
 * Adds a label to the repository if it doesn't exist
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client
 * @param {Object} params.context - GitHub Actions context
 * @param {Object} params.core - GitHub Actions Core API
 * @param {string} params.labelName - Name of the label to add
 * @returns {Promise<boolean>} - True if label was created or exists
 */
async function addLabel({ github, context, core, labelName }) {
  const labelConfig = config('issue').labels[labelName];
  if (!labelConfig) {
    core.warning(`Label configuration not found for '${labelName}'`);
    return false;
  }
  try {
    await github.rest.issues.getLabel({
      owner: context.repo.owner,
      repo: context.repo.repo,
      name: labelName
    });
    return true;
  } catch (error) {
    if (error.status === 404) {
      try {
        if (!config('issue').createLabels) {
          core.warning(`Label '${labelName}' not found and createLabels is disabled`);
          return false;
        }
        await github.rest.issues.createLabel({
          owner: context.repo.owner,
          repo: context.repo.repo,
          name: labelName,
          color: labelConfig.color,
          description: labelConfig.description
        });
        core.info(`Created '${labelName}' label`);
        return true;
      } catch (createError) {
        utils.handleError(createError, core, `create '${labelName}' label`, false);
        return false;
      }
    }
    utils.handleError(error, core, `check '${labelName}' label`, false);
    return false;
  }
}
```

## Code Analysis

This function manages repository labels by checking if they exist and creating them if needed (when enabled). It's used to ensure required labels are available before applying them to issues.

## Target Architecture

- Target Class: `Issue`
- Target Method: `addLabel()`
- New Dependencies: `Config`, `GitHub`, `Error` classes

## Implementation Steps

### Step 1: Create Issue Handler Class

Create `handlers/Issue.js`:

```javascript
/**
 * Issue and label management handler
 * 
 * @module handlers/Issue
 */
const Action = require('../core/Action');

class Issue extends Action {
  /**
   * Creates a new Issue handler instance
   * 
   * @param {Object} context - Execution context
   */
  constructor(context) {
    super(context);
    this.github = context.github;
  }
  
  /**
   * Adds a label to the repository if it doesn't exist
   * 
   * @param {string} labelName - Name of the label to add
   * @returns {Promise<boolean>} - True if label was created or exists
   */
  async addLabel(labelName) {
    const labelConfig = this.config.get(`issue.labels.${labelName}`);
    if (!labelConfig) {
      this.logger.warning(`Label configuration not found for '${labelName}'`);
      return false;
    }
    try {
      await this.github.rest.issues.getLabel({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        name: labelName
      });
      return true;
    } catch (error) {
      if (error.status === 404) {
        try {
          if (!this.config.get('issue.createLabels')) {
            this.logger.warning(`Label '${labelName}' not found and createLabels is disabled`);
            return false;
          }
          await this.github.rest.issues.createLabel({
            owner: this.context.repo.owner,
            repo: this.context.repo.repo,
            name: labelName,
            color: labelConfig.color,
            description: labelConfig.description
          });
          this.logger.info(`Created '${labelName}' label`);
          return true;
        } catch (createError) {
          this.errorHandler.handle(createError, {
            operation: `create '${labelName}' label`,
            fatal: false
          });
          return false;
        }
      }
      this.errorHandler.handle(error, {
        operation: `check '${labelName}' label`,
        fatal: false
      });
      return false;
    }
  }
}

module.exports = Issue;
```

### Step 2: Add Backward Compatibility

Update `utils.js`:

```javascript
const Issue = require('./.github/actions/handlers/Issue');
let issueInstance;

/**
 * Adds a label to the repository if it doesn't exist
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client
 * @param {Object} params.context - GitHub Actions context
 * @param {Object} params.core - GitHub Actions Core API
 * @param {string} params.labelName - Name of the label to add
 * @returns {Promise<boolean>} - True if label was created or exists
 */
async function addLabel({ github, context, core, labelName }) {
  if (!issueInstance) {
    issueInstance = new Issue({ github, context, core });
  }
  return issueInstance.addLabel(labelName);
}
```

### Step 3: Update Calling Code

Search for uses of `addLabel()` and update them:

```javascript
// Before
await utils.addLabel({ github, context, core, labelName: 'bug' });

// After
const issueHandler = new Issue(context);
await issueHandler.addLabel('bug');
```

## Testing Strategy

```javascript
const Issue = require('../handlers/Issue');

describe('Issue Handler - addLabel', () => {
  let issueHandler;
  let mockContext;
  
  beforeEach(() => {
    mockContext = {
      github: {
        rest: {
          issues: {
            getLabel: jest.fn(),
            createLabel: jest.fn()
          }
        }
      },
      repo: { owner: 'test', repo: 'repo' },
      core: { info: jest.fn(), warning: jest.fn() }
    };
    issueHandler = new Issue(mockContext);
  });
  
  it('should return true if label already exists', async () => {
    mockContext.github.rest.issues.getLabel.mockResolvedValue({});
    jest.spyOn(issueHandler.config, 'get').mockReturnValue({ color: 'ffffff', description: 'test' });
    
    const result = await issueHandler.addLabel('bug');
    expect(result).toBe(true);
    expect(mockContext.github.rest.issues.createLabel).not.toHaveBeenCalled();
  });
  
  it('should create label if it does not exist and creation is enabled', async () => {
    mockContext.github.rest.issues.getLabel.mockRejectedValue({ status: 404 });
    mockContext.github.rest.issues.createLabel.mockResolvedValue({});
    jest.spyOn(issueHandler.config, 'get')
      .mockReturnValueOnce({ color: 'ff0000', description: 'Bug' })
      .mockReturnValueOnce(true);
    
    const result = await issueHandler.addLabel('bug');
    expect(result).toBe(true);
    expect(mockContext.github.rest.issues.createLabel).toHaveBeenCalledWith({
      owner: 'test',
      repo: 'repo',
      name: 'bug',
      color: 'ff0000',
      description: 'Bug'
    });
  });
});
```

## Backward Compatibility

The wrapper maintains the exact same function signature, allowing gradual migration without breaking existing code.

## Code Examples

### Before Migration

```javascript
async function reportWorkflowIssue({ github, context, core }) {
  try {
    for (const label of config('workflow').labels) {
      await utils.addLabel({ github, context, core, labelName: label });
    }
  } catch (error) {
    utils.handleError(error, core, 'report workflow issue', false);
  }
}
```

### After Migration

```javascript
async function reportWorkflowIssue({ github, context, core }) {
  try {
    const issueHandler = new Issue({ github, context, core });
    for (const label of config('workflow').labels) {
      await issueHandler.addLabel(label);
    }
  } catch (error) {
    utils.handleError(error, core, 'report workflow issue', false);
  }
}
```

## Success Criteria

- [ ] Issue handler class created
- [ ] Method correctly handles all cases
- [ ] Backward compatibility maintained
- [ ] Unit tests provide full coverage
- [ ] No breaking changes in workflows
