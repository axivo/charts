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
const { TemplateError } = require('../utils/errors');

class Template extends Action {
  /**
   * Creates a new Template instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.handlebars = Handlebars.create();
    this.isEqual();
  }

  /**
   * Compiles a template
   * 
   * @param {string} template - Template string to compile
   * @returns {Function} - Compiled template function
   */
  compile(template) {
    try {
      return this.execute('compile', () => this.handlebars.compile(template));
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'compile template',
        fatal: false
      });
      return null;
    }
  }

  /**
   * Executes a template operation with error handling
   * 
   * @param {string} operation - Operation name for error reporting
   * @param {Function} action - Function to execute
   * @returns {any} - Result of the action
   */
  execute(operation, action) {
    try {
      return action();
    } catch (error) {
      throw new TemplateError(operation, error);
    }
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
   * Registers helper for equality comparison
   */
  isEqual() {
    this.execute('register isEqual helper', () => {
      this.handlebars.registerHelper('isEqual', function (a, b) {
        return a === b;
      });
      this.logger.info('Registered isEqual helper');
    });
  }

  /**
   * Registers helper for repository URL transformation
   * 
   * @param {string} repoUrl - Repository URL
   */
  setRepoRawUrl(repoUrl) {
    this.execute('register repository raw URL helper', () => {
      this.handlebars.registerHelper('RepoRawURL', function () {
        return String(repoUrl).replace('github.com', 'raw.githubusercontent.com');
      });
      this.logger.info('Registered repository raw URL helper');
    });
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
    try {
      this.logger.info('Rendering template');
      if (options.repoUrl) {
        this.setRepoRawUrl(options.repoUrl);
      }
      const compiledTemplate = this.compile(template);
      if (!compiledTemplate) {
        throw new Error('Failed to compile template');
      }
      const result = this.execute('render', () => compiledTemplate(context));
      this.logger.info('Template rendered successfully');
      return result;
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'render template',
        fatal: false
      });
      return null;
    }
  }
}

module.exports = Template;
