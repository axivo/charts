/**
 * Handlers module
 * 
 * @module handlers
 * @author AXIVO
 * @license BSD-3-Clause
 */
const ChartHandler = require('./Chart');
const ReleaseHandler = require('./release');
const WorkflowHandler = require('./Workflow');

module.exports = {
  Chart: ChartHandler,
  Release: ReleaseHandler,
  Workflow: WorkflowHandler
};
