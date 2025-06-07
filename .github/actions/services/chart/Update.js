/**
 * Chart update service for updating chart files
 * 
 * @class UpdateService
 * @module services/chart/Update
 * @author AXIVO
 * @license BSD-3-Clause
 */
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const Action = require('../../core/Action');
const FileService = require('../File');
const GitService = require('../Git');
const HelmService = require('../helm');

class UpdateService extends Action {
  /**
   * Creates a new Chart UpdateService instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.fileService = new FileService(params);
    this.gitService = new GitService(params);
    this.helmService = new HelmService(params);
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
   * Initializes update operation with standard logging
   * 
   * @private
   * @param {Array} charts - Charts to initialize
   * @param {string} type - Operation type
   * @returns {Object} - Initialization result with files array and logging info
   */
  async #initialize(charts, type) {
    if (!charts || !charts.length) return { skip: true };
    const word = charts.length === 1 ? 'chart' : 'charts';
    this.logger.info(`Updating ${type} files for ${charts.length} ${word}...`);
    return { skip: false, files: [], type, word };
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
   * Updates a single chart entry in inventory file
   * 
   * @private
   * @param {string} chart - Chart file path
   * @param {string} inventory - Inventory file path
   * @param {string} status - Git status
   * @returns {Promise<string>} - Inventory file path that was updated
   */
  async #updateEntry(chart, inventory, status) {
    const chartName = path.basename(path.dirname(chart));
    const chartType = path.dirname(chart).split('/')[0];
    let content = await this.fileService.readYaml(inventory);
    if (!content) content = { [chartType]: [] };
    if (!content[chartType]) content[chartType] = [];
    const existingIndex = content[chartType].findIndex(content => content.name === chartName);
    if (existingIndex >= 0 && content[chartType][existingIndex].status === status) return false;
    let chartData = {};
    if (status !== 'removed') {
      const chartMetadata = await this.fileService.readYaml(chart);
      chartData = {
        description: chartMetadata.description,
        version: chartMetadata.version
      };
    }
    if (existingIndex >= 0) {
      content[chartType][existingIndex] = { name: chartName, status, ...chartData };
    } else {
      content[chartType].push({ name: chartName, status, ...chartData });
    }
    content[chartType].sort((current, updated) => current.name.localeCompare(updated.name));
    await this.fileService.writeYaml(inventory, content);
    return true;
  }

  /**
   * Updates application files for charts
   * 
   * @param {Array<string>} charts - Chart directories to update
   * @returns {Promise<boolean>} - True if all application files were updated successfully
   */
  async application(charts = []) {
    return this.execute('update application files', async () => {
      const init = await this.#initialize(charts, 'application');
      if (init.skip) return init.skip;
      const { files, type } = init;
      const updatePromises = charts.map(async (chartDir) => {
        return this.execute(`update '${chartDir}' ${type} file`, async () => {
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
        }, false);
      });
      const result = await Promise.all(updatePromises);
      return this.#commit('application', files, result);
    });
  }

  /**
   * Updates inventory files for charts
   * 
   * @param {Object} files - Chart files object mapping file paths to Git status
   * @returns {Promise<boolean>} - True if all inventory files were updated successfully
   */
  async inventory(files = {}) {
    return this.execute('update inventory files', async () => {
      const init = await this.#initialize(Object.keys(files), 'inventory');
      if (init.skip) return init.skip;
      const type = init.type;
      const updatedFiles = [];
      const updatePromises = Object.entries(files)
        .map(async ([filePath, status]) => {
          const chartType = path.dirname(filePath).split('/')[0];
          const inventoryPath = `${chartType}/inventory.yaml`;
          return this.execute(`update '${chartType}' ${type} file`, async () => {
            if (await this.#updateEntry(filePath, inventoryPath, status)) {
              updatedFiles.push(inventoryPath);
              this.logger.info(`Successfully updated '${chartType}' ${type} file`);
            }
            return true;
          }, false);
        });
      const result = await Promise.all(updatePromises);
      return this.#commit('inventory', [...new Set(updatedFiles)], result);
    });
  }

  /**
   * Updates dependency lock files for charts
   * 
   * @param {Array<string>} charts - Chart directories to update
   * @returns {Promise<boolean>} - True if all lock files were updated successfully
   */
  async lock(charts = []) {
    return this.execute('update dependency lock files', async () => {
      const init = await this.#initialize(charts, 'dependency lock');
      if (init.skip) return init.skip;
      const { files, type } = init;
      const updatePromises = charts.map(async (chartDir) => {
        return this.execute(`update '${chartDir}' ${type} file`, async () => {
          const chartLockPath = path.join(chartDir, 'Chart.lock');
          const chartYamlPath = path.join(chartDir, 'Chart.yaml');
          const chart = await this.fileService.readYaml(chartYamlPath);
          if (chart.dependencies?.length) {
            await this.helmService.updateDependencies(chartDir);
            const status = await this.gitService.getStatus();
            const changedFiles = [...status.modified, ...status.untracked];
            if (changedFiles.includes(chartLockPath) && !status.deleted.includes(chartLockPath)) {
              files.push(chartLockPath);
              this.logger.info(`Successfully updated '${chartDir}' ${type} file`);
            }
          } else if (await this.fileService.exists(chartLockPath)) {
            await this.fileService.delete(chartLockPath);
            files.push(chartLockPath);
            this.logger.info(`Successfully removed '${chartDir}' ${type} file`);
          }
          return true;
        }, false);
      });
      const result = await Promise.all(updatePromises);
      return this.#commit('dependency lock', files, result);
    });
  }

  /**
   * Updates metadata files for charts
   * 
   * @param {Array<string>} charts - Chart directories to update
   * @returns {Promise<boolean>} - True if all metadata files were updated successfully
   */
  async metadata(charts = []) {
    return this.execute('update metadata files', async () => {
      const init = await this.#initialize(charts, 'metadata');
      if (init.skip) return init.skip;
      const { files, type } = init;
      const updatePromises = charts.map(async (chartDir) => {
        return this.execute(`update '${chartDir}' ${type} file`, async () => {
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
        }, false);
      });
      const result = await Promise.all(updatePromises);
      return this.#commit('metadata', files, result);
    });
  }
}

module.exports = UpdateService;
