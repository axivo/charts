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
   * @param {Boolean} options.timestamps - Whether to include timestamps
   * @param {String} options.level - Minimum log level ('debug'|'info'|'warning'|'error')
   */
  constructor(core, options = {}) {
    this.core = core;
    this.context = options.context || 'action';
    this.timestamps = options.timestamps !== false;
    this.level = options.level || 'info';
    this.startTime = process.hrtime();
    this.levelPriority = { debug: 0, info: 1, warning: 2, error: 3 };
  }

  /**
   * Determines if a log level should be displayed
   * 
   * @param {String} level - The log level to check
   * @returns {Boolean} Whether the log level should be displayed
   */
  allowLevel(level) {
    return this.levelPriority[level] >= this.levelPriority[this.level];
  }

  /**
   * Logs a debug message
   * 
   * @param {String} message - The message to log
   * @param {Object} meta - Additional metadata
   */
  debug(message, meta = {}) {
    if (!this.allowLevel('debug')) return;
    this.log(message, { level: 'debug', ...meta });
  }

  /**
   * Logs an error message
   * 
   * @param {String} message - The message to log
   * @param {Object} meta - Additional metadata
   */
  error(message, meta = {}) {
    if (!this.allowLevel('error')) return;
    const logMeta = { level: 'error', ...meta };
    const formattedMessage = this.formatMessage(message, logMeta);
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
   * Formats a log message with metadata
   * 
   * @param {String} message - The message to format
   * @param {Object} meta - Additional metadata
   * @returns {String} The formatted message
   */
  formatMessage(message, meta) {
    const parts = [`[${this.context}]`];
    if (meta.level && meta.level !== 'info') {
      parts.push(`[${meta.level.toUpperCase()}]`);
    }
    if (this.timestamps) {
      parts.push(`[${new Date().toISOString()}]`);
    }
    if (meta.component) {
      parts.push(`[${meta.component}]`);
    }
    if (meta.elapsed) {
      const elapsed = this.getElapsedTime();
      parts.push(`[${elapsed}ms]`);
    }
    return `${parts.join(' ')} ${message}`;
  }

  /**
   * Gets the elapsed time since logger creation
   * 
   * @returns {Number} Elapsed time in milliseconds
   */
  getElapsedTime() {
    const hrtime = process.hrtime(this.startTime);
    return Math.round(hrtime[0] * 1000 + hrtime[1] / 1000000);
  }

  /**
   * Groups log messages together
   * 
   * @param {String} name - The group name
   * @param {Function} callback - The function to execute within the group
   */
  group(name, callback) {
    this.core.startGroup(name);
    try {
      callback();
    } finally {
      this.core.endGroup();
    }
  }

  /**
   * Logs an info message
   * 
   * @param {String} message - The message to log
   * @param {Object} meta - Additional metadata
   */
  info(message, meta = {}) {
    if (!this.allowLevel('info')) return;
    const logMeta = { level: 'info', ...meta };
    this.core.info(this.formatMessage(message, logMeta));
  }

  /**
   * Logs a message with arbitrary level
   * 
   * @param {String} message - The message to log
   * @param {Object} meta - Additional metadata
   */
  log(message, meta = {}) {
    const level = meta.level || 'info';
    switch (level) {
      case 'debug':
        if (process.env.ACTIONS_RUNNER_DEBUG) {
          this.core.debug(this.formatMessage(message, meta));
        }
        break;
      case 'info':
        this.info(message, meta);
        break;
      case 'warning':
        this.warning(message, meta);
        break;
      case 'error':
        this.error(message, meta);
        break;
    }
  }

  /**
   * Sets the minimum log level
   * 
   * @param {String} level - The log level to set ('debug'|'info'|'warning'|'error')
   */
  setLevel(level) {
    if (this.levelPriority[level] !== undefined) {
      this.level = level;
    }
  }

  /**
   * Starts a timer for performance measurement
   * 
   * @param {String} label - Label for the timer
   * @returns {Function} Function to stop the timer and log elapsed time
   */
  startTimer(label) {
    const start = process.hrtime();
    return () => {
      const hrtime = process.hrtime(start);
      const elapsed = Math.round(hrtime[0] * 1000 + hrtime[1] / 1000000);
      this.info(`${label}: ${elapsed}ms`, { component: 'timer' });
      return elapsed;
    };
  }

  /**
   * Logs a warning message
   * 
   * @param {String} message - The message to log
   * @param {Object} meta - Additional metadata
   */
  warning(message, meta = {}) {
    if (!this.allowLevel('warning')) return;
    const logMeta = { level: 'warning', ...meta };
    const formattedMessage = this.formatMessage(message, logMeta);
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
