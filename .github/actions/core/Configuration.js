/**
 * Configuration management class
 * 
 * Provides object-oriented configuration management with features for
 * dot notation access, environment variables, and validation.
 * 
 * @class Configuration
 * @module core
 * @author AXIVO
 * @license BSD-3-Clause
 */
class Configuration {
  /**
   * Creates a new Configuration instance
   * 
   * @param {Object} initialConfig - Initial configuration object
   */
  constructor(initialConfig) {
    this.config = initialConfig;
    this.cache = new Map();
  }

  /**
   * Clears the configuration cache
   * 
   * @param {string|null} path - Path to clear or null for all cache
   */
  clearCache(path = null) {
    if (path === null) {
      this.cache.clear();
      return;
    }
    const pathPrefix = `${path}.`;
    for (const [key] of this.cache) {
      if (key === path || key.startsWith(pathPrefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Gets a configuration value using dot notation
   * 
   * @param {string} path - Dot notation path to configuration value
   * @param {*} defaultValue - Value to return if path not found
   * @returns {*} - Configuration value or defaultValue
   */
  get(path, defaultValue = undefined) {
    if (this.cache.has(path)) {
      return this.cache.get(path);
    }
    const parts = path.split('.');
    let current = this.config;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return defaultValue;
      }
    }
    this.cache.set(path, current);
    return current;
  }

  /**
   * Sets a configuration value using dot notation
   * 
   * @param {string} path - Dot notation path to set
   * @param {*} value - Value to set
   */
  set(path, value) {
    const parts = path.split('.');
    const lastPart = parts.pop();
    let current = this.config;
    for (const part of parts) {
      if (!(part in current) || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }
    current[lastPart] = value;
    this.clearCache(path);
  }

  /**
   * Validates the configuration
   * 
   * @throws {Error} If configuration is invalid
   */
  validate() {
    const required = [
      'repository.user.email',
      'repository.user.name',
      'repository.url',
      'repository.release.template'
    ];
    const errors = [];
    for (const path of required) {
      if (!this.get(path)) {
        errors.push(`Missing required config: ${path}`);
      }
    }
    if (errors.length) {
      throw new Error(`Invalid configuration: ${errors.join(', ')}`);
    }
  }
}

module.exports = Configuration;
