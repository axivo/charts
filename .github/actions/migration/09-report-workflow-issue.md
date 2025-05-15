# Migration: reportWorkflowIssue

## Current Implementation

- **Location**: `.github/scripts/utils.js - reportWorkflowIssue()`
- **Purpose**: Detects workflow failures/warnings and creates GitHub issues to track problems
- **Dependencies**: 
  - `github-api.checkWorkflowRunStatus()` to check for failures
  - `config()` for issue templates and labels
  - `registerHandlebarsHelpers()` for template processing
  - `addLabel()` for creating required labels
  - `handleError()` for error handling
- **Used by**: Chart workflows to report issues when failures or warnings are detected

## Code Analysis

```javascript
async function reportWorkflowIssue({ github, context, core }) {
  const api = require('./github-api');
  let hasIssues = await api.checkWorkflowRunStatus({ github, context, core, runId: context.runId });
  if (config('issue').createLabels && context.workflow === 'Chart') {
    core.warning('Set "createLabels: false" in config.js after initial setup, to optimize workflow performance.');
    hasIssues = true;
  }
  if (!hasIssues) {
    core.info('No failures or warnings detected, skipping issue creation');
    return;
  }
  try {
    core.info('Creating workflow issue...');
    const repoUrl = context.payload.repository.html_url;
    const isPullRequest = Boolean(context.payload.pull_request);
    const branchName = isPullRequest
      ? context.payload.pull_request.head.ref
      : context.payload.repository.default_branch;
    const commitSha = isPullRequest
      ? context.payload.pull_request.head.sha
      : context.payload.after;
    const templateContent = await fs.readFile(config('workflow').template, 'utf8');
    const handlebars = registerHandlebarsHelpers(repoUrl);
    const template = handlebars.compile(templateContent);
    const issueBody = template({
      Workflow: context.workflow,
      RunID: context.runId,
      Sha: commitSha,
      Branch: branchName,
      RepoURL: repoUrl
    });
    const labelNames = config('workflow').labels;
    if (config('issue').createLabels) {
      const results = await Promise.all(labelNames.map(async label => {
        return await addLabel({ github, context, core, labelName: label });
      }));
    }
    await github.rest.issues.create({
      owner: context.repo.owner,
      repo: context.repo.repo,
      title: config('workflow').title,
      body: issueBody,
      labels: labelNames
    });
    core.info('Successfully created workflow issue');
  } catch (error) {
    handleError(error, core, 'create workflow issue', false);
  }
}
```

The function:
1. Checks for workflow failures or warnings using the GitHub API
2. Adds a warning if label creation is enabled in Chart workflow
3. Reads and compiles Handlebars template for issue body
4. Creates labels if needed
5. Creates a GitHub issue with workflow details
6. Handles errors as non-fatal

## Target Architecture

- **Target Class**: `Issue` (in `/handlers/Issue.js`)
- **Target Method**: `reportWorkflowIssue()`
- **New Dependencies**: 
  - `GitHub` class for workflow status checks
  - `Template` service for Handlebars processing
  - `File` service for reading templates
  - Base handler class for configuration and logging

## Implementation Steps

1. Add the `reportWorkflowIssue()` method to the `Issue` handler
2. Inject `GitHub`, `Template`, and `File` services as dependencies
3. Implement the same logic using the new architecture
4. Create backward compatibility adapter
5. Test with existing workflows
6. Update calling code
7. Remove legacy function

## New Implementation

```javascript
// handlers/Issue.js
const Handler = require('../core/Handler');
const Template = require('../services/Template');
const File = require('../services/File');

class Issue extends Handler {
  constructor(context) {
    super(context);
    this.templateService = new Template(context);
    this.fileService = new File(context);
  }

  /**
   * Report workflow issues by creating GitHub issue
   * @returns {Promise<void>}
   */
  async reportWorkflowIssue() {
    let hasIssues = await this.github.checkWorkflowRunStatus(this.context.runId);
    if (this.config.get('issue').createLabels && this.context.workflow === 'Chart') {
      this.logger.warning('Set "createLabels: false" in config.js after initial setup, to optimize workflow performance.');
      hasIssues = true;
    }
    if (!hasIssues) {
      this.logger.info('No failures or warnings detected, skipping issue creation');
      return;
    }
    try {
      this.logger.info('Creating workflow issue...');
      const repoUrl = this.context.payload.repository.html_url;
      const isPullRequest = Boolean(this.context.payload.pull_request);
      const branchName = isPullRequest
        ? this.context.payload.pull_request.head.ref
        : this.context.payload.repository.default_branch;
      const commitSha = isPullRequest
        ? this.context.payload.pull_request.head.sha
        : this.context.payload.after;
      const templateContent = await this.fileService.read(this.config.get('workflow').template);
      const issueBody = this.templateService.render(templateContent, {
        Workflow: this.context.workflow,
        RunID: this.context.runId,
        Sha: commitSha,
        Branch: branchName,
        RepoURL: repoUrl
      }, { repoUrl });
      const labelNames = this.config.get('workflow').labels;
      if (this.config.get('issue').createLabels) {
        await Promise.all(labelNames.map(label => this.addLabel(label)));
      }
      await this.github.rest.issues.create({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        title: this.config.get('workflow').title,
        body: issueBody,
        labels: labelNames
      });
      this.logger.info('Successfully created workflow issue');
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'create workflow issue',
        fatal: false
      });
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

async function reportWorkflowIssue({ github, context, core }) {
  if (!issueInstance) {
    issueInstance = new Issue({ github, context, core });
  }
  return issueInstance.reportWorkflowIssue();
}

module.exports = {
  reportWorkflowIssue,
  // ... other functions
};
```

## Testing Strategy

1. Create unit tests for the `Issue.reportWorkflowIssue()` method
2. Test workflow status checking
3. Test template rendering with correct context
4. Test label creation when enabled
5. Test issue creation with proper fields
6. Test branch/SHA detection for PR vs push events
7. Test error handling (non-fatal)
8. Run integration tests with mock GitHub API

## Migration Validation

1. Verify workflow status is checked correctly
2. Verify template is rendered with correct variables
3. Verify issue is created with proper title and body
4. Verify labels are created when enabled
5. Verify warning message for Chart workflow
6. Verify branch/commit detection for different event types
7. Verify error handling is non-fatal

## Considerations

- The GitHub wrapper will need a `checkWorkflowRunStatus()` method
- Template service will need Handlebars helper registration
- The function relies on multiple services working together
- Error handling must remain non-fatal to prevent workflow failures
- The Issue handler will need both `addLabel()` and `reportWorkflowIssue()` methods
