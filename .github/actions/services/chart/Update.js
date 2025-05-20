/**
 * Chart update service for updating chart files
 * 
 * @class Update
 * @module services/chart/Update
 * @author AXIVO
 * @license BSD-3-Clause
 */
const path = require('path');
const Action = require('../../core/Action');
const { File, Helm } = require('../');

class Update extends Action {
  /**
   * Creates a new Chart Update service instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.fileService = new File(params);
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
    this.logger.info(`Updating application files for ${charts.length} charts`);
    const updatePromises = charts.map(async (chartDir) => {
      try {
        const appFilePath = path.join(chartDir, 'application.yaml');
        if (await this.fileService.exists(appFilePath)) {
          const appFile = await this.fileService.readYaml(appFilePath);
          await this.fileService.writeYaml(appFilePath, appFile);
          this.logger.info(`Updated application file for ${chartDir}`);
          return true;
        }
        return true;
      } catch (error) {
        this.errorHandler.handle(error, {
          operation: `update application file for ${chartDir}`,
          fatal: false
        });
        return false;
      }
    });
    const results = await Promise.all(updatePromises);
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
    this.logger.info(`Updating lock files for ${charts.length} charts`);
    const updatePromises = charts.map(async (chartDir) => {
      try {
        return await this.helmService.updateDependencies(chartDir);
      } catch (error) {
        this.errorHandler.handle(error, {
          operation: `update lock file for ${chartDir}`,
          fatal: false
        });
        return false;
      }
    });
    const results = await Promise.all(updatePromises);
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
    this.logger.info(`Updating metadata files for ${charts.length} charts`);
    const updatePromises = charts.map(async (chartDir) => {
      try {
        const metadataPath = path.join(chartDir, 'metadata.yaml');
        if (await this.fileService.exists(metadataPath)) {
          const metadata = await this.fileService.readYaml(metadataPath);
          await this.fileService.writeYaml(metadataPath, metadata);
          this.logger.info(`Updated metadata file for ${chartDir}`);
          return true;
        }
        return true;
      } catch (error) {
        this.errorHandler.handle(error, {
          operation: `update metadata file for ${chartDir}`,
          fatal: false
        });
        return false;
      }
    });
    const results = await Promise.all(updatePromises);
    return results.every(result => result === true);
  }
}

module.exports = Update;
