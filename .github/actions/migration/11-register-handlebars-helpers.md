# Migration: registerHandlebarsHelpers

## Current Implementation

- **Location**: `.github/scripts/utils.js - registerHandlebarsHelpers()`
- **Purpose**: Registers common Handlebars helpers for template rendering
- **Dependencies**: 
  - `Handlebars` npm package
- **Used by**: 
  - `reportWorkflowIssue()` for issue template generation
  - Various release and documentation functions

## Code Analysis

```javascript
function registerHandlebarsHelpers(repoUrl) {
  Handlebars.registerHelper('eq', function (a, b) {
    return a === b;
  });
  Handlebars.registerHelper('RepoRawURL', function () {
    return String(repoUrl).replace('github.com', 'raw.githubusercontent.com');
  });
  return Handlebars;
}
```

The function:
1. Registers a helper for equality comparison (`eq`)
2. Registers a helper to transform GitHub URLs to raw content URLs (`RepoRawURL`)
3. Returns the configured Handlebars instance
4. Is notably the only non-async function in utils.js

## Target Architecture

- **Target Class**: `Template` (in `/services/Template.js`)
- **Target Methods**: `isEqual()`, `setRepoRawUrl()`, `render()`, `get()`
- **New Dependencies**: 
  - Handlebars library
  - Base service class

## Implementation Steps

1. Create the `Template` service with integrated helper registration
2. Move helpers into the Template service constructor
3. Add a render method for template processing
4. Create backward compatibility adapter
5. Test with existing templates
6. Update calling code
7. Remove legacy function

## New Implementation

```javascript
// services/Template.js
const Action = require('../core/Action');
const Handlebars = require('handlebars');
const { TemplateError } = require('../utils/errors');

class Template extends Action {
  constructor(context) {
    super(context);
    this.handlebars = Handlebars.create();
    this.isEqual();
  }

  /**
   * Executes a template operation with error handling
   */
  execute(operation, action) {
    try {
      return action();
    } catch (error) {
      throw new TemplateError(operation, error);
    }
  }

  /**
   * Gets the configured Handlebars instance
   */
  get() {
    return this.handlebars;
  }

  /**
   * Sets up isEqual helper for equality comparison
   */
  isEqual() {
    this.execute('register isEqual helper', () => {
      this.handlebars.registerHelper('isEqual', function (a, b) {
        return a === b;
      });
    });
  }

  /**
   * Sets up RepoRawURL helper for GitHub URL transformations
   */
  setRepoRawUrl(repoUrl) {
    this.execute('set repo raw URL helper', () => {
      this.handlebars.registerHelper('RepoRawURL', function () {
        return String(repoUrl).replace('github.com', 'raw.githubusercontent.com');
      });
    });
  }

  /**
   * Renders a template with provided context
   */
  render(template, context, options = {}) {
    try {
      if (options.repoUrl) {
        this.setRepoRawUrl(options.repoUrl);
      }
      const compiledTemplate = this.compile(template);
      if (!compiledTemplate) {
        throw new Error('Failed to compile template');
      }
      return this.execute('render', () => compiledTemplate(context));
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: 'render template',
        fatal: false
      });
      return null;
    }
  }
}

module.exports = Template;
```

## Backward Compatibility

```javascript
// utils.js (during migration)
const Template = require('./.github/actions/services/Template');

function registerHandlebarsHelpers(repoUrl) {
  const templateService = new Template({});
  templateService.setRepoRawUrl(repoUrl);
  return templateService.get();
}

module.exports = {
  registerHandlebarsHelpers,
  // ... other functions
};
```

## Testing Strategy

1. Create unit tests for the `Template` service
2. Test helper registration (eq, RepoRawURL)
3. Test template rendering with helpers
4. Test URL transformation helper functionality
5. Test equality helper functionality
6. Run integration tests with real templates
7. Test backward compatibility adapter

## Migration Validation

1. Verify helpers are registered correctly
2. Verify existing templates render identically
3. Verify URL transformation works properly
4. Verify equality comparison works in conditionals
5. Verify backward compatibility adapter returns correct instance
6. Test with all existing template files

## Considerations

- The function is unique in being non-async (synchronous)
- It returns a configured Handlebars instance rather than a result
- The Template service can be extended with more helpers in the future
- Repository URL helper is context-specific and registered separately
- The service approach allows for better encapsulation of template logic
