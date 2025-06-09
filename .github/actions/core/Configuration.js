/**
 * Configuration management module
 * 
 * @module core/Configuration
 * @author AXIVO
 * @license BSD-3-Clause
 */

/**
 * Helm-defined chart types supported by the repository
 * 
 * @type {Array<string>}
 */
const CHART_TYPES = ['application', 'library'];

/**
 * Configuration management class
 * 
 * Provides object-oriented configuration management with features for
 * dot notation access, environment variables, and validation.
 * 
 * @class Configuration
 */
class Configuration {
  /**
   * Creates a new Configuration instance
   * 
   * @param {Object} settings - Configuration settings object
   */
  constructor(settings) {
    this.cache = new Map();
    this.config = settings;
  }

  /**
   * Gets a configuration value using dot notation
   * 
   * @param {string} path - Dot notation path to configuration value
   * @param {*} fallback - Value to return if path not found
   * @returns {*} - Configuration value or fallback
   */
  get(path, fallback = undefined) {
    if (this.cache.has(path)) {
      return this.cache.get(path);
    }
    const parts = path.split('.');
    let current = this.config;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return fallback;
      }
    }
    this.cache.set(path, current);
    return current;
  }

  /**
   * Gets supported chart types
   * 
   * @returns {Array<string>} Array of chart type names
   */
  getChartTypes() {
    return CHART_TYPES;
  }
}

module.exports = Configuration;
