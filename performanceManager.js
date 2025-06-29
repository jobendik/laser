var PerformanceManager = pc.createScript('performanceManager');

PerformanceManager.attributes.add('targetFrameRate', { type: 'number', default: 60 });
PerformanceManager.attributes.add('minFrameRate', { type: 'number', default: 30 });
PerformanceManager.attributes.add('adaptiveQuality', { type: 'boolean', default: true });
PerformanceManager.attributes.add('memoryThreshold', { type: 'number', default: 512 }); // MB
PerformanceManager.attributes.add('cullingDistance', { type: 'number', default: 100 });
PerformanceManager.attributes.add('lodDistance1', { type: 'number', default: 25 });
PerformanceManager.attributes.add('lodDistance2', { type: 'number', default: 50 });
PerformanceManager.attributes.add('lodDistance3', { type: 'number', default: 75 });

// Quality levels
PerformanceManager.QUALITY_LOW = 0;
PerformanceManager.QUALITY_MEDIUM = 1;
PerformanceManager.QUALITY_HIGH = 2;
PerformanceManager.QUALITY_ULTRA = 3;

PerformanceManager.prototype.initialize = function() {
    // Performance tracking
    this.frameRate = 60;
    this.frameTimeHistory = [];
    this.maxFrameHistory = 60;
    this.lastFrameTime = performance.now();
    
    // Memory tracking
    this.memoryUsage = 0;
    this.memoryCheckInterval = 5; // seconds
    this.lastMemoryCheck = 0;
    
    // Quality settings
    this.currentQuality = PerformanceManager.QUALITY_HIGH;
    this.autoQualityEnabled = this.adaptiveQuality;
    this.qualityChangeThreshold = 10; // frames below target before adjusting
    this.framesBelow = 0;
    this.framesAbove = 0;
    
    // LOD system
    this.lodEntities = new Map();
    this.culledEntities = new Set();
    this.camera = null;
    
    // Optimization states
    this.optimizationLevel = 0; // 0 = none, 5 = maximum
    this.lastOptimizationChange = 0;
    
    // Platform detection
    this.platform = this.detectPlatform();
    this.deviceTier = this.detectDeviceTier();
    
    // Performance budgets
    this.performanceBudgets = {
        drawCalls: 500,
        triangles: 100000,
        particles: 1000,
        lights: 8,
        shadows: 4
    };
    
    this.currentUsage = {
        drawCalls: 0,
        triangles: 0,
        particles: 0,
        lights: 0,
        shadows: 0
    };
    
    // Initialize based on platform
    this.initializePlatformSettings();
    
    // Setup monitoring
    this.setupPerformanceMonitoring();
    
    // Bind events
    this.app.on('performance:requestQualityChange', this.changeQuality, this);
    this.app.on('performance:registerLOD', this.registerLODEntity, this);
    this.app.on('performance:unregisterLOD', this.unregisterLODEntity, this);
    this.app.on('performance:forceOptimization', this.forceOptimization, this);
    
    console.log('PerformanceManager initialized - Platform:', this.platform, 'Tier:', this.deviceTier);
};

PerformanceManager.prototype.detectPlatform = function() {
    const userAgent = navigator.userAgent.toLowerCase();
    
    if (/mobile|android|iphone|ipad/.test(userAgent)) {
        return 'mobile';
    } else if (/tablet/.test(userAgent)) {
        return 'tablet';
    } else {
        return 'desktop';
    }
};

PerformanceManager.prototype.detectDeviceTier = function() {
    // Simple device tier detection based on various factors
    let score = 0;
    
    // CPU cores
    const cores = navigator.hardwareConcurrency || 2;
    score += Math.min(cores, 8) * 10;
    
    // Memory (if available)
    if (navigator.deviceMemory) {
        score += Math.min(navigator.deviceMemory, 8) * 15;
    } else {
        score += 40; // Default assumption
    }
    
    // GPU detection (basic)
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    if (gl) {
        const renderer = gl.getParameter(gl.RENDERER);
        if (renderer.includes('Intel')) score += 20;
        else if (renderer.includes('AMD')) score += 35;
        else if (renderer.includes('NVIDIA')) score += 50;
        else score += 25;
    }
    
    // Screen resolution
    const pixelCount = screen.width * screen.height;
    if (pixelCount > 2073600) score += 20; // 1080p+
    else if (pixelCount > 921600) score += 15; // 720p+
    else score += 10;
    
    // Determine tier
    if (score >= 120) return 'high';
    else if (score >= 80) return 'medium';
    else return 'low';
};

PerformanceManager.prototype.initializePlatformSettings = function() {
    // Set initial quality based on platform and device tier
    if (this.platform === 'mobile') {
        if (this.deviceTier === 'high') {
            this.currentQuality = PerformanceManager.QUALITY_MEDIUM;
        } else {
            this.currentQuality = PerformanceManager.QUALITY_LOW;
        }
    } else if (this.platform === 'desktop') {
        if (this.deviceTier === 'high') {
            this.currentQuality = PerformanceManager.QUALITY_HIGH;
        } else if (this.deviceTier === 'medium') {
            this.currentQuality = PerformanceManager.QUALITY_MEDIUM;
        } else {
            this.currentQuality = PerformanceManager.QUALITY_LOW;
        }
    }
    
    // Adjust performance budgets based on platform
    if (this.platform === 'mobile') {
        this.performanceBudgets.drawCalls = 150;
        this.performanceBudgets.triangles = 25000;
        this.performanceBudgets.particles = 200;
        this.performanceBudgets.lights = 3;
        this.performanceBudgets.shadows = 1;
    }
    
    // Apply initial quality settings
    this.applyQualitySettings();
};

PerformanceManager.prototype.setupPerformanceMonitoring = function() {
    // Find camera for LOD calculations
    this.camera = this.app.root.findByTag('camera')[0];
    
    // Setup performance observer if available
    if (window.PerformanceObserver) {
        try {
            const observer = new PerformanceObserver((list) => {
                // Monitor long tasks
                list.getEntries().forEach((entry) => {
                    if (entry.duration > 50) { // Task longer than 50ms
                        this.handleLongTask(entry);
                    }
                });
            });
            observer.observe({ entryTypes: ['longtask'] });
        } catch (e) {
            console.log('Performance Observer not fully supported');
        }
    }
};

PerformanceManager.prototype.update = function(dt) {
    this.updateFrameTracking(dt);
    this.updateMemoryTracking(dt);
    this.updateLODSystem(dt);
    this.updateAdaptiveQuality(dt);
    this.updatePerformanceBudgets(dt);
    this.performOptimizations(dt);
};

PerformanceManager.prototype.updateFrameTracking = function(dt) {
    const currentTime = performance.now();
    const frameTime = currentTime - this.lastFrameTime;
    this.lastFrameTime = currentTime;
    
    // Add to history
    this.frameTimeHistory.push(frameTime);
    if (this.frameTimeHistory.length > this.maxFrameHistory) {
        this.frameTimeHistory.shift();
    }
    
    // Calculate average frame rate
    if (this.frameTimeHistory.length > 10) {
        const avgFrameTime = this.frameTimeHistory.reduce((a, b) => a + b) / this.frameTimeHistory.length;
        this.frameRate = 1000 / avgFrameTime;
    }
    
    // Track performance against targets
    if (this.frameRate < this.targetFrameRate) {
        this.framesBelow++;
        this.framesAbove = 0;
    } else if (this.frameRate > this.targetFrameRate + 10) {
        this.framesAbove++;
        this.framesBelow = 0;
    }
};

PerformanceManager.prototype.updateMemoryTracking = function(dt) {
    this.lastMemoryCheck += dt;
    
    if (this.lastMemoryCheck >= this.memoryCheckInterval) {
        this.lastMemoryCheck = 0;
        
        // Check memory usage if available
        if (performance.memory) {
            this.memoryUsage = performance.memory.usedJSHeapSize / 1024 / 1024; // MB
            
            // Trigger memory optimization if needed
            if (this.memoryUsage > this.memoryThreshold) {
                this.optimizeMemoryUsage();
            }
        }
    }
};

PerformanceManager.prototype.updateLODSystem = function(dt) {
    if (!this.camera) return;
    
    const cameraPos = this.camera.getPosition();
    
    this.lodEntities.forEach((lodData, entity) => {
        const distance = cameraPos.distance(entity.getPosition());
        const newLOD = this.calculateLODLevel(distance);
        
        if (newLOD !== lodData.currentLOD) {
            this.setEntityLOD(entity, newLOD, lodData);
            lodData.currentLOD = newLOD;
        }
        
        // Handle culling
        const shouldCull = distance > this.cullingDistance;
        if (shouldCull && !this.culledEntities.has(entity)) {
            this.cullEntity(entity);
        } else if (!shouldCull && this.culledEntities.has(entity)) {
            this.uncullEntity(entity);
        }
    });
};

PerformanceManager.prototype.calculateLODLevel = function(distance) {
    if (distance <= this.lodDistance1) return 0; // Highest detail
    if (distance <= this.lodDistance2) return 1; // High detail
    if (distance <= this.lodDistance3) return 2; // Medium detail
    return 3; // Low detail
};

PerformanceManager.prototype.setEntityLOD = function(entity, lodLevel, lodData) {
    // Switch model LOD if available
    if (lodData.models && lodData.models[lodLevel]) {
        if (entity.model) {
            entity.model.asset = lodData.models[lodLevel];
        }
    }
    
    // Adjust animation quality
    if (entity.anim) {
        switch (lodLevel) {
            case 0:
                entity.anim.speed = 1.0;
                break;
            case 1:
                entity.anim.speed = 1.0;
                break;
            case 2:
                entity.anim.speed = 0.5;
                break;
            case 3:
                entity.anim.speed = 0.25;
                break;
        }
    }
    
    // Adjust physics detail
    if (entity.rigidbody && lodLevel > 1) {
        // Reduce physics quality for distant objects
        entity.rigidbody.enabled = lodLevel < 3;
    }
};

PerformanceManager.prototype.cullEntity = function(entity) {
    this.culledEntities.add(entity);
    entity.enabled = false;
};

PerformanceManager.prototype.uncullEntity = function(entity) {
    this.culledEntities.delete(entity);
    entity.enabled = true;
};

PerformanceManager.prototype.updateAdaptiveQuality = function(dt) {
    if (!this.autoQualityEnabled) return;
    
    const currentTime = Date.now();
    
    // Don't change quality too frequently
    if (currentTime - this.lastOptimizationChange < 5000) return;
    
    // Check if we should adjust quality
    if (this.framesBelow >= this.qualityChangeThreshold) {
        this.decreaseQuality();
        this.framesBelow = 0;
        this.lastOptimizationChange = currentTime;
    } else if (this.framesAbove >= this.qualityChangeThreshold * 2) {
        this.increaseQuality();
        this.framesAbove = 0;
        this.lastOptimizationChange = currentTime;
    }
};

PerformanceManager.prototype.updatePerformanceBudgets = function(dt) {
    // Reset counters
    this.currentUsage = {
        drawCalls: 0,
        triangles: 0,
        particles: 0,
        lights: 0,
        shadows: 0
    };
    
    // Count current usage (simplified)
    const renderData = this.app.graphicsDevice.renderTargets;
    
    // Count lights
    const lights = this.app.root.findByTag('light');
    this.currentUsage.lights = lights.length;
    
    // Count active particle systems
    const particles = this.app.root.findByTag('particles');
    this.currentUsage.particles = particles.filter(p => p.enabled).length;
    
    // Check if we're over budget
    this.checkBudgetOverage();
};

PerformanceManager.prototype.checkBudgetOverage = function() {
    const overages = [];
    
    Object.keys(this.performanceBudgets).forEach(budget => {
        if (this.currentUsage[budget] > this.performanceBudgets[budget]) {
            overages.push(budget);
        }
    });
    
    if (overages.length > 0) {
        this.handleBudgetOverage(overages);
    }
};

PerformanceManager.prototype.handleBudgetOverage = function(overages) {
    overages.forEach(budget => {
        switch (budget) {
            case 'lights':
                this.optimizeLighting();
                break;
            case 'particles':
                this.optimizeParticles();
                break;
            case 'drawCalls':
                this.optimizeDrawCalls();
                break;
        }
    });
};

PerformanceManager.prototype.performOptimizations = function(dt) {
    // Perform optimizations based on current performance
    if (this.frameRate < this.minFrameRate) {
        this.optimizationLevel = Math.min(5, this.optimizationLevel + 1);
        this.applyOptimizations();
    } else if (this.frameRate > this.targetFrameRate + 15 && this.optimizationLevel > 0) {
        this.optimizationLevel = Math.max(0, this.optimizationLevel - 1);
        this.applyOptimizations();
    }
};

PerformanceManager.prototype.applyOptimizations = function() {
    switch (this.optimizationLevel) {
        case 1:
            this.optimizeLevel1();
            break;
        case 2:
            this.optimizeLevel2();
            break;
        case 3:
            this.optimizeLevel3();
            break;
        case 4:
            this.optimizeLevel4();
            break;
        case 5:
            this.optimizeLevel5();
            break;
    }
};

PerformanceManager.prototype.optimizeLevel1 = function() {
    // Light optimization
    this.optimizeLighting();
};

PerformanceManager.prototype.optimizeLevel2 = function() {
    // Particle optimization
    this.optimizeParticles();
    
    // Reduce shadow quality
    this.optimizeShadows();
};

PerformanceManager.prototype.optimizeLevel3 = function() {
    // Disable non-essential visual effects
    this.app.fire('effects:reduceQuality', 0.7);
    
    // Reduce LOD distances
    this.lodDistance1 *= 0.8;
    this.lodDistance2 *= 0.8;
    this.lodDistance3 *= 0.8;
};

PerformanceManager.prototype.optimizeLevel4 = function() {
    // Disable ambient effects
    this.app.fire('effects:disableAmbient');
    
    // Reduce culling distance
    this.cullingDistance *= 0.8;
};

PerformanceManager.prototype.optimizeLevel5 = function() {
    // Maximum optimization - disable all non-essential rendering
    this.app.fire('effects:disableAll');
    
    // Force lowest quality
    this.changeQuality(PerformanceManager.QUALITY_LOW);
};

PerformanceManager.prototype.optimizeLighting = function() {
    const lights = this.app.root.findByTag('light');
    
    // Disable distant lights
    if (this.camera) {
        const cameraPos = this.camera.getPosition();
        
        lights.forEach(light => {
            const distance = cameraPos.distance(light.getPosition());
            if (distance > 50 && light.light.type !== pc.LIGHTTYPE_DIRECTIONAL) {
                light.enabled = false;
            }
        });
    }
    
    // Limit shadow casting lights
    const shadowLights = lights.filter(l => l.light && l.light.castShadows);
    shadowLights.forEach((light, index) => {
        if (index >= this.performanceBudgets.shadows) {
            light.light.castShadows = false;
        }
    });
};

PerformanceManager.prototype.optimizeParticles = function() {
    const particleSystems = this.app.root.findByTag('particles');
    
    particleSystems.forEach(ps => {
        if (ps.particlesystem) {
            // Reduce particle count
            ps.particlesystem.numParticles = Math.floor(ps.particlesystem.numParticles * 0.7);
            
            // Reduce emission rate
            ps.particlesystem.rate = Math.floor(ps.particlesystem.rate * 0.8);
        }
    });
};

PerformanceManager.prototype.optimizeShadows = function() {
    // Reduce shadow map resolution
    this.app.graphicsDevice.shadowMapSize = Math.max(512, this.app.graphicsDevice.shadowMapSize * 0.8);
    
    // Reduce shadow distance
    const lights = this.app.root.findByTag('light');
    lights.forEach(light => {
        if (light.light && light.light.castShadows) {
            light.light.shadowDistance = Math.min(light.light.shadowDistance, 30);
        }
    });
};

PerformanceManager.prototype.optimizeDrawCalls = function() {
    // Request batching optimization
    this.app.fire('renderer:optimizeBatching');
    
    // Reduce detail on distant objects
    this.lodDistance1 *= 0.9;
    this.lodDistance2 *= 0.9;
    this.lodDistance3 *= 0.9;
};

PerformanceManager.prototype.optimizeMemoryUsage = function() {
    // Clear unused assets
    this.app.fire('assets:cleanup');
    
    // Reduce texture quality
    this.app.fire('textures:reduceQuality');
    
    // Clear old effect instances
    this.app.fire('effects:cleanup');
    
    // Force garbage collection if available
    if (window.gc) {
        window.gc();
    }
};

PerformanceManager.prototype.changeQuality = function(qualityLevel) {
    if (qualityLevel === this.currentQuality) return;
    
    this.currentQuality = qualityLevel;
    this.applyQualitySettings();
    
    this.app.fire('performance:qualityChanged', {
        quality: qualityLevel,
        reason: 'manual'
    });
};

PerformanceManager.prototype.decreaseQuality = function() {
    if (this.currentQuality > PerformanceManager.QUALITY_LOW) {
        this.changeQuality(this.currentQuality - 1);
        console.log('Performance: Decreased quality to', this.getQualityName(this.currentQuality));
    }
};

PerformanceManager.prototype.increaseQuality = function() {
    if (this.currentQuality < PerformanceManager.QUALITY_ULTRA) {
        this.changeQuality(this.currentQuality + 1);
        console.log('Performance: Increased quality to', this.getQualityName(this.currentQuality));
    }
};

PerformanceManager.prototype.applyQualitySettings = function() {
    const settings = this.getQualitySettings(this.currentQuality);
    
    // Apply graphics settings
    this.app.fire('graphics:applySettings', settings);
    
    // Update performance budgets
    this.updateBudgetsForQuality(settings);
};

PerformanceManager.prototype.getQualitySettings = function(quality) {
    const settings = {
        shadowResolution: 1024,
        textureQuality: 1.0,
        particleQuality: 1.0,
        effectsQuality: 1.0,
        lodBias: 1.0,
        antiAliasing: true,
        postProcessing: true,
        bloom: true,
        ssao: false,
        shadowCascades: 2
    };
    
    switch (quality) {
        case PerformanceManager.QUALITY_LOW:
            settings.shadowResolution = 512;
            settings.textureQuality = 0.5;
            settings.particleQuality = 0.5;
            settings.effectsQuality = 0.5;
            settings.lodBias = 0.5;
            settings.antiAliasing = false;
            settings.postProcessing = false;
            settings.bloom = false;
            settings.shadowCascades = 1;
            break;
            
        case PerformanceManager.QUALITY_MEDIUM:
            settings.shadowResolution = 1024;
            settings.textureQuality = 0.75;
            settings.particleQuality = 0.75;
            settings.effectsQuality = 0.75;
            settings.lodBias = 0.75;
            settings.antiAliasing = false;
            settings.postProcessing = true;
            settings.bloom = true;
            settings.shadowCascades = 2;
            break;
            
        case PerformanceManager.QUALITY_HIGH:
            settings.shadowResolution = 2048;
            settings.textureQuality = 1.0;
            settings.particleQuality = 1.0;
            settings.effectsQuality = 1.0;
            settings.lodBias = 1.0;
            settings.antiAliasing = true;
            settings.postProcessing = true;
            settings.bloom = true;
            settings.ssao = true;
            settings.shadowCascades = 3;
            break;
            
        case PerformanceManager.QUALITY_ULTRA:
            settings.shadowResolution = 4096;
            settings.textureQuality = 1.0;
            settings.particleQuality = 1.0;
            settings.effectsQuality = 1.0;
            settings.lodBias = 1.0;
            settings.antiAliasing = true;
            settings.postProcessing = true;
            settings.bloom = true;
            settings.ssao = true;
            settings.shadowCascades = 4;
            break;
    }
    
    return settings;
};

PerformanceManager.prototype.updateBudgetsForQuality = function(settings) {
    const multiplier = settings.effectsQuality;
    
    this.performanceBudgets.particles = Math.floor(this.performanceBudgets.particles * multiplier);
    this.performanceBudgets.lights = Math.floor(this.performanceBudgets.lights * multiplier);
    this.performanceBudgets.shadows = Math.floor(this.performanceBudgets.shadows * multiplier);
};

PerformanceManager.prototype.registerLODEntity = function(data) {
    this.lodEntities.set(data.entity, {
        models: data.models || null,
        currentLOD: 0,
        originalSettings: data.originalSettings || {}
    });
};

PerformanceManager.prototype.unregisterLODEntity = function(entity) {
    this.lodEntities.delete(entity);
    this.culledEntities.delete(entity);
};

PerformanceManager.prototype.forceOptimization = function(level) {
    this.optimizationLevel = Math.max(0, Math.min(5, level));
    this.applyOptimizations();
};

PerformanceManager.prototype.handleLongTask = function(entry) {
    console.warn('Long task detected:', entry.duration + 'ms');
    
    // If we're getting long tasks, increase optimization
    if (entry.duration > 100) {
        this.optimizationLevel = Math.min(5, this.optimizationLevel + 1);
        this.applyOptimizations();
    }
};

PerformanceManager.prototype.getQualityName = function(quality) {
    switch (quality) {
        case PerformanceManager.QUALITY_LOW: return 'Low';
        case PerformanceManager.QUALITY_MEDIUM: return 'Medium';
        case PerformanceManager.QUALITY_HIGH: return 'High';
        case PerformanceManager.QUALITY_ULTRA: return 'Ultra';
        default: return 'Unknown';
    }
};

PerformanceManager.prototype.getPerformanceStats = function() {
    return {
        frameRate: Math.round(this.frameRate),
        memoryUsage: Math.round(this.memoryUsage),
        quality: this.getQualityName(this.currentQuality),
        optimizationLevel: this.optimizationLevel,
        activeEntities: this.app.root.children.length - this.culledEntities.size,
        culledEntities: this.culledEntities.size,
        budgetUsage: this.currentUsage,
        budgetLimits: this.performanceBudgets
    };
};

PerformanceManager.prototype.enableAdaptiveQuality = function(enabled) {
    this.autoQualityEnabled = enabled;
    if (!enabled) {
        this.framesBelow = 0;
        this.framesAbove = 0;
    }
};

PerformanceManager.prototype.setTargetFrameRate = function(fps) {
    this.targetFrameRate = fps;
    this.minFrameRate = Math.max(20, fps - 15);
};