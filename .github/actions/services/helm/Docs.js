/**
 * Helm documentation service for helm-docs operations
 * 
 * @module services/helm/Docs
 * @author AXIVO
 * @license BSD-3-Clause
 */
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const Action = require('../../core/Action');
const GitService = require('../Git');
const ShellService = require('../Shell');

/**
 * Helm documentation service for helm-docs operations
 * 
 * Provides helm-docs integration including installation,
 * documentation generation, and Git commit management.
 * 
 * @class DocsService
 */
class DocsService extends Action {
  /**
   * Creates a new DocsService instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.gitService = new GitService(params);
    this.shellService = new ShellService(params);
  }

  /**
   * Generates documentation for charts
   * 
   * @param {Array<string>} directories - Chart directories to generate documentation for
   * @returns {Promise<Object>} Documentation generation results
   */
  async generate(directories) {
    return this.execute('generate documentation', async () => {
      this.logger.info('Generating documentation with helm-docs...');
      if (!directories || !directories.length) {
        await this.shellService.execute('helm-docs', ['-l', this.config.get('workflow.docs.logLevel')]);
      } else {
        const dirsList = directories.join(',');
        await this.shellService.execute('helm-docs', ['-g', dirsList, '-l', this.config.get('workflow.docs.logLevel')]);
      }
      const changesResult = await this.gitService.getChanges();
      const files = changesResult ? changesResult.files : [];
      if (!files.length) {
        this.logger.info('No documentation file changes to commit');
        return { updated: 0, total: directories ? directories.length : 0 };
      }
      const branch = process.env.GITHUB_HEAD_REF;
      const result = await this.gitService.signedCommit(branch, files, 'chore(github-action): update documentation');
      return { updated: result.updated, total: directories ? directories.length : 0 };
    }, false);
  }

  /**
   * Installs helm-docs binary
   * 
   * @param {string} version - Helm-docs version to install
   * @returns {Promise<boolean>} True if installation succeeded
   */
  async install(version) {
    return this.execute('install helm-docs', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'helm-docs-'));
      const packageFile = `helm-docs_${version}_Linux_x86_64.deb`;
      const packageBaseUrl = 'https://github.com/norwoodj/helm-docs/releases/download';
      const packageUrl = `${packageBaseUrl}/v${version}/${packageFile}`;
      const packagePath = `${tempDir}/${packageFile}`;
      this.logger.info(`Installing helm-docs v${version}...`);
      await this.shellService.execute('sudo', ['wget', '-qP', tempDir, '-t', '10', '-T', '60', packageUrl]);
      await this.shellService.execute('sudo', ['apt-get', '-y', 'install', packagePath]);
      this.logger.info('Successfully installed helm-docs');
      return true;
    });
  }
}

module.exports = DocsService;
