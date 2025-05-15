# Migration: fileExists()

## 🚫 MANDATORY CODING GUIDELINES

### THESE RULES ARE NON-NEGOTIABLE:
1. **NO EMPTY LINES INSIDE FUNCTIONS**
2. **NO COMMENTS INSIDE FUNCTIONS**
3. **JSDOC ONLY FOR DOCUMENTATION**
4. **NO INLINE COMMENTS IN CODE**
5. **FOLLOW EXISTING PATTERNS**

## Current Implementation

- Location: `utils.js - fileExists()`
- Purpose: Check if a file exists without throwing exceptions
- Dependencies: Node.js `fs/promises` module
- Used by: Multiple functions across all modules

```javascript
/**
 * Checks if a file exists without throwing exceptions
 * 
 * @param {string} path - Path to the file to check
 * @returns {Promise<boolean>} - True if file exists, false otherwise
 */
async function fileExists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
```

## Code Analysis

This is a utility function that wraps Node.js `fs.access()` to provide a boolean result instead of throwing exceptions. It's used throughout the codebase to safely check file existence before operations.

## Target Architecture

- Target Class: `File`
- Target Method: `exists()`
- New Dependencies: `Error` class for error handling

## Implementation Steps

### Step 1: Create File Service Class

Create `services/File.js`:

```javascript
/**
 * File system operations service
 * 
 * @module services/File
 */
const fs = require('fs/promises');
const Action = require('../core/Action');

class File extends Action {
  /**
   * Creates a new File service instance
   * 
   * @param {Object} context - Execution context
   */
  constructor(context) {
    super(context);
  }
  
  /**
   * Checks if a file exists without throwing exceptions
   * 
   * @param {string} path - Path to the file to check
   * @returns {Promise<boolean>} - True if file exists, false otherwise
   */
  async exists(path) {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = File;
```

### Step 2: Add Backward Compatibility

Update `utils.js`:

```javascript
const File = require('./.github/actions/services/File');
let fileInstance;

/**
 * Checks if a file exists without throwing exceptions
 * 
 * @param {string} path - Path to the file to check
 * @returns {Promise<boolean>} - True if file exists, false otherwise
 */
async function fileExists(path) {
  if (!fileInstance) {
    fileInstance = new File({ core: global.core });
  }
  return fileInstance.exists(path);
}
```

### Step 3: Update Calling Code

Search for all uses of `fileExists()` and gradually update them:

```javascript
// Before
if (await utils.fileExists(appYamlPath)) {
  const appConfig = yaml.load(await fs.readFile(appYamlPath, 'utf8'));
}

// After
const fileService = new File(context);
if (await fileService.exists(appYamlPath)) {
  const appConfig = yaml.load(await fs.readFile(appYamlPath, 'utf8'));
}
```

## Testing Strategy

```javascript
const File = require('../services/File');

describe('File Service', () => {
  let fileService;
  let mockContext;
  
  beforeEach(() => {
    mockContext = { core: { info: jest.fn() } };
    fileService = new File(mockContext);
  });
  
  it('should return true when file exists', async () => {
    const result = await fileService.exists('/existing/file.txt');
    expect(result).toBe(true);
  });
  
  it('should return false when file does not exist', async () => {
    const result = await fileService.exists('/non/existing/file.txt');
    expect(result).toBe(false);
  });
});
```

## Backward Compatibility

The wrapper function in `utils.js` maintains full compatibility with existing code. The function signature remains unchanged, allowing gradual migration.

## Code Examples

### Before Migration

```javascript
if (await utils.fileExists(chartLockPath)) {
  const originalHash = await calculateFileHash(chartLockPath);
  await exec.exec('helm', ['dependency', 'update', chartDir]);
  const newHash = await calculateFileHash(chartLockPath);
  if (originalHash !== newHash) {
    lockFiles.push(chartLockPath);
  }
}
```

### After Migration

```javascript
const fileService = new File(context);
if (await fileService.exists(chartLockPath)) {
  const originalHash = await calculateFileHash(chartLockPath);
  await exec.exec('helm', ['dependency', 'update', chartDir]);
  const newHash = await calculateFileHash(chartLockPath);
  if (originalHash !== newHash) {
    lockFiles.push(chartLockPath);
  }
}
```

## Success Criteria

- [ ] File service class created
- [ ] Backward compatibility maintained
- [ ] All tests passing
- [ ] No breaking changes in workflows
- [ ] Gradual migration path established
