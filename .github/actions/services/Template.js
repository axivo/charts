/**
 * Template service for template rendering operations
 * 
 * @class Template
 * @module services/Template
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Handlebars = require('handlebars');
const Action = require('../core/Action');

class Template extends Action {
  /**
   * Creates a new Template instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.handlebars = Handlebars.create();
  }

  /**
   * Registers helper for equality comparison
   * 
   * @private
   * @returns {*} - Result of the execute operation
   */
  #registerEqual() {
    return this.execute('register equal helper', () => {
      this.handlebars.registerHelper('equal', function (key, value) {
        return key === value;
      });
      this.logger.info(`Successfully registered 'equal' helper`);
    });
  }

  /**
   * Registers helper for repository URL transformation
   * 
   * @private
   * @param {string} url - Repository URL
   * @returns {*} - Result of the execute operation
   */
  #registerRepoRawUrl(url) {
    return this.execute('register RepoRawURL helper', () => {
      this.handlebars.registerHelper('RepoRawURL', function () {
        return String(url).replace('github.com', 'raw.githubusercontent.com');
      });
      this.logger.info(`Successfully registered 'RepoRawURL' helper`);
    });
  }

  /**
   * Compiles a template
   * 
   * @param {string} template - Template string to compile
   * @returns {Function} - Compiled template function
   */
  compile(template) {
    return this.execute('compile template', () => this.handlebars.compile(template));
  }

  /**
   * Gets the configured Handlebars instance
   * 
   * @returns {Object} - Handlebars instance
   */
  get() {
    return this.handlebars;
  }

  /**
   * Renders a template with provided context
   * 
   * @param {string} template - Template string to render
   * @param {Object} context - Data context for the template
   * @param {Object} options - Additional options
   * @param {string} options.repoUrl - Repository URL for repo-specific helpers
   * @returns {string} - Rendered template
   */
  render(template, context, options = {}) {
    return this.execute('render template', () => {
      this.logger.info('Rendering template...');
      this.#registerEqual();
      if (options.repoUrl) {
        this.#registerRepoRawUrl(options.repoUrl);
      }
      const result = this.handlebars.compile(template)(context);
      this.logger.info('Successfully rendered template');
      return result;
    }, false);
  }
}

module.exports = Template;
