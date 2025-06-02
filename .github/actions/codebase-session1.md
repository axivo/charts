# Session 1: Standardization Guidelines & Core Modules

## Method Standardization Guidelines

To ensure consistency across all classes and methods, the following standardization guidelines must be followed:

### 1. Parameter Order Standards

**Context-First Pattern**: All methods that accept a `context` parameter must place it as the first parameter:

```javascript
// ✅ CORRECT - Context first
extractErrorInfo(context, error)
createSignedCommit({ context, commit })
getReleaseIssues({ context, chart, since, issues })

// ❌ INCORRECT - Context not first
extractErrorInfo(error, context)
```

**Options-Last Pattern**: All methods with optional parameters must place `options = {}` as the last parameter:

```javascript
// ✅ CORRECT - Options last
copy(source, destination, options = {})
generateIndex(directory, options = {})
execute(command, args, options = {})

// ❌ INCORRECT - Options not last
copy(options = {}, source, destination)
```

### 2. Constructor Parameter Standards

**Dependency Injection Order**: All service constructors must accept `params` object with standardized service dependencies:

```javascript
// ✅ CORRECT - Standardized params object
constructor(params) {
  super(params);
  this.fileService = new File(params);
  this.gitService = new Git(params);
}

// ❌ INCORRECT - Individual parameters
constructor(file, git, config)
```

### 3. Method Naming Conventions

**Consistent Resource Naming**:
- File operations: Use `file` not `path` or `filename`
- Directory operations: Use `directory` not `dir` or `folder`
- Chart operations: Use `chart` not `chartDir` or `chartPath`

```javascript
// ✅ CORRECT - Consistent naming
read(file, options = {})
createDir(directory, options = {})
validate(chart)

// ❌ INCORRECT - Inconsistent naming
read(path, options = {})
createDir(dir, options = {})
validate(chartPath)
```

### 4. GitHub API Method Standards

**Parameter Object Pattern**: All GitHub API methods must use destructured parameter objects:

```javascript
// ✅ CORRECT - Destructured parameters
createRelease({ context, release })
deleteOciPackage({ context, chart })
getUpdatedFiles({ context })

// ❌ INCORRECT - Individual parameters
createRelease(context, release)
deleteOciPackage(context, chart)
getUpdatedFiles(context)
```

### 5. Error Handling Standards

**Execute Pattern**: All service methods must use the `execute()` pattern for error handling:

```javascript
// ✅ CORRECT - Execute pattern
async methodName(params) {
  return this.execute('operation description', async () => {
    // Method implementation
  });
}

// ❌ INCORRECT - Manual try-catch
async methodName(params) {
  try {
    // Method implementation
  } catch (error) {
    // Manual error handling
  }
}
```

### 6. Return Type Standards

**Consistent Return Types**:
- Boolean operations: Return `true`/`false`
- Count operations: Return `number`
- Data operations: Return `Object` or `Array`
- Void operations: Return `void` (no return statement)

### 7. Method Documentation Standards

**JSDoc Format**: All methods must include complete JSDoc documentation:

```javascript
/**
 * Brief method description
 * 
 * Detailed explanation of functionality and behavior.
 * 
 * @param {Object} context - GitHub Actions context
 * @param {Object} params - Method parameters
 * @param {string} params.name - Parameter description
 * @param {Object} [options={}] - Optional parameters
 * @returns {Promise<boolean>} - Success status
 */
```

## config/ (Configuration Management)

### config/index.js
**Exported Variables**:
- `config` - Singleton Configuration instance created with production settings

### config/production.js  
**Exported Objects**:
- `module.exports` - Complete configuration object with nested settings for:
  - `issue` - GitHub issue and label management settings
  - `repository` - Chart structure, OCI registry, and release settings  
  - `theme` - Jekyll and GitHub Pages configuration
  - `workflow` - Workflow-specific settings and templates

## core/ (Base Classes and Utilities)

### core/Action.js
**Class Methods**:

**`constructor({ core, github, context, exec, config })`** ⚠️ **STANDARDIZATION NEEDED**
- **Issue**: Constructor uses individual destructured parameters instead of params object
- **Current**: `constructor({ core, github, context, exec, config })`
- **Proposed**: `constructor(params)` with `const { core, github, context, exec, config } = params;`
- **Role**: Initializes base Action with dependency injection
- **Functionality**: Sets up logger, error handler, and GitHub Actions context
- **Usage**: Extended by all service classes

**`execute(operation, action, fatal = true)`** ✅ **COMPLIANT**
- **Role**: Executes operations with standardized error handling
- **Functionality**: Wraps operations in try-catch, reports errors with context
- **Returns**: Operation result or null on error
- **Usage**: Used by all services for consistent error handling

**`publish()`** ✅ **COMPLIANT**
- **Role**: Determines deployment mode (local vs publish)
- **Functionality**: Checks repository privacy and deployment configuration
- **Returns**: Boolean indicating publish mode
- **Usage**: Used by handlers to control deployment behavior

### core/Configuration.js
**Class Methods**:

**`constructor(settings)`** ✅ **COMPLIANT**
- **Role**: Creates configuration manager with caching
- **Functionality**: Initializes settings and cache map
- **Usage**: Instantiated as singleton in config/index.js

**`get(path, defaultValue = undefined)`** ✅ **COMPLIANT**
- **Role**: Retrieves configuration values using dot notation
- **Functionality**: Traverses nested objects, caches results
- **Returns**: Configuration value or defaultValue
- **Usage**: Used throughout codebase for configuration access

### core/Error.js  
**Class Methods**:

**`constructor(core, config)`** ⚠️ **STANDARDIZATION NEEDED**
- **Issue**: Constructor uses individual parameters instead of params object
- **Current**: `constructor(core, config)`
- **Proposed**: `constructor(params)` with `const { core, config } = params;`
- **Role**: Creates error reporter with GitHub Actions integration
- **Functionality**: Sets up core API and config references
- **Usage**: Instantiated by Action base class

**`createAnnotation(errorInfo, type)`** ✅ **COMPLIANT**
- **Role**: Creates GitHub file annotations for errors
- **Functionality**: Adds file-specific error annotations to workflow
- **Usage**: Called by report method for file-related errors

**`extractErrorInfo(error, context)`** ⚠️ **STANDARDIZATION NEEDED**
- **Issue**: Parameter order should be context-first
- **Current**: `extractErrorInfo(error, context)`
- **Proposed**: `extractErrorInfo(context, error)`
- **Role**: Extracts detailed error information
- **Functionality**: Formats error with operation context and timestamp
- **Returns**: Structured error information object
- **Usage**: Used by report method to standardize error data

**`report(error, context)`** ⚠️ **STANDARDIZATION NEEDED**
- **Issue**: Parameter order should be context-first
- **Current**: `report(error, context)`
- **Proposed**: `report(context, error)`
- **Role**: Reports errors with annotations and workflow integration
- **Functionality**: Creates annotations, sets workflow status, logs errors
- **Returns**: Formatted error message
- **Usage**: Used by Action.execute for error reporting

**`setHandler()`** ✅ **COMPLIANT**
- **Role**: Sets up global error handlers for uncaught exceptions
- **Functionality**: Handles uncaught exceptions, unhandled rejections, warnings
- **Usage**: Called when debug mode is enabled

### core/Logger.js
**Class Methods**:

**`constructor(core, options = {})`** ⚠️ **STANDARDIZATION NEEDED**
- **Issue**: Constructor uses individual parameters instead of params object
- **Current**: `constructor(core, options = {})`
- **Proposed**: `constructor(params, options = {})` with `const { core } = params;`
- **Role**: Creates structured logger with timing and context support
- **Functionality**: Sets up logging configuration and priorities
- **Usage**: Instantiated by Action base class

**`allowLevel(level)`** ✅ **COMPLIANT**
- **Role**: Determines if log level should be displayed
- **Functionality**: Compares level priority against configured minimum
- **Returns**: Boolean indicating if level is allowed
- **Usage**: Used by logging methods to filter output

**`error(message, meta = {})`** ✅ **COMPLIANT**
- **Role**: Logs error messages with annotations
- **Functionality**: Formats message, creates file annotations if applicable
- **Usage**: Called for error-level logging

**`formatMessage(message, meta)`** ✅ **COMPLIANT**
- **Role**: Formats log messages with metadata
- **Functionality**: Adds context, level, timestamp, component info
- **Returns**: Formatted message string
- **Usage**: Used by all logging methods

**`info(message, meta = {})`** / **`warning(message, meta = {})`** ✅ **COMPLIANT**
- **Role**: Logs info/warning messages
- **Functionality**: Formats message, creates annotations for file-related warnings
- **Usage**: Called for info and warning level logging

### core/index.js
**Exported Classes**: Action, ActionError, Configuration, Logger

## Session 1 Standardization Summary

### ⚠️ **METHODS NEEDING STANDARDIZATION**: 5 methods

1. **core/Action.js#constructor** - Convert to params object pattern
2. **core/Error.js#constructor** - Convert to params object pattern  
3. **core/Error.js#extractErrorInfo** - Fix parameter order (context, error)
4. **core/Error.js#report** - Fix parameter order (context, error)
5. **core/Logger.js#constructor** - Convert to params object pattern

### ✅ **COMPLIANT METHODS**: 8 methods
- All other methods in core modules follow standardization guidelines

### Next Session Preview
Session 2 will cover handlers/ modules and basic services (File, Frontpage, Git, Issue, Label) with their standardization analysis.
