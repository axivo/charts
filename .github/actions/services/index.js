/**
 * Services module
 * 
 * @module services
 * @author AXIVO
 * @license BSD-3-Clause
 */
const ChartService = require('./chart');
const DocsService = require('./helm/Docs');
const FileService = require('./File');
const GitService = require('./Git');
const GitHubService = require('./github');
const HelmService = require('./helm');
const IssueService = require('./Issue');
const LabelService = require('./Label');
const ReleaseService = require('./release');
const ShellService = require('./Shell');
const TemplateService = require('./Template');

module.exports = {
  Chart: ChartService,
  Docs: DocsService,
  File: FileService,
  Git: GitService,
  GitHub: GitHubService,
  Helm: HelmService,
  Issue: IssueService,
  Label: LabelService,
  Release: ReleaseService,
  Shell: ShellService,
  Template: TemplateService
};
