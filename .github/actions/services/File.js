/**
 * File service for file system operations
 * 
 * @class File
 * @module services/File
 * @author AXIVO
 * @license BSD-3-Clause
 */
const fs = require('fs/promises');
const path = require('path');
const glob = require('glob');
const yaml = require('js-yaml');
const Action = require('../core/Action');
const { AppError } = require('../utils/errors');

class File extends Action {
  /**
   * Copies a file from source to destination
   * 
   * @param {string} source - Source file path
   * @param {string} destination - Destination file path
   * @param {Object} options - Copy options
   * @param {boolean} options.overwrite - Whether to overwrite existing files
   * @returns {Promise<void>}
   */
  async copy(source, destination, options = {}) {
    try {
      await this.createDir(path.dirname(destination), { silent: true });
      if (!options.overwrite && await this.exists(destination)) {
        throw new Error(`File already exists: ${destination}`);
      }
      await fs.copyFile(source, destination);
      this.logger.info(`Copied ${source} to ${destination}`);
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: `copy file from ${source} to ${destination}`,
        file: source
      });
    }
  }

  /**
   * Creates a directory
   * 
   * @param {string} dirPath - Directory path to create
   * @param {Object} options - Directory creation options
   * @param {boolean} options.recursive - Whether to create parent directories
   * @param {boolean} options.silent - Whether to suppress log messages
   * @returns {Promise<void>}
   */
  async createDir(dirPath, options = {}) {
    try {
      await fs.mkdir(dirPath, { recursive: options.recursive ?? true });
      if (!options.silent) {
        this.logger.info(`Created directory: ${dirPath}`);
      }
    } catch (error) {
      if (error.code !== 'EEXIST') {
        this.errorHandler.handle(error, {
          operation: `create directory ${dirPath}`,
          file: dirPath
        });
      } else if (!options.silent) {
        this.logger.info(`Directory already exists: ${dirPath}`);
      }
    }
  }

  /**
   * Deletes a file
   * 
   * @param {string} filePath - Path to file to delete
   * @returns {Promise<void>}
   */
  async delete(filePath) {
    try {
      if (!await this.exists(filePath)) {
        this.logger.info(`File does not exist: ${filePath}`);
        return;
      }
      await fs.unlink(filePath);
      this.logger.info(`Deleted file: ${filePath}`);
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: `delete file ${filePath}`,
        file: filePath
      });
    }
  }

  /**
   * Checks if a file exists without throwing exceptions
   * 
   * @param {string} filePath - Path to the file to check
   * @returns {Promise<boolean>} - True if file exists, false otherwise
   */
  async exists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Extracts path from file path based on pattern
   * 
   * @param {string} filePath - File path
   * @param {string} pattern - Path pattern
   * @returns {string|null} - Extracted path or null if no match
   */
  extractPath(filePath, pattern) {
    if (filePath.startsWith(pattern + '/')) {
      const segments = filePath.split('/');
      if (segments.length >= 3) {
        return path.join(segments[0], segments[1]);
      }
    }
    return null;
  }

  /**
   * Filters path by pattern
   * 
   * @param {Array<string>} files - List of file paths to check
   * @param {Object} patterns - Object mapping types to path patterns
   * @returns {Set<string>} - Set of type:path strings
   */
  filterPath(files, patterns) {
    const matches = new Set();
    for (const file of files) {
      for (const [type, pattern] of Object.entries(patterns)) {
        const extractedPath = this.extractPath(file, pattern);
        if (extractedPath) {
          matches.add(`${type}:${extractedPath}`);
        }
      }
    }
    return matches;
  }

  /**
   * Finds files matching a pattern
   * 
   * @param {string} pattern - Glob pattern to match
   * @param {Object} options - Glob options
   * @returns {Promise<string[]>} - Array of matching file paths
   */
  async find(pattern, options = {}) {
    return new Promise((resolve, reject) => {
      glob(pattern, options, (err, files) => {
        if (err) {
          this.errorHandler.handle(err, {
            operation: `find files matching ${pattern}`,
            fatal: false
          });
          return reject(err);
        }
        this.logger.info(`Found ${files.length} files matching ${pattern}`);
        resolve(files);
      });
    });
  }

  /**
   * Gets file stats
   * 
   * @param {string} filePath - Path to file
   * @returns {Promise<Object>} - File stats
   */
  async getStats(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile()
      };
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: `get stats for ${filePath}`,
        file: filePath,
        fatal: false
      });
      return null;
    }
  }

  /**
   * Lists files in a directory
   * 
   * @param {string} dirPath - Directory path
   * @param {Object} options - List options
   * @param {boolean} options.recursive - Whether to list files recursively
   * @returns {Promise<string[]>} - Array of file paths
   */
  async listDir(dirPath, options = {}) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      let files = [];
      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);
        if (entry.isDirectory() && options.recursive) {
          const subDirFiles = await this.listDir(entryPath, options);
          files = files.concat(subDirFiles);
        } else if (entry.isFile() || (!options.filesOnly && entry.isDirectory())) {
          files.push(entryPath);
        }
      }
      return files;
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: `list directory ${dirPath}`,
        file: dirPath,
        fatal: false
      });
      return [];
    }
  }

  /**
   * Reads a file
   * 
   * @param {string} filePath - Path to file to read
   * @param {Object} options - Read options
   * @param {string} options.encoding - File encoding
   * @returns {Promise<string|Buffer>} - File contents
   */
  async read(filePath, options = {}) {
    try {
      if (!await this.exists(filePath)) {
        throw new Error(`File does not exist: ${filePath}`);
      }
      return await fs.readFile(filePath, options.encoding || 'utf8');
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: `read file ${filePath}`,
        file: filePath
      });
    }
  }

  /**
   * Reads a YAML file
   * 
   * @param {string} filePath - Path to YAML file
   * @returns {Promise<Object>} - Parsed YAML object
   */
  async readYaml(filePath) {
    try {
      const content = await this.read(filePath);
      return yaml.load(content);
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: `read YAML file ${filePath}`,
        file: filePath
      });
    }
  }

  /**
   * Writes a file
   * 
   * @param {string} filePath - Path to file to write
   * @param {string|Buffer} content - Content to write
   * @param {Object} options - Write options
   * @param {boolean} options.createDir - Whether to create parent directories
   * @returns {Promise<void>}
   */
  async write(filePath, content, options = {}) {
    try {
      if (options.createDir !== false) {
        await this.createDir(path.dirname(filePath), { silent: true });
      }
      await fs.writeFile(filePath, content);
      this.logger.info(`Wrote file: ${filePath}`);
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: `write file ${filePath}`,
        file: filePath
      });
    }
  }

  /**
   * Writes a YAML file
   * 
   * @param {string} filePath - Path to YAML file
   * @param {Object} data - Data to write
   * @param {Object} options - Write options
   * @param {boolean} options.pretty - Whether to pretty-print YAML
   * @returns {Promise<void>}
   */
  async writeYaml(filePath, data, options = {}) {
    try {
      const content = yaml.dump(data, {
        lineWidth: options.pretty === false ? -1 : 80
      });
      await this.write(filePath, content, options);
    } catch (error) {
      this.errorHandler.handle(error, {
        operation: `write YAML file ${filePath}`,
        file: filePath
      });
    }
  }
}

module.exports = File;
