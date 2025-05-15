# Migration: getGitStagedChanges()

## 🚫 MANDATORY CODING GUIDELINES

### THESE RULES ARE NON-NEGOTIABLE:
1. **NO EMPTY LINES INSIDE FUNCTIONS**
2. **NO COMMENTS INSIDE FUNCTIONS**
3. **JSDOC ONLY FOR DOCUMENTATION**
4. **NO INLINE COMMENTS IN CODE**
5. **FOLLOW EXISTING PATTERNS**

## Current Implementation

- Location: `utils.js - getGitStagedChanges()`
- Purpose: Get staged changes from Git for creating commits
- Dependencies: Git command execution
- Used by: `_performGitCommit()`, `updateDocumentation()`

```javascript
/**
 * Gets staged changes from Git for commit preparation
 * 
 * @param {Function} runGit - Function to execute git commands
 * @returns {Promise<Object>} - Object with additions and deletions arrays
 */
async function getGitStagedChanges(runGit) {
  const additions = await runGit([
    'diff', '--staged', '--name-status', '--diff-filter=ACMRT'
  ]);
  const deletions = await runGit([
    'diff', '--staged', '--name-status', '--diff-filter=D'
  ]);
  const parseChanges = (output) => {
    if (!output) return [];
    return output.split('\n')
      .filter(Boolean)
      .map(line => {
        const [status, ...pathParts] = line.split('\t');
        const path = pathParts.join('\t');
        return { status, path };
      });
  };
  return {
    additions: parseChanges(additions),
    deletions: parseChanges(deletions)
  };
}
```

## Code Analysis

This function parses Git's staged changes to identify files that have been added, modified, or deleted. It's used before creating commits to prepare the file lists for GitHub's GraphQL API.

## Target Architecture

- Target Class: `Git`
- Target Method: `getStagedChanges()`
- New Dependencies: None (uses existing Git service)

## Implementation Steps

### Step 1: Add Method to Git Service

Update `services/Git.js`:

```javascript
class Git extends Action {
  constructor(context) {
    super(context);
    this.exec = context.exec;
  }
  
  async execute(args, options = {}) {
    try {
      const result = await this.exec.getExecOutput('git', args, {
        silent: options.silent ?? true
      });
      return result.stdout.trim();
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: `git ${args[0]}`,
        fatal: options.fatal ?? true
      });
    }
  }
  
  /**
   * Gets staged changes from Git for commit preparation
   * 
   * @returns {Promise<Object>} - Object with additions and deletions arrays
   */
  async getStagedChanges() {
    const additions = await this.execute([
      'diff', '--staged', '--name-status', '--diff-filter=ACMRT'
    ]);
    const deletions = await this.execute([
      'diff', '--staged', '--name-status', '--diff-filter=D' 
    ]);
    const parseChanges = (output) => {
      if (!output) return [];
      return output.split('\n')
        .filter(Boolean)
        .map(line => {
          const [status, ...pathParts] = line.split('\t');
          const path = pathParts.join('\t');
          return { status, path };
        });
    };
    return {
      additions: parseChanges(additions),
      deletions: parseChanges(deletions)
    };
  }
}

module.exports = Git;
```

### Step 2: Add Backward Compatibility

Update `utils.js`:

```javascript
/**
 * Gets staged changes from Git for commit preparation
 * 
 * @param {Function} runGit - Function to execute git commands
 * @returns {Promise<Object>} - Object with additions and deletions arrays
 */
async function getGitStagedChanges(runGit) {
  const Git = require('./.github/actions/services/Git');
  const gitService = new Git({ exec: { getExecOutput: async (cmd, args) => ({ stdout: await runGit(args) }) } });
  return gitService.getStagedChanges();
}
```

### Step 3: Update Calling Code

Search for uses and update them:

```javascript
// Before (in _performGitCommit)
const { additions, deletions } = await utils.getGitStagedChanges(runGit);

// After
const gitService = new Git(context);
const { additions, deletions } = await gitService.getStagedChanges();
```

## Testing Strategy

```javascript
const Git = require('../services/Git');

describe('Git Service - getStagedChanges', () => {
  let gitService;
  let mockContext;
  
  beforeEach(() => {
    mockContext = {
      exec: {
        getExecOutput: jest.fn()
      },
      core: { info: jest.fn() }
    };
    gitService = new Git(mockContext);
  });
  
  it('should parse staged additions correctly', async () => {
    mockContext.exec.getExecOutput
      .mockResolvedValueOnce({ stdout: 'A\tfile1.js\nM\tfile2.js\n' })
      .mockResolvedValueOnce({ stdout: '' });
    
    const result = await gitService.getStagedChanges();
    expect(result.additions).toHaveLength(2);
    expect(result.additions[0]).toEqual({ status: 'A', path: 'file1.js' });
    expect(result.deletions).toHaveLength(0);
  });
  
  it('should handle files with tabs in paths', async () => {
    mockContext.exec.getExecOutput
      .mockResolvedValueOnce({ stdout: 'A\tfile\twith\ttabs.js\n' })
      .mockResolvedValueOnce({ stdout: '' });
    
    const result = await gitService.getStagedChanges();
    expect(result.additions[0].path).toBe('file\twith\ttabs.js');
  });
});
```

## Backward Compatibility

The wrapper adapts the old function signature to work with the new service, maintaining compatibility with existing code.

## Code Examples

### Before Migration

```javascript
async function _performGitCommit({ github, context, core, exec, files, type }) {
  try {
    const runGit = async (args) => (await exec.getExecOutput('git', args)).stdout.trim();
    await runGit(['add', ...files]);
    const { additions, deletions } = await utils.getGitStagedChanges(runGit);
    if (additions.length + deletions.length) {
      await api.createSignedCommit({ github, context, core, git: { additions, deletions } });
    }
  } catch (error) {
    utils.handleError(error, core, `commit ${type}`, false);
  }
}
```

### After Migration

```javascript
async function _performGitCommit({ github, context, core, exec, files, type }) {
  try {
    const gitService = new Git({ exec });
    await gitService.add(files);
    const { additions, deletions } = await gitService.getStagedChanges();
    if (additions.length + deletions.length) {
      await api.createSignedCommit({ github, context, core, git: { additions, deletions } });
    }
  } catch (error) {
    utils.handleError(error, core, `commit ${type}`, false);
  }
}
```

## Success Criteria

- [ ] Method added to Git service
- [ ] Backward compatibility maintained
- [ ] Tests cover all edge cases
- [ ] No regression in existing functionality
- [ ] Code follows established patterns
