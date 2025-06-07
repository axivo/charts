# Code Analysis Criteria for GitHub Actions Codebase

This document defines the analysis criteria for systematic code review of every method in the GitHub Actions codebase to ensure clean, efficient, and consistent implementation.

## CRITICAL CODING GUIDELINES

### STRICT IMPLEMENTATION PROTOCOL
**VIOLATION RESULTS IN TASK FAILURE**

1. **CODE IMPLEMENTATION RULES**:
   - EXACT PATTERN MATCHING: Reproduce existing patterns with no variation
   - ZERO ENHANCEMENTS: No additional features, optimizations, or "improvements"
   - FUNCTION SIGNATURE MATCHING: Preserve original parameter names and return types
   - NO REFACTORING: Do not reorganize existing code structure
   - DEPENDENCY MATCHING: Import only what is used, in the same order as existing code

2. **METHOD VALIDATION REQUIREMENTS**:
   - Before implementation, list all similar methods in the codebase
   - Identify which existing methods can be reused
   - Confirm all method signatures match exactly before implementing

3. **DOCUMENTATION RULES**:
   - NO COMMENTS in method bodies under any circumstances
   - NO BLANK LINES inside methods
   - ALPHABETICAL METHOD ORDER (constructor first, then private methods, then others)
   - JSDoc format only for documentation above methods

4. **ERROR HANDLING REQUIREMENTS**:
   - FOLLOW EXISTING ERROR PATTERNS with no modifications
   - NO try/catch blocks anywhere - use execute() method only
   - MAINTAIN ERROR CONTEXT format exactly
   - Use single-line conditionals: `if (!data) return false;`

5. **FILE OPERATION AUTHORIZATION**:
   - EXPLICIT AUTHORIZATION REQUIRED for all file operations
   - AUTHORIZATION TRIGGERS: "implement required changes", "implement the changes", "make the changes", "apply the fix", "proceed with implementation", "implement this", "make these modifications"
   - NO AUTHORIZATION SCENARIOS: troubleshooting questions, analysis requests, suggestions, bug reports, general discussion, code review requests
   - NEVER create, edit, modify, or delete files without explicit authorization phrases

### PARAMETER PATTERNS
- Use individual parameters: `method(name, color, description)` NOT `method(params)`
- Parameter order: Context/ID first, then services, then optional objects with defaults
- Default values: `template = {}`, `labels = []`, `options = {}`
- Short parameter names: `id` not `context.runId`, `label` not `labelService`

### ERROR HANDLING PATTERNS
- Use `execute()` method with `fatal: true/false`
- Check for null: `if (!data) return false;` (single line)
- Early returns: `if (!valid) return null;`
- NO try/catch blocks anywhere in codebase
- Remove redundant fallbacks: `}, false) || false;` becomes `}, false);`

### METHOD STRUCTURE
- Constructor first, then all methods alphabetically
- Zero comments in method bodies
- Zero blank lines inside method bodies
- Single responsibility per method
- Consistent return types across similar methods

### SERVICE BOUNDARIES
- API calls only in Rest/GraphQL services
- Business logic only in domain services
- No one-liner wrapper methods
- Direct service calls, avoid unnecessary delegation

### TEMPLATE USAGE
- Validate template content before rendering: `if (!content || !service) return null;`
- Check rendered result: `if (!issueBody) return null;`
- Pass only required template options
- Remove unused template helpers/options

## WORKFLOW USAGE ANALYSIS

### Chart Workflow (`/workflows/chart.yml`) - Pull Request Trigger

**Entry Points:**
1. `workflow.configureRepository()` - Repository setup
2. `workflow.updateLabels()` - Issue label management
3. `workflow.installHelmDocs('1.14.2')` - Documentation tooling
4. `workflow.updateCharts()` - Chart processing
5. `workflow.reportIssue()` - Error reporting

**Complete Call Chain:**

#### 1. configureRepository() Chain
```
Workflow.configureRepository()
└── GitService.configure()
    └── ShellService.execute('git', ['config', 'user.email', userEmail])
    └── ShellService.execute('git', ['config', 'user.name', userName])
```

#### 2. updateLabels() Chain
```
Workflow.updateLabels()
└── LabelService.update()
    └── LabelService.add(labelName) [for each label]
        └── RestService.getLabel(name)
        └── RestService.createLabel(name, color, description) [if not exists]
```

#### 3. installHelmDocs() Chain
```
Workflow.installHelmDocs(version)
└── DocsService.install(version)
    └── ShellService.execute('sudo', ['wget', '-qP', tempDir, ...]) 
    └── ShellService.execute('sudo', ['apt-get', '-y', 'install', packagePath])
```

#### 4. updateCharts() Chain
```
Workflow.updateCharts()
└── ChartHandler.process()
    ├── RestService.getUpdatedFiles()
    │   └── RestService.#paginate('pulls', 'listFiles', ...)
    ├── ChartService.find(files)
    │   └── FileService.filterPath(files, chartTypes)
    │   └── FileService.exists(chartYamlPath)
    ├── UpdateService.application(updatedCharts)
    │   └── FileService.readYaml(appFilePath)
    │   └── FileService.readYaml(chartYamlPath)
    │   └── FileService.writeYaml(appFilePath, appConfig)
    │   └── GitService.signedCommit(branch, files, message)
    ├── UpdateService.lock(updatedCharts)
    │   └── FileService.readYaml(chartYamlPath)
    │   └── HelmService.updateDependencies(chartDir)
    │   └── GitService.getStatus()
    │   └── FileService.delete(chartLockPath) [if needed]
    │   └── GitService.signedCommit(branch, files, message)
    ├── UpdateService.metadata(updatedCharts)
    │   └── FileService.readYaml(chartYamlPath)
    │   └── FileService.readYaml(metadataPath)
    │   └── UpdateService.#generateIndex(chartDir, tempDir)
    │   └── UpdateService.#mergeEntries(chartName, index, metadata)
    │   └── FileService.writeYaml(metadataPath, index)
    │   └── GitService.signedCommit(branch, files, message)
    ├── ChartService.lint(updatedCharts)
    │   └── ShellService.execute('ct', ['lint', '--charts', ...])
    ├── DocsService.generate(updatedCharts)
    │   └── ShellService.execute('helm-docs', ['-g', dirsList, ...])
    │   └── GitService.getChanges()
    │   └── GitService.signedCommit(branch, files, message)
    └── UpdateService.inventory(updatedFiles)
        └── UpdateService.#updateEntry(chart, inventory, status)
        └── FileService.readYaml(inventoryPath)
        └── FileService.writeYaml(inventoryPath, content)
        └── GitService.signedCommit(branch, files, message)
```

#### 5. reportIssue() Chain
```
Workflow.reportIssue()
└── IssueService.report(context, labelService, {content, service})
    ├── IssueService.#validate(context.runId)
    │   ├── RestService.getWorkflowRun(id)
    │   ├── RestService.listJobs()
    │   └── RestService.getWorkflowRunLogs(id)
    ├── TemplateService.render(content, templateData, {})
    │   ├── TemplateService.#registerEqual()
    │   └── TemplateService.#registerRepoRawUrl(url) [if repoUrl provided]
    ├── LabelService.add(label) [for each workflow label]
    │   └── RestService.getLabel(name)
    │   └── RestService.createLabel(name, color, description) [if needed]
    └── RestService.createIssue(title, body, labels)
```

### Release Workflow (`/workflows/release.yml`) - Main Branch Push

**Entry Points:**
1. `workflow.configureRepository()` - Repository setup (same as chart)
2. `workflow.processReleases()` - Release processing
3. `workflow.setFrontpage()` - GitHub Pages setup
4. `workflow.reportIssue()` - Error reporting (same as chart)

**Additional Call Chains:**

#### 6. processReleases() Chain
```
Workflow.processReleases()
└── ReleaseService.process()
    ├── ChartService.getInventory('application')
    │   └── FileService.readYaml(inventoryPath)
    │   └── ChartService.discover() [if bootstrap needed]
    ├── ChartService.getInventory('library')
    ├── RestService.deleteReleases(chart.name) [for removed charts]
    │   └── RestService.#getReleaseIds(chart)
    │   └── RestService.deleteRelease(release.id)
    │   └── RestService.deleteRef(tagName)
    ├── RestService.deletePackage(chart.name, type) [for removed charts]
    ├── ChartService.deleteInventory(type, 'removed')
    │   └── FileService.readYaml(inventoryPath)
    │   └── FileService.writeYaml(inventoryPath, inventory)
    ├── RestService.getUpdatedFiles() [same as chart workflow]
    ├── ReleaseService.find(files)
    │   └── FileService.filterPath(files, patterns)
    ├── ReleaseService.validate(chartDir) [for each chart]
    │   └── ChartService.validate(directory)
    │       └── ChartService.lint([directory])
    ├── ReleaseService.package(charts)
    │   ├── FileService.createDir(packagesDir)
    │   └── HelmService.updateDependencies(chartDir) [for each]
    │   └── HelmService.package(chartDir, {destination})
    ├── PackageService.get(packagesDir)
    │   └── PackageService.#getPackages(directory) [for app/lib types]
    ├── ReleaseService.delete(charts.deleted)
    │   └── RestService.deleteReleases(name)
    │   └── RestService.deletePackage(name, type)
    ├── PublishService.github(packages, packagesPath)
    │   ├── PublishService.#publish(pkg, directory, appType) [for each]
    │   ├── PublishService.generateContent(chart)
    │   │   ├── IssueService.get({name, type})
    │   │   │   ├── GraphQLService.getReleases(tagPrefix, 1)
    │   │   │   ├── GraphQLService.getReleaseIssues(chart, {since})
    │   │   │   └── Transform and filter issues
    │   │   └── TemplateService.render(templateContent, templateContext)
    │   ├── RestService.getReleaseByTag(tagName)
    │   ├── PublishService.#create(chart, tag)
    │   │   ├── RestService.createRelease(tag, tag, body)
    │   │   ├── FileService.read(chart.path)
    │   │   └── RestService.uploadReleaseAsset(release.id, {name, data})
    │   └── PublishService.generateIndexes() [if packages enabled]
    │       ├── FileService.find(`${type}/*/Chart.yaml`)
    │       └── PublishService.createIndex(chart, directory)
    │           ├── FileService.copy(metadataPath, indexPath)
    │           ├── TemplateService.render(redirectContent, redirectContext)
    │           └── FileService.write(redirectPath, redirectHtml)
    └── PublishService.registry(packages, packagesPath) [if OCI enabled]
        ├── PublishService.authenticate()
        │   └── HelmService.login(registry, username, password)
        ├── PackageService.delete(name, type) [cleanup existing]
        │   └── RestService.deletePackage(name, type)
        └── PackageService.publish(registry, pkg, directory)
            └── ShellService.execute('helm', ['push', chartPath, registryPath])
```

#### 7. setFrontpage() Chain
```
Workflow.setFrontpage()
└── FrontpageService.generate()
│   ├── ChartService.discover()
│   │   ├── FileService.listDir(type.path) [for app/lib]
│   │   └── FileService.exists(chartYamlPath)
│   ├── FileService.readYaml(chartYamlPath) [for each chart]
│   ├── TemplateService.render(templateContent, {Charts, RepoURL, Branch}, {repoUrl})
│   └── FileService.write('./index.md', content)
└── FrontpageService.setTheme()
    ├── FileService.copy(configFile, './_config.yml')
    ├── FileService.createDir('./_includes')
    ├── FileService.copy(headTemplate, './_includes/head-custom.html')
    ├── FileService.createDir('./_layouts')
    └── FileService.copy(layoutTemplate, './_layouts/default.html')
```

## CRITICAL ISSUES IDENTIFIED

### 🔴 DUPLICATE METHODS

1. **Chart Discovery** - Same logic in multiple places:
   - `ChartService.discover()` - Used in frontpage generation and inventory bootstrap
   - `ChartService.find(files)` - Used in chart handler for modified charts
   - **ISSUE**: Both methods discover charts but with different filtering logic
   - **FIX**: Consolidate into single parameterized method

2. **File Existence Checking** - Redundant patterns:
   - `FileService.exists(file)` - Standalone existence check
   - `FileService.read(file)` - Already checks existence and logs warning
   - **ISSUE**: Redundant existence checks before read operations
   - **FIX**: Use read() return value checking instead of separate exists() calls

3. **Release Deletion** - Duplicate deletion logic:
   - `ReleaseService.delete(files)` - In release handler
   - `RestService.deleteReleases(name)` + `RestService.deletePackage(name, type)` - In publish service
   - **ISSUE**: Same deletion operations scattered across services
   - **FIX**: Consolidate in ReleaseService

4. **Inventory Management** - Similar read/write patterns:
   - `ChartService.getInventory(type)` - Read inventory with bootstrap
   - `ChartService.deleteInventory(type, status)` - Filter and write inventory
   - `UpdateService.#updateEntry(chart, inventory, status)` - Single entry update
   - **ISSUE**: Three different ways to modify inventory files
   - **FIX**: Create single InventoryService with consistent methods

### 🟡 UNUSED METHODS

1. **Never Called in Production Workflows**:
   - `ApiService.transform(data, transformer)` - Base method never used
   - `LocalService.*` - All local development methods (only used in local mode)
   - `HelmService.template(directory, options)` - Template rendering never used
   - `HelmService.generateIndex(directory, options)` - Index generation unused in workflows
   - `GraphQLService.getRepositoryType(owner)` - Only used internally in RestService

2. **Internal Helper Methods**:
   - `RestService.#paginate()` - Only used by getUpdatedFiles
   - `RestService.#getReleaseIds()` - Only used by deleteReleases
   - `UpdateService.#generateIndex()` - Only used by metadata update
   - `UpdateService.#mergeEntries()` - Only used by metadata update
   - `PackageService.#getPackages()` - Only used by get method

### 🔴 BAD USAGE PATTERNS

1. **Template Service Misuse**:
   ```javascript
   // WRONG: Passing unused repoUrl option
   service.render(content, templateData, { repoUrl })
   // CORRECT: Only pass when template uses RepoRawURL helper
   service.render(content, templateData)
   ```

2. **Parameter Object Anti-Pattern**:
   ```javascript
   // WRONG: Parameter objects
   issueService.report({
     context: this.context,
     templateContent,
     templateService: this.templateService
   })
   // CORRECT: Individual parameters
   issueService.report(context, labelService, { content, service })
   ```

3. **Redundant Error Handling**:
   ```javascript
   // WRONG: Redundant fallback
   }, false) || false;
   // CORRECT: Function already returns boolean
   }, false);
   ```

4. **Inefficient File Operations**:
   ```javascript
   // WRONG: Check then read
   if (await this.fileService.exists(file)) {
     const content = await this.fileService.read(file);
   }
   // CORRECT: Read and check result
   const content = await this.fileService.read(file);
   if (!content) return null;
   ```

### 🟡 MISSING VALIDATIONS

1. **Critical Path Validation Missing**:
   - `GitService.signedCommit()` - No validation if files array is empty
   - `RestService.createIssue()` - No validation of title/body content
   - `HelmService.package()` - No validation of chart directory structure
   - `FileService.writeYaml()` - No validation of content before YAML serialization

2. **Template Validation Issues**:
   - `TemplateService.render()` - No validation of template syntax
   - `PublishService.generateContent()` - No validation of template variables
   - `FrontpageService.generate()` - No validation of chart data structure

### 🔴 PRODUCTION CRITICAL METHODS (PRIORITY FIX)

**These methods are called in every workflow run and must be perfect**:

1. **High Frequency** (called multiple times per workflow):
   - `FileService.readYaml()` - 15+ calls per workflow
   - `FileService.writeYaml()` - 8+ calls per workflow
   - `ShellService.execute()` - 10+ calls per workflow
   - `GitService.signedCommit()` - 4+ calls per workflow
   - `RestService.getUpdatedFiles()` - Called in both workflows

2. **Critical Path** (workflow fails if these fail):
   - `GitService.configure()` - Repository setup
   - `RestService.createIssue()` - Error reporting
   - `UpdateService.application()` - Chart updates
   - `PublishService.github()` - Release publishing
   - `FrontpageService.generate()` - Site generation

3. **Error Prone** (recently had bugs):
   - `IssueService.report()` - Template rendering issues
   - `IssueService.#validate()` - Workflow logs 404 errors
   - `TemplateService.render()` - Null return values
   - `RestService.getWorkflowRunLogs()` - 404 handling needed

---

## Method Analysis Checklist

### 1. Parameter Consistency
- **Single Parameters**: Use individual parameters (`name, color, description`) not parameter objects
- **Parameter Order**: Context/ID first, then services, then optional objects with defaults
- **Default Values**: Use proper defaults (`= []`, `= {}`) for optional parameters
- **Parameter Naming**: Short, clear names (`id` not `context.runId`, `label` not `labelService`)

### 2. Error Handling Patterns
- **No try/catch blocks**: Use `execute()` method with `fatal: true/false`
- **Null handling**: Check for null returns and handle appropriately (`if (!data) return false;`)
- **Early returns**: Use single-line conditionals (`if (!valid) return null;`)
- **Error context**: Provide operation names for execute method

### 3. Method Structure Standards
- **Constructor first**: Always first method in class
- **Alphabetical order**: All other methods in alphabetical order
- **No comments in bodies**: Method bodies contain zero comments
- **No blank lines**: Method bodies contain zero blank lines inside
- **Single responsibility**: Each method does one clear operation

### 4. Return Value Consistency
- **Consistent types**: Same operation types return same data structure
- **Null on failure**: Failed operations return null, not empty objects/strings
- **Boolean clarity**: Clear true/false returns for validation methods
- **Data transformation**: Transform at service boundary, not in callers

### 5. Dependency Usage
- **Direct calls**: Use service methods directly, avoid unnecessary wrapper methods
- **Parameter passing**: Pass only required data, not entire objects when single values needed
- **Service boundaries**: Keep API calls in Rest/GraphQL services, business logic in domain services
- **Template usage**: Pass only required template options, validate template rendering results

### 6. Variable Naming and Usage
- **Destructuring**: Use proper destructuring (`const { content, service } = template`)
- **Single purpose**: Variables used for one purpose only
- **No redundant variables**: Avoid `contextToUse = context || this.context` patterns
- **Clear names**: `labelName` in loops to avoid conflicts with parameters

### 7. API Integration Patterns
- **REST vs GraphQL**: Use REST for simple CRUD, GraphQL for complex operations/signed commits
- **Parameter objects**: API methods use individual parameters, not parameter objects
- **Response handling**: Check response validity before accessing properties
- **Status code handling**: Handle expected errors (404) gracefully without try/catch

### 8. Template and Content Handling
- **Template validation**: Check template content exists before rendering
- **Content type validation**: Ensure rendered content is correct type (string for issue body)
- **Helper registration**: Only register template helpers when needed by specific templates
- **Context data**: Pass only required context variables to templates

### 9. File and Git Operations
- **Atomic operations**: Group related file changes for single commits
- **Status checking**: Check git status before assuming file changes
- **Path handling**: Use path.join() for cross-platform compatibility
- **Existence checks**: Verify files exist before operations

### 10. Configuration and Environment
- **Configuration access**: Use config.get() with dot notation
- **Environment variables**: Access through proper channels, not direct process.env
- **Default values**: Provide sensible defaults for all configuration
- **Type consistency**: Ensure configuration values match expected types

## Common Anti-Patterns to Eliminate

### Parameter Anti-Patterns
- ❌ `async method(params)` with object destructuring
- ❌ `const contextToUse = context || this.context`
- ❌ Passing entire objects when only single properties needed
- ❌ Missing default values for optional parameters

### Error Handling Anti-Patterns
- ❌ `try/catch` blocks anywhere in the codebase
- ❌ Converting null to empty strings/objects
- ❌ `|| false` when function already returns boolean
- ❌ Not checking for null before using response data

### Method Structure Anti-Patterns
- ❌ Comments inside method bodies
- ❌ Blank lines inside method bodies
- ❌ Methods not in alphabetical order
- ❌ Multiple responsibilities in single method

### Service Usage Anti-Patterns
- ❌ One-liner wrapper methods that just delegate
- ❌ Business logic in API service methods
- ❌ API calls outside of Rest/GraphQL services
- ❌ Inconsistent service method signatures

### Template Anti-Patterns
- ❌ Passing template helpers when not used by template
- ❌ Not validating template rendering results
- ❌ Redundant context variables and options
- ❌ Not checking template content exists

## Analysis Process Per Class

### Phase 1: Structure Analysis
1. Verify constructor is first method
2. Confirm all methods in alphabetical order
3. Check no comments in method bodies
4. Verify no blank lines in method bodies
5. Validate import order (Node.js, third-party, internal - all alphabetical)

### Phase 2: Method Signature Analysis
1. Check parameter patterns match established conventions
2. Verify proper default values for optional parameters
3. Ensure parameter names are concise and clear
4. Validate return type consistency across similar methods

### Phase 3: Implementation Analysis
1. Verify error handling uses execute() pattern
2. Check for proper null handling
3. Validate early return patterns
4. Ensure single responsibility per method

### Phase 4: Integration Analysis
1. Check service boundary adherence
2. Validate API call patterns
3. Verify template usage correctness
4. Ensure configuration access patterns

### Phase 5: Performance and Efficiency Analysis
1. Identify redundant operations
2. Check for unnecessary data transformation
3. Validate optimal service usage
4. Ensure minimal parameter passing

## Success Criteria

Each method must pass ALL criteria:
- ✅ Follows established parameter patterns
- ✅ Uses proper error handling
- ✅ Maintains structural consistency
- ✅ Respects service boundaries
- ✅ Handles edge cases properly
- ✅ Returns consistent data types
- ✅ Uses efficient implementations
- ✅ Passes integration validation

## Class Review Status

### Core Classes
- [ ] `/core/Action.js` - Base action class with lifecycle hooks
- [ ] `/core/Configuration.js` - Configuration management with dot notation
- [ ] `/core/Error.js` - Standardized error handling and reporting
- [ ] `/core/Logger.js` - Structured logging with levels

### Service Classes - File & System
- [ ] `/services/File.js` - File system operations and YAML handling
- [ ] `/services/Git.js` - Git operations and signed commits
- [ ] `/services/Shell.js` - Shell command execution
- [ ] `/services/Template.js` - Handlebars template rendering

### Service Classes - GitHub API
- [ ] `/services/github/Api.js` - Base GitHub API service
- [ ] `/services/github/Rest.js` - GitHub REST API operations
- [ ] `/services/github/GraphQL.js` - GitHub GraphQL API operations

### Service Classes - Business Logic
- [ ] `/services/Issue.js` - GitHub issue management
- [ ] `/services/Label.js` - Repository label operations
- [ ] `/services/Frontpage.js` - Repository frontpage generation

### Service Classes - Chart Operations
- [ ] `/services/chart/index.js` - Chart discovery and validation
- [ ] `/services/chart/Update.js` - Chart file updates and commits

### Service Classes - Helm Operations
- [ ] `/services/helm/index.js` - Helm CLI operations
- [ ] `/services/helm/Docs.js` - Helm documentation generation

### Service Classes - Release Management
- [ ] `/services/release/index.js` - Release management and packaging
- [ ] `/services/release/Local.js` - Local development releases
- [ ] `/services/release/Package.js` - Chart packaging operations
- [ ] `/services/release/Publish.js` - Release publishing to GitHub/OCI

### Handler Classes
- [ ] `/handlers/Chart.js` - Chart update orchestration
- [ ] `/handlers/Workflow.js` - Common workflow operations
- [ ] `/handlers/release/Local.js` - Local release handler
- [ ] `/handlers/release/index.js` - Release handler with exports

## PRIORITY-ORDERED CLASS REVIEW STATUS

### 🔴 CRITICAL PRIORITY (Called 10+ times per workflow)

#### `/services/File.js` - File system operations and YAML handling
**Status**: [ ] Not Started  
**Priority**: 🔴 CRITICAL (15+ calls per workflow)  
**Issues**: 4 major fixes needed

##### Methods Analysis:
- [ ] `constructor(params)` - ✅ Correct
- [ ] `#extractPath(file, pattern)` - ✅ Correct (private helper)
- [ ] `copy(source, destination, options = {})` - 🔧 **NEEDS FIX**:
  - Remove redundant `exists()` check before copy operation
  - Parameter object `options = {}` follows correct pattern
- [ ] `createDir(directory, options = {})` - ✅ Correct
- [ ] `delete(file)` - 🔧 **NEEDS FIX**:
  - Remove redundant `exists()` check (logs 'not found' then returns)
  - Just attempt delete and handle error
- [ ] `exists(file)` - ❌ **USAGE ISSUE**: Overused before read operations
- [ ] `filter(directories, fileTypes)` - ✅ Correct
- [ ] `filterPath(files, patterns)` - ✅ Correct
- [ ] `find(pattern, options = {})` - ✅ Correct
- [ ] `getStats(file)` - ✅ Correct
- [ ] `listDir(directory, options = {})` - ✅ Correct
- [ ] `read(file, options = {})` - 🔧 **NEEDS FIX**:
  - Already checks existence and logs warning
  - Other methods should use this instead of exists() + read()
- [ ] `readYaml(file)` - 🔴 **CRITICAL FIX**:
  - Most called method (15+ times per workflow)
  - Currently calls read() which already handles file existence
  - Add better error handling for malformed YAML
  - Ensure consistent return (null vs throw)
- [ ] `write(file, content, options = {})` - ✅ Correct
- [ ] `writeYaml(file, content, options = {})` - 🔧 **NEEDS FIX**:
  - Called 8+ times per workflow
  - Add validation of content before YAML serialization
  - Ensure content is not null/undefined

##### Method Dependencies:
- `readYaml()` → calls `read()` → already checks `exists()`
- `writeYaml()` → calls `write()` → calls `createDir()`
- `copy()` → unnecessarily calls `exists()` then native `copyFile()`
- `delete()` → unnecessarily calls `exists()` then native `unlink()`

##### Critical Usage Patterns:
- `UpdateService.application()` → calls `readYaml()` 2 times per chart
- `UpdateService.lock()` → calls `readYaml()` 1 time per chart  
- `UpdateService.metadata()` → calls `readYaml()` 2 times + `writeYaml()` 1 time per chart
- `UpdateService.inventory()` → calls `readYaml()` + `writeYaml()` per inventory
- `ChartService.discover()` → calls `exists()` for each chart found
- `FrontpageService.generate()` → calls `readYaml()` for each chart

---

[Additional classes continue with same detailed format...]

### Progress Summary
- **Total Classes**: 22
- **Priority Critical**: 4 classes (File, Git, Rest, Shell)
- **High Priority**: 3 classes (Template, Issue, Action)
- **Medium Priority**: 8 classes 
- **Low Priority**: 5 classes
- **Unused**: 2 classes
- **Current Focus**: Not started

---
