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
   * Updates application files for charts
   * 
   * @param {Array<string>} charts - Chart directories to update
   * @returns {Promise<boolean>} - True if all application files were updated successfully
   */
  async application(charts) {
    if (!charts || !charts.length) return true;
    const word = charts.length === 1 ? 'chart' : 'charts';
    this.logger.info(`Updating application files for ${charts.length} ${word}...`);
    const appFiles = [];
    const updatePromises = charts.map(async (chartDir) => {
      try {
        const appFilePath = path.join(chartDir, 'application.yaml');
        if (!await this.fileService.exists(appFilePath)) {
          return true;
        }
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
        appFiles.push(appFilePath);
        this.logger.info(`Successfully updated '${chartDir}' application file`);
        return true;
      } catch (error) {
        this.errorHandler.handle(error, {
          operation: `update '${chartDir}' application file`,
          fatal: false
        });
        return false;
      }
    });
    const results = await Promise.all(updatePromises);
    if (appFiles.length) {
      const headRef = process.env.GITHUB_HEAD_REF;
      const word = appFiles.length === 1 ? 'file' : 'files';
      await this.gitService.signedCommit(headRef, appFiles, `chore(github-action): update application ${word}`);
    }
    return results.every(result => result === true);
  }

  /**
   * Updates lock files for charts
   * 
   * @param {Array<string>} charts - Chart directories to update
   * @returns {Promise<boolean>} - True if all lock files were updated successfully
   */
  async lock(charts) {
    if (!charts || !charts.length) return true;
    const word = charts.length === 1 ? 'chart' : 'charts';
    this.logger.info(`Updating lock files for ${charts.length} ${word}...`);
    const lockFiles = [];
    const updatePromises = charts.map(async (chartDir) => {
      try {
        const chartLockPath = path.join(chartDir, 'Chart.lock');
        const chartYamlPath = path.join(chartDir, 'Chart.yaml');
        const chart = await this.fileService.readYaml(chartYamlPath);
        if (chart.dependencies?.length) {
          await this.helmService.updateDependencies(chartDir);
          lockFiles.push(chartLockPath);
          this.logger.info(`Successfully updated '${chartDir}' lock file`);
        } else if (await this.fileService.exists(chartLockPath)) {
          await this.fileService.delete(chartLockPath);
          lockFiles.push(chartLockPath);
          this.logger.info(`Successfully removed '${chartDir}' lock file`);
        }
        return true;
      } catch (error) {
        this.errorHandler.handle(error, {
          operation: `update '${chartDir}' lock file`,
          fatal: false
        });
        return false;
      }
    });
    const results = await Promise.all(updatePromises);
    if (lockFiles.length) {
      const headRef = process.env.GITHUB_HEAD_REF;
      const word = lockFiles.length === 1 ? 'file' : 'files';
      await this.gitService.signedCommit(headRef, lockFiles, `chore(github-action): update dependency lock ${word}`);
    }
    return results.every(result => result === true);
  }

  /**
   * Updates metadata files for charts
   * 
   * @param {Array<string>} charts - Chart directories to update
   * @returns {Promise<boolean>} - True if all metadata files were updated successfully
   */
  async metadata(charts) {
    if (!charts || !charts.length) return true;
    const word = charts.length === 1 ? 'chart' : 'charts';
    this.logger.info(`Updating metadata files for ${charts.length} ${word}...`);
    const metadataFiles = [];
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
        const chartType = path.basename(path.dirname(chartDir));
        const assetName = `${chartType}.tgz`;
        const baseUrl = `${this.context.payload.repository.html_url}/releases/download`;
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'helm-metadata-'));
        await this.fileService.createDir(tempDir);
        await this.helmService.package(chartDir, { destination: tempDir });
        await this.helmService.generateIndex(tempDir, { url: baseUrl });
        const indexPath = path.join(tempDir, 'index.yaml');
        const index = await this.fileService.readYaml(indexPath);
        index.entries[chartName].forEach(entry => {
          const tagName = this.config.get('repository.release.title')
            .replace('{{ .Name }}', chartName)
            .replace('{{ .Version }}', entry.version);
          entry.urls = [`${baseUrl}/${tagName}/${assetName}`];
        });
        if (metadata) {
          let entries = [...index.entries[chartName], ...metadata.entries[chartName]];
          entries.sort((current, next) => next.version.localeCompare(current.version));
          const seen = new Set();
          entries = entries.filter(entry => !seen.has(entry.version) && seen.add(entry.version));
          const retention = this.config.get('repository.chart.packages.retention');
          if (retention && entries.length > retention) {
            entries = entries.slice(0, retention);
          }
          index.entries[chartName] = entries;
        }
        await this.fileService.writeYaml(metadataPath, index);
        metadataFiles.push(metadataPath);
        this.logger.info(`Successfully updated '${chartDir}' metadata file`);
        return true;
      } catch (error) {
        this.errorHandler.handle(error, {
          operation: `update '${chartDir}' metadata file`,
          fatal: false
        });
        return false;
      }
    });
    const results = await Promise.all(updatePromises);
    if (metadataFiles.length) {
      const headRef = process.env.GITHUB_HEAD_REF;
      const word = metadataFiles.length === 1 ? 'file' : 'files';
      await this.gitService.signedCommit(headRef, metadataFiles, `chore(github-action): update metadata ${word}`);
    }
    return results.every(result => result === true);
  }
}

module.exports = Update;
