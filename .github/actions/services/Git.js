/**
 * Git service for managing git operations
 * 
 * @class Git
 * @module services/Git
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Action = require('../core/Action');
const File = require('./File');
const GitHub = require('./github');
const Shell = require('./Shell');

class Git extends Action {
  /**
   * Creates a new Git service instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.fileService = new File(params);
    this.graphqlService = new GitHub.GraphQL(params);
    this.shellService = new Shell(params);
  }

  /**
   * Adds files to git staging area
   * 
   * @param {string[]} files - Array of file paths to add
   * @returns {Promise<string>} - Command output
   */
  async add(files) {
    if (!files || !files.length) {
      this.logger.info('No files to add to git staging area');
      return '';
    }
    return this.execute(`add ${files.length} files to git staging area`, async () => {
      return await this.shellService.execute('git', ['add', ...files], { output: true });
    });
  }

  /**
   * Commits staged changes
   * 
   * @param {string} message - Commit message
   * @param {Object} options - Commit options
   * @param {boolean} options.signoff - Whether to add signoff to commit
   * @param {boolean} options.noVerify - Whether to skip git hooks
   * @returns {Promise<string>} - Command output
   */
  async commit(message, options = {}) {
    return this.execute(`commit changes: '${message}'`, async () => {
      const args = ['commit', '-m', message];
      if (options.signoff) args.push('--signoff');
      if (options.noVerify) args.push('--no-verify');
      return await this.shellService.execute('git', args, { output: true });
    });
  }

  /**
   * Configures git repository with user identity
   * 
   * @returns {Promise<void>}
   */
  async configure() {
    return this.execute('configure repository', async () => {
      const userEmail = this.config.get('repository.user.email');
      const userName = this.config.get('repository.user.name');
      await this.shellService.execute('git', ['config', 'user.email', userEmail], { output: true });
      await this.shellService.execute('git', ['config', 'user.name', userName], { output: true });
      this.logger.info('Successfully configured repository');
    });
  }

  /**
   * Fetches from a remote
   * 
   * @param {string} remote - Remote name
   * @param {string} [reference] - Specific reference to fetch
   * @returns {Promise<string>} - Command output
   */
  async fetch(remote = 'origin', reference) {
    return this.execute(`fetch from '${remote}' remote${reference ? ` (${reference})` : ''}`, async () => {
      const args = ['fetch', remote];
      if (reference) args.push(reference);
      return await this.shellService.execute('git', args, { output: true });
    });
  }

  /**
   * Gets the current branch name
   * 
   * @returns {Promise<string>} - Current branch name
   */
  async getCurrentBranch() {
    return this.execute('get current branch name', async () => {
      return await this.shellService.execute('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { output: true });
    });
  }

  /**
   * Gets changes between working tree and reference
   * 
   * @param {string} [reference] - Reference to compare against working tree
   * @returns {Promise<Object>} - Object with files property containing array of changed files
   */
  async getChanges(reference) {
    return this.execute(`get changes${reference ? ` against '${reference}'` : ''}`, async () => {
      const args = ['diff', '--name-only'];
      if (reference) args.push(reference);
      const result = await this.shellService.execute('git', args, { output: true });
      return { files: result ? result.split('\n').filter(Boolean) : [] };
    }, false);
  }

  /**
   * Gets the revision hash for a reference
   * 
   * @param {string} [reference='HEAD'] - Git reference
   * @returns {Promise<string>} - Revision hash
   */
  async getRevision(reference = 'HEAD') {
    return this.execute(`get revision for '${reference}' reference`, async () => {
      return await this.shellService.execute('git', ['rev-parse', reference], { output: true });
    });
  }

  /**
   * Gets staged changes from git
   * 
   * @returns {Promise<Object>} - Object with additions and deletions arrays
   */
  async getStagedChanges() {
    return this.execute('get staged changes', async () => {
      const additionsFiles = await this.shellService.execute('git', [
        'diff', '--name-only', '--staged', '--diff-filter=ACMR'
      ], { output: true });
      const deletionsFiles = await this.shellService.execute('git', [
        'diff', '--name-only', '--staged', '--diff-filter=D'
      ], { output: true });
      const additions = await Promise.all(
        additionsFiles.split('\n')
          .filter(Boolean)
          .map(async file => {
            const contents = await this.fileService.read(file);
            return { path: file, contents: Buffer.from(contents).toString('base64') };
          })
      );
      const deletions = deletionsFiles.split('\n')
        .filter(Boolean)
        .map(file => ({ path: file }));
      return {
        additions,
        deletions
      };
    });
  }

  /**
   * Gets the git status
   * 
   * @returns {Promise<Object>} - Git status information
   */
  async getStatus() {
    return this.execute('get git status', async () => {
      const result = await this.shellService.execute('git', ['status', '--porcelain'], { output: true });
      const status = { deleted: [], modified: [], untracked: [] };
      if (result) {
        result.split('\n').filter(Boolean).forEach(line => {
          const statusCode = line.substring(0, 2);
          const file = line.substring(3);
          if (statusCode.includes('D')) status.deleted.push(file);
          else if (['A', 'C', 'M', 'R'].some(filter => statusCode.includes(filter))) status.modified.push(file);
          else status.untracked.push(file);
        });
      }
      return status;
    }, false);
  }

  /**
   * Parses git status output into structured format
   * 
   * @param {string} output - Git status output
   * @returns {Array<Object>} - Parsed status entries
   */
  parseGitStatus(output) {
    if (!output) return [];
    return output.split('\n')
      .filter(Boolean)
      .map(line => {
        const [status, ...pathParts] = line.split('\t');
        const path = pathParts.join('\t');
        return { status, path };
      });
  }

  /**
   * Pulls the latest changes from remote
   * 
   * @param {string} [remote='origin'] - Remote name
   * @param {string} [branch] - Branch name (if not provided, uses current branch)
   * @returns {Promise<string>} - Command output
   */
  async pull(remote = 'origin', branch) {
    return this.execute(`pull from '${remote}' remote`, async () => {
      const targetBranch = branch || await this.getCurrentBranch();
      this.logger.info(`Pulling latest changes from '${remote}/${targetBranch}' branch`);
      return await this.shellService.execute('git', ['pull', remote, targetBranch], { output: true });
    });
  }

  /**
   * Pushes changes to remote
   * 
   * @param {string} [remote='origin'] - Remote name
   * @param {string} [branch] - Branch name (if not provided, uses current branch)
   * @param {Object} options - Push options
   * @param {boolean} options.force - Whether to force push
   * @returns {Promise<string>} - Command output
   */
  async push(remote = 'origin', branch, options = {}) {
    return this.execute(`push to '${remote}' remote`, async () => {
      const targetBranch = branch || await this.getCurrentBranch();
      const args = ['push', remote, targetBranch];
      if (options.force) args.push('--force');
      return await this.shellService.execute('git', args, { output: true });
    });
  }

  /**
   * Creates a signed commit using GitHub GraphQL API
   * 
   * @param {string} branch - Git branch reference
   * @param {Array<string>} files - Modified files to commit
   * @param {string} message - Commit message
   * @returns {Promise<Object>} - Commit operation result
   */
  async signedCommit(branch, files, message) {
    const word = files.length === 1 ? 'file' : 'files';
    return this.execute(`create signed commit for ${files.length} ${word}`, async () => {
      const headRef = branch || process.env.GITHUB_HEAD_REF;
      await this.fetch('origin', headRef);
      await this.switch(headRef);
      const currentHead = await this.getRevision('HEAD');
      await this.add(files);
      const stagedChanges = await this.getStagedChanges();
      const { additions, deletions } = stagedChanges;
      if (additions.length + deletions.length === 0) {
        this.logger.info('No staged changes to commit');
        return { updated: 0 };
      }
      await this.graphqlService.createSignedCommit({
        context: this.context,
        commit: {
          branch: headRef,
          oid: currentHead,
          additions,
          deletions,
          message
        }
      });
      this.logger.info(`Successfully committed ${files.length} ${word}`);
      return { updated: files.length };
    });
  }

  /**
   * Switches to a different branch
   * 
   * @param {string} branch - Branch name
   * @returns {Promise<string>} - Command output
   */
  async switch(branch) {
    return this.execute(`switch to '${branch}' branch`, async () => {
      return await this.shellService.execute('git', ['switch', branch], { output: true });
    });
  }
}

module.exports = Git;
