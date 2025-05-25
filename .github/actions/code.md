# GitHub Actions Codebase Coding Standards

## MANDATORY COMPLIANCE NOTICE

This document defines **STRICT CODING STANDARDS** that must be followed without exception. Any deviation from these standards constitutes a **VIOLATION** and must be corrected immediately.

## CRITICAL IMPLEMENTATION PROTOCOL

When implementing ANY code changes:

1. **EXACT PATTERN MATCHING**: Reproduce existing patterns with zero variation
2. **ZERO ENHANCEMENTS**: No additional features, optimizations, or "improvements"
3. **FUNCTION SIGNATURE MATCHING**: Preserve original parameter names and return types
4. **NO REFACTORING**: Do not reorganize existing code structure
5. **DEPENDENCY MATCHING**: Import only what is used, in the same order as existing code

## PROJECT ARCHITECTURE

### Directory Structure (IMMUTABLE)
```
.github/actions/
├── config/                 # Configuration management
│   ├── index.js            # Singleton configuration instance
│   └── production.js       # Production configuration values
├── core/                   # Base classes and utilities
│   ├── Action.js           # Base Action class with lifecycle hooks
│   ├── Configuration.js    # Configuration management class
│   ├── Logger.js           # Standardized logging class
│   └── index.js            # Core module exports
├── handlers/               # High-level workflow orchestration
│   ├── Chart.js            # Chart update handler
│   ├── Workflow.js         # Common workflow operations
│   ├── index.js            # Handler exports
│   └── release/            # Release-specific handlers
├── services/               # Business logic services
│   ├── chart/              # Chart-specific services
│   ├── github/             # GitHub API services
│   ├── helm/               # Helm tool services
│   ├── release/            # Release management services
│   └── [service files]     # Individual service files
├── templates/              # Handlebars templates
├── utils/                  # Utility classes and functions
│   ├── errors/             # Typed error classes
│   └── [utility files]    # Error handling utilities
└── code.md                 # This coding standards document
```

## STRICT CODING STANDARDS

### 1. FILE STRUCTURE (MANDATORY)

#### Import Order (IMMUTABLE)
```javascript
// 1. Node.js built-in modules
const fs = require('fs/promises');
const path = require('path');

// 2. Third-party modules (alphabetical)
const glob = require('glob');
const yaml = require('js-yaml');

// 3. Internal modules (alphabetical)
const Action = require('../core/Action');
const { SomeError } = require('../utils/errors');
const OtherService = require('./OtherService');
```

#### Class Structure (MANDATORY)
```javascript
class ServiceName extends Action {
  constructor(params) {
    super(params);
    this.serviceA = new ServiceA(params);
    this.serviceB = new ServiceB(params);
  }

  async methodA() {
    // Implementation
  }

  async methodB() {
    // Implementation
  }
}
```

### 2. METHOD IMPLEMENTATION RULES (ABSOLUTE)

#### Method Body Rules (ZERO TOLERANCE)
- **NO comments inside method bodies under any circumstances**
- **NO blank lines inside methods**
- **NO inline require() statements**
- **NO console.log or debugging statements**

#### Method Ordering (MANDATORY)
1. Constructor (always first)
2. execute() method (if present)
3. All other methods in alphabetical order

#### Error Handling Pattern (EXACT)
```javascript
async methodName(param) {
  try {
    return await this.serviceMethod(param);
  } catch (error) {
    throw new ServiceError('operation name', error);
  }
}
```

### 3. SERVICE LAYER PATTERNS (IMMUTABLE)

#### Service Class Pattern (EXACT)
```javascript
class ServiceName extends Action {
  constructor(params) {
    super(params);
    this.dependencyService = new DependencyService(params);
  }

  async execute(operation, action, details) {
    try {
      return await action();
    } catch (error) {
      throw new ServiceError(operation, error, details);
    }
  }

  async primaryMethod(param) {
    return this.execute('operation name', async () => {
      // Implementation logic
    }, { param });
  }
}
```

#### Service Composition (MANDATORY)
- Services are stateless classes with instance methods
- Single responsibility per service
- Throw typed errors with context information
- Use dependency injection via constructor

### 4. ERROR HANDLING STANDARDS (ABSOLUTE)

#### Error Class Usage (EXACT)
```javascript
// Use specific error types
throw new ReleaseError('operation', error, details);
throw new AppError('operation', error, details);
throw new GitError('operation', error);
throw new HelmError('operation', error);
```

#### Error Context Pattern (MANDATORY)
```javascript
this.errorHandler.handle(error, {
  operation: 'specific operation name',
  fatal: false,
  file: filePath,
  line: lineNumber
});
```

### 5. GIT OPERATIONS PATTERN (IMMUTABLE)

#### Signed Commit Pattern (EXACT)
```javascript
// All file update operations MUST use this pattern
const headRef = process.env.GITHUB_HEAD_REF;
const result = await this.gitService.signedCommit(headRef, files, 'commit message');
return { updated: result.updated };
```

#### File Update Pattern (MANDATORY)
```javascript
async updateOperation(items) {
  if (!items || !items.length) return true;
  this.logger.info(`Updating ${items.length} items`);
  const modifiedFiles = [];
  const updatePromises = items.map(async (item) => {
    try {
      // File operations only - NO git operations
      const filePath = path.join(item, 'file.yaml');
      if (await this.fileService.exists(filePath)) {
        // Perform file updates
        modifiedFiles.push(filePath);
      }
      return true;
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: `update ${item}`,
        fatal: false
      });
      return false;
    }
  });
  const results = await Promise.all(updatePromises);
  if (modifiedFiles.length) {
    const headRef = process.env.GITHUB_HEAD_REF;
    await this.gitService.signedCommit(headRef, modifiedFiles, 'commit message');
  }
  return results.every(result => result === true);
}
```

### 6. CONFIGURATION ACCESS (IMMUTABLE)

#### Configuration Pattern (EXACT)
```javascript
// Import singleton instance
const config = require('../config');

// Access with dot notation
const value = this.config.get('repository.chart.type.application');
const defaultValue = this.config.get('missing.path', 'default');
```

### 7. TEMPLATE PROCESSING (MANDATORY)

#### Handlebars Pattern (EXACT)
```javascript
const templateContent = await this.fileService.read(templatePath);
const rendered = this.templateService.render(templateContent, context, { repoUrl });
```

### 8. HANDLER ORCHESTRATION (IMMUTABLE)

#### Handler Pattern (EXACT)
```javascript
class HandlerName extends Action {
  constructor(params) {
    super(params);
    this.serviceA = new ServiceA(params);
    this.serviceB = new ServiceB(params);
  }

  async process() {
    try {
      // Orchestrate service calls
      const result1 = await this.serviceA.method();
      const result2 = await this.serviceB.method();
      return { processed: result1.count, updated: result2.count };
    } catch (error) {
      throw this.errorHandler.handle(error, { operation: 'handler process' });
    }
  }

  async run() {
    return this.process();
  }
}
```

### 9. LOGGING STANDARDS (ABSOLUTE)

#### Logging Pattern (EXACT)
```javascript
this.logger.info('Starting operation...');
this.logger.info(`Processing ${count} items`);
this.logger.info('Operation complete');

// Error logging (non-fatal)
this.errorHandler.handle(error, {
  operation: 'operation name',
  fatal: false
});
```

### 10. RETURN VALUE PATTERNS (IMMUTABLE)

#### Standard Return Patterns (EXACT)
```javascript
// Boolean operations
return true; // or false

// Count operations  
return { processed: 5, updated: 3 };

// File operations
return { updated: fileCount, total: totalCount };

// Service results
return results.every(result => result === true);
```

## ARCHITECTURAL VIOLATIONS (FORBIDDEN)

### NEVER DO (ZERO TOLERANCE)
1. **Import inside methods**: All imports at file top
2. **Multiple service instances**: One instance per constructor
3. **Local git operations**: Use signedCommit() for all file updates
4. **Direct console output**: Use logger service only
5. **Inline error handling**: Use typed errors and errorHandler
6. **Method comments**: No comments inside method bodies
7. **Blank lines in methods**: No blank lines inside methods
8. **Complex conditionals**: Extract to separate methods
9. **String concatenation**: Use template literals or path.join()
10. **Direct API calls**: Use service layer abstractions

### ALWAYS DO (MANDATORY)
1. **Follow existing patterns exactly**
2. **Use established service instances**
3. **Implement alphabetical method ordering**
4. **Use typed errors with context**
5. **Follow single responsibility principle**
6. **Use dependency injection**
7. **Implement proper error handling**
8. **Use logger for all output**
9. **Return consistent data structures**
10. **Follow established naming conventions**

## IMPLEMENTATION VERIFICATION CHECKLIST

Before ANY code change:
- [ ] Imports at file top in correct order
- [ ] Service instances created in constructor
- [ ] Methods in alphabetical order (after constructor)
- [ ] No comments inside method bodies
- [ ] No blank lines inside methods
- [ ] Proper error handling with typed errors
- [ ] Consistent return value patterns
- [ ] Logger used for all output
- [ ] Configuration accessed via singleton
- [ ] File operations use signedCommit pattern

## VIOLATION CONSEQUENCES

Any deviation from these standards will result in:
1. **Immediate correction required**
2. **Code review failure**
3. **Architectural inconsistency**
4. **Potential runtime failures**

## FINAL ENFORCEMENT

This document serves as the **ABSOLUTE AUTHORITY** for all code implementations. No exceptions, no variations, no interpretations. Follow these standards exactly as written.