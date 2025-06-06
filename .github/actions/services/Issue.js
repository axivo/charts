/**
 * Issue service for GitHub issue and label operations
 * 
 * @class Issue
 * @module services/Issue
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Action = require('../core/Action');
const GraphQLService = require('./github/GraphQL');
const RestService = require('./github/Rest');

class IssueService extends Action {
  /**
   * Creates a new Issue instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.graphqlService = new GraphQLService(params);
    this.restService = new RestService(params);
  }

  /**
   * Validates if workflow has issues that warrant creating an issue
   * 
   * @private
   * @param {number} id - Workflow run ID
   * @returns {Promise<boolean>} - True if issues detected
   */
  async #validate(id) {
    return this.execute('validate workflow status', async () => {
      let hasFailures = false;
      const workflowRun = await this.restService.getWorkflowRun(id);
      if (['cancelled', 'failure'].includes(workflowRun.conclusion)) {
        return true;
      }
      const jobs = await this.restService.listJobs();
      for (const job of jobs) {
        if (job.steps) {
          const failedSteps = job.steps.filter(step => step.conclusion !== 'success');
          if (failedSteps.length) {
            hasFailures = true;
            break;
          }
        }
      }
      const hasWarnings = await this.execute('validate workflow warnings', async () => {
        const logsData = await this.restService.getWorkflowRunLogs(id);
        if (!logsData) return false;
        const regex = /(^|:)warning:/i;
        return regex.test(logsData);
      }, false);
      return hasFailures || hasWarnings;
    }, false);
  }

  /**
   * Gets chart-specific issues since the last release
   * 
   * @param {Object} chart - Chart configuration
   * @param {string} chart.name - Chart name
   * @param {string} chart.type - Chart type (application or library)
   * @returns {Promise<Array<Object>>} - Issues with chart-specific filtering
   */
  async get(chart) {
    return this.execute('get chart release issues', async () => {
      const chartPath = `${chart.type}/${chart.name}`;
      this.logger.info(`Fetching '${chartPath}' chart issues...`);
      const tagPrefix = `${chart.name}-`;
      const releases = await this.graphqlService.getReleases(tagPrefix, 1);
      const lastReleaseDate = releases.length > 0 ? new Date(releases[0].createdAt) : null;
      const allIssues = await this.graphqlService.getReleaseIssues(chart, {
        since: lastReleaseDate
      });
      const chartNameRegex = new RegExp(`chart:\\s*${chart.name}\\b`, 'i');
      const result = allIssues.filter(issue => {
        const hasChartName = chartNameRegex.test(issue.bodyText || '');
        const hasChartTypeLabel = issue.Labels.some(label => label === chart.type);
        return hasChartName && hasChartTypeLabel;
      });
      if (!result.length) {
        this.logger.info(`Found no issues for '${chartPath}' chart`);
      } else {
        const word = result.length === 1 ? 'issue' : 'issues';
        this.logger.info(`Successfully fetched ${result.length} ${word} for '${chartPath}' chart`);
      }
      return result.map(issue => ({
        Labels: issue.Labels || [],
        Number: issue.Number,
        State: issue.State,
        Title: issue.Title,
        URL: issue.URL
      }));
    }, false);
  }

  /**
   * Prepares and creates a workflow issue
   * 
   * @param {Object} context - GitHub Actions context
   * @param {Object} label - Label service instance
   * @param {Object} [template={}] - Template configuration
   * @param {string} template.content - Issue template content
   * @param {Object} template.service - Template service instance
   * @returns {Promise<Object|null>} - Created issue data or null on failure
   */
  async report(context, label, template = {}) {
    return this.execute('report workflow issue', async () => {
      const { content, service } = template;
      const hasIssues = await this.#validate(context.runId);
      if (!hasIssues) return null;
      const repoUrl = context.payload.repository.html_url;
      const isPullRequest = Boolean(context.payload.pull_request);
      const branchName = isPullRequest
        ? context.payload.pull_request.head.ref
        : context.payload.repository.default_branch;
      const commitSha = isPullRequest
        ? context.payload.pull_request.head.sha
        : context.payload.after;
      const issueBody = service.render(content, {
        Workflow: context.workflow,
        RunID: context.runId,
        Sha: commitSha,
        Branch: branchName,
        RepoURL: repoUrl
      }, { repoUrl: repoUrl });
      if (!issueBody) return null;
      const labelNames = this.config.get('workflow.labels');
      if (this.config.get('issue.createLabels') && label) {
        await Promise.all(labelNames.map(labelName => label.add(labelName)));
      }
      return this.restService.createIssue(
        this.config.get('workflow.title'),
        issueBody,
        labelNames
      );
    }, false);
  }
}

module.exports = IssueService;
