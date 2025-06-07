/**
 * File service for file system operations
 * 
 * @module services/File
 * @author AXIVO
 * @license BSD-3-Clause
 */
const fs = require('fs/promises');
const path = require('path');
const glob = require('glob');
const yaml = require('js-yaml');
const Action = require('../core/Action');

/**
 * File service for file system operations
 * 
 * Provides comprehensive file system operations including YAML processing,
 * directory management, file filtering, and path manipulation utilities.
 * 
 * @class FileService
 */
class FileService extends Action {
  /**
   * Extracts path from file, based on pattern
   * 
   * @private
   * @param {string} file - File name
   * @param {string} pattern - Path pattern
   * @returns {string|null} Extracted path or null if no match
   */
  #extractPath(file, pattern) {
    if (file.startsWith(pattern + '/')) {
      const segments = file.split('/');
      if (segments.length >= 3) {
        return path.join(segments[0], segments[1]);
      }
    }
    return null;
  }

  /**
   * Copies a file from source to destination
   * 
   * @param {string} source - Source file path
   * @param {string} destination - Destination file path
   * @param {Object} [options={}] - Copy options
   * @param {boolean} [options.overwrite] - Whether to overwrite existing files
   * @returns {Promise<void>}
   */
  async copy(source, destination, options = {}) {
    return this.execute(`copy '${source}' file to '${destination}'`, async () => {
      await this.createDir(path.dirname(destination), { silent: true });
      if (!options.overwrite && await this.exists(destination)) {
        this.logger.warning(`File '${destination}' already exists`);
        return null;
      }
      await fs.copyFile(source, destination);
      this.logger.info(`Successfully copied '${source}' file to '${destination}'`);
    });
  }

  /**
   * Creates a directory
   * 
   * @param {string} directory - Directory to create
   * @param {Object} [options={}] - Directory creation options
   * @param {boolean} [options.recursive] - Whether to create parent directories
   * @param {boolean} [options.silent] - Whether to suppress log messages
   * @returns {Promise<void>}
   */
  async createDir(directory, options = {}) {
    return this.execute(`create '${directory}' directory`, async () => {
      await fs.mkdir(directory, { recursive: options.recursive ?? true });
      if (!options.silent) {
        this.logger.info(`Successfully created '${directory}' directory`);
      }
    }, false);
  }

  /**
   * Deletes a file
   * 
   * @param {string} file - File to delete
   * @returns {Promise<void>}
   */
  async delete(file) {
    return this.execute(`delete '${file}' file`, async () => {
      if (!await this.exists(file)) {
        this.logger.info(`File '${file}' not found`);
        return;
      }
      await fs.unlink(file);
      this.logger.info(`Successfully deleted '${file}' file`);
    }, false);
  }

  /**
   * Checks if a file exists without throwing exceptions
   * 
   * @param {string} file - File to check
   * @returns {Promise<boolean>} True if file exists, false otherwise
   */
  async exists(file) {
    try {
      await fs.access(file);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Filters paths to only include existing files
   * 
   * @param {Array<string>} directories - List of directories to check
   * @param {Array<string>} [fileTypes] - File types to filter (default: standard chart files)
   * @returns {Promise<Array<string>>} List of existing files
   */
  async filter(directories, fileTypes) {
    const defaultFileTypes = [
      'application.yaml',
      'Chart.lock',
      'Chart.yaml',
      'metadata.yaml',
      'values.yaml'
    ];
    const types = fileTypes || defaultFileTypes;
    const files = directories.flatMap(dir =>
      types.map(type => `${dir}/${type}`)
    );
    const existingFiles = [];
    for (const file of files) {
      if (await this.exists(file)) {
        existingFiles.push(file);
      }
    }
    return existingFiles;
  }

  /**
   * Filters path by pattern
   * 
   * @param {Array<string>} files - List of files to check
   * @param {Object} patterns - Object mapping types to path patterns
   * @returns {Set<string>} Set of type:path strings
   */
  filterPath(files, patterns) {
    const matches = new Set();
    for (const file of files) {
      for (const [type, pattern] of Object.entries(patterns)) {
        const extractedPath = this.#extractPath(file, pattern);
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
   * @param {Object} [options={}] - Glob options
   * @returns {Promise<string[]>} Array of matching file paths
   */
  async find(pattern, options = {}) {
    return this.execute(`find files matching '${pattern}' pattern`, async () => {
      return new Promise((resolve, reject) => {
        glob(pattern, options, (err, files) => {
          if (err) {
            return reject(err);
          }
          const word = files.length === 1 ? 'file' : 'files';
          this.logger.info(`Found ${files.length} ${word} matching '${pattern}' pattern`);
          resolve(files);
        });
      });
    }, false);
  }

  /**
   * Gets file stats
   * 
   * @param {string} file - File name
   * @returns {Promise<Object>} File stats
   */
  async getStats(file) {
    return this.execute(`get '${file}' stats`, async () => {
      const stats = await fs.stat(file);
      return {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile()
      };
    }, false);
  }

  /**
   * Lists files in a directory
   * 
   * @param {string} directory - Directory name
   * @param {Object} [options={}] - List options
   * @param {boolean} [options.recursive] - Whether to list files recursively
   * @returns {Promise<string[]>} Array of file paths
   */
  async listDir(directory, options = {}) {
    return this.execute(`list '${directory}' directory`, async () => {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      let files = [];
      for (const entry of entries) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory() && options.recursive) {
          const subDirFiles = await this.listDir(entryPath, options);
          files = files.concat(subDirFiles);
        } else if (entry.isFile() || (!options.filesOnly && entry.isDirectory())) {
          files.push(entryPath);
        }
      }
      return files;
    }, false);
  }

  /**
   * Reads a file
   * 
   * @param {string} file - File to read
   * @param {Object} [options={}] - Read options
   * @param {string} [options.encoding] - File encoding
   * @returns {Promise<string|Buffer>} File contents
   */
  async read(file, options = {}) {
    return this.execute(`read '${file}' file`, async () => {
      if (!await this.exists(file)) {
        this.logger.warning(`File '${file}' not found`);
        return null;
      }
      return await fs.readFile(file, options.encoding || 'utf8');
    });
  }

  /**
   * Reads a YAML file
   * 
   * @param {string} file - YAML file to read
   * @returns {Promise<Object>} Parsed YAML object
   */
  async readYaml(file) {
    return this.execute(`read '${file}' YAML file`, async () => {
      const content = await this.read(file);
      return yaml.load(content);
    });
  }

  /**
   * Writes a file
   * 
   * @param {string} file - File to write
   * @param {string|Buffer} content - Content to write
   * @param {Object} [options={}] - Write options
   * @param {boolean} [options.createDir] - Whether to create parent directories
   * @returns {Promise<void>}
   */
  async write(file, content, options = {}) {
    return this.execute(`write '${file}' file`, async () => {
      if (options.createDir !== false) {
        await this.createDir(path.dirname(file), { silent: true });
      }
      await fs.writeFile(file, content);
    });
  }

  /**
   * Writes a YAML file
   * 
   * @param {string} file - YAML file to write
   * @param {Object} content - Content to write
   * @param {Object} [options={}] - Write options
   * @param {boolean} [options.pretty] - Whether to pretty-print YAML
   * @returns {Promise<void>}
   */
  async writeYaml(file, content, options = {}) {
    return this.execute(`write '${file}' YAML file`, async () => {
      const data = yaml.dump(content, {
        lineWidth: options.pretty === false ? -1 : 80
      });
      await this.write(file, data, options);
    });
  }
}

module.exports = FileService;
