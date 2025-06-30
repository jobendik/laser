/**
 * AssetStreaming.js
 * 
 * Dynamic asset loading and streaming system for performance optimization.
 * Manages memory usage, preloading strategies, garbage collection,
 * and platform-specific asset adaptation for large game worlds.
 */

var AssetStreaming = pc.createScript('assetStreaming');

// Asset streaming configuration
AssetStreaming.attributes.add('streamingEnabled', {
    type: 'boolean',
    default: true,
    description: 'Enable asset streaming system'
});

AssetStreaming.attributes.add('memoryBudget', {
    type: 'number',
    default: 512,
    description: 'Memory budget for assets (MB)'
});

AssetStreaming.attributes.add('preloadDistance', {
    type: 'number',
    default: 100,
    description: 'Distance to preload assets'
});

AssetStreaming.attributes.add('unloadDistance', {
    type: 'number',
    default: 200,
    description: 'Distance to unload assets'
});

// Initialize asset streaming system
AssetStreaming.prototype.initialize = function() {
    if (!this.streamingEnabled) return;
    
    // Asset management
    this.assetRegistry = new Map();
    this.loadedAssets = new Map();
    this.streamingRegions = new Map();
    this.preloadQueue = [];
    this.unloadQueue = [];
    
    // Memory management
    this.memoryBudgetBytes = this.memoryBudget * 1024 * 1024;
    this.currentMemoryUsage = 0;
    this.memoryPressure = 0;
    
    // Loading state
    this.isLoading = false;
    this.loadingTasks = new Map();
    this.maxConcurrentLoads = 3;
    this.currentLoads = 0;
    
    // Asset types and priorities
    this.assetTypes = {
        texture: { priority: 3, sizeMultiplier: 1.0 },
        model: { priority: 4, sizeMultiplier: 2.0 },
        audio: { priority: 2, sizeMultiplier: 0.5 },
        animation: { priority: 1, sizeMultiplier: 1.5 },
        material: { priority: 5, sizeMultiplier: 0.1 }
    };
    
    // Platform detection
    this.platformConfig = this.detectPlatformConfig();
    
    // Caching strategies
    this.cacheStrategies = {
        immediate: new Set(), // Never unload
        persistent: new Set(), // Unload only under pressure
        temporary: new Set()   // Unload when out of range
    };
    
    // Performance metrics
    this.metrics = {
        assetsLoaded: 0,
        assetsUnloaded: 0,
        bytesLoaded: 0,
        bytesUnloaded: 0,
        cacheHits: 0,
        cacheMisses: 0,
        loadTime: 0,
        memoryPeakUsage: 0
    };
    
    // Streaming zones for level organization
    this.streamingZones = new Map();
    
    this.setupAssetStreaming();
    this.startStreamingLoop();
    this.setupEventListeners();
    
    console.log('Asset Streaming system initialized');
};

// Setup asset streaming system
AssetStreaming.prototype.setupAssetStreaming = function() {
    // Create streaming zones based on level layout
    this.createStreamingZones();
    
    // Register existing assets for streaming
    this.registerExistingAssets();
    
    // Setup memory monitoring
    this.setupMemoryMonitoring();
    
    // Configure platform-specific settings
    this.configurePlatformSettings();
};

// Detect platform configuration
AssetStreaming.prototype.detectPlatformConfig = function() {
    var isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    var isLowEnd = navigator.hardwareConcurrency <= 2;
    
    return {
        isMobile: isMobile,
        isLowEnd: isLowEnd,
        memoryMultiplier: isMobile ? 0.5 : (isLowEnd ? 0.7 : 1.0),
        maxConcurrentLoads: isMobile ? 2 : (isLowEnd ? 3 : 5),
        textureQuality: isMobile ? 0.5 : (isLowEnd ? 0.7 : 1.0),
        compressionSupport: this.detectCompressionSupport()
    };
};

// Detect texture compression support
AssetStreaming.prototype.detectCompressionSupport = function() {
    var gl = this.app.graphicsDevice.gl;
    if (!gl) return {};
    
    var extensions = gl.getSupportedExtensions();
    
    return {
        s3tc: extensions.includes('WEBGL_compressed_texture_s3tc'),
        pvrtc: extensions.includes('WEBGL_compressed_texture_pvrtc'),
        etc1: extensions.includes('WEBGL_compressed_texture_etc1'),
        astc: extensions.includes('WEBGL_compressed_texture_astc')
    };
};

// Create streaming zones for level organization
AssetStreaming.prototype.createStreamingZones = function() {
    // Define streaming zones based on level design
    var zones = [
        {
            name: 'spawn_area',
            bounds: new pc.BoundingBox(new pc.Vec3(0, 0, 0), new pc.Vec3(50, 20, 50)),
            priority: 10,
            preloadRadius: 20,
            assets: ['spawn_textures', 'spawn_models', 'ui_assets']
        },
        {
            name: 'combat_zone_a',
            bounds: new pc.BoundingBox(new pc.Vec3(100, 0, 0), new pc.Vec3(75, 30, 75)),
            priority: 8,
            preloadRadius: 30,
            assets: ['combat_textures', 'weapon_models', 'effect_textures']
        },
        {
            name: 'exploration_area',
            bounds: new pc.BoundingBox(new pc.Vec3(-100, 0, 100), new pc.Vec3(60, 25, 60)),
            priority: 6,
            preloadRadius: 25,
            assets: ['environment_textures', 'prop_models', 'ambient_audio']
        },
        {
            name: 'detail_area',
            bounds: new pc.BoundingBox(new pc.Vec3(200, 0, 200), new pc.Vec3(40, 15, 40)),
            priority: 4,
            preloadRadius: 15,
            assets: ['detail_textures', 'decoration_models']
        }
    ];
    
    zones.forEach(zone => {
        this.streamingZones.set(zone.name, {
            ...zone,
            isActive: false,
            loadedAssets: new Set(),
            preloadedAssets: new Set()
        });
    });
};

// Register existing assets for streaming management
AssetStreaming.prototype.registerExistingAssets = function() {
    // Get all assets from the asset registry
    this.app.assets.list().forEach(asset => {
        this.registerAsset(asset);
    });
};

// Register individual asset for streaming
AssetStreaming.prototype.registerAsset = function(asset, options) {
    var streamingInfo = {
        asset: asset,
        id: asset.id,
        name: asset.name,
        type: asset.type,
        size: this.estimateAssetSize(asset),
        isLoaded: asset.loaded,
        loadPriority: this.calculateAssetPriority(asset),
        cacheStrategy: this.determineCacheStrategy(asset),
        dependencies: this.findAssetDependencies(asset),
        zones: this.findAssetZones(asset),
        lastAccessed: Date.now(),
        loadCount: 0,
        ...options
    };
    
    this.assetRegistry.set(asset.id, streamingInfo);
    
    // Add to appropriate cache strategy
    this.cacheStrategies[streamingInfo.cacheStrategy].add(asset.id);
    
    if (asset.loaded) {
        this.loadedAssets.set(asset.id, streamingInfo);
        this.currentMemoryUsage += streamingInfo.size;
    }
};

// Estimate asset memory size
AssetStreaming.prototype.estimateAssetSize = function(asset) {
    var baseSize = 0;
    
    switch (asset.type) {
        case 'texture':
            // Estimate based on resolution and format
            if (asset.resource) {
                baseSize = asset.resource.width * asset.resource.height * 4; // RGBA
            } else {
                baseSize = 1024 * 1024; // Default 1MB estimate
            }
            break;
            
        case 'model':
            // Estimate based on vertex count and complexity
            baseSize = 512 * 1024; // Default 512KB
            break;
            
        case 'audio':
            // Estimate based on duration and quality
            baseSize = 256 * 1024; // Default 256KB
            break;
            
        case 'animation':
            baseSize = 128 * 1024; // Default 128KB
            break;
            
        case 'material':
            baseSize = 16 * 1024; // Default 16KB
            break;
            
        default:
            baseSize = 64 * 1024; // Default 64KB
    }
    
    // Apply platform multiplier
    return Math.floor(baseSize * this.platformConfig.memoryMultiplier);
};

// Calculate asset loading priority
AssetStreaming.prototype.calculateAssetPriority = function(asset) {
    var typeInfo = this.assetTypes[asset.type] || { priority: 3 };
    var basePriority = typeInfo.priority;
    
    // Adjust based on asset name/tags
    if (asset.name.includes('ui') || asset.tags.has('ui')) {
        basePriority += 3;
    }
    
    if (asset.name.includes('weapon') || asset.tags.has('weapon')) {
        basePriority += 2;
    }
    
    if (asset.name.includes('detail') || asset.tags.has('detail')) {
        basePriority -= 1;
    }
    
    return Math.max(1, Math.min(10, basePriority));
};

// Determine cache strategy for asset
AssetStreaming.prototype.determineCacheStrategy = function(asset) {
    // UI and critical assets are immediate
    if (asset.name.includes('ui') || asset.tags.has('critical')) {
        return 'immediate';
    }
    
    // Weapons and player assets are persistent
    if (asset.name.includes('weapon') || asset.name.includes('player')) {
        return 'persistent';
    }
    
    // Everything else is temporary
    return 'temporary';
};

// Find asset dependencies
AssetStreaming.prototype.findAssetDependencies = function(asset) {
    var dependencies = [];
    
    // For materials, find texture dependencies
    if (asset.type === 'material' && asset.resource) {
        // Implementation would scan material for texture references
    }
    
    // For models, find material and texture dependencies
    if (asset.type === 'model' && asset.resource) {
        // Implementation would scan model for material references
    }
    
    return dependencies;
};

// Find which zones contain this asset
AssetStreaming.prototype.findAssetZones = function(asset) {
    var zones = [];
    
    // Check each streaming zone for asset inclusion
    this.streamingZones.forEach((zone, zoneName) => {
        if (zone.assets.some(assetPattern => asset.name.includes(assetPattern))) {
            zones.push(zoneName);
        }
    });
    
    return zones;
};

// Setup memory monitoring
AssetStreaming.prototype.setupMemoryMonitoring = function() {
    // Monitor memory usage periodically
    setInterval(() => {
        this.updateMemoryMetrics();
    }, 5000); // Every 5 seconds
};

// Configure platform-specific settings
AssetStreaming.prototype.configurePlatformSettings = function() {
    var config = this.platformConfig;
    
    // Adjust memory budget based on platform
    this.memoryBudgetBytes *= config.memoryMultiplier;
    
    // Adjust concurrent load limit
    this.maxConcurrentLoads = config.maxConcurrentLoads;
    
    console.log(`Platform config applied:`, config);
};

// Setup event listeners
AssetStreaming.prototype.setupEventListeners = function() {
    // Player movement for streaming
    this.app.on('player:move', this.onPlayerMove, this);
    
    // Zone transitions
    this.app.on('zone:enter', this.onZoneEnter, this);
    this.app.on('zone:exit', this.onZoneExit, this);
    
    // Asset events
    this.app.on('asset:load', this.onAssetLoaded, this);
    this.app.on('asset:unload', this.onAssetUnloaded, this);
    
    // Memory pressure events
    this.app.on('memory:pressure', this.onMemoryPressure, this);
    this.app.on('memory:warning', this.onMemoryWarning, this);
};

// Start main streaming loop
AssetStreaming.prototype.startStreamingLoop = function() {
    setInterval(() => {
        this.updateStreaming();
    }, 1000); // Update every second
};

// Main streaming update
AssetStreaming.prototype.updateStreaming = function() {
    // Update active zones
    this.updateActiveZones();
    
    // Process preload queue
    this.processPreloadQueue();
    
    // Process unload queue
    this.processUnloadQueue();
    
    // Check memory pressure
    this.checkMemoryPressure();
    
    // Update metrics
    this.updateMetrics();
};

// Update which zones are currently active
AssetStreaming.prototype.updateActiveZones = function() {
    var playerEntity = this.app.root.findByTag('player')[0];
    if (!playerEntity) return;
    
    var playerPosition = playerEntity.getPosition();
    
    this.streamingZones.forEach((zone, zoneName) => {
        var distance = zone.bounds.center.distance(playerPosition);
        var wasActive = zone.isActive;
        
        // Check if player is within preload radius
        zone.isActive = distance <= zone.preloadRadius;
        
        if (zone.isActive && !wasActive) {
            this.activateZone(zoneName);
        } else if (!zone.isActive && wasActive) {
            this.deactivateZone(zoneName);
        }
    });
};

// Activate streaming zone
AssetStreaming.prototype.activateZone = function(zoneName) {
    var zone = this.streamingZones.get(zoneName);
    if (!zone) return;
    
    console.log(`Activating streaming zone: ${zoneName}`);
    
    // Queue assets for preloading
    zone.assets.forEach(assetPattern => {
        this.queueAssetsForPreload(assetPattern, zone.priority);
    });
};

// Deactivate streaming zone
AssetStreaming.prototype.deactivateZone = function(zoneName) {
    var zone = this.streamingZones.get(zoneName);
    if (!zone) return;
    
    console.log(`Deactivating streaming zone: ${zoneName}`);
    
    // Queue assets for unloading (if temporary)
    zone.preloadedAssets.forEach(assetId => {
        var assetInfo = this.assetRegistry.get(assetId);
        if (assetInfo && assetInfo.cacheStrategy === 'temporary') {
            this.queueAssetForUnload(assetId);
        }
    });
    
    zone.preloadedAssets.clear();
};

// Queue assets for preloading based on pattern
AssetStreaming.prototype.queueAssetsForPreload = function(assetPattern, priority) {
    this.assetRegistry.forEach((assetInfo, assetId) => {
        if (assetInfo.name.includes(assetPattern) && !assetInfo.isLoaded) {
            this.queueAssetForPreload(assetId, priority);
        }
    });
};

// Queue individual asset for preloading
AssetStreaming.prototype.queueAssetForPreload = function(assetId, priority) {
    var assetInfo = this.assetRegistry.get(assetId);
    if (!assetInfo || assetInfo.isLoaded) return;
    
    // Check if already queued
    var existingIndex = this.preloadQueue.findIndex(item => item.assetId === assetId);
    if (existingIndex >= 0) {
        // Update priority if higher
        if (priority > this.preloadQueue[existingIndex].priority) {
            this.preloadQueue[existingIndex].priority = priority;
            this.sortPreloadQueue();
        }
        return;
    }
    
    this.preloadQueue.push({
        assetId: assetId,
        priority: priority || assetInfo.loadPriority,
        queueTime: Date.now()
    });
    
    this.sortPreloadQueue();
};

// Sort preload queue by priority
AssetStreaming.prototype.sortPreloadQueue = function() {
    this.preloadQueue.sort((a, b) => b.priority - a.priority);
};

// Process preload queue
AssetStreaming.prototype.processPreloadQueue = function() {
    while (this.preloadQueue.length > 0 && this.currentLoads < this.maxConcurrentLoads) {
        var item = this.preloadQueue.shift();
        this.loadAsset(item.assetId);
    }
};

// Load individual asset
AssetStreaming.prototype.loadAsset = function(assetId) {
    var assetInfo = this.assetRegistry.get(assetId);
    if (!assetInfo || assetInfo.isLoaded) return;
    
    // Check memory availability
    if (this.currentMemoryUsage + assetInfo.size > this.memoryBudgetBytes) {
        this.freeMemoryForAsset(assetInfo.size);
    }
    
    this.currentLoads++;
    var loadStartTime = Date.now();
    
    var asset = assetInfo.asset;
    
    // Load asset
    asset.ready(() => {
        this.onAssetLoadComplete(assetId, loadStartTime);
    });
    
    asset.load();
    
    this.loadingTasks.set(assetId, {
        startTime: loadStartTime,
        asset: assetInfo
    });
};

// Handle asset load completion
AssetStreaming.prototype.onAssetLoadComplete = function(assetId, loadStartTime) {
    var assetInfo = this.assetRegistry.get(assetId);
    if (!assetInfo) return;
    
    this.currentLoads--;
    this.loadingTasks.delete(assetId);
    
    // Update asset info
    assetInfo.isLoaded = true;
    assetInfo.lastAccessed = Date.now();
    assetInfo.loadCount++;
    
    // Add to loaded assets
    this.loadedAssets.set(assetId, assetInfo);
    this.currentMemoryUsage += assetInfo.size;
    
    // Update metrics
    this.metrics.assetsLoaded++;
    this.metrics.bytesLoaded += assetInfo.size;
    this.metrics.loadTime += Date.now() - loadStartTime;
    
    if (this.currentMemoryUsage > this.metrics.memoryPeakUsage) {
        this.metrics.memoryPeakUsage = this.currentMemoryUsage;
    }
    
    console.log(`Asset loaded: ${assetInfo.name} (${this.formatBytes(assetInfo.size)})`);
};

// Queue asset for unloading
AssetStreaming.prototype.queueAssetForUnload = function(assetId) {
    var assetInfo = this.assetRegistry.get(assetId);
    if (!assetInfo || !assetInfo.isLoaded) return;
    
    // Don't unload immediate cache assets
    if (assetInfo.cacheStrategy === 'immediate') return;
    
    // Check if already queued
    if (this.unloadQueue.includes(assetId)) return;
    
    this.unloadQueue.push(assetId);
};

// Process unload queue
AssetStreaming.prototype.processUnloadQueue = function() {
    while (this.unloadQueue.length > 0) {
        var assetId = this.unloadQueue.shift();
        this.unloadAsset(assetId);
    }
};

// Unload individual asset
AssetStreaming.prototype.unloadAsset = function(assetId) {
    var assetInfo = this.assetRegistry.get(assetId);
    if (!assetInfo || !assetInfo.isLoaded) return;
    
    var asset = assetInfo.asset;
    
    // Unload asset
    asset.unload();
    
    // Update asset info
    assetInfo.isLoaded = false;
    
    // Remove from loaded assets
    this.loadedAssets.delete(assetId);
    this.currentMemoryUsage -= assetInfo.size;
    
    // Update metrics
    this.metrics.assetsUnloaded++;
    this.metrics.bytesUnloaded += assetInfo.size;
    
    console.log(`Asset unloaded: ${assetInfo.name} (${this.formatBytes(assetInfo.size)})`);
};

// Free memory for new asset
AssetStreaming.prototype.freeMemoryForAsset = function(requiredSize) {
    var freedSize = 0;
    var targetSize = requiredSize * 1.2; // Free 20% extra for buffer
    
    // Sort loaded assets by unload priority (LRU + cache strategy)
    var sortedAssets = Array.from(this.loadedAssets.values()).sort((a, b) => {
        // Immediate cache assets have lowest unload priority
        if (a.cacheStrategy === 'immediate') return 1;
        if (b.cacheStrategy === 'immediate') return -1;
        
        // Then by last accessed time (LRU)
        return a.lastAccessed - b.lastAccessed;
    });
    
    // Unload assets until we have enough space
    for (var i = 0; i < sortedAssets.length && freedSize < targetSize; i++) {
        var assetInfo = sortedAssets[i];
        if (assetInfo.cacheStrategy !== 'immediate') {
            this.unloadAsset(assetInfo.id);
            freedSize += assetInfo.size;
        }
    }
    
    return freedSize;
};

// Check memory pressure and respond
AssetStreaming.prototype.checkMemoryPressure = function() {
    this.memoryPressure = this.currentMemoryUsage / this.memoryBudgetBytes;
    
    if (this.memoryPressure > 0.9) {
        // High memory pressure - aggressive cleanup
        this.aggressiveMemoryCleanup();
    } else if (this.memoryPressure > 0.7) {
        // Medium memory pressure - gentle cleanup
        this.gentleMemoryCleanup();
    }
};

// Aggressive memory cleanup
AssetStreaming.prototype.aggressiveMemoryCleanup = function() {
    console.warn('High memory pressure - performing aggressive cleanup');
    
    // Unload all temporary assets that haven't been accessed recently
    var cutoffTime = Date.now() - 30000; // 30 seconds
    
    this.loadedAssets.forEach((assetInfo, assetId) => {
        if (assetInfo.cacheStrategy === 'temporary' && assetInfo.lastAccessed < cutoffTime) {
            this.queueAssetForUnload(assetId);
        }
    });
    
    this.app.fire('memory:pressure', { level: 'high', usage: this.memoryPressure });
};

// Gentle memory cleanup
AssetStreaming.prototype.gentleMemoryCleanup = function() {
    console.log('Medium memory pressure - performing gentle cleanup');
    
    // Unload least recently used temporary assets
    var cutoffTime = Date.now() - 60000; // 60 seconds
    
    this.loadedAssets.forEach((assetInfo, assetId) => {
        if (assetInfo.cacheStrategy === 'temporary' && assetInfo.lastAccessed < cutoffTime) {
            this.queueAssetForUnload(assetId);
        }
    });
    
    this.app.fire('memory:pressure', { level: 'medium', usage: this.memoryPressure });
};

// Event handlers
AssetStreaming.prototype.onPlayerMove = function(position) {
    // Trigger zone updates based on player position
    this.updateActiveZones();
};

AssetStreaming.prototype.onZoneEnter = function(zoneName) {
    var zone = this.streamingZones.get(zoneName);
    if (zone) {
        this.activateZone(zoneName);
    }
};

AssetStreaming.prototype.onZoneExit = function(zoneName) {
    var zone = this.streamingZones.get(zoneName);
    if (zone) {
        this.deactivateZone(zoneName);
    }
};

AssetStreaming.prototype.onAssetLoaded = function(asset) {
    var assetInfo = this.assetRegistry.get(asset.id);
    if (assetInfo) {
        assetInfo.lastAccessed = Date.now();
        this.metrics.cacheHits++;
    }
};

AssetStreaming.prototype.onMemoryPressure = function(data) {
    if (data.level === 'critical') {
        this.aggressiveMemoryCleanup();
    }
};

// Update metrics
AssetStreaming.prototype.updateMetrics = function() {
    // Update memory usage statistics
    this.updateMemoryMetrics();
    
    // Calculate cache hit ratio
    var totalAccess = this.metrics.cacheHits + this.metrics.cacheMisses;
    this.metrics.cacheHitRatio = totalAccess > 0 ? this.metrics.cacheHits / totalAccess : 0;
};

// Update memory metrics
AssetStreaming.prototype.updateMemoryMetrics = function() {
    // Recalculate current memory usage
    var calculatedUsage = 0;
    this.loadedAssets.forEach(assetInfo => {
        calculatedUsage += assetInfo.size;
    });
    
    this.currentMemoryUsage = calculatedUsage;
    this.memoryPressure = this.currentMemoryUsage / this.memoryBudgetBytes;
};

// Utility function to format bytes
AssetStreaming.prototype.formatBytes = function(bytes) {
    if (bytes === 0) return '0 B';
    
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Get streaming statistics
AssetStreaming.prototype.getStatistics = function() {
    return {
        ...this.metrics,
        currentMemoryUsage: this.formatBytes(this.currentMemoryUsage),
        memoryBudget: this.formatBytes(this.memoryBudgetBytes),
        memoryPressure: Math.round(this.memoryPressure * 100) + '%',
        loadedAssets: this.loadedAssets.size,
        registeredAssets: this.assetRegistry.size,
        preloadQueueSize: this.preloadQueue.length,
        unloadQueueSize: this.unloadQueue.length,
        currentLoads: this.currentLoads,
        activeZones: Array.from(this.streamingZones.entries())
            .filter(([name, zone]) => zone.isActive)
            .map(([name]) => name)
    };
};
