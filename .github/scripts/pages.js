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

const CONFIG = {
  // Chart release settings
  chart: {
    packagesWithIndex: 'true',
    pagesBranch: '',
    releaseNameTemplate: '{{ .Name }}-v{{ .Version }}',
    repoUrl: 'https://axivo.github.io/charts/',
    skipExisting: 'true'
  },

  filesystem: {
    application: 'application',
    dist: './_dist',
    library: 'library',
    temp: '.cr-release-packages',
    configSrcYml: '.github/pages/config.yml',
    configYml: './_config.yml',
    indexMd: './_dist/index.md',
    indexMdSrc: './index.md',
    indexPath: './_dist/index.yaml',
    indexPathFinal: 'index.yaml',
    indexYaml: './index.yaml',
    releaseTemplate: '.github/release_template.md',
    templatePath: '.github/pages/index.md.hbs'
  }
};

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
async function createChartReleases({
  github,
  context,
  core,
  fs,
  packagesDir = CONFIG.filesystem.temp
}) {
  try {
    const path = require('path');

    const files = await fs.readdir(packagesDir);
    const packages = files.filter(file => file.endsWith('.tgz'));

    core.info(`Found ${packages.length} chart packages to release`);

    for (const pkg of packages) {
      const chartPath = path.join(packagesDir, pkg);
      // Extract chart name and version from filename
      const chartNameWithVersion = pkg.replace('.tgz', '');
      const lastDashIndex = chartNameWithVersion.lastIndexOf('-');
      const chartName = chartNameWithVersion.substring(0, lastDashIndex);
      const chartVersion = chartNameWithVersion.substring(lastDashIndex + 1);

      const tagName = formatReleaseName(chartName, chartVersion);
      core.info(`Processing release for ${tagName}`);

      try {
        // Check if release exists
        try {
          await github.rest.repos.getReleaseByTag({
            owner: context.repo.owner,
            repo: context.repo.repo,
            tag: tagName
          });
          core.info(`Release ${tagName} already exists, skipping`);
          continue;
        } catch (error) {
          // Release doesn't exist, proceed with creation
          if (error.status !== 404) {
            throw error;
          }
        }

        // Create release
        const release = await github.rest.repos.createRelease({
          owner: context.repo.owner,
          repo: context.repo.repo,
          tag_name: tagName,
          name: `${chartName} ${chartVersion}`,
          body: `Release of ${chartName} chart version ${chartVersion}`,
          draft: false,
          prerelease: false
        });

        // Upload chart package as asset
        const fileContent = await fs.readFile(chartPath);
        await github.rest.repos.uploadReleaseAsset({
          owner: context.repo.owner,
          repo: context.repo.repo,
          release_id: release.data.id,
          name: pkg,
          data: fileContent
        });

        core.info(`Successfully created release for ${tagName}`);
      } catch (error) {
        core.warning(`Error creating release for ${tagName}: ${error.message}`);
        if (!CONFIG.chart.skipExisting) {
          throw error;
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
 * Formats a release name according to the template
 * @param {string} name
 * @param {string} version
 * @returns {string}
 */
function formatReleaseName(name, version) {
  // Simple implementation that mimics the template {{ .Name }}-v{{ .Version }}
  return `${name}-v${version}`;
}

/**
 * Generate the chart index page from the index.yaml file
 * 
 * @param {Object} options - Options for chart index generation
 * @param {Object} options.context - GitHub Actions context for repository info
 * @param {Object} options.core - GitHub Actions Core API for logging and output
 * @param {Object} options.fs - Node.js fs/promises module for file operations
 * @param {string} [options.indexYamlPath=CONFIG.filesystem.indexYaml] - Path to the index.yaml file
 * @param {string} [options.indexMdPath=CONFIG.filesystem.indexMd] - Path where to write the generated index.md
 * @param {string} [options.templatePath=CONFIG.filesystem.templatePath] - Path to the Handlebars template
 * @returns {Promise<boolean>} - True if successful, false if skipped
 */
async function generateChartIndex({
  context,
  core,
  fs,
  indexYamlPath = CONFIG.filesystem.indexYaml,
  indexMdPath = CONFIG.filesystem.indexMd,
  templatePath = CONFIG.filesystem.templatePath
}) {
  try {
    core.info(`Reading index YAML from ${indexYamlPath}`);
    const indexContent = await fs.readFile(indexYamlPath, 'utf8');
    const yaml = require('js-yaml');
    const index = yaml.load(indexContent);

    if (!index || !index.entries) {
      core.warning('Invalid or empty index.yaml file, skipping index.md generation.');
      return false;
    }

    core.info(`Reading template from ${templatePath}`);
    const template = await fs.readFile(templatePath, 'utf8');

    // Register helper for template
    const Handlebars = require('handlebars');
    Handlebars.registerHelper('rawGithubUrl', function (repoUrl, branch, path) {
      return String(repoUrl).replace('github.com', 'raw.githubusercontent.com') + '/' + branch + '/' + path;
    });

    const repoUrl = context.payload.repository.html_url;
    const defaultBranchName = context.payload.repository.default_branch;

    const charts = Object.entries(index.entries)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, versions]) => {
        if (!versions || !versions.length) return null;
        const latest = versions[0]; // Assuming versions[0] is the latest
        return {
          Name: name,
          Version: latest.version || '',
          Type: latest.type || 'application', // Default type if missing
          Description: latest.description || ''
        };
      })
      .filter(Boolean);

    const compiledTemplate = Handlebars.compile(template);
    const newContent = compiledTemplate({
      Charts: charts,
      RepoURL: repoUrl,
      Branch: defaultBranchName
    });

    core.info(`Writing generated index.md to ${indexMdPath}`);
    await fs.writeFile(indexMdPath, newContent);
    core.info('Successfully generated index.md');
    return true;

  } catch (error) {
    // Check if error is due to missing index.yaml (ENOENT)
    if (error.code === 'ENOENT' && error.path === indexYamlPath) {
      core.warning(`Index file not found at ${indexYamlPath}, likely no charts released.`);
      return false;
    } else {
      core.setFailed(`Failed to generate index.md: ${error.message}`);
      throw error;
    }
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
async function generateHelmIndex({
  exec,
  core,
  fs,
  packagesDir,
  indexPath,
  repoUrl
}) {
  try {
    const path = require('path');
    const indexDir = path.dirname(indexPath);
    await fs.mkdir(indexDir, { recursive: true });

    await exec.exec('helm', ['repo', 'index', packagesDir, '--url', repoUrl]);

    await fs.copyFile(path.join(packagesDir, 'index.yaml'), indexPath);

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
async function packageChartsInDirectory({
  exec,
  core,
  fs,
  dirPath,
  outputDir
}) {
  try {
    const path = require('path');

    // Find Chart.yaml files recursively
    async function findChartYamlFiles(directory) {
      const chartDirs = [];

      // Search directory recursively
      async function searchDir(dir) {
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });

          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            // Determine what to do based on entry type
            switch (true) {
              case entry.isDirectory():
                await searchDir(fullPath);
                break;
              case entry.name === 'Chart.yaml':
                // Found a Chart.yaml file
                chartDirs.push(dir);
                break;
              default:
                break;
            }
          }
        } catch (error) {
          core.warning(`Error reading directory ${dir}: ${error.message}`);
          // Skip this directory on error
        }
      }

      await searchDir(directory);
      return chartDirs;
    }

    // Get directories containing Chart.yaml files
    const chartDirsArray = await findChartYamlFiles(dirPath);
    const chartDirs = chartDirsArray.join('\n');

    if (!chartDirsArray.length) {
      core.info(`No charts found in ${dirPath}`);
      return;
    }

    const charts = chartDirsArray;
    for (const chartDir of charts) {
      core.info(`Packaging chart: ${chartDir}`);

      // Update dependencies before packaging
      core.info(`Updating dependencies for: ${chartDir}`);
      await exec.exec('helm', ['dependency', 'update', chartDir]);

      await exec.exec('helm', ['package', chartDir, '--destination', outputDir]);
    }

    core.info(`Successfully packaged ${charts.length} charts from ${dirPath}`);
  } catch (error) {
    const errorMsg = `Failed to package charts in ${dirPath}: ${error.message}`;
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

    // Ensure packages directory exists
    await fs.mkdir(packagesDir, { recursive: true });
    core.info(`Created directory: ${packagesDir}`);

    core.info('Packaging application charts...');
    const appDirPath = CONFIG.filesystem.application;
    await packageChartsInDirectory({ exec, core, fs, dirPath: appDirPath, outputDir: packagesDir });

    core.info('Packaging library charts...');
    const libDirPath = CONFIG.filesystem.library;
    await packageChartsInDirectory({ exec, core, fs, dirPath: libDirPath, outputDir: packagesDir });

    core.info('Creating GitHub releases for charts...');
    await createChartReleases({ github, context, core, fs, packagesDir });

    core.info('Generating Helm repository index...');
    const repoUrl = CONFIG.chart.repoUrl;
    await generateHelmIndex({ exec, core, fs, packagesDir, indexPath, repoUrl });

    core.info('Chart release process completed successfully');
  } catch (error) {
    const errorMsg = `Chart release process failed: ${error.message}`;
    core.setFailed(errorMsg);
    throw new Error(errorMsg);
  }
}

/**
 * Sets GitHub Actions outputs from the CONFIG object
 *
 * @param {Object} core
 */
function setOutputs(core) {
  // Map output names
  core.setOutput('CR_CHARTS_REPO_URL', CONFIG.chart.repoUrl);
  core.setOutput('CR_INDEX_PATH', CONFIG.filesystem.indexPath);
  core.setOutput('CR_INDEX_PATH_FINAL', CONFIG.filesystem.indexPathFinal);
  core.setOutput('CR_PACKAGES_WITH_INDEX', CONFIG.chart.packagesWithIndex);
  core.setOutput('CR_PAGES_BRANCH', CONFIG.chart.pagesBranch);
  core.setOutput('CR_RELEASE_NAME_TEMPLATE', CONFIG.chart.releaseNameTemplate);
  core.setOutput('CR_RELEASE_TEMPLATE', CONFIG.filesystem.releaseTemplate);
  core.setOutput('CR_SKIP_EXISTING', CONFIG.chart.skipExisting);

  core.setOutput('DIRECTORY_APPLICATION', CONFIG.filesystem.application);
  core.setOutput('DIRECTORY_LIBRARY', CONFIG.filesystem.library);
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
  // Helper function to check if a file exists
  async function fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // Copy Jekyll config
  try {
    core.info(`Copying ${CONFIG.filesystem.configSrcYml} to ${CONFIG.filesystem.configYml}`);
    await fs.copyFile(CONFIG.filesystem.configSrcYml, CONFIG.filesystem.configYml);
  } catch (error) {
    const errorMsg = `Failed to copy Jekyll config: ${error.message}`;
    core.setFailed(errorMsg);
    throw new Error(errorMsg);
  }

  // Copy index.md if exists
  try {
    core.info(`Copying ${CONFIG.filesystem.indexMd} to ${CONFIG.filesystem.indexMdSrc}`);
    await fs.copyFile(CONFIG.filesystem.indexMd, CONFIG.filesystem.indexMdSrc);
  } catch (error) {
    const errorMsg = `Failed to process index.md: ${error.message}`;
    core.setFailed(errorMsg);
    throw new Error(errorMsg);
  }

  // Remove README.md to avoid conflicts
  try {
    if (await fileExists('./README.md')) {
      core.info('Removing README.md from root to prevent conflicts with index.html');
      await fs.unlink('./README.md');
    }
  } catch (error) {
    const errorMsg = `Failed to remove README.md: ${error.message}`;
    core.setFailed(errorMsg);
    throw new Error(errorMsg);
  }

  core.info('Jekyll preparation complete.');
}

/**
 * Sets up the chart-releaser configuration by creating necessary directories
 * and checking if the release template exists
 *
 * @param {Object} options - Options for chart configuration setup
 * @param {Object} options.core - GitHub Actions Core API for logging and output
 * @param {Object} options.fs - Node.js fs/promises module for file operations
 * @returns {Promise<void>}
 */
async function setupChartReleaserConfig({ core, fs }) {
  try {
    // Create the distribution directory
    await fs.mkdir(CONFIG.filesystem.dist, { recursive: true });
    core.info(`Created directory: ${CONFIG.filesystem.dist}`);

    // Check if release template exists
    await fs.access(CONFIG.filesystem.releaseTemplate);
    core.info(`Release template found at: ${CONFIG.filesystem.releaseTemplate}`);
  } catch (error) {
    const errorMsg = `Failed to setup chart-releaser configuration: ${error.message}`;
    core.setFailed(errorMsg);
    throw new Error(errorMsg);
  }
}

// Export functions and constants
module.exports = {
  CONFIG,
  createChartReleases,
  formatReleaseName,
  generateChartIndex,
  generateHelmIndex,
  packageChartsInDirectory,
  processChartRelease,
  setOutputs,
  setupBuildEnvironment,
  setupChartReleaserConfig
};
