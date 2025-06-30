/**
 * Particle Manager - Advanced Particle System for Effects
 * Handles weapon effects, environmental particles, explosions, and atmospheric effects
 */

class ParticleManager {
    constructor() {
        this.particleSystems = new Map();
        this.activeEmitters = new Map();
        this.particlePool = [];
        this.maxParticles = 10000;
        this.currentParticleCount = 0;
        
        this.renderLayers = {
            background: 0,
            environment: 1,
            weapons: 2,
            explosions: 3,
            UI: 4
        };
        
        this.particleTypes = {
            smoke: {
                texture: 'smoke_01',
                size: { min: 0.5, max: 2.0 },
                velocity: { min: 1.0, max: 3.0 },
                lifetime: { min: 2.0, max: 5.0 },
                color: { r: 0.7, g: 0.7, b: 0.7, a: 0.6 },
                fadeOut: true,
                physics: true,
                wind: true
            },
            fire: {
                texture: 'fire_01',
                size: { min: 0.3, max: 1.5 },
                velocity: { min: 2.0, max: 5.0 },
                lifetime: { min: 0.5, max: 2.0 },
                color: { r: 1.0, g: 0.6, b: 0.2, a: 0.8 },
                fadeOut: true,
                physics: false,
                wind: false,
                emissive: true
            },
            spark: {
                texture: 'spark_01',
                size: { min: 0.1, max: 0.3 },
                velocity: { min: 5.0, max: 15.0 },
                lifetime: { min: 0.2, max: 1.0 },
                color: { r: 1.0, g: 0.9, b: 0.3, a: 1.0 },
                fadeOut: true,
                physics: true,
                gravity: true,
                bounce: 0.3
            },
            dust: {
                texture: 'dust_01',
                size: { min: 0.2, max: 0.8 },
                velocity: { min: 0.5, max: 2.0 },
                lifetime: { min: 3.0, max: 8.0 },
                color: { r: 0.8, g: 0.7, b: 0.6, a: 0.3 },
                fadeOut: true,
                physics: false,
                wind: true
            },
            blood: {
                texture: 'blood_01',
                size: { min: 0.1, max: 0.5 },
                velocity: { min: 3.0, max: 8.0 },
                lifetime: { min: 1.0, max: 3.0 },
                color: { r: 0.8, g: 0.1, b: 0.1, a: 0.9 },
                fadeOut: true,
                physics: true,
                gravity: true,
                stick: true
            },
            muzzleFlash: {
                texture: 'muzzle_flash_01',
                size: { min: 0.5, max: 1.0 },
                velocity: { min: 0.0, max: 1.0 },
                lifetime: { min: 0.05, max: 0.15 },
                color: { r: 1.0, g: 0.8, b: 0.3, a: 1.0 },
                fadeOut: true,
                physics: false,
                emissive: true,
                screenSpace: true
            },
            debris: {
                texture: 'debris_01',
                size: { min: 0.2, max: 1.0 },
                velocity: { min: 2.0, max: 10.0 },
                lifetime: { min: 2.0, max: 8.0 },
                color: { r: 0.6, g: 0.6, b: 0.6, a: 1.0 },
                fadeOut: false,
                physics: true,
                gravity: true,
                bounce: 0.5,
                friction: 0.8
            }
        };
        
        this.globalSettings = {
            gravity: { x: 0, y: -9.81, z: 0 },
            wind: { x: 0, y: 0, z: 0 },
            airResistance: 0.98,
            timeScale: 1.0,
            qualityLevel: 'high',
            maxEmitters: 50,
            enablePhysics: true,
            enableLighting: true
        };
        
        this.performanceMetrics = {
            particlesPerSecond: 0,
            averageLifetime: 0,
            memoryUsage: 0,
            renderTime: 0
        };
        
        this.events = new EventTarget();
        
        this.init();
    }
    
    init() {
        this.initializeParticlePool();
        this.setupPresets();
        this.bindPerformanceMonitoring();
    }
    
    initializeParticlePool() {
        // Pre-allocate particle objects for performance
        for (let i = 0; i < this.maxParticles; i++) {
            this.particlePool.push(this.createParticle());
        }
    }
    
    createParticle() {
        return {
            id: null,
            active: false,
            position: { x: 0, y: 0, z: 0 },
            velocity: { x: 0, y: 0, z: 0 },
            acceleration: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            angularVelocity: { x: 0, y: 0, z: 0 },
            size: 1.0,
            sizeVelocity: 0.0,
            color: { r: 1, g: 1, b: 1, a: 1 },
            colorVelocity: { r: 0, g: 0, b: 0, a: 0 },
            lifetime: 1.0,
            age: 0.0,
            type: 'default',
            texture: null,
            emitter: null,
            physics: false,
            stuck: false,
            bounces: 0,
            layer: 0
        };
    }
    
    setupPresets() {
        // Define common particle effect presets
        this.definePreset('explosion', {
            particles: [
                { type: 'fire', count: 50, spread: 360, speed: { min: 5, max: 15 } },
                { type: 'smoke', count: 30, spread: 180, speed: { min: 2, max: 8 }, delay: 0.2 },
                { type: 'debris', count: 20, spread: 360, speed: { min: 3, max: 12 } },
                { type: 'spark', count: 100, spread: 360, speed: { min: 8, max: 20 } }
            ],
            duration: 3.0,
            layer: this.renderLayers.explosions
        });
        
        this.definePreset('weaponHit', {
            particles: [
                { type: 'spark', count: 15, spread: 120, speed: { min: 5, max: 12 } },
                { type: 'dust', count: 10, spread: 90, speed: { min: 1, max: 4 } }
            ],
            duration: 1.0,
            layer: this.renderLayers.weapons
        });
        
        this.definePreset('bloodHit', {
            particles: [
                { type: 'blood', count: 20, spread: 160, speed: { min: 2, max: 8 } }
            ],
            duration: 0.5,
            layer: this.renderLayers.weapons
        });
        
        this.definePreset('muzzleFlash', {
            particles: [
                { type: 'muzzleFlash', count: 1, spread: 0, speed: { min: 0, max: 0 } },
                { type: 'smoke', count: 5, spread: 45, speed: { min: 1, max: 3 }, delay: 0.05 }
            ],
            duration: 0.2,
            layer: this.renderLayers.weapons
        });
    }
    
    definePreset(name, config) {
        this.particleSystems.set(name, config);
    }
    
    update(deltaTime) {
        deltaTime *= this.globalSettings.timeScale;
        
        this.updateActiveParticles(deltaTime);
        this.updateEmitters(deltaTime);
        this.updatePerformanceMetrics(deltaTime);
        this.cleanupDeadParticles();
    }
    
    updateActiveParticles(deltaTime) {
        let activeCount = 0;
        
        for (let particle of this.particlePool) {
            if (!particle.active) continue;
            
            activeCount++;
            this.updateParticle(particle, deltaTime);
        }
        
        this.currentParticleCount = activeCount;
    }
    
    updateParticle(particle, deltaTime) {
        particle.age += deltaTime;
        
        // Check if particle should die
        if (particle.age >= particle.lifetime) {
            this.killParticle(particle);
            return;
        }
        
        // Update physics if enabled
        if (particle.physics && this.globalSettings.enablePhysics) {
            this.updateParticlePhysics(particle, deltaTime);
        }
        
        // Update position
        particle.position.x += particle.velocity.x * deltaTime;
        particle.position.y += particle.velocity.y * deltaTime;
        particle.position.z += particle.velocity.z * deltaTime;
        
        // Update rotation
        particle.rotation.x += particle.angularVelocity.x * deltaTime;
        particle.rotation.y += particle.angularVelocity.y * deltaTime;
        particle.rotation.z += particle.angularVelocity.z * deltaTime;
        
        // Update size
        particle.size += particle.sizeVelocity * deltaTime;
        particle.size = Math.max(0, particle.size);
        
        // Update color
        particle.color.r += particle.colorVelocity.r * deltaTime;
        particle.color.g += particle.colorVelocity.g * deltaTime;
        particle.color.b += particle.colorVelocity.b * deltaTime;
        particle.color.a += particle.colorVelocity.a * deltaTime;
        
        // Clamp color values
        particle.color.r = Math.max(0, Math.min(1, particle.color.r));
        particle.color.g = Math.max(0, Math.min(1, particle.color.g));
        particle.color.b = Math.max(0, Math.min(1, particle.color.b));
        particle.color.a = Math.max(0, Math.min(1, particle.color.a));
        
        // Apply fade out
        const particleType = this.particleTypes[particle.type];
        if (particleType && particleType.fadeOut) {
            const lifetimeRatio = particle.age / particle.lifetime;
            if (lifetimeRatio > 0.7) {
                const fadeRatio = (lifetimeRatio - 0.7) / 0.3;
                particle.color.a *= (1.0 - fadeRatio);
            }
        }
    }
    
    updateParticlePhysics(particle, deltaTime) {
        const particleType = this.particleTypes[particle.type];
        if (!particleType) return;
        
        // Apply gravity
        if (particleType.gravity) {
            particle.velocity.x += this.globalSettings.gravity.x * deltaTime;
            particle.velocity.y += this.globalSettings.gravity.y * deltaTime;
            particle.velocity.z += this.globalSettings.gravity.z * deltaTime;
        }
        
        // Apply wind
        if (particleType.wind) {
            const windForce = 0.5;
            particle.velocity.x += this.globalSettings.wind.x * windForce * deltaTime;
            particle.velocity.y += this.globalSettings.wind.y * windForce * deltaTime;
            particle.velocity.z += this.globalSettings.wind.z * windForce * deltaTime;
        }
        
        // Apply air resistance
        if (!particle.stuck) {
            particle.velocity.x *= Math.pow(this.globalSettings.airResistance, deltaTime);
            particle.velocity.y *= Math.pow(this.globalSettings.airResistance, deltaTime);
            particle.velocity.z *= Math.pow(this.globalSettings.airResistance, deltaTime);
        }
        
        // Check for collisions if physics is enabled
        if (window.physicsManager && !particle.stuck) {
            const collision = window.physicsManager.checkParticleCollision(
                particle.position,
                particle.velocity,
                0.1 // particle radius
            );
            
            if (collision.hit) {
                this.handleParticleCollision(particle, collision, particleType);
            }
        }
    }
    
    handleParticleCollision(particle, collision, particleType) {
        if (particleType.stick) {
            // Stick to surface (like blood)
            particle.stuck = true;
            particle.velocity = { x: 0, y: 0, z: 0 };
            particle.position = collision.point;
        } else if (particleType.bounce && particle.bounces < 3) {
            // Bounce off surface
            const bounceStrength = particleType.bounce || 0.5;
            
            // Reflect velocity based on surface normal
            const dot = particle.velocity.x * collision.normal.x +
                       particle.velocity.y * collision.normal.y +
                       particle.velocity.z * collision.normal.z;
            
            particle.velocity.x -= 2 * dot * collision.normal.x * bounceStrength;
            particle.velocity.y -= 2 * dot * collision.normal.y * bounceStrength;
            particle.velocity.z -= 2 * dot * collision.normal.z * bounceStrength;
            
            // Apply friction
            if (particleType.friction) {
                particle.velocity.x *= particleType.friction;
                particle.velocity.y *= particleType.friction;
                particle.velocity.z *= particleType.friction;
            }
            
            particle.bounces++;
        } else {
            // Kill particle on collision
            this.killParticle(particle);
        }
    }
    
    updateEmitters(deltaTime) {
        this.activeEmitters.forEach((emitter, id) => {
            emitter.age += deltaTime;
            
            if (emitter.duration > 0 && emitter.age >= emitter.duration) {
                this.removeEmitter(id);
                return;
            }
            
            // Emit particles based on emission rate
            emitter.emissionTimer += deltaTime;
            const emissionInterval = 1.0 / emitter.emissionRate;
            
            while (emitter.emissionTimer >= emissionInterval) {
                this.emitParticleFromEmitter(emitter);
                emitter.emissionTimer -= emissionInterval;
            }
        });
    }
    
    // Public API methods
    emit(config) {
        const emitterId = this.generateId();
        
        const emitter = {
            id: emitterId,
            position: config.position || { x: 0, y: 0, z: 0 },
            particleType: config.type || 'smoke',
            count: config.count || 10,
            emissionRate: config.emissionRate || 10,
            duration: config.duration || 1.0,
            spread: config.spread || 45,
            velocity: config.velocity || { min: 1, max: 5 },
            layer: config.layer || this.renderLayers.environment,
            age: 0,
            emissionTimer: 0
        };
        
        // Emit burst particles if count is specified
        if (emitter.count > 0) {
            for (let i = 0; i < emitter.count; i++) {
                this.emitParticleFromEmitter(emitter);
            }
        }
        
        // Set up continuous emission if rate is specified
        if (emitter.emissionRate > 0 && emitter.duration > 0) {
            this.activeEmitters.set(emitterId, emitter);
        }
        
        return emitterId;
    }
    
    emitPreset(presetName, position, scale = 1.0) {
        const preset = this.particleSystems.get(presetName);
        if (!preset) {
            console.warn(`Particle preset '${presetName}' not found`);
            return null;
        }
        
        const emitterIds = [];
        
        preset.particles.forEach(particleConfig => {
            const emitterId = this.emit({
                position: position,
                type: particleConfig.type,
                count: Math.floor(particleConfig.count * scale),
                spread: particleConfig.spread,
                velocity: particleConfig.speed,
                layer: preset.layer,
                duration: particleConfig.delay || 0
            });
            
            emitterIds.push(emitterId);
        });
        
        return emitterIds;
    }
    
    emitParticleFromEmitter(emitter) {
        const particle = this.getParticleFromPool();
        if (!particle) return null;
        
        const particleType = this.particleTypes[emitter.particleType];
        if (!particleType) return null;
        
        // Initialize particle
        particle.active = true;
        particle.type = emitter.particleType;
        particle.emitter = emitter.id;
        particle.layer = emitter.layer;
        particle.age = 0;
        particle.stuck = false;
        particle.bounces = 0;
        
        // Set position
        particle.position = { ...emitter.position };
        
        // Set random velocity within spread
        const speed = this.randomBetween(emitter.velocity.min, emitter.velocity.max);
        const angle = this.randomBetween(-emitter.spread / 2, emitter.spread / 2) * Math.PI / 180;
        const phi = Math.random() * Math.PI * 2;
        
        particle.velocity = {
            x: Math.cos(angle) * Math.cos(phi) * speed,
            y: Math.sin(angle) * speed,
            z: Math.cos(angle) * Math.sin(phi) * speed
        };
        
        // Set random properties based on particle type
        particle.size = this.randomBetween(particleType.size.min, particleType.size.max);
        particle.lifetime = this.randomBetween(particleType.lifetime.min, particleType.lifetime.max);
        particle.color = { ...particleType.color };
        particle.physics = particleType.physics || false;
        
        // Set random angular velocity
        particle.angularVelocity = {
            x: (Math.random() - 0.5) * 2,
            y: (Math.random() - 0.5) * 2,
            z: (Math.random() - 0.5) * 2
        };
        
        return particle;
    }
    
    getParticleFromPool() {
        for (let particle of this.particlePool) {
            if (!particle.active) {
                return particle;
            }
        }
        
        // Pool is full
        if (this.globalSettings.qualityLevel === 'low') {
            // In low quality, reuse oldest particle
            return this.particlePool[0];
        }
        
        return null;
    }
    
    killParticle(particle) {
        particle.active = false;
        
        this.events.dispatchEvent(new CustomEvent('particleKilled', {
            detail: { particle: particle }
        }));
    }
    
    removeEmitter(emitterId) {
        this.activeEmitters.delete(emitterId);
        
        this.events.dispatchEvent(new CustomEvent('emitterRemoved', {
            detail: { emitterId: emitterId }
        }));
    }
    
    // Environmental effects
    setDustParticles(enabled, intensity = 0.5) {
        if (enabled) {
            this.emit({
                type: 'dust',
                position: { x: 0, y: 5, z: 0 },
                emissionRate: intensity * 10,
                duration: -1, // Continuous
                spread: 360,
                velocity: { min: 0.5, max: 2.0 }
            });
        }
    }
    
    setWindConditions(windVector) {
        this.globalSettings.wind = windVector;
    }
    
    setGravity(gravity) {
        this.globalSettings.gravity = gravity;
    }
    
    setQualityLevel(level) {
        this.globalSettings.qualityLevel = level;
        
        // Adjust particle limits based on quality
        switch (level) {
            case 'low':
                this.maxParticles = 2000;
                this.globalSettings.maxEmitters = 20;
                break;
            case 'medium':
                this.maxParticles = 5000;
                this.globalSettings.maxEmitters = 35;
                break;
            case 'high':
                this.maxParticles = 10000;
                this.globalSettings.maxEmitters = 50;
                break;
            case 'ultra':
                this.maxParticles = 20000;
                this.globalSettings.maxEmitters = 100;
                break;
        }
    }
    
    clearAllParticles() {
        for (let particle of this.particlePool) {
            particle.active = false;
        }
        this.activeEmitters.clear();
        this.currentParticleCount = 0;
    }
    
    // Utility methods
    randomBetween(min, max) {
        return min + Math.random() * (max - min);
    }
    
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
    
    cleanupDeadParticles() {
        // Performance optimization - batch cleanup
        // This is handled in updateParticle, but we could do additional cleanup here
    }
    
    updatePerformanceMetrics(deltaTime) {
        // Update performance tracking
        this.performanceMetrics.particlesPerSecond = this.currentParticleCount / deltaTime;
        this.performanceMetrics.memoryUsage = this.currentParticleCount * 0.1; // Estimated KB per particle
    }
    
    bindPerformanceMonitoring() {
        // Monitor performance and auto-adjust quality if needed
        setInterval(() => {
            if (this.performanceMetrics.particlesPerSecond > 10000 && 
                this.globalSettings.qualityLevel === 'ultra') {
                this.setQualityLevel('high');
                console.log('Particle quality auto-reduced to maintain performance');
            }
        }, 5000);
    }
    
    // Event listeners
    addEventListener(event, callback) {
        this.events.addEventListener(event, callback);
    }
    
    removeEventListener(event, callback) {
        this.events.removeEventListener(event, callback);
    }
    
    // Debug methods
    getDebugInfo() {
        return {
            activeParticles: this.currentParticleCount,
            maxParticles: this.maxParticles,
            activeEmitters: this.activeEmitters.size,
            qualityLevel: this.globalSettings.qualityLevel,
            performanceMetrics: this.performanceMetrics
        };
    }
    
    getParticlesByType(type) {
        return this.particlePool.filter(p => p.active && p.type === type).length;
    }
    
    getParticlesByLayer(layer) {
        return this.particlePool.filter(p => p.active && p.layer === layer);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ParticleManager;
} else {
    window.ParticleManager = ParticleManager;
}
