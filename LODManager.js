/**
 * LODManager.js
 * 
 * Level of Detail (LOD) management system for performance optimization.
 * Dynamically adjusts visual quality, mesh detail, and rendering features
 * based on distance, performance, and platform capabilities.
 */

var LODManager = pc.createScript('lodManager');

// LOD system configuration
LODManager.attributes.add('lodEnabled', {
    type: 'boolean',
    default: true,
    description: 'Enable LOD system'
});

LODManager.attributes.add('performanceTarget', {
    type: 'number',
    default: 60,
    description: 'Target FPS for dynamic LOD'
});

LODManager.attributes.add('updateFrequency', {
    type: 'number',
    default: 10,
    description: 'LOD update frequency (Hz)'
});

LODManager.attributes.add('maxLODDistance', {
    type: 'number',
    default: 200,
    description: 'Maximum distance for LOD calculations'
});

// Initialize LOD management system
LODManager.prototype.initialize = function() {
    if (!this.lodEnabled) return;
    
    // LOD system state
    this.lodObjects = new Map();
    this.staticLODObjects = new Map();
    this.dynamicLODObjects = new Map();
    
    // Camera references
    this.cameras = [];
    this.primaryCamera = null;
    
    // Performance monitoring
    this.performanceMonitor = {
        frameTime: 0,
        frameCount: 0,
        averageFrameTime: 16.67, // 60 FPS target
        lastFrameTime: 0,
        performanceHistory: [],
        historySize: 60
    };
    
    // LOD levels configuration
    this.lodLevels = {
        high: {
            distance: 0,
            maxDistance: 50,
            meshQuality: 1.0,
            textureQuality: 1.0,
            shadowQuality: 1.0,
            particleQuality: 1.0,
            animationQuality: 1.0
        },
        medium: {
            distance: 50,
            maxDistance: 100,
            meshQuality: 0.7,
            textureQuality: 0.7,
            shadowQuality: 0.5,
            particleQuality: 0.7,
            animationQuality: 0.8
        },
        low: {
            distance: 100,
            maxDistance: 150,
            meshQuality: 0.4,
            textureQuality: 0.5,
            shadowQuality: 0.2,
            particleQuality: 0.4,
            animationQuality: 0.5
        },
        minimal: {
            distance: 150,
            maxDistance: this.maxLODDistance,
            meshQuality: 0.2,
            textureQuality: 0.3,
            shadowQuality: 0,
            particleQuality: 0.2,
            animationQuality: 0.2
        }
    };
    
    // Dynamic quality adjustment
    this.dynamicQuality = {
        enabled: true,
        globalQualityMultiplier: 1.0,
        adaptiveEnabled: true,
        stressThreshold: 0.8,
        recoveryThreshold: 0.6
    };
    
    // Platform-specific settings
    this.platformSettings = this.detectPlatformCapabilities();
    
    // Culling and visibility
    this.cullingSystem = {
        frustumCulling: true,
        occlusionCulling: false,
        distanceCulling: true,
        smallObjectCulling: true,
        screenSizeThreshold: 0.005
    };
    
    // Statistics and metrics
    this.statistics = {
        totalLODObjects: 0,
        visibleObjects: 0,
        culledObjects: 0,
        lodTransitions: 0,
        performanceAdjustments: 0
    };

    this.setupLODSystem();
    this.startPerformanceMonitoring();
    this.setupEventListeners();
    
    console.log('LOD Manager initialized');
};

// Setup LOD system
LODManager.prototype.setupLODSystem = function() {
    // Find all cameras in the scene
    this.updateCameraList();
    
    // Register existing objects for LOD
    this.registerExistingObjects();
    
    // Start LOD update loop
    this.startLODUpdateLoop();
};

// Update camera list
LODManager.prototype.updateCameraList = function() {
    this.cameras = [];
    
    // Find all camera entities
    var cameraEntities = this.app.root.findByTag('camera');
    cameraEntities.forEach(entity => {
        if (entity.camera) {
            this.cameras.push(entity);
            
            // Set primary camera (usually the player camera)
            if (entity.tags.has('player') || !this.primaryCamera) {
                this.primaryCamera = entity;
            }
        }
    });
    
    if (!this.primaryCamera && this.cameras.length > 0) {
        this.primaryCamera = this.cameras[0];
    }
};

// Register existing objects for LOD management
LODManager.prototype.registerExistingObjects = function() {
    // Find all mesh instances in the scene
    var meshEntities = this.app.root.findByTag('lod') || [];
    
    // If no LOD tags, register all render components
    if (meshEntities.length === 0) {
        this.app.root.findComponents('render').forEach(entity => {
            this.registerLODObject(entity);
        });
    } else {
        meshEntities.forEach(entity => {
            this.registerLODObject(entity);
        });
    }
};

// Register object for LOD management
LODManager.prototype.registerLODObject = function(entity, options) {
    if (!entity || !entity.render) return;
    
    var lodObject = {
        entity: entity,
        id: entity.getGuid(),
        position: entity.getPosition(),
        bounds: this.calculateEntityBounds(entity),
        renderComponent: entity.render,
        
        // LOD state
        currentLOD: 'high',
        lastLOD: 'high',
        distanceToCamera: 0,
        isVisible: true,
        isCulled: false,
        screenSize: 1.0,
        
        // LOD meshes (if available)
        lodMeshes: this.findLODMeshes(entity),
        
        // Original settings
        originalSettings: {
            castShadows: entity.render.castShadows,
            receiveShadows: entity.render.receiveShadows,
            material: entity.render.material
        },
        
        // Configuration
        config: Object.assign({
            isStatic: false,
            importance: 1.0,
            lodBias: 1.0,
            disableCulling: false
        }, options)
    };
    
    this.lodObjects.set(lodObject.id, lodObject);
    
    // Add to appropriate collections
    if (lodObject.config.isStatic) {
        this.staticLODObjects.set(lodObject.id, lodObject);
    } else {
        this.dynamicLODObjects.set(lodObject.id, lodObject);
    }
    
    this.statistics.totalLODObjects++;
};

// Find LOD meshes for an entity
LODManager.prototype.findLODMeshes = function(entity) {
    var lodMeshes = {
        high: null,
        medium: null,
        low: null,
        minimal: null
    };
    
    // Look for child entities with LOD suffixes
    entity.children.forEach(child => {
        var name = child.name.toLowerCase();
        if (name.includes('_lod0') || name.includes('_high')) {
            lodMeshes.high = child;
        } else if (name.includes('_lod1') || name.includes('_med')) {
            lodMeshes.medium = child;
        } else if (name.includes('_lod2') || name.includes('_low')) {
            lodMeshes.low = child;
        } else if (name.includes('_lod3') || name.includes('_min')) {
            lodMeshes.minimal = child;
        }
    });
    
    return lodMeshes;
};

// Calculate entity bounds
LODManager.prototype.calculateEntityBounds = function(entity) {
    if (entity.render && entity.render.meshInstances.length > 0) {
        var aabb = new pc.BoundingBox();
        entity.render.meshInstances.forEach(meshInstance => {
            if (meshInstance.aabb) {
                aabb.add(meshInstance.aabb);
            }
        });
        return aabb;
    }
    
    return new pc.BoundingBox(entity.getPosition(), new pc.Vec3(1, 1, 1));
};

// Start LOD update loop
LODManager.prototype.startLODUpdateLoop = function() {
    var updateInterval = 1000 / this.updateFrequency;
    
    this.lodUpdateTimer = setInterval(() => {
        this.updateLOD();
    }, updateInterval);
};

// Start performance monitoring
LODManager.prototype.startPerformanceMonitoring = function() {
    this.performanceMonitor.lastFrameTime = Date.now();
    
    // Monitor frame time each frame
    this.app.on('frameend', () => {
        this.updatePerformanceMetrics();
    });
};

// Setup event listeners
LODManager.prototype.setupEventListeners = function() {
    // Scene changes
    this.app.on('entity:add', this.onEntityAdded, this);
    this.app.on('entity:remove', this.onEntityRemoved, this);
    
    // Camera changes
    this.app.on('camera:change', this.updateCameraList, this);
    
    // Settings changes
    this.app.on('settings:graphics', this.onGraphicsSettingsChange, this);
    this.app.on('settings:performance', this.onPerformanceSettingsChange, this);
};

// Main LOD update function
LODManager.prototype.updateLOD = function() {
    if (!this.primaryCamera) return;
    
    var cameraPosition = this.primaryCamera.getPosition();
    var frustum = this.primaryCamera.camera.frustum;
    
    this.statistics.visibleObjects = 0;
    this.statistics.culledObjects = 0;
    
    // Update each LOD object
    this.lodObjects.forEach((lodObject) => {
        this.updateObjectLOD(lodObject, cameraPosition, frustum);
    });
    
    // Apply dynamic quality adjustments if needed
    if (this.dynamicQuality.adaptiveEnabled) {
        this.applyDynamicQualityAdjustment();
    }
};

// Update LOD for individual object
LODManager.prototype.updateObjectLOD = function(lodObject, cameraPosition, frustum) {
    // Calculate distance to camera
    lodObject.distanceToCamera = cameraPosition.distance(lodObject.position);
    
    // Perform culling checks
    if (this.shouldCullObject(lodObject, frustum)) {
        this.cullObject(lodObject);
        return;
    }
    
    // Calculate screen size
    lodObject.screenSize = this.calculateScreenSize(lodObject);
    
    // Determine appropriate LOD level
    var newLOD = this.calculateLODLevel(lodObject);
    
    // Apply LOD if changed
    if (newLOD !== lodObject.currentLOD) {
        this.applyLOD(lodObject, newLOD);
        this.statistics.lodTransitions++;
    }
    
    this.statistics.visibleObjects++;
};

// Check if object should be culled
LODManager.prototype.shouldCullObject = function(lodObject, frustum) {
    if (lodObject.config.disableCulling) return false;
    
    // Distance culling
    if (this.cullingSystem.distanceCulling) {
        if (lodObject.distanceToCamera > this.maxLODDistance) {
            return true;
        }
    }
    
    // Frustum culling
    if (this.cullingSystem.frustumCulling) {
        if (!frustum.containsPoint(lodObject.position)) {
            // More sophisticated frustum test with bounds
            if (!frustum.intersectsBoundingBox(lodObject.bounds)) {
                return true;
            }
        }
    }
    
    // Small object culling
    if (this.cullingSystem.smallObjectCulling) {
        var screenSize = this.calculateScreenSize(lodObject);
        if (screenSize < this.cullingSystem.screenSizeThreshold) {
            return true;
        }
    }
    
    return false;
};

// Calculate screen size of object
LODManager.prototype.calculateScreenSize = function(lodObject) {
    var camera = this.primaryCamera.camera;
    var distance = lodObject.distanceToCamera;
    
    if (distance <= 0) return 1.0;
    
    // Estimate object size
    var objectSize = lodObject.bounds.halfExtents.length();
    
    // Calculate projected size
    var projectedSize = (objectSize * camera.fov) / distance;
    
    return Math.max(0, Math.min(1, projectedSize));
};

// Calculate appropriate LOD level for object
LODManager.prototype.calculateLODLevel = function(lodObject) {
    var distance = lodObject.distanceToCamera * lodObject.config.lodBias;
    var qualityMultiplier = this.dynamicQuality.globalQualityMultiplier;
    
    // Adjust distance based on quality multiplier
    distance = distance / qualityMultiplier;
    
    // Adjust for object importance
    distance = distance / lodObject.config.importance;
    
    // Determine LOD level
    if (distance <= this.lodLevels.high.maxDistance) {
        return 'high';
    } else if (distance <= this.lodLevels.medium.maxDistance) {
        return 'medium';
    } else if (distance <= this.lodLevels.low.maxDistance) {
        return 'low';
    } else {
        return 'minimal';
    }
};

// Apply LOD level to object
LODManager.prototype.applyLOD = function(lodObject, newLOD) {
    lodObject.lastLOD = lodObject.currentLOD;
    lodObject.currentLOD = newLOD;
    
    var lodConfig = this.lodLevels[newLOD];
    var entity = lodObject.entity;
    
    // Apply mesh LOD if available
    this.applyMeshLOD(lodObject, newLOD);
    
    // Apply shadow quality
    this.applyShadowLOD(entity, lodConfig.shadowQuality);
    
    // Apply material quality
    this.applyMaterialLOD(entity, lodConfig.textureQuality);
    
    // Apply animation quality if applicable
    if (entity.animation) {
        this.applyAnimationLOD(entity, lodConfig.animationQuality);
    }
    
    // Apply particle quality if applicable
    if (entity.particlesystem) {
        this.applyParticleLOD(entity, lodConfig.particleQuality);
    }
};

// Apply mesh LOD
LODManager.prototype.applyMeshLOD = function(lodObject, lodLevel) {
    var lodMeshes = lodObject.lodMeshes;
    
    // Hide all LOD meshes first
    Object.values(lodMeshes).forEach(mesh => {
        if (mesh) mesh.enabled = false;
    });
    
    // Show appropriate LOD mesh
    var targetMesh = lodMeshes[lodLevel];
    if (targetMesh) {
        targetMesh.enabled = true;
    } else {
        // Fallback to best available LOD
        var fallbackOrder = ['high', 'medium', 'low', 'minimal'];
        for (var i = 0; i < fallbackOrder.length; i++) {
            var fallbackMesh = lodMeshes[fallbackOrder[i]];
            if (fallbackMesh) {
                fallbackMesh.enabled = true;
                break;
            }
        }
    }
};

// Apply shadow LOD
LODManager.prototype.applyShadowLOD = function(entity, shadowQuality) {
    if (!entity.render) return;
    
    if (shadowQuality <= 0) {
        entity.render.castShadows = false;
        entity.render.receiveShadows = false;
    } else if (shadowQuality < 0.5) {
        entity.render.castShadows = false;
        entity.render.receiveShadows = true;
    } else {
        entity.render.castShadows = true;
        entity.render.receiveShadows = true;
    }
};

// Apply material LOD
LODManager.prototype.applyMaterialLOD = function(entity, textureQuality) {
    if (!entity.render || !entity.render.material) return;
    
    // This would adjust texture resolution, shader complexity, etc.
    // For now, we'll just adjust some basic properties
    var material = entity.render.material;
    
    if (textureQuality < 0.5) {
        // Reduce material complexity for distant objects
        if (material.normalMap) {
            material.normalMap = null;
        }
    }
};

// Apply animation LOD
LODManager.prototype.applyAnimationLOD = function(entity, animationQuality) {
    if (!entity.animation) return;
    
    // Adjust animation update frequency
    var targetFPS = Math.floor(60 * animationQuality);
    
    // This would adjust animation update rate
    // Implementation depends on specific animation system
};

// Apply particle LOD
LODManager.prototype.applyParticleLOD = function(entity, particleQuality) {
    if (!entity.particlesystem) return;
    
    var particles = entity.particlesystem;
    
    // Adjust particle count
    if (particles.numParticles) {
        var originalCount = particles.numParticles;
        particles.numParticles = Math.floor(originalCount * particleQuality);
    }
    
    // Adjust emission rate
    if (particles.rate) {
        var originalRate = particles.rate;
        particles.rate = originalRate * particleQuality;
    }
};

// Cull object from rendering
LODManager.prototype.cullObject = function(lodObject) {
    if (lodObject.isCulled) return;
    
    lodObject.isCulled = true;
    lodObject.isVisible = false;
    
    if (lodObject.entity.render) {
        lodObject.entity.render.enabled = false;
    }
    
    this.statistics.culledObjects++;
};

// Un-cull object
LODManager.prototype.unCullObject = function(lodObject) {
    if (!lodObject.isCulled) return;
    
    lodObject.isCulled = false;
    lodObject.isVisible = true;
    
    if (lodObject.entity.render) {
        lodObject.entity.render.enabled = true;
    }
};

// Update performance metrics
LODManager.prototype.updatePerformanceMetrics = function() {
    var currentTime = Date.now();
    var frameTime = currentTime - this.performanceMonitor.lastFrameTime;
    
    this.performanceMonitor.frameTime = frameTime;
    this.performanceMonitor.frameCount++;
    this.performanceMonitor.lastFrameTime = currentTime;
    
    // Update average frame time
    this.performanceMonitor.performanceHistory.push(frameTime);
    
    if (this.performanceMonitor.performanceHistory.length > this.performanceMonitor.historySize) {
        this.performanceMonitor.performanceHistory.shift();
    }
    
    // Calculate average
    var total = this.performanceMonitor.performanceHistory.reduce((sum, time) => sum + time, 0);
    this.performanceMonitor.averageFrameTime = total / this.performanceMonitor.performanceHistory.length;
};

// Apply dynamic quality adjustment based on performance
LODManager.prototype.applyDynamicQualityAdjustment = function() {
    var targetFrameTime = 1000 / this.performanceTarget;
    var currentFrameTime = this.performanceMonitor.averageFrameTime;
    var performanceRatio = currentFrameTime / targetFrameTime;
    
    // Check if we need to adjust quality
    if (performanceRatio > this.dynamicQuality.stressThreshold) {
        // Performance is poor, reduce quality
        this.dynamicQuality.globalQualityMultiplier *= 0.95;
        this.dynamicQuality.globalQualityMultiplier = Math.max(0.3, this.dynamicQuality.globalQualityMultiplier);
        this.statistics.performanceAdjustments++;
        
    } else if (performanceRatio < this.dynamicQuality.recoveryThreshold) {
        // Performance is good, can increase quality
        this.dynamicQuality.globalQualityMultiplier *= 1.02;
        this.dynamicQuality.globalQualityMultiplier = Math.min(1.0, this.dynamicQuality.globalQualityMultiplier);
    }
};

// Detect platform capabilities
LODManager.prototype.detectPlatformCapabilities = function() {
    var canvas = this.app.graphicsDevice.canvas;
    var gl = this.app.graphicsDevice.gl;
    
    return {
        isMobile: /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
        isLowPower: navigator.hardwareConcurrency <= 2,
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
        screenResolution: {
            width: canvas.width,
            height: canvas.height
        }
    };
};

// Event handlers
LODManager.prototype.onEntityAdded = function(entity) {
    if (entity.render) {
        this.registerLODObject(entity);
    }
};

LODManager.prototype.onEntityRemoved = function(entity) {
    var id = entity.getGuid();
    this.lodObjects.delete(id);
    this.staticLODObjects.delete(id);
    this.dynamicLODObjects.delete(id);
    this.statistics.totalLODObjects--;
};

LODManager.prototype.onGraphicsSettingsChange = function(settings) {
    if (settings.lodEnabled !== undefined) {
        this.lodEnabled = settings.lodEnabled;
    }
    
    if (settings.lodDistance !== undefined) {
        this.maxLODDistance = settings.lodDistance;
    }
};

LODManager.prototype.onPerformanceSettingsChange = function(settings) {
    if (settings.targetFPS !== undefined) {
        this.performanceTarget = settings.targetFPS;
    }
    
    if (settings.adaptiveLOD !== undefined) {
        this.dynamicQuality.adaptiveEnabled = settings.adaptiveLOD;
    }
};

// Get LOD statistics
LODManager.prototype.getStatistics = function() {
    return {
        totalObjects: this.statistics.totalLODObjects,
        visibleObjects: this.statistics.visibleObjects,
        culledObjects: this.statistics.culledObjects,
        lodTransitions: this.statistics.lodTransitions,
        performanceAdjustments: this.statistics.performanceAdjustments,
        globalQuality: this.dynamicQuality.globalQualityMultiplier,
        averageFrameTime: this.performanceMonitor.averageFrameTime,
        targetFrameTime: 1000 / this.performanceTarget
    };
};

// Cleanup when destroyed
LODManager.prototype.destroy = function() {
    if (this.lodUpdateTimer) {
        clearInterval(this.lodUpdateTimer);
    }
};
