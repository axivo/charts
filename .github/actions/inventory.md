# Inventory System Optimization Tracking

This document tracks opportunities to optimize the codebase by using inventory.yaml files instead of directory scanning for chart discovery and validation.

## 📊 **CURRENT STATUS**

### **✅ COMPLETED OPTIMIZATIONS**
- ✅ **FrontpageService.generate()** - Uses `getChartTypes()` for inventory reads
- ✅ **ChartService.discover()** - Uses `getChartTypes()` for dynamic discovery  
- ✅ **ChartService.getInventory()** - Enhanced inventory access
- ✅ **ReleaseHandler.process()** - Uses `getChartTypes()` for deletion and chart building
- ✅ **PublishService.generateIndexes()** - Uses `getChartTypes()` for index generation
- ✅ **LocalService.getLocalFiles()** - Updated to use inventory system and `getChartTypes()`
- ✅ **UpdateService.inventory()** - Fixed to properly update inventory.yaml when Chart.yaml changes

## 🚨 **REMAINING OPPORTUNITIES**

### **🔴 HIGH PRIORITY**

#### **1. ChartService.find() - CRITICAL**
**File**: `/services/chart/index.js` lines ~75-95
**Impact**: HIGH - Called every workflow run in ChartHandler.process()
**Current Behavior**: Uses file system scanning with `filterPath()` and existence checks
**Optimization Opportunity**: Use inventory lookup instead of file system scanning

**Current Implementation:**
```javascript
async find(files = []) {
  const charts = { application: [], library: [], total: 0 };
  if (!files || !files.length) return charts;
  const chartTypes = this.config.get('repository.chart.type');
  const chartDirs = this.fileService.filterPath(files, chartTypes);
  for (const chartDir of chartDirs) {
    const [type, chartPath] = chartDir.split(':');
    const chartYamlPath = path.join(chartPath, 'Chart.yaml');
    if (await this.fileService.exists(chartYamlPath)) {
      charts[type].push(chartPath);
      charts.total++;
    }
  }
  return charts;
}
```

**Proposed Optimization:**
```javascript
async find(files = []) {
  const charts = { application: [], library: [], total: 0 };
  if (!files || !files.length) return charts;
  
  // Load inventories once
  const chartTypes = this.config.getChartTypes();
  const inventories = await Promise.all(
    chartTypes.map(type => this.getInventory(type))
  );
  
  // Create lookup map: chartPath -> type
  const chartLookup = new Map();
  chartTypes.forEach((type, index) => {
    const typePath = this.config.get(`repository.chart.type.${type}`);
    inventories[index]
      .filter(chart => chart.status !== 'removed')
      .forEach(chart => {
        chartLookup.set(`${typePath}/${chart.name}`, type);
      });
  });
  
  // Filter files against inventory
  const chartTypes = this.config.get('repository.chart.type');
  const chartDirs = this.fileService.filterPath(files, chartTypes);
  for (const chartDir of chartDirs) {
    const [, chartPath] = chartDir.split(':');
    const chartType = chartLookup.get(chartPath);
    if (chartType) {
      charts[chartType].push(chartPath);
      charts.total++;
    }
  }
  
  return charts;
}
```

**Benefits**: 
- ✅ No file system existence checks needed
- ✅ Faster chart validation
- ✅ Automatically excludes removed charts
- ✅ Uses inventory as single source of truth

---

### **🟡 MEDIUM PRIORITY**

#### **2. ReleaseService.find() - WORKFLOW OPTIMIZATION**
**File**: `/services/release/index.js` lines ~60-85
**Impact**: MEDIUM - Used in release workflows
**Current Behavior**: Hardcoded directory path checking with `startsWith()`
**Optimization Opportunity**: Cross-reference with inventory for dynamic type detection

**Current Implementation:**
```javascript
async find(files = {}) {
  // ... setup code
  const appType = this.config.get('repository.chart.type.application');
  const libType = this.config.get('repository.chart.type.library');
  
  for (const file of fileList) {
    if (!file.endsWith('Chart.yaml')) continue;
    const dir = path.dirname(file);
    const isApp = dir.startsWith(appType);
    const isLib = dir.startsWith(libType);
    if (!isApp && !isLib) continue;
    
    if (files[file] === 'removed') {
      result.deleted.push(file);
      continue;
    }
    if (isApp) result.application.push(dir);
    else result.library.push(dir);
  }
}
```

**Proposed Optimization:**
```javascript
async find(files = {}) {
  // ... setup code
  
  // Load inventory lookup
  const chartTypes = this.config.getChartTypes();
  const chartLookup = new Map();
  for (const type of chartTypes) {
    const typePath = this.config.get(`repository.chart.type.${type}`);
    const inventory = await this.chartService.getInventory(type);
    inventory.forEach(chart => {
      chartLookup.set(`${typePath}/${chart.name}/Chart.yaml`, type);
    });
  }
  
  for (const file of fileList) {
    if (!file.endsWith('Chart.yaml')) continue;
    const chartType = chartLookup.get(file);
    if (!chartType) continue;
    
    if (files[file] === 'removed') {
      result.deleted.push(file);
      continue;
    }
    
    const dir = path.dirname(file);
    result[chartType].push(dir);
  }
}
```

**Benefits**:
- ✅ Dynamic chart type detection
- ✅ Scalable for new chart types
- ✅ Eliminates hardcoded path logic
- ✅ Uses inventory for validation

---

### **🟢 LOW PRIORITY**

#### **3. LocalService.getLocalFiles() - DEVELOPMENT OPTIMIZATION**
**File**: `/services/release/Local.js` lines ~120-140
**Impact**: LOW - Local development only
**Current Behavior**: File system filtering based on directory paths
**Optimization Opportunity**: Filter against inventory entries

**Current Implementation:**
```javascript
async getLocalFiles() {
  const chartTypes = this.config.getChartTypes();
  const chartTypePaths = chartTypes.map(type =>
    this.config.get(`repository.chart.type.${type}`)
  );
  const status = await this.gitService.getStatus();
  const allFiles = [...status.modified, ...status.untracked];
  const chartFiles = allFiles.filter(file =>
    chartTypePaths.some(typePath => file.startsWith(typePath))
  );
  const files = {};
  chartFiles.forEach(file => { files[file] = 'modified'; });
  return files;
}
```

**Proposed Optimization:**
```javascript
async getLocalFiles() {
  // Load inventory lookup for validation
  const chartTypes = this.config.getChartTypes();
  const validChartPaths = new Set();
  
  for (const type of chartTypes) {
    const typePath = this.config.get(`repository.chart.type.${type}`);
    const inventory = await this.chartService.getInventory(type);
    inventory
      .filter(chart => chart.status !== 'removed')
      .forEach(chart => {
        validChartPaths.add(`${typePath}/${chart.name}`);
      });
  }
  
  const status = await this.gitService.getStatus();
  const allFiles = [...status.modified, ...status.untracked];
  const chartFiles = allFiles.filter(file => {
    const chartPath = path.dirname(file);
    return validChartPaths.has(chartPath);
  });
  
  const files = {};
  chartFiles.forEach(file => { files[file] = 'modified'; });
  return files;
}
```

**Benefits**:
- ✅ Only processes charts that exist in inventory
- ✅ Excludes removed charts from local processing
- ✅ Consistent with inventory-based approach

---

## 📋 **IMPLEMENTATION CHECKLIST**

### **Phase 1: Critical Path (HIGH PRIORITY)**
- [ ] **ChartService.find()** - Replace file system scanning with inventory lookup
- [ ] **Test chart workflow** - Verify Chart.yaml modifications still trigger updates
- [ ] **Performance validation** - Measure improvement in workflow execution time

### **Phase 2: Release Workflow (MEDIUM PRIORITY)**  
- [ ] **ReleaseService.find()** - Replace hardcoded path logic with inventory lookup
- [ ] **Test release workflow** - Verify release processing works with inventory-based discovery
- [ ] **Scalability validation** - Confirm new chart types work without code changes

### **Phase 3: Local Development (LOW PRIORITY)**
- [ ] **LocalService.getLocalFiles()** - Add inventory filtering
- [ ] **Test local development** - Verify local chart processing works correctly

## 🎯 **SUCCESS CRITERIA**

For each optimization:
- ✅ **Functionality**: No change in external behavior
- ✅ **Performance**: Faster execution (fewer file system operations)
- ✅ **Scalability**: Works with any number of chart types
- ✅ **Consistency**: Uses inventory as single source of truth
- ✅ **Maintainability**: Simpler code, fewer hardcoded references

## 📈 **EXPECTED BENEFITS**

### **Performance Improvements**
- **Fewer file system calls**: Inventory reads vs directory scanning + existence checks
- **Faster workflow execution**: Especially for repositories with many charts
- **Reduced I/O overhead**: Single inventory read vs multiple file checks

### **Architectural Benefits**
- **Single source of truth**: Inventory.yaml becomes authoritative chart registry
- **Better scalability**: Adding new chart types requires no code changes
- **Consistency**: All chart discovery uses same inventory-based approach
- **Maintainability**: Less hardcoded directory path logic

### **Operational Benefits**
- **Automatic exclusion**: Removed charts automatically excluded from processing
- **Better validation**: Chart existence validated against inventory
- **Cleaner workflows**: Focus on charts that actually exist and are active

---

## 🔄 **MIGRATION STRATEGY**

### **Implementation Order**
1. **Start with ChartService.find()** - Highest impact, most frequently used
2. **Move to ReleaseService.find()** - Medium impact, release workflows
3. **Finish with LocalService** - Lowest impact, development only

### **Testing Approach**
- **Unit tests**: Verify inventory lookup logic works correctly
- **Integration tests**: Run full workflows with inventory-based discovery
- **Performance tests**: Measure execution time improvements
- **Regression tests**: Ensure no functionality is lost

### **Rollback Plan**
- Keep original implementations as fallback methods
- Feature flag to switch between file system and inventory-based discovery
- Gradual rollout with monitoring

---

*Last Updated: 2025-06-08*
*Status: Planning Phase*
