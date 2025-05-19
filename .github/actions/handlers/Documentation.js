/**
 * Documentation handler for documentation operations
 * 
 * @class Documentation
 * @module handlers/Documentation
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Action = require('../core/Action');
const { Chart, File, Git, GitHub, Shell } = require('../services');

class Documentation extends Action {
  /**
   * Creates a new Documentation handler instance
   * 
   * @param {Object} params - Handler parameters
   */
  constructor(params) {
    super(params);
    this.chartService = new Chart(params);
    this.fileService = new File(params);
    this.gitService = new Git(params);
    this.shellService = new Shell(params);
  }

  /**
   * Commits documentation changes
   * 
   * @param {string} headRef - Git branch reference
   * @param {Array<string>} files - Modified files to commit
   * @returns {Promise<Object>} - Commit operation result
   */
  async commitChanges(headRef, files) {
    const currentHead = await this.gitService.getRevision('HEAD');
    const graphqlService = new GitHub.GraphQL(this);
    const stagedChanges = await this.gitService.getStagedChanges();
    const { additions, deletions } = stagedChanges;
    if (additions.length + deletions.length) {
      await graphqlService.createSignedCommit({
        owner: this.github.context.repo.owner,
        repo: this.github.context.repo.repo,
        branchName: headRef,
        expectedHeadOid: currentHead,
        additions,
        deletions,
        commitMessage: 'chore(github-action): update documentation'
      });
      this.logger.info(`Successfully updated ${files.length} documentation files`);
      return { updated: files.length };
    }
    this.logger.info('No documentation changes to commit');
    return { updated: 0 };
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
      this.logger.info(`Getting the latest changes for '${headRef}' branch...`);
      await this.gitService.fetch('origin', headRef);
      await this.gitService.switch(headRef);
      this.logger.info('Generating documentation with helm-docs...');
      if (!dirs.length) {
        await this.shellService.execute('helm-docs', ['-l', this.config.get('workflow.docs.logLevel')]);
      } else {
        const dirsList = dirs.join(',');
        await this.shellService.execute('helm-docs', ['-g', dirsList, '-l', this.config.get('workflow.docs.logLevel')]);
      }
      await this.gitService.execute(['add', '.']);
      const { stdout: filesOutput } = await this.gitService.execute(['diff', '--staged', '--name-only'], { output: true });
      const files = filesOutput.split('\n').filter(Boolean);
      if (!files.length) {
        this.logger.info('No file changes detected, documentation is up to date');
        return { updated: 0, total: dirs.length };
      }
      const result = await this.commitChanges(headRef, files);
      return { updated: result.updated, total: dirs.length };
    } catch (error) {
      throw this.errorHandler.handle(error, { operation: 'generate documentation' });
    }
  }

  /**
   * Main process method for documentation updates
   * 
   * @param {Array<string>} dirs - Chart directories to update documentation for
   * @returns {Promise<Object>} - Update results
   */
  async process(dirs) {
    try {
      if (!dirs || !dirs.length) {
        this.logger.info('No directories specified for documentation update');
        return { updated: 0, total: 0 };
      }
      this.logger.info(`Updating documentation for ${dirs.length} charts`);
      await this.generate(dirs);
      this.logger.info('Documentation update complete');
      return { updated: dirs.length, total: dirs.length };
    } catch (error) {
      throw this.errorHandler.handle(error, { operation: 'update documentation' });
    }
  }

  /**
   * Required run method
   * 
   * @returns {Promise<Object>} - Process results
   */
  async run() {
    return this.process([]);
  }
}

module.exports = Documentation;
