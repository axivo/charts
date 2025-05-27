/**
 * Shell service for executing shell commands
 * 
 * @class Shell
 * @module services/Shell
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Action = require('../core/Action');

class Shell extends Action {
  /**
   * Creates a new Shell service instance
   * 
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    super(params);
  }

  /**
   * Executes a shell command with error handling
   * 
   * @param {string} command - Command to execute
   * @param {string[]} args - Command arguments
   * @param {Object} options - Execution options
   * @param {boolean} options.silent - Whether to suppress command output (default: true)
   * @param {boolean} options.output - Whether to capture and return command output (default: false)
   * @param {boolean} options.throwOnError - Whether to throw on non-zero exit code (default: true)
   * @param {boolean} options.returnFullResult - Whether to return full result object (default: false)
   * @returns {Promise<string|Object>} - Command output or result object
   */
  async execute(command, args, options = {}) {
    const {
      silent = true,
      output = false,
      throwOnError = true,
      returnFullResult = false,
      ...execOptions
    } = options;
    try {
      if (output) {
        const result = await this.exec.getExecOutput(command, args, {
          silent,
          ...execOptions
        });
        return returnFullResult ? {
          stdout: result.stdout.trim(),
          stderr: result.stderr.trim(),
          exitCode: result.exitCode
        } : result.stdout.trim();
      } else {
        await this.exec.exec(command, args, {
          silent,
          ...execOptions
        });
        return '';
      }
    } catch (error) {
      this.actionError.handle(error, {
        operation: `execute '${command}' command`,
        fatal: throwOnError
      });
      return null;
    }
  }
}

module.exports = Shell;
