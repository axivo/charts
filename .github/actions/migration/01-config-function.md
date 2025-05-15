# Migration: config()

## 🚫 MANDATORY CODING GUIDELINES

### THESE RULES ARE NON-NEGOTIABLE:
1. **NO EMPTY LINES INSIDE FUNCTIONS**
2. **NO COMMENTS INSIDE FUNCTIONS**
3. **JSDOC ONLY FOR DOCUMENTATION**
4. **NO INLINE COMMENTS IN CODE**
5. **FOLLOW EXISTING PATTERNS**

## Current Implementation

Location: `config.js`

Currently uses a static object with a simple access function:

```javascript
const CONFIG = {
  issue: { ... },
  repository: { ... },
  theme: { ... },
  workflow: { ... }
};

function config(section) {
  if (section && CONFIG[section]) {
    return CONFIG[section];
  }
  return CONFIG;
}
```

## Target Implementation

### Config Class

```javascript
// core/Config.js
export class Config {
  constructor(initialConfig = null) {
    this.config = initialConfig || this.loadDefaultConfig();
    this.cache = new Map();
  }

  loadDefaultConfig() {
    return require('../config/default.js');
  }

  get(path, defaultValue = undefined) {
    // Use cached value if available
    if (this.cache.has(path)) {
      return this.cache.get(path);
    }

    const parts = path.split('.');
    let current = this.config;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return defaultValue;
      }
    }

    // Cache the result
    this.cache.set(path, current);
    return current;
  }

  set(path, value) {
    const parts = path.split('.');
    const lastPart = parts.pop();
    let current = this.config;

    for (const part of parts) {
      if (!(part in current) || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }

    current[lastPart] = value;
    // Clear cache for this path and all parent paths
    this.clearCache(path);
  }

  clearCache(path = null) {
    if (path === null) {
      this.cache.clear();
    } else {
      // Clear this path and all child paths
      const pathPrefix = path + '.';
      for (const [key] of this.cache) {
        if (key === path || key.startsWith(pathPrefix)) {
          this.cache.delete(key);
        }
      }
    }
  }

  merge(additionalConfig) {
    this.config = this.deepMerge(this.config, additionalConfig);
    this.clearCache();
  }

  deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  validate() {
    const required = [
      'repository.user.email',
      'repository.user.name',
      'repository.url',
      'repository.release.template'
    ];

    const errors = [];
    for (const path of required) {
      if (!this.get(path)) {
        errors.push(`Missing required config: ${path}`);
      }
    }

    if (errors.length) {
      throw new ConfigError('Invalid configuration', errors);
    }
  }

  toJSON() {
    return JSON.stringify(this.config, null, 2);
  }
}
```

### ConfigError Class

```javascript
// utils/errors.js
export class ConfigError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = 'ConfigError';
    this.errors = errors;
  }
}
```

## Migration Steps

1. Create `Config` class in `core/Config.js`
2. Move existing CONFIG object to `config/default.js`
3. Create adapter for backward compatibility:

```javascript
// config.js (temporary adapter)
const { Config } = require('./actions/core/Config');
const configInstance = new Config();

function config(section) {
  if (section) {
    return configInstance.get(section);
  }
  return configInstance.config;
}

module.exports = config;
```

4. Gradually update usage patterns:

```javascript
// Before
const templatePath = config('repository').release.template;

// After
const templatePath = config.get('repository.release.template');
```

## Usage Examples

###