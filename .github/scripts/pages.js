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
    icon: 'icon.png',
    packagesWithIndex: 'true',
    releaseTemplate: '.github/pages/release.md.hbs',
    releaseTitle: '{{ .Name }}-v{{ .Version }}',
    repoUrl: 'https://axivo.github.io/charts/',
    skipExisting: 'true'
  },

  filesystem: {
    application: 'application',
    dist: './_dist',
    library: 'library',
    temp: '.cr-release-packages',
    configYmlPath: './_config.yml',
    configYmlSrc: '.github/pages/config.yml',
    indexMdPath: './_dist/index.md',
    indexMdSrc: './index.md',
    indexPath: './_dist/index.yaml',
    indexPathFinal: 'index.yaml',
    templatePath: '.github/pages/index.md.hbs'
  }
};
const path = require('path');
const yaml = require('js-yaml');

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

        // Determine chart type (application or library)
        let chartType = 'application';
        const libraryChartDir = path.join(CONFIG.filesystem.library, chartName);
        const appChartDir = path.join(CONFIG.filesystem.application, chartName);

        // Check if exists in library directory
        if (await fileExists(fs, libraryChartDir)) {
          chartType = 'library';
        }

        // Load chart metadata from Chart.yaml
        let chartMetadata = {};
        const chartYamlPath = path.join(chartType === 'library' ? libraryChartDir : appChartDir, 'Chart.yaml');

        try {
          const chartYamlContent = await fs.readFile(chartYamlPath, 'utf8');
          chartMetadata = yaml.load(chartYamlContent);
          core.info(`Loaded chart metadata from ${chartYamlPath}`);
        } catch (error) {
          core.warning(`Failed to load chart metadata: ${error.message}`);
        }

        // Check if icon exists
        const iconPath = path.join(chartType === 'library' ? libraryChartDir : appChartDir, CONFIG.chart.icon);
        const iconExists = await fileExists(fs, iconPath);

        // Generate release body from template
        const releaseBody = await generateRelease({
          fs,
          core,
          context,
          chartName,
          chartVersion,
          chartType,
          chartMetadata,
          iconExists
        });

        // Create release
        const release = await github.rest.repos.createRelease({
          owner: context.repo.owner,
          repo: context.repo.repo,
          tag_name: tagName,
          name: formatReleaseTitle(chartName, chartVersion),
          body: releaseBody,
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
 * Recursively finds directories containing Chart.yaml files
 * @param {Object} fs - Node.js fs/promises module
 * @param {Object} core - GitHub Actions Core API for logging
 * @param {string} directory - Directory to search in
 * @returns {Promise<string[]>} - Array of directories containing Chart.yaml files
 */
async function findChartYamlFiles(fs, core, directory) {
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

/**
 * Formats a release title according to the template
 * @param {string} name
 * @param {string} version
 * @returns {string}
 */
function formatReleaseTitle(name, version) {
  // Use standard format if releaseTitle is not configured
  if (!CONFIG.chart.releaseTitle) {
    return `${name} ${version}`;
  }
  
  // Simple implementation of template replacement
  return CONFIG.chart.releaseTitle
    .replace('{{ .Name }}', name)
    .replace('{{ .Version }}', version);
}

/**
 * Formats a release name according to the template
 * @param {string} name
 * @param {string} version
 * @returns {string}
 */
function formatReleaseName(name, version) {
  // Simple implementation for tag name: name-vversion
  return `${name}-v${version}`;
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
 * @param {string} [options.templatePath=CONFIG.chart.releaseTemplate] - Path to release template
 * @returns {Promise<string>} - Generated release content
 */
async function generateRelease({
  fs,
  core,
  context,
  chartName,
  chartVersion,
  chartType,
  chartMetadata,
  iconExists,
  templatePath = CONFIG.chart.releaseTemplate
}) {
  try {
    // Ensure distribution directory exists
    await fs.mkdir(CONFIG.filesystem.dist, { recursive: true });
    
    // Check if release template exists
    try {
      await fs.access(templatePath);
      core.info(`Release template found at: ${templatePath}`);
    } catch (accessError) {
      core.warning(`Template file not found at ${templatePath}: ${accessError.message}`);
      return `Release of ${chartName} chart version ${chartVersion}`;
    }
    
    // Load release template
    const templateContent = await fs.readFile(templatePath, 'utf8');
    core.info(`Loaded release template from ${templatePath}`);

    // Set up Handlebars
    const Handlebars = require('handlebars');
    Handlebars.registerHelper('rawGithubUrl', function (repoUrl, branch, path) {
      return String(repoUrl).replace('github.com', 'raw.githubusercontent.com') + '/' + branch + '/' + path;
    });

    // Compile the template
    const template = Handlebars.compile(templateContent);

    // Prepare template context
    const templateContext = {
      Name: chartName,
      Version: chartVersion,
      Type: chartType,
      Description: chartMetadata.description || '',
      AppVersion: chartMetadata.appVersion || '',
      KubeVersion: chartMetadata.kubeVersion || '',
      Dependencies: chartMetadata.dependencies || [],
      Icon: iconExists ? CONFIG.chart.icon : null,
      RepoURL: context.payload.repository.html_url,
      Repository: {
        Branch: context.payload.repository.default_branch
      }
    };

    // Generate the release content
    return template(templateContext);
  } catch (error) {
    core.warning(`Failed to generate release content: ${error.message}`);
    // Fallback to simple description
    return `Release of ${chartName} chart version ${chartVersion}`;
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
    } catch (readError) {
      core.warning(`Failed to read index.yaml: ${readError.message}`);
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

    const index = yaml.load(indexContent);

    if (!index || !index.entries) {
      core.warning('Invalid or empty index.yaml file, creating an empty index.md.');
      // Create an empty index.md instead of skipping
      await fs.mkdir(path.dirname(indexMdPath), { recursive: true });
      await fs.writeFile(indexMdPath, '', 'utf8');

      // Also ensure the root index.md exists
      await fs.writeFile('./index.md', '', 'utf8');
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

    const compiledTemplate = Handlebars.compile(template);
    const newContent = compiledTemplate({
      Charts: charts,
      RepoURL: repoUrl,
      Branch: defaultBranchName
    });

    core.info(`Generated content length: ${newContent.length} bytes`);

    // Ensure directory exists before writing file
    await fs.mkdir(path.dirname(indexMdPath), { recursive: true });

    // Also write directly to the root index.md for Jekyll
    core.info(`Writing index.md to root directory and ${indexMdPath}`);
    await fs.writeFile('./index.md', newContent, 'utf8');
    await fs.writeFile(indexMdPath, newContent, 'utf8');

    core.info('Successfully generated index.md');
    return true;

  } catch (error) {
    core.setFailed(`Failed to generate index.md: ${error.message}`);
    throw error;
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
    // Get directories containing Chart.yaml files
    const chartDirsArray = await findChartYamlFiles(fs, core, dirPath);

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
    await fs.access(CONFIG.chart.releaseTemplate);
    core.info(`Release template found at: ${CONFIG.chart.releaseTemplate}`);
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
  fileExists,
  findChartYamlFiles,
  formatReleaseName,
  formatReleaseTitle,
  generateChartIndex,
  generateHelmIndex,
  generateRelease,
  packageChartsInDirectory,
  processChartRelease,
  setupBuildEnvironment,
  setupChartReleaserConfig
};
