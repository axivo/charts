# Refactoring Session 2: Service Architecture Cleanup

## 🎯 **Session Objective**
Refactor and optimize the most violated service classes to eliminate redundant service instantiation within service layers for better error isolation and debugging.

## 📊 **Current State**
- **Most Violated Services**: File.js, GitHub.Rest.js, Chart/index.js
- **Service-to-Service Violations**: Services creating other services unnecessarily
- **Circular Dependencies**: File service creating File service in Git.getStagedChanges()
- **Redundant API Calls**: Multiple GitHub.Rest instances causing unnecessary API usage

## 🎯 **Target State**
- **Clean Service Architecture**: Services use injected dependencies for clearer error tracing
- **Elimination of Service Chains**: No service creating another service mid-operation
- **Optimized GitHub Services**: Single GitHub.Rest instance to reduce API calls and improve log clarity
- **Standardized Patterns**: All services follow consistent DI patterns for easier debugging

## 📋 **Implementation Steps**

### **Step 1: Fix `/services/Git.js`**

#### **Add File Service to Constructor:**
```javascript
// BEFORE:
constructor(params) {
  super(params);
  this.shellService = new Shell(params);
  this.graphqlService = new GraphQL(params);
  // ❌ Missing File service
}

// AFTER:
constructor(params) {
  super(params);
  this.shellService = new Shell(params);
  this.graphqlService = new GraphQL(params);
  this.fileService = new File(params);      // ✅ Add to constructor
}
```

#### **Fix `getStagedChanges()` Method:**
```javascript
// BEFORE:
async getStagedChanges() {
  // ... other code ...
  const fileService = new File({...});      // ❌ VIOLATION - creates File in Git service
  const fileContent = await fileService.read(file);
  // ...
}

// AFTER:
async getStagedChanges() {
  // ... other code ...
  const fileContent = await this.fileService.read(file);  // ✅ Use constructor service
  // ...
}
```

### **Step 2: Fix Chart Service Dependencies**

#### **Ensure Chart Service Has All Dependencies:**
```javascript
// In `/services/chart/index.js` constructor:
constructor(params) {
  super(params);
  this.fileService = new File(params);      // ✅ Already added in Session 1
  this.helmService = new Helm(params);      // ✅ Already added in Session 1  
  this.shellService = new Shell(params);    // ✅ Already added in Session 1
}
```

#### **Fix `find()` Method:**
```javascript
// BEFORE:
async find(files) {
  return this.execute('find modified charts', async () => {
    const charts = { application: [], library: [], total: 0 };
    const fileService = new File({           // ❌ VIOLATION
      github: this.github,
      context: this.context,
      core: this.core,
      exec: this.exec,
      config: this.config
    });
    const chartDirs = fileService.filterPath(files, chartTypes);
    // ...
  });
}

// AFTER:
async find(files) {
  return this.execute('find modified charts', async () => {
    const charts = { application: [], library: [], total: 0 };
    const chartDirs = this.fileService.filterPath(files, chartTypes);  // ✅ Use injected service
    // ...
  });
}
```

### **Step 3: Fix Label Service (if exists)**

#### **Find Label Service File:**
- Look for `/services/Label.js` or similar
- Check if it creates GitHub.Rest internally

#### **Standard Pattern:**
```javascript
// Ensure constructor has REST service:
constructor(params) {
  super(params);
  this.restService = new Rest(params);      // ✅ Single instance
}

// All methods use this.restService instead of creating new instances
```

### **Step 4: Fix Any Other Service-to-Service Violations**

#### **Search for Violations:**
```bash
# Find any remaining service instantiation in service files:
grep -r "new.*Service\|new.*Rest\|new.*GraphQL" /services/
```

#### **Standard Fix Pattern:**
1. **Move to Constructor:** Any `new Service()` found in methods
2. **Use Constructor Service:** Replace with `this.serviceInstance`
3. **Test:** Run workflow to verify functionality

## 🧪 **Validation**

### **After Each Fix:**
1. **Service Creation Logs**: Verify no duplicate service instantiation messages
2. **API Call Reduction**: Confirm fewer redundant GitHub API calls in logs
3. **Error Tracing**: Verify error messages trace back through cleaner service chains
4. **Debugging Clarity**: Confirm service-related errors are easier to isolate

### **Session Complete When:**
- [ ] No service-to-service instantiation in methods
- [ ] All services use constructor injection pattern  
- [ ] No circular service dependencies
- [ ] Cleaner service instantiation patterns in logs
- [ ] Reduced redundant API call logging
- [ ] Better error isolation between services

## 📋 **Execution Checklist**
- [ ] Fix `/services/Git.js` constructor and methods
- [ ] Fix Chart service dependencies and methods
- [ ] Fix Label service (if exists) constructor and methods
- [ ] Search for and fix any remaining service-to-service violations
- [ ] Run workflows and verify functionality
- [ ] Check logs for cleaner service patterns

---
**Session 2 Priority**: HIGH - Service architecture foundation  
**Estimated Effort**: 3-4 hours    
**Risk Level**: MEDIUM (refactoring existing service patterns)
