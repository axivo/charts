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
    configYmlPath: './_config.yml',
    configYmlSrc: '.github/pages/config.yml',
    dist: './_dist',
    indexMdPath: './_dist/index.md',
    indexMdSrc: './index.md',
    indexPath: './_dist/index.yaml',
    indexPathFinal: 'index.yaml',
    library: 'library',
    releaseTemplate: '.github/release_template.md',
    temp: '.cr-release-packages',
    templatePath: '.github/pages/index.md.hbs'
  }
};
const path = require('path');
const yaml = require('js-yaml');

/**
 * Helper function to check if a file exists
 * @param {Object} fs - Node.js fs/promises module
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>} - True if file exists, false otherwise
 */
async function fileExists(fs, filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function generateChartIndex({
  context,
  core,
  fs,
  indexPath = CONFIG.filesystem.indexPath,
  indexMdPath = CONFIG.filesystem.indexMdPath,
  templatePath = CONFIG.filesystem.templatePath
}) {
  try {
    await fs.mkdir(path.dirname(indexPath), { recursive: true });
    await fs.mkdir(path.dirname(indexMdPath), { recursive: true });

    let indexContent;
    try {
      indexContent = await fs.readFile(indexPath, 'utf8');
    } catch (error) {
      // Try reading from the root directory if not in the dist directory
      try {
        indexContent = await fs.readFile(CONFIG.filesystem.indexPathFinal, 'utf8');
        core.info(`Found ${indexPathFinal} in root directory`);
      } catch (rootError) {
        core.warning(`Failed to read ${indexPathFinal} from any location: ${error.message}, ${rootError.message}`);
        const emptyIndex = {
          apiVersion: 'v1',
          entries: {},
          generated: new Date().toISOString()
        };
        indexContent = yaml.dump(emptyIndex);
        await fs.writeFile(indexPath, indexContent, 'utf8');
      }
    }

    const index = yaml.load(indexContent);
    if (!index || !index.entries) {
      core.warning(`Invalid or empty ${indexPathFinal} file, creating an empty file.`);
      await fs.mkdir(path.dirname(indexMdPath), { recursive: true });
      await fs.writeFile(indexMdPath, '', 'utf8');
      await fs.writeFile(CONFIG.filesystem.indexMdSrc, '', 'utf8');
      core.info(`Created empty ${indexPathFinal} files at ${indexMdPath} and ${CONFIG.filesystem.indexMdSrc}`);
      return true;
    }

    core.info(`Reading template from ${templatePath}`);
    const template = await fs.readFile(templatePath, 'utf8');
    core.info(`Template loaded, size: ${template.length} bytes`);

    const Handlebars = require('handlebars');
    Handlebars.registerHelper('rawGithubUrl', (repoUrl, branch, path) =>
      `${String(repoUrl).replace('github.com', 'raw.githubusercontent.com')}/${branch}/${path}`
    );

    const charts = index.entries && Object.entries(index.entries)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, versions]) => {
        if (!versions || !versions.length) return null;
        const latest = versions[0];
        return {
          Name: name,
          Version: latest.version || '',
          Type: latest.type || 'application',
          Description: latest.description || ''
        };
      })
      .filter(Boolean) || [];

    const content = Handlebars.compile(template)({
      Charts: charts,
      RepoURL: context.payload.repository.html_url,
      Branch: context.payload.repository.default_branch
    });

    await fs.writeFile(CONFIG.filesystem.indexMdSrc, content, 'utf8');
    await fs.writeFile(indexMdPath, content, 'utf8');

    return true;
  } catch (error) {
    core.setFailed(`Index generation failed: ${error.message}`);
    throw error;
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
  // Copy Jekyll config
  try {
    core.info(`Copying ${CONFIG.filesystem.configYmlSrc} to ${CONFIG.filesystem.configYmlPath}`);
    await fs.copyFile(CONFIG.filesystem.configYmlSrc, CONFIG.filesystem.configYmlPath);
  } catch (error) {
    const errorMsg = `Failed to copy Jekyll config: ${error.message}`;
    core.setFailed(errorMsg);
    throw new Error(errorMsg);
  }

  // Copy or create index.md - ensure root index.md exists for Jekyll
  try {
    const indexMdPath = CONFIG.filesystem.indexMdPath;
    const indexMdSrcPath = CONFIG.filesystem.indexMdSrc;
    const indexMdExists = await fileExists(fs, indexMdPath);
    const rootIndexExists = await fileExists(fs, indexMdSrcPath);

    if (indexMdExists) {
      core.info(`Copying ${indexMdPath} to ${indexMdSrcPath}`);
      await fs.copyFile(indexMdPath, indexMdSrcPath);
    } else if (rootIndexExists) {
      core.info(`Using existing index.md at ${indexMdSrcPath}`);
    } else {
      core.info(`No index.md found at ${indexMdPath} or ${indexMdSrcPath}, creating empty file`);
      await fs.writeFile(indexMdSrcPath, '', 'utf8');
    }
  } catch (error) {
    const errorMsg = `Failed to process index.md: ${error.message}`;
    core.setFailed(errorMsg);
    throw new Error(errorMsg);
  }

  // Remove README.md to avoid conflicts
  try {
    if (await fileExists(fs, './README.md')) {
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
  fileExists,
  generateChartIndex,
  setOutputs,
  setupBuildEnvironment,
  setupChartReleaserConfig
};
