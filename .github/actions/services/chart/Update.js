/**
 * Chart update service for updating chart files
 * 
 * @class Update
 * @module services/chart/Update
 * @author AXIVO
 * @license BSD-3-Clause
 */
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const Action = require('../../core/Action');
const File = require('../File');
const Git = require('../Git');
const Helm = require('../helm');

class Update extends Action {
  /**
   * Creates a new Chart Update service instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.fileService = new File(params);
    this.gitService = new Git(params);
    this.helmService = new Helm(params);
  }

  /**
   * Commits files and returns results
   * 
   * @private
   * @param {string} type - Type of files (application, dependency lock, metadata)
   * @param {Array<string>} files - Files to commit
   * @param {Array<boolean>} results - Update operation results
   * @returns {Promise<boolean>} - True if all operations succeeded
   */
  async #commit(type, files, results) {
    if (!files.length) {
      this.logger.info(`No ${type} file changes to commit`);
      return results.every(result => result === true);
    }
    const branch = process.env.GITHUB_HEAD_REF;
    const word = files.length === 1 ? 'file' : 'files';
    await this.gitService.signedCommit(branch, files, `chore(github-action): update ${type} ${word}`);
    return results.every(result => result === true);
  }

  /**
   * Generates chart index from directory
   * 
   * @private
   * @param {string} directory - Chart directory path
   * @param {string} workspace - Workspace directory path
   * @returns {Promise<Object>} Generated index object
   */
  async #generateIndex(directory, workspace) {
    const chartType = path.basename(path.dirname(directory));
    const assetName = `${chartType}.tgz`;
    const url = `${this.context.payload.repository.html_url}/releases/download`;
    await this.fileService.createDir(workspace);
    await this.helmService.package(directory, { destination: workspace });
    await this.helmService.generateIndex(workspace, { url });
    const indexPath = path.join(workspace, 'index.yaml');
    const index = await this.fileService.readYaml(indexPath);
    const chartName = path.basename(directory);
    index.entries[chartName].forEach(entry => {
      const tagName = this.config.get('repository.release.title')
        .replace('{{ .Name }}', chartName)
        .replace('{{ .Version }}', entry.version);
      entry.urls = [`${url}/${tagName}/${assetName}`];
    });
    return index;
  }

  /**
   * Merges metadata entries with retention policy
   * 
   * @private
   * @param {string} name - Chart name
   * @param {Object} index - Generated index object
   * @param {Object} metadata - Existing metadata object
   * @returns {Object} Updated index with merged entries
   */
  async #mergeEntries(name, index, metadata) {
    let entries = [...index.entries[name], ...metadata.entries[name]];
    entries.sort((current, next) => next.version.localeCompare(current.version));
    const seen = new Set();
    entries = entries.filter(entry => !seen.has(entry.version) && seen.add(entry.version));
    const retention = this.config.get('repository.chart.packages.retention');
    if (retention && entries.length > retention) entries = entries.slice(0, retention);
    index.entries[name] = entries;
    return index;
  }

  /**
   * Updates application files for charts
   * 
   * @param {Array<string>} charts - Chart directories to update
   * @returns {Promise<boolean>} - True if all application files were updated successfully
   */
  async application(charts = []) {
    if (!charts || !charts.length) return true;
    return this.execute('update application files', async () => {
      const type = 'application';
      const word = charts.length === 1 ? 'chart' : 'charts';
      this.logger.info(`Updating ${type} files for ${charts.length} ${word}...`);
      const files = [];
      const updatePromises = charts.map(async (chartDir) => {
        try {
          const appFilePath = path.join(chartDir, 'application.yaml');
          if (!await this.fileService.exists(appFilePath)) return true;
          const chartName = path.basename(chartDir);
          const chartYamlPath = path.join(chartDir, 'Chart.yaml');
          const appConfig = await this.fileService.readYaml(appFilePath);
          const chartMetadata = await this.fileService.readYaml(chartYamlPath);
          const tagName = this.config.get('repository.release.title')
            .replace('{{ .Name }}', chartName)
            .replace('{{ .Version }}', chartMetadata.version);
          if (appConfig.spec.source.targetRevision === tagName) {
            return true;
          }
          appConfig.spec.source.targetRevision = tagName;
          await this.fileService.writeYaml(appFilePath, appConfig);
          files.push(appFilePath);
          this.logger.info(`Successfully updated '${chartDir}' ${type} file`);
          return true;
        } catch (error) {
          this.actionError.report({
            operation: `update '${chartDir}' ${type} file`,
            fatal: false
          }, error);
          return false;
        }
      });
      const results = await Promise.all(updatePromises);
      return this.#commit('application', files, results);
    });
  }

  /**
   * Updates specific chart inventory to a specific state
   * 
   * @param {string} type - Chart type ('application' or 'library')
   * @param {string} name - Chart name
   * @param {string} state - Chart state ('released' or 'deleted')
   * @returns {Promise<void>}
   */
  async inventory(type, name, state) {
    return this.execute(`update '${name}' chart to '${state}' in '${type}' inventory`, async () => {
      const inventoryPath = `${type}/inventory.yaml`;
      let inventory = await this.fileService.readYaml(inventoryPath);
      if (!inventory) {
        inventory = { [type]: [] };
      }
      if (!inventory[type]) {
        inventory[type] = [];
      }
      const existingIndex = inventory[type].findIndex(chart => chart.name === name);
      if (existingIndex >= 0) {
        inventory[type][existingIndex].state = state;
      } else {
        inventory[type].push({ name, state });
      }
      inventory[type].sort((current, updated) => current.name.localeCompare(updated.name));
      await this.fileService.writeYaml(inventoryPath, inventory);
      this.logger.info(`Updated '${name}' chart to '${state}' in '${type}' inventory`);
    }, false);
  }

  /**
   * Updates dependency lock files for charts
   * 
   * @param {Array<string>} charts - Chart directories to update
   * @returns {Promise<boolean>} - True if all lock files were updated successfully
   */
  async lock(charts = []) {
    if (!charts || !charts.length) return true;
    return this.execute('update dependency lock files', async () => {
      const type = 'dependency lock';
      const word = charts.length === 1 ? 'chart' : 'charts';
      this.logger.info(`Updating ${type} files for ${charts.length} ${word}...`);
      const files = [];
      const updatePromises = charts.map(async (chartDir) => {
        try {
          const chartLockPath = path.join(chartDir, 'Chart.lock');
          const chartYamlPath = path.join(chartDir, 'Chart.yaml');
          const chart = await this.fileService.readYaml(chartYamlPath);
          if (chart.dependencies?.length) {
            await this.helmService.updateDependencies(chartDir);
            const status = await this.gitService.getStatus();
            if (status.modified.includes(chartLockPath)) {
              files.push(chartLockPath);
              this.logger.info(`Successfully updated '${chartDir}' ${type} file`);
            }
          } else if (await this.fileService.exists(chartLockPath)) {
            await this.fileService.delete(chartLockPath);
            files.push(chartLockPath);
            this.logger.info(`Successfully removed '${chartDir}' ${type} file`);
          }
          return true;
        } catch (error) {
          this.actionError.report({
            operation: `update '${chartDir}' ${type} file`,
            fatal: false
          }, error);
          return false;
        }
      });
      const results = await Promise.all(updatePromises);
      return this.#commit('dependency lock', files, results);
    });
  }

  /**
   * Updates metadata files for charts
   * 
   * @param {Array<string>} charts - Chart directories to update
   * @returns {Promise<boolean>} - True if all metadata files were updated successfully
   */
  async metadata(charts = []) {
    if (!charts || !charts.length) return true;
    return this.execute('update metadata files', async () => {
      const type = 'metadata';
      const word = charts.length === 1 ? 'chart' : 'charts';
      this.logger.info(`Updating ${type} files for ${charts.length} ${word}...`);
      const files = [];
      const updatePromises = charts.map(async (chartDir) => {
        try {
          const chartName = path.basename(chartDir);
          const metadataPath = path.join(chartDir, 'metadata.yaml');
          const chartYamlPath = path.join(chartDir, 'Chart.yaml');
          let metadata = null;
          if (await this.fileService.exists(metadataPath)) {
            const chart = await this.fileService.readYaml(chartYamlPath);
            metadata = await this.fileService.readYaml(metadataPath);
            if (metadata.entries?.[chartName]?.some(entry => entry.version === chart.version)) {
              return true;
            }
          }
          const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'helm-metadata-'));
          const index = await this.#generateIndex(chartDir, tempDir);
          if (metadata) await this.#mergeEntries(chartName, index, metadata);
          await this.fileService.writeYaml(metadataPath, index);
          files.push(metadataPath);
          this.logger.info(`Successfully updated '${chartDir}' ${type} file`);
          return true;
        } catch (error) {
          this.actionError.report({
            operation: `update '${chartDir}' ${type} file`,
            fatal: false
          }, error);
          return false;
        }
      });
      const results = await Promise.all(updatePromises);
      return this.#commit('metadata', files, results);
    });
  }
}

module.exports = Update;
