# Migration: `_validateIcon()`

## Current Implementation
- **Location**: `.github/scripts/release-local.js` - `_validateIcon()`
- **Purpose**: Validates a chart's icon.png file for proper format and dimensions
- **Dependencies**: `fs/promises`, `path`, `sharp`
- **Used by**: `_validateChart()`

## Code Analysis

The function validates chart icons by:
1. Checking if icon.png exists in the chart directory
2. Verifying the file is a valid PNG format using sharp library
3. Validating the dimensions are exactly 256x256 pixels
4. Providing detailed error messages for various failure modes

Returns a boolean indicating validation success and logs detailed status messages.

## Target Architecture
- **Target Class**: `IconValidator`
- **Target Method**: `validate()`
- **New Dependencies**: 
  - `FileService` (for file operations)
  - `sharp` (for image processing)

## Implementation Steps

### Step 1: Create IconValidator class

```javascript
// utils/IconValidator.js
const path = require('path');
const sharp = require('sharp');

class IconValidator {
  constructor({ fileService }) {
    this.fileService = fileService;
  }
  async validate(chartDir) {
    try {
      console.log(`Validating icon for '${chartDir}' chart...`);
      const iconPath = path.join(chartDir, 'icon.png');
      try {
        await this.fileService.access(iconPath);
      } catch (error) {
        throw new Error(`icon.png not found in '${chartDir}' directory`);
      }
      try {
        const metadata = await sharp(iconPath).metadata();
        if (metadata.width !== 256 || metadata.height !== 256) {
          throw new Error(`Icon in '${chartDir}' has dimensions ${metadata.width}x${metadata.height}px, required size is 256x256px`);
        }
        if (metadata.format !== 'png') {
          throw new Error(`Icon in ${chartDir} is not in PNG format, required format is PNG`);
        }
      } catch (error) {
        if (error.message.includes('Input file is missing')) {
          throw new Error(`Cannot read icon file at ${iconPath}, file may be corrupt`);
        }
        throw error;
      }
      console.log(`Icon validation successful for '${chartDir}' chart`);
      return true;
    } catch (error) {
      console.error(`Failed to validate icon for ${chartDir} chart: ${error.message}`);
      return false;
    }
  }
}

module.exports = IconValidator;
```

### Step 2: Update ChartValidator to use IconValidator

```javascript
// utils/ChartValidator.js
const IconValidator = require('./IconValidator');

class ChartValidator {
  constructor({ exec, fileService }) {
    this.exec = exec;
    this.fileService = fileService;
    this.iconValidator = new IconValidator({ fileService });
  }
  async validateChart(chartDir, tempDir) {
    // ... earlier validation steps
    if (!await this.iconValidator.validate(chartDir)) {
      return false;
    }
    return true;
  }
}
```

### Step 3: Create backward compatibility adapter

```javascript
// release-local.js (temporary adapter during migration)
const IconValidator = require('./.github/actions/utils/IconValidator');
const FileService = require('./.github/actions/services/FileService');

async function _validateIcon({ chartDir }) {
  const fileService = new FileService({});
  const validator = new IconValidator({ fileService });
  return validator.validate(chartDir);
}
```

## Backward Compatibility

The implementation maintains backward compatibility by:
1. Keeping the same function signature
2. Returning the same boolean result
3. Preserving all error messages exactly
4. Maintaining identical console output
5. Using the same sharp library API calls

## Testing Strategy

1. **Unit Testing**:
   - Test with valid 256x256 PNG icon
   - Test with missing icon file
   - Test with wrong dimensions (various sizes)
   - Test with wrong format (JPEG, GIF, etc.)
   - Test with corrupt image file
   - Mock file system and sharp operations

2. **Integration Testing**:
   - Test with real chart directories
   - Test with various image file types
   - Verify sharp library integration
   - Test error message accuracy

3. **Regression Testing**:
   - Compare validation results between implementations
   - Verify identical error messages
   - Check console output matches exactly

## Code Examples

### Before (standalone function)
```javascript
async function _validateIcon({ chartDir }) {
  try {
    console.log(`Validating icon for '${chartDir}' chart...`);
    const iconPath = path.join(chartDir, 'icon.png');
    try {
      await fs.access(iconPath);
    } catch (error) {
      throw new Error(`icon.png not found in '${chartDir}' directory`);
    }
    try {
      const metadata = await sharp(iconPath).metadata();
      if (metadata.width !== 256 || metadata.height !== 256) {
        throw new Error(`Icon in '${chartDir}' has dimensions ${metadata.width}x${metadata.height}px, required size is 256x256px`);
      }
      if (metadata.format !== 'png') {
        throw new Error(`Icon in ${chartDir} is not in PNG format, required format is PNG`);
      }
    } catch (error) {
      if (error.message.includes('Input file is missing')) {
        throw new Error(`Cannot read icon file at ${iconPath}, file may be corrupt`);
      }
      throw error;
    }
    console.log(`Icon validation successful for '${chartDir}' chart`);
    return true;
  } catch (error) {
    console.error(`Failed to validate icon for ${chartDir} chart: ${error.message}`);
    return false;
  }
}
```

### After (class method)
```javascript
class IconValidator {
  async validate(chartDir) {
    try {
      console.log(`Validating icon for '${chartDir}' chart...`);
      const iconPath = path.join(chartDir, 'icon.png');
      try {
        await this.fileService.access(iconPath);
      } catch (error) {
        throw new Error(`icon.png not found in '${chartDir}' directory`);
      }
      try {
        const metadata = await sharp(iconPath).metadata();
        if (metadata.width !== 256 || metadata.height !== 256) {
          throw new Error(`Icon in '${chartDir}' has dimensions ${metadata.width}x${metadata.height}px, required size is 256x256px`);
        }
        if (metadata.format !== 'png') {
          throw new Error(`Icon in ${chartDir} is not in PNG format, required format is PNG`);
        }
      } catch (error) {
        if (error.message.includes('Input file is missing')) {
          throw new Error(`Cannot read icon file at ${iconPath}, file may be corrupt`);
        }
        throw error;
      }
      console.log(`Icon validation successful for '${chartDir}' chart`);
      return true;
    } catch (error) {
      console.error(`Failed to validate icon for ${chartDir} chart: ${error.message}`);
      return false;
    }
  }
}
```

## Migration Considerations

1. **Sharp Dependency**: Requires the sharp library for image processing
2. **Error Hierarchy**: Uses nested try-catch blocks for specific error messages
3. **File Access**: Checks file existence before attempting to read metadata
4. **Dimension Requirements**: Enforces strict 256x256 pixel requirement
5. **Format Validation**: Ensures the file is specifically PNG format
6. **Corrupt File Handling**: Provides specific error for unreadable files
