/**
 * Helm service for Helm CLI operations
 * 
 * @class Helm
 * @module services/helm
 * @author AXIVO
 * @license BSD-3-Clause
 */
const path = require('path');
const Action = require('../../core/Action');
const ShellService = require('../Shell');

class HelmService extends Action {
  /**
   * Creates a new Helm service instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.shellService = new ShellService(params);
  }

  /**
   * Logs into an OCI registry
   * 
   * @param {string} registry - OCI registry URL
   * @param {string} username - Registry username
   * @param {string} password - Registry password
   * @returns {Promise<boolean>} - True if login was successful
   */
  async login(registry, username, password) {
    return this.execute(`login to '${registry}' OCI registry`, async () => {
      this.logger.info(`Logging into '${registry}' OCI registry...`);
      await this.shellService.execute('helm', ['registry', 'login', registry, '-u', username, '--password-stdin'], {
        input: Buffer.from(password),
        silent: true
      });
      this.logger.info(`Successfully logged into '${registry}' OCI registry`);
      return true;
    }, false);
  }

  /**
   * Generates a Helm repository index file
   * 
   * @param {string} directory - Directory containing chart packages
   * @param {Object} options - Index options
   * @param {string} options.url - URL prefix for chart references
   * @param {string} options.merge - Path to existing index file to merge with
   * @param {boolean} options.generateMetadata - Generate missing metadata from chart contents
   * @returns {Promise<boolean>} - True if index was generated successfully
   */
  async generateIndex(directory, options = {}) {
    try {
      const args = ['repo', 'index', directory];
      if (options.url) args.push('--url', options.url);
      if (options.merge) args.push('--merge', options.merge);
      if (options.generateMetadata) args.push('--generate-metadata');
      this.logger.info(`Generating index file for '${directory}' directory...`);
      await this.execute('generate index file', async () => {
        return await this.shellService.execute('helm', args);
      });
      this.logger.info(`Successfully generated index file for ${directory} directory`);
      return true;
    } catch (error) {
      this.actionError.report({
        operation: `generate index file for '${directory}' directory`,
        fatal: false
      }, error);
      return false;
    }
  }

  /**
   * Packages a chart
   * 
   * @param {string} directory - Chart directory
   * @param {Object} options - Package options
   * @param {string} options.destination - Destination directory
   * @returns {Promise<string>} - Path to packaged chart
   */
  async package(directory, options = {}) {
    try {
      const args = ['package', directory];
      if (options.destination) args.push('--destination', options.destination);
      if (options.version) args.push('--version', options.version);
      if (options.appVersion) args.push('--app-version', options.appVersion);
      this.logger.info(`Packaging chart to '${directory}' directory...`);
      const output = await this.execute('package chart', async () => {
        return await this.shellService.execute('helm', args, { output: true });
      });
      const lines = output.split('\n');
      let packagePath = null;
      for (const line of lines) {
        if (line.includes('Successfully packaged chart and saved it to:')) {
          packagePath = line.split('Successfully packaged chart and saved it to:')[1].trim();
          break;
        }
      }
      this.logger.info(`Successfully packaged chart to '${packagePath}' directory`);
      return packagePath;
    } catch (error) {
      this.actionError.report({
        operation: `package chart to '${directory}' directory`,
        fatal: false
      }, error);
      return null;
    }
  }

  /**
   * Renders chart templates
   * 
   * @param {string} directory - Chart directory
   * @param {Object} options - Template options
   * @param {string} options.values - Values file path
   * @param {string} options.set - Set values on command line
   * @returns {Promise<string>} - Rendered template output
   */
  async template(directory, options = {}) {
    return this.execute(`render templates for '${directory}' chart`, async () => {
      const args = ['template', directory];
      if (options.values) args.push('--values', options.values);
      if (options.set) args.push('--set', options.set);
      this.logger.info(`Rendering templates for '${directory}' chart...`);
      const output = await this.shellService.execute('helm', args, { output: true });
      this.logger.info(`Successfully rendered templates for '${directory}' chart`);
      return output;
    });
  }

  /**
   * Updates chart dependencies
   * 
   * @param {string} directory - Chart directory
   * @returns {Promise<boolean>} - True if dependencies were updated
   */
  async updateDependencies(directory) {
    try {
      await this.execute('update dependencies', async () => {
        return await this.shellService.execute('helm', ['dependency', 'update', directory]);
      });
      return true;
    } catch (error) {
      this.actionError.report({
        operation: `update '${directory}' chart dependencies`,
        fatal: false
      }, error);
      return false;
    }
  }
}

module.exports = HelmService;
