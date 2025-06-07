/**
 * Logging class for standardized log management
 * 
 * Provides structured logging, timing information, and log levels for
 * consistent output across GitHub Actions.
 * 
 * @class Logger
 * @module core
 * @author AXIVO
 * @license BSD-3-Clause
 */
class Logger {
  /**
   * Creates a new Logger instance
   * 
   * @param {Object} core - GitHub Actions Core API for logging
   * @param {Object} options - Logger configuration options
   * @param {String} options.context - Context identifier for log entries
   * @param {Boolean} options.timestamp - Whether to include timestamps
   * @param {String} options.level - Minimum log level ('debug'|'info'|'warning'|'error')
   */
  constructor(params, options = {}) {
    const { core } = params;
    this.core = core;
    this.context = options.context || 'action';
    this.level = options.level || 'info';
    this.levelPriority = { debug: 0, info: 1, warning: 2, error: 3 };
    this.timestamp = options.timestamp === true;
  }

  /**
   * Determines if a log level should be displayed
   * 
   * @private
   * @param {String} level - The log level to check
   * @returns {Boolean} Whether the log level should be displayed
   */
  #allow(level) {
    return this.levelPriority[level] >= this.levelPriority[this.level];
  }

  /**
   * Formats a log message with metadata
   * 
   * @private
   * @param {String} message - The message to format
   * @param {Object} meta - Additional metadata
   * @returns {String} The formatted message
   */
  #format(message, meta = {}) {
    const parts = [`[${this.context}]`];
    if (meta.level && meta.level !== 'info') parts.push(`[${meta.level.toUpperCase()}]`);
    if (meta.timestamp) parts.push(`[${new Date().toISOString()}]`);
    if (meta.component) parts.push(`[${meta.component}]`);
    return `${parts.join('')} ${message}`;
  }

  /**
   * Logs a debug message
   * 
   * @param {String} message - The message to log
   * @param {Object} meta - Additional metadata
   */
  debug(message, meta = {}) {
    if (!this.#allow('debug')) return;
    const logMeta = { level: 'debug', timestamp: true, ...meta };
    this.core.info(this.#format(message, logMeta));
  }

  /**
   * Logs an error message
   * 
   * @param {String} message - The message to log
   * @param {Object} meta - Additional metadata
   */
  error(message, meta = {}) {
    if (!this.#allow('error')) return;
    const logMeta = { level: 'error', ...meta };
    const formattedMessage = this.#format(message, logMeta);
    if (meta.file) {
      const params = {
        file: meta.file,
        startLine: meta.line || 1,
        startColumn: meta.col || 1,
        title: meta.title || 'Error',
        message: formattedMessage
      };
      this.core.error(formattedMessage, params);
    } else {
      this.core.error(formattedMessage);
    }
  }

  /**
   * Logs an info message
   * 
   * @param {String} message - The message to log
   * @param {Object} meta - Additional metadata
   */
  info(message, meta = {}) {
    if (!this.#allow('info')) return;
    const logMeta = { level: 'info', ...meta };
    this.core.info(this.#format(message, logMeta));
  }

  /**
   * Logs a warning message
   * 
   * @param {String} message - The message to log
   * @param {Object} meta - Additional metadata
   */
  warning(message, meta = {}) {
    if (!this.#allow('warning')) return;
    const logMeta = { level: 'warning', ...meta };
    const formattedMessage = this.#format(message, logMeta);
    if (meta.file) {
      const params = {
        file: meta.file,
        startLine: meta.line || 1,
        startColumn: meta.col || 1,
        title: meta.title || 'Warning',
        message: formattedMessage
      };
      this.core.warning(formattedMessage, params);
    } else {
      this.core.warning(formattedMessage);
    }
  }
}

module.exports = Logger;
