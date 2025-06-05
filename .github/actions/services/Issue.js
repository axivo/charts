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
   * @param {Object} context - GitHub Actions context
   * @returns {Promise<boolean>} - True if issues detected
   */
  async #validate(context) {
    try {
      let hasFailures = false;
      const workflowRun = await this.restService.getWorkflowRun(context.runId);
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
      const logsResponse = await this.github.rest.actions.downloadWorkflowRunLogs({
        owner: context.repo.owner,
        repo: context.repo.repo,
        run_id: parseInt(context.runId, 10)
      });
      const regex = /(^|:)warning:/i;
      const hasWarnings = regex.test(logsResponse.data);
      return hasFailures || hasWarnings;
    } catch (error) {
      if (error.status === 404) return false;
      this.actionError.report({
        operation: 'validate workflow status',
        fatal: false
      }, error);
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
   * Gets chart-specific issues since the last release
   * 
   * @param {Object} params - Function parameters
   * @param {Object} params.chart - Chart configuration
   * @param {string} params.chart.name - Chart name
   * @param {string} params.chart.type - Chart type (application or library)
   * @returns {Promise<Array<Object>>} - Issues with chart-specific filtering
   */
  async get({ chart }) {
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

module.exports = IssueService;
