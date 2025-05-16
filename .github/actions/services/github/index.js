/**
 * GitHub API services module
 * 
 * This module exports GitHub API services to simplify imports.
 * 
 * @module services/github
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Api = require('./Api');
const GraphQL = require('./GraphQL');
const Rest = require('./Rest');

module.exports = {
  Api,
  GraphQL,
  Rest
};
