# Workflow Helper Scripts

This directory contains helper scripts used by GitHub Actions workflows in the repository.

## Script Overview

- `git-config.js` - Git configuration utilities for setting up GitHub Actions bot identity
- `git-helpers.js` - Enhanced Git operations with retry mechanisms and error handling
- `git-signed-commit.js` - Creates verified commits using GitHub's GraphQL API
- `fs-helpers.js` - Filesystem utilities for workflow operations

## Usage Examples

### Git Helpers

```javascript
const safeGitPush = require('./.github/scripts/git-helpers.js');
const { safeBranchSwitch } = safeGitPush;

// Push with automatic conflict resolution
await safeGitPush({ 
  runGit, 
  core, 
  branch: 'gh-pages' 
});

// Switch branches with robust error handling
await safeBranchSwitch({
  runGit,
  core,
  branch: 'feature-branch',
  baseBranch: 'main',
  createIfNotExists: true
});
```

### Git Configuration

```javascript
const configureGit = require('./.github/scripts/git-config.js');
const runGit = await configureGit({github, context, core, exec});
```

### Signed Commits

```javascript
const createSignedCommit = require('./.github/scripts/git-signed-commit.js');

await createSignedCommit({
  github,
  context,
  core,
  branchName: 'gh-pages',
  expectedHeadOid: await runGit(['rev-parse', 'HEAD']),
  additions: [{ 
    path: 'index.md', 
    contents: Buffer.from(content).toString('base64') 
  }],
  commitMessage: 'Update documentation'
});
```

### File Operations

```javascript
const fileExists = require('./.github/scripts/fs-helpers.js');

if (await fileExists('path/to/file.md')) {
  // File exists, perform operations
}
```

## Maintenance

When adding new functionality to workflows, consider whether the functionality should be added to these helper scripts to promote code reuse and maintainability.
