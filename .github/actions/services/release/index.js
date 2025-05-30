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
   * @param {Array} files - List of deleted chart files
   * @returns {Promise<number>} Number of deleted releases
   */
  async delete(files) {
    return this.execute('delete releases', async () => {
      if (!files.length) return 0;
      const word = files.length === 1 ? 'release' : 'releases';
      this.logger.info(`Deleting ${files.length} chart ${word}...`);
      const results = await Promise.all(files.map(async (filePath) => {
        try {
          const appType = this.config.get('repository.chart.type.application');
          const chartPath = path.dirname(filePath);
          const type = chartPath.startsWith(appType) ? 'application' : 'library';
          const name = path.basename(chartPath);
          if (this.config.get('repository.chart.packages.enabled')) {
            await this.githubService.deleteReleases(name);
          }
          if (this.config.get('repository.oci.packages.enabled')) {
            await this.githubService.deleteOciPackage({
              owner: this.context.repo.owner,
              repo: this.context.repo.repo,
              chart: { name, type }
            });
          }
          return true;
        } catch (error) {
          this.actionError.handle(error, {
            operation: `delete releases for '${filePath}' chart`,
            fatal: false
          });
          return false;
        }
      }));
      const deletedCount = results.filter(Boolean).length;
      return deletedCount;
    }, { deletedCount: files.length });
  }

  /**
   * Finds release-eligible charts based on file changes
   * 
   * @param {Object} files - Object with changed files as keys
   * @returns {Promise<Object>} Object containing eligible charts and deleted charts
   */
  async find(files) {
    return this.execute('find charts', async () => {
      this.logger.info('Finding release-eligible charts...');
      const appDir = this.config.get('repository.chart.type.application');
      const libDir = this.config.get('repository.chart.type.library');
      const fileList = Object.keys(files);
      const application = [];
      const library = [];
      const deleted = [];
      for (const file of fileList) {
        if (!file.endsWith('Chart.yaml')) continue;
        const dir = path.dirname(file);
        const isApp = dir.startsWith(appDir);
        const isLib = dir.startsWith(libDir);
        if (!isApp && !isLib) continue;
        if (files[file] === 'removed') {
          deleted.push(file);
          continue;
        }
        const chartDir = dir;
        if (isApp) {
          application.push(chartDir);
        } else {
          library.push(chartDir);
        }
      }
      const total = application.length + library.length;
      const word = total === 1 ? 'modified' : 'total';
      this.logger.info(`Found ${total} release-eligible charts and ${deleted.length} deleted charts`);
      return { application, library, deleted, total, word };
    });
  }

  /**
   * Validates a chart for release eligibility
   * 
   * @param {string} directory - Chart directory path
   * @returns {Promise<boolean>} True if chart is eligible for release
   */
  async validate(directory) {
    return this.execute('validate chart', async () => {
      this.logger.info(`Validating chart: ${directory}`);
      const chartYamlPath = path.join(directory, 'Chart.yaml');
      try {
        await this.fileService.exists(chartYamlPath);
        return true;
      } catch (error) {
        this.logger.warning(`Chart.yaml not found for ${directory}, skipping`);
        return false;
      }
    }, { directory });
  }
}

// Attach specialized services
Release.Package = require('./Package');
Release.Publish = require('./Publish');

module.exports = Release;
