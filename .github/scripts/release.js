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

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const yaml = require('js-yaml');
const api = require('./github-api');
const config = require('./config');
const utils = require('./utils');

/**
 * Builds a GitHub release for a single chart and uploads the chart package as an asset
 * 
 * This function creates a GitHub release for a chart and uploads the packaged chart
 * as a release asset.
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client
 * @param {Object} params.context - GitHub Actions context for repository info
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {string} params.chartName - Name of the chart
 * @param {string} params.chartVersion - Version of the chart
 * @param {string} params.chartType - Type of chart (application/library)
 * @param {Object} params.chartMetadata - Chart metadata from Chart.yaml
 * @param {boolean} params.iconExists - Whether an icon exists for the chart
 * @param {string} params.chartPath - Path to the chart package
 * @param {string} params.packageName - Name of the package file
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
    core.info(`Processing release for ${tagName}...`);
    const existingRelease = await api.getReleaseByTag({
      github,
      context,
      core,
      tagName
    });
    if (existingRelease) {
      core.info(`Release ${tagName} already exists, skipping`);
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
    core.info(`Successfully created release for ${tagName}`);
  } catch (error) {
    utils.handleError(error, core, `create release for ${chartName} v${chartVersion}`);
  }
}

/**
 * Creates GitHub releases for packaged charts and uploads the chart packages as release assets
 * 
 * Processes all packaged charts in the specified directory, creating GitHub releases
 * for each chart and uploading the packages as assets.
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client
 * @param {Object} params.context - GitHub Actions context for repository info
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {string} [params.packagesPath] - Directory with chart packages
 * @returns {Promise<void>}
 */
async function _createChartReleases({
  github,
  context,
  core,
  packagesPath
}) {
  try {
    core.info('Creating GitHub releases for charts...');
    const files = await fs.readdir(packagesPath);
    const packages = files.filter(file => file.endsWith('.tgz'));
    core.info(`Found ${packages.length} chart packages to release`);
    for (const pkg of packages) {
      const chartPath = path.join(packagesPath, pkg);
      const chartNameWithVersion = pkg.replace('.tgz', '');
      const lastDashIndex = chartNameWithVersion.lastIndexOf('-');
      const chartName = chartNameWithVersion.substring(0, lastDashIndex);
      const chartVersion = chartNameWithVersion.substring(lastDashIndex + 1);
      try {
        const appChartDir = path.join(config('release').repository.chart.type.application, chartName);
        const libChartDir = path.join(config('release').repository.chart.type.library, chartName);
        const libChartExists = await utils.fileExists(libChartDir);
        const chartType = libChartExists ? 'library' : 'application';
        const chartDir = chartType === 'library' ? libChartDir : appChartDir;
        let chartMetadata = {};
        const chartYamlPath = path.join(chartDir, 'Chart.yaml');
        try {
          const chartYamlContent = await fs.readFile(chartYamlPath, 'utf8');
          chartMetadata = yaml.load(chartYamlContent);
          core.info(`Loaded chart metadata from ${chartYamlPath}`);
        } catch (error) {
          core.warning(`Failed to load chart metadata: ${error.message}`);
        }
        const iconPath = path.join(chartDir, config('release').repository.chart.icon);
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
        const errorMsg = `Error processing chart ${chartName} v${chartVersion}: ${error.message}`;
        if (!config('release').skipExisting) {
          core.setFailed(errorMsg);
          throw new Error(errorMsg);
        } else {
          core.warning(errorMsg);
        }
      }
    }
  } catch (error) {
    utils.handleError(error, core, 'create chart releases');
  }
}

/**
 * Generates release content using the template file
 * 
 * Creates GitHub release notes for a chart using the Handlebars template
 * and chart metadata.
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client
 * @param {Object} params.core - GitHub Actions Core API for logging
 * @param {Object} params.context - GitHub Actions context
 * @param {string} params.chartName - Name of the chart
 * @param {string} params.chartVersion - Version of the chart
 * @param {string} params.chartType - Type of chart (application/library)
 * @param {Object} params.chartMetadata - Chart metadata from Chart.yaml
 * @param {boolean} params.iconExists - Whether an icon exists for the chart
 * @param {string} [params.releaseTemplate=CONFIG.release.repository.chart.release.template] - Path to release template
 * @returns {Promise<string>} - Generated release content
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
    core.info(`Generating release content for ${chartName} chart...`);
    await fs.mkdir('./_dist', { recursive: true });
    try {
      await fs.access(releaseTemplate);
      core.info(`Release template found at: ${releaseTemplate}`);
    } catch (accessError) {
      utils.handleError(accessError, core, `find template file at ${releaseTemplate}`, false);
      return `Release of ${chartName} chart version ${chartVersion}`;
    }
    const repoUrl = context.payload.repository.html_url;
    const templateContent = await fs.readFile(releaseTemplate, 'utf8');
    core.info(`Loaded release template from ${releaseTemplate}`);
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
    return `Release of ${chartName} chart with ${chartVersion} version`;
  }
}

/**
 * Generates the Helm repository index file
 * 
 * Creates or updates the Helm repository index file based on packaged charts.
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.exec - GitHub Actions exec helpers
 * @param {Object} params.core - GitHub Actions Core API for logging
 * @param {string} params.packagesPath - Directory with packaged charts
 * @param {string} params.indexPath - Output path for the index file
 * @param {string} params.repoUrl - URL of the Helm repository
 * @returns {Promise<void>}
 */
async function _generateHelmIndex({
  exec,
  core,
  packagesPath,
  indexPath,
  repoUrl
}) {
  try {
    core.info('Generating Helm repository index...');
    const indexDir = path.dirname(indexPath);
    await fs.mkdir(indexDir, { recursive: true });
    await exec.exec('helm', ['repo', 'index', packagesPath, '--url', repoUrl]);
    await fs.copyFile(
      path.join(packagesPath, './index.yaml'),
      indexPath
    );
    core.info(`Successfully generated ${indexPath} repository index`);
  } catch (error) {
    utils.handleError(error, core, 'generate Helm repository index');
  }
}

/**
 * Packages all charts in a specified directory and updates references
 * 
 * This function finds all charts in the application and library directories,
 * packages them with Helm, and stores the packages in the specified output directory.
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.exec - GitHub Actions exec helpers
 * @param {Object} params.core - GitHub Actions Core API for logging
 * @param {string} params.outputDir - Directory to store packaged charts
 * @returns {Promise<void>}
 */
async function _packageCharts({
  exec,
  core,
  outputDir
}) {
  try {
    const charts = await utils.findCharts({
      core,
      appDir: config('release').repository.chart.type.application,
      libDir: config('release').repository.chart.type.library
    });
    charts.application.sort();
    charts.library.sort();
    const chartDirs = [...charts.application, ...charts.library];
    if (!chartDirs.length) {
      core.info(`No charts found`);
      return;
    }
    for (const chartDir of chartDirs) {
      core.info(`Packaging ${chartDir} chart...`);
      await exec.exec('helm', ['package', chartDir, '--destination', outputDir]);
    }
    core.info(`Successfully packaged ${chartDirs.length} charts`);
  } catch (error) {
    utils.handleError(error, core, 'package charts');
  }
}

/**
 * Generates charts index page from index.yaml file
 * 
 * This function reads the Helm repository index file (index.yaml) and generates
 * a markdown file listing all available charts. The generated content is written
 * to both the distribution directory and the root directory for GitHub Pages.
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.context - GitHub Actions context for repository info
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @returns {Promise<boolean>} - True if successful, false if skipped
 */
async function generateIndex({
  context,
  core
}) {
  try {
    const repositoryIndexDist = './_dist/index.yaml';
    const frontpageDist = './_dist/index.md';
    const frontpageTemplate = config('release').frontpage.template;
    const frontpageRoot = './index.md';
    core.info(`Reading index YAML from ${repositoryIndexDist}...`);
    let indexContent;
    try {
      indexContent = await fs.readFile(repositoryIndexDist, 'utf8');
      core.info(`Successfully read chart index with ${indexContent.length} bytes`);
    } catch (readError) {
      utils.handleError(readError, core, 'read chart index', false);
      const emptyIndex = {
        apiVersion: 'v1',
        entries: {},
        generated: new Date().toISOString()
      };
      indexContent = yaml.dump(emptyIndex);
      const repositoryDir = path.dirname(repositoryIndexDist);
      await fs.mkdir(repositoryDir, { recursive: true });
      await fs.writeFile(repositoryIndexDist, indexContent, 'utf8');
      core.info(`Successfully created empty chart index at ${repositoryIndexDist}`);
    }
    const index = yaml.load(indexContent);
    if (!index || !index.entries) {
      core.info('Creating empty index page...');
      const frontpageDir = path.dirname(frontpageDist);
      await fs.mkdir(frontpageDir, { recursive: true });
      await fs.writeFile(frontpageDist, '', 'utf8');
      await fs.writeFile(frontpageRoot, '', 'utf8');
      core.info('Successfully created empty index page');
      return true;
    }
    core.info(`Reading frontpage template from ${frontpageTemplate}...`);
    const template = await fs.readFile(frontpageTemplate, 'utf8');
    core.info(`Successfully read template with ${template.length} bytes`);
    const repoUrl = context.payload.repository.html_url;
    const defaultBranchName = context.payload.repository.default_branch;
    const Handlebars = utils.registerHandlebarsHelpers(repoUrl);
    const charts = Object.entries(index.entries)
      .sort(([source], [target]) => source.localeCompare(target))
      .map(([name, versions]) => {
        if (!versions || !versions.length) return null;
        const latest = versions[0];
        return {
          Description: latest.description || '',
          Name: name,
          Type: latest.type || 'application',
          Version: latest.version || ''
        };
      })
      .filter(Boolean);
    const compiledTemplate = Handlebars.compile(template);
    const newContent = compiledTemplate({
      Charts: charts,
      RepoURL: repoUrl,
      Branch: defaultBranchName
    });
    core.info(`Successfully generated content with ${newContent.length} bytes`);
    const frontpageDir = path.dirname(frontpageDist);
    await fs.mkdir(frontpageDir, { recursive: true });
    core.info(`Creating index page into root directory and ${frontpageDist}...`);
    await fs.writeFile(frontpageRoot, newContent, 'utf8');
    await fs.writeFile(frontpageDist, newContent, 'utf8');
    core.info('Successfully created index page');
    return true;
  } catch (error) {
    utils.handleError(error, core, 'create index page');
  }
}

/**
 * Handles the complete Helm chart releases process:
 * 1. Packages application and library charts
 * 2. Creates GitHub releases
 * 3. Generates the repository index
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client
 * @param {Object} params.context - GitHub Actions context for repository info
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
    const repositoryIndexDist = './_dist/index.yaml';
    const releasePackages = './.cr-release-packages';
    core.info(`Creating ${releasePackages} directory...`);
    core.info('Validating required labels...');
    const releaseLabels = Object.entries(config('release').labels);
    await Promise.all(releaseLabels.map(([name, info]) =>
      utils.addLabel({ github, context, core, labelName: name, color: info.color, description: info.description })));
    await fs.mkdir(releasePackages, { recursive: true });
    core.info(`Successfully created ${releasePackages} directory`);
    core.info('Packaging all charts...');
    await _packageCharts({ exec, core, outputDir: releasePackages });
    core.info('Creating all chart releases...');
    await _createChartReleases({ github, context, core, packagesPath: releasePackages });
    core.info('Generating Helm repository index...');
    const repoUrl = config('release').repository.url;
    await _generateHelmIndex({
      exec,
      core,
      packagesPath: releasePackages,
      indexPath: repositoryIndexDist,
      repoUrl
    });
    core.info('Successfully completed the chart releases process');
  } catch (error) {
    utils.handleError(error, core, 'process chart releases');
  }
}

/**
 * Setup the build environment for generating the static site
 * 
 * This function prepares the environment for Jekyll to build the GitHub Pages site:
 * 1. Copies the Jekyll configuration file to the appropriate location
 * 2. Processes custom head content if present
 * 3. Ensures index.md exists in the root directory
 * 4. Removes README.md to prevent conflicts with index.html
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @returns {Promise<void>}
 */
async function setupBuildEnvironment({ core }) {
  try {
    core.info(`Setting up build environment for ${config('release').deployment} deployment`);
    core.info(`Copying ${config('release').configuration.file} to ./_config.yml...`);
    await fs.copyFile(config('release').configuration.file, './_config.yml');
    try {
      const configContent = await fs.readFile(config('release').configuration.file, 'utf8');
      const configYaml = yaml.load(configContent);
      if (configYaml.head) {
        const headDir = path.dirname('./_includes/head-custom.html');
        await fs.mkdir(headDir, { recursive: true });
        await fs.writeFile('./_includes/head-custom.html', configYaml.head, 'utf8');
        core.info(`Successfully created custom head content`);
      }
    } catch (headError) {
      utils.handleError(headError, core, 'process custom head content', false);
    }
  } catch (error) {
    utils.handleError(error, core, 'copy Jekyll config');
  }
  try {
    const frontpageRoot = './index.md';
    const frontpageDist = './_dist/index.md';
    const [rootExists, distExists] = await Promise.all([
      utils.fileExists(frontpageRoot),
      utils.fileExists(frontpageDist)
    ]);
    if (rootExists) {
      core.info(`Using existing index.md at ${frontpageRoot}...`);
    } else if (distExists) {
      core.info(`Copying ${frontpageDist} to ${frontpageRoot}...`);
      await fs.copyFile(frontpageDist, frontpageRoot);
    } else {
      core.info(`No index.md found at ${frontpageDist} or ${frontpageRoot}, creating empty file...`);
      await fs.writeFile(frontpageRoot, '', 'utf8');
    }
  } catch (error) {
    utils.handleError(error, core, 'process index.md');
  }
  try {
    const readmePath = './README.md';
    if (await utils.fileExists(readmePath)) {
      core.info(`Removing ${readmePath} from root to prevent conflicts with index.html...`);
      await fs.unlink(readmePath);
    }
  } catch (error) {
    utils.handleError(error, core, 'remove README.md');
  }
  core.setOutput('deployment', config('release').deployment);
  core.info(`Jekyll preparation complete for ${config('release').deployment} environment`);
}

/**
 * Exports the module's configuration and functions
 * 
 * As functions are migrated from chart.js, they will be added to this export statement.
 * Each function will be documented with JSDoc comments to describe its purpose,
 * parameters, and return values.
 */
module.exports = {
  generateIndex,
  processReleases,
  setupBuildEnvironment
};
