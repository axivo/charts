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
- **Target Method**: `registerHelpers()` and integrated into constructor
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
const Service = require('../core/Service');
const Handlebars = require('handlebars');

class Template extends Service {
  constructor(context) {
    super(context);
    this.handlebars = Handlebars.create();
    this.registerHelpers();
  }

  /**
   * Register common Handlebars helpers
   * @private
   */
  registerHelpers() {
    this.handlebars.registerHelper('eq', function (a, b) {
      return a === b;
    });
  }

  /**
   * Register repository-specific helpers
   * @param {string} repoUrl - Repository URL for URL transformations
   */
  registerRepoHelpers(repoUrl) {
    this.handlebars.registerHelper('RepoRawURL', function () {
      return String(repoUrl).replace('github.com', 'raw.githubusercontent.com');
    });
  }

  /**
   * Render a template with provided context
   * @param {string} template - Template string to render
   * @param {Object} context - Data context for the template
   * @param {Object} [options] - Additional options
   * @param {string} [options.repoUrl] - Repository URL for repo-specific helpers
   * @returns {string} Rendered template output
   */
  render(template, context, options = {}) {
    if (options.repoUrl) {
      this.registerRepoHelpers(options.repoUrl);
    }
    const compiledTemplate = this.handlebars.compile(template);
    return compiledTemplate(context);
  }

  /**
   * Get the configured Handlebars instance
   * @returns {Object} Configured Handlebars instance
   */
  getHandlebars() {
    return this.handlebars;
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
  templateService.registerRepoHelpers(repoUrl);
  return templateService.getHandlebars();
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
