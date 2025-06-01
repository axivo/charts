# Refactoring Session 1: Dependency Injection Foundation

## 🎯 **Session Objective**
Fix the critical dependency injection failures across all handler classes to eliminate service instantiation anti-patterns for improved code maintainability and debugging.

## 📊 **Current State**
- **Service Violation Rate**: 6/7 methods (86%)
- **Total New Instances Created**: 35+ across all methods
- **Root Cause**: Handler methods creating new service instances instead of using constructor injection

## 🎯 **Target State**
- **Service Violation Rate**: 0/7 methods (0%)
- **Total New Instances Created**: 0 (all use constructor injection)
- **Pattern**: All services accessed via `this.serviceInstance.method()`

## 📋 **Implementation Steps**

### **Step 1: Fix `/handlers/Workflow.js`**

#### **Current Constructor Issues:**
```javascript
constructor(params) {
  params.config = config;
  super(params);
  this.frontpageService = new Frontpage(params);
  this.gitService = new Git(params);
  this.issueService = new Issue(params);
  this.labelService = new Label(params);
  this.templateService = new Template(params);
  this.fileService = new File(params);
  // ❌ Missing: chartService, releaseService, docsService
}
```

#### **Fix Constructor:**
```javascript
constructor(params) {
  params.config = config;
  super(params);
  
  // Existing services
  this.frontpageService = new Frontpage(params);
  this.gitService = new Git(params);
  this.issueService = new Issue(params);
  this.labelService = new Label(params);
  this.templateService = new Template(params);
  this.fileService = new File(params);
  
  // Add missing services
  this.chartService = new Chart(params);
  this.releaseService = new Release(params);
  this.docsService = new Docs(params);
}
```

#### **Fix Methods:**

**Method: `installHelmDocs()`**
```javascript
// BEFORE:
async installHelmDocs(version) {
  return this.execute('install helm-docs', async () => {
    const docsService = new Docs({          // ❌ VIOLATION
      github: this.github,
      context: this.context,
      core: this.core,
      exec: this.exec,
      config: this.config
    });
    await docsService.install(version);
  });
}

// AFTER:
async installHelmDocs(version) {
  return this.execute('install helm-docs', async () => {
    await this.docsService.install(version);  // ✅ Use constructor service
  });
}
```

**Method: `updateCharts()`**
```javascript
// BEFORE:
async updateCharts() {
  return this.execute('update charts', async () => {
    this.logger.info('Starting the charts update process...');
    const chartHandler = new Chart({         // ❌ VIOLATION
      github: this.github,
      context: this.context,
      core: this.core,
      exec: this.exec,
      config: this.config
    });
    const result = await chartHandler.process();
    this.logger.info('Successfully completed the charts update process');
    return result;
  });
}

// AFTER:
async updateCharts() {
  return this.execute('update charts', async () => {
    this.logger.info('Starting the charts update process...');
    const result = await this.chartService.process();  // ✅ Use constructor service
    this.logger.info('Successfully completed the charts update process');
    return result;
  });
}
```

**Method: `processReleases()`**
```javascript
// BEFORE:
async processReleases() {
  return this.execute('process chart releases', async () => {
    this.logger.info('Processing chart releases...');
    const releaseHandler = new Release({     // ❌ VIOLATION
      github: this.github,
      context: this.context,
      core: this.core,
      exec: this.exec,
      config: this.config
    });
    await releaseHandler.process();
    this.logger.info('Chart release process complete');
  });
}

// AFTER:
async processReleases() {
  return this.execute('process chart releases', async () => {
    this.logger.info('Processing chart releases...');
    await this.releaseService.process();     // ✅ Use constructor service
    this.logger.info('Chart release process complete');
  });
}
```

### **Step 2: Fix `/services/Frontpage.js`**

#### **Add Chart Service to Constructor:**
```javascript
// BEFORE:
constructor(params) {
  super(params);
  this.fileService = new File(params);
  this.templateService = new Template(params);
}

// AFTER:
constructor(params) {
  super(params);
  this.fileService = new File(params);
  this.templateService = new Template(params);
  this.chartService = new Chart(params);    // ✅ Add to constructor
}
```

#### **Fix `generate()` Method:**
```javascript
// BEFORE:
async generate() {
  return this.execute('generate repository frontpage', async () => {
    this.logger.info('Generating repository frontpage...');
    const chartService = new Chart({         // ❌ VIOLATION
      github: this.github,
      context: this.context,
      core: this.core,
      exec: this.exec,
      config: this.config
    });
    const charts = await chartService.discover();
    // ... rest of method
  });
}

// AFTER:
async generate() {
  return this.execute('generate repository frontpage', async () => {
    this.logger.info('Generating repository frontpage...');
    const charts = await this.chartService.discover(); // ✅ Use constructor service
    // ... rest of method
  });
}
```

### **Step 3: Fix `/services/chart/index.js`**

#### **Add Services to Constructor:**
```javascript
// BEFORE:
constructor(params) {
  super(params);
  // ❌ Missing services
}

// AFTER:
constructor(params) {
  super(params);
  this.fileService = new File(params);      // ✅ Add to constructor
  this.helmService = new Helm(params);      // ✅ Add to constructor
  this.shellService = new Shell(params);    // ✅ Add to constructor
}
```

#### **Fix `discover()` Method:**
```javascript
// BEFORE:
async discover() {
  return this.execute('discover charts', async () => {
    const charts = { application: [], library: [], total: 0 };
    const fileService = new File({           // ❌ VIOLATION
      github: this.github,
      context: this.context,
      core: this.core,
      exec: this.exec,
      config: this.config
    });
    // ... rest of method
  });
}

// AFTER:
async discover() {
  return this.execute('discover charts', async () => {
    const charts = { application: [], library: [], total: 0 };
    // Use this.fileService instead of creating new instance
    // ... rest of method
  });
}
```

### **Step 4: Fix `/services/Issue.js`**

#### **Add REST Service to Constructor:**
```javascript
// BEFORE:
constructor(params) {
  super(params);
  this.graphqlService = new GraphQL(params);
  // ❌ Missing GitHub.Rest service
}

// AFTER:
constructor(params) {
  super(params);
  this.graphqlService = new GraphQL(params);
  this.restService = new Rest(params);      // ✅ Add to constructor
}
```

#### **Fix `#validate()` Method:**
```javascript
// BEFORE:
async #validate(context) {
  try {
    let hasFailures = false;
    const restService = new Rest({           // ❌ VIOLATION
      github: this.github,
      context: context,
      core: this.core,
      exec: this.exec,
      config: this.config
    });
    const jobs = await restService.listJobs(context);
    // ... rest of method
  }
}

// AFTER:
async #validate(context) {
  try {
    let hasFailures = false;
    const jobs = await this.restService.listJobs(context); // ✅ Use constructor service
    // ... rest of method
  }
}
```

## 🧪 **Validation**

### **After Each Fix:**
1. Run the workflow
2. Check logs for cleaner service patterns
3. Verify functionality unchanged

### **Session Complete When:**
- [ ] Zero `new Service()` calls in handler methods
- [ ] All services accessed via `this.serviceInstance`
- [ ] Constructor properly initializes all required services
- [ ] Workflow logs show cleaner patterns
- [ ] All functionality works the same

## 📋 **Execution Checklist**
- [ ] Fix `/handlers/Workflow.js` constructor and methods
- [ ] Fix `/services/Frontpage.js` constructor and methods
- [ ] Fix `/services/chart/index.js` constructor and methods
- [ ] Fix `/services/Issue.js` constructor and methods
- [ ] Run workflows and verify functionality
- [ ] Check logs for improved patterns

---
**Session 1 Priority**: CRITICAL - Foundation for all subsequent refactoring  
**Estimated Effort**: 4-6 hours  
**Risk Level**: HIGH (touches core architecture)
