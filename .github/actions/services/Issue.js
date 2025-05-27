/**
 * Issue service for GitHub issue and label operations
 * 
 * @class Issue
 * @module services/Issue
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Action = require('../core/Action');

class Issue extends Action {
  /**
   * Creates a new Issue instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
  }

  /**
   * Validates if workflow has issues that warrant creating an issue
   * 
   * @private
   * @param {Object} context - GitHub Actions context
   * @returns {Promise<boolean>} - True if issues detected
   */
  async #validate(context) {
    try {
      return false;
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'validate workflow status',
        fatal: false
      });
      return false;
    }
  }

  /**
   * Creates a GitHub issue
   * 
   * @param {Object} params - Issue creation parameters
   * @param {string} params.title - Issue title
   * @param {string} params.body - Issue body
   * @param {Array<string>} params.labels - Issue labels
   * @returns {Promise<Object|null>} - Created issue data or null on failure
   */
  async create(params) {
    return this.execute(`create issue: '${params.title}'`, async () => {
      this.logger.info(`Creating issue: ${params.title}`);
      const response = await this.github.rest.issues.create({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        title: params.title,
        body: params.body,
        labels: params.labels || []
      });
      this.logger.info(`Created issue #${response.data.number}: ${response.data.title}`);
      return {
        id: response.data.id,
        number: response.data.number,
        title: response.data.title,
        url: response.data.html_url
      };
    }, false);
  }

  /**
   * Prepares and creates a workflow issue
   * 
   * @param {Object} params - Parameters for workflow issue
   * @param {Object} params.context - GitHub Actions context
   * @param {string} params.templateContent - Issue template content
   * @param {Object} params.templateService - Template service instance
   * @param {Object} params.labelService - Label service instance
   * @returns {Promise<Object|null>} - Created issue data or null on failure
   */
  async report(params) {
    return this.execute('report workflow issue', async () => {
      const hasIssues = await this.#validate(params.context);
      if (!hasIssues) {
        return null;
      }
      const context = params.context || this.context;
      const repoUrl = context.payload.repository.html_url;
      const isPullRequest = Boolean(context.payload.pull_request);
      const branchName = isPullRequest
        ? context.payload.pull_request.head.ref
        : context.payload.repository.default_branch;
      const commitSha = isPullRequest
        ? context.payload.pull_request.head.sha
        : context.payload.after;
      const templateContent = params.templateContent;
      const issueBody = params.templateService.render(templateContent, {
        Workflow: context.workflow,
        RunID: context.runId,
        Sha: commitSha,
        Branch: branchName,
        RepoURL: repoUrl
      }, { repoUrl });
      const labelNames = this.config.get('workflow.labels');
      if (this.config.get('issue.createLabels') && params.labelService) {
        await Promise.all(labelNames.map(label => params.labelService.add(label)));
      }
      return this.create({
        title: this.config.get('workflow.title'),
        body: issueBody,
        labels: labelNames
      });
    }, false);
  }
}

module.exports = Issue;
