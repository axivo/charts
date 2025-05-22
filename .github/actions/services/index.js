/**
 * Services module
 * 
 * @module services
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Chart = require('./chart');
const Docs = require('./helm/Docs');
const File = require('./File');
const Git = require('./Git');
const GitHub = require('./github');
const Helm = require('./helm');
const Issue = require('./Issue');
const Label = require('./Label');
const Release = require('./release');
const Shell = require('./Shell');
const Template = require('./Template');

module.exports = {
  Chart,
  Docs,
  File,
  Git,
  GitHub,
  Helm,
  Issue,
  Label,
  Release,
  Shell,
  Template
};
