/**
 * Template service for template rendering operations
 * 
 * @class TemplateService
 * @module services/Template
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Handlebars = require('handlebars');
const Action = require('../core/Action');

class TemplateService extends Action {
  /**
   * Creates a new TemplateService instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.handlebars = Handlebars;
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
      this.handlebars.registerHelper('equal', function (key, value) {
        return key === value;
      });
      if (options.repoUrl) {
        this.handlebars.registerHelper('RepoRawURL', function () {
          return String(options.repoUrl).replace('github.com', 'raw.githubusercontent.com');
        });
      }
      return this.handlebars.compile(template)(context);
    });
  }
}

module.exports = TemplateService;
