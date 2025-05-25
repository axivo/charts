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
const { ReleaseError } = require('../../utils/errors');
const File = require('../File');
const GitHub = require('../github');
const Helm = require('../helm');
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
    this.helmService = new Helm(params);
    this.packageService = new Package(params);
    this.templateService = new Template(params);
    this.restService = new GitHub.Rest(params);
    this.graphqlService = new GitHub.GraphQL(params);
  }

  /**
   * Authenticates with OCI registry
   * 
   * @returns {Promise<boolean>} Authentication success
   */
  async authenticate() {
    return this.execute('authenticate to OCI registry', async () => {
      const config = this.config.get();
      const ociRegistry = config.repository.oci.registry;
      this.logger.info('Authenticating to OCI registry...');
      try {
        await this.exec.exec('helm', ['registry', 'login', ociRegistry, '-u', this.context.repo.owner, '--password-stdin'], {
          input: Buffer.from(process.env['INPUT_GITHUB-TOKEN']),
          silent: true
        });
        this.logger.info('Successfully authenticated to OCI registry');
        return true;
      } catch (authError) {
        this.errorHandler.handle(authError, {
          operation: 'authenticate to OCI registry',
          fatal: false
        });
        return false;
      }
    });
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
      const config = this.config.get();
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
      const redirectTemplate = config.repository.chart.redirect.template;
      const redirectContent = await this.fileService.readFile(redirectTemplate);
      const redirectContext = {
        RepoURL: config.repository.url,
        Type: chart.type,
        Name: chartName
      };
      const redirectHtml = this.templateService.render(redirectContent, redirectContext);
      const redirectPath = path.join(outputDir, 'index.html');
      await this.fileService.writeFile(redirectPath, redirectHtml);
      return true;
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: `generate index for '${chart.type}/${path.basename(chart.dir)}'`,
        fatal: false
      });
      return false;
    }
  }

  /**
   * Executes a publish operation with error handling
   *
   * @param {string} operation - Operation name
   * @param {Function} action - Action to execute
   * @param {Object} details - Additional error details
   * @returns {Promise<any>} Operation result
   */
  async execute(operation, action, details) {
    try {
      return await action();
    } catch (error) {
      throw new ReleaseError(operation, error, details);
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
      const config = this.config.get();
      const results = [];
      try {
        const dirs = await this.fileService.listDirectory(type);
        const filtered = dirs.filter(dir => !dir.startsWith('.'));
        results.push(...filtered.map(dir => ({
          dir: path.join(type, dir),
          type: type
        })));
      } catch (error) {
        this.errorHandler.handle(error, {
          operation: `list ${type} directory`,
          fatal: false
        });
      }
      return results;
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
        const config = this.config.get();
        if (!config.repository.chart.packages.enabled) {
          this.logger.info('Chart indexes generation is disabled');
          return 0;
        }
        this.logger.info('Generating chart indexes...');
        const appType = config.repository.chart.type.application;
        const libType = config.repository.chart.type.library;
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
            this.errorHandler.handle(error, {
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
        this.errorHandler.handle(error, {
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
      const config = this.config.get();
      const releaseTemplate = config.repository.release.template;
      await this.fileService.validateFile(releaseTemplate);
      const templateContent = await this.fileService.readFile(releaseTemplate);
      const issues = await this.graphqlService.getReleaseIssues(chart);
      const tagName = config.repository.release.title
        .replace('{{ .Name }}', chart.name)
        .replace('{{ .Version }}', chart.version);
      const templateContext = {
        AppVersion: chart.metadata.appVersion || '',
        Branch: this.context.payload.repository.default_branch,
        Dependencies: (chart.metadata.dependencies || []).map(dependency => ({
          Name: dependency.name,
          Repository: dependency.repository,
          Source: [this.context.payload.repository.html_url, 'blob', tagName, chart.type, chart.name, 'Chart.yaml'].join('/'),
          Version: dependency.version
        })),
        Description: chart.metadata.description || '',
        Icon: chart.icon ? config.repository.chart.icon : null,
        Issues: issues.length ? issues : null,
        KubeVersion: chart.metadata.kubeVersion || '',
        Name: chart.name,
        RepoURL: this.context.payload.repository.html_url,
        Type: chart.type,
        Version: chart.version
      };
      return this.templateService.render(templateContent, templateContext);
    }, { chart: `${chart.name}-${chart.version}` });
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
      const config = this.config.get();
      const appType = config.repository.chart.type.application;
      const libType = config.repository.chart.type.library;
      const word = packages.length === 1 ? 'release' : 'releases';
      this.logger.info(`Publishing ${packages.length} GitHub ${word}...`);
      const releases = [];
      for (const pkg of packages) {
        try {
          const { name, version } = this.packageService.parseInfo(pkg.source);
          const type = pkg.type === libType ? 'library' : 'application';
          const chartDir = path.join(config.repository.chart.type[type], name);
          const chartPath = path.join(packagesPath, pkg.type, pkg.source);
          const chartYamlPath = path.join(chartDir, 'Chart.yaml');
          const iconPath = path.join(chartDir, config.repository.chart.icon);
          const iconExists = await this.fileService.exists(iconPath);
          let metadata = {};
          try {
            const chartYamlContent = await this.fileService.readFile(chartYamlPath);
            metadata = yaml.load(chartYamlContent);
            this.logger.info(`Successfully loaded '${chartDir}' chart metadata`);
          } catch (error) {
            this.errorHandler.handle(error, {
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
          const tagName = config.repository.release.title
            .replace('{{ .Name }}', chart.name)
            .replace('{{ .Version }}', chart.version);
          this.logger.info(`Processing '${tagName}' repository release...`);
          const existingRelease = await this.restService.getReleaseByTag(tagName);
          if (existingRelease) {
            this.logger.info(`Release '${tagName}' already exists, skipping`);
            continue;
          }
          const body = await this.generateContent(chart);
          const release = await this.restService.createRelease({
            name: tagName,
            body
          });
          const assetName = [chart.type, 'tgz'].join('.');
          const assetData = await this.fileService.readFile(chart.path);
          await this.restService.uploadReleaseAsset({
            releaseId: release.id,
            assetName,
            assetData
          });
          this.logger.info(`Successfully created '${tagName}' repository release`);
          releases.push({
            name: chart.name,
            version: chart.version,
            tagName,
            releaseId: release.id
          });
        } catch (error) {
          this.errorHandler.handle(error, {
            operation: `process '${pkg.source}' package`,
            fatal: false
          });
        }
      }
      if (releases.length) {
        const successWord = releases.length === 1 ? 'release' : 'releases';
        this.logger.info(`Successfully published ${releases.length} GitHub ${successWord}`);
      }
      return releases;
    }, { packagesCount: packages.length });
  }

  /**
   * Publishes charts to OCI registry
   * 
   * @param {Array} packages - List of packaged charts
   * @param {string} packagesPath - Path to packages directory
   * @returns {Promise<Array>} List of published OCI packages
   */
  async oci(packages, packagesPath) {
    return this.execute('publish to OCI registry', async () => {
      const config = this.config.get();
      if (!config.repository.oci.packages.enabled) {
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
      const ociRegistry = config.repository.oci.registry;
      const word = packages.length === 1 ? 'package' : 'packages';
      this.logger.info(`Publishing ${packages.length} OCI ${word}...`);
      const published = [];
      for (const pkg of packages) {
        try {
          this.logger.info(`Publishing '${pkg.source}' chart package to OCI registry...`);
          const chartPath = path.join(packagesPath, pkg.type, pkg.source);
          const registry = ['oci:/', ociRegistry, this.context.payload.repository.full_name, pkg.type].join('/');
          await this.exec.exec('helm', ['push', chartPath, registry], { silent: true });
          const { name, version } = this.packageService.parseInfo(pkg.source);
          published.push({
            name,
            version,
            source: pkg.source,
            registry
          });
        } catch (error) {
          this.errorHandler.handle(error, {
            operation: `push '${pkg.source}' package`,
            fatal: false
          });
        }
      }
      if (published.length) {
        const successWord = published.length === 1 ? 'package' : 'packages';
        this.logger.info(`Successfully published ${published.length} OCI ${successWord}`);
      }
      return published;
    }, { packagesCount: packages.length });
  }
}

module.exports = Publish;
