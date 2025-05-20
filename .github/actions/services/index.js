/**
 * Services module
 * 
 * @module services
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Chart = require('./chart');
const File = require('./File');
const Git = require('./Git');
const GitHub = require('./github');
const Helm = require('./Helm');
const Release = require('./release');
const Shell = require('./Shell');
const Template = require('./Template');

module.exports = {
  Chart,
  File,
  Git,
  GitHub,
  Helm,
  Release,
  Shell,
  Template
};
