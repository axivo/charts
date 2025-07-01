# GitHub Actions Call Chain Trace

This document traces all method calls from workflow entry points to identify used and unused code.

## 📋 WORKFLOW ENTRY POINTS

### **Chart Workflow (Pull Request Context)**
**File**: `.github/workflows/chart.yml`
**Trigger**: Pull request with chart file changes
**Handler**: `WorkflowHandler`

### **Release Workflow (Main Branch Context)**  
**File**: `.github/workflows/release.yml`
**Trigger**: Push to main branch with chart changes
**Handler**: `WorkflowHandler`

---

## 🔄 COMPLETE CALL CHAINS

### **CHART WORKFLOW TRACE**

```
chart.yml →
  WorkflowHandler.configureRepository() →
    GitService.configure() →
      ShellService.execute('git', ['config', 'user.email', userEmail])
      ShellService.execute('git', ['config', 'user.name', userName])
    Action.publish() (determines deployment mode)
    core.setOutput('publish', result)

  WorkflowHandler.updateLabels() →
    LabelService.update() →
      LabelService.add(labelName) (for each label) →
        RestService.getLabel(name) →
          github.rest.issues.getLabel()
        RestService.createLabel(name, color, description) →
          github.rest.issues.createLabel()

  WorkflowHandler.installHelmDocs(version) →
    DocsService.install(version) →
      ShellService.execute('sudo', ['wget', ...])
      ShellService.execute('sudo', ['apt-get', 'install', ...])

  WorkflowHandler.updateCharts() →
    ChartHandler.process() →
      RestService.getUpdatedFiles() →
        github.rest.pulls.listFiles() OR github.rest.repos.compareCommits()
      ChartService.find(files) →
        ChartService.getInventory(type) →
          FileService.readYaml(`${type}/inventory.yaml`)
        FileService.filterPath(files, chartTypes)
      ChartService.Update.application(charts) →
        FileService.readYaml(appFilePath)
        FileService.readYaml(chartYamlPath)  
        FileService.writeYaml(appFilePath, appConfig)
        GitService.signedCommit(branch, files, message) →
          ShellService.execute('git', ['fetch', 'origin', branch])
          ShellService.execute('git', ['add', ...files])
          GraphQLService.createSignedCommit(branch, options) →
            github.graphql(mutation)
      ChartService.Update.lock(charts) →
        FileService.readYaml(chartYamlPath)
        HelmService.updateDependencies(chartDir) →
          ShellService.execute('helm', ['dependency', 'update', chartDir])
        GitService.getStatus() →
          ShellService.execute('git', ['status', '--porcelain'])
        GitService.signedCommit(branch, files, message)
      ChartService.Update.metadata(charts) →
        FileService.readYaml(metadataPath)
        FileService.readYaml(chartYamlPath)
        HelmService.package(chartDir, {destination}) →
          ShellService.execute('helm', ['package', chartDir])
        HelmService.generateIndex(workspace, {url}) →
          ShellService.execute('helm', ['repo', 'index', directory])
        FileService.writeYaml(metadataPath, index)
        GitService.signedCommit(branch, files, message)
      ChartService.lint(charts) →
        ShellService.execute('ct', ['lint', '--charts', charts.join(','), '--skip-helm-dependencies'])
      DocsService.generate(charts) →
        ShellService.execute('helm-docs', ['-g', dirsList, '-l', logLevel])
        GitService.getChanges() →
          ShellService.execute('git', ['diff', '--name-only'])
        GitService.signedCommit(branch, files, message)
      ChartService.Update.inventory(updatedFiles) →
        FileService.readYaml(inventory)
        FileService.writeYaml(inventory, content)
        GitService.signedCommit(branch, files, message)

  WorkflowHandler.reportIssue() →
    IssueService.report(context, labelService, template) →
      RestService.getWorkflowRun(context.runId) →
        github.rest.actions.getWorkflowRun()
      RestService.listJobs() →
        github.rest.actions.listJobsForWorkflowRun()
      RestService.getWorkflowRunLogs(id) →
        github.rest.actions.downloadWorkflowRunLogs()
      FileService.read(templatePath)
      TemplateService.render(content, context, options) →
        Handlebars.compile(template)(context)
      LabelService.add(labelName) (for each workflow label)
      RestService.createIssue(title, body, labels) →
        github.rest.issues.create()
```

### **RELEASE WORKFLOW TRACE**

```
release.yml →
  WorkflowHandler.configureRepository() → [Same as Chart Workflow]

  WorkflowHandler.processReleases() →
    ReleaseHandler.process() →
      ChartService.getInventory(type) →
        FileService.readYaml(`${type}/inventory.yaml`)
      ReleaseHandler.#delete(inventory, chartTypes) →
        RestService.deleteReleases(chart.name) →
          RestService.#getReleaseIds(chart) →
            github.rest.repos.listReleases() (paginated)
          github.rest.repos.deleteRelease()
          github.rest.git.deleteRef()
        RestService.deletePackage(chart.name, chartType) →
          GraphQLService.getRepositoryType(owner) →
            github.graphql(query)
          github.rest.packages.deletePackageForOrg() OR deletePackageForUser()
        ChartService.deleteInventory(chartType, 'removed') →
          FileService.readYaml(inventoryPath)
          FileService.writeYaml(inventoryPath, inventory)
      ReleaseService.getCharts() →
        ChartService.getInventory(type) →
          FileService.readYaml(`${type}/inventory.yaml`)
      ReleaseHandler.#package(charts) →
        ChartService.validate(chart) →
          ChartService.lint([directory]) →
            ShellService.execute('ct', ['lint', '--charts', charts.join(','), '--skip-helm-dependencies'])
        ReleaseService.package(charts) →
          FileService.createDir(root)
          FileService.createDir(directories[type]) (for each type)
          HelmService.updateDependencies(chartDir) →
            ShellService.execute('helm', ['dependency', 'update', chartDir])
          HelmService.package(chartDir, {destination}) →
            ShellService.execute('helm', ['package', chartDir])
        PackageService.get(directory) →
          FileService.exists(directory)
          FileService.listDir(directory)
      PublishService.github(packages, directory) →
        PublishService.generateContent(chart) →
          FileService.read(releaseTemplate)
          IssueService.get(chart) →
            GraphQLService.getReleases(tagPrefix, 1) →
              github.graphql(query)
            GraphQLService.getReleaseIssues(chart, options) →
              github.graphql(query)
          TemplateService.render(templateContent, templateContext)
        RestService.getReleaseByTag(tagName) →
          github.rest.repos.getReleaseByTag()
        RestService.createRelease(tag, name, body) →
          github.rest.repos.createRelease()
        FileService.read(chart.path)
        RestService.uploadReleaseAsset(release.id, options) →
          github.rest.repos.uploadReleaseAsset()
      PublishService.generateIndexes() →
        ChartService.getInventory(type)
        FileService.createDir(outputDir)
        PublishService.createIndex(chart, directory) →
          FileService.exists(metadataPath)
          FileService.copy(metadataPath, indexPath)
          FileService.read(redirectTemplate)
          TemplateService.render(redirectContent, redirectContext)
          FileService.write(redirectPath, redirectHtml)
      PublishService.registry(packages, directory) →
        PublishService.authenticate() →
          HelmService.login(registry, username, password) →
            ShellService.execute('helm', ['registry', 'login', registry, '-u', username, '--password-stdin'])
        PackageService.delete(name, type) →
          RestService.deletePackage(name, type)
        PackageService.publish(ociRegistry, pkg, directory) →
          ShellService.execute('helm', ['push', chartPath, registryPath])

  WorkflowHandler.setFrontpage() →
    FrontpageService.generate() →
      FileService.readYaml(`${typePath}/inventory.yaml`) (for each type)
      FileService.read(templatePath)
      TemplateService.render(templateContent, context, {repoUrl}) →
        Handlebars.compile(template)(context)
      FileService.write('./index.md', content)
    FrontpageService.setTheme() →
      FileService.copy(configFile, './_config.yml')
      FileService.createDir('./_includes')
      FileService.copy(headTemplate, './_includes/head-custom.html')
      FileService.createDir('./_layouts')
      FileService.copy(layoutTemplate, './_layouts/default.html')

  WorkflowHandler.reportIssue() → [Same as Chart Workflow]
```

---

## ❌ UNUSED METHODS IDENTIFIED

### **Completely Unused Methods**
- `ApiService.transform()` - Only used internally, no external calls
- `HelmService.template()` - Template rendering never used in workflows

### **Local Development Only Methods (Not in Production Workflows)**
- `LocalService.*` - All methods only used in local development mode
- `LocalHandler.*` - Local development handler, not called in production workflows

### **Internal-Only Methods (Used by other methods but not workflows)**
- `RestService.#getReleaseIds()` - Private method for deleteReleases()
- `RestService.#paginate()` - Private helper for REST API pagination
- `GraphQLService.#paginate()` - Private helper for GraphQL pagination
- `ReleaseHandler.#delete()` - Private method for release deletion
- `ReleaseHandler.#package()` - Private method for chart packaging
- `ChartService.Update.#commit()` - Private helper for git commits
- `ChartService.Update.#initialize()` - Private helper for update operations
- `UpdateService.#generateIndex()` - Private helper for metadata generation
- `UpdateService.#mergeEntries()` - Private helper for metadata merging
- `UpdateService.#updateEntry()` - Private helper for inventory updates
- `PublishService.#create()` - Private helper for GitHub release creation
- `PublishService.#publish()` - Private helper for chart data preparation
- `PackageService.#getPackages()` - Private helper for package directory scanning

### **Template Files (All Used)**
- `templates/config.yml` - Used by FrontpageService.setTheme()
- `templates/head-custom.html` - Used by FrontpageService.setTheme()
- `templates/index.md.hbs` - Used by FrontpageService.generate()
- `templates/layout.html` - Used by FrontpageService.setTheme()
- `templates/redirect.html.hbs` - Used by PublishService.createIndex()
- `templates/release.md.hbs` - Used by PublishService.generateContent()
- `templates/workflow.md.hbs` - Used by IssueService.report()

---

## 📊 USAGE SUMMARY

### **Core Classes (All Used)**
- `Action` - Base class for all services
- `Configuration` - Configuration management
- `ActionError` - Error handling and reporting
- `Logger` - Logging functionality

### **Handlers (All Used)**
- `WorkflowHandler` - Main workflow orchestration
- `ChartHandler` - Chart update operations
- `ReleaseHandler` - Release processing operations

### **Services (Used in Production Workflows)**
- `ChartService` - Chart discovery and operations
- `ChartService.Update` - Chart file updates
- `DocsService` - Helm-docs operations
- `FileService` - File system operations
- `FrontpageService` - GitHub Pages frontpage generation
- `GitService` - Git operations and signed commits
- `GitHubService.Rest` - GitHub REST API operations
- `GitHubService.GraphQL` - GitHub GraphQL API operations
- `GitHubService.Api` - Base API service (for transform utility)
- `HelmService` - Helm CLI operations (login, generateIndex, package, updateDependencies)
- `IssueService` - GitHub issue management
- `LabelService` - Repository label management
- `PackageService` - Chart package management
- `PublishService` - Release publishing operations
- `ReleaseService` - Release management operations
- `ShellService` - Shell command execution
- `TemplateService` - Handlebars template rendering

### **Services (Local Development Only)**
- `LocalService` - Local development operations
- `LocalHandler` - Local development workflow

### **Methods with No External Calls**
- `ApiService.transform()` - Utility method but no direct workflow calls
- `HelmService.template()` - Template rendering not used in current workflows

---

## 🎯 CLEANUP RECOMMENDATIONS

1. **Keep Local Services**: LocalService and LocalHandler are valid for local development mode
2. **Consider removing unused methods**: ApiService.transform(), HelmService.template() if not needed
3. **All private methods are properly used**: Internal helpers are correctly utilized
4. **All template files are active**: Every template is used by workflows
5. **Architecture is consistent**: Follows inventory-based patterns correctly

**Total Methods Traced**: ~150+ method calls
**Unused Methods**: 2 methods that could be removed (transform, template)
**Private Methods**: ~13+ internal helper methods (all properly used)
**Local Development Methods**: ~10+ methods (valid for local mode)
