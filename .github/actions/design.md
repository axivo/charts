# GitHub Actions Architecture Design Document

This document provides the essential architectural understanding needed to work effectively with the GitHub Actions codebase and maintain code uniformity.

## 🎯 **DOCUMENT PURPOSE**

**Primary Goal**: Enable consistent understanding of the codebase architecture, design patterns, and critical concepts to maintain code uniformity.

**When to Use**: Start every session by reading this document to understand the foundational architecture before making any code changes.

---

## 🏗️ **CORE ARCHITECTURAL PRINCIPLES**

### **1. Layered Architecture Pattern**
```
Workflows → Handlers → Services → Core → External APIs
```

**Key Concept**: Each layer has specific responsibilities and dependencies flow downward only.

- **Workflows**: GitHub Actions entry points (chart.yml, release.yml)
- **Handlers**: High-level orchestration (Chart, Workflow, Release handlers)
- **Services**: Business logic implementation (File, Git, GitHub API, Release services)
- **Core**: Foundation classes (Action, Configuration, Error, Logger)
- **External**: GitHub API, Helm CLI, File System, Shell commands

### **2. Dependency Injection Pattern**
```javascript
// All services receive dependencies via constructor
class ServiceName extends Action {
  constructor(params) {
    super(params);
    this.fileService = new FileService(params);
    this.gitService = new GitService(params);
  }
}
```

**Key Concept**: Services are stateless and receive all dependencies through constructor injection.

### **3. Execute Pattern for Error Handling**
```javascript
// MANDATORY pattern for all operations
async methodName() {
  return this.execute('operation description', async () => {
    // Method implementation here
    // NO try/catch blocks allowed
  }, fatal = true);
}
```

**Key Concept**: ALL error handling goes through the `execute()` method. NO try/catch blocks anywhere in the codebase.

---

## 🔑 **CRITICAL ARCHITECTURAL DISTINCTION**

### **Chart Types vs Directory Paths - FUNDAMENTAL CONCEPT**

**This is the most important architectural concept to understand:**

```javascript
// CHART TYPES (business logic identifiers - FIXED)
const chartTypes = ['application', 'library']; // Defined by Helm specification

// DIRECTORY PATHS (configurable file system locations - VARIABLE)
const appDirectory = this.config.get('repository.chart.type.application'); // Could be 'apps', 'charts/app', etc.
const libDirectory = this.config.get('repository.chart.type.library');     // Could be 'libs', 'shared', etc.
```

**ARCHITECTURAL RULES:**
1. **Business Logic**: Always use chart types (`'application'`, `'library'`)
2. **File System**: Always use directory paths (`this.config.get('repository.chart.type.application')`)
3. **Data Objects**: Set `obj.type = 'application'` (chart type), NEVER `obj.type = directoryPath`
4. **Comparisons**: Compare chart types with chart types, paths with paths

**Why This Matters**: Developers can customize directory names without breaking business logic.

**Example of Correct Separation:**
```javascript
// ✅ CORRECT: Business logic uses chart types
if (package.type === 'application') {
  // Publishing logic for application charts
}

// ✅ CORRECT: File operations use directory paths
const chartDir = this.config.get('repository.chart.type.application');
const files = await this.fileService.listDir(chartDir);

// ❌ WRONG: Mixing chart types with directory paths
if (package.type === this.config.get('repository.chart.type.application')) {
  // This breaks if directory is renamed!
}
```

---

## 🛠️ **SERVICE ARCHITECTURE PATTERNS**

### **1. Action Base Class Pattern**
```javascript
class ServiceName extends Action {
  constructor(params) {
    super(params); // Inherits execute(), logger, config, context
    // Service-specific dependencies
  }
  
  // All methods use execute() pattern
  async methodName() {
    return this.execute('operation', async () => {
      // Implementation
    });
  }
}
```

**Key Concepts:**
- All services extend Action base class
- Constructor first, then methods in alphabetical order
- No comments in method bodies, no blank lines in methods

### **2. Service Composition Pattern**
```javascript
// Services compose other services, never directly call external APIs
class BusinessService extends Action {
  constructor(params) {
    super(params);
    this.fileService = new FileService(params);    // File operations
    this.gitService = new GitService(params);      // Git operations
    this.githubService = new GitHubService(params); // API operations
  }
}
```

**Key Concept**: Services use other services, maintaining clear boundaries.

### **3. Configuration Access Pattern**
```javascript
// Dot notation for nested values
const repoUrl = this.config.get('repository.url');
const userEmail = this.config.get('repository.user.email');

// Chart type access
const appPath = this.config.get('repository.chart.type.application');
const libPath = this.config.get('repository.chart.type.library');
```

**Key Concept**: Use dot notation for configuration values, understand what values represent.

---

## 📊 **DATA FLOW PATTERNS**

### **1. Inventory-Based Architecture**
```javascript
// Modern pattern: Use inventory files for chart discovery
const inventory = await this.fileService.readYaml(`${type}/inventory.yaml`);
const charts = inventory[type].filter(chart => chart.status !== 'removed');

// Legacy pattern: File system scanning (being phased out)
const files = await this.fileService.find('**/Chart.yaml');
```

**Key Concept**: The codebase is migrating from file system scanning to inventory-based chart management.

### **2. Package Object Pattern**
```javascript
// CORRECT: Package objects contain chart types
const packages = await this.getPackages(directory);
packages.forEach(pkg => {
  pkg.type = 'application'; // Chart type identifier
});

// WRONG: Package objects contain directory paths
pkg.type = this.config.get('repository.chart.type.application'); // Directory path!
```

**Key Concept**: Business objects should contain chart types, not directory paths.

---

## 🔄 **WORKFLOW EXECUTION PATTERNS**

### **1. Chart Workflow (Pull Request Context)**
```
Entry: .github/workflows/chart.yml
Flow: configureRepository → updateLabels → updateCharts → reportIssue
Core: Update chart files, regenerate docs, commit changes
```

### **2. Release Workflow (Main Branch Context)**
```
Entry: .github/workflows/release.yml  
Flow: configureRepository → processReleases → setFrontpage → reportIssue
Core: Package charts, create releases, publish to registries
```

**Key Concept**: Different workflows handle different Git events with specific responsibilities.

### **3. Local Development Pattern**
```javascript
// Local mode: Different behavior for development
if (this.config.get('repository.release.deployment') === 'local') {
  // Use LocalService for development-specific operations
  return await this.localService.processCharts(charts);
}
```

**Key Concept**: The system supports both production and local development modes.

---

## 🎯 **CRITICAL DESIGN DECISIONS**

### **1. No try/catch Philosophy**
**Decision**: All error handling goes through `execute()` method
**Reason**: Consistent error reporting, GitHub Actions integration, context preservation
**Implementation**: Replace any try/catch with execute() pattern

### **2. Individual Parameters Philosophy**
**Decision**: Methods use individual parameters, not parameter objects
**Reason**: Type safety, clarity, consistent signatures
**Implementation**: `method(param1, param2)` NOT `method({param1, param2})`

### **3. Stateless Services Philosophy**
**Decision**: Services maintain no instance state between operations
**Reason**: Predictability, testability, scalability
**Implementation**: All data passed through method parameters

### **4. Alphabetical Method Ordering Philosophy**
**Decision**: All methods ordered alphabetically after constructor
**Reason**: Consistency, maintainability, easy navigation
**Implementation**: Constructor first, then A-Z method ordering

---

## 🧩 **SERVICE INTEGRATION PATTERNS**

### **1. File Operations Pattern**
```javascript
// Standard file operation sequence
const content = await this.fileService.readYaml(file);
if (!content) return null; // Don't check exists() separately
await this.fileService.writeYaml(file, modifiedContent);
```

**Key Concept**: File operations handle existence checking internally.

### **2. Git Operations Pattern**
```javascript
// Standard git operation sequence
await this.gitService.configure(); // Set user identity
await this.fileService.writeYaml(file, content); // Make changes
await this.gitService.signedCommit(branch, [file], message); // Commit via API
```

**Key Concept**: Git operations use GitHub API for signed commits, not local git.

### **3. GitHub API Pattern**
```javascript
// REST for simple operations
const release = await this.restService.createRelease(tag, name, body);

// GraphQL for complex operations (signed commits)
await this.graphqlService.createSignedCommit(branch, options);
```

**Key Concept**: Choose REST vs GraphQL based on operation complexity.

### **4. Template Rendering Pattern**
```javascript
// Template rendering with context
const content = await this.fileService.read(templatePath);
const rendered = this.templateService.render(content, context);
if (!rendered) return null; // Always check template results
```

**Key Concept**: Always validate template rendering results.

---

## ⚠️ **COMMON ANTI-PATTERNS TO AVOID**

### **1. Chart Type Confusion**
```javascript
// WRONG: Using directory path as chart type
if (chart.type === this.config.get('repository.chart.type.application')) {}

// CORRECT: Using chart type for business logic
if (chart.type === 'application') {}
```

### **2. Parameter Object Anti-Pattern**
```javascript
// WRONG: Parameter objects
async method({param1, param2, param3}) {}

// CORRECT: Individual parameters
async method(param1, param2, param3) {}
```

### **3. Error Handling Anti-Pattern**
```javascript
// WRONG: try/catch blocks
try { 
  await operation(); 
} catch (error) { 
  handle(error); 
}

// CORRECT: execute() pattern
await this.execute('operation', async () => {
  await operation();
});
```

---

## 🔧 **DEVELOPMENT GUIDELINES**

### **1. When Adding New Methods**
- Extend Action base class
- Use execute() pattern for all operations
- Follow individual parameter pattern
- Maintain alphabetical ordering
- No comments in method body
- No blank lines in method body

### **2. When Modifying Existing Code**
- Preserve existing patterns exactly
- Don't add "improvements" not requested
- Maintain backward compatibility
- Follow chart type vs directory path rules

### **3. When Working with Charts**
- Use chart types for business logic
- Use directory paths for file operations
- Never mix the two concepts
- Understand inventory-based vs file scanning approaches

---

## 📋 **QUICK REFERENCE CHECKLIST**

### **Before Making Any Changes:**
- [ ] Is this a chart type or directory path operation?
- [ ] Am I using the execute() pattern?
- [ ] Are parameters individual (not objects)?
- [ ] Am I following existing patterns exactly?
- [ ] Do I understand the service boundaries?

### **Architecture Understanding Check:**
- [ ] I understand chart types vs directory paths
- [ ] I know the layered architecture flow
- [ ] I understand the execute() error handling pattern
- [ ] I know when to use REST vs GraphQL
- [ ] I understand the inventory-based approach

---

## 🎯 **SUCCESS INDICATORS**

**You understand the architecture when you can:**
1. **Distinguish** chart types from directory paths without thinking
2. **Choose** the right service for each operation
3. **Apply** the execute() pattern automatically
4. **Follow** existing patterns without "improving" them
5. **Navigate** the service dependencies confidently

**This document provides the essential architectural foundation for consistent, high-quality code modifications that maintain uniformity with the existing codebase design.**
