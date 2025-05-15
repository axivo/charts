# Migration: configureGitRepository()

## 🚫 MANDATORY CODING GUIDELINES

### THESE RULES ARE NON-NEGOTIABLE:
1. **NO EMPTY LINES INSIDE FUNCTIONS**
2. **NO COMMENTS INSIDE FUNCTIONS**
3. **JSDOC ONLY FOR DOCUMENTATION**
4. **NO INLINE COMMENTS IN CODE**
5. **FOLLOW EXISTING PATTERNS**

## Current Implementation

Multiple functions across files use similar Git operations:

```javascript
// In documentation.js, chart.js, and others
const runGit = async (args) => (await exec.getExecOutput('git', args)).stdout.trim();
await runGit(['pull', 'origin', headRef]);
await runGit(['add', ...files]);
```

Also `configureGitRepository` in `utils.js`:

```javascript
async function configureGitRepository({ core, exec }) {
  try {
    const userEmail = config('repository').user.email;
    const userName = config('repository').user.name;
    await exec.exec('git', ['config', 'user.email', userEmail]);
    await exec.exec('git', ['config', 'user.name', userName]);
  } catch (error) {
    utils.handleError(error, core, 'set Git identity');
  }
}
```

## Target Implementation

### GitService Class

```javascript
// services/GitService.js
export class GitService {
  constructor(exec, config, logger) {
    this.exec = exec;
    this.config = config;
    this.logger = logger;
  }

  async execute(args, options = {}) {
    try {
      const result = await this.exec.getExecOutput('git', args, {
        silent: options.silent ?? true
      });
      return result.stdout.trim();
    } catch (error) {
      throw new GitError(`git ${args[0]}`, error);
    }
  }

  async configure() {
    const user = this.config.get('repository.user');
    await this.execute(['config', 'user.email', user.email]);
    await this.execute(['config', 'user.name', user.name]);
    this.logger.info('Git repository configured successfully');
  }

  async getCurrentBranch() {
    return this.execute(['rev-parse', '--abbrev-ref', 'HEAD']);
  }

  async pull(remote = 'origin', branch) {
    const targetBranch = branch || await this.getCurrentBranch();
    this.logger.info(`Pulling latest changes from ${remote}/${targetBranch}`);
    return this.execute(['pull', remote, targetBranch]);
  }

  async add(files) {
    if (!files.length) return;
    return this.execute(['add', ...files]);
  }

  async commit(message, options = {}) {
    const args = ['commit', '-m', message];
    if (options.signoff) args.push('--signoff');
    if (options.noVerify) args.push('--no-verify');
    return this.execute(args);
  }

  async push(remote = 'origin', branch) {
    const targetBranch = branch || await this.getCurrentBranch();
    return this.execute(['push', remote, targetBranch]);
  }

  async getStagedChanges() {
    const additions = await this.execute([
      'diff', '--staged', '--name-status', '--diff-filter=ACMRT'
    ]);
    
    const deletions = await this.execute([
      'diff', '--staged', '--name-status', '--diff-filter=D'
    ]);

    return {
      additions: this.parseGitStatus(additions),
      deletions: this.parseGitStatus(deletions)
    };
  }

  parseGitStatus(output) {
    if (!output) return [];
    
    return output.split('\n')
      .filter(Boolean)
      .map(line => {
        const [status, ...pathParts] = line.split('\t');
        const path = pathParts.join('\t');
        return { status, path };
      });
  }

  async getRevision(ref = 'HEAD') {
    return this.execute(['rev-parse', ref]);
  }

  async switch(branch) {
    return this.execute(['switch', branch]);
  }

  async fetch(remote = 'origin', branch) {
    const args = ['fetch', remote];
    if (branch) args.push(branch);
    return this.execute(args);
  }
}
```

## Migration Steps

1. Create `GitService` class in `services/GitService.js`
2. Update functions to use GitService:

### Example Migration - documentation.js

```javascript
// Before
async function updateDocumentation({ github, context, core, exec, dirs = [] }) {
  const runGit = async (args) => (await exec.getExecOutput('git', args)).stdout.trim();
  const headRef = process.env.GITHUB_HEAD_REF;
  await runGit(['fetch', 'origin', headRef]);
  await runGit(['switch', headRef]);
  // ...
}

// After
async function updateDocumentation({ github, context, core, exec, dirs = [] }) {
  const gitService = new GitService(exec, config, core);
  const headRef = process.env.GITHUB_HEAD_REF;
  await gitService.fetch('origin', headRef);
  await gitService.switch(headRef);
  // ...
}
```

### Example Migration - utils.js

```javascript
// Before
async function configureGitRepository({ core, exec }) {
  try {
    const userEmail = config('repository').user.email;
    const userName = config('repository').user.name;
    await exec.exec('git', ['config', 'user.email', userEmail]);
    await exec.exec('git', ['config', 'user.name', userName]);
  } catch (error) {
    utils.handleError(error, core, 'set Git identity');
  }
}

// After (temporary adapter)
async function configureGitRepository({ core, exec }) {
  const gitService = new GitService(exec, config, core);
  try {
    await gitService.configure();
  } catch (error) {
    utils.handleError(error, core, 'set Git identity');
  }
}
```

## Reused Patterns

### 1. Git Execute Pattern
- Used in: documentation.js, chart.js, release.js
- Extracted to: `GitService.execute()`

### 2. Staged Changes Pattern
- Used in: utils.js, chart.js
- Extracted to: `GitService.getStagedChanges()`

### 3. Branch Operations Pattern
- Used in: documentation.js, release.js
- Extracted to: `GitService.switch()`, `GitService.fetch()`

## Benefits

1. **Single Source of Truth**: All Git operations in one place
2. **Error Handling**: Consistent Git error handling
3. **Testability**: Easy to mock Git operations
4. **Reusability**: Common patterns extracted and reused
5. **Type Safety**: Well-defined method signatures

## Testing

```javascript
// tests/services/GitService.test.js
describe('GitService', () => {
  let gitService;
  let mockExec;
  let mockConfig;
  let mockLogger;

  beforeEach(() => {
    mockExec = {
      getExecOutput: jest.fn().mockResolvedValue({ stdout: 'output\n' })
    };
    mockConfig = {
      get: jest.fn().mockReturnValue({ email: 'test@test.com', name: 'Test' })
    };
    mockLogger = { info: jest.fn() };
    gitService = new GitService(mockExec, mockConfig, mockLogger);
  });

  it('should execute git commands', async () => {
    const result = await gitService.execute(['status']);
    expect(result).toBe('output');
    expect(mockExec.getExecOutput).toHaveBeenCalledWith('git', ['status'], { silent: true });
  });

  it('should handle git errors', async () => {
    mockExec.getExecOutput.mockRejectedValue(new Error('git failed'));
    await expect(gitService.execute(['status'])).rejects.toThrow(GitError);
  });
});
```

## Usage Count

Pattern usage across files:
- `runGit` pattern: 15+ occurrences
- `configureGitRepository`: 2 occurrences
- `getGitStagedChanges`: 3 occurrences

## Dependencies

- Depends on: `GitError` from error classes
- Used by: All modules that perform Git operations
