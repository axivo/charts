/**
 * Error classes exports
 * 
 * @module utils/errors
 * @author AXIVO
 * @license BSD-3-Clause
 */
const AppError = require('./App');
const GitError = require('./Git');
const GitHubApiError = require('./GitHubApi');
const FileError = require('./File');
const HelmError = require('./Helm');
const IssueError = require('./Issue');
const ReleaseError = require('./Release');
const ShellError = require('./Shell');
const TemplateError = require('./Template');

module.exports = {
  AppError,
  GitError,
  GitHubApiError,
  FileError,
  HelmError,
  IssueError,
  ReleaseError,
  ShellError,
  TemplateError
};
