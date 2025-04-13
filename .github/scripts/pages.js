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

/**
 * Generate the chart index page from the index.yaml file
 * 
 * @param {Object} options - Options for chart index generation
 * @param {Object} options.context - GitHub Actions context for repository info
 * @param {Object} options.core - GitHub Actions Core API for logging and output
 * @param {Object} options.fs - Node.js fs/promises module for file operations
 * @param {string} [options.indexPath=CONFIG.filesystem.indexPath] - Path to the index.yaml file
 * @param {string} [options.indexMdPath=CONFIG.filesystem.indexMdPath] - Path where to write the generated index.md
 * @param {string} [options.templatePath=CONFIG.filesystem.templatePath] - Path to the Handlebars template
 * @returns {Promise<boolean>} - True if successful, false if skipped
 */
async function generateChartIndex({
  context,
  core,
  fs,
  indexPath = CONFIG.filesystem.indexPath,
  indexMdPath = CONFIG.filesystem.indexMdPath,
  templatePath = CONFIG.filesystem.templatePath
}) {
  try {
    core.info(`Reading index YAML from ${indexPath}`);
    let indexContent;
    try {
      indexContent = await fs.readFile(indexPath, 'utf8');
      core.info(`Successfully read index.yaml, size: ${indexContent.length} bytes`);
    } catch (error) {
      // Try reading from the root directory if not in the dist directory
      try {
        indexContent = await fs.readFile(CONFIG.filesystem.indexPathFinal, 'utf8');
        core.info(`Found index.yaml in root directory`);
      } catch (rootError) {
        core.warning(`Failed to read index.yaml: ${error.message}`);
        core.warning('Creating an empty chart index since no index.yaml exists');

        // Create a minimal valid index.yaml content to avoid errors
        const emptyIndex = {
          apiVersion: 'v1',
          entries: {},
          generated: new Date().toISOString()
        };
        indexContent = yaml.dump(emptyIndex);

        // Ensure _dist directory exists
        const distDir = path.dirname(indexPath);
        await fs.mkdir(distDir, { recursive: true });

        // Write empty index.yaml for future runs
        await fs.writeFile(indexPath, indexContent, 'utf8');
        core.info(`Created empty index.yaml at ${indexPath}`);
      }
    }

    const index = yaml.load(indexContent);
    
    // Add diagnostic logging
    core.info(`Index structure keys: ${Object.keys(index || {}).join(', ')}`);
    if (index && index.entries) {
      core.info(`Entries keys count: ${Object.keys(index.entries).length}`);
      core.info(`Entries keys: ${Object.keys(index.entries).join(', ')}`);
    } else {
      core.warning(`No entries found in index or entries is not an object: ${typeof index?.entries}`);
    }

    if (!index || !index.entries) {
      core.warning('Invalid or empty index.yaml file, creating an empty index.md.');
      // Create an empty index.md instead of skipping
      await fs.mkdir(path.dirname(indexMdPath), { recursive: true });
      await fs.writeFile(indexMdPath, '', 'utf8');

      // Also ensure the root index.md exists
      await fs.writeFile(CONFIG.filesystem.indexMdSrc, '', 'utf8');
      core.info(`Created empty index.md files`);
      return true;
    }

    core.info(`Reading template from ${templatePath}`);
    const template = await fs.readFile(templatePath, 'utf8');
    core.info(`Template loaded, size: ${template.length} bytes`);

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
      
    // Log charts array info
    core.info(`Charts array length: ${charts.length}`);
    if (charts.length > 0) {
      core.info(`First chart sample: ${JSON.stringify(charts[0])}`);
    }

    // Log template context
    core.info(`Template context: RepoURL=${repoUrl}, Branch=${defaultBranchName}, Charts.length=${charts.length}`);
    
    const compiledTemplate = Handlebars.compile(template);
    const newContent = compiledTemplate({
      Charts: charts,
      RepoURL: repoUrl,
      Branch: defaultBranchName
    });

    // Log output content sample
    core.info(`Generated content contains table? ${newContent.includes('|-------|') ? 'Yes' : 'No'}`);
    core.info(`Content sample around table: ${newContent.substring(newContent.indexOf('Available Charts'), newContent.indexOf('Available Charts') + 300)}...`);

    // Ensure directory exists before writing file
    await fs.mkdir(path.dirname(indexMdPath), { recursive: true });

    // Also write directly to the root index.md for Jekyll
    core.info(`Writing index.md to root directory and ${indexMdPath}`);
    await fs.writeFile(CONFIG.filesystem.indexMdSrc, newContent, 'utf8');
    await fs.writeFile(indexMdPath, newContent, 'utf8');

    core.info('Successfully generated index.md');
    return true;

  } catch (error) {
    core.setFailed(`Failed to generate index.md: ${error.message}`);
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
