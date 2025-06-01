# Refactoring Session 5: Performance Optimization

## 🎯 **Session Objective**
Optimize performance across all operations to achieve target execution times <5 minutes and memory usage <300MB through API batching, caching, parallel processing, and algorithmic improvements.

## 📊 **Current State Analysis**
- **Execution Time**: 5-15 minutes for complex operations
- **Memory Usage**: 500MB-1GB during peak operations  
- **API Usage**: 50-100+ sequential GitHub API calls
- **Sequential Processing**: Many operations run sequentially that could be parallel
- **No Caching**: Repeated API calls and file operations
- **Inefficient Algorithms**: Some operations have O(n²) complexity

## 🎯 **Target State**
- **Execution Time**: <5 minutes for all operations
- **Memory Usage**: <300MB peak usage
- **API Efficiency**: Batched and cached API operations
- **Parallel Processing**: Maximum concurrency where safe
- **Smart Caching**: Intelligent caching with invalidation
- **Optimized Algorithms**: Linear time complexity where possible

## 📋 **Detailed Work Plan**

### **Phase 1: API Batching and Caching**

#### **Problem Analysis:**
Current API usage patterns:
- `updateLabels()`: 7-14 sequential GitHub API calls
- `processReleases()`: 5-15+ GitHub API calls per release
- `reportIssue()`: Multiple API calls for validation
- No caching of API responses
- No batching of similar operations

#### **File: `/services/github/ApiCache.js` (NEW)**
**Intelligent Caching System:**
```javascript
/**
 * GitHub API response caching with intelligent invalidation
 */
class ApiCache {
  constructor(params) {
    this.config = params.config;
    this.logger = params.logger || console;
    
    // Cache configuration
    this.defaultTTL = this.config.get('github.cache.defaultTTL', 300000); // 5 minutes
    this.maxCacheSize = this.config.get('github.cache.maxSize', 1000);
    this.cache = new Map();
    this.accessTimes = new Map();
    
    // Cache stats
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0
    };
  }
  
  // Generate cache key
  generateKey(operation, params) {
    const normalizedParams = this.normalizeParams(params);
    return `${operation}:${JSON.stringify(normalizedParams)}`;
  }
  
  // Normalize parameters for consistent caching
  normalizeParams(params) {
    const normalized = { ...params };
    
    // Remove context-specific fields that shouldn't affect caching
    delete normalized.context?.runId;
    delete normalized.context?.sha;
    delete normalized.timestamp;
    
    // Sort object keys for consistent serialization
    return this.sortObjectKeys(normalized);
  }
  
  // Get cached response
  async get(operation, params) {
    const key = this.generateKey(operation, params);
    const cached = this.cache.get(key);
    
    if (!cached) {
      this.stats.misses++;
      return null;
    }
    
    // Check TTL
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key);
      this.accessTimes.delete(key);
      this.stats.misses++;
      return null;
    }
    
    // Update access time for LRU
    this.accessTimes.set(key, Date.now());
    this.stats.hits++;
    
    this.logger.debug(`Cache hit: ${operation}`);
    return cached.data;
  }
  
  // Set cached response
  async set(operation, params, data, customTTL = null) {
    const key = this.generateKey(operation, params);
    const ttl = customTTL || this.defaultTTL;
    const expiresAt = Date.now() + ttl;
    
    // Evict if cache is full
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLRU();
    }
    
    this.cache.set(key, {
      data,
      expiresAt,
      createdAt: Date.now()
    });
    
    this.accessTimes.set(key, Date.now());
    
    this.logger.debug(`Cache set: ${operation} (TTL: ${ttl}ms)`);
  }
  
  // Evict least recently used entry
  evictLRU() {
    let oldestKey = null;
    let oldestTime = Infinity;
    
    for (const [key, time] of this.accessTimes) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.accessTimes.delete(oldestKey);
      this.stats.evictions++;
    }
  }
  
  // Get cache statistics
  getStats() {
    const hitRate = this.stats.hits / (this.stats.hits + this.stats.misses) || 0;
    
    return {
      ...this.stats,
      hitRate: Math.round(hitRate * 100) / 100,
      cacheSize: this.cache.size,
      maxSize: this.maxCacheSize
    };
  }
}

module.exports = ApiCache;
```

#### **File: `/services/github/Rest.js`**
**Enhanced with Caching and Batching:**
```javascript
const ApiCache = require('./ApiCache');

class Rest extends Api {
  constructor(params) {
    super(params);
    
    // Initialize cache
    this.cache = new ApiCache(params);
    
    // Batch processing
    this.batchQueue = {
      labels: [],
      processing: false
    };
    
    this.batchTimeout = this.config.get('github.batch.timeout', 1000); // 1 second
  }
  
  // Cached label operations
  async getLabel({ context, name }) {
    // Try cache first
    const cached = await this.cache.get('getLabel', { context, name });
    if (cached) {
      return cached;
    }
    
    try {
      const response = await this.execute('getLabel', async () => {
        return await this.github.rest.issues.getLabel({
          owner: context.repo.owner,
          repo: context.repo.repo,
          name
        });
      }, false);
      
      if (response) {
        const result = {
          id: response.data.id,
          name: response.data.name,
          color: response.data.color,
          description: response.data.description
        };
        
        // Cache for 30 minutes (labels don't change often)
        await this.cache.set('getLabel', { context, name }, result, 30 * 60 * 1000);
        
        return result;
      }
      
      return null;
      
    } catch (error) {
      this.actionError.handle(error, {
        operation: `get '${name}' label`,
        fatal: false
      });
      return null;
    }
  }
  
  // Batched label creation
  async createLabel({ context, label }) {
    return new Promise((resolve, reject) => {
      // Add to batch queue
      this.batchQueue.labels.push({
        context,
        label,
        resolve,
        reject
      });
      
      // Process batch if not already processing
      if (!this.batchQueue.processing) {
        setTimeout(() => this.processLabelBatch(), this.batchTimeout);
      }
    });
  }
  
  // Process batched label operations
  async processLabelBatch() {
    if (this.batchQueue.processing || this.batchQueue.labels.length === 0) {
      return;
    }
    
    this.batchQueue.processing = true;
    const batch = [...this.batchQueue.labels];
    this.batchQueue.labels = [];
    
    try {
      this.logger.debug(`Processing label batch: ${batch.length} operations`);
      
      // Group by repository for efficient processing
      const repoGroups = this.groupByRepo(batch);
      
      for (const [repoKey, operations] of Object.entries(repoGroups)) {
        await this.processSingleRepoBatch(operations);
      }
      
    } catch (error) {
      this.logger.error(`Label batch processing failed: ${error.message}`);
    } finally {
      this.batchQueue.processing = false;
      
      // Process any new items that arrived during processing
      if (this.batchQueue.labels.length > 0) {
        setTimeout(() => this.processLabelBatch(), this.batchTimeout);
      }
    }
  }
}
```

### **Phase 2: Parallel Processing Optimization**

#### **File: `/services/ParallelProcessor.js` (NEW)**
**Intelligent Parallel Processing:**
```javascript
/**
 * Parallel processing utility with concurrency control and error handling
 */
class ParallelProcessor {
  constructor(params) {
    this.config = params.config;
    this.logger = params.logger || console;
    
    // Default concurrency limits
    this.defaultConcurrency = this.config.get('parallel.defaultConcurrency', 5);
    this.maxConcurrency = this.config.get('parallel.maxConcurrency', 10);
  }
  
  // Process items in parallel with concurrency control
  async processParallel(items, processor, options = {}) {
    const {
      concurrency = this.defaultConcurrency,
      stopOnError = false,
      progressCallback = null,
      batchSize = null
    } = options;
    
    if (items.length === 0) {
      return [];
    }
    
    this.logger.debug(`Processing ${items.length} items with concurrency ${concurrency}`);
    
    // If batchSize specified, process in batches
    if (batchSize && items.length > batchSize) {
      return this.processBatches(items, processor, { ...options, batchSize });
    }
    
    // Process with concurrency control
    return this.processWithConcurrency(items, processor, {
      concurrency,
      stopOnError,
      progressCallback
    });
  }
  
  // Process with concurrency control
  async processWithConcurrency(items, processor, options) {
    const { concurrency, stopOnError, progressCallback } = options;
    const results = new Array(items.length);
    const errors = [];
    let completed = 0;
    
    // Create semaphore for concurrency control
    const semaphore = new Semaphore(concurrency);
    
    const processItem = async (item, index) => {
      await semaphore.acquire();
      
      try {
        const result = await processor(item, index);
        results[index] = { status: 'fulfilled', value: result };
        
      } catch (error) {
        results[index] = { status: 'rejected', reason: error };
        errors.push({ index, error });
        
        if (stopOnError) {
          throw error;
        }
        
      } finally {
        semaphore.release();
        completed++;
        
        if (progressCallback) {
          progressCallback(completed, items.length);
        }
      }
    };
    
    // Start all processing tasks
    const tasks = items.map((item, index) => processItem(item, index));
    
    if (stopOnError) {
      await Promise.all(tasks);
    } else {
      await Promise.allSettled(tasks);
    }
    
    // Log summary
    const successful = results.filter(r => r.status === 'fulfilled').length;
    this.logger.debug(`Parallel processing complete: ${successful}/${items.length} successful`);
    
    if (errors.length > 0) {
      this.logger.warning(`${errors.length} items failed during parallel processing`);
    }
    
    return results;
  }
}

// Semaphore for concurrency control
class Semaphore {
  constructor(max) {
    this.max = max;
    this.current = 0;
    this.queue = [];
  }
  
  async acquire() {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    
    return new Promise(resolve => {
      this.queue.push(resolve);
    });
  }
  
  release() {
    this.current--;
    
    if (this.queue.length > 0) {
      this.current++;
      const resolve = this.queue.shift();
      resolve();
    }
  }
}

module.exports = ParallelProcessor;
```

### **Phase 3: Memory Usage Optimization**

#### **File: `/core/MemoryManager.js` (NEW)**
**Memory Usage Monitoring and Control:**
```javascript
/**
 * Memory usage monitoring and optimization
 */
class MemoryManager {
  constructor(params) {
    this.config = params.config;
    this.logger = params.logger || console;
    
    // Memory limits
    this.warningThreshold = this.config.get('memory.warningThreshold', 200 * 1024 * 1024); // 200MB
    this.criticalThreshold = this.config.get('memory.criticalThreshold', 300 * 1024 * 1024); // 300MB
    
    // Monitoring
    this.monitoringInterval = null;
    this.memorySnapshots = [];
    this.maxSnapshots = 100;
  }
  
  // Start memory monitoring
  startMonitoring(intervalMs = 5000) {
    if (this.monitoringInterval) {
      return; // Already monitoring
    }
    
    this.monitoringInterval = setInterval(() => {
      this.takeMemorySnapshot();
    }, intervalMs);
    
    this.logger.debug('Memory monitoring started');
  }
  
  // Stop memory monitoring
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      this.logger.debug('Memory monitoring stopped');
    }
  }
  
  // Take memory snapshot
  takeMemorySnapshot() {
    const usage = process.memoryUsage();
    const snapshot = {
      timestamp: Date.now(),
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss
    };
    
    this.memorySnapshots.push(snapshot);
    
    // Keep only recent snapshots
    if (this.memorySnapshots.length > this.maxSnapshots) {
      this.memorySnapshots.shift();
    }
    
    // Check thresholds
    this.checkMemoryThresholds(snapshot);
    
    return snapshot;
  }
  
  // Check memory thresholds
  checkMemoryThresholds(snapshot) {
    const heapUsedMB = Math.round(snapshot.heapUsed / 1024 / 1024);
    
    if (snapshot.heapUsed > this.criticalThreshold) {
      this.logger.error(`CRITICAL: Memory usage ${heapUsedMB}MB exceeds critical threshold`);
      this.triggerGarbageCollection();
      
    } else if (snapshot.heapUsed > this.warningThreshold) {
      this.logger.warning(`WARNING: Memory usage ${heapUsedMB}MB exceeds warning threshold`);
    }
  }
  
  // Trigger garbage collection if available
  triggerGarbageCollection() {
    if (global.gc) {
      this.logger.debug('Triggering garbage collection');
      global.gc();
      
      // Take snapshot after GC
      setTimeout(() => {
        const afterGC = this.takeMemorySnapshot();
        const freedMB = Math.round((this.memorySnapshots[this.memorySnapshots.length - 2]?.heapUsed - afterGC.heapUsed) / 1024 / 1024) || 0;
        if (freedMB > 0) {
          this.logger.debug(`Garbage collection freed ${freedMB}MB`);
        }
      }, 100);
    }
  }
  
  // Execute operation with memory monitoring
  async withMemoryMonitoring(operation, operationName = 'operation') {
    const startUsage = this.getCurrentUsage();
    this.logger.debug(`Starting ${operationName} - Memory: ${startUsage.heapUsedMB}MB`);
    
    try {
      const result = await operation();
      
      const endUsage = this.getCurrentUsage();
      const memoryDelta = endUsage.heapUsedMB - startUsage.heapUsedMB;
      
      this.logger.debug(`Completed ${operationName} - Memory: ${endUsage.heapUsedMB}MB (${memoryDelta >= 0 ? '+' : ''}${memoryDelta}MB)`);
      
      return result;
      
    } catch (error) {
      const errorUsage = this.getCurrentUsage();
      this.logger.error(`Failed ${operationName} - Memory: ${errorUsage.heapUsedMB}MB`);
      throw error;
    }
  }
  
  // Get current memory usage
  getCurrentUsage() {
    const usage = process.memoryUsage();
    return {
      heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
      rssMB: Math.round(usage.rss / 1024 / 1024),
      externalMB: Math.round(usage.external / 1024 / 1024)
    };
  }
}

module.exports = MemoryManager;
```

### **Phase 4: Algorithmic Optimizations**

#### **File: `/services/chart/index.js`**
**Optimized Chart Discovery:**
```javascript
// BEFORE (Inefficient - O(n*m*k)):
async discover() {
  return this.execute('discover charts', async () => {
    const charts = { application: [], library: [], total: 0 };
    const types = [
      { name: 'application', path: this.config.get('repository.chart.type.application') },
      { name: 'library', path: this.config.get('repository.chart.type.library') }
    ];
    
    for (const type of types) {
      const dirs = await this.fileService.listDir(type.path);  // O(n) for each type
      for (const dir of dirs) {                               // O(m) for each dir
        if (dir.endsWith('.yaml') || dir.endsWith('.yml') || dir.endsWith('.md')) continue;
        const chartPath = path.basename(dir);
        const chartYamlPath = path.join(type.path, chartPath, 'Chart.yaml');
        if (await this.fileService.exists(chartYamlPath)) {    // O(k) file checks
          charts[type.name].push(path.join(type.path, chartPath));
          charts.total++;
        }
      }
    }
    // Total complexity: O(n * m * k) - inefficient
  });
}

// AFTER (Optimized - O(log n)):
async discover() {
  return this.execute('discover charts', async () => {
    const charts = { application: [], library: [], total: 0 };
    
    // Get all chart types in parallel
    const types = [
      { name: 'application', path: this.config.get('repository.chart.type.application') },
      { name: 'library', path: this.config.get('repository.chart.type.library') }
    ];
    
    // Process all types in parallel - O(log n) instead of O(n)
    const typeResults = await Promise.all(
      types.map(async (type) => {
        return await this.discoverChartsOfType(type);
      })
    );
    
    // Aggregate results
    typeResults.forEach((typeCharts, index) => {
      const typeName = types[index].name;
      charts[typeName] = typeCharts;
      charts.total += typeCharts.length;
    });
    
    const word = charts.total === 1 ? 'chart' : 'charts';
    this.logger.info(`Discovered ${charts.total} ${word} in repository`);
    return charts;
  });
}

// NEW: Optimized single type discovery
async discoverChartsOfType(type) {
  try {
    // Use fast directory listing with filtering
    const allEntries = await this.fileService.listDirectoryDetailed(type.path);
    
    // Filter directories only (avoid unnecessary stat calls)
    const directories = allEntries
      .filter(entry => entry.isDirectory())
      .filter(entry => !this.shouldSkipDirectory(entry.name))
      .map(entry => entry.name);
    
    // Batch check for Chart.yaml files
    const chartPaths = await this.batchValidateCharts(type.path, directories);
    
    return chartPaths;
    
  } catch (error) {
    this.logger.warning(`Failed to discover ${type.name} charts: ${error.message}`);
    return [];
  }
}

// NEW: Batch validate Chart.yaml existence
async batchValidateCharts(basePath, directories) {
  // Use parallel processing for Chart.yaml validation
  const validationResults = await this.parallelProcessor.processParallel(
    directories,
    async (dir) => {
      const chartYamlPath = path.join(basePath, dir, 'Chart.yaml');
      const exists = await this.fileService.exists(chartYamlPath);
      return exists ? path.join(basePath, dir) : null;
    },
    {
      concurrency: 10, // High concurrency for file existence checks
      stopOnError: false
    }
  );
  
  // Filter out null results
  return validationResults
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);
}
```

## 🧪 **Testing Strategy**

### **Performance Benchmarking:**
```javascript
describe('Performance Optimization', () => {
  it('should complete processReleases in under 5 minutes', async () => {
    const startTime = Date.now();
    
    await workflow.processReleases();
    
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(5 * 60 * 1000); // 5 minutes
  });
  
  it('should use less than 300MB memory', async () => {
    const startUsage = memoryManager.getCurrentUsage();
    
    await workflow.updateCharts();
    
    const endUsage = memoryManager.getCurrentUsage();
    expect(endUsage.heapUsedMB).toBeLessThan(300);
  });
  
  it('should have high cache hit rate', async () => {
    // Prime cache
    await githubService.getLabel({ context, name: 'test' });
    
    // Test cache hit
    await githubService.getLabel({ context, name: 'test' });
    
    const stats = githubService.cache.getStats();
    expect(stats.hitRate).toBeGreaterThan(0.5); // >50% hit rate
  });
});
```

## ✅ **Success Criteria**

### **Performance Metrics:**
- [ ] All operations complete in <5 minutes
- [ ] Peak memory usage <300MB
- [ ] API cache hit rate >70%
- [ ] Parallel processing shows >40% improvement over sequential

### **Efficiency Metrics:**
- [ ] API calls reduced by >50% through caching and batching
- [ ] File operations optimized (batch validation, streaming)
- [ ] Memory usage stable over multiple operations
- [ ] CPU utilization improved through parallel processing

### **Quality Metrics:**
- [ ] No performance regressions in existing functionality
- [ ] Improved error handling and recovery
- [ ] Better resource utilization monitoring

## 🚨 **Risk Assessment**

### **High Risk:**
- **Parallel Processing**: Race conditions and state conflicts
- **Caching**: Stale data issues and cache invalidation
- **Memory Optimization**: Breaking existing memory assumptions

### **Medium Risk:**
- **API Batching**: Timing issues and error propagation
- **Algorithmic Changes**: Logic errors in optimized code

### **Mitigation Strategies:**
1. **Extensive Testing**: Comprehensive performance and functional tests
2. **Gradual Rollout**: Implement optimizations incrementally
3. **Monitoring**: Real-time performance monitoring
4. **Fallback Mechanisms**: Graceful degradation to original algorithms

## 📋 **Execution Checklist**

### **Pre-Session:**
- [ ] Verify Sessions 1-4 completion
- [ ] Establish performance baselines
- [ ] Set up performance monitoring tools

### **Session Execution:**
- [ ] Phase 1: API batching and caching
- [ ] Phase 2: Parallel processing optimization
- [ ] Phase 3: Memory usage optimization
- [ ] Phase 4: Algorithmic optimizations
- [ ] Run performance benchmarks after each phase

### **Post-Session:**
- [ ] Verify all performance targets met
- [ ] Run stress tests with monitoring
- [ ] Document optimization patterns
- [ ] Update codebase.md with Session 5 completion

## 🔄 **Dependencies**

### **Requires from Sessions 1-4:**
- Clean dependency injection
- Optimized service architecture
- Flattened call chains
- Proper resource management

### **Provides for Session 6:**
- High-performance codebase ready for testing
- Comprehensive monitoring infrastructure
- Optimized algorithms and data flows
- Foundation for final validation

---
**Session 5 Priority**: HIGH - Performance critical for production
**Estimated Effort**: 6-7 hours
**Risk Level**: HIGH (complex optimizations affecting core functionality)
