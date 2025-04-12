/**
 * GitHub Pages Preparation Utilities
 * 
 * This module provides functions to prepare and configure a GitHub Pages site:
 * - Copying Jekyll configuration files
 * - Copying generated content files
 * - Creating .nojekyll file
 * - Removing conflicting README.md files
 * - Other GitHub Pages preparation tasks
 * 
 * @module github-pages
 */

/**
 * Setup the build environment for generating the static site
 * 
 * @param {Object} options - Options for build environment setup
 * @param {Object} options.github - GitHub API client
 * @param {Object} options.context - GitHub Actions context
 * @param {Object} options.core - GitHub Actions Core
 * @param {Object} options.fs - Node.js fs/promises module
 * @param {Object} options.path - Node.js path module (optional)
 * @returns {Promise<void>}
 */
async function setupBuildEnvironment({ github, context, core, fs, path = require('path') }) {
  const configSource = '.github/pages/config.yml';
  const configDest = '_config.yml';
  const indexMdSource = './_dist/index.md';
  const indexMdDest = './index.md';
  const indexYamlSource = './_dist/index.yaml';
  const indexYamlDest = './index.yaml';

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
    core.info(`Copying ${configSource} to ${configDest}`);
    await fs.copyFile(configSource, configDest);

    // Copy index.md if exists
    if (await fileExists(indexMdSource)) {
      core.info(`Copying ${indexMdSource} to ${indexMdDest}`);
      await fs.copyFile(indexMdSource, indexMdDest);
    } else {
      core.warning(`Generated ${indexMdSource} not found. Jekyll will use root README.md or default.`);
    }

    // Copy index.yaml if exists
    if (await fileExists(indexYamlSource)) {
      core.info(`Copying ${indexYamlSource} to ${indexYamlDest}`);
      await fs.copyFile(indexYamlSource, indexYamlDest);
    } else {
      core.info(`Generated ${indexYamlSource} not found, skipping copy.`);
    }

    // Create .nojekyll file
    core.info('Creating .nojekyll file');
    await fs.writeFile('./.nojekyll', '');
    
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
 * @param {Object} options.github - GitHub API client
 * @param {Object} options.context - GitHub Actions context
 * @param {Object} options.core - GitHub Actions Core
 * @param {Object} options.fs - Node.js fs/promises module
 * @param {string} options.siteDir - Directory containing the built site (default: '_site')
 * @returns {Promise<void>}
 */
async function prepareSite({ github, context, core, fs, siteDir = '_site' }) {
  try {
    // Remove README.md from _site if it exists
    const readmePath = `${siteDir}/README.md`;
    
    try {
      await fs.access(readmePath);
      core.info(`Removing ${readmePath} to prevent conflicts with index.html`);
      await fs.unlink(readmePath);
      core.info('README.md removed successfully');
    } catch (error) {
      // File doesn't exist, which is fine
      core.info(`No README.md found in ${siteDir} directory`);
    }
    
    // Add any other site preparation steps here if needed
    
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
 * @param {Object} options.github - GitHub API client
 * @param {Object} options.context - GitHub Actions context
 * @param {Object} options.core - GitHub Actions Core
 * @param {Object} options.fs - Node.js fs/promises module
 * @param {string} options.indexYamlPath - Path to the index.yaml file (default: './_dist/index.yaml')
 * @param {string} options.indexMdPath - Path where to write the generated index.md (default: './_dist/index.md')
 * @param {string} options.templatePath - Path to the Handlebars template (default: '.github/pages/index.md.hbs')
 * @returns {Promise<boolean>} - True if successful, false if skipped
 */
async function generateChartIndex({ 
  github, 
  context, 
  core, 
  fs, 
  indexYamlPath = './_dist/index.yaml', 
  indexMdPath = './_dist/index.md',
  templatePath = '.github/pages/index.md.hbs' 
}) {
  
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
    Handlebars.registerHelper('rawGithubUrl', function(repoUrl, branch, path) {
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

module.exports = {
  setupBuildEnvironment,
  prepareSite,
  generateChartIndex
};
