/**
 * Local release service for local development chart operations
 * 
 * @module services/release/Local
 * @author AXIVO
 * @license BSD-3-Clause
 */
const path = require('path');
const Action = require('../../core/Action');
const ChartService = require('../chart');
const FileService = require('../File');
const GitService = require('../Git');
const HelmService = require('../helm');
const ShellService = require('../Shell');

/**
 * Local release service for local development chart operations
 * 
 * Provides specialized handling for local development workflows including
 * dependency validation, chart processing, and local packaging operations.
 * 
 * @class LocalService
 */
class LocalService extends Action {
  /**
   * Creates a new LocalService instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.chartService = new ChartService(params);
    this.fileService = new FileService(params);
    this.gitService = new GitService(params);
    this.helmService = new HelmService(params);
    this.shellService = new ShellService(params);
  }

  /**
   * Checks if all required dependencies are installed
   * 
   * @returns {Promise<boolean>} - True if all dependencies are available
   */
  async checkDependencies() {
    return this.execute('check dependencies', async () => {
      const requiredTools = [
        { name: 'git', command: ['--version'] },
        { name: 'helm', command: ['version', '--short'] },
        { name: 'kubectl', command: ['version', '--client'] }
      ];
      let allDepsAvailable = true;
      this.logger.info('Checking required dependencies...');
      this.logger.info('Connecting to Kubernetes cluster (this may take a moment)...');
      const clusterResult = await this.shellService.execute('kubectl', ['cluster-info'], {
        output: true,
        returnFullResult: true,
        throwOnError: false
      });
      if (clusterResult.exitCode !== 0) {
        this.logger.error('❌ Kubernetes cluster is not accessible');
        allDepsAvailable = false;
      } else {
        const clusterInfo = clusterResult.stdout.split('\n')[0];
        this.logger.info(`✅ Kubernetes cluster endpoint ${clusterInfo.replace('Kubernetes control plane is running at ', '')}`);
      }
      for (const tool of requiredTools) {
        const result = await this.shellService.execute(tool.name, tool.command, {
          output: true,
          returnFullResult: true,
          throwOnError: false
        });
        if (result.exitCode !== 0) {
          this.logger.error(`❌ ${tool.name} is not properly installed or configured`);
          allDepsAvailable = false;
        } else {
          const version = result.stdout.trim().split('\n')[0];
          let displayName = tool.name;
          switch (tool.name) {
            case 'git':
              displayName = `${tool.name} ${version.replace('git version ', '')}`;
              break;
            case 'helm':
              displayName = `${tool.name} ${version}`;
              break;
            case 'kubectl':
              displayName = `${tool.name} ${version.toLowerCase().replace('client version: ', 'client ')}`;
              break;
          }
          this.logger.info(`✅ ${displayName}`);
        }
      }
      const requiredPackages = ['@actions/exec', 'glob', 'handlebars', 'js-yaml'];
      for (const pkg of requiredPackages) {
        const packageResolved = this.execute(`resolve '${pkg}' package`, async () => {
          require.resolve(pkg);
          return true;
        }, false);
        if (await packageResolved) {
          let version = 'installed';
          const versionResult = await this.execute(`get '${pkg}' version`, async () => {
            const pkgJson = require(`${pkg}/package.json`);
            return pkgJson.version || 'installed';
          }, false);
          if (versionResult) {
            version = versionResult;
          } else {
            this.logger.info(`Note: Could not determine version for '${pkg}'`);
          }
          this.logger.info(`✅ Node.js package '${pkg}' ${version}`);
        } else {
          this.logger.error(`❌ Node.js package '${pkg}' is missing. Run: npm install ${pkg}`);
          allDepsAvailable = false;
        }
      }
      return allDepsAvailable;
    }, false);
  }

  /**
   * Gets locally modified files using git status
   * 
   * @returns {Promise<Object>} - Object mapping file paths to status
   */
  async getLocalFiles() {
    return this.execute('get local files', async () => {
      const chartTypes = this.config.getChartTypes();
      const chartTypePaths = chartTypes.map(type =>
        this.config.get(`repository.chart.type.${type}`)
      );
      const status = await this.gitService.getStatus();
      const allFiles = [...status.modified, ...status.untracked];
      const chartFiles = allFiles.filter(file =>
        chartTypePaths.some(typePath => file.startsWith(typePath))
      );
      const files = {};
      chartFiles.forEach(file => { files[file] = 'modified'; });
      return files;
    }, false);
  }

  /**
   * Processes charts for local development
   * 
   * @param {Object} charts - Chart directories organized by type
   * @returns {Promise<Object>} - Processing results with counts
   */
  async processCharts(charts) {
    return this.execute('process charts for local development', async () => {
      const chartDirs = [...charts.application, ...charts.library];
      const localPackagesDir = './.cr-local-packages';
      this.logger.info(`Creating ${localPackagesDir} directory...`);
      await this.fileService.createDir(localPackagesDir);
      this.logger.info(`Successfully created ${localPackagesDir} directory`);
      const validCharts = [];
      for (const chartDir of chartDirs) {
        if (await this.validateChart(chartDir, localPackagesDir)) {
          this.logger.info(`Packaging '${chartDir}' chart for local testing...`);
          this.logger.info(`Updating dependencies for '${chartDir}' chart...`);
          await this.helmService.updateDependencies(chartDir);
          await this.helmService.package(chartDir, { destination: localPackagesDir });
          validCharts.push(chartDir);
        }
      }
      if (!validCharts.length) {
        this.logger.info('No charts required for packaging');
        return { processed: charts.application.length + charts.library.length, published: 0 };
      }
      const word = validCharts.length === 1 ? 'chart' : 'charts';
      this.logger.info(`Successfully packaged ${validCharts.length} ${word}`);
      await this.helmService.generateIndex(localPackagesDir);
      return { processed: charts.application.length + charts.library.length, published: validCharts.length };
    });
  }

  /**
   * Validates a chart using helm lint, template rendering, and kubectl validation
   * 
   * @param {string} directory - Path to the chart directory
   * @param {string} temporary - Directory for temporary files
   * @returns {Promise<boolean>} - True if validation succeeds
   */
  async validateChart(directory, temporary) {
    return this.execute(`validate '${directory}' chart`, async () => {
      if (!await this.chartService.validate(directory)) {
        return false;
      }
      this.logger.info(`Checking template rendering for '${directory}' chart...`);
      const templateResult = await this.helmService.template(directory);
      if (!templateResult.trim()) {
        throw new Error(`Chart ${directory} produced empty template output`);
      }
      this.logger.info(`Validating Kubernetes resources for '${directory}' chart (this may take a moment)...`);
      const tempFile = path.join(temporary, `${path.basename(directory)}-k8s-validation.yaml`);
      await this.fileService.write(tempFile, templateResult);
      await this.shellService.execute('kubectl', ['apply', '--validate=true', '--dry-run=server', '-f', tempFile]);
      await this.fileService.delete(tempFile);
      return true;
    }, false);
  }
}

module.exports = LocalService;
