/**
 * Label service for repository label operations
 * 
 * @module services/Label
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Action = require('../core/Action');
const GitHubService = require('./github');

/**
 * Label service for repository label operations
 * 
 * Provides repository label management including creation,
 * validation, and bulk updates based on configuration.
 * 
 * @class LabelService
 */
class LabelService extends Action {
  /**
   * Creates a new LabelService instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.restService = new GitHubService.Rest(params);
  }

  /**
   * Adds a label to the repository if it doesn't exist
   * 
   * @param {string} name - Name of the label to add
   * @returns {Promise<boolean>} True if label was created or exists
   */
  async add(name) {
    return this.execute(`add '${name}' label`, async () => {
      if (!name) {
        this.logger.warning('Label name is required');
        return false;
      }
      const labelConfig = this.config.get(`issue.labels.${name}`);
      if (!labelConfig) {
        this.logger.warning(`Label configuration not found for '${name}'`);
        return false;
      }
      const existingLabel = await this.restService.getLabel(name);
      if (existingLabel) return true;
      if (!this.config.get('issue.createLabels')) {
        this.logger.warning(`Label '${name}' not found and createLabels is disabled`);
        return false;
      }
      await this.restService.createLabel(
        name,
        labelConfig.color,
        labelConfig.description
      );
      this.logger.info(`Successfully created '${name}' label`);
      return true;
    }, false);
  }

  /**
   * Update repository labels based on configuration
   * 
   * @returns {Promise<string[]>} Array of created label names
   */
  async update() {
    return this.execute('update repository issue labels', async () => {
      if (!this.config.get('issue.createLabels')) {
        this.logger.info('Label creation is disabled in configuration, skipping label updates');
        return [];
      }
      this.logger.info('Updating repository issue labels...');
      if (this.context.workflow === 'Chart') {
        const message = 'Set "createLabels: false" after initial setup';
        await this.restService.createAnnotation(message, { level: 'warning' });
        this.logger.warning(message);
      }
      const labelNames = Object.keys(this.config.get('issue.labels'));
      const results = await Promise.all(
        labelNames.map(async labelName => {
          const created = await this.add(labelName);
          return created ? labelName : null;
        })
      );
      const createdLabels = results.filter(Boolean);
      if (createdLabels.length) {
        this.logger.info(`Successfully updated ${createdLabels.length} issue labels`);
      }
      return createdLabels;
    }, false);
  }
}

module.exports = LabelService;
