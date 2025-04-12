/**
 * GitHub Pages and Chart Release Utilities
 * 
 * This module provides centralized configuration and functions for Helm chart releases and GitHub Pages:
 * - Centralized configuration constants
 * - Setting GitHub Actions outputs for workflow steps
 * - Generating chart index pages from Helm chart releases
 * - Preparing the build environment for Jekyll
 * - Finalizing GitHub Pages deployment
 * 
 * @module github-pages
 */

/**
 * Centralized configuration for the entire workflow including:
 * - File and directory paths
 * - Chart releaser settings
 * - Directory configurations
 * - Environment variables for chart-releaser
 * - Directory variables for GitHub Actions outputs
 */
const CONFIG = {
  // File and directory paths
  paths: {
    chartReleaserConfig: '.github/chart-releaser.yml',
    configDest: '_config.yml',
    configSource: '.github/pages/config.yml',
    distDir: './_dist',
    indexMdDest: './index.md',
    indexMdSource: './_dist/index.md',
    indexYamlDest: './index.yaml',
    indexYamlSource: './_dist/index.yaml',
    pagesScript: './.github/scripts/pages.js',
    releaseTemplate: '.github/release_template.md',
    templatePath: '.github/pages/index.md.hbs'
  },

  // Chart releaser settings
  chartReleaser: {
    chartsRepoUrl: 'https://axivo.github.io/charts/',
    indexPath: './_dist/index.yaml',          // Path for index.yaml storage during workflow run
    indexPathFinal: 'index.yaml',             // Path in the published GitHub Pages site
    packagesWithIndex: 'false',
    pagesBranch: '',
    releaseNameTemplate: '{{ .Name }}-v{{ .Version }}',
    skipExisting: 'true',
    tempStoragePath: '.cr-release-packages'   // Temporary storage path for chart packages
  },

  // Directory configurations
  directories: {
    application: 'application',
    library: 'library'
  },

  // Environment variables for chart-releaser
  env: {
    CR_CHARTS_REPO_URL: 'https://axivo.github.io/charts/',
    CR_INDEX_PATH: 'index.yaml',
    CR_INDEX_PATH_FINAL: 'index.yaml',
    CR_PACKAGES_WITH_INDEX: 'false',
    CR_PAGES_BRANCH: '',
    CR_RELEASE_NAME_TEMPLATE: '{{ .Name }}-v{{ .Version }}',
    CR_RELEASE_TEMPLATE: '.github/release_template.md',
    CR_SKIP_EXISTING: 'true'
  },

  // Directory variables for output
  outputDirs: {
    DIRECTORY_APPLICATION: 'application',
    DIRECTORY_LIBRARY: 'library'
  }
};

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
    core.info(`Copying ${CONFIG.paths.configSource} to ${CONFIG.paths.configDest}`);
    await fs.copyFile(CONFIG.paths.configSource, CONFIG.paths.configDest);

    // Copy index.md if exists
    if (await fileExists(CONFIG.paths.indexMdSource)) {
      core.info(`Copying ${CONFIG.paths.indexMdSource} to ${CONFIG.paths.indexMdDest}`);
      await fs.copyFile(CONFIG.paths.indexMdSource, CONFIG.paths.indexMdDest);
    } else {
      core.warning(`Generated ${CONFIG.paths.indexMdSource} not found. Jekyll will use root README.md or default.`);
    }

    // Copy index.yaml if exists
    if (await fileExists(CONFIG.paths.indexYamlSource)) {
      core.info(`Copying ${CONFIG.paths.indexYamlSource} to ${CONFIG.paths.indexYamlDest}`);
      await fs.copyFile(CONFIG.paths.indexYamlSource, CONFIG.paths.indexYamlDest);
    } else {
      core.info(`Generated ${CONFIG.paths.indexYamlSource} not found, skipping copy.`);
    }

    // Remove README.md from root if it exists (to avoid conflicts in pre-build)
    if (await fileExists('./README.md')) {
      core.info('Removing README.md from root to prevent conflicts with index.html');
      await fs.unlink('./README.md');
    }

    core.info('Jekyll preparation complete.');
  } catch (error) {
    core.setFailed(`Failed to prepare Jekyll files: ${error.message}`);
    throw error;
  }
}

/**
 * Prepare the built site for GitHub Pages deployment
 * 
 * @param {Object} options - Options for site preparation
 * @param {Object} options.core - GitHub Actions Core API for logging and output
 * @returns {Promise<void>}
 */
async function prepareSite({ core }) {
  try {
    // We already removed README.md in setupBuildEnvironment
    // and we're using GitHub's official Jekyll build action
    core.info('Site preparation for GitHub Pages completed');
  } catch (error) {
    core.setFailed(`Failed to prepare site for GitHub Pages: ${error.message}`);
    throw error;
  }
}

/**
 * Generate the chart index page from the index.yaml file
 * 
 * @param {Object} options - Options for chart index generation
 * @param {Object} options.context - GitHub Actions context for repository info
 * @param {Object} options.core - GitHub Actions Core API for logging and output
 * @param {Object} options.fs - Node.js fs/promises module for file operations
 * @param {string} [options.indexYamlPath=CONFIG.paths.indexYamlSource] - Path to the index.yaml file
 * @param {string} [options.indexMdPath=CONFIG.paths.indexMdSource] - Path where to write the generated index.md
 * @param {string} [options.templatePath=CONFIG.paths.templatePath] - Path to the Handlebars template
 * @returns {Promise<boolean>} - True if successful, false if skipped
 */
async function generateChartIndex({
  context,
  core,
  fs,
  indexYamlPath = CONFIG.paths.indexYamlSource,
  indexMdPath = CONFIG.paths.indexMdSource,
  templatePath = CONFIG.paths.templatePath
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
      core.warning(`Index file not found at ${indexYamlPath}, likely no charts released. Skipping index.md generation.`);
      return false;
    } else {
      core.setFailed(`Failed to generate index.md: ${error.message}`);
      throw error;
    }
  }
}

/**
 * Sets GitHub Actions outputs from the CONFIG object for use in workflow steps
 *
 * @param {Object} core - GitHub Actions Core API for setting outputs
 */
function setOutputs(core) {
  // Set all environment variables as outputs
  Object.entries(CONFIG.env).forEach(([key, value]) => {
    core.setOutput(key, value);
  });

  // Set directory outputs
  Object.entries(CONFIG.outputDirs).forEach(([key, value]) => {
    core.setOutput(key, value);
  });

  // Set script path output
  core.setOutput('PAGES_SCRIPT_PATH', CONFIG.paths.pagesScript);
}

// Export all the functions and constants
module.exports = {
  CONFIG,
  setupBuildEnvironment,
  prepareSite,
  generateChartIndex,
  setOutputs
};
