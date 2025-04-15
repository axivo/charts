
/**
 * GitHub Pages and Chart Release Utilities
 * 
 * This module provides centralized configuration and functions for Helm chart releases and GitHub Pages:
 * - Centralized configuration constants
 * - Setting GitHub Actions outputs for workflow steps
 * - Generating chart index pages from Helm chart releases
 * - Preparing the build environment for Jekyll
 * - Finalizing GitHub Pages deployment
 * - Packaging and releasing Helm charts
 * 
 * @module pages
 */

/**
 * Configuration constants for GitHub Pages module
 * Contains paths, templates, and settings used throughout the chart release process
 */
const CONFIG = {
  chart: {
    icon: 'icon.png',
    indexTemplate: '.github/pages/index.md.hbs',
    packagesWithIndex: 'true',
    releaseTemplate: '.github/pages/release.md.hbs',
    releaseTitle: '{{ .Name }}-v{{ .Version }}',
    repoUrl: 'https://axivo.github.io/charts/',
    skipExisting: 'true',
    type: {
      application: 'application',
      library: 'library'
    }
  },
  deployment: 'production',
  filesystem: {
    configHome: './_config.yml',
    configPath: '.github/pages/config.yml',
    distPath: './_dist',
    headCustomPath: './_includes/head-custom.html',
    indexMdHome: './index.md',
    indexMdPath: './_dist/index.md',
    indexPath: './_dist/index.yaml',
    indexRegistry: 'index.yaml',
    readmePath: './README.md',
    temp: '.cr-release-packages'
  }
};
const githubApi = require('./github-api');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Builds a GitHub release for a single chart and uploads the chart package as an asset
 * 
 * @param {Object} options - Options for building a chart release
 * @param {Object} options.github - GitHub API client
 * @param {Object} options.context - GitHub Actions context for repository info
 * @param {Object} options.core - GitHub Actions Core API for logging and output
 * @param {Object} options.fs - Node.js fs module for file operations
 * @param {string} options.chartName - Name of the chart
 * @param {string} options.chartVersion - Version of the chart
 * @param {string} options.chartType - Type of chart (application/library)
 * @param {Object} options.chartMetadata - Chart metadata from Chart.yaml
 * @param {boolean} options.iconExists - Whether an icon exists for the chart
 * @param {string} options.chartPath - Path to the chart package
 * @param {string} options.packageName - Name of the package file
 * @returns {Promise<void>}
 */
async function _buildChartRelease({
  github,
  context,
  core,
  fs,
  chartName,
  chartVersion,
  chartType,
  chartMetadata,
  iconExists,
  chartPath,
  packageName
}) {
  try {
    const tagName = CONFIG.chart.releaseTitle
      ? CONFIG.chart.releaseTitle
        .replace('{{ .Name }}', chartName)
        .replace('{{ .Version }}', chartVersion)
      : `${chartName}-v${chartVersion}`;
    core.info(`Processing release for ${tagName}`);
    const existingRelease = await githubApi.getReleaseByTag({
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
      fs,
      github,
      core,
      context,
      chartName,
      chartVersion,
      chartType,
      chartMetadata,
      iconExists
    });
    const releaseName = CONFIG.chart.releaseTitle
      ? CONFIG.chart.releaseTitle
        .replace('{{ .Name }}', chartName)
        .replace('{{ .Version }}', chartVersion)
      : `${chartName} ${chartVersion}`;
    const release = await githubApi.createRelease({
      github,
      context,
      core,
      tagName,
      name: releaseName,
      body: releaseBody
    });
    const fileContent = await fs.readFile(chartPath);
    await githubApi.uploadReleaseAsset({
      github,
      context,
      core,
      releaseId: release.id,
      assetName: packageName,
      assetData: fileContent
    });
    core.info(`Successfully created release for ${tagName}`);
  } catch (error) {
    const errorMsg = `Failed to create release for ${chartName} v${chartVersion}: ${error.message}`;
    core.setFailed(errorMsg);
    throw new Error(errorMsg);
  }
}

/**
 * Creates GitHub releases for packaged charts and uploads the chart packages as release assets
 * 
 * @param {Object} options - Options for creating GitHub releases
 * @param {Object} options.github - GitHub API client
 * @param {Object} options.context - GitHub Actions context for repository info
 * @param {Object} options.core - GitHub Actions Core API for logging and output
 * @param {Object} options.fs - Node.js fs module for file operations
 * @param {string} [options.packagesDir=CONFIG.filesystem.temp] - Directory with chart packages
 * @returns {Promise<void>}
 */
async function _createChartReleases({
  github,
  context,
  core,
  fs,
  packagesDir = CONFIG.filesystem.temp
}) {
  try {
    const files = await fs.readdir(packagesDir);
    const packages = files.filter(file => file.endsWith('.tgz'));
    core.info(`Found ${packages.length} chart packages to release`);
    for (const pkg of packages) {
      const chartPath = path.join(packagesDir, pkg);
      const chartNameWithVersion = pkg.replace('.tgz', '');
      const lastDashIndex = chartNameWithVersion.lastIndexOf('-');
      const chartName = chartNameWithVersion.substring(0, lastDashIndex);
      const chartVersion = chartNameWithVersion.substring(lastDashIndex + 1);
      try {
        let chartType = 'application';
        const appChartDir = path.join(CONFIG.chart.type.application, chartName);
        const libraryChartDir = path.join(CONFIG.chart.type.library, chartName);
        if (await _fileExists(fs, libraryChartDir)) {
          chartType = 'library';
        }
        let chartMetadata = {};
        const chartYamlPath = path.join(chartType === 'library' ? libraryChartDir : appChartDir, 'Chart.yaml');
        try {
          const chartYamlContent = await fs.readFile(chartYamlPath, 'utf8');
          chartMetadata = yaml.load(chartYamlContent);
          core.info(`Loaded chart metadata from ${chartYamlPath}`);
        } catch (error) {
          core.warning(`Failed to load chart metadata: ${error.message}`);
        }
        const iconPath = path.join(chartType === 'library' ? libraryChartDir : appChartDir, CONFIG.chart.icon);
        const iconExists = await _fileExists(fs, iconPath);
        await _buildChartRelease({
          github,
          context,
          core,
          fs,
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
        if (!CONFIG.chart.skipExisting) {
          core.setFailed(errorMsg);
          throw new Error(errorMsg);
        } else {
          core.warning(errorMsg);
        }
      }
    }
  } catch (error) {
    const errorMsg = `Failed to create chart releases: ${error.message}`;
    core.setFailed(errorMsg);
    throw new Error(errorMsg);
  }
}

/**
 * Helper function to check if a file exists
 * @param {Object} fs - Node.js fs/promises module
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>} - True if file exists, false otherwise
 */
async function _fileExists(fs, filePath) {
  return fs.access(filePath).then(() => true).catch(() => false);
}

/**
 * Recursively finds directories containing Chart.yaml files
 * @param {Object} fs - Node.js fs/promises module
 * @param {Object} core - GitHub Actions Core API for logging
 * @param {string} directory - Directory to search in
 * @returns {Promise<string[]>} - Array of directories containing Chart.yaml files
 */
async function _findChartYamlFiles(fs, core, directory) {
  const chartDirs = [];
  async function searchDir(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        switch (true) {
          case entry.isDirectory(): await searchDir(fullPath); break;
          case entry.name === 'Chart.yaml': chartDirs.push(dir); break;
          default: break;
        }
      }
    } catch (error) {
      core.warning(`Error reading directory ${dir}: ${error.message}`);
    }
  }
  await searchDir(directory);
  return chartDirs;
}

/**
 * Generates release content using the template file
 * 
 * @param {Object} options - Options for generating the release content
 * @param {Object} options.fs - Node.js fs module for file operations
 * @param {Object} options.core - GitHub Actions Core API for logging
 * @param {Object} options.context - GitHub Actions context
 * @param {string} options.chartName - Name of the chart
 * @param {string} options.chartVersion - Version of the chart
 * @param {string} options.chartType - Type of chart (application/library)
 * @param {Object} options.chartMetadata - Chart metadata from Chart.yaml
 * @param {boolean} options.iconExists - Whether an icon exists for the chart
 * @param {string} [options.releaseTemplate=CONFIG.chart.releaseTemplate] - Path to release template
 * @returns {Promise<string>} - Generated release content
 */
async function _generateChartRelease({
  fs,
  github,
  core,
  context,
  chartName,
  chartVersion,
  chartType,
  chartMetadata,
  iconExists,
  releaseTemplate = CONFIG.chart.releaseTemplate
}) {
  try {
    await fs.mkdir(CONFIG.filesystem.distPath, { recursive: true });
    try {
      await fs.access(releaseTemplate);
      core.info(`Release template found at: ${releaseTemplate}`);
    } catch (accessError) {
      core.warning(`Template file not found at ${releaseTemplate}: ${accessError.message}`);
      return `Release of ${chartName} chart version ${chartVersion}`;
    }
    const repoUrl = context.payload.repository.html_url;
    const templateContent = await fs.readFile(releaseTemplate, 'utf8');
    core.info(`Loaded release template from ${releaseTemplate}`);
    const Handlebars = _registerHandlebarsHelpers(repoUrl);
    const template = Handlebars.compile(templateContent);
    const chartSources = chartMetadata.sources || [];
    const issues = await githubApi.getReleaseIssues({ github, context, core, chartType, chartName });
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
      Icon: iconExists ? CONFIG.chart.icon : null,
      Issues: issues.length > 0 ? issues : null,
      KubeVersion: chartMetadata.kubeVersion || '',
      Name: chartName,
      RepoURL: repoUrl,
      Type: chartType,
      Version: chartVersion
    };
    return template(templateContext);
  } catch (error) {
    core.warning(`Failed to generate release content: ${error.message}`);
    return `Release of ${chartName} chart with ${chartVersion} version`;
  }
}

/**
 * Generates the Helm repository index file
 * 
 * @param {Object} options - Options for generating the index
 * @param {Object} options.exec - GitHub Actions exec helpers
 * @param {Object} options.core - GitHub Actions Core API for logging
 * @param {Object} options.fs - Node.js fs module for file operations
 * @param {string} options.packagesDir - Directory with packaged charts
 * @param {string} options.indexPath - Output path for the index file
 * @param {string} options.repoUrl - URL of the Helm repository
 * @returns {Promise<void>}
 */
async function _generateHelmIndex({
  exec,
  core,
  fs,
  packagesDir,
  indexPath,
  repoUrl
}) {
  try {
    const indexDir = path.dirname(indexPath);
    await fs.mkdir(indexDir, { recursive: true });
    await exec.exec('helm', ['repo', 'index', packagesDir, '--url', repoUrl]);
    await fs.copyFile(path.join(packagesDir, CONFIG.filesystem.indexRegistry), indexPath);
    core.info(`Successfully generated Helm repository index at ${indexPath}`);
  } catch (error) {
    const errorMsg = `Failed to generate Helm repository index: ${error.message}`;
    core.setFailed(errorMsg);
    throw new Error(errorMsg);
  }
}

/**
 * Packages all charts in a specified directory
 * 
 * @param {Object} options - Options for packaging charts
 * @param {Object} options.exec - GitHub Actions exec helpers
 * @param {Object} options.core - GitHub Actions Core API for logging
 * @param {Object} options.fs - Node.js fs module for file operations
 * @param {string} options.dirPath - Directory containing charts
 * @param {string} options.outputDir - Directory to store packaged charts
 * @returns {Promise<void>}
 */
async function _packageCharts({
  exec,
  core,
  fs,
  dirPath,
  outputDir
}) {
  try {
    const chartDirsArray = await _findChartYamlFiles(fs, core, dirPath);
    if (!chartDirsArray.length) {
      core.info(`No charts found in ${dirPath}`);
      return;
    }
    const charts = chartDirsArray;
    for (const chartDir of charts) {
      core.info(`Packaging chart: ${chartDir}`);
      core.info(`Updating dependencies for: ${chartDir}`);
      await exec.exec('helm', ['dependency', 'update', chartDir]);
      await exec.exec('helm', ['package', chartDir, '--destination', outputDir]);
    }
    core.info(`Successfully packaged ${charts.length} charts from ${dirPath} directory`);
  } catch (error) {
    const errorMsg = `Failed to package charts in ${dirPath} directory: ${error.message}`;
    core.setFailed(errorMsg);
    throw new Error(errorMsg);
  }
}

/**
 * Registers common Handlebars helpers
 * @param {string} repoUrl - Repository URL
 * @returns {Object} - Handlebars instance with registered helpers
 */
function _registerHandlebarsHelpers(repoUrl) {
  const Handlebars = require('handlebars');
  Handlebars.registerHelper('eq', function (a, b) {
    return a === b;
  });
  Handlebars.registerHelper('RepoRawURL', function () {
    return String(repoUrl).replace('github.com', 'raw.githubusercontent.com');
  });
  return Handlebars;
}

/**
 * Generate the chart index page from the index.yaml file
 * 
 * @param {Object} options - Options for chart index generation
 * @param {Object} options.context - GitHub Actions context for repository info
 * @param {Object} options.core - GitHub Actions Core API for logging and output
 * @param {Object} options.fs - Node.js fs/promises module for file operations
 * @param {string} [options.indexPath=CONFIG.filesystem.indexPath] - Path to the index.yaml file
 * @param {string} [options.indexMdPath=CONFIG.filesystem.indexMdPath] - Path where to write the generated index.md
 * @param {string} [options.indexTemplate=CONFIG.chart.indexTemplate] - Path to the Handlebars template
 * @returns {Promise<boolean>} - True if successful, false if skipped
 */
async function generateChartIndex({
  context,
  core,
  fs,
  indexPath = CONFIG.filesystem.indexPath,
  indexMdPath = CONFIG.filesystem.indexMdPath,
  indexTemplate = CONFIG.chart.indexTemplate
}) {
  try {
    core.info(`Reading index YAML from ${indexPath}`);
    let indexContent;
    try {
      indexContent = await fs.readFile(indexPath, 'utf8');
      core.info(`Successfully read index.yaml, size: ${indexContent.length} bytes`);
    } catch (readError) {
      core.warning(`Failed to read index.yaml: ${readError.message}`);
      core.warning('Creating an empty chart index...');
      const emptyIndex = {
        apiVersion: 'v1',
        entries: {},
        generated: new Date().toISOString()
      };
      indexContent = yaml.dump(emptyIndex);
      const distDir = path.dirname(indexPath);
      await fs.mkdir(distDir, { recursive: true });
      await fs.writeFile(indexPath, indexContent, 'utf8');
      core.info(`Created empty index.yaml at ${indexPath}`);
    }
    const index = yaml.load(indexContent);
    if (!index || !index.entries) {
      core.warning('Invalid or empty index.yaml file, creating an empty index.md file...');
      await fs.mkdir(path.dirname(indexMdPath), { recursive: true });
      await fs.writeFile(indexMdPath, '', 'utf8');
      await fs.writeFile(CONFIG.filesystem.indexMdHome, '', 'utf8');
      core.info(`Created empty index.md files`);
      return true;
    }
    core.info(`Reading template from ${indexTemplate}`);
    const template = await fs.readFile(indexTemplate, 'utf8');
    core.info(`Template loaded, size: ${template.length} bytes`);
    const repoUrl = context.payload.repository.html_url;
    const defaultBranchName = context.payload.repository.default_branch;
    const Handlebars = _registerHandlebarsHelpers(repoUrl);
    const charts = Object.entries(index.entries)
      .sort(([a], [b]) => a.localeCompare(b))
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
    core.info(`Generated content length: ${newContent.length} bytes`);
    await fs.mkdir(path.dirname(indexMdPath), { recursive: true });
    core.info(`Writing index.md to root directory and ${indexMdPath}`);
    await fs.writeFile(CONFIG.filesystem.indexMdHome, newContent, 'utf8');
    await fs.writeFile(indexMdPath, newContent, 'utf8');
    core.info('Successfully generated index.md');
    return true;
  } catch (error) {
    const errorMsg = `Failed to generate index.md: ${error.message}`;
    core.setFailed(errorMsg);
    throw new Error(errorMsg);
  }
}

/**
 * Handles the complete Helm chart release process:
 * 1. Packages application and library charts
 * 2. Creates GitHub releases
 * 3. Generates the repository index
 * 
 * @param {Object} options - Options for the chart release process
 * @param {Object} options.github - GitHub API client
 * @param {Object} options.context - GitHub Actions context for repository info
 * @param {Object} options.core - GitHub Actions Core API for logging and output
 * @param {Object} options.fs - Node.js fs module for file operations
 * @param {Object} options.exec - GitHub Actions exec helpers for running commands
 * @returns {Promise<void>}
 */
async function processChartRelease({
  github,
  context,
  core,
  fs,
  exec
}) {
  try {
    const packagesDir = CONFIG.filesystem.temp;
    const indexPath = CONFIG.filesystem.indexPath;
    await fs.mkdir(packagesDir, { recursive: true });
    core.info(`Created directory: ${packagesDir}`);
    core.info('Packaging application charts...');
    const appDirPath = CONFIG.chart.type.application;
    await _packageCharts({ exec, core, fs, dirPath: appDirPath, outputDir: packagesDir });
    core.info('Packaging library charts...');
    const libDirPath = CONFIG.chart.type.library;
    await _packageCharts({ exec, core, fs, dirPath: libDirPath, outputDir: packagesDir });
    core.info('Creating GitHub releases for charts...');
    await _createChartReleases({ github, context, core, fs, packagesDir });
    core.info('Generating Helm repository index...');
    const repoUrl = CONFIG.chart.repoUrl;
    await _generateHelmIndex({ exec, core, fs, packagesDir, indexPath, repoUrl });
    core.info('Chart release process completed successfully');
  } catch (error) {
    const errorMsg = `Chart release process failed: ${error.message}`;
    core.setFailed(errorMsg);
    throw new Error(errorMsg);
  }
}

/**
 * Setup the build environment for generating the static site
 * 
 * @param {Object} options - Options for build environment setup
 * @param {Object} options.core - GitHub Actions Core API for logging and output
 * @param {Object} options.fs - Node.js fs/promises module for file operations
 * @returns {Promise<void>}
 */
async function setupBuildEnvironment({ core, fs }) {
  try {
    core.info(`Setting up build environment for ${CONFIG.deployment} deployment`)
    core.info(`Copying ${CONFIG.filesystem.configPath} to ${CONFIG.filesystem.configHome}`);
    await fs.copyFile(CONFIG.filesystem.configPath, CONFIG.filesystem.configHome);
    try {
      const configContent = await fs.readFile(CONFIG.filesystem.configPath, 'utf8');
      const config = yaml.load(configContent);
      if (config.head) {
        const headCustomPath = path.dirname(CONFIG.filesystem.headCustomPath);
        await fs.mkdir(headCustomPath, { recursive: true });
        await fs.writeFile(CONFIG.filesystem.headCustomPath, config.head, 'utf8');
        core.info(`Created ${CONFIG.filesystem.headCustomPath} with custom head content`);
      }
    } catch (headError) {
      core.warning(`Failed to process custom head content: ${headError.message}`);
    }
  } catch (error) {
    const errorMsg = `Failed to copy Jekyll config: ${error.message}`;
    core.setFailed(errorMsg);
    throw new Error(errorMsg);
  }
  try {
    const indexMdHome = CONFIG.filesystem.indexMdHome;
    const indexMdHomeExists = await _fileExists(fs, indexMdHome);
    const indexMdPath = CONFIG.filesystem.indexMdPath;
    const indexMdPathExists = await _fileExists(fs, indexMdPath);
    if (indexMdHomeExists) {
      core.info(`Using existing index.md at ${indexMdHome}`);
    } else if (indexMdPathExists) {
      core.info(`Copying ${indexMdPath} to ${indexMdHome}`);
      await fs.copyFile(indexMdPath, indexMdHome);
    } else {
      core.info(`No index.md found at ${indexMdPath} or ${indexMdHome}, creating empty file`);
      await fs.writeFile(indexMdHome, '', 'utf8');
    }
  } catch (error) {
    const errorMsg = `Failed to process index.md: ${error.message}`;
    core.setFailed(errorMsg);
    throw new Error(errorMsg);
  }
  try {
    if (await _fileExists(fs, CONFIG.filesystem.readmePath)) {
      core.info(`Removing ${CONFIG.filesystem.readmePath} from root to prevent conflicts with index.html`);
      await fs.unlink(CONFIG.filesystem.readmePath);
    }
  } catch (error) {
    const errorMsg = `Failed to remove README.md: ${error.message}`;
    core.setFailed(errorMsg);
    throw new Error(errorMsg);
  }
  core.setOutput('deployment', CONFIG.deployment)
  core.info(`Jekyll preparation complete for ${CONFIG.deployment} environment`);
}

module.exports = {
  CONFIG,
  generateChartIndex,
  processChartRelease,
  setupBuildEnvironment
};
