
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
    packagesPath: '.cr-release-packages',
    readmePath: './README.md'
  }
};
const githubApi = require('./github-api');
const gitSignedCommit = require('./git-signed-commit');
const path = require('path');
const yaml = require('js-yaml');
const crypto = require('crypto');

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
 * Helper function to commit updated lock files
 * @param {Object} options - Options for committing lock files
 * @param {Object} options.exec - GitHub Actions exec helpers
 * @param {Object} options.core - GitHub Actions Core API for logging
 * @param {Object} options.github - GitHub API client
 * @param {Object} options.context - GitHub Actions context
 * @param {Object} options.fs - Node.js fs module for file operations
 * @param {string[]} options.lockFiles - List of lock files to commit
 * @returns {Promise<void>}
 */
async function _commitLockFiles({
  exec,
  core,
  github,
  context,
  fs,
  lockFiles
}) {
  try {
    const runGit = async (args) => (await exec.getExecOutput('git', args)).stdout.trim();
    const headRef = process.env.GITHUB_HEAD_REF;
    core.info(`Switching to PR branch ${headRef}`);
    await runGit(['fetch', 'origin', headRef]);
    await runGit(['switch', headRef]);
    if (lockFiles.length > 0) {
      await runGit(['add', ...lockFiles]);
    }
    const { additions, deletions } = await gitSignedCommit.getGitStagedChanges(runGit, fs);
    if (additions.length > 0 || deletions.length > 0) {
      // Get the current HEAD commit after all the git operations
      const currentHead = await runGit(['rev-parse', 'HEAD']);

      await gitSignedCommit.createSignedCommit({
        github,
        context,
        core,
        branchName: headRef,
        expectedHeadOid: currentHead,
        additions,
        deletions,
        commitMessage: 'chore(github-action): update Chart.lock files'
      });
      core.info('Successfully committed Chart.lock file changes');
    } else {
      core.info('No Chart.lock file changes to commit');
    }
  } catch (error) {
    const errorMsg = `Failed to commit Chart.lock files: ${error.message}`;
    core.warning(errorMsg);
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
 * @param {string} [options.packagesPath=CONFIG.filesystem.packagesPath] - Directory with chart packages
 * @returns {Promise<void>}
 */
async function _createChartReleases({
  github,
  context,
  core,
  fs,
  packagesPath = CONFIG.filesystem.packagesPath
}) {
  try {
    const files = await fs.readdir(packagesPath);
    const packages = files.filter(file => file.endsWith('.tgz'));
    core.info(`Found ${packages.length} chart packages to release`);
    for (const pkg of packages) {
      const chartPath = path.join(packagesPath, pkg);
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
 * @param {string} options.packagesPath - Directory with packaged charts
 * @param {string} options.indexPath - Output path for the index file
 * @param {string} options.repoUrl - URL of the Helm repository
 * @returns {Promise<void>}
 */
async function _generateHelmIndex({
  exec,
  core,
  fs,
  packagesPath,
  indexPath,
  repoUrl
}) {
  try {
    const indexDir = path.dirname(indexPath);
    await fs.mkdir(indexDir, { recursive: true });
    await exec.exec('helm', ['repo', 'index', packagesPath, '--url', repoUrl]);
    await fs.copyFile(path.join(packagesPath, CONFIG.filesystem.indexRegistry), indexPath);
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
 * @param {Object} options.github - GitHub API client
 * @param {Object} options.context - GitHub Actions context
 * @param {string} options.dirPath - Directory containing charts
 * @param {string} options.outputDir - Directory to store packaged charts
 * @returns {Promise<void>}
 */
async function _packageCharts({
  exec,
  core,
  fs,
  github,
  context,
  dirPath,
  outputDir
}) {
  try {
    const chartDirs = await _findChartYamlFiles(fs, core, dirPath);
    if (!chartDirs.length) {
      core.info(`No charts found in ${dirPath}`);
      return;
    }
    const chartLockFiles = [];
    for (const chartDir of chartDirs) {
      const lockFilePath = path.join(chartDir, 'Chart.lock');
      let originalLockHash = null;
      if (await _fileExists(fs, lockFilePath)) {
        const originalContent = await fs.readFile(lockFilePath);
        originalLockHash = crypto.createHash('sha256').update(originalContent).digest('hex');
      }
      core.info(`Updating dependencies for ${chartDir} chart...`);
      await exec.exec('helm', ['dependency', 'update', chartDir]);
      if (await _fileExists(fs, lockFilePath)) {
        const newContent = await fs.readFile(lockFilePath);
        const newHash = crypto.createHash('sha256').update(newContent).digest('hex');
        if (originalLockHash !== newHash) {
          chartLockFiles.push(lockFilePath);
          core.info(`Chart.lock updated for ${chartDir}`);
        }
      }
      core.info(`Packaging ${chartDir} chart...`);
      await exec.exec('helm', ['package', chartDir, '--destination', outputDir]);
    }
    if (chartLockFiles.length > 0) {
      core.info(`Committing ${chartLockFiles.length} updated Chart.lock files`);
      await _commitLockFiles({ exec, core, github, context, fs, lockFiles: chartLockFiles });
    }
    core.info(`Successfully packaged ${chartDirs.length} charts from ${dirPath} directory`);
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
    const indexPath = CONFIG.filesystem.indexPath;
    const packagesPath = CONFIG.filesystem.packagesPath;
    await fs.mkdir(packagesPath, { recursive: true });
    core.info(`Successfully created ${packagesPath} directory`);
    const appDirPath = CONFIG.chart.type.application;
    core.info(`Packaging ${appDirPath} charts...`);
    await _packageCharts({ exec, core, fs, github, context, dirPath: appDirPath, outputDir: packagesPath });
    const libDirPath = CONFIG.chart.type.library;
    core.info(`Packaging ${libDirPath} charts...`);
    await _packageCharts({ exec, core, fs, github, context, dirPath: libDirPath, outputDir: packagesPath });
    core.info('Creating GitHub releases for charts...');
    await _createChartReleases({ github, context, core, fs, packagesPath });
    core.info('Generating Helm repository index...');
    const repoUrl = CONFIG.chart.repoUrl;
    await _generateHelmIndex({ exec, core, fs, packagesPath, indexPath, repoUrl });
    core.info('Chart release process completed successfully');
  } catch (error) {
    const errorMsg = `Chart release process failed: ${error.message}`;
    core.setFailed(errorMsg);
    throw new Error(errorMsg);
  }
}

/**
 * Updates Chart.lock files for charts in a pull request
 * This should run after documentation updates are complete
 * 
 * @param {Object} options - Options for updating Chart.lock files
 * @param {Object} options.github - GitHub API client
 * @param {Object} options.context - GitHub Actions context for repository info
 * @param {Object} options.core - GitHub Actions Core API for logging and output
 * @param {Object} options.exec - GitHub Actions exec helpers for running commands
 * @param {Object} options.fs - Node.js fs module for file operations
 * @returns {Promise<void>}
 */
async function updateChartLockFiles({
  github,
  context,
  core,
  exec,
  fs
}) {
  try {
    const runGit = async (args) => (await exec.getExecOutput('git', args)).stdout.trim();
    const headRef = process.env.GITHUB_HEAD_REF;
    if (!headRef) {
      core.warning('Not running in a pull request context, skipping Chart.lock updates');
      return;
    }
    core.info(`Getting the latest changes for ${headRef} branch...`);
    await runGit(['fetch', 'origin', headRef]);
    core.info(`Switching to PR branch ${headRef}`);
    await runGit(['switch', headRef]);
    await runGit(['pull', 'origin', headRef]);
    const appDirPath = CONFIG.chart.type.application;
    const libDirPath = CONFIG.chart.type.library;
    const chartLockFiles = [];
    core.info('Finding charts with dependency changes...');
    const appChartDirs = await _findChartYamlFiles(fs, core, appDirPath);
    const libChartDirs = await _findChartYamlFiles(fs, core, libDirPath);
    const allChartDirs = [...appChartDirs, ...libChartDirs];
    core.info(`Found ${allChartDirs.length} charts to process`);
    for (const chartDir of allChartDirs) {
      const lockFilePath = path.join(chartDir, 'Chart.lock');
      let originalLockHash = null;
      if (await _fileExists(fs, lockFilePath)) {
        const originalContent = await fs.readFile(lockFilePath);
        originalLockHash = crypto.createHash('sha256').update(originalContent).digest('hex');
      }
      core.info(`Updating dependencies for ${chartDir} chart...`);
      await exec.exec('helm', ['dependency', 'update', chartDir]);
      if (await _fileExists(fs, lockFilePath)) {
        const newContent = await fs.readFile(lockFilePath);
        const newHash = crypto.createHash('sha256').update(newContent).digest('hex');
        if (originalLockHash !== newHash) {
          chartLockFiles.push(lockFilePath);
          core.info(`Chart.lock updated for ${chartDir}`);
        }
      }
    }
    if (chartLockFiles.length > 0) {
      core.info(`Committing ${chartLockFiles.length} updated Chart.lock files`);
      await _commitLockFiles({ exec, core, github, context, fs, lockFiles: chartLockFiles });
    } else {
      core.info('No Chart.lock files to update');
    }
  } catch (error) {
    const errorMsg = `Failed to update Chart.lock files: ${error.message}`;
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
    const indexMdPath = CONFIG.filesystem.indexMdPath;
    const [indexMdHomeExists, indexMdPathExists] = await Promise.all([
      _fileExists(fs, indexMdHome),
      _fileExists(fs, indexMdPath)
    ]);
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
    const readmePath = CONFIG.filesystem.readmePath
    if (await _fileExists(fs, readmePath)) {
      core.info(`Removing ${readmePath} from root to prevent conflicts with index.html`);
      await fs.unlink(readmePath);
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
  setupBuildEnvironment,
  updateChartLockFiles
};
