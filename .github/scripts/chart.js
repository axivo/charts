/**
 * GitHub Pages and Chart Release Utilities
 * 
 * This module provides functions for Helm chart management, releases and GitHub Pages generation:
 * - Centralized configuration constants
 * - Issue template updates with chart options
 * - Repository maintenance and updates
 * - Preparing the build environment for Jekyll
 * - Chart lock file management
 * - Finalizing GitHub Pages deployment
 * - Packaging and releasing Helm charts
 * 
 * @module chart
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs/promises');
const yaml = require('js-yaml');
const githubApi = require('./github-api');
const gitSignedCommit = require('./git-signed-commit');
const utils = require('./utils');

/**
 * Configuration constants for Chart Functions module
 * Contains paths, templates, and settings used throughout the chart release process
 */
const CONFIG = {
  chart: {
    icon: 'icon.png',
    indexTemplate: '.github/templates/index.md.hbs',
    packagesWithIndex: 'true',
    releaseTemplate: '.github/templates/release.md.hbs',
    releaseTitle: '{{ .Name }}-v{{ .Version }}',
    repoUrl: 'https://axivo.github.io/charts/',
    skipExisting: true
  },
  deployment: 'production',
  filesystem: {
    bugReportPath: '.github/ISSUE_TEMPLATE/bug_report.yml',
    chart: {
      application: 'application',
      library: 'library'
    },
    configHome: './_config.yml',
    configPath: '.github/templates/config.yml',
    distPath: './_dist',
    featureRequestPath: '.github/ISSUE_TEMPLATE/feature_request.yml',
    headCustomPath: './_includes/head-custom.html',
    indexMdHome: './index.md',
    indexMdPath: './_dist/index.md',
    indexPath: './_dist/index.yaml',
    indexRegistry: 'index.yaml',
    packagesPath: '.cr-release-packages',
    readmePath: './README.md'
  }
};

/**
 * Builds a GitHub release for a single chart and uploads the chart package as an asset
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client
 * @param {Object} params.context - GitHub Actions context for repository info
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {string} params.chartName - Name of the chart
 * @param {string} params.chartVersion - Version of the chart
 * @param {string} params.chartType - Type of chart (application/library)
 * @param {Object} params.chartMetadata - Chart metadata from Chart.yaml
 * @param {boolean} params.iconExists - Whether an icon exists for the chart
 * @param {string} params.chartPath - Path to the chart package
 * @param {string} params.packageName - Name of the package file
 * @returns {Promise<void>}
 */
async function _buildChartRelease({
  github,
  context,
  core,
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
    core.info(`Processing release for ${tagName}...`);
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
    utils.handleError(error, core, `create release for ${chartName} v${chartVersion}`);
  }
}

/**
 * Updates and commits application files with latest chart versions
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.exec - GitHub Actions exec helpers
 * @param {Object} params.core - GitHub Actions Core API for logging
 * @param {Object} params.github - GitHub API client
 * @param {Object} params.context - GitHub Actions context
 * @param {Object} params.charts - Charts object from _findCharts
 * @returns {Promise<void>}
 */
async function _commitAppFiles({
  exec,
  core,
  github,
  context,
  charts
}) {
  try {
    core.info('Updating application files with latest chart versions...');
    const appFiles = [];
    for (const chartDir of charts.application) {
      const chartName = path.basename(chartDir);
      const appYamlPath = path.join(chartDir, 'application.yaml');
      if (!await utils.fileExists(appYamlPath)) continue;
      try {
        const appConfig = yaml.load(await fs.readFile(appYamlPath, 'utf8'));
        if (!appConfig.spec?.source) continue;
        const chartMetadata = yaml.load(await fs.readFile(path.join(chartDir, 'Chart.yaml'), 'utf8'));
        const tagName = CONFIG.chart.releaseTitle
          .replace('{{ .Name }}', chartName)
          .replace('{{ .Version }}', chartMetadata.version);
        if (appConfig.spec.source.targetRevision === tagName) continue;
        appConfig.spec.source.targetRevision = tagName;
        await fs.writeFile(appYamlPath, yaml.dump(appConfig, { lineWidth: -1 }), 'utf8');
        core.info(`Updated targetRevision to ${tagName} in ${appYamlPath}`);
        appFiles.push(appYamlPath);
      } catch (error) {
        utils.handleError(error, core, `update application file for ${chartName}`, false);
      }
    }
    if (appFiles.length > 0) {
      const runGit = async (args) => (await exec.getExecOutput('git', args)).stdout.trim();
      const headRef = process.env.GITHUB_HEAD_REF;
      core.info(`Committing ${appFiles.length} application files...`);
      await runGit(['add', ...appFiles]);
      const { additions, deletions } = await gitSignedCommit.getGitStagedChanges(runGit);
      if (additions.length + deletions.length > 0) {
        const currentHead = await runGit(['rev-parse', 'HEAD']);
        await gitSignedCommit.createSignedCommit({
          github, context, core,
          branchName: headRef,
          expectedHeadOid: currentHead,
          additions, deletions,
          commitMessage: 'chore(github-action): update target revision references'
        });
        core.info('Successfully committed application file updates');
      } else {
        core.info('No application file changes to commit');
      }
    }
  } catch (error) {
    utils.handleError(error, core, 'update and commit application files', false);
  }
}

/**
 * Updates and commits dependency lock files
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.exec - GitHub Actions exec helpers
 * @param {Object} params.core - GitHub Actions Core API for logging
 * @param {Object} params.github - GitHub API client
 * @param {Object} params.context - GitHub Actions context
 * @param {Object} params.charts - Charts object from _findCharts
 * @returns {Promise<void>}
 */
async function _commitLockFiles({
  exec,
  core,
  github,
  context,
  charts
}) {
  try {
    core.info('Updating dependency lock files...');
    const lockFiles = [];
    const runHelm = async (args) => (await exec.getExecOutput('helm', args)).stdout.trim();
    const chartDirs = [...charts.application, ...charts.library];
    for (const chartDir of chartDirs) {
      const lockFilePath = path.join(chartDir, 'Chart.lock');
      let originalLockHash = null;
      if (await utils.fileExists(lockFilePath)) {
        const originalContent = await fs.readFile(lockFilePath);
        originalLockHash = crypto.createHash('sha256').update(originalContent).digest('hex');
      }
      core.info(`Updating dependency lock file for ${chartDir} chart...`);
      await runHelm(['dependency', 'update', chartDir]);
      if (await utils.fileExists(lockFilePath)) {
        const newContent = await fs.readFile(lockFilePath);
        const newHash = crypto.createHash('sha256').update(newContent).digest('hex');
        if (originalLockHash !== newHash) {
          lockFiles.push(lockFilePath);
          core.info(`Successfully updated dependency lock file for ${chartDir} chart`);
        }
      }
    }
    if (lockFiles.length > 0) {
      const runGit = async (args) => (await exec.getExecOutput('git', args)).stdout.trim();
      const headRef = process.env.GITHUB_HEAD_REF;
      core.info(`Committing ${lockFiles.length} dependency lock files...`);
      await runGit(['add', ...lockFiles]);
      const { additions, deletions } = await gitSignedCommit.getGitStagedChanges(runGit);
      if (additions.length + deletions.length > 0) {
        const currentHead = await runGit(['rev-parse', 'HEAD']);
        await gitSignedCommit.createSignedCommit({
          github, context, core,
          branchName: headRef,
          expectedHeadOid: currentHead,
          additions, deletions,
          commitMessage: 'chore(github-action): update dependency lock files'
        });
        core.info('Successfully committed dependency lock files update');
      } else {
        core.info('No dependency lock file changes to commit');
      }
    }
  } catch (error) {
    utils.handleError(error, core, 'commit dependency lock files', false);
  }
}

/**
 * Creates GitHub releases for packaged charts and uploads the chart packages as release assets
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client
 * @param {Object} params.context - GitHub Actions context for repository info
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {string} [params.packagesPath=CONFIG.filesystem.packagesPath] - Directory with chart packages
 * @returns {Promise<void>}
 */
async function _createChartReleases({
  github,
  context,
  core,
  packagesPath = CONFIG.filesystem.packagesPath
}) {
  try {
    core.info('Creating GitHub releases for charts...');
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
        const appChartDir = path.join(CONFIG.filesystem.chart.application, chartName);
        const libChartDir = path.join(CONFIG.filesystem.chart.library, chartName);
        const libChartExists = await utils.fileExists(libChartDir);
        const chartType = libChartExists ? 'library' : 'application';
        const chartDir = chartType === CONFIG.filesystem.chart.library ? libChartDir : appChartDir;
        let chartMetadata = {};
        const chartYamlPath = path.join(chartDir, 'Chart.yaml');
        try {
          const chartYamlContent = await fs.readFile(chartYamlPath, 'utf8');
          chartMetadata = yaml.load(chartYamlContent);
          core.info(`Loaded chart metadata from ${chartYamlPath}`);
        } catch (error) {
          core.warning(`Failed to load chart metadata: ${error.message}`);
        }
        const iconPath = path.join(chartDir, CONFIG.chart.icon);
        const iconExists = await utils.fileExists(iconPath);
        await _buildChartRelease({
          github,
          context,
          core,
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
    utils.handleError(error, core, 'create chart releases');
  }
}

/**
 * Finds deployed charts in application and library paths
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.core - GitHub Actions Core API for logging
 * @returns {Promise<{application: string[], library: string[]}>} - Object containing arrays of chart directories by type
 */
async function _findCharts({
  core
}) {
  core.info('Finding chart directories...');
  const charts = {
    application: [],
    library: []
  };
  const paths = [
    { dir: CONFIG.filesystem.chart.application, type: 'application' },
    { dir: CONFIG.filesystem.chart.library, type: 'library' }
  ];
  await Promise.all(paths.map(async ({ dir, type }) => {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const chartDir = path.join(dir, entry.name);
          const chartYamlPath = path.join(chartDir, 'Chart.yaml');
          if (await utils.fileExists(chartYamlPath)) {
            charts[type].push(chartDir);
          }
        }
      }
    } catch (error) {
      utils.handleError(error, core, `read directory ${dir}`, false);
    }
  }));
  core.info(`Found ${charts.application.length} application charts and ${charts.library.length} library charts`);
  return charts;
}

/**
 * Generates release content using the template file
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.core - GitHub Actions Core API for logging
 * @param {Object} params.context - GitHub Actions context
 * @param {string} params.chartName - Name of the chart
 * @param {string} params.chartVersion - Version of the chart
 * @param {string} params.chartType - Type of chart (application/library)
 * @param {Object} params.chartMetadata - Chart metadata from Chart.yaml
 * @param {boolean} params.iconExists - Whether an icon exists for the chart
 * @param {string} [params.releaseTemplate=CONFIG.chart.releaseTemplate] - Path to release template
 * @returns {Promise<string>} - Generated release content
 */
async function _generateChartRelease({
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
    core.info(`Generating release content for ${chartName} chart...`);
    await fs.mkdir(CONFIG.filesystem.distPath, { recursive: true });
    try {
      await fs.access(releaseTemplate);
      core.info(`Release template found at: ${releaseTemplate}`);
    } catch (accessError) {
      utils.handleError(accessError, core, `find template file at ${releaseTemplate}`, false);
      return `Release of ${chartName} chart version ${chartVersion}`;
    }
    const repoUrl = context.payload.repository.html_url;
    const templateContent = await fs.readFile(releaseTemplate, 'utf8');
    core.info(`Loaded release template from ${releaseTemplate}`);
    const Handlebars = utils.registerHandlebarsHelpers(repoUrl);
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
    utils.handleError(error, core, 'generate release content', false);
    return `Release of ${chartName} chart with ${chartVersion} version`;
  }
}

/**
 * Generates the Helm repository index file
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.exec - GitHub Actions exec helpers
 * @param {Object} params.core - GitHub Actions Core API for logging
 * @param {string} params.packagesPath - Directory with packaged charts
 * @param {string} params.indexPath - Output path for the index file
 * @param {string} params.repoUrl - URL of the Helm repository
 * @returns {Promise<void>}
 */
async function _generateHelmIndex({
  exec,
  core,
  packagesPath,
  indexPath,
  repoUrl
}) {
  try {
    core.info('Generating Helm repository index...');
    const indexDir = path.dirname(indexPath);
    await fs.mkdir(indexDir, { recursive: true });
    await exec.exec('helm', ['repo', 'index', packagesPath, '--url', repoUrl]);
    await fs.copyFile(path.join(packagesPath, CONFIG.filesystem.indexRegistry), indexPath);
    core.info(`Successfully generated ${indexPath} repository index`);
  } catch (error) {
    utils.handleError(error, core, 'generate Helm repository index');
  }
}

/**
 * Packages all charts in a specified directory and updates references
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.exec - GitHub Actions exec helpers
 * @param {Object} params.core - GitHub Actions Core API for logging
 * @param {Object} params.github - GitHub API client
 * @param {Object} params.context - GitHub Actions context
 * @param {string} params.outputDir - Directory to store packaged charts
 * @returns {Promise<void>}
 */
async function _packageCharts({
  exec,
  core,
  github,
  context,
  outputDir
}) {
  try {
    const charts = await _findCharts({ core });
    charts.application.sort();
    charts.library.sort();
    const chartDirs = [...charts.application, ...charts.library];
    if (!chartDirs.length) {
      core.info(`No charts found`);
      return;
    }
    const runHelm = async (args) => (await exec.getExecOutput('helm', args)).stdout.trim();
    for (const chartDir of chartDirs) {
      core.info(`Packaging ${chartDir} chart...`);
      await runHelm(['package', chartDir, '--destination', outputDir]);
    }
    await _commitAppFiles({ exec, core, github, context, charts });
    await _commitLockFiles({ exec, core, github, context, charts });
    core.info(`Successfully packaged ${chartDirs.length} charts`);
  } catch (error) {
    utils.handleError(error, core, 'package charts');
  }
}

/**
 * Generates the charts index page from index.yaml file
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.context - GitHub Actions context for repository info
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {string} [params.indexPath=CONFIG.filesystem.indexPath] - Path to the index.yaml file
 * @param {string} [params.indexMdPath=CONFIG.filesystem.indexMdPath] - Path where to write the generated index.md
 * @param {string} [params.indexTemplate=CONFIG.chart.indexTemplate] - Path to the Handlebars template
 * @returns {Promise<boolean>} - True if successful, false if skipped
 */
async function generateIndex({
  context,
  core,
  indexPath = CONFIG.filesystem.indexPath,
  indexMdPath = CONFIG.filesystem.indexMdPath,
  indexTemplate = CONFIG.chart.indexTemplate
}) {
  try {
    core.info(`Reading index YAML from ${indexPath}...`);
    let indexContent;
    try {
      indexContent = await fs.readFile(indexPath, 'utf8');
      core.info(`Successfully read index.yaml, size: ${indexContent.length} bytes`);
    } catch (readError) {
      utils.handleError(readError, core, 'read index.yaml', false);
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
      core.info('Creating an empty index.md file...');
      await fs.mkdir(path.dirname(indexMdPath), { recursive: true });
      await fs.writeFile(indexMdPath, '', 'utf8');
      await fs.writeFile(CONFIG.filesystem.indexMdHome, '', 'utf8');
      core.info(`Created empty index.md files`);
      return true;
    }
    core.info(`Reading template from ${indexTemplate}...`);
    const template = await fs.readFile(indexTemplate, 'utf8');
    core.info(`Template loaded, size: ${template.length} bytes`);
    const repoUrl = context.payload.repository.html_url;
    const defaultBranchName = context.payload.repository.default_branch;
    const Handlebars = utils.registerHandlebarsHelpers(repoUrl);
    const charts = Object.entries(index.entries)
      .sort(([source], [target]) => source.localeCompare(target))
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
    core.info(`Writing index.md to root directory and ${indexMdPath}...`);
    await fs.writeFile(CONFIG.filesystem.indexMdHome, newContent, 'utf8');
    await fs.writeFile(indexMdPath, newContent, 'utf8');
    core.info('Successfully generated index.md');
    try {
      core.info('Updating issue templates...');
      await updateIssueTemplates({ core });
      core.info('Successfully updated issue templates with chart options');
    } catch (templateError) {
      utils.handleError(templateError, core, 'update issue templates', false);
    }
    return true;
  } catch (error) {
    utils.handleError(error, core, 'generate index.md');
  }
}

/**
 * Performs all required updates for a pull request
 * 
 * Handles multiple repository maintenance tasks:
 * - Updates dependency lock files
 * - Updates issue templates with current chart options
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client
 * @param {Object} params.context - GitHub Actions context for repository info
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {Object} params.exec - GitHub Actions exec helpers for running commands
 * @returns {Promise<void>}
 */
async function performUpdates({
  github,
  context,
  core,
  exec
}) {
  try {
    await updateLockFiles({ github, context, core, exec });
    const runGit = async (args) => (await exec.getExecOutput('git', args)).stdout.trim();
    const headRef = process.env.GITHUB_HEAD_REF;
    core.info('Fetching the latest branch state...');
    await runGit(['fetch', 'origin', headRef]);
    await runGit(['pull', 'origin', headRef]);
    const templateFiles = await updateIssueTemplates({ core });
    if (templateFiles.length > 0) {
      core.info(`Committing ${templateFiles.length} template files...`);
      await runGit(['add', ...templateFiles]);
      const { additions, deletions } = await gitSignedCommit.getGitStagedChanges(runGit);
      if (additions.length + deletions.length > 0) {
        const currentHead = await runGit(['rev-parse', 'HEAD']);
        await gitSignedCommit.createSignedCommit({
          github, context, core,
          branchName: headRef,
          expectedHeadOid: currentHead,
          additions, deletions,
          commitMessage: 'chore(github-action): update issue templates'
        });
        core.info('Successfully committed issue template updates');
        await runGit(['fetch', 'origin', headRef]);
      }
    }
  } catch (error) {
    utils.handleError(error, core, 'perform repository updates');
  }
}

/**
 * Handles the complete Helm chart releases process:
 * 1. Packages application and library charts
 * 2. Creates GitHub releases
 * 3. Generates the repository index
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client
 * @param {Object} params.context - GitHub Actions context for repository info
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {Object} params.exec - GitHub Actions exec helpers for running commands
 * @returns {Promise<void>}
 */
async function processReleases({
  github,
  context,
  core,
  exec
}) {
  try {
    const indexPath = CONFIG.filesystem.indexPath;
    const packagesPath = CONFIG.filesystem.packagesPath;
    core.info(`Creating ${packagesPath} directory...`);
    core.info('Validating required labels...');
    const releaseLabels = Object.entries(githubApi.CONFIG.release.labels);
    await Promise.all(releaseLabels.map(([name, info]) =>
      utils.addLabel({ github, context, core, labelName: name, color: info.color, description: info.description })));
    await fs.mkdir(packagesPath, { recursive: true });
    core.info(`Successfully created ${packagesPath} directory`);
    core.info('Packaging all charts...');
    await _packageCharts({ exec, core, github, context, outputDir: packagesPath });
    core.info('Creating all chart releases...');
    await _createChartReleases({ github, context, core, packagesPath });
    core.info('Generating Helm repository index...');
    const repoUrl = CONFIG.chart.repoUrl;
    await _generateHelmIndex({ exec, core, packagesPath, indexPath, repoUrl });
    core.info('Successfully completed the chart releases process');
  } catch (error) {
    utils.handleError(error, core, 'process chart releases');
  }
}

/**
 * Setup the build environment for generating the static site
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @returns {Promise<void>}
 */
async function setupBuildEnvironment({ core }) {
  try {
    core.info(`Setting up build environment for ${CONFIG.deployment} deployment`);
    core.info(`Copying ${CONFIG.filesystem.configPath} to ${CONFIG.filesystem.configHome}...`);
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
      utils.handleError(headError, core, 'process custom head content', false);
    }
  } catch (error) {
    utils.handleError(error, core, 'copy Jekyll config');
  }
  try {
    const indexMdHome = CONFIG.filesystem.indexMdHome;
    const indexMdPath = CONFIG.filesystem.indexMdPath;
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
    const readmePath = CONFIG.filesystem.readmePath;
    if (await utils.fileExists(readmePath)) {
      core.info(`Removing ${readmePath} from root to prevent conflicts with index.html...`);
      await fs.unlink(readmePath);
    }
  } catch (error) {
    utils.handleError(error, core, 'remove README.md');
  }
  core.setOutput('deployment', CONFIG.deployment);
  core.info(`Jekyll preparation complete for ${CONFIG.deployment} environment`);
}

/**
 * Updates issue templates with current chart options
 * 
 * Updates dropdown options in issue templates based on current charts in the repository
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.core - GitHub Actions Core API for logging
 * @returns {Promise<string[]>} - Array of updated template file paths
 */
async function updateIssueTemplates({
  core
}) {
  try {
    core.info('Updating issue templates with chart options...');
    const bugReportPath = CONFIG.filesystem.bugReportPath;
    const featureRequestPath = CONFIG.filesystem.featureRequestPath;
    const templatePaths = [bugReportPath, featureRequestPath];
    const charts = await _findCharts({ core });
    const allChartDirs = [...charts.application, ...charts.library];
    if (allChartDirs.length === 0) {
      core.info('No charts found, skipping issue template updates');
      return [];
    }
    const appCharts = charts.application;
    const libCharts = charts.library;
    const appChartOptions = appCharts.map(dir => `${path.basename(dir)} (application)`).sort();
    const libChartOptions = libCharts.map(dir => `${path.basename(dir)} (library)`).sort();
    const chartOptions = [...appChartOptions, ...libChartOptions];
    const indentationRegex = /(\s+)-.+\(.+\)/;
    const optionsRegex = /(id:\s+chart[\s\S]+options:[\s+\n])[\s\S]+?(\s+default:\s+0)/;
    const updatedTemplates = [];
    for (const templatePath of templatePaths) {
      try {
        let content = await fs.readFile(templatePath, 'utf8');
        if (!content.includes('id: chart')) {
          continue;
        }
        const indentation = content.match(indentationRegex)[1];
        const optionsText = chartOptions.map(option => `${indentation}- ${option}`).join('');
        const replacementText = `$1${optionsText}$2`;
        content = content.replace(optionsRegex, replacementText);
        await fs.writeFile(templatePath, content, 'utf8');
        core.info(`Updated chart options in ${templatePath} issue template`);
        updatedTemplates.push(templatePath);
      } catch (error) {
        utils.handleError(error, core, `update ${templatePath} issue template`, false);
      }
    }
    if (chartOptions.length > 0) {
      core.info(`Successfully updated issue templates with ${chartOptions.length} chart options`);
    }
    return updatedTemplates;
  } catch (error) {
    utils.handleError(error, core, 'update issue templates');
    return [];
  }
}

/**
 * Updates dependency lock files for charts in a pull request
 * This should run after documentation updates are complete
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.github - GitHub API client
 * @param {Object} params.context - GitHub Actions context for repository info
 * @param {Object} params.core - GitHub Actions Core API for logging and output
 * @param {Object} params.exec - GitHub Actions exec helpers for running commands
 * @returns {Promise<void>}
 */
async function updateLockFiles({
  github,
  context,
  core,
  exec
}) {
  try {
    const runGit = async (args) => (await exec.getExecOutput('git', args)).stdout.trim();
    const headRef = process.env.GITHUB_HEAD_REF;
    core.info(`Getting the latest changes for ${headRef} branch...`);
    await runGit(['fetch', 'origin', headRef]);
    await runGit(['switch', headRef]);
    await runGit(['pull', 'origin', headRef]);
    core.info('Finding charts with dependency changes...');
    const charts = await _findCharts({ core });
    core.info(`Found ${charts.application.length + charts.library.length} charts to process`);
    await _commitLockFiles({ exec, core, github, context, charts });
  } catch (error) {
    utils.handleError(error, core, 'update dependency lock files');
  }
}

module.exports = {
  CONFIG,
  generateIndex,
  performUpdates,
  processReleases,
  setupBuildEnvironment,
  updateIssueTemplates,
  updateLockFiles
};
