# Refactoring Session 4: Resource Management

## 🎯 **Session Objective**
Implement comprehensive resource management patterns to eliminate resource leaks, add proper cleanup mechanisms, and establish memory/connection limits across all operations.

## 📊 **Current State Analysis**
- **Temporary Directory Leaks**: `updateCharts()` creates temp dirs without cleanup
- **Memory Leaks**: `reportIssue()` downloads full workflow logs without limits
- **Connection Leaks**: Multiple GitHub API connections without pooling
- **File Handle Leaks**: No systematic file operation cleanup
- **Process Resource Leaks**: External command executions without proper cleanup

## 🎯 **Target State**
- **Zero Resource Leaks**: All temporary resources properly cleaned up
- **Memory Limits**: Configurable limits for large operations
- **Connection Pooling**: Efficient GitHub API connection management
- **Streaming Operations**: Large data processing with streaming where possible
- **Resource Monitoring**: Logging and alerts for resource usage

## 📋 **Detailed Work Plan**

### **Phase 1: Temporary Directory Management**

#### **Problem Analysis:**
In `updateCharts()` → `ChartService.Update.metadata()`:
```javascript
// CURRENT (LEAK PRONE):
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'helm-metadata-'));
// ... operations using tempDir ...
// ❌ NO CLEANUP - tempDir persists after method completion
```

**Impact**: Each chart metadata operation creates ~50-100MB temporary directory that's never cleaned up.

#### **File: `/services/chart/Update.js`**
**Target Pattern Implementation:**
```javascript
// NEW: Resource-managed metadata update
async metadata(charts) {
  return this.execute('update metadata', async () => {
    const metadataUpdates = [];
    
    for (const chartDir of charts) {
      // Use resource-managed temporary directory
      const updateResult = await this.withTemporaryDirectory(async (tempDir) => {
        return await this.generateChartMetadata(chartDir, tempDir);
      });
      
      if (updateResult) {
        metadataUpdates.push(updateResult);
      }
    }
    
    return this.commitMetadataChanges(metadataUpdates);
  });
}

// NEW: Resource management utility
async withTemporaryDirectory(operation) {
  let tempDir = null;
  
  try {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'helm-metadata-'));
    this.logger.debug(`Created temporary directory: ${tempDir}`);
    
    return await operation(tempDir);
    
  } catch (error) {
    this.logger.error(`Operation failed in temporary directory: ${error.message}`);
    throw error;
    
  } finally {
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        this.logger.debug(`Cleaned up temporary directory: ${tempDir}`);
      } catch (cleanupError) {
        this.logger.warning(`Failed to cleanup temporary directory ${tempDir}: ${cleanupError.message}`);
      }
    }
  }
}
```

### **Phase 2: Memory Management for Large Operations**

#### **Problem Analysis:**
In `reportIssue()` → `Issue.#validate()`:
```javascript
// CURRENT (MEMORY BOMB):
const logsResponse = await this.github.rest.actions.downloadWorkflowRunLogs({
  owner: context.repo.owner,
  repo: context.repo.repo,
  run_id: parseInt(context.runId, 10)
});
// ❌ Downloads ENTIRE workflow log into memory (can be 500MB+)
```

#### **File: `/services/Issue.js`**
**Target Memory-Limited Implementation:**
```javascript
// NEW: Memory-safe log validation
async #validate(context) {
  try {
    let hasFailures = false;
    
    // Check job failures (lightweight operation)
    const jobs = await this.restService.listJobs(context);
    for (const job of jobs) {
      if (job.steps?.some(step => step.conclusion !== 'success')) {
        hasFailures = true;
        break;
      }
    }
    
    // Memory-safe warning detection
    const hasWarnings = await this.checkWorkflowWarnings(context);
    
    return hasFailures || hasWarnings;
    
  } catch (error) {
    if (error.status === 404) return false;
    this.actionError.handle(error, {
      operation: 'validate workflow status',
      fatal: false
    });
    return false;
  }
}

// NEW: Streaming log analysis with memory limits
async checkWorkflowWarnings(context) {
  const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB limit
  const warningRegex = /(^|:)warning:/i;
  
  try {
    // Stream download with size limit
    return await this.streamLogAnalysis(context, warningRegex, MAX_LOG_SIZE);
    
  } catch (error) {
    this.logger.warning(`Failed to check workflow warnings: ${error.message}`);
    return false; // Graceful degradation
  }
}
```

### **Phase 3: GitHub API Connection Management**

#### **File: `/core/GitHubConnectionManager.js` (NEW)**
```javascript
class GitHubConnectionManager {
  constructor(params) {
    this.github = params.github;
    this.config = params.config;
    this.logger = params.logger || console;
    
    // Connection pool configuration
    this.maxConnections = this.config.get('github.api.maxConnections', 10);
    this.rateLimit = this.config.get('github.api.rateLimit', 5000);
    this.requestCount = 0;
    this.rateLimitWindow = Date.now();
  }
  
  async executeRequest(operation, requestFn) {
    await this.waitForRateLimit();
    
    try {
      this.requestCount++;
      this.logger.debug(`GitHub API: ${operation}`);
      
      return await requestFn();
      
    } catch (error) {
      this.logger.error(`GitHub API error in ${operation}: ${error.message}`);
      throw error;
    }
  }
  
  async waitForRateLimit() {
    const now = Date.now();
    const hoursSinceWindow = (now - this.rateLimitWindow) / (1000 * 60 * 60);
    
    if (hoursSinceWindow >= 1) {
      this.rateLimitWindow = now;
      this.requestCount = 0;
      return;
    }
    
    if (this.requestCount >= this.rateLimit) {
      const waitTime = (1000 * 60 * 60) - (now - this.rateLimitWindow);
      this.logger.warning(`Rate limit reached, waiting ${Math.ceil(waitTime/1000)}s`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.rateLimitWindow = Date.now();
      this.requestCount = 0;
    }
  }
}
```

### **Phase 4: File Operation Resource Management**

#### **File: `/services/File.js`**
```javascript
class File extends Action {
  constructor(params) {
    super(params);
    this.maxConcurrentOps = this.config.get('file.maxConcurrentOps', 10);
    this.maxFileSize = this.config.get('file.maxFileSize', 100 * 1024 * 1024);
    this.activeOperations = 0;
  }
  
  async read(filePath, options = {}) {
    return this.withFileOperation(async () => {
      const stats = await fs.stat(filePath);
      if (stats.size > this.maxFileSize) {
        throw new Error(`File too large: ${filePath}`);
      }
      
      const content = await fs.readFile(filePath, options.encoding || 'utf8');
      this.logger.debug(`Read file: ${filePath} (${stats.size} bytes)`);
      return content;
      
    }, `read: ${filePath}`);
  }
  
  async withFileOperation(operation, description) {
    this.activeOperations++;
    try {
      return await operation();
    } finally {
      this.activeOperations--;
    }
  }
}
```

## 🧪 **Testing Strategy**

### **Resource Leak Detection:**
```javascript
describe('Resource Management', () => {
  it('should cleanup temporary directories', async () => {
    const tempDirsBefore = await getTempDirectoryCount();
    await chartService.updateMetadata(['test-chart']);
    const tempDirsAfter = await getTempDirectoryCount();
    
    expect(tempDirsAfter).toBe(tempDirsBefore);
  });
  
  it('should respect memory limits', async () => {
    const memoryBefore = process.memoryUsage().heapUsed;
    await issueService.validate(context);
    const memoryAfter = process.memoryUsage().heapUsed;
    
    const memoryUsed = memoryAfter - memoryBefore;
    expect(memoryUsed).toBeLessThan(15 * 1024 * 1024); // <15MB
  });
});
```

## ✅ **Success Criteria**

### **Resource Management Metrics:**
- [ ] Zero temporary directory leaks
- [ ] Memory usage limited (<15MB for log processing)
- [ ] File handle limits respected
- [ ] Connection pooling active

### **Performance Metrics:**
- [ ] No memory growth over time
- [ ] Improved resource utilization
- [ ] Faster cleanup

## 🚨 **Risk Assessment**

### **High Risk:**
- **Resource Limits**: Too restrictive limits might break operations
- **Cleanup Timing**: Premature cleanup might break ongoing operations

### **Mitigation Strategies:**
1. **Configurable Limits**: All limits via environment/config
2. **Graceful Degradation**: Continue with warnings if limits hit
3. **Comprehensive Testing**: Test under various loads

## 📋 **Execution Checklist**

### **Pre-Session:**
- [ ] Verify Sessions 1-3 completion
- [ ] Establish resource usage baseline

### **Session Execution:**
- [ ] Phase 1: Temporary directory management
- [ ] Phase 2: Memory management
- [ ] Phase 3: Connection management
- [ ] Phase 4: File operation management

### **Post-Session:**
- [ ] Verify zero resource leaks
- [ ] Run stress tests
- [ ] Update codebase.md

---
**Session 4 Priority**: HIGH - Critical for production stability
**Estimated Effort**: 4-5 hours
**Risk Level**: MEDIUM
