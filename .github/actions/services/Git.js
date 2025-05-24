/**
 * Git service for managing git operations
 * 
 * @class Git
 * @module services/Git
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Action = require('../core/Action');
const { GitError } = require('../utils/errors');
const Shell = require('./Shell');

class Git extends Action {
  /**
   * Creates a new Git service instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
    this.shellService = new Shell(params);
  }

  /**
   * Adds files to git staging area
   * 
   * @param {string[]} files - Array of file paths to add
   * @returns {Promise<string>} - Command output
   */
  async add(files) {
    if (!files || !files.length) return '';
    return this.execute(['add', ...files]);
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
    const args = ['commit', '-m', message];
    if (options.signoff) args.push('--signoff');
    if (options.noVerify) args.push('--no-verify');
    return this.execute(args);
  }

  /**
   * Configures git repository with user identity
   * 
   * @returns {Promise<void>}
   */
  async configure() {
    try {
      const userEmail = this.config.get('repository.user.email');
      const userName = this.config.get('repository.user.name');
      await this.execute(['config', 'user.email', userEmail]);
      await this.execute(['config', 'user.name', userName]);
      this.logger.info('Git repository configured successfully');
    } catch (error) {
      this.errorHandler.handle(error, { operation: 'configure git repository' });
    }
  }

  /**
   * Executes a git command
   * 
   * @param {string[]} args - Command arguments
   * @param {Object} options - Execution options
   * @param {boolean} options.silent - Whether to suppress command output
   * @returns {Promise<string>} - Command output
   */
  async execute(args, options = {}) {
    try {
      return await this.shellService.execute('git', args, options);
    } catch (error) {
      throw new GitError(`git ${args[0]}`, error);
    }
  }

  /**
   * Fetches from a remote
   * 
   * @param {string} remote - Remote name
   * @param {string} [ref] - Specific ref to fetch
   * @returns {Promise<string>} - Command output
   */
  async fetch(remote = 'origin', ref) {
    const args = ['fetch', remote];
    if (ref) args.push(ref);
    return this.execute(args);
  }

  /**
   * Gets the current branch name
   * 
   * @returns {Promise<string>} - Current branch name
   */
  async getCurrentBranch() {
    return this.execute(['rev-parse', '--abbrev-ref', 'HEAD']);
  }

  /**
   * Gets changes between working tree and reference
   * 
   * @param {string} [ref] - Reference to compare against working tree
   * @returns {Promise<Object>} - Object with files property containing array of changed files
   */
  async getChanges(ref) {
    const args = ['diff', '--name-only'];
    if (ref) args.push(ref);
    const result = await this.execute(args);
    return {
      files: result ? result.split('\n').filter(Boolean) : []
    };
  }

  /**
   * Gets the revision hash for a reference
   * 
   * @param {string} [ref='HEAD'] - Git reference
   * @returns {Promise<string>} - Revision hash
   */
  async getRevision(ref = 'HEAD') {
    return this.execute(['rev-parse', ref]);
  }

  /**
   * Gets staged changes from git
   * 
   * @returns {Promise<Object>} - Object with additions and deletions arrays
   */
  async getStagedChanges() {
    const additions = await this.execute([
      'diff', '--staged', '--name-status', '--diff-filter=ACMRT'
    ]);
    const deletions = await this.execute([
      'diff', '--staged', '--name-status', '--diff-filter=D'
    ]);
    return {
      additions: this.parseGitStatus(additions),
      deletions: this.parseGitStatus(deletions)
    };
  }

  /**
   * Gets the git status
   * 
   * @returns {Promise<Object>} - Git status information
   */
  async getStatus() {
    const result = await this.execute(['status', '--porcelain']);
    const modified = [];
    const untracked = [];
    const staged = [];
    if (result) {
      result.split('\n').forEach(line => {
        if (!line) return;
        const status = line.substring(0, 2);
        const file = line.substring(3);
        if (status.includes('M')) modified.push(file);
        if (status.includes('?')) untracked.push(file);
        if (status.includes('A') || status.includes('R') || status.includes('C')) staged.push(file);
      });
    }
    return { modified, untracked, staged };
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
    const targetBranch = branch || await this.getCurrentBranch();
    this.logger.info(`Pulling latest changes from ${remote}/${targetBranch}`);
    return this.execute(['pull', remote, targetBranch]);
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
    const targetBranch = branch || await this.getCurrentBranch();
    const args = ['push', remote, targetBranch];
    if (options.force) args.push('--force');
    return this.execute(args);
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
    try {
      const headRef = branch || process.env.GITHUB_HEAD_REF;
      const currentHead = await this.getRevision('HEAD');
      await this.fetch('origin', headRef);
      await this.switch(headRef);
      await this.add(files);
      const stagedChanges = await this.getStagedChanges();
      const { additions, deletions } = stagedChanges;
      if (additions.length + deletions.length === 0) {
        this.logger.info('No changes to commit');
        return { updated: 0 };
      }
      const GitHub = require('./github');
      const graphqlService = new GitHub.GraphQL({
        github: this.github,
        context: this.context,
        core: this.core,
        exec: this.exec,
        config: this.config
      });
      await graphqlService.createSignedCommit({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        branchName: headRef,
        expectedHeadOid: currentHead,
        additions,
        deletions,
        commitMessage: message
      });
      this.logger.info(`Successfully committed ${files.length} files`);
      return { updated: files.length };
    } catch (error) {
      throw new GitError('create signed commit', error);
    }
  }

  /**
   * Switches to a different branch
   * 
   * @param {string} branch - Branch name
   * @returns {Promise<string>} - Command output
   */
  async switch(branch) {
    return this.execute(['switch', branch]);
  }
}

module.exports = Git;
