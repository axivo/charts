/**
 * Configuration Centralization Module
 * 
 * This module centralizes configuration settings for all GitHub Actions workflows
 * in the repository. It provides a single source of truth for configuration values
 * used across different scripts, improving maintainability and consistency.
 * 
 * The module exports a getConfig function that allows other modules to access
 * either the entire configuration or specific sections as needed.
 * 
 * @module config
 * @author AXIVO
 * @license BSD-3-Clause
 */
const CONFIG = {
  /**
  * Issue-specific configuration
  * 
  * @type {Object}
  */
  issue: {
    /**
     * Issue template paths
     * 
     * Contains paths to different issue template files used in the repository
     * 
     * @type {Object}
     */
    template: {
      /**
       * Path to the bug report issue template
       * 
       * @type {string}
       */
      bug: '.github/ISSUE_TEMPLATE/bug_report.yml',

      /**
       * Path to the feature request issue template
       * 
       * @type {string}
       */
      feature: '.github/ISSUE_TEMPLATE/feature_request.yml'
    },

    /**
     * Title used for workflow issue reports
     * 
     * @type {string}
     */
    title: 'workflow: Issues Detected'
  },

  /**
   * Release-specific configuration
   * 
   * @type {Object}
   */
  release: {
    /**
     * Deployment environment type
     * Controls how the build and deployment process behaves
     * 
     * @type {string}
     * @example 'production' - Builds charts and deploys to GitHub Pages
     * @example 'staging' - Builds charts locally for testing without deploying
     */
    deployment: 'production',

    /**
     * Jekyll configuration settings
     * 
     * @type {Object}
     */
    configuration: {
      /**
       * Path to the Jekyll configuration file template
       * 
       * @type {string}
       */
      file: '.github/templates/config.yml'
    },

    /**
     * Frontpage settings for the GitHub Pages site
     * 
     * @type {Object}
     */
    frontpage: {
      /**
       * Path to the index template, used for charts frontpage
       * 
       * @type {string}
       */
      template: '.github/templates/index.md.hbs'
    },

    /**
     * Issue labels used for release notes and workflow issues
     * 
     * Contains predefined labels with their colors and descriptions
     * used for categorizing issues in GitHub and generating release notes.
     * 
     * @type {Object}
     */
    labels: {
      /**
       * Bug label for issues that report something not working
       * 
       * @type {Object}
       */
      bug: {
        /**
         * Hexadecimal color code for bug label (red)
         * 
         * @type {string}
         */
        color: 'd73a4a',

        /**
         * Description of the bug label shown in GitHub
         * 
         * @type {string}
         */
        description: "Something isn't working"
      },

      /**
       * Feature label for issues that propose new functionality
       * 
       * @type {Object}
       */
      feature: {
        /**
         * Hexadecimal color code for feature label (royal blue)
         * 
         * @type {string}
         */
        color: '4169e1',

        /**
         * Description of the feature label shown in GitHub
         * 
         * @type {string}
         */
        description: 'Additions of new functionality'
      }
    },

    /**
     * Skip existing releases instead of failing
     * 
     * @type {boolean}
     */
    skipExisting: true,

    /**
     * Template used for published releases
     * 
     * @type {string}
     */
    template: '.github/templates/release.md.hbs',

    /**
     * Template used for published releases
     * 
     * @type {string}
     */
    title: '{{ .Name }}-v{{ .Version }}'
  },

  /**
   * Repository settings related to charts and releases
   * 
   * @type {Object}
   */
  repository: {
    /**
     * Chart-related settings
     * 
     * @type {Object}
     */

    chart: {
      /**
       * Icon file name used in chart type directories
       * 
       * @type {string}
       */
      icon: 'icon.png',

      /**
       * Chart types and their directory names
       * 
       * @type {Object}
       */
      type: {
        /**
         * Directory name for application charts
         * 
         * @type {string}
         */
        application: 'application',

        /**
         * Directory name for library charts
         * 
         * @type {string}
         */
        library: 'library'
      }
    },

    /**
     * URL of the Helm repository
     * 
     * @type {string}
     */
    url: 'https://axivo.github.io/charts/'
  }
};

/**
 * Returns configuration settings from the centralized CONFIG object
 * 
 * This function provides access to the centralized configuration object,
 * allowing other modules to retrieve either specific sections or the entire
 * configuration. When a section name is provided, only that portion of the
 * configuration is returned, helping to keep module dependencies focused.
 * 
 * @param {string} [section] - Optional section name to retrieve only that part of the config
 * @returns {Object} - The requested configuration section or the entire config object
 */
function config(section) {
  if (section && CONFIG[section]) {
    return CONFIG[section];
  }
  return CONFIG;
}

/**
 * Exports the configuration function directly
 * 
 * This module directly exports the config function which provides a controlled interface
 * for accessing the centralized configuration settings. The CONFIG object itself
 * is not exported to encourage proper access patterns and maintain
 * encapsulation of configuration details.
 * 
 * As new configuration sections are added, they will be accessible through this
 * same interface without requiring changes to consuming modules.
 */
module.exports = config;
