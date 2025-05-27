/**
 * Production configuration values
 * 
 * This module defines the production configuration values used throughout the application.
 */
module.exports = {
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
     * Note: If enabled, the system will create GitHub issues during each workflow run,
     * including a reminder to set this value to "false" after initial setup. This can result in
     * numerous notifications for repository maintainers.
     * 
     * @type {boolean}
     * @default false
     */
    createLabels: false,

    /**
     * Predefined issue label definitions used across the repository
     * 
     * Contains standardized label definitions (color, description) that are used
     * for categorizing issues in GitHub and generating release notes. These labels
     * can be automatically created when createLabels is true.
     * 
     * @type {Object}
     */
    labels: {
      /**
       * Label definition for application chart type
       * 
       * Used to categorize issues related to application charts.
       * This helps identify which chart type an issue relates to.
       * 
       * @type {Object}
       */
      application: {
        /**
         * Display color for the application label (blue)
         * 
         * Hexadecimal color code without leading #. This color appears 
         * as the label background in the GitHub issue interface.
         * 
         * @type {string}
         * @default '0366d6'
         */
        color: '0366d6',

        /**
         * Tooltip description shown when hovering over the application label
         * 
         * This text appears when users hover over the label in the GitHub interface,
         * providing additional context about what the label means.
         * 
         * @type {string}
         * @default 'Application chart type related'
         */
        description: 'Application chart type related'
      },

      /**
       * Label definition for blocked issues or pull requests
       * 
       * Used to identify items that cannot proceed due to unresolved dependencies,
       * requirements, or other blockers. This helps prioritize work by highlighting
       * items that need special attention to move forward.
       * 
       * @type {Object}
       */
      blocked: {
        /**
         * Display color for the blocked label (red-orange)
         * 
         * Hexadecimal color code without leading #. This color appears 
         * as the label background in the GitHub issue interface.
         * 
         * @type {string}
         * @default 'd93f0b'
         */
        color: 'd93f0b',

        /**
         * Tooltip description shown when hovering over the blocked label
         * 
         * This text appears when users hover over the label in the GitHub interface,
         * providing additional context about what the label means.
         * 
         * @type {string}
         * @default 'Not ready due to unresolved issues'
         */
        description: 'Not ready due to unresolved issues'
      },

      /**
       * Label definition for dependency updates from automated tools
       * 
       * Used to categorize issues and pull requests related to dependency version updates,
       * particularly those created by Renovate or similar dependency management bots.
       * This helps distinguish automated updates from manual changes.
       * 
       * @type {Object}
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
       * Label definition for library chart type
       * 
       * Used to categorize issues related to library charts.
       * This helps identify which chart type an issue relates to.
       * 
       * @type {Object}
       */
      library: {
        /**
         * Display color for the library label (purple)
         * 
         * Hexadecimal color code without leading #. This color appears 
         * as the label background in the GitHub issue interface.
         * 
         * @type {string}
         * @default '8732a8'
         */
        color: '8732a8',

        /**
         * Tooltip description shown when hovering over the library label
         * 
         * This text appears when users hover over the label in the GitHub interface,
         * providing additional context about what the label means.
         * 
         * @type {string}
         * @default 'Library chart type related'
         */
        description: 'Library chart type related'
      },

      /**
       * Label definition for issues requiring initial assessment
       * 
       * Used to mark issues that need initial review and categorization.
       * This helps workflows identify which issues are still pending review.
       * 
       * @type {Object}
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
     * contain the forms used for bug reports and feature requests.
     * 
     * @type {Object}
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
    }
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
       */
      icon: 'icon.png',

      /**
       * Configuration for packaged chart repository
       * 
       * Settings for publishing charts to a traditional Helm repository using
       * packaged .tgz files and an index.yaml file. This is the standard Helm
       * repository format used before the introduction of OCI.
       * 
       * @type {Object}
       */
      packages: {
        /**
         * Whether traditional packaged chart repository publishing is enabled
         * 
         * When true, charts are published as packaged .tgz files with an index.yaml file,
         * following the standard Helm repository format.
         * When false, charts are published to the configured OCI registry during
         * the release process (if enabled).
         * 
         * @type {boolean}
         * @default false
         */
        enabled: true,

        /**
         * Maximum number of versions to retain per chart in the index.yaml file
         * 
         * Limits the number of versions kept in the index to prevent the file from 
         * growing too large. Only the most recent N versions of each chart will be included.
         * Set to 0 for no retention limit (all versions are kept).
         * 
         * @type {number}
         * @default 10
         */
        retention: 10
      },

      /**
       * Configuration for chart redirection in GitHub Pages
       * 
       * Contains settings related to redirecting chart-specific URLs to their
       * proper locations in the Helm repository structure. This is used to create
       * user-friendly landing pages for individual charts.
       * 
       * @type {Object}
       */
      redirect: {
        /**
         * Path to the Handlebars template for chart redirection
         * 
         * This template defines the HTML content that redirects users from
         * chart-specific URLs to the appropriate chart index location. It supports
         * variables for repository URL, chart type, and chart name that are replaced
         * during processing.
         * 
         * @type {string}
         * @default '.github/actions/templates/redirect.html.hbs'
         */
        template: '.github/actions/templates/redirect.html.hbs'
      },

      /**
       * Directory names for different chart categories
       * 
       * The repository organizes charts into categories (application vs. library)
       * with standardized directory names for each category.
       * 
       * @type {Object}
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
     * Configuration for OCI (Open Container Initiative) registry
     * 
     * Settings for publishing charts to OCI-compatible registries like GitHub Container Registry.
     * Enables more secure and enterprise-friendly chart distribution alongside the traditional
     * Helm repository approach.
     * 
     * @type {Object}
     */
    oci: {
      /**
       * Configuration for OCI package publishing
       * 
       * Controls whether charts are published to OCI-compatible registries during
       * the release process. When enabled, charts are pushed to the registry specified
       * in the repository.oci.registry configuration.
       * 
       * @type {Object}
       */
      packages: {
        /**
         * Whether OCI packages publishing is enabled
         * 
         * When true, packages are published to the configured OCI registry during the release process.
         * When false, charts are published as packaged .tgz files with an index.yaml file,
         * following the standard Helm repository format (if enabled).
         * 
         * @type {boolean}
         * @default true
         */
        enabled: true
      },

      /**
       * OCI registry URL without protocol
       * 
       * The base registry URL where charts will be published using the OCI protocol.
       * For GitHub Container Registry, this is typically 'ghcr.io'.
       * 
       * @type {string}
       * @default 'ghcr.io'
       */
      registry: 'ghcr.io'
    },

    /**
     * Configuration for Helm release structure and organization
     * 
     * Settings that control the release process for Helm charts, including tag formats,
     * deployment modes, package storage, and release note generation. These settings
     * ensure consistent release patterns across all charts in the repository.
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
       */
      deployment: 'production',

      /**
       * Path to the chart packages directory
       * 
       * This directory is used to store packaged chart files (.tgz) during the release process.
       * The charts are packaged here first before being uploaded to GitHub Releases.
       * It also serves as a cache for chart downloads when generating index.yaml files.
       * The directory follows a structure of [packages]/[type]/[chart-name-version.tgz].
       * 
       * @type {string}
       * @default '.cr-release-packages'
       */
      packages: '.cr-release-packages',

      /**
       * Path to the Handlebars template for GitHub release notes
       * 
       * This template defines the structure and content of release notes
       * that appear on GitHub releases. It includes chart metadata, dependency
       * information, and related issues that were addressed in the release.
       * 
       * @type {string}
       * @default '.github/actions/templates/release.md.hbs'
       */
      template: '.github/actions/templates/release.md.hbs',

      /**
       * Format string for release tags and titles
       * 
       * This template string is used to generate consistent release tags and titles
       * for chart releases. It supports variables that are replaced with actual
       * chart information during the release process.
       * 
       * @type {string}
       * @default '{{ .Name }}-{{ .Version }}'
       */
      title: '{{ .Name }}-{{ .Version }}'
    },

    /**
     * Public URL of the Helm chart repository
     * 
     * This URL is included in the Helm repository index file and is used by
     * Helm clients to locate and download charts. It points to the GitHub Pages
     * site where the packaged charts and index.yaml are hosted.
     * 
     * @type {string}
     * @default 'https://axivo.github.io/charts'
     */
    url: 'https://axivo.github.io/charts',

    /**
     * Git user identity for automated operations
     * 
     * Contains the standard user identity used for Git operations in automated 
     * workflows. This configuration ensures that commits and changes made by
     * GitHub Actions are properly attributed to the GitHub Actions bot account
     * rather than to any human user.
     * 
     * The GitHub Actions bot is a special system account that can make verified
     * commits directly through the GitHub API without requiring personal access
     * tokens. Using this identity ensures all automated commits are clearly
     * distinguishable from human commits in the repository history.
     * 
     * @type {Object}
     */
    user: {
      /**
       * Email address for the GitHub Actions bot
       * 
       * Standard email address for the GitHub Actions bot account.
       * This email is automatically recognized by GitHub as belonging
       * to the Actions system account, which allows commits to be
       * properly verified in the GitHub interface.
       * 
       * @type {string}
       * @default '41898282+github-actions[bot]@users.noreply.github.com'
       */
      email: '41898282+github-actions[bot]@users.noreply.github.com',

      /**
       * Username for the GitHub Actions bot
       * 
       * Standard username for the GitHub Actions bot account.
       * This username is displayed as the author/committer in Git commit
       * history and in the GitHub interface, making it clear which changes
       * were made by automated processes.
       * 
       * @type {string}
       * @default 'github-actions[bot]'
       */
      name: 'github-actions[bot]'
    }
  },

  /**
   * Theme-specific configuration
   * 
   * @type {Object}
   */
  theme: {
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
       * @default '.github/actions/templates/config.yml'
       */
      file: '.github/actions/templates/config.yml'
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
       * Path to the Handlebars template for the repository index frontpage
       * 
       * This template defines the structure and content of the main landing page
       * for the chart repository. It's processed with chart data to generate
       * a comprehensive listing of all available charts.
       * 
       * @type {string}
       * @default '.github/actions/templates/index.md.hbs'
       */
      template: '.github/actions/templates/index.md.hbs'
    },

    /**
     * Custom HTML head content for documentation pages
     * 
     * Contains settings for customizing the <head> section of the HTML pages
     * generated for the chart documentation on GitHub Pages.
     * 
     * @type {Object}
     */
    head: {
      /**
       * Path to the template for custom HTML head content
       * 
       * This template contains additional HTML content to be inserted into the
       * <head> section of documentation pages, such as custom styles, analytics,
       * or metadata tags. It's processed during the site generation process.
       * 
       * @type {string}
       * @default '.github/actions/templates/head-custom.html'
       */
      template: '.github/actions/templates/head-custom.html'
    },

    /**
     * Custom HTML layout content for documentation pages
     * 
     * Contains settings for customizing the layout of the HTML pages
     * generated for the chart documentation on GitHub Pages.
     * 
     * @type {Object}
     */
    layout: {
      /**
       * Path to the template for custom HTML layout content
       * 
       * This template contains HTML content to be used as the custom layout
       * of documentation pages, replacing the default theme layout.
       * It's processed during the site generation process.
       * 
       * @type {string}
       * @default '.github/actions/templates/layout.html'
       */
      template: '.github/actions/templates/layout.html'
    }
  },

  /**
   * Workflow-specific configuration
   * 
   * @type {Object}
   */
  workflow: {
    /**
     * Whether to enable debug mode for workflows
     * 
     * Controls debug features across the workflow system including:
     * - Stack traces in error output and GitHub annotations
     * - Timestamps in log messages for detailed timing information
     * 
     * When enabled, detailed debugging information will be displayed.
     * When disabled, only basic messages are shown for cleaner output.
     * 
     * @type {boolean}
     * @default false
     */
    debug: true,

    /**
     * Documentation generation configuration
     * 
     * Contains settings for controlling documentation generation behavior,
     * including output verbosity and other helm-docs related options.
     *
     * @type {Object}
     */
    docs: {
      /**
       * Log level for helm-docs command execution
       * 
       * Controls the verbosity of output from the helm-docs command. Available levels
       * in order of increasing verbosity: panic, fatal, error, warning, info, debug, trace.
       * Higher verbosity levels include all lower level messages.
       * 
       * @type {string}
       * @default 'info'
       */
      logLevel: 'info'
    },

    /**
     * Standard labels to apply to workflow-generated issues
     * 
     * This array defines the set of labels that are automatically applied to issues
     * created by workflows when they detect problems. These labels help categorize
     * and filter workflow-related issues in the repository's issue tracker.
     * 
     * @type {Array<string>}
     * @default ['bug', 'triage', 'workflow']
     */
    labels: ['bug', 'triage', 'workflow'],

    /**
     * Path to the Handlebars template for workflow-generated issues
     * 
     * This file contains the Handlebars template used to generate the content
     * of issues created by workflow runs when errors or warnings are detected.
     * It includes placeholders for workflow name, branch, commit, and run details.
     * 
     * @type {string}
     * @default '.github/actions/templates/workflow.md.hbs'
     */
    template: '.github/actions/templates/workflow.md.hbs',

    /**
     * Standard title prefix for workflow-generated issues
     * 
     * When workflows encounter errors or need to report information,
     * they create issues with this standardized title prefix for easy identification.
     * The complete title typically includes additional context about the specific issue.
     * 
     * @type {string}
     * @default 'workflow: Issues Detected'
     */
    title: 'workflow: Issues Detected'
  }
};
