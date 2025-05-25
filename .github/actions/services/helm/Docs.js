/**
 * Helm documentation service for helm-docs operations
 * 
 * @class Docs
 * @module services/helm/Docs
 * @author AXIVO
 * @license BSD-3-Clause
 */
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const Action = require('../../core/Action');
const { HelmError } = require('../../utils/errors');
const Git = require('../Git');
const Shell = require('../Shell');

class Docs extends Action {
  /**
   * Creates a new Helm Docs service instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.gitService = new Git(params);
    this.shellService = new Shell(params);
  }

  /**
   * Generates documentation for charts
   * 
   * @param {Array<string>} dirs - Chart directories to generate documentation for
   * @returns {Promise<Object>} - Documentation generation results
   */
  async generate(dirs) {
    try {
      const headRef = process.env.GITHUB_HEAD_REF;
      this.logger.info('Generating documentation with helm-docs...');
      if (!dirs || !dirs.length) {
        await this.shellService.execute('helm-docs', ['-l', this.config.get('workflow.docs.logLevel')]);
      } else {
        const dirsList = dirs.join(',');
        await this.shellService.execute('helm-docs', ['-g', dirsList, '-l', this.config.get('workflow.docs.logLevel')]);
      }
      const filesOutput = await this.gitService.execute(['diff', '--name-only']);
      const files = filesOutput.split('\n').filter(Boolean);
      if (!files.length) {
        this.logger.info('No file changes detected, documentation is up to date');
        return { updated: 0, total: dirs ? dirs.length : 0 };
      }
      const result = await this.gitService.signedCommit(headRef, files, 'chore(github-action): update documentation');
      return { updated: result.updated, total: dirs ? dirs.length : 0 };
    } catch (error) {
      throw new HelmError('generate documentation', error);
    }
  }

  /**
   * Installs helm-docs binary
   * 
   * @param {string} version - Helm-docs version to install
   * @returns {Promise<boolean>} - True if installation succeeded
   */
  async install(version) {
    try {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'helm-docs-'));
      const packageFile = `helm-docs_${version}_Linux_x86_64.deb`;
      const packageBaseUrl = 'https://github.com/norwoodj/helm-docs/releases/download';
      const packageUrl = [packageBaseUrl, `v${version}`, packageFile].join('/');
      const packagePath = [tempDir, packageFile].join('/');
      this.logger.info(`Installing helm-docs v${version}...`);
      await this.shellService.execute('sudo', ['wget', '-qP', tempDir, '-t', '10', '-T', '60', packageUrl]);
      await this.shellService.execute('sudo', ['apt-get', '-y', 'install', packagePath]);
      this.logger.info('Successfully installed helm-docs');
      return true;
    } catch (error) {
      throw new HelmError('install helm-docs', error);
    }
  }
}

module.exports = Docs;
