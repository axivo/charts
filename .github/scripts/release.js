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
 * @param {string} params.chartName - Name of the chart (e.g., "nginx")
 * @param {string} params.chartVersion - Version of the chart (e.g., "1.2.3")
 * @param {string} params.chartType - Type of chart ("application" or "library")
 * @param {Object} params.chartMetadata - Chart metadata from Chart.yaml
 * @param {boolean} params.iconExists - Whether an icon exists for the chart
 * @param {string} params.chartPath - Path to the chart package .tgz file
 * @param {string} params.packageName - Name of the package file (e.g., "nginx-1.2.3.tgz")
 * @returns {Promise<void>}
 */
async function _buildChartRelease({
  github,
  context,
  core,
  chartName,
  chartVersion,
  chartType,
  chartMetadata,
  iconExists,
  chartPath,
  packageName
}) {
  try {
    const releaseTitle = config('release').title;
    const tagName = releaseTitle
      ? releaseTitle
        .replace('{{ .Name }}', chartName)
        .replace('{{ .Version }}', chartVersion)
      : `${chartName}-v${chartVersion}`;
    core.info(`Processing '${tagName}' release...`);
    const existingRelease = await api.getReleaseByTag({
      github,
      context,
      core,
      tagName
    });
    if (existingRelease) {
      core.info(`Release '${tagName}' already exists, skipping`);
      return;
    }
    const releaseBody = await _generateChartRelease({
      github,
      core,
      context,
      chartName,
      chartVersion,
      chartType,
      chartMetadata,
      iconExists
    });
    const releaseName = releaseTitle
      ? releaseTitle
        .replace('{{ .Name }}', chartName)
        .replace('{{ .Version }}', chartVersion)
      : `${chartName} ${chartVersion}`;
    const release = await api.createRelease({
      github,
      context,
      core,
      tagName,
      name: releaseName,
      body: releaseBody
    });
    const fileContent = await fs.readFile(chartPath);
    await api.uploadReleaseAsset({
      github,
      context,
      core,
      releaseId: release.id,
      assetName: packageName,
      assetData: fileContent
    });
    core.info(`Successfully created '${tagName}' release`);
  } catch (error) {
    utils.handleError(error, core, `create release for ${chartName} v${chartVersion}`, false);
  }
}

/**
 * Creates GitHub releases for packaged charts and uploads the chart packages as release assets
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
 * The function processes each chart independently, handling errors for individual
 * charts as non-fatal so that other charts can still be released if one fails.
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {string} params.packagesPath - Directory containing packaged chart .tgz files
 * @returns {Promise<void>}
 */
async function _createChartReleases({
  github,
  context,
  core,
  packagesPath
}) {
  try {
    const files = await fs.readdir(packagesPath);
    const packages = files.filter(file => file.endsWith('.tgz'));
    const word = packages.length === 1 ? 'package' : 'packages'
    core.info(`Preparing ${packages.length} chart ${word} to release...`);
    await Promise.all(packages.map(async (pkg) => {
      try {
        const chartPath = path.join(packagesPath, pkg);
        const chartNameWithVersion = pkg.replace('.tgz', '');
        const lastDashIndex = chartNameWithVersion.lastIndexOf('-');
        const chartName = chartNameWithVersion.substring(0, lastDashIndex);
        const chartVersion = chartNameWithVersion.substring(lastDashIndex + 1);
        const appChartDir = path.join(config('repository').chart.type.application, chartName);
        const libChartDir = path.join(config('repository').chart.type.library, chartName);
        const libChartExists = await utils.fileExists(libChartDir);
        const chartType = libChartExists ? 'library' : 'application';
        const chartDir = chartType === 'library' ? libChartDir : appChartDir;
        let chartMetadata = {};
        const chartYamlPath = path.join(chartDir, 'Chart.yaml');
        try {
          const chartYamlContent = await fs.readFile(chartYamlPath, 'utf8');
          chartMetadata = yaml.load(chartYamlContent);
          core.info(`Successfully loaded '${chartDir}' chart metadata`);
        } catch (error) {
          utils.handleError(error, core, `load '${chartDir}' chart metadata`, false);
        }
        const iconPath = path.join(chartDir, config('repository').chart.icon);
        const iconExists = await utils.fileExists(iconPath);
        await _buildChartRelease({
          github,
          context,
          core,
          chartName,
          chartVersion,
          chartType,
          chartMetadata,
          iconExists,
          chartPath,
          packageName: pkg
        });
      } catch (error) {
        utils.handleError(error, core, `create ${chartName} v${chartVersion} release`, false);
      }
    }));
  } catch (error) {
    utils.handleError(error, core, 'create chart releases');
  }
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
 * @param {Object} params.exec - GitHub Actions exec helpers for running commands
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {string} params.distRoot - Root directory for distribution files
 * @param {Object} params.charts - Object containing application and library chart paths to process
 * @returns {Promise<void>}
 */
async function _generateChartsIndex({
  github,
  context,
  core,
  exec,
  distRoot,
  charts
}) {
  try {
    core.info('Generating chart repository indices...');
    const appType = config('repository').chart.type.application;
    const libType = config('repository').chart.type.library;
    const chartDirs = [...charts.application, ...charts.library];
    const tempDir = path.join('_dist');
    await fs.mkdir(tempDir, { recursive: true });
    await fs.mkdir(path.join(tempDir, appType), { recursive: true });
    await fs.mkdir(path.join(tempDir, libType), { recursive: true });
    core.info('Fetching all repository releases...');
    const allReleases = await api.getReleases({
      github,
      context,
      core
    });
    core.info(`Found ${allReleases.length} releases in repository`);
    await Promise.all(chartDirs.map(async (chartDir) => {
      try {
        const chartName = path.basename(chartDir);
        const chartType = charts.application.includes(chartDir) ? appType : libType;
        const chartOutputDir = path.join(distRoot, chartType, chartName);
        await fs.mkdir(chartOutputDir, { recursive: true });
        const chartTempDir = path.join(tempDir, chartType);
        const titlePrefix = config('release').title
          .replace('{{ .Name }}', chartName)
          .replace('{{ .Version }}', '');
        const chartReleases = allReleases.filter(release => release.tag_name.startsWith(titlePrefix));
        core.info(`Found ${chartReleases.length} releases for '${chartType}/${chartName}' chart`);
        if (!chartReleases.length) {
          core.info(`No releases found for '${chartType}/${chartName}' chart, skipping index generation`);
          return;
        }
        const indexPath = path.join(chartOutputDir, 'index.yaml');
        if (!await utils.fileExists(indexPath)) {
          const url = [config('repository').url, chartType, chartName].join('/');
          await exec.exec('helm', ['repo', 'index', chartOutputDir, '--url', url]);
        }
        for (const release of chartReleases) {
          const asset = release.assets.find(a => a.content_type === 'application/x-gzip');
          if (asset) {
            const chartFile = path.join(chartTempDir, path.basename(asset.browser_download_url));
            const url = [config('repository').url, chartType, chartName].join('/');
            await exec.exec('curl', ['-sSL', asset.browser_download_url, '-o', chartFile]);
            await exec.exec('helm', ['repo', 'index', chartTempDir, '--url', url, '--merge', indexPath]);
          }
        }
        core.info(` Successfully generated '${chartType}/${chartName}' index`);
      } catch (error) {
        utils.handleError(error, core, `generate '${chartType}/${chartName}' index`, false);
      }
    }));
    core.info('Successfully generated per-chart repository indexes');
  } catch (error) {
    utils.handleError(error, core, 'generate repository indexes', false);
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
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {string} params.chartName - Name of the chart
 * @param {string} params.chartVersion - Version of the chart
 * @param {string} params.chartType - Type of chart ("application" or "library")
 * @param {Object} params.chartMetadata - Chart metadata from Chart.yaml
 * @param {boolean} params.iconExists - Whether an icon exists for the chart
 * @param {string} [params.releaseTemplate=config('release').template] - Path to Handlebars template for release notes
 * @returns {Promise<string>} - Generated release content in markdown format
 */
async function _generateChartRelease({
  github,
  core,
  context,
  chartName,
  chartVersion,
  chartType,
  chartMetadata,
  iconExists,
  releaseTemplate = config('release').template
}) {
  try {
    core.info(`Generating release content for '${chartType}/${chartName}' chart...`);
    try {
      await fs.access(releaseTemplate);
    } catch (accessError) {
      utils.handleError(accessError, core, `find ${releaseTemplate} template`, false);
    }
    const repoUrl = context.payload.repository.html_url;
    const templateContent = await fs.readFile(releaseTemplate, 'utf8');
    const Handlebars = utils.registerHandlebarsHelpers(repoUrl);
    const template = Handlebars.compile(templateContent);
    const chartSources = chartMetadata.sources || [];
    const issues = await api.getReleaseIssues({ github, context, core, chartType, chartName });
    const templateContext = {
      AppVersion: chartMetadata.appVersion || '',
      Branch: context.payload.repository.default_branch,
      Dependencies: (chartMetadata.dependencies || []).map(dependency => ({
        Name: dependency.name,
        Repository: dependency.repository,
        Source: chartSources.length > 0 ? chartSources[0] : null,
        Version: dependency.version
      })),
      Description: chartMetadata.description || '',
      Icon: iconExists ? config('repository').chart.icon : null,
      Issues: issues.length > 0 ? issues : null,
      KubeVersion: chartMetadata.kubeVersion || '',
      Name: chartName,
      RepoURL: repoUrl,
      Type: chartType,
      Version: chartVersion
    };
    return template(templateContext);
  } catch (error) {
    utils.handleError(error, core, 'generate release content', false);
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
async function _generateFrontpage({
  context,
  core
}) {
  try {
    const appDir = config('repository').chart.type.application;
    const libDir = config('repository').chart.type.library;
    const chartDirs = await utils.findCharts({
      core,
      appDir,
      libDir
    });
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
    core.info(`Successfully generated index content with ${newContent.length} bytes`);
    return true;
  } catch (error) {
    utils.handleError(error, core, 'create index frontpage');
  }
}

/**
 * Processes chart releases for OCI registry publishing
 * 
 * This function publishes charts to an OCI registry (GitHub Container Registry)
 * in addition to the traditional Helm repository. This provides users with
 * multiple installation options and better integration with container workflows.
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client for making API calls
 * @param {Object} params.context - GitHub Actions context containing repository information
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {Object} params.exec - GitHub Actions exec helpers for running commands
 * @param {string} params.packagesPath - Directory containing packaged chart .tgz files
 * @returns {Promise<void>}
 */
async function _processOciReleases({
  github,
  context,
  core,
  exec,
  packagesPath
}) {
  try {
    const ociRegistry = config('repository').oci.registry;
    if (!config('repository').oci.enabled) {
      core.info('OCI publishing is disabled');
      return;
    }
    const files = await fs.readdir(packagesPath);
    const packages = files.filter(file => file.endsWith('.tgz'));
    if (!packages.length) {
      core.info('No chart packages found for OCI publishing');
      return;
    }
    const word = packages.length === 1 ? 'package' : 'packages'
    core.info(`Publishing ${packages.length} chart ${word} to '${ociRegistry}' OCI registry...`);
    for (const pkg of packages) {
      const chartPath = path.join(packagesPath, pkg);
      try {
        core.info(`Pushing '${pkg}' to OCI registry...`);
        await exec.exec('helm', ['push', chartPath, `oci://${ociRegistry}`]);
        core.info(`Successfully pushed '${pkg}' to OCI registry`);
      } catch (error) {
        utils.handleError(error, core, `push '${pkg}' to OCI registry`, false);
      }
    }
    core.info('Successfully completed OCI chart publishing');
  } catch (error) {
    utils.handleError(error, core, 'push chart packages to OCI registry');
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
async function processReleases({
  github,
  context,
  core,
  exec
}) {
  try {
    const appChartType = config('repository').chart.type.application;
    const libChartType = config('repository').chart.type.library;
    const files = await api.getUpdatedFiles({ github, context, core });
    const charts = await utils.findCharts({ core, appDir: appChartType, libDir: libChartType, files });
    if (!(charts.application.length + charts.library.length)) {
      core.info('No new charts releases found');
      return;
    }
    const releasePackages = './.cr-release-packages';
    core.info(`Creating ${releasePackages} directory...`);
    await fs.mkdir(releasePackages, { recursive: true });
    core.info(`Successfully created ${releasePackages} directory`);
    const chartDirs = [...charts.application, ...charts.library];
    await Promise.all(chartDirs.map(async (chartDir) => {
      try {
        core.info(`Packaging '${chartDir}' chart...`);
        core.info(`Updating dependencies for '${chartDir}' chart...`);
        await exec.exec('helm', ['dependency', 'update', chartDir]);
        await exec.exec('helm', ['package', chartDir, '--destination', releasePackages]);
      } catch (error) {
        utils.handleError(error, core, `package ${chartDir} chart`, false);
      }
    }));
    core.info(`Successfully packaged ${chartDirs.length} charts`);
    await _createChartReleases({ github, context, core, packagesPath: releasePackages });
    const repoUrl = config('repository').url;
    await _generateChartsIndex({
      github,
      context,
      exec,
      core,
      distRoot: './',
      charts
    });
    if (config('repository').oci.enabled) {
      core.info('Setting up OCI registry authentication...');
      const token = process.env.GITHUB_TOKEN;
      try {
        await exec.exec('helm', [
          'registry',
          'login',
          config('repository').oci.registry,
          '--username',
          context.actor,
          '--password',
          token
        ]);
        core.info('Successfully authenticated with OCI registry');
      } catch (error) {
        utils.handleError(error, core, 'authenticate with OCI registry', false);
        return;
      }
      await _processOciReleases({
        github,
        context,
        core,
        exec,
        packagesPath: releasePackages
      });
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
async function setupBuildEnvironment({
  context,
  core
}) {
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
  try {
    const readmePath = './README.md';
    if (await utils.fileExists(readmePath)) {
      core.info(`Removing README.md file from root...`);
      await fs.unlink(readmePath);
    }
  } catch (error) {
    utils.handleError(error, core, 'remove README.md file');
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
