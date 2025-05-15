# Migration: installHelmDocs

## Current Implementation
- Location: [update-docs.js - installHelmDocs()](https://github.com/fluxcd/charts/blob/main/.github/scripts/update-docs.js#L14-L45)
- Purpose: Downloads and installs helm-docs binary for documentation generation
- Dependencies: exec, fs, path modules
- Used by: Documentation update workflows

## Code Analysis
The function downloads the helm-docs binary from GitHub releases, validates the checksum, extracts the binary, and makes it executable. It handles platform-specific downloads and installation.

### Current Logic Flow
1. Determines platform and architecture
2. Downloads helm-docs release archive
3. Validates SHA256 checksum
4. Extracts binary from archive
5. Sets executable permissions

## Target Architecture
- Target Class: DocumentationService
- Target Method: installHelmDocs
- New Dependencies: Base Service class, Error handler, Logger, FileService, HttpClient

## Implementation Steps
1. Create installHelmDocs method in DocumentationService
2. Extract download logic to HttpClient service
3. Add version management and caching
4. Implement checksum validation
5. Create backward compatibility wrapper
6. Test on multiple platforms

## Backward Compatibility
```javascript
// update-docs.js
const DocumentationService = require('./.github/actions/services/Documentation');
let docService;

async function installHelmDocs({ exec, core }) {
  if (!docService) {
    docService = new DocumentationService({ exec, core });
  }
  return docService.installHelmDocs();
}

module.exports = {
  installHelmDocs,
  // other functions...
};
```

## Testing Strategy
1. Unit test platform detection
2. Mock HTTP downloads
3. Test checksum validation
4. Verify binary extraction
5. Test permission setting

## Code Examples

### Before (Legacy Implementation)
```javascript
const installHelmDocs = async ({ exec, core }) => {
  const version = 'v1.13.1';
  const platform = process.platform === 'darwin' ? 'Darwin' : 'Linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64';
  
  const url = `https://github.com/norwoodj/helm-docs/releases/download/${version}/helm-docs_${version.slice(1)}_${platform}_${arch}.tar.gz`;
  const checksumUrl = `https://github.com/norwoodj/helm-docs/releases/download/${version}/helm-docs_${version.slice(1)}_checksums.txt`;
  
  core.info('Downloading helm-docs...');
  await exec.exec('curl', ['-L', '-o', '/tmp/helm-docs.tar.gz', url]);
  await exec.exec('curl', ['-L', '-o', '/tmp/checksums.txt', checksumUrl]);
  
  core.info('Verifying checksum...');
  const checksum = await exec.getExecOutput('grep', [`helm-docs_${version.slice(1)}_${platform}_${arch}.tar.gz`, '/tmp/checksums.txt']);
  await exec.exec('bash', ['-c', `echo "${checksum.stdout.split(' ')[0]}  /tmp/helm-docs.tar.gz" | sha256sum -c`]);
  
  core.info('Extracting helm-docs...');
  await exec.exec('tar', ['-xzf', '/tmp/helm-docs.tar.gz', '-C', '/tmp']);
  await exec.exec('chmod', ['+x', '/tmp/helm-docs']);
  
  core.info('helm-docs installed successfully');
};
```

### After (New Implementation)
```javascript
const BaseService = require('../core/Service');
const path = require('path');

class DocumentationService extends BaseService {
  constructor(context) {
    super(context);
    this.HELM_DOCS_VERSION = 'v1.13.1';
    this.INSTALL_PATH = '/tmp/helm-docs';
  }

  /**
   * Installs helm-docs binary for documentation generation
   * 
   * @returns {Promise<string>} Path to installed binary
   */
  async installHelmDocs() {
    try {
      const platform = this.getPlatform();
      const arch = this.getArchitecture();
      const version = this.HELM_DOCS_VERSION;
      const versionNumber = version.slice(1);
      this.logger.info(`Installing helm-docs ${version} for ${platform}/${arch}`);
      const filename = `helm-docs_${versionNumber}_${platform}_${arch}.tar.gz`;
      const url = `https://github.com/norwoodj/helm-docs/releases/download/${version}/${filename}`;
      const checksumUrl = `https://github.com/norwoodj/helm-docs/releases/download/${version}/helm-docs_${versionNumber}_checksums.txt`;
      const archivePath = '/tmp/helm-docs.tar.gz';
      const checksumPath = '/tmp/checksums.txt';
      await this.httpClient.download(url, archivePath);
      await this.httpClient.download(checksumUrl, checksumPath);
      await this.validateChecksum(archivePath, checksumPath, filename);
      await this.extractBinary(archivePath);
      await this.setExecutable(this.INSTALL_PATH);
      this.logger.info('helm-docs installed successfully');
      return this.INSTALL_PATH;
    } catch (error) {
      throw this.errorHandler.handle(error, {
        operation: 'install helm-docs'
      });
    }
  }

  getPlatform() {
    return process.platform === 'darwin' ? 'Darwin' : 'Linux';
  }

  getArchitecture() {
    return process.arch === 'arm64' ? 'arm64' : 'x86_64';
  }

  async validateChecksum(archivePath, checksumPath, filename) {
    const { stdout } = await this.exec.getExecOutput('grep', [filename, checksumPath]);
    const expectedChecksum = stdout.split(' ')[0];
    await this.exec.exec('bash', ['-c', `echo "${expectedChecksum}  ${archivePath}" | sha256sum -c`]);
  }

  async extractBinary(archivePath) {
    await this.exec.exec('tar', ['-xzf', archivePath, '-C', path.dirname(this.INSTALL_PATH)]);
  }

  async setExecutable(binaryPath) {
    await this.exec.exec('chmod', ['+x', binaryPath]);
  }
}

module.exports = DocumentationService;
```

### Usage Example
```javascript
const DocumentationService = require('./services/Documentation');

async function example(context) {
  const docService = new DocumentationService(context);
  const binaryPath = await docService.installHelmDocs();
  context.core.info(`helm-docs installed at: ${binaryPath}`);
  await context.exec.exec(binaryPath, ['--version']);
}
```

## Migration Impact
- Better separation of concerns
- Platform detection abstracted
- Improved error handling
- Version management centralized

## Success Criteria
- [ ] Binary downloads correctly on all platforms
- [ ] Checksum validation works properly
- [ ] Binary is executable after installation
- [ ] All existing workflows continue to work
- [ ] New implementation has comprehensive tests
- [ ] Documentation is updated
