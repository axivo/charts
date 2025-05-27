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

module.exports = {
  AppError,
  FrontpageError,
  ReleaseError
};
