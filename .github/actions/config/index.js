/**
 * Configuration module
 * 
 * Provides a centralized, pre-configured instance of the Configuration class
 * that can be imported and used throughout the application.
 * 
 * @module config
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Configuration = require('../core/Configuration');
const productionConfig = require('./production');

/**
 * Singleton configuration instance
 */
const config = new Configuration(productionConfig);

module.exports = config;
