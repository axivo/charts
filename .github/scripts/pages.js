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
  filesystem: {
    configYmlPath: './_config.yml',
    configYmlSrcPath: '.github/pages/config.yml',
    indexMdPath: './_dist/index.md',
    indexMdSrcPath: './index.md',
    indexPath: './index.yaml',
    templatePath: '.github/pages/index.md.hbs'
  },
  release: {
    branch: 'gh-pages'
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
 * Manages the release branch
 * 
 * @param {Object} options - Options for branch management
 * @param {Object} options.exec - GitHub Actions exec API for running Git commands
 * @param {Object} options.core - GitHub Actions Core API for logging
 * @param {string} [options.action=create] - The action to perform: 'create' or 'delete'
 * @returns {Promise<boolean>} - True if successful
 */
async function manageReleaseBranch({
  exec,
  core,
  action = 'create'
}) {
  const branchName = CONFIG.release.branch;

  try {
    // Check if the branch already exists
    const { stdout } = await exec.getExecOutput(
      'git', ['ls-remote', '--heads', 'origin', branchName], { silent: true }
    );
    const branchExists = stdout.trim() !== '';

    switch (action) {
      case 'delete':
        if (!branchExists) {
          core.info(`Branch ${branchName} does not exist, no need to delete.`);
          return true;
        }

        core.info(`Deleting ${branchName} branch...`);
        await exec.exec('git', ['push', 'origin', '--delete', branchName]);
        core.info(`Branch ${branchName} deleted successfully.`);
        break;

      case 'create':
      default:
        if (branchExists) {
          core.info(`Branch ${branchName} already exists, no need to create it.`);
          return true;
        }

        core.info(`Creating ${branchName} branch ...`);
        await exec.exec('git', ['push', 'origin', 'HEAD:' + branchName]);
        core.info(`Branch ${branchName} created successfully.`);
        break;
    }

    return true;
  } catch (error) {
    const errorMsg = `Branch management failed: ${error.message}`;
    core.setFailed(errorMsg);
    throw new Error(errorMsg);
  }
}

/**
 * Generates index.md from chart index.yaml created by chart-releaser
 * @param {Object} options - Options for index generation
 * @param {Object} options.context - GitHub Actions context with repository information
 * @param {Object} options.core - GitHub Actions Core API for logging
 * @param {Object} options.fs - Node.js fs/promises module for file operations
 * @param {Object} options.exec - GitHub Actions exec API for running Git commands
 * @param {string} [options.indexPath] - Path to read the index.yaml file from
 * @param {string} [options.indexMdPath] - Path to write the index.md file
 * @param {string} [options.templatePath] - Path to Handlebars template for index.md
 * @returns {Promise<boolean>} - True if successful
 */
async function generateChartIndex({
  context,
  core,
  fs,
  exec,
  indexPath = CONFIG.filesystem.indexPath,
  indexMdPath = CONFIG.filesystem.indexMdPath,
  templatePath = CONFIG.filesystem.templatePath
}) {
  try {
    // Create necessary directory for index.md
    await fs.mkdir(path.dirname(indexMdPath), { recursive: true });

    // Process chart data for the template
    let charts = [];

    // Check if index.yaml exists and read it
    const indexExists = await fileExists(fs, indexPath);
    if (indexExists) {
      core.info(`Reading index.yaml from ${indexPath}`);
      const indexContent = await fs.readFile(indexPath, 'utf8');
      const index = yaml.load(indexContent);

      if (index.entries) {
        // Sort entries alphabetically
        const entries = Object.entries(index.entries).sort(([a], [b]) => a.localeCompare(b));

        // Process each chart
        for (const [name, versions] of entries) {
          if (versions && versions.length > 0) {
            const latest = versions[0];

            // Determine chart type based on directory location
            let chartType = 'application';
            if (await fileExists(fs, `./library/${name}`)) {
              chartType = 'library';
            }

            charts.push({
              Name: name,
              Version: latest.version || '',
              Type: chartType,
              Description: latest.description || ''
            });
          }
        }
      }
    } else {
      core.warning(`Index file not found at ${indexPath}. Chart table will be empty.`);
    }

    // Read and process the template
    const template = await fs.readFile(templatePath, 'utf8');
    const Handlebars = require('handlebars');

    // Register helper for raw GitHub URLs
    Handlebars.registerHelper('rawGithubUrl', (repoUrl, branch, path) =>
      `${String(repoUrl).replace('github.com', 'raw.githubusercontent.com')}/${branch}/${path}`
    );

    // Generate content from template
    const content = Handlebars.compile(template)({
      Charts: charts,
      RepoURL: context.payload.repository.html_url,
      Branch: context.payload.repository.default_branch
    });

    // Write output file
    await fs.writeFile(indexMdPath, content, 'utf8');

    // Delete release branch
    //await manageReleaseBranch({ exec, core, action: 'delete' });

    core.info(`Generated index.md with ${charts.length} charts`);
    return true;
  } catch (error) {
    const errorMsg = `Index generation failed: ${error.message}`;
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
  // Copy Jekyll config
  try {
    core.info(`Copying ${CONFIG.filesystem.configYmlSrcPath} to ${CONFIG.filesystem.configYmlPath}`);
    await fs.copyFile(CONFIG.filesystem.configYmlSrcPath, CONFIG.filesystem.configYmlPath);
  } catch (error) {
    const errorMsg = `Failed to copy Jekyll config: ${error.message}`;
    core.setFailed(errorMsg);
    throw new Error(errorMsg);
  }

  // Copy or create index.md - ensure root index.md exists for Jekyll
  try {
    const indexMdPath = CONFIG.filesystem.indexMdPath;
    const indexMdSrcPath = CONFIG.filesystem.indexMdSrcPath;
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

  // Remove README.md to avoid conflicts - temporarily disabled
  /*
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
  */

  core.info('Jekyll preparation complete.');
}

// Export functions and constants
module.exports = {
  CONFIG,
  fileExists,
  generateChartIndex,
  manageReleaseBranch,
  setupBuildEnvironment
};
