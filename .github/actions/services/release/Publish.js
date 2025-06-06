/**
 * Release publishing service
 * 
 * @class PublishService
 * @module services/release/Publish
 * @author AXIVO
 * @license BSD-3-Clause
 */
const path = require('path');
const Action = require('../../core/Action');
const ChartService = require('../chart');
const FileService = require('../File');
const GitHubService = require('../github');
const HelmService = require('../helm');
const IssueService = require('../Issue');
const PackageService = require('./Package');
const TemplateService = require('../Template');

class PublishService extends Action {
  /**
   * Creates a new PublishService instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.chartService = new ChartService(params);
    this.fileService = new FileService(params);
    this.graphqlService = new GitHubService.GraphQL(params);
    this.helmService = new HelmService(params);
    this.issueService = new IssueService(params);
    this.packageService = new PackageService(params);
    this.restService = new GitHubService.Rest(params);
    this.templateService = new TemplateService(params);
  }

  /**
   * Creates a GitHub release for a chart
   * 
   * @param {Object} chart - Chart information
   * @param {string} chart.name - Chart name
   * @param {string} chart.version - Chart version
   * @param {string} chart.type - Chart type
   * @param {string} chart.path - Path to chart package file
   * @param {Object} chart.metadata - Chart metadata
   * @param {boolean} chart.icon - Whether chart has an icon
   * @param {string} tag - Release tag name
   * @returns {Promise<Object>} Created release information
   */
  async #create(chart, tag) {
    return this.execute('create release', async () => {
      this.logger.info(`Processing '${tag}' repository release...`);
      const body = await this.generateContent(chart);
      const release = await this.restService.createRelease(
        tag,
        tag,
        body
      );
      const assetData = await this.fileService.read(chart.path);
      await this.restService.uploadReleaseAsset(release.id, {
        name: `${chart.type}.tgz`,
        type: 'application/gzip',
        data: assetData
      });
      this.logger.info(`Successfully created '${tag}' repository release`);
      return {
        name: chart.name,
        version: chart.version,
        tagName: tag,
        releaseId: release.id
      };
    });
  }

  /**
   * Prepares chart data for publishing
   * 
   * @param {Object} object - Package object
   * @param {string} object.source - Chart package filename
   * @param {string} object.type - Chart type
   * @param {string} directory - Path to packages directory
   * @param {string} type - Application type for comparison
   * @returns {Promise<Object|null>} Prepared chart data or null
   */
  async #publish(object, directory, type) {
    const chartType = object.type === type ? 'application' : 'library';
    const chartDir = path.join(this.config.get(`repository.chart.type.${chartType}`), 'chart-name');
    const chartPath = path.join(directory, object.type, object.source);
    const iconPath = path.join(chartDir, this.config.get('repository.chart.icon'));
    const iconExists = await this.fileService.exists(iconPath);
    let metadata = {};
    return {
      icon: iconExists,
      metadata,
      name: 'chart-name',
      path: chartPath,
      type: chartType,
      version: '1.0.0'
    };
  }

  /**
   * Authenticates with OCI registry
   * 
   * @returns {Promise<boolean>} Authentication success
   */
  async authenticate() {
    return this.execute('authenticate to OCI registry', async () => {
      const registry = this.config.get('repository.oci.registry');
      const username = this.context.repo.owner;
      const password = process.env['INPUT_GITHUB-TOKEN'];
      if (!password) {
        this.logger.warning('GitHub token not available for OCI authentication');
        return false;
      }
      return await this.helmService.login(registry, username, password);
    }, false);
  }

  /**
   * Creates index files from chart metadata
   * 
   * @param {Object} chart - Chart directory information
   * @param {string} directory - Output directory path
   * @returns {Promise<boolean>} Success status
   */
  async createIndex(chart, directory) {
    return this.execute(`generate index for chart`, async () => {
      const chartName = path.basename(chart.dir);
      const metadataPath = path.join(chart.dir, 'metadata.yaml');
      const metadataExists = await this.fileService.exists(metadataPath);
      if (!metadataExists) {
        this.logger.warning(`No metadata.yaml found for ${chart.dir}, skipping index generation`);
        return false;
      }
      const indexPath = path.join(directory, 'index.yaml');
      await this.fileService.copy(metadataPath, indexPath);
      this.logger.info(`Generated index for '${chart.type}/${chartName}'`);
      const redirectTemplate = this.config.get('repository.chart.redirect.template');
      const redirectContent = await this.fileService.read(redirectTemplate);
      const redirectContext = {
        RepoURL: this.config.get('repository.url'),
        Type: chart.type,
        Name: chartName
      };
      const redirectHtml = this.templateService.render(redirectContent, redirectContext);
      const redirectPath = path.join(directory, 'index.html');
      await this.fileService.write(redirectPath, redirectHtml);
      return true;
    }, false);
  }

  /**
   * Generates chart indexes for published charts
   * 
   * @returns {Promise<number>} Number of generated indexes
   */
  async generateIndexes() {
    return this.execute('generate chart indexes', async () => {
      try {
        if (!this.config.get('repository.chart.packages.enabled')) {
          this.logger.info('Chart indexes generation is disabled');
          return 0;
        }
        this.logger.info('Generating chart indexes...');
        const appType = this.config.get('repository.chart.type.application');
        const libType = this.config.get('repository.chart.type.library');
        const [appChartFiles, libChartFiles] = await Promise.all([
          this.fileService.find(`${appType}/*/Chart.yaml`),
          this.fileService.find(`${libType}/*/Chart.yaml`)
        ]);
        const appChartDirs = appChartFiles.map(file => ({
          dir: path.dirname(file),
          type: appType
        }));
        const libChartDirs = libChartFiles.map(file => ({
          dir: path.dirname(file),
          type: libType
        }));
        const chartDirs = [...appChartDirs, ...libChartDirs];
        const results = await Promise.all(chartDirs.map(async (chart) => {
          const outputDir = path.join('./', chart.type, path.basename(chart.dir));
          try {
            await this.fileService.createDir(outputDir);
            return await this.createIndex(chart, outputDir);
          } catch (error) {
            this.actionError.report({
              operation: `create output directory for ${chart.dir}`,
              fatal: false
            }, error);
            return false;
          }
        }));
        const successCount = results.filter(Boolean).length;
        if (successCount) {
          const word = successCount === 1 ? 'index' : 'indexes';
          this.logger.info(`Successfully generated ${successCount} chart ${word}`);
        }
        return successCount;
      } catch (error) {
        this.actionError.report({
          operation: 'generate chart indexes',
          fatal: false
        }, error);
        return 0;
      }
    });
  }

  /**
   * Generates release content from template
   * 
   * @param {Object} chart - Chart information
   * @returns {Promise<string>} Generated release content
   */
  async generateContent(chart) {
    return this.execute('generate release content', async () => {
      this.logger.info(`Generating release content for '${chart.type}/${chart.name}' chart...`);
      const releaseTemplate = this.config.get('repository.release.template');
      const templateContent = await this.fileService.read(releaseTemplate);
      const issues = await this.issueService.get({
        chart: { name: chart.name, type: chart.type }
      });
      const tagName = this.config.get('repository.release.title')
        .replace('{{ .Name }}', chart.name)
        .replace('{{ .Version }}', chart.version);
      const repoUrl = this.context.payload.repository.html_url;
      const chartYamlSource = `${repoUrl}/blob/${tagName}/${chart.type}/${chart.name}/Chart.yaml`;
      const templateContext = {
        AppVersion: chart.metadata.appVersion || '',
        Branch: this.context.payload.repository.default_branch,
        Dependencies: (chart.metadata.dependencies || []).map(dependency => ({
          Name: dependency.name,
          Repository: dependency.repository,
          Source: chartYamlSource,
          Version: dependency.version
        })),
        Description: chart.metadata.description || '',
        Icon: chart.icon ? this.config.get('repository.chart.icon') : null,
        Issues: issues.length ? issues : null,
        KubeVersion: chart.metadata.kubeVersion || '',
        Name: chart.name,
        RepoURL: repoUrl,
        Type: chart.type,
        Version: chart.version
      };
      return this.templateService.render(templateContent, templateContext);
    });
  }

  /**
   * Publishes charts to GitHub
   * 
   * @param {Array} packages - List of packaged charts
   * @param {string} packagesPath - Path to packages directory
   * @returns {Promise<Array>} List of published releases
   */
  async github(packages, packagesPath) {
    return this.execute('publish to GitHub', async () => {
      if (!packages.length) {
        this.logger.info('No packages to publish to GitHub');
        return [];
      }
      const appType = this.config.get('repository.chart.type.application');
      const word = packages.length === 1 ? 'release' : 'releases';
      this.logger.info(`Publishing ${packages.length} GitHub ${word}...`);
      const result = [];
      for (const pkg of packages) {
        const chart = await this.#publish(pkg, packagesPath, appType);
        if (!chart) continue;
        const tagName = this.config.get('repository.release.title')
          .replace('{{ .Name }}', chart.name)
          .replace('{{ .Version }}', chart.version);
        const existingRelease = await this.restService.getReleaseByTag(tagName);
        if (existingRelease) {
          this.logger.info(`Release '${tagName}' already exists, skipping`);
          continue;
        }
        const publishResult = await this.#create(chart, tagName);
        if (publishResult) {
          result.push(publishResult);
        }
      }
      if (result.length) {
        const keyword = result.length === 1 ? 'release' : 'releases';
        this.logger.info(`Successfully published ${result.length} GitHub ${keyword}`);
      }
      return result;
    });
  }

  /**
   * Publishes charts to OCI registry
   * 
   * @param {Array} packages - List of packaged charts
   * @param {string} packagesPath - Path to packages directory
   * @returns {Promise<Array>} List of published OCI packages
   */
  async registry(packages, packagesPath) {
    return this.execute('publish to OCI registry', async () => {
      if (!this.config.get('repository.oci.packages.enabled')) {
        this.logger.info('Publishing of OCI packages is disabled');
        return [];
      }
      if (!packages.length) {
        this.logger.info('No packages to publish to OCI registry');
        return [];
      }
      const authenticated = await this.authenticate();
      if (!authenticated) {
        this.logger.warning('OCI authentication failed, skipping OCI publishing');
        return [];
      }
      this.logger.info('Cleaning up existing OCI packages...');
      for (const pkg of packages) {
        const { name, type } = pkg;
        await this.packageService.delete(name, type);
      }
      const ociRegistry = this.config.get('repository.oci.registry');
      const word = packages.length === 1 ? 'package' : 'packages';
      this.logger.info(`Publishing ${packages.length} OCI ${word}...`);
      const result = [];
      for (const pkg of packages) {
        const publish = await this.packageService.publish(ociRegistry, pkg, packagesPath);
        if (publish) {
          result.push(publish);
        }
      }
      if (result.length) {
        const keyword = result.length === 1 ? 'package' : 'packages';
        this.logger.info(`Successfully published ${result.length} OCI ${keyword}`);
      }
      return result;
    });
  }
}

module.exports = PublishService;
