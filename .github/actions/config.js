/**
 * Configuration singleton
 * 
 * Provides a centralized, pre-configured instance of the Configuration class
 * that can be imported and used throughout the application.
 */
const Configuration = require('./core/Configuration');

/**
 * Singleton configuration instance
 */
const config = new Configuration();

module.exports = config;
