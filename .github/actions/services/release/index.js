/**
 * Release service for managing chart releases
 * 
 * @class Release
 * @module services/release
 * @author AXIVO
 * @license BSD-3-Clause
 */
const path = require('path');
const Action = require('../../core/Action');
const File = require('../File');
const GitHub = require('../github');

class Release extends Action {
  /**
   * Creates a new Release service instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.fileService = new File(params);
    this.githubService = new GitHub.Rest(params);
  }

  /**
   * Deletes GitHub releases for deleted charts
   * 
   * @param {Object} params - Function parameters
   * @param {Object} params.context - GitHub Actions context
   * @param {Array} params.files - List of deleted chart files
   * @returns {Promise<number>} Number of deleted releases
   */
  async delete({ context, files }) {
    return this.execute('delete releases', async () => {
      if (!files.length) return 0;
      const word = files.length === 1 ? 'release' : 'releases';
      this.logger.info(`Deleting ${files.length} chart ${word}...`);
      const result = await Promise.all(files.map(async (filePath) => {
        try {
          const appType = this.config.get('repository.chart.type.application');
          const chartPath = path.dirname(filePath);
          const type = chartPath.startsWith(appType) ? 'application' : 'library';
          const name = path.basename(chartPath);
          if (this.config.get('repository.chart.packages.enabled')) {
            await this.githubService.deleteReleases({
              context,
              chart: name
            });
          }
          if (this.config.get('repository.oci.packages.enabled')) {
            await this.githubService.deleteOciPackage({
              context,
              chart: { name, type }
            });
          }
          return true;
        } catch (error) {
          this.actionError.report(error, {
            operation: `delete releases for '${filePath}' chart`,
            fatal: false
          });
          return false;
        }
      }));
      return result.filter(Boolean).length;
    });
  }

  /**
   * Finds release-eligible charts based on file changes
   * 
   * @param {Object} params - Function parameters
   * @param {Object} params.files - Object mapping file paths to their Git change status
   * @returns {Promise<Object>} Object containing categorized charts
   * @returns {Array<string>} returns.application - Array of application chart directory paths
   * @returns {Array<string>} returns.library - Array of library chart directory paths
   * @returns {Array<string>} returns.deleted - Array of deleted Chart.yaml file paths
   * @returns {number} returns.total - Total count of eligible charts (application + library)
   */
  async find({ files }) {
    let result = { application: [], library: [], deleted: [], total: 0 };
    return this.execute('find charts', async () => {
      this.logger.info('Finding charts...');
      const appType = this.config.get('repository.chart.type.application');
      const libType = this.config.get('repository.chart.type.library');
      const fileList = Object.keys(files);
      for (const file of fileList) {
        if (!file.endsWith('Chart.yaml')) continue;
        const dir = path.dirname(file);
        const isApp = dir.startsWith(appType);
        const isLib = dir.startsWith(libType);
        if (!isApp && !isLib) continue;
        if (files[file] === 'removed') {
          result.deleted.push(file);
          continue;
        }
        if (isApp) result.application.push(dir);
        else result.library.push(dir);
      }
      result.total = result.application.length + result.library.length;
      const word = (count) => count === 1 ? 'chart' : 'charts';
      const released = `${result.total} released ${word(result.total)}`;
      const deleted = `${result.deleted.length} deleted ${word(result.deleted.length)}`;
      this.logger.info(`Found ${released} and ${deleted}`);
      return result;
    });
  }

  /**
   * Validates a chart for release eligibility
   * TODO: Method not used
   * 
   * @param {string} directory - Chart directory path
   * @returns {Promise<boolean>} True if chart is eligible for release
   */
  async validate(directory) {
    return this.execute('validate chart', async () => {
      this.logger.info(`Validating '${directory}' chart`);
      const chartPath = path.join(directory, 'Chart.yaml');
      try {
        await this.fileService.exists(chartPath);
        return true;
      } catch (error) {
        this.logger.warning(`Chart '${directory}' not found`);
        return false;
      }
    });
  }
}

// Attach specialized services
Release.Local = require('./Local');
Release.Package = require('./Package');
Release.Publish = require('./Publish');

module.exports = Release;
