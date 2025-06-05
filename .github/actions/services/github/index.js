/**
 * GitHub API services module
 * 
 * This module exports GitHub API services to simplify imports.
 * 
 * @module services/github
 * @author AXIVO
 * @license BSD-3-Clause
 */
const ApiService = require('./Api');
const GraphQLService = require('./GraphQL');
const RestService = require('./Rest');

module.exports = {
  Api: ApiService,
  GraphQL: GraphQLService,
  Rest: RestService
};
