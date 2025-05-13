/**
 * Local Chart Release Utilities
 * 
 * This module provides functions for local Helm chart validation and testing.
 * It handles the process of validating, packaging, and indexing Helm charts
 * in a local development environment for testing before official releases.
 * 
 * The module implements a complete workflow for local chart validation that includes:
 * - Comprehensive chart validation with Helm lint and Kubernetes API verification
 * - Icon validation to ensure charts have properly sized images
 * - Dependency resolution and chart packaging
 * - Local Helm repository index generation for testing
 * 
 * The module is designed to be used by developers to test chart changes
 * prior to committing and creating official releases.
 * 
 * @module release-local
 * @author AXIVO
 * @license BSD-3-Clause
 */

const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const config = require('./config');
const utils = require('./utils');

/**
 * Validates chart's icon.png file
 * 
 * This function checks if a chart has a valid icon.png file with the required
 * dimensions of 256x256 pixels. It performs the following validations:
 * 
 * 1. Verifies the icon.png file exists in the chart directory
 * 2. Checks that the file is a valid PNG image format
 * 3. Validates the dimensions are exactly 256x256 pixels
 * 
 * The icon validation is part of the chart quality assurance process to ensure
 * all charts have properly formatted icons for display in UI interfaces.
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {string} params.chartDir - Path to the chart directory
 * @returns {Promise<boolean>} - True if validation succeeds, false otherwise
 */
async function _validateIcon({ chartDir }) {
  try {
    console.log(`Validating icon for '${chartDir}' chart...`);
    const iconPath = path.join(chartDir, 'icon.png');
    try {
      await fs.access(iconPath);
    } catch (error) {
      throw new Error(`icon.png not found in '${chartDir}' directory`);
    }
    try {
      const metadata = await sharp(iconPath).metadata();
      if (metadata.width !== 256 || metadata.height !== 256) {
        throw new Error(`Icon in '${chartDir}' has dimensions ${metadata.width}x${metadata.height}px, required size is 256x256px`);
      }
      if (metadata.format !== 'png') {
        throw new Error(`Icon in ${chartDir} is not in PNG format, required format is PNG`);
      }
    } catch (error) {
      if (error.message.includes('Input file is missing')) {
        throw new Error(`Cannot read icon file at ${iconPath}, file may be corrupt`);
      }
      throw error;
    }
    console.log(`Icon validation successful for '${chartDir}' chart`);
    return true;
  } catch (error) {
    console.error(`Failed to validate icon for ${chartDir} chart: ${error.message}`);
    return false;
  }
}

/**
 * Checks if all required dependencies are installed
 * 
 * This function verifies that all the required tools and Node.js packages are
 * properly installed and accessible. It checks for:
 * 
 * 1. A working connection to a Kubernetes cluster
 * 2. CLI tools: git, helm, and kubectl with their respective versions
 * 3. Required Node.js packages with their installed versions
 * 
 * The function provides clear feedback about each dependency's status and returns
 * a boolean indicating whether all dependencies are available, which helps prevent
 * runtime errors by ensuring the environment is properly configured before attempting
 * to run chart validation and packaging operations.
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {Object} params.exec - GitHub Actions exec helpers for running commands
 * @returns {Promise<boolean>} - True if all dependencies are available, false otherwise
 */
async function _checkDependencies({ exec }) {
  const requiredTools = [
    { name: 'git', command: ['--version'] },
    { name: 'helm', command: ['version', '--short'] },
    { name: 'kubectl', command: ['version', '--client'] }
  ];
  let allDepsAvailable = true;
  console.log('Checking required dependencies...');
  try {
    console.log('Connecting to Kubernetes cluster (this may take a moment)...');
    const { exitCode, stdout } = await exec.getExecOutput('kubectl', ['cluster-info'], { silent: true });
    if (exitCode !== 0) {
      console.error(`❌ No Kubernetes cluster is accessible`);
      allDepsAvailable = false;
    } else {
      const clusterInfo = stdout.split('\n')[0];
      console.log(`✅ Kubernetes cluster endpoint ${clusterInfo.replace('Kubernetes control plane is running at ', '')}`);
    }
  } catch (error) {
    console.error(`❌ No Kubernetes cluster is accessible`);
    allDepsAvailable = false;
  }
  for (const tool of requiredTools) {
    try {
      const { exitCode, stdout } = await exec.getExecOutput(tool.name, tool.command, { silent: true });
      if (exitCode !== 0) {
        console.error(`❌ ${tool.name} is not properly installed or configured`);
        allDepsAvailable = false;
      } else {
        const version = stdout.trim().split('\n')[0];
        let displayName = tool.name;
        switch (tool.name) {
          case 'git':
            displayName = `${tool.name} ${version.replace('git version ', '')}`;
            break;
          case 'helm':
            displayName = `${tool.name} ${version}`;
            break;
          case 'kubectl':
            displayName = `${tool.name} ${version.toLowerCase().replace('client version: ', 'client ')}`;
            break;
        }
        console.log(`✅ ${displayName}`);
      }
    } catch (error) {
      console.error(`❌ ${tool.name} is not installed or not in PATH`);
      allDepsAvailable = false;
    }
  }
  const requiredPackages = ['@actions/exec', 'handlebars', 'js-yaml', 'sharp'];
  for (const pkg of requiredPackages) {
    try {
      const pkgPath = require.resolve(pkg);
      let version = 'installed';
      try {
        const pkgJson = require(`${pkg}/package.json`);
        version = pkgJson.version || 'installed';
      } catch (versionError) {
        // Package exists but can't access its package.json or version field
        console.log(`Note: Could not determine version for '${pkg}': ${versionError.message}`);
      }
      console.log(`✅ Node.js package '${pkg}' ${version}`);
    } catch (error) {
      console.error(`❌ Node.js package '${pkg}' is missing. Run: npm install ${pkg}`);
      allDepsAvailable = false;
    }
  }
  return allDepsAvailable;
}

/**
 * Generates a local Helm repository index
 * 
 * This function creates an index.yaml file for the local Helm repository, which contains
 * metadata about all charts in the repository. It runs the 'helm repo index' command to
 * generate a properly structured index file that can be used for local testing of the
 * chart repository.
 * 
 * The index.yaml file is essential for a Helm chart repository as it allows Helm clients
 * to discover and install charts. For local testing, this index enables developers to
 * add the local repository and test charts before official release.
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {Object} params.exec - GitHub Actions exec helpers for running commands
 * @param {string} params.packagesDir - Directory containing packaged chart files
 * @returns {Promise<boolean>} - True if index generation succeeds, false otherwise
 */
async function _generateLocalIndex({ exec, packagesDir }) {
  try {
    console.log('Generating local Helm repository index...');
    const indexPath = path.join(packagesDir, 'index.yaml');
    await exec.exec('helm', ['repo', 'index', packagesDir], { silent: true });
    console.log(`Successfully generated ${indexPath} repository index`);
    return true;
  } catch (error) {
    console.error(`Failed to generate local Helm repository index: ${error.message}`);
    return false;
  }
}

/**
 * Packages a chart after updating its dependencies
 * 
 * This function prepares a Helm chart for distribution by performing these key steps:
 * 
 * 1. Updates all chart dependencies using 'helm dependency update'
 * 2. Packages the chart into a .tgz file using 'helm package'
 * 3. Saves the packaged chart to the specified output directory
 * 
 * The function handles both application and library charts, ensuring all dependencies
 * are properly resolved before packaging. This produces a self-contained chart package
 * that can be installed directly or included in a Helm repository.
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {Object} params.exec - GitHub Actions exec helpers for running commands
 * @param {string} params.chartDir - Path to the chart directory
 * @param {string} params.outputDir - Directory to store the packaged chart
 * @returns {Promise<boolean>} - True if packaging succeeds, false otherwise
 */
async function _packageChart({ exec, chartDir, outputDir }) {
  try {
    console.log(`Packaging '${chartDir}' chart for local testing...`);
    console.log(`Updating dependencies for '${chartDir}' chart...`);
    await exec.exec('helm', ['dependency', 'update', chartDir], { silent: true });
    await exec.exec('helm', ['package', chartDir, '--destination', outputDir], { silent: true });
    return true;
  } catch (error) {
    console.error(`Failed to package ${chartDir} chart: ${error.message}`);
    return false;
  }
}

/**
 * Validates a chart using helm lint, template rendering, and kubectl validation
 * 
 * This function performs comprehensive validation of a Helm chart through multiple
 * stages to ensure it meets quality and compatibility standards:
 * 
 * 1. Runs 'helm lint --strict' to check for syntax and formatting issues
 * 2. Renders the chart templates with 'helm template' to validate template logic
 * 3. Validates the rendered Kubernetes resources against the API server using
 *    'kubectl apply --validate=true --dry-run=server'
 * 4. Checks for a valid icon.png file with proper dimensions
 * 
 * This multi-stage validation helps catch errors early in the development process,
 * ensuring charts will deploy correctly when installed on a Kubernetes cluster.
 * 
 * @private
 * @param {Object} params - Function parameters
 * @param {Object} params.exec - GitHub Actions exec helpers for running commands
 * @param {string} params.chartDir - Path to the chart directory
 * @param {string} params.tempDir - Directory for temporary files
 * @returns {Promise<boolean>} - True if validation succeeds, false otherwise
 */
async function _validateChart({ exec, chartDir, tempDir }) {
  try {
    console.log(`Validating '${chartDir}' chart...`);
    await exec.exec('helm', ['lint', '--strict', chartDir], { silent: true });
    console.log(`Checking template rendering for '${chartDir}' chart...`);
    const templateResult = await exec.getExecOutput('helm', ['template', chartDir], { silent: true });
    if (!templateResult.stdout.trim()) {
      throw new Error(`Chart ${chartDir} produced empty template output`);
    }
    console.log(`Validating Kubernetes resources for '${chartDir}' chart (this may take a moment)...`);
    const tempFile = path.join(tempDir, `${path.basename(chartDir)}-k8s-validation.yaml`);
    await fs.writeFile(tempFile, templateResult.stdout, 'utf8');
    await exec.exec('kubectl', ['apply', '--validate=true', '--dry-run=server', '-f', tempFile], { silent: true });
    await fs.unlink(tempFile);
    if (!await _validateIcon({ chartDir })) {
      return false;
    }
    return true;
  } catch (error) {
    console.error(`Failed to validate ${chartDir} chart: ${error.message}`);
    return false;
  }
}

/**
 * Processes chart releases for local development environment
 * 
 * This function validates and packages charts that have been modified locally
 * but not yet committed or published. It performs thorough validation including
 * linting, template rendering, and Kubernetes API validation to ensure chart quality.
 * 
 * The function:
 * 1. Detects locally modified charts using git status
 * 2. Validates each chart using helm lint and template rendering
 * 3. Validates chart resources against the Kubernetes API
 * 4. Checks that each chart has a proper icon.png file
 * 5. Packages valid charts and generates a local repository index
 * 
 * This allows developers to test chart changes before creating a formal release.
 * The local repository can be added to Helm using 'helm repo add' for testing
 * chart installations in a development environment.
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.core - GitHub Actions Core API or compatible logger
 * @param {Object} params.exec - GitHub Actions exec helpers for running commands
 * @returns {Promise<void>}
 */
async function processLocalReleases({ core, exec }) {
  try {
    if (config('release').deployment === 'production') {
      console.log("In 'production' deployment mode, skipping local releases process");
      return;
    }
    const depsAvailable = await _checkDependencies({ exec });
    if (!depsAvailable) {
      console.error('Missing required dependencies');
      return;
    }
    const appChartType = config('repository').chart.type.application;
    const libChartType = config('repository').chart.type.library;
    const { stdout } = await exec.getExecOutput('git', ['status', '--porcelain'], { silent: true });
    const files = stdout
      .split('\n')
      .filter(Boolean)
      .map(line => line.substring(3))
      .filter(file => file.startsWith(appChartType) || file.startsWith(libChartType));
    const charts = await utils.findCharts({ core, files });
    if (!(charts.total)) {
      core.info(`No ${charts.word} chart releases found`);
      return;
    }
    const chartDirs = [...charts.application, ...charts.library];
    const localPackagesDir = './.cr-local-packages';
    console.log(`Creating ${localPackagesDir} directory...`);
    await fs.mkdir(localPackagesDir, { recursive: true });
    console.log(`Successfully created ${localPackagesDir} directory`);
    const validCharts = [];
    for (const chartDir of chartDirs) {
      if (await _validateChart({ exec, chartDir, tempDir: localPackagesDir })) {
        if (await _packageChart({ exec, chartDir, outputDir: localPackagesDir })) {
          validCharts.push(chartDir);
        }
      }
    }
    if (!validCharts.length) {
      console.log('No charts required for packaging');
      return;
    }
    const word = validCharts.length === 1 ? 'chart' : 'charts';
    console.log(`Successfully packaged ${validCharts.length} ${word}`);
    await _generateLocalIndex({ exec, packagesDir: localPackagesDir });
  } catch (error) {
    console.error(`Error processing local releases: ${error.message}`);
  }
}

/**
 * Exports the module's functions
 */
module.exports = processLocalReleases;
