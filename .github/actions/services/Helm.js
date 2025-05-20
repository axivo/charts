/**
 * Helm service for Helm CLI operations
 * 
 * @class Helm
 * @module services/Helm
 * @author AXIVO
 * @license BSD-3-Clause
 */
const path = require('path');
const Action = require('../core/Action');
const Shell = require('./Shell');
const { HelmError } = require('../utils/errors');

class Helm extends Action {
  /**
   * Creates a new Helm service instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.shellService = new Shell(params);
  }

  /**
   * Executes a Helm command
   * 
   * @param {string[]} args - Command arguments
   * @param {Object} options - Execution options
   * @param {boolean} options.silent - Whether to suppress command output
   * @returns {Promise<string>} - Command output
   */
  async execute(args, options = {}) {
    try {
      return await this.shellService.execute('helm', args, options);
    } catch (error) {
      throw new HelmError(`helm ${args[0]}`, error);
    }
  }

  /**
   * Generates a Helm repository index file
   * 
   * @param {string} dir - Directory containing chart packages
   * @param {Object} options - Index options
   * @param {string} options.url - URL prefix for chart references
   * @param {string} options.merge - Path to existing index file to merge with
   * @param {boolean} options.generateMetadata - Generate missing metadata from chart contents
   * @returns {Promise<boolean>} - True if index was generated successfully
   */
  async generateIndex(dir, options = {}) {
    try {
      const args = ['repo', 'index', dir];
      if (options.url) args.push('--url', options.url);
      if (options.merge) args.push('--merge', options.merge);
      if (options.generateMetadata) args.push('--generate-metadata');
      this.logger.info(`Generating index file for: ${dir}`);
      await this.execute(args);
      this.logger.info(`Successfully generated index file for ${dir}`);
      return true;
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: `generate index for ${dir}`,
        fatal: false
      });
      return false;
    }
  }

  /**
   * Lints a chart
   * 
   * @param {string} chartDir - Chart directory
   * @param {Object} options - Lint options
   * @param {boolean} options.strict - Whether to use strict linting
   * @returns {Promise<boolean>} - True if lint passed
   */
  async lint(chartDir, options = {}) {
    try {
      this.logger.info(`Linting chart: ${chartDir}`);
      await this.execute(['lint', chartDir, ...(options.strict ? ['--strict'] : [])]);
      this.logger.info(`Lint passed for ${chartDir}`);
      return true;
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: `lint chart ${chartDir}`,
        fatal: false
      });
      return false;
    }
  }

  /**
   * Packages a chart
   * 
   * @param {string} chartDir - Chart directory
   * @param {Object} options - Package options
   * @param {string} options.destination - Destination directory
   * @returns {Promise<string>} - Path to packaged chart
   */
  async package(chartDir, options = {}) {
    try {
      const args = ['package', chartDir];
      if (options.destination) args.push('--destination', options.destination);
      if (options.version) args.push('--version', options.version);
      if (options.appVersion) args.push('--app-version', options.appVersion);
      this.logger.info(`Packaging chart: ${chartDir}`);
      const output = await this.execute(args, { output: true });
      const lines = output.split('\n');
      let packagePath = null;
      for (const line of lines) {
        if (line.includes('Successfully packaged chart and saved it to:')) {
          packagePath = line.split('Successfully packaged chart and saved it to:')[1].trim();
          break;
        }
      }
      this.logger.info(`Successfully packaged chart to ${packagePath}`);
      return packagePath;
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: `package chart ${chartDir}`,
        fatal: false
      });
      return null;
    }
  }

  /**
   * Updates chart dependencies
   * 
   * @param {string} chartDir - Chart directory
   * @returns {Promise<boolean>} - True if dependencies were updated
   */
  async updateDependencies(chartDir) {
    try {
      this.logger.info(`Updating dependencies for ${chartDir}`);
      await this.execute(['dependency', 'update', chartDir]);
      this.logger.info(`Dependencies updated for ${chartDir}`);
      return true;
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: `update dependencies for ${chartDir}`,
        fatal: false
      });
      return false;
    }
  }
}

module.exports = Helm;
