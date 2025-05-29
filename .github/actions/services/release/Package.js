/**
 * Chart packaging service
 * 
 * @class Package
 * @module services/release/Package
 * @author AXIVO
 * @license BSD-3-Clause
 */
const path = require('path');
const Action = require('../../core/Action');
const File = require('../File');
const Helm = require('../helm');

class Package extends Action {
  /**
   * Creates a new Package service instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.fileService = new File(params);
    this.helmService = new Helm(params);
  }

  /**
   * Creates package directory structure
   * 
   * @returns {Promise<Object>} Created directories
   */
  async createDirectories() {
    return this.execute('create package directories', async () => {
      const config = this.config.get();
      const packagesPath = config.repository.release.packages;
      const appChartType = config.repository.chart.type.application;
      const libChartType = config.repository.chart.type.library;
      this.logger.info(`Creating ${packagesPath} directory...`);
      await this.fileService.createDirectory(packagesPath);
      const appPackagesDir = path.join(packagesPath, appChartType);
      const libPackagesDir = path.join(packagesPath, libChartType);
      await this.fileService.createDirectory(appPackagesDir);
      await this.fileService.createDirectory(libPackagesDir);
      this.logger.info(`Successfully created ${packagesPath} directory structure`);
      return {
        root: packagesPath,
        application: appPackagesDir,
        library: libPackagesDir
      };
    });
  }

  /**
   * Gets packaged charts from the package directory
   * 
   * @param {string} directory - Path to packages directory
   * @returns {Promise<Array>} List of package objects
   */
  async get(directory) {
    return this.execute('get packages', async () => {
      const config = this.config.get();
      const appType = config.repository.chart.type.application;
      const libType = config.repository.chart.type.library;
      const appPackagesDir = path.join(directory, appType);
      const libPackagesDir = path.join(directory, libType);
      let packages = [];
      for (const [dir, type] of [[appPackagesDir, appType], [libPackagesDir, libType]]) {
        try {
          if (await this.fileService.exists(dir)) {
            const files = await this.fileService.listDirectory(dir);
            packages.push(...files
              .filter(file => file.endsWith('.tgz'))
              .map(file => ({ source: file, type }))
            );
          }
        } catch (error) {
          this.actionError.handle(error, {
            operation: `read ${type} packages directory`,
            fatal: false
          });
        }
      }
      return packages;
    }, { directory });
  }

  /**
   * Packages a release with all its charts
   * 
   * @param {Object} charts - Object with application and library charts
   * @returns {Promise<Array>} List of packaged charts
   */
  async package(charts) {
    return this.execute('package release', async () => {
      if (!charts.application.length && !charts.library.length) {
        this.logger.info('No charts to package');
        return [];
      }
      const dirs = await this.createDirectories();
      const config = this.config.get();
      const appChartType = config.repository.chart.type.application;
      const chartDirs = [...charts.application, ...charts.library];
      this.logger.info(`Packaging ${chartDirs.length} charts...`);
      const results = await Promise.all(chartDirs.map(async (chartDir) => {
        try {
          this.logger.info(`Packaging '${chartDir}' chart...`);
          this.logger.info(`Updating dependencies for '${chartDir}' chart...`);
          await this.helmService.updateDependencies(chartDir);
          const isAppChartType = chartDir.startsWith(appChartType);
          const packageDest = isAppChartType ? dirs.application : dirs.library;
          await this.helmService.package(chartDir, packageDest);
          return {
            chartDir,
            success: true,
            type: isAppChartType ? 'application' : 'library'
          };
        } catch (error) {
          this.actionError.handle(error, {
            operation: `package ${chartDir} chart`,
            fatal: false
          });
          return {
            chartDir,
            success: false,
            type: chartDir.startsWith(appChartType) ? 'application' : 'library'
          };
        }
      }));
      const successCount = results.filter(r => r.success).length;
      const word = successCount === 1 ? 'chart' : 'charts';
      this.logger.info(`Successfully packaged ${successCount} ${word}`);
      return results.filter(r => r.success);
    }, { chartCount: charts.application.length + charts.library.length });
  }

  /**
   * Parses chart information from package filename
   * 
   * @param {string} file - Chart package filename
   * @returns {Object} Chart name and version
   */
  parseInfo(file) {
    const source = file.replace('.tgz', '');
    const lastDashIndex = source.lastIndexOf('-');
    const name = source.substring(0, lastDashIndex);
    const version = source.substring(lastDashIndex + 1);
    return { name, version };
  }
}

module.exports = Package;
