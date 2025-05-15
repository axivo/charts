# Migration: handleError()

## 🚫 MANDATORY CODING GUIDELINES

### THESE RULES ARE NON-NEGOTIABLE:
1. **NO EMPTY LINES INSIDE FUNCTIONS**
2. **NO COMMENTS INSIDE FUNCTIONS**
3. **JSDOC ONLY FOR DOCUMENTATION**
4. **NO INLINE COMMENTS IN CODE**
5. **FOLLOW EXISTING PATTERNS**

## Current Implementation

Location: `utils.js - handleError()`

```javascript
function handleError(error, core, operation, fatal = true) {
  const errorMessage = `Failed to ${operation}: ${error.message}`;
  if (fatal) {
    core.setFailed(errorMessage);
    throw new Error(errorMessage);
  } else {
    core.warning(errorMessage);
  }
}
```

## Target Implementation

### ErrorHandler Class

```javascript
// core/ErrorHandler.js
export class ErrorHandler {
  constructor(logger) {
    this.logger = logger;
  }

  handle(error, context) {
    const errorInfo = this.extractErrorInfo(error, context);
    
    if (context.fatal ?? true) {
      this.logger.setFailed(errorInfo.message);
      throw new AppError(errorInfo);
    } else {
      this.logger.warning(errorInfo.message);
    }
  }

  extractErrorInfo(error, context) {
    return {
      message: `Failed to ${context.operation}: ${error.message}`,
      operation: context.operation,
      originalError: error,
      stack: error.stack,
      timestamp: new Date().toISOString()
    };
  }
}
```

### Custom Error Classes

```javascript
// utils/errors.js
export class AppError extends Error {
  constructor(info) {
    super(info.message);
    this.name = 'AppError';
    this.operation = info.operation;
    this.originalError = info.originalError;
    this.timestamp = info.timestamp;
  }
}

export class GitError extends AppError {
  constructor(operation, originalError) {
    super({
      message: `Git operation failed: ${operation}`,
      operation,
      originalError
    });
    this.name = 'GitError';
  }
}

export class GitHubApiError extends AppError {
  constructor(operation, originalError, statusCode) {
    super({
      message: `GitHub API failed: ${operation}`,
      operation,
      originalError
    });
    this.name = 'GitHubApiError';
    this.statusCode = statusCode;
  }
}
```

## Migration Steps

1. Create `ErrorHandler` class in `core/ErrorHandler.js`
2. Create custom error classes in `utils/errors.js`
3. Create adapter function for backward compatibility:

```javascript
// utils.js (temporary adapter)
const errorHandler = new ErrorHandler(core);

function handleError(error, core, operation, fatal = true) {
  return errorHandler.handle(error, { operation, fatal });
}
```

4. Update each function to use new error handling:

```javascript
// Before
try {
  // operation
} catch (error) {
  utils.handleError(error, core, 'update charts', false);
}

// After
try {
  // operation
} catch (error) {
  this.errorHandler.handle(error, {
    operation: 'update charts',
    fatal: false
  });
}
```

## Benefits

1. **Centralized Error Management**: All error handling logic in one place
2. **Better Error Context**: Rich error objects with more information
3. **Type-Safe Errors**: Specific error classes for different scenarios
4. **Testability**: Easy to mock and test error handling
5. **Extensibility**: Easy to add new error types and handling strategies

## Testing

```javascript
// tests/core/ErrorHandler.test.js
describe('ErrorHandler', () => {
  it('should throw AppError for fatal errors', () => {
    const mockLogger = { setFailed: jest.fn() };
    const handler = new ErrorHandler(mockLogger);
    
    expect(() => {
      handler.handle(new Error('test'), {
        operation: 'test operation',
        fatal: true
      });
    }).toThrow(AppError);
  });

  it('should log warning for non-fatal errors', () => {
    const mockLogger = { warning: jest.fn() };
    const handler = new ErrorHandler(mockLogger);
    
    handler.handle(new Error('test'), {
      operation: 'test operation',
      fatal: false
    });
    
    expect(mockLogger.warning).toHaveBeenCalled();
  });
});
```

## Rollback Plan

If issues arise:
1. Keep the adapter function in place
2. Revert individual function changes
3. Monitor error reporting
4. Fix issues before continuing migration
