/**
 * Release publishing service
 * 
 * @class Publish
 * @module services/release/Publish
 * @author AXIVO
 * @license BSD-3-Clause
 */
const path = require('path');
const yaml = require('js-yaml');
const Action = require('../../core/Action');
const File = require('../File');
const GitHub = require('../github');
const Helm = require('../helm');
const Issue = require('../Issue');
const Package = require('./Package');
const Template = require('../Template');

class Publish extends Action {
  /**
   * Creates a new Publish service instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.fileService = new File(params);
    this.graphqlService = new GitHub.GraphQL(params);
    this.helmService = new Helm(params);
    this.issueService = new Issue(params);
    this.packageService = new Package(params);
    this.restService = new GitHub.Rest(params);
    this.templateService = new Template(params);
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
      return await this.helmService.login({ registry, username, password });
    }, false);
  }

  /**
   * Creates index files from chart metadata
   * 
   * @param {Object} chart - Chart directory information
   * @param {string} outputDir - Output directory path
   * @returns {Promise<boolean>} Success status
   */
  async createIndex(chart, outputDir) {
    try {
      const chartName = path.basename(chart.dir);
      const metadataPath = path.join(chart.dir, 'metadata.yaml');
      const metadataExists = await this.fileService.exists(metadataPath);
      if (!metadataExists) {
        this.logger.warning(`No metadata.yaml found for ${chart.dir}, skipping index generation`);
        return false;
      }
      const indexPath = path.join(outputDir, 'index.yaml');
      await this.fileService.copyFile(metadataPath, indexPath);
      this.logger.info(`Generated index for '${chart.type}/${chartName}'`);
      const redirectTemplate = this.config.get('repository.chart.redirect.template');
      const redirectContent = await this.fileService.readFile(redirectTemplate);
      const redirectContext = {
        RepoURL: this.config.get('repository.url'),
        Type: chart.type,
        Name: chartName
      };
      const redirectHtml = this.templateService.render(redirectContent, redirectContext);
      const redirectPath = path.join(outputDir, 'index.html');
      await this.fileService.writeFile(redirectPath, redirectHtml);
      return true;
    } catch (error) {
      this.actionError.handle(error, {
        operation: `generate index for '${chart.type}/${path.basename(chart.dir)}'`,
        fatal: false
      });
      return false;
    }
  }

  /**
   * Finds available charts in specified directory type
   * 
   * @param {string} type - Chart type to find
   * @returns {Promise<Array>} List of chart directories with type information
   */
  async find(type) {
    return this.execute('find available charts', async () => {
      const result = [];
      try {
        const dirs = await this.fileService.listDirectory(type);
        const filtered = dirs.filter(dir => !dir.startsWith('.'));
        result.push(...filtered.map(dir => ({
          dir: path.join(type, dir),
          type: type
        })));
      } catch (error) {
        this.actionError.handle(error, {
          operation: `list ${type} directory`,
          fatal: false
        });
      }
      return result;
    });
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
        const chartDirs = [].concat(
          ...(await Promise.all([
            this.find(appType),
            this.find(libType)
          ]))
        );
        const results = await Promise.all(chartDirs.map(async (chart) => {
          const outputDir = path.join('./', chart.type, path.basename(chart.dir));
          try {
            await this.fileService.createDirectory(outputDir);
            return await this.createIndex(chart, outputDir);
          } catch (error) {
            this.actionError.handle(error, {
              operation: `create output directory for ${chart.dir}`,
              fatal: false
            });
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
        this.actionError.handle(error, {
          operation: 'generate chart indexes',
          fatal: false
        });
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
      await this.fileService.validateFile(releaseTemplate);
      const templateContent = await this.fileService.readFile(releaseTemplate);
      const issues = await this.issueService.get({
        context: this.context,
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
        try {
          const { name, version } = this.packageService.parseInfo(pkg.source);
          const type = pkg.type === appType ? 'application' : 'library';
          const chartDir = path.join(this.config.get(`repository.chart.type.${type}`), name);
          const chartPath = path.join(packagesPath, pkg.type, pkg.source);
          const chartYamlPath = path.join(chartDir, 'Chart.yaml');
          const iconPath = path.join(chartDir, this.config.get('repository.chart.icon'));
          const iconExists = await this.fileService.exists(iconPath);
          let metadata = {};
          try {
            const chartYamlContent = await this.fileService.readFile(chartYamlPath);
            metadata = yaml.load(chartYamlContent);
            this.logger.info(`Successfully loaded '${chartDir}' chart metadata`);
          } catch (error) {
            this.actionError.handle(error, {
              operation: `load '${chartDir}' chart metadata`,
              fatal: false
            });
          }
          const chart = {
            icon: iconExists,
            metadata,
            name,
            path: chartPath,
            type,
            version
          };
          const tagName = this.config.get('repository.release.title')
            .replace('{{ .Name }}', chart.name)
            .replace('{{ .Version }}', chart.version);
          this.logger.info(`Processing '${tagName}' repository release...`);
          const existingRelease = await this.restService.getReleaseByTag({
            context: this.context,
            tag: tagName
          });
          if (existingRelease) {
            this.logger.info(`Release '${tagName}' already exists, skipping`);
            continue;
          }
          const body = await this.generateContent(chart);
          const release = await this.restService.createRelease({
            context: this.context,
            release: {
              tag: tagName,
              name: tagName,
              body
            }
          });
          const assetName = `${chart.type}.tgz`;
          const assetData = await this.fileService.readFile(chart.path);
          await this.restService.uploadReleaseAsset({
            context: this.context,
            asset: {
              releaseId: release.id,
              assetName,
              assetData
            }
          });
          this.logger.info(`Successfully created '${tagName}' repository release`);
          result.push({
            name: chart.name,
            version: chart.version,
            tagName,
            releaseId: release.id
          });
        } catch (error) {
          this.actionError.handle(error, {
            operation: `process '${pkg.source}' package`,
            fatal: false
          });
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
        try {
          const { name } = this.packageService.parseInfo(pkg.source);
          const deleted = await this.restService.deleteOciPackage({
            context: this.context,
            chart: { name, type: pkg.type }
          });
          if (deleted) {
            this.logger.info(`Deleted existing OCI package for ${name}`);
          }
        } catch (error) {
          this.actionError.handle(error, {
            operation: `delete existing OCI package for ${pkg.source}`,
            fatal: false
          });
        }
      }
      const ociRegistry = this.config.get('repository.oci.registry');
      const word = packages.length === 1 ? 'package' : 'packages';
      this.logger.info(`Publishing ${packages.length} OCI ${word}...`);
      const result = [];
      for (const pkg of packages) {
        try {
          this.logger.info(`Publishing '${pkg.source}' chart package to OCI registry...`);
          const chartPath = path.join(packagesPath, pkg.type, pkg.source);
          const registry = `oci://${ociRegistry}/${this.context.payload.repository.full_name}/${pkg.type}`;
          await this.exec.exec('helm', ['push', chartPath, registry], { silent: true });
          const { name, version } = this.packageService.parseInfo(pkg.source);
          result.push({
            name,
            version,
            source: pkg.source,
            registry
          });
        } catch (error) {
          this.actionError.handle(error, {
            operation: `push '${pkg.source}' package`,
            fatal: false
          });
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

module.exports = Publish;
