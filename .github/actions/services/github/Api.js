/**
 * Base GitHub API service
 * 
 * @module services/github/Api
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Action = require('../../core/Action');

/**
 * Base GitHub API service
 * 
 * Provides base functionality for GitHub API services including
 * data transformation utilities.
 * 
 * @class ApiService
 */
class ApiService extends Action {
  /**
   * Transforms raw data using the provided transformer function
   * 
   * @param {Array<Object>} data - Raw data to transform
   * @param {Function} transformer - Function to transform each item
   * @returns {Array<Object>} Transformed data
   */
  transform(data, transformer) {
    return data.map(transformer);
  }
}

module.exports = ApiService;
