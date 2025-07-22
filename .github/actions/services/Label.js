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
   * Sets a label to the repository
   * 
   * @private
   * @param {string} name - Name of the label to set
   * @returns {Promise<boolean>} True if label was created or updated
   */
  async #set(name) {
    return this.execute(`set '${name}' label`, async () => {
      if (!name) {
        this.logger.warning('Label name is required');
        return false;
      }
      const labelConfig = this.config.get(`issue.labels.${name}`);
      if (!labelConfig) {
        this.logger.warning(`Label '${name}' configuration not found`);
        return false;
      }
      const existingLabel = await this.restService.getLabel(name);
      const method = existingLabel ? 'updateLabel' : 'createLabel';
      await this.restService[method](
        name,
        labelConfig.color,
        labelConfig.description
      );
      return true;
    }, false);
  }

  /**
   * Update repository labels based on configuration
   * 
   * @returns {Promise<void>}
   */
  async update() {
    return this.execute('update repository issue labels', async () => {
      this.logger.info('Updating repository issue labels...');
      const message = 'Set "updateLabels: false" after initial setup';
      await this.restService.createAnnotation(message, { level: 'warning' });
      this.logger.warning(message);
      const labelNames = Object.keys(this.config.get('issue.labels'));
      await Promise.all(
        labelNames.map(async labelName => {
          await this.#set(labelName);
        })
      );
      this.logger.info(`Successfully updated ${labelNames.length} issue labels`);
    }, false);
  }
}

module.exports = LabelService;
