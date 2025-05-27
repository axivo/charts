/**
 * Error classes exports
 * 
 * @module utils/errors
 * @author AXIVO
 * @license BSD-3-Clause
 */
const AppError = require('./App');
const FrontpageError = require('./Frontpage');
const ReleaseError = require('./Release');
const ShellError = require('./Shell');
const TemplateError = require('./Template');

module.exports = {
  AppError,
  FrontpageError,
  ReleaseError,
  ShellError,
  TemplateError
};
