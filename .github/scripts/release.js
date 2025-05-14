/**
 * Chart Release Utilities
 * 
 * This module provides functions for Helm chart management, releases, and GitHub Pages generation.
 * It handles the process of packaging Helm charts, creating GitHub releases, generating the
 * chart repository index, and preparing the GitHub Pages environment for deployment.
 * 
 * The module is designed to be used within GitHub Actions workflows and provides a clear
 * separation of concerns between different aspects of the release process.
 * 
 * @module release
 * @author AXIVO
 * @license BSD-3-Clause
 */

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');
const api = require('./github-api');
const config = require('./config');
const utils = require('./utils');

/**
 * Builds a GitHub release for a single chart and uploads the chart package as an asset
 * 
 * This function creates a GitHub release for a specific chart version and uploads the
 * packaged chart (.tgz file) as a release asset. The function performs these key steps:
 * 
 * 1. Generates a tag name and release name using the templated pattern from configuration
 * 2. Checks if a release with this tag already exists, skipping creation if it does
 * 3. Generates release content using the chart metadata and related issues
 * 4. Creates the GitHub release using the GitHub API
 * 5. Uploads the packaged chart file as an asset to the release
 * 
 * Any errors during this process are handled as non-fatal, allowing other charts
 * to be released even if one fails, in accordance with the configuration.
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {Object} params.chart - Chart object containing all chart information
 * @param {string} params.chart.name - Name of the chart (e.g., "nginx")
 * @param {string} params.chart.version - Version of the chart (e.g., "1.2.3")
 * @param {string} params.chart.type - Type of chart ("application" or "library")
 * @param {Object} params.chart.metadata - Chart metadata from Chart.yaml
 * @param {boolean} params.chart.icon - Whether an icon exists for the chart
 * @param {string} params.chart.path - Path to the chart package .tgz file
 * @returns {Promise<void>}
 */
async function _buildChartRelease({ github, context, core, chart }) {
  try {
    const tagName = config('release').title
      .replace('{{ .Name }}', chart.name)
      .replace('{{ .Version }}', chart.version);
    core.info(`Processing '${tagName}' release...`);
    const existingRelease = await api.getReleaseByTag({ github, context, core, tagName });
    if (existingRelease) {
      core.info(`Release '${tagName}' already exists, skipping`);
      return;
    }
    const body = await _generateChartRelease({ github, context, core, chart });
    const release = await api.createRelease({ github, context, core, name: tagName, body });
    const assetName = [chart.type, 'tgz'].join('.');
    const assetData = await fs.readFile(chart.path);
    await api.uploadReleaseAsset({ github, context, core, releaseId: release.id, assetName, assetData });
    core.info(`Successfully created '${tagName}' release`);
  } catch (error) {
    utils.handleError(error, core, `create '${tagName}' release`, false);
  }
}

/**
 * Extracts chart name and version from a package filename
 * 
 * This function parses a Helm chart package filename to extract the chart name and version.
 * It follows the standard Helm chart naming convention where the package filename format is
 * "chartname-version.tgz", and extracts both components for further processing.
 * 
 * Unlike most functions in this module, this function is intentionally not async since it
 * only performs synchronous string operations and doesn't interact with the filesystem or
 * external services. This allows it to be called directly without await.
 * 
 * @private
 * @param {Object} package - Package object containing the source property
 * @param {string} package.source - Filename of the chart package (e.g., "nginx-1.2.3.tgz")
 * @returns {Array} - Array containing [name, version] where name is the chart name and version is the semantic version
 */
function _extractChartInfo(package) {
  const source = package.source.replace('.tgz', '');
  const lastDashIndex = source.lastIndexOf('-');
  const name = source.substring(0, lastDashIndex);
  const version = source.substring(lastDashIndex + 1);
  return [name, version];
}

/**
 * Generates a Helm repository index file for specific charts
 * 
 * This function creates chart-specific index.yaml files in their respective
 * directories to support direct dependencies. It uses GitHub releases as the
 * source of truth for chart version history.
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {Object} params.exec - GitHub Actions exec helpers for running commands
 * @param {string} params.distRoot - Root directory for distribution files
 * @param {Object} params.charts - Object containing application and library chart paths to process
 * @returns {Promise<void>}
 */
async function _generateChartsIndex({ github, context, core, exec, distRoot, charts }) {
  try {
    const appType = config('repository').chart.type.application;
    const libType = config('repository').chart.type.library;
    const chartDirs = [...charts.application, ...charts.library];
    const allReleases = await api.getReleases({ github, context, core });
    await Promise.all(chartDirs.map(async (chartDir) => {
      try {
        const chartName = path.basename(chartDir);
        const chartType = charts.application.includes(chartDir) ? appType : libType;
        const chartOutputDir = path.join(distRoot, chartType, chartName);
        await fs.mkdir(chartOutputDir, { recursive: true });
        const titlePrefix = config('release').title
          .replace('{{ .Name }}', chartName)
          .replace('{{ .Version }}', '');
        const chartReleases = allReleases.filter(release => release.tag_name.startsWith(titlePrefix));
        const word = chartReleases.length === 1 ? 'release' : 'releases';
        core.info(`Found ${chartReleases.length} new ${word} for '${chartType}/${chartName}' chart`);
        if (!chartReleases.length) {
          core.info(`No releases found for '${chartType}/${chartName}' chart, skipping index generation`);
          return;
        }
        const retention = config('repository').chart.packages.retention;
        if (retention > 0 && chartReleases.length > retention) {
          chartReleases.sort((older, newer) => new Date(newer.created_at) - new Date(older.created_at));
          const retainedReleases = chartReleases.slice(0, retention);
          core.info(`Keeping ${retainedReleases.length} of ${chartReleases.length} releases for '${chartType}/${chartName}' chart...`);
          chartReleases.length = 0;
          chartReleases.push(...retainedReleases);
        }
        const indexPath = path.join(chartOutputDir, 'index.yaml');
        const packageDir = path.join(config('release').packages, chartType);
        await fs.mkdir(packageDir, { recursive: true });
        for (const release of chartReleases) {
          const asset = release.assets.find(file => file.name.endsWith('.tgz'));
          if (!asset) continue;
          const url = asset.browser_download_url;
          const baseUrl = [context.payload.repository.html_url, 'releases', 'download', release.tag_name].join('/');
          const packageName = path.basename(url);
          const packageFile = path.join(packageDir, packageName);
          try {
            const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'helm-packages-'));
            const tempPackageFile = path.join(tempDir, packageName);
            try {
              if (!await utils.fileExists(packageFile)) {
                core.info(`Downloading '${packageName}' chart package to ${tempDir} directory...`);
                await exec.exec('curl', ['-sSL', url, '-o', tempPackageFile]);
              } else {
                core.info(`Copying '${packageName}' chart package to ${tempDir} directory...`);
                await fs.copyFile(packageFile, tempPackageFile);
              }
            } catch (fileError) {
              utils.handleError(fileError, core, `prepare '${packageName}' chart package`, false);
              continue;
            }
            const cmdArgs = ['repo', 'index', tempDir, '--url', baseUrl];
            if (await utils.fileExists(indexPath)) {
              cmdArgs.push('--merge', indexPath);
            }
            await exec.exec('helm', cmdArgs, { silent: true });
            const tempIndexPath = path.join(tempDir, 'index.yaml');
            await fs.copyFile(tempIndexPath, indexPath);
            try {
              const redirectTemplate = config('repository').chart.redirect.template;
              const redirectContent = await fs.readFile(redirectTemplate, 'utf8');
              const repoUrl = config('repository').url;
              const Handlebars = utils.registerHandlebarsHelpers(repoUrl);
              const template = Handlebars.compile(redirectContent);
              const redirectContext = {
                RepoURL: repoUrl,
                Type: chartType,
                Name: chartName
              };
              const redirectHtml = template(redirectContext);
              const redirectPath = path.join(chartOutputDir, 'index.html');
              await fs.writeFile(redirectPath, redirectHtml);
            } catch (redirectError) {
              utils.handleError(redirectError, core, 'create redirect file', false);
            }
          } catch (indexError) {
            utils.handleError(indexError, core, 'generate index file', false);
          }
        }
        core.info(`Successfully generated '${chartType}/${chartName}' index`);
      } catch (error) {
        utils.handleError(error, core, `generate '${chartType}/${chartName}' index`, false);
      }
    }));
  } catch (error) {
    utils.handleError(error, core, 'generate charts index', false);
  }
}

/**
 * Generates release content using the template file
 * 
 * This function creates GitHub release notes for a chart by applying chart metadata
 * to a Handlebars template. It compiles a comprehensive release description that includes:
 * 
 * 1. Chart version and app version information
 * 2. Chart description and compatibility details
 * 3. Dependencies with links to their sources
 * 4. Related issues that have been addressed in this release
 * 5. Links to chart icon and source code
 * 
 * The function uses the Handlebars templating system with custom helpers to generate
 * consistently formatted release notes across all chart releases.
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {Object} params.chart - Chart object containing all chart information
 * @param {boolean} params.chart.icon - Whether an icon exists for the chart
 * @param {Object} params.chart.metadata - Chart metadata from Chart.yaml
 * @param {string} params.chart.name - Name of the chart
 * @param {string} params.chart.type - Type of chart ("application" or "library")
 * @param {string} params.chart.version - Version of the chart
 * @returns {Promise<string>} - Generated release content in markdown format
 */
async function _generateChartRelease({ github, context, core, chart }) {
  try {
    core.info(`Generating release content for '${chart.type}/${chart.name}' chart...`);
    releaseTemplate = config('release').template;
    try {
      await fs.access(releaseTemplate);
    } catch (accessError) {
      utils.handleError(accessError, core, `find ${releaseTemplate} template`, false);
    }
    const repoUrl = context.payload.repository.html_url;
    const templateContent = await fs.readFile(releaseTemplate, 'utf8');
    const Handlebars = utils.registerHandlebarsHelpers(repoUrl);
    const template = Handlebars.compile(templateContent);
    const chartSources = chart.metadata.sources || [];
    const issues = await api.getReleaseIssues({ github, context, core, chartName: chart.name, chartType: chart.type });
    const templateContext = {
      AppVersion: chart.metadata.appVersion || '',
      Branch: context.payload.repository.default_branch,
      Dependencies: (chart.metadata.dependencies || []).map(dependency => ({
        Name: dependency.name,
        Repository: dependency.repository,
        Source: chartSources.length > 0 ? chartSources[0] : null,
        Version: dependency.version
      })),
      Description: chart.metadata.description || '',
      Icon: chart.icon ? config('repository').chart.icon : null,
      Issues: issues.length > 0 ? issues : null,
      KubeVersion: chart.metadata.kubeVersion || '',
      Name: chart.name,
      RepoURL: repoUrl,
      Type: chart.type,
      Version: chart.version
    };
    return template(templateContext);
  } catch (error) {
    utils.handleError(error, core, 'generate chart release', false);
    throw error;
  }
}

/**
 * Generates repository index frontpage
 * 
 * This function creates the Helm repository index.yaml file that describes all available
 * charts, along with generating a formatted index page for the GitHub Pages site. The process:
 * 
 * 1. Scans all application and library directories to find valid charts
 * 2. Extracts metadata from each chart's Chart.yaml file
 * 3. Builds a structured index object with entries for each chart
 * 4. Generates the index.yaml file for Helm repository consumption
 * 5. Creates a markdown index page using the Handlebars template
 * 
 * The index page serves as the landing page for the GitHub Pages site and provides
 * a human-readable overview of all available charts in the repository.
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @returns {Promise<boolean>} - True if successfully generated, false otherwise
 */
async function _generateFrontpage({ context, core }) {
  try {
    const chartDirs = await utils.findCharts({ core });
    const chartEntries = {};
    const allChartDirs = [...chartDirs.application, ...chartDirs.library];
    await Promise.all(allChartDirs.map(async (chartDir) => {
      try {
        const chartName = path.basename(chartDir);
        const chartType = chartDir.startsWith(config('repository').chart.type.application) ? 'application' : 'library';
        const chartYamlPath = path.join(chartDir, 'Chart.yaml');
        const chartContent = await fs.readFile(chartYamlPath, 'utf8');
        const chartYaml = yaml.load(chartContent);
        Object.assign(chartEntries, {
          [chartName]: {
            description: chartYaml.description || '',
            type: chartType,
            version: chartYaml.version || ''
          }
        });
      } catch (error) {
        utils.handleError(error, core, `read chart metadata for ${chartDir} directory`, false);
      }
    }));
    const index = {
      apiVersion: 'v1',
      entries: chartEntries,
      generated: new Date().toISOString()
    };
    const template = await fs.readFile(config('theme').frontpage.template, 'utf8');
    const repoUrl = context.payload.repository.html_url;
    const defaultBranchName = context.payload.repository.default_branch;
    const Handlebars = utils.registerHandlebarsHelpers(repoUrl);
    const charts = Object.entries(index.entries)
      .sort(([sourceName, sourceData], [targetName, targetData]) => {
        return sourceData.type.localeCompare(targetData.type) || sourceName.localeCompare(targetName);
      })
      .map(([name, data]) => {
        if (!data) return null;
        return {
          Description: data.description || '',
          Name: name,
          Type: data.type || 'application',
          Version: data.version || ''
        };
      })
      .filter(Boolean);
    const compiledTemplate = Handlebars.compile(template);
    const newContent = compiledTemplate({
      Charts: charts,
      RepoURL: repoUrl,
      Branch: defaultBranchName
    });
    await fs.writeFile('./index.md', newContent, 'utf8');
    core.info(`Successfully generated frontpage content with ${newContent.length} bytes`);
    return true;
  } catch (error) {
    utils.handleError(error, core, 'generate frontpage content');
  }
}

/**
 * Gathers chart packages from application and library directories
 * 
 * This function scans the configured application and library chart directories
 * within the packages path to find all available chart packages (*.tgz files).
 * The function collects package information including the source filename and
 * chart type (application or library) for each package found.
 * 
 * Any errors during directory reading are handled as non-fatal, allowing the function
 * to continue processing other directories even if one fails. This ensures maximum
 * package discovery in the presence of partial failures.
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {string} params.packagesPath - Root directory containing packaged chart .tgz files
 * @returns {Promise<Array>} - Array of package objects with source and type properties
 */
async function _getChartPackages({ core, packagesPath }) {
  const appType = config('repository').chart.type.application;
  const libType = config('repository').chart.type.library;
  const appPackagesDir = path.join(packagesPath, appType);
  const libPackagesDir = path.join(packagesPath, libType);
  let packages = [];
  for (const [dir, type] of [[appPackagesDir, appType], [libPackagesDir, libType]]) {
    try {
      if (await utils.fileExists(dir)) {
        const files = await fs.readdir(dir);
        packages.push(...files.filter(file => file.endsWith('.tgz')).map(file => ({ source: file, type })));
      }
    } catch (error) {
      utils.handleError(error, core, `read ${type} packages directory`, false);
    }
  }
  return packages;
}

/**
 * Packages modified charts into distribution directories
 * 
 * This function creates the necessary directory structure and packages each
 * modified chart using Helm. Charts are packaged into separate directories
 * based on their type (application or library).
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {Object} params.exec - GitHub Actions exec helpers for running commands
 * @param {Object} params.charts - Object containing application and library chart arrays
 * @returns {Promise<void>}
 */
async function _packageCharts({ core, exec, charts }) {
  const packagesPath = config('release').packages;
  const appChartType = config('repository').chart.type.application;
  const libChartType = config('repository').chart.type.library;
  core.info(`Creating ${packagesPath} directory...`);
  await fs.mkdir(packagesPath, { recursive: true });
  const appPackagesDir = path.join(packagesPath, appChartType);
  const libPackagesDir = path.join(packagesPath, libChartType);
  await fs.mkdir(appPackagesDir, { recursive: true });
  await fs.mkdir(libPackagesDir, { recursive: true });
  core.info(`Successfully created ${packagesPath} directory`);
  const chartDirs = [...charts.application, ...charts.library];
  await Promise.all(chartDirs.map(async (chartDir) => {
    try {
      core.info(`Packaging '${chartDir}' chart...`);
      core.info(`Updating dependencies for '${chartDir}' chart...`);
      await exec.exec('helm', ['dependency', 'update', chartDir], { silent: true });
      const isAppChartType = chartDir.startsWith(appChartType);
      const packageDest = isAppChartType ? appPackagesDir : libPackagesDir;
      await exec.exec('helm', ['package', chartDir, '--destination', packageDest], { silent: true });
    } catch (error) {
      utils.handleError(error, core, `package ${chartDir} chart`, false);
    }
  }));
  const word = chartDirs.length === 1 ? 'chart' : 'charts';
  core.info(`Successfully packaged ${chartDirs.length} ${word}`);
}

/**
 * Publishes GitHub releases for packaged charts and uploads the chart packages as release assets
 * 
 * This function processes all chart packages in the specified directory, creating GitHub
 * releases for each one. For each package, it:
 * 
 * 1. Extracts the chart name and version from the package filename
 * 2. Determines if it's an application or library chart
 * 3. Loads the chart metadata from Chart.yaml
 * 4. Checks if an icon exists for the chart
 * 5. Calls _buildChartRelease to create the release and upload the package
 * 
 * The function handles application and library chart types separately, processing
 * all eligible .tgz files found in their respective directories. It works with the
 * naming conventions defined in the configuration to properly parse chart names and versions.
 * 
 * Any errors during the process are handled as non-fatal, allowing other charts
 * to be released even if one fails, in accordance with the configuration settings.
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {string} params.deletedCharts - Deleted charts
 * @returns {Promise<void>}
 */
async function _publishChartReleases({ github, context, core, deletedCharts }) {
  try {
    if (deletedCharts.length) {
      const word = deletedCharts.length === 1 ? 'release' : 'releases';
      core.info(`Deleting ${deletedCharts.length} chart ${word}...`);
      await Promise.all(deletedCharts.map(async (deletedChart) => {
        try {
          const chartPath = path.dirname(deletedChart);
          const chart = path.basename(chartPath);
          await api.deleteReleases({ github, context, core, chart });
        } catch (error) {
          utils.handleError(error, core, `delete releases for '${deletedChart}' chart`, false);
        }
      }));
    }
    const packagesPath = config('release').packages;
    const packages = await _getChartPackages({ core, packagesPath });
    if (!packages.length) {
      core.info('No chart packages available for publishing');
      return;
    }
    const word = packages.length === 1 ? 'package' : 'packages'
    core.info(`Preparing ${packages.length} ${word} to release...`);
    await Promise.all(packages.map(async (package) => {
      try {
        const [name, version] = _extractChartInfo(package);
        const type = package.type === config('repository').chart.type.library ? 'library' : 'application';
        const chartDir = path.join(config('repository').chart.type[type], name);
        const chartPath = path.join(packagesPath, package.type, package.source);
        const chartYamlPath = path.join(chartDir, 'Chart.yaml');
        const iconExists = await utils.fileExists(path.join(chartDir, config('repository').chart.icon));
        let metadata = {};
        try {
          const chartYamlContent = await fs.readFile(chartYamlPath, 'utf8');
          metadata = yaml.load(chartYamlContent);
          core.info(`Successfully loaded '${chartDir}' chart metadata`);
        } catch (error) {
          utils.handleError(error, core, `load '${chartDir}' chart metadata`, false);
        }
        await _buildChartRelease({
          github,
          context,
          core,
          chart: {
            icon: iconExists,
            metadata,
            name,
            path: chartPath,
            type,
            version
          }
        });
      } catch (error) {
        utils.handleError(error, core, `process '${package.source}' package`, false);
      }
    }));
  } catch (error) {
    utils.handleError(error, core, 'publish chart releases');
  }
}

/**
 * Publishes charts to OCI registry
 * 
 * This function publishes charts to an OCI registry (GitHub Container Registry)
 * in addition to the traditional Helm repository. This provides users with
 * multiple installation options and better integration with container workflows.
 * 
 * The function handles the entire OCI publishing process:
 * 1. Authenticates with the OCI registry
 * 2. Deletes existing packages with the same name-version to avoid conflicts
 * 3. Publishes new chart packages to the registry
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {Object} params.exec - GitHub Actions exec helpers for running commands
 * @param {Object} params.deletedCharts - Deleted charts
 * @returns {Promise<void>}
 */
async function _publishOciReleases({ github, context, core, exec, deletedCharts }) {
  try {
    const ociRegistry = config('repository').oci.registry;
    if (!config('repository').oci.packages.enabled) {
      core.info('Publishing of OCI packages is disabled');
      return;
    }
    core.info('Authenticating to OCI registry...');
    try {
      await exec.exec('helm', ['registry', 'login', ociRegistry, '-u', context.repo.owner, '--password-stdin'], {
        input: Buffer.from(process.env['INPUT_GITHUB-TOKEN']),
        silent: true
      });
      core.info('Successfully authenticated to OCI registry');
    } catch (authError) {
      utils.handleError(authError, core, 'authenticate to OCI registry', false);
      return;
    }
    if (deletedCharts.length) {
      const word = deletedCharts.length === 1 ? 'package' : 'packages';
      core.info(`Deleting ${deletedCharts.length} OCI ${word}...`);
      const appChartType = config('repository').chart.type.application;
      await Promise.all(deletedCharts.map(async (deletedChart) => {
        try {
          const packagePath = path.dirname(deletedChart);
          const package = {
            name: path.basename(packagePath),
            type: packagePath.startsWith(appChartType) ? 'application' : 'library'
          };
          await api.deleteOciPackage({ github, context, core, package });
        } catch (error) {
          utils.handleError(error, core, `delete OCI packages`, false);
        }
      }));
    }
    const packagesPath = config('release').packages;
    const allPackages = await _getChartPackages({ core, packagesPath });
    if (!allPackages.length) {
      core.info('No packages available for OCI registry publishing');
      return;
    }
    const files = Object.keys(await api.getUpdatedFiles({ github, context, core }));
    const charts = await utils.findCharts({ core, files });
    const chartNames = [
      ...charts.application.map(dir => path.basename(dir)),
      ...charts.library.map(dir => path.basename(dir))
    ];
    const packages = [];
    for (const package of allPackages) {
      const [name] = _extractChartInfo(package);
      if (chartNames.includes(name)) {
        packages.push(package);
      }
    }
    if (!packages.length) {
      core.info('No packages available for OCI registry publishing');
      return;
    }
    for (const package of packages) {
      try {
        core.info(`Publishing '${package.source}' chart package to OCI registry...`);
        const chartPath = path.join(packagesPath, package.type, package.source);
        const registry = ['oci:/', ociRegistry, context.payload.repository.full_name, package.type].join('/');
        await exec.exec('helm', ['push', chartPath, registry], { silent: true });
      } catch (error) {
        utils.handleError(error, core, `push '${package.source}' package`, false);
      }
    }
    const word = packages.length === 1 ? 'package' : 'packages';
    core.info(`Successfully published ${packages.length} chart ${word} to OCI registry`);
  } catch (error) {
    utils.handleError(error, core, 'publish packages to OCI registry');
  }
}

/**
 * Processes chart releases for affected charts
 * 
 * This function handles the complete Helm chart release process in one comprehensive operation:
 * 
 * 1. Identifies charts that have been modified in the current push/commit
 * 2. Creates a directory for packaged charts and updates chart dependencies
 * 3. Packages the modified charts using the Helm CLI
 * 4. Creates GitHub releases for each packaged chart with proper release notes
 * 5. Generates and updates the Helm repository index.yaml file
 * 
 * The function automatically determines which charts have been modified and only
 * processes those charts, avoiding unnecessary repackaging and releases for
 * charts that haven't changed.
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {Object} params.exec - GitHub Actions exec helpers for running commands
 * @returns {Promise<void>}
 */
async function processReleases({ github, context, core, exec }) {
  try {
    const files = await api.getUpdatedFiles({ github, context, core });
    const charts = await utils.findCharts({ core, files: Object.keys(files) });
    const deletedCharts = Object.entries(files)
      .filter(([file, status]) => file.endsWith('Chart.yaml') && status === 'removed')
      .map(([file]) => file);
    if (!(charts.total + deletedCharts.length)) {
      core.info(`No ${charts.word} chart releases found`);
      return;
    }
    if (charts.total) {
      await _packageCharts({ core, exec, charts });
    }
    await _publishChartReleases({ github, context, core, deletedCharts });
    if (config('repository').chart.packages.enabled) {
      await _generateChartsIndex({ github, context, core, exec, distRoot: './', charts });
    }
    if (config('repository').oci.packages.enabled) {
      await _publishOciReleases({ github, context, core, exec, deletedCharts });
    }
    core.info('Successfully completed the chart releases process');
  } catch (error) {
    utils.handleError(error, core, 'process chart releases');
  }
}

/**
 * Setup the build environment for generating the static site
 * 
 * This function prepares the environment for the GitHub Pages site by setting up all
 * required files and configurations for the Jekyll static site generator. It performs
 * these key steps:
 * 
 * 1. Generates a comprehensive chart index with all charts in the repository
 * 2. Copies the Jekyll configuration file to the root directory
 * 3. Sets up custom HTML head content for the Jekyll theme
 * 4. Ensures the index.md file exists in the root directory
 * 5. Removes README.md to prevent conflicts with index.html during site generation
 * 
 * The function also outputs the configured deployment type (production/staging) as
 * a GitHub Actions output parameter, which is used in subsequent workflow steps to
 * conditionally execute the actual deployment.
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @returns {Promise<void>}
 */
async function setupBuildEnvironment({ context, core }) {
  core.info(`Setting up build environment for '${config('release').deployment}' deployment`);
  await _generateFrontpage({ context, core });
  try {
    core.info(`Copying Jekyll theme config to ./_config.yml...`);
    await fs.copyFile(config('theme').configuration.file, './_config.yml');
  } catch (error) {
    utils.handleError(error, core, 'copy Jekyll theme config');
  }
  try {
    core.info(`Copying Jekyll theme custom head content to ./_includes/head-custom.html...`);
    await fs.mkdir('./_includes', { recursive: true });
    await fs.copyFile(config('theme').head.template, './_includes/head-custom.html');
  } catch (error) {
    utils.handleError(error, core, 'copy Jekyll theme custom head content', false);
  }
  try {
    core.info(`Copying Jekyll theme custom layout content to ./_layouts/default.html...`);
    await fs.mkdir('./_layouts', { recursive: true });
    await fs.copyFile(config('theme').layout.template, './_layouts/default.html');
  } catch (error) {
    utils.handleError(error, core, 'copy Jekyll theme custom layout content', false);
  }
  const private = context.payload.repository.private === true;
  const publish = !private && config('release').deployment === 'production';
  core.setOutput('publish', publish);
  core.info(`Successfully completed setup for '${config('release').deployment}' deployment`);
}

/**
 * Exports the module's functions
 */
module.exports = {
  processReleases,
  setupBuildEnvironment
};
