/**
 * Decal System - Surface Decal Management
 * Handles bullet holes, blood splatter, explosion marks, and other surface decals
 */

class DecalSystem {
    constructor() {
        this.decals = new Map();
        this.decalPools = new Map();
        this.maxDecals = 500;
        this.maxDecalsPerSurface = 50;
        this.fadeTime = 30.0; // seconds
        this.currentDecalCount = 0;
        
        this.decalTypes = {
            bulletHole: {
                texture: 'bullet_hole_01',
                size: { min: 0.05, max: 0.15 },
                randomRotation: true,
                fadeTime: 60.0,
                depth: 0.001,
                surfaceTypes: ['concrete', 'metal', 'wood', 'plastic'],
                variations: ['bullet_hole_01', 'bullet_hole_02', 'bullet_hole_03']
            },
            bloodSplatter: {
                texture: 'blood_splatter_01',
                size: { min: 0.1, max: 0.4 },
                randomRotation: true,
                fadeTime: 45.0,
                depth: 0.0005,
                surfaceTypes: ['all'],
                variations: ['blood_splatter_01', 'blood_splatter_02', 'blood_splatter_03', 'blood_splatter_04']
            },
            explosion: {
                texture: 'explosion_mark_01',
                size: { min: 0.5, max: 2.0 },
                randomRotation: true,
                fadeTime: 120.0,
                depth: 0.002,
                surfaceTypes: ['concrete', 'metal', 'asphalt'],
                variations: ['explosion_mark_01', 'explosion_mark_02']
            },
            burn: {
                texture: 'burn_mark_01',
                size: { min: 0.3, max: 1.2 },
                randomRotation: true,
                fadeTime: 90.0,
                depth: 0.001,
                surfaceTypes: ['wood', 'plastic', 'fabric'],
                variations: ['burn_mark_01', 'burn_mark_02']
            },
            scorch: {
                texture: 'scorch_mark_01',
                size: { min: 0.8, max: 2.5 },
                randomRotation: true,
                fadeTime: 180.0,
                depth: 0.003,
                surfaceTypes: ['concrete', 'metal', 'asphalt'],
                variations: ['scorch_mark_01']
            },
            dirt: {
                texture: 'dirt_mark_01',
                size: { min: 0.2, max: 0.8 },
                randomRotation: true,
                fadeTime: 20.0,
                depth: 0.0001,
                surfaceTypes: ['all'],
                variations: ['dirt_mark_01', 'dirt_mark_02']
            },
            graffiti: {
                texture: 'graffiti_01',
                size: { min: 0.5, max: 1.5 },
                randomRotation: false,
                fadeTime: -1, // Permanent
                depth: 0.0001,
                surfaceTypes: ['concrete', 'metal', 'brick'],
                variations: ['graffiti_01', 'graffiti_02', 'graffiti_03']
            }
        };
        
        this.surfaceProperties = {
            concrete: {
                hardness: 0.9,
                absorption: 0.3,
                textureScale: 1.0,
                normalInfluence: 0.8
            },
            metal: {
                hardness: 0.95,
                absorption: 0.1,
                textureScale: 0.8,
                normalInfluence: 0.9
            },
            wood: {
                hardness: 0.6,
                absorption: 0.7,
                textureScale: 1.2,
                normalInfluence: 0.6
            },
            plastic: {
                hardness: 0.4,
                absorption: 0.5,
                textureScale: 1.0,
                normalInfluence: 0.7
            },
            fabric: {
                hardness: 0.2,
                absorption: 0.9,
                textureScale: 1.5,
                normalInfluence: 0.3
            },
            glass: {
                hardness: 0.8,
                absorption: 0.0,
                textureScale: 0.5,
                normalInfluence: 1.0
            }
        };
        
        this.renderSettings = {
            enableProjection: true,
            enableFading: true,
            enableLOD: true,
            lodDistance: 50.0,
            cullingDistance: 100.0,
            shadowReceiving: true,
            lightingEnabled: true
        };
        
        this.qualitySettings = {
            high: {
                maxDecals: 500,
                fadeTime: 60.0,
                enableRotation: true,
                enableVariations: true,
                depthPrecision: 16
            },
            medium: {
                maxDecals: 300,
                fadeTime: 45.0,
                enableRotation: true,
                enableVariations: true,
                depthPrecision: 8
            },
            low: {
                maxDecals: 150,
                fadeTime: 30.0,
                enableRotation: false,
                enableVariations: false,
                depthPrecision: 4
            }
        };
        
        this.events = new EventTarget();
        this.currentQuality = 'high';
        
        this.init();
    }
    
    init() {
        this.initializeDecalPools();
        this.setupRenderTargets();
    }
    
    initializeDecalPools() {
        Object.keys(this.decalTypes).forEach(type => {
            this.decalPools.set(type, []);
        });
    }
    
    setupRenderTargets() {
        // Initialize render targets for decal projection
        if (window.renderManager) {
            window.renderManager.createDecalRenderTarget('decal_buffer', 1024, 1024);
        }
    }
    
    update(deltaTime) {
        this.updateDecalFading(deltaTime);
        this.cullDistantDecals();
        this.manageLOD();
    }
    
    updateDecalFading(deltaTime) {
        const currentTime = Date.now() / 1000;
        
        this.decals.forEach((decal, id) => {
            if (decal.fadeTime <= 0) return; // Permanent decal
            
            const age = currentTime - decal.creationTime;
            if (age >= decal.fadeTime) {
                this.removeDecal(id);
                return;
            }
            
            // Calculate fade alpha
            const fadeStartTime = decal.fadeTime * 0.7; // Start fading at 70% of lifetime
            if (age >= fadeStartTime) {
                const fadeProgress = (age - fadeStartTime) / (decal.fadeTime - fadeStartTime);
                decal.alpha = 1.0 - fadeProgress;
            }
        });
    }
    
    cullDistantDecals() {
        if (!window.playerController) return;
        
        const playerPosition = window.playerController.getPosition();
        
        this.decals.forEach((decal, id) => {
            const distance = this.calculateDistance(playerPosition, decal.position);
            
            if (distance > this.renderSettings.cullingDistance) {
                decal.visible = false;
            } else {
                decal.visible = distance <= this.renderSettings.lodDistance;
                decal.lodLevel = this.calculateLOD(distance);
            }
        });
    }
    
    manageLOD() {
        // Implement Level of Detail for decals
        if (!this.renderSettings.enableLOD) return;
        
        this.decals.forEach(decal => {
            if (!decal.visible) return;
            
            // Adjust decal quality based on LOD level
            switch (decal.lodLevel) {
                case 0: // High quality
                    decal.renderSize = decal.originalSize;
                    decal.renderQuality = 1.0;
                    break;
                case 1: // Medium quality
                    decal.renderSize = decal.originalSize * 0.8;
                    decal.renderQuality = 0.7;
                    break;
                case 2: // Low quality
                    decal.renderSize = decal.originalSize * 0.6;
                    decal.renderQuality = 0.5;
                    break;
            }
        });
    }
    
    calculateLOD(distance) {
        if (distance < this.renderSettings.lodDistance * 0.3) return 0;
        if (distance < this.renderSettings.lodDistance * 0.7) return 1;
        return 2;
    }
    
    calculateDistance(pos1, pos2) {
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        const dz = pos1.z - pos2.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    
    // Public API methods
    addDecal(type, position, normal, config = {}) {
        if (this.currentDecalCount >= this.maxDecals) {
            this.removeOldestDecal();
        }
        
        const decalType = this.decalTypes[type];
        if (!decalType) {
            console.warn(`Decal type '${type}' not found`);
            return null;
        }
        
        // Check surface compatibility
        const surfaceType = config.surfaceType || 'concrete';
        if (!this.isSurfaceCompatible(decalType, surfaceType)) {
            return null;
        }
        
        const decalId = this.generateDecalId();
        const currentTime = Date.now() / 1000;
        
        // Select texture variation
        const texture = this.selectTextureVariation(decalType);
        
        // Calculate size
        const size = config.size || this.randomBetween(decalType.size.min, decalType.size.max);
        
        // Apply surface properties
        const surfaceProps = this.surfaceProperties[surfaceType] || this.surfaceProperties.concrete;
        const adjustedSize = size * surfaceProps.textureScale;
        
        const decal = {
            id: decalId,
            type: type,
            texture: texture,
            position: { ...position },
            normal: { ...normal },
            size: adjustedSize,
            originalSize: adjustedSize,
            renderSize: adjustedSize,
            rotation: decalType.randomRotation ? Math.random() * Math.PI * 2 : 0,
            alpha: 1.0,
            depth: decalType.depth,
            fadeTime: config.fadeTime || decalType.fadeTime,
            creationTime: currentTime,
            surfaceType: surfaceType,
            visible: true,
            lodLevel: 0,
            renderQuality: 1.0,
            projectionMatrix: null,
            ...config
        };
        
        // Calculate projection matrix for decal rendering
        decal.projectionMatrix = this.calculateProjectionMatrix(decal);
        
        this.decals.set(decalId, decal);
        this.currentDecalCount++;
        
        this.events.dispatchEvent(new CustomEvent('decalAdded', {
            detail: { decal: decal }
        }));
        
        return decalId;
    }
    
    addBulletHole(position, normal, surfaceType, weaponType = 'rifle') {
        const config = {
            surfaceType: surfaceType,
            size: this.getBulletHoleSize(weaponType)
        };
        
        return this.addDecal('bulletHole', position, normal, config);
    }
    
    addBloodSplatter(position, normal, intensity = 1.0) {
        const config = {
            size: this.randomBetween(0.1, 0.4) * intensity,
            alpha: Math.min(1.0, intensity)
        };
        
        return this.addDecal('bloodSplatter', position, normal, config);
    }
    
    addExplosionMark(position, normal, radius = 1.0) {
        const config = {
            size: radius * this.randomBetween(0.8, 1.2),
            fadeTime: 120.0
        };
        
        return this.addDecal('explosion', position, normal, config);
    }
    
    addScorchMark(position, normal, intensity = 1.0) {
        const config = {
            size: intensity * this.randomBetween(0.8, 2.0),
            fadeTime: 180.0
        };
        
        return this.addDecal('scorch', position, normal, config);
    }
    
    getBulletHoleSize(weaponType) {
        const sizeMap = {
            pistol: this.randomBetween(0.03, 0.08),
            rifle: this.randomBetween(0.05, 0.12),
            sniper: this.randomBetween(0.08, 0.15),
            shotgun: this.randomBetween(0.10, 0.20)
        };
        
        return sizeMap[weaponType] || sizeMap.rifle;
    }
    
    selectTextureVariation(decalType) {
        if (!this.qualitySettings[this.currentQuality].enableVariations) {
            return decalType.texture;
        }
        
        const variations = decalType.variations || [decalType.texture];
        return variations[Math.floor(Math.random() * variations.length)];
    }
    
    isSurfaceCompatible(decalType, surfaceType) {
        if (decalType.surfaceTypes.includes('all')) return true;
        return decalType.surfaceTypes.includes(surfaceType);
    }
    
    calculateProjectionMatrix(decal) {
        // Calculate projection matrix for projecting decal onto surface
        // This would typically interface with the rendering system
        const forward = { ...decal.normal };
        const up = { x: 0, y: 1, z: 0 };
        
        // Calculate right vector
        const right = {
            x: up.y * forward.z - up.z * forward.y,
            y: up.z * forward.x - up.x * forward.z,
            z: up.x * forward.y - up.y * forward.x
        };
        
        // Recalculate up vector
        const newUp = {
            x: forward.y * right.z - forward.z * right.y,
            y: forward.z * right.x - forward.x * right.z,
            z: forward.x * right.y - forward.y * right.x
        };
        
        // Create transformation matrix
        return {
            position: decal.position,
            rotation: { forward, up: newUp, right },
            scale: { x: decal.size, y: decal.size, z: decal.depth }
        };
    }
    
    removeDecal(decalId) {
        const decal = this.decals.get(decalId);
        if (!decal) return;
        
        this.decals.delete(decalId);
        this.currentDecalCount--;
        
        this.events.dispatchEvent(new CustomEvent('decalRemoved', {
            detail: { decalId: decalId, decal: decal }
        }));
    }
    
    removeOldestDecal() {
        let oldestTime = Infinity;
        let oldestId = null;
        
        this.decals.forEach((decal, id) => {
            if (decal.creationTime < oldestTime) {
                oldestTime = decal.creationTime;
                oldestId = id;
            }
        });
        
        if (oldestId) {
            this.removeDecal(oldestId);
        }
    }
    
    removeDecalsByType(type) {
        const idsToRemove = [];
        
        this.decals.forEach((decal, id) => {
            if (decal.type === type) {
                idsToRemove.push(id);
            }
        });
        
        idsToRemove.forEach(id => this.removeDecal(id));
    }
    
    clearAllDecals() {
        this.decals.clear();
        this.currentDecalCount = 0;
        
        this.events.dispatchEvent(new CustomEvent('allDecalsCleared'));
    }
    
    setQuality(quality) {
        if (!this.qualitySettings[quality]) return;
        
        this.currentQuality = quality;
        const settings = this.qualitySettings[quality];
        
        this.maxDecals = settings.maxDecals;
        this.fadeTime = settings.fadeTime;
        
        // Remove excess decals if quality was lowered
        while (this.currentDecalCount > this.maxDecals) {
            this.removeOldestDecal();
        }
        
        this.events.dispatchEvent(new CustomEvent('qualityChanged', {
            detail: { quality: quality }
        }));
    }
    
    setMaxDecals(max) {
        this.maxDecals = Math.max(10, max);
        
        while (this.currentDecalCount > this.maxDecals) {
            this.removeOldestDecal();
        }
    }
    
    enableDecalType(type, enabled = true) {
        const decalType = this.decalTypes[type];
        if (decalType) {
            decalType.enabled = enabled;
        }
    }
    
    // Surface hit processing
    processHit(hitInfo) {
        if (!hitInfo.position || !hitInfo.normal) return;
        
        const surfaceType = hitInfo.surfaceType || 'concrete';
        
        // Add appropriate decal based on hit type
        switch (hitInfo.type) {
            case 'bullet':
                this.addBulletHole(hitInfo.position, hitInfo.normal, surfaceType, hitInfo.weaponType);
                break;
            case 'explosion':
                this.addExplosionMark(hitInfo.position, hitInfo.normal, hitInfo.radius);
                break;
            case 'blood':
                this.addBloodSplatter(hitInfo.position, hitInfo.normal, hitInfo.intensity);
                break;
            case 'fire':
                this.addScorchMark(hitInfo.position, hitInfo.normal, hitInfo.intensity);
                break;
        }
    }
    
    // Utility methods
    randomBetween(min, max) {
        return min + Math.random() * (max - min);
    }
    
    generateDecalId() {
        return 'decal_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2);
    }
    
    // Event listeners
    addEventListener(event, callback) {
        this.events.addEventListener(event, callback);
    }
    
    removeEventListener(event, callback) {
        this.events.removeEventListener(event, callback);
    }
    
    // Debug and diagnostic methods
    getDebugInfo() {
        return {
            totalDecals: this.currentDecalCount,
            maxDecals: this.maxDecals,
            qualityLevel: this.currentQuality,
            memoryUsage: this.estimateMemoryUsage(),
            decalsByType: this.getDecalCountsByType(),
            renderSettings: this.renderSettings
        };
    }
    
    getDecalCountsByType() {
        const counts = {};
        
        this.decals.forEach(decal => {
            counts[decal.type] = (counts[decal.type] || 0) + 1;
        });
        
        return counts;
    }
    
    estimateMemoryUsage() {
        // Rough estimate of memory usage in KB
        return this.currentDecalCount * 2; // ~2KB per decal estimate
    }
    
    getVisibleDecals() {
        return Array.from(this.decals.values()).filter(decal => decal.visible);
    }
    
    getDecalsByDistance(position, maxDistance = 50) {
        const nearbyDecals = [];
        
        this.decals.forEach(decal => {
            const distance = this.calculateDistance(position, decal.position);
            if (distance <= maxDistance) {
                nearbyDecals.push({ decal, distance });
            }
        });
        
        return nearbyDecals.sort((a, b) => a.distance - b.distance);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DecalSystem;
} else {
    window.DecalSystem = DecalSystem;
}
