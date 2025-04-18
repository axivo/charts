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
const utils = require('./utils');
const githubApi = require('./github-api');

/**
 * Configuration constants for the Release module
 * 
 * Following a modular approach, this configuration object contains only settings
 * relevant to the release process. Each property is grouped under the 'release'
 * namespace to maintain separation from other module configurations.
 * 
 * Additional properties will be added incrementally as functions are migrated
 * to this module.
 * 
 * @type {Object}
 */
const CONFIG = {
  /**
   * Release-specific configuration
   * 
   * @type {Object}
   */
  release: {
    /**
     * Deployment environment type
     * Controls how the build and deployment process behaves
     * 
     * @type {string}
     * @example 'production' - Builds charts and deploys to GitHub Pages
     * @example 'staging' - Builds charts locally for testing without deploying
     */
    deployment: 'production',

    /**
     * Jekyll configuration settings
     * @type {Object}
     */
    configuration: {
      /**
       * Path where the Jekyll configuration will be generated
       * @type {string}
       */
      home: './_config.yml',

      /**
       * Path to the Jekyll configuration file template
       * @type {string}
       */
      path: '.github/templates/config.yml'
    },

    /**
     * Head content settings
     * @type {Object}
     */
    head: {
      /**
       * Path to the custom head include file for Jekyll
       * @type {string}
       */
      path: './_includes/head-custom.html'
    },

    /**
     * Frontpage settings for the GitHub Pages site
     * @type {Object}
     */
    frontpage: {
      /**
       * Path to the index.md file in the root directory
       * @type {string}
       */
      home: './index.md',

      /**
       * Path to the generated index.md file in the dist directory
       * @type {string}
       */
      path: './_dist/index.md'
    }
  }
};

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
    core.info(`Setting up build environment for ${CONFIG.release.deployment} deployment`);
    core.info(`Copying ${CONFIG.release.configuration.path} to ${CONFIG.release.configuration.home}...`);
    await fs.copyFile(CONFIG.release.configuration.path, CONFIG.release.configuration.home);
    try {
      const configContent = await fs.readFile(CONFIG.release.configuration.path, 'utf8');
      const config = yaml.load(configContent);
      if (config.head) {
        const headCustomPath = path.dirname(CONFIG.release.head.path);
        await fs.mkdir(headCustomPath, { recursive: true });
        await fs.writeFile(CONFIG.release.head.path, config.head, 'utf8');
        core.info(`Created ${CONFIG.release.head.path} with custom head content`);
      }
    } catch (headError) {
      utils.handleError(headError, core, 'process custom head content', false);
    }
  } catch (error) {
    utils.handleError(error, core, 'copy Jekyll config');
  }
  try {
    const indexMdHome = CONFIG.release.frontpage.home;
    const indexMdPath = CONFIG.release.frontpage.path;
    const [indexMdHomeExists, indexMdPathExists] = await Promise.all([
      utils.fileExists(indexMdHome),
      utils.fileExists(indexMdPath)
    ]);
    if (indexMdHomeExists) {
      core.info(`Using existing index.md at ${indexMdHome}...`);
    } else if (indexMdPathExists) {
      core.info(`Copying ${indexMdPath} to ${indexMdHome}...`);
      await fs.copyFile(indexMdPath, indexMdHome);
    } else {
      core.info(`No index.md found at ${indexMdPath} or ${indexMdHome}, creating empty file...`);
      await fs.writeFile(indexMdHome, '', 'utf8');
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
  core.setOutput('deployment', CONFIG.release.deployment);
  core.info(`Jekyll preparation complete for ${CONFIG.release.deployment} environment`);
}

/**
 * Exports the module's configuration and functions
 * 
 * As functions are migrated from chart.js, they will be added to this export statement.
 * Each function will be documented with JSDoc comments to describe its purpose,
 * parameters, and return values.
 */
module.exports = {
  CONFIG,
  setupBuildEnvironment
};
