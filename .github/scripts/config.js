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
     * Controls automatic label creation for repository
     * 
     * When enabled, the system will automatically create missing labels defined
     * in the labels configuration during workflow execution. When disabled,
     * the system will only use existing labels without creating missing ones.
     * 
     * Note that if left enabled, the system will create GitHub issues during each workflow run,
     * including a reminder to set this value to "false" after initial setup. This can result in
     * numerous notifications for repository maintainers.
     * 
     * @type {boolean}
     * @default false
     * @see addLabel - Function in utils.js that checks this flag before creating labels
     * @see reportWorkflowIssue - Function in utils.js that uses this setting when creating issues
     */
    createLabels: true,

    /**
     * Header text used to identify the chart selection section in issues
     * 
     * This configuration defines the exact heading text that precedes the chart selection
     * in issue templates. The system uses this text to parse issue bodies and identify
     * which chart an issue relates to.
     * 
     * @type {string}
     * @default '### Related Chart'
     * @see getReleaseIssues - Function in github-api.js that uses this header to detect relevant issues
     */
    header: '### Related Chart',

    /**
     * Predefined issue label definitions used across the repository
     * 
     * Contains standardized label definitions (color, description) that are used
     * for categorizing issues in GitHub and generating release notes. These labels
     * can be automatically created when createLabels is true.
     * 
     * @type {Object}
     * @see addLabel - Function in utils.js that creates these labels if they don't exist
     * @see reportWorkflowIssue - Function in utils.js that applies these labels to issues
     */
    labels: {
      /**
       * Label definition for dependency updates from automated tools
       * 
       * Used to categorize issues and pull requests related to dependency version updates,
       * particularly those created by Renovate or similar dependency management bots.
       * This helps distinguish automated updates from manual changes.
       * 
       * @type {Object}
       * @see addLabel - Function in utils.js that uses this label definition when creating labels
       */
      dependency: {
        /**
         * Display color for the dependency label (dark blue)
         * 
         * Hexadecimal color code without leading #. This color appears 
         * as the label background in the GitHub issue interface.
         * 
         * @type {string}
         * @default '00008b'
         */
        color: '00008b',

        /**
         * Tooltip description shown when hovering over the dependency label
         * 
         * This text appears when users hover over the label in the GitHub interface,
         * providing additional context about what the label means.
         * 
         * @type {string}
         * @default 'Dependency version update'
         */
        description: 'Dependency version update'
      },

      /**
       * Label definition for feature requests and enhancements
       * 
       * Used to categorize issues that propose new functionality or enhancements
       * to existing features. Issues with this label may appear in release notes
       * under a "New Features" section.
       * 
       * @type {Object}
       * @see addLabel - Function in utils.js that uses this label definition when creating labels
       * @see reportWorkflowIssue - Function in utils.js that applies this label to feature-related issues
       */
      feature: {
        /**
         * Display color for the feature label (royal blue)
         * 
         * Hexadecimal color code without leading #. This color appears 
         * as the label background in the GitHub issue interface.
         * 
         * @type {string}
         * @default '4169e1'
         */
        color: '4169e1',

        /**
         * Tooltip description shown when hovering over the feature label
         * 
         * This text appears when users hover over the label in the GitHub interface,
         * providing additional context about what the label means.
         * 
         * @type {string}
         * @default 'Additions of new functionality'
         */
        description: 'Additions of new functionality'
      },

      /**
       * Label definition for issues requiring initial assessment
       * 
       * Used to mark issues that need initial review and categorization.
       * This helps workflows identify which issues are still pending review.
       * 
       * @type {Object}
       * @see addLabel - Function in utils.js that uses this label definition when creating labels
       */
      triage: {
        /**
         * Display color for the triage label (green)
         * 
         * Hexadecimal color code without leading #. This color appears 
         * as the label background in the GitHub issue interface.
         * 
         * @type {string}
         * @default '30783f'
         */
        color: '30783f',

        /**
         * Tooltip description shown when hovering over the triage label
         * 
         * This text appears when users hover over the label in the GitHub interface,
         * providing additional context about what the label means.
         * 
         * @type {string}
         * @default 'Needs triage'
         */
        description: 'Needs triage'
      },

      /**
       * Label definition for workflow-related issues and errors
       * 
       * Used to categorize issues that are created automatically by workflows
       * when they encounter errors or require attention. This helps distinguish
       * system-generated issues from user-created ones.
       * 
       * @type {Object}
       * @see addLabel - Function in utils.js that uses this label definition when creating labels
       * @see reportWorkflowIssue - Function in utils.js that applies this label to workflow-generated issues
       */
      workflow: {
        /**
         * Display color for the workflow label (purple)
         * 
         * Hexadecimal color code without leading #. This color appears 
         * as the label background in the GitHub issue interface.
         * 
         * @type {string}
         * @default 'b84cfd'
         */
        color: 'b84cfd',

        /**
         * Tooltip description shown when hovering over the workflow label
         * 
         * This text appears when users hover over the label in the GitHub interface,
         * providing additional context about what the label means.
         * 
         * @type {string}
         * @default 'Workflow execution related'
         */
        description: 'Workflow execution related'
      }
    },

    /**
     * File paths to the issue templates used in the repository
     * 
     * Contains paths to YAML-based issue template files that define
     * the structure and content of new issue forms in GitHub. These templates
     * are updated by the updateIssueTemplates function to include current chart options.
     * 
     * @type {Object}
     * @see _updateIssueTemplates - Function in chart.js that updates these templates with chart options
     * @see reportWorkflowIssue - Function in utils.js that uses these templates for creating issues
     */
    template: {
      /**
       * Path to the YAML template for bug reports
       * 
       * This file contains the form definition for bug reports including
       * fields for reproduction steps, expected behavior, and other details.
       * 
       * @type {string}
       * @default '.github/ISSUE_TEMPLATE/bug_report.yml'
       */
      bug: '.github/ISSUE_TEMPLATE/bug_report.yml',

      /**
       * Path to the YAML template for feature requests
       * 
       * This file contains the form definition for feature requests including
       * fields for describing the proposed feature, use cases, and alternatives.
       * 
       * @type {string}
       * @default '.github/ISSUE_TEMPLATE/feature_request.yml'
       */
      feature: '.github/ISSUE_TEMPLATE/feature_request.yml'
    },

    /**
     * Standard title prefix for issues created by workflows
     * 
     * When workflows encounter errors or need to report information,
     * they create issues with this standardized title prefix for easy identification.
     * The complete title typically includes additional context about the specific issue.
     * 
     * @type {string}
     * @default 'workflow: Issues Detected'
     * @see reportWorkflowIssue - Function in utils.js that uses this title when creating workflow issue reports
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
     * Deployment target environment for chart releases
     * 
     * Controls how the build and deployment process behaves based on the context.
     * In production mode, charts are built and deployed to GitHub Pages.
     * In staging mode, charts are built locally for testing without publishing.
     * 
     * @type {string}
     * @default 'production'
     * @see setupBuildEnvironment - Function in release.js that uses this setting to determine deployment behavior
     */
    deployment: 'production',

    /**
     * Jekyll static site generator configuration
     * 
     * Settings that control how Jekyll generates the GitHub Pages site
     * for chart documentation and the Helm repository.
     * 
     * @type {Object}
     */
    configuration: {
      /**
       * Path to the Jekyll _config.yml template file
       * 
       * This template contains settings for the Jekyll static site generator
       * including theme selection, site metadata, and build configuration.
       * It's copied to the root directory during the build process.
       * 
       * @type {string}
       * @default '.github/templates/config.yml'
       * @see setupBuildEnvironment - Function in release.js that copies this file to the build location
       */
      file: '.github/templates/config.yml'
    },

    /**
     * Configuration for the GitHub Pages site homepage
     * 
     * Controls the generation of the main index page that lists all available
     * charts in the repository with their descriptions and versions.
     * 
     * @type {Object}
     */
    frontpage: {
      /**
       * Path to the Handlebars template for the repository index page
       * 
       * This template defines the structure and content of the main landing page
       * for the chart repository. It's processed with chart data to generate
       * a comprehensive listing of all available charts.
       * 
       * @type {string}
       * @default '.github/templates/index.md.hbs'
       * @see generateIndex - Function in release.js that uses this template to create the index page
       */
      template: '.github/templates/index.md.hbs'
    },

    /**
     * Whether to skip existing releases or fail the workflow
     * 
     * When true, the workflow will skip chart versions that already have a release
     * and continue processing other charts. When false, the workflow will fail
     * if it encounters a chart version that already has a release.
     * 
     * @type {boolean}
     * @default true
     * @see _createChartReleases - Function in release.js that checks this flag when processing releases
     */
    skipExisting: true,

    /**
     * Path to the Handlebars template for GitHub release notes
     * 
     * This template defines the structure and content of release notes
     * that appear on GitHub releases. It includes chart metadata, dependency
     * information, and related issues that were addressed in the release.
     * 
     * @type {string}
     * @default '.github/templates/release.md.hbs'
     * @see _generateChartRelease - Function in release.js that uses this template to create release content
     */
    template: '.github/templates/release.md.hbs',

    /**
     * Format string for release tags and titles
     * 
     * This template string is used to generate consistent release tags and titles
     * for chart releases. It supports variables that are replaced with actual
     * chart information during the release process.
     * 
     * @type {string}
     * @default '{{ .Name }}-v{{ .Version }}'
     * @see _buildChartRelease - Function in release.js that uses this pattern to generate release tags
     */
    title: '{{ .Name }}-v{{ .Version }}'
  },

  /**
   * Repository-specific configuration
   * 
   * @type {Object}
   */
  repository: {
    /**
     * Configuration for Helm chart structure and organization
     * 
     * Defines standardized paths, naming conventions, and organization
     * for charts within the repository.
     * 
     * @type {Object}
     */
    chart: {
      /**
       * Standard filename for chart icons in chart directories
       * 
       * Charts may include an icon image file with this standardized name.
       * The icon is displayed in the Helm repository UI and in chart documentation.
       * If present, the icon is also included in GitHub release notes.
       * 
       * @type {string}
       * @default 'icon.png'
       * @see _generateChartRelease - Function in release.js that checks for this icon file
       */
      icon: 'icon.png',

      /**
       * Directory names for different chart categories
       * 
       * The repository organizes charts into categories (application vs. library)
       * with standardized directory names for each category.
       * 
       * @type {Object}
       * @see findCharts - Function in utils.js that uses these paths to locate chart directories
       */
      type: {
        /**
         * Directory containing deployable application charts
         * 
         * Application charts are full-featured Helm charts that can be installed
         * directly to create running applications on a Kubernetes cluster.
         * 
         * @type {string}
         * @default 'application'
         */
        application: 'application',

        /**
         * Directory containing reusable library charts
         * 
         * Library charts provide reusable chart components and helpers that
         * can be used by other charts but cannot be installed directly.
         * 
         * @type {string}
         * @default 'library'
         */
        library: 'library'
      }
    },

    /**
     * Public URL of the Helm chart repository
     * 
     * This URL is included in the Helm repository index file and is used by
     * Helm clients to locate and download charts. It points to the GitHub Pages
     * site where the packaged charts and index.yaml are hosted.
     * 
     * @type {string}
     * @default 'https://axivo.github.io/charts/'
     * @see _generateHelmIndex - Function in release.js that uses this URL in the repository index
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
 */
module.exports = config;
