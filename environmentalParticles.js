/**
 * EnvironmentalParticles.js
 * Manages environmental particle effects like dust, rain, snow, and atmospheric effects
 */

class EnvironmentalParticles extends pc.ScriptType {
    static get scriptName() { return 'EnvironmentalParticles'; }

    initialize() {
        this.weatherSystem = this.app.root.findByName('Game_Manager').script.weatherSystem;
        this.dayNightCycle = this.app.root.findByName('Game_Manager').script.dayNightCycle;
        this.playerCamera = this.app.root.findByName('Player').findByName('Head').camera;
        
        // Particle pools
        this.dustPool = [];
        this.rainPool = [];
        this.snowPool = [];
        this.fogPool = [];
        this.emberPool = [];
        this.leafPool = [];
        
        // Settings
        this.maxDustParticles = 50;
        this.maxRainParticles = 200;
        this.maxSnowParticles = 150;
        this.maxFogParticles = 30;
        this.maxEmberParticles = 40;
        this.maxLeafParticles = 25;
        
        // Environmental zones
        this.zones = [];
        this.activeZone = null;
        
        // Wind settings
        this.windDirection = new pc.Vec3(1, 0, 0);
        this.windStrength = 2.0;
        this.windVariation = 0.5;
        
        this.initializeParticlePools();
        this.setupEnvironmentalZones();
        this.setupEventListeners();
    }

    initializeParticlePools() {
        // Create dust particles
        for (let i = 0; i < this.maxDustParticles; i++) {
            this.dustPool.push(this.createDustParticle());
        }
        
        // Create rain particles
        for (let i = 0; i < this.maxRainParticles; i++) {
            this.rainPool.push(this.createRainParticle());
        }
        
        // Create snow particles
        for (let i = 0; i < this.maxSnowParticles; i++) {
            this.snowPool.push(this.createSnowParticle());
        }
        
        // Create fog particles
        for (let i = 0; i < this.maxFogParticles; i++) {
            this.fogPool.push(this.createFogParticle());
        }
        
        // Create ember particles
        for (let i = 0; i < this.maxEmberParticles; i++) {
            this.emberPool.push(this.createEmberParticle());
        }
        
        // Create leaf particles
        for (let i = 0; i < this.maxLeafParticles; i++) {
            this.leafPool.push(this.createLeafParticle());
        }
    }

    createDustParticle() {
        const entity = new pc.Entity('DustParticle');
        const particleSystem = entity.addComponent('particlesystem', {
            numParticles: 1,
            lifetime: 8.0,
            rate: 0.5,
            emitterShape: pc.EMITTERSHAPE_BOX,
            emitterExtents: new pc.Vec3(0.1, 0.1, 0.1),
            startVelocity: 0.2,
            startVelocity2: 0.8,
            gravity: new pc.Vec3(0, -0.5, 0),
            billboard: true,
            startSize: 0.03,
            startSize2: 0.08,
            endSize: 0.01,
            endSize2: 0.03,
            colorStart: new pc.Color(0.8, 0.7, 0.5, 0.3),
            colorEnd: new pc.Color(0.6, 0.5, 0.3, 0),
            blendType: pc.BLEND_NORMAL
        });
        
        entity.enabled = false;
        this.app.root.addChild(entity);
        return entity;
    }

    createRainParticle() {
        const entity = new pc.Entity('RainParticle');
        const particleSystem = entity.addComponent('particlesystem', {
            numParticles: 10,
            lifetime: 2.0,
            rate: 5,
            emitterShape: pc.EMITTERSHAPE_BOX,
            emitterExtents: new pc.Vec3(20, 1, 20),
            startVelocity: 15,
            startVelocity2: 25,
            gravity: new pc.Vec3(0, -20, 0),
            billboard: false,
            alignToMotion: true,
            startSize: 0.02,
            startSize2: 0.03,
            endSize: 0.01,
            endSize2: 0.02,
            colorStart: new pc.Color(0.7, 0.8, 1.0, 0.6),
            colorEnd: new pc.Color(0.5, 0.6, 0.8, 0.3),
            blendType: pc.BLEND_NORMAL
        });
        
        entity.enabled = false;
        this.app.root.addChild(entity);
        return entity;
    }

    createSnowParticle() {
        const entity = new pc.Entity('SnowParticle');
        const particleSystem = entity.addComponent('particlesystem', {
            numParticles: 8,
            lifetime: 6.0,
            rate: 2,
            emitterShape: pc.EMITTERSHAPE_BOX,
            emitterExtents: new pc.Vec3(15, 1, 15),
            startVelocity: 0.5,
            startVelocity2: 2.0,
            gravity: new pc.Vec3(0, -1.5, 0),
            billboard: true,
            startSize: 0.05,
            startSize2: 0.12,
            endSize: 0.03,
            endSize2: 0.08,
            colorStart: new pc.Color(1.0, 1.0, 1.0, 0.8),
            colorEnd: new pc.Color(0.9, 0.9, 1.0, 0),
            blendType: pc.BLEND_NORMAL
        });
        
        entity.enabled = false;
        this.app.root.addChild(entity);
        return entity;
    }

    createFogParticle() {
        const entity = new pc.Entity('FogParticle');
        const particleSystem = entity.addComponent('particlesystem', {
            numParticles: 5,
            lifetime: 12.0,
            rate: 0.5,
            emitterShape: pc.EMITTERSHAPE_BOX,
            emitterExtents: new pc.Vec3(2, 1, 2),
            startVelocity: 0.1,
            startVelocity2: 0.5,
            billboard: true,
            startSize: 2.0,
            startSize2: 4.0,
            endSize: 3.0,
            endSize2: 6.0,
            colorStart: new pc.Color(0.9, 0.9, 0.9, 0.1),
            colorEnd: new pc.Color(0.8, 0.8, 0.8, 0),
            blendType: pc.BLEND_NORMAL
        });
        
        entity.enabled = false;
        this.app.root.addChild(entity);
        return entity;
    }

    createEmberParticle() {
        const entity = new pc.Entity('EmberParticle');
        const particleSystem = entity.addComponent('particlesystem', {
            numParticles: 3,
            lifetime: 4.0,
            rate: 1,
            emitterShape: pc.EMITTERSHAPE_SPHERE,
            emitterRadius: 0.5,
            startVelocity: 1.0,
            startVelocity2: 3.0,
            gravity: new pc.Vec3(0, 2.0, 0),
            billboard: true,
            startSize: 0.02,
            startSize2: 0.05,
            endSize: 0.005,
            endSize2: 0.01,
            colorStart: new pc.Color(1.0, 0.6, 0.2, 1.0),
            colorMid: new pc.Color(1.0, 0.3, 0.1, 0.8),
            colorEnd: new pc.Color(0.3, 0.1, 0.0, 0),
            blendType: pc.BLEND_ADDITIVE
        });
        
        entity.enabled = false;
        this.app.root.addChild(entity);
        return entity;
    }

    createLeafParticle() {
        const entity = new pc.Entity('LeafParticle');
        const particleSystem = entity.addComponent('particlesystem', {
            numParticles: 2,
            lifetime: 8.0,
            rate: 0.3,
            emitterShape: pc.EMITTERSHAPE_BOX,
            emitterExtents: new pc.Vec3(1, 5, 1),
            startVelocity: 0.5,
            startVelocity2: 2.0,
            gravity: new pc.Vec3(0, -1.0, 0),
            orientation: pc.PARTICLEORIENTATION_WORLD,
            startSize: 0.08,
            startSize2: 0.15,
            colorStart: new pc.Color(0.2, 0.8, 0.1, 1.0),
            colorMid: new pc.Color(0.8, 0.6, 0.1, 0.8),
            colorEnd: new pc.Color(0.6, 0.3, 0.1, 0.3),
            mesh: this.createLeafMesh()
        });
        
        entity.enabled = false;
        this.app.root.addChild(entity);
        return entity;
    }

    setupEnvironmentalZones() {
        // Define different environmental zones
        this.zones = [
            {
                name: 'desert',
                bounds: { min: new pc.Vec3(-50, 0, -50), max: new pc.Vec3(50, 100, 50) },
                effects: ['dust', 'heat_shimmer'],
                dustIntensity: 0.8,
                windStrength: 1.5
            },
            {
                name: 'forest',
                bounds: { min: new pc.Vec3(50, 0, -50), max: new pc.Vec3(150, 100, 50) },
                effects: ['leaves', 'fog'],
                leafIntensity: 0.6,
                fogIntensity: 0.3
            },
            {
                name: 'urban',
                bounds: { min: new pc.Vec3(-50, 0, 50), max: new pc.Vec3(50, 100, 150) },
                effects: ['dust', 'smog'],
                dustIntensity: 0.4,
                smogIntensity: 0.2
            },
            {
                name: 'industrial',
                bounds: { min: new pc.Vec3(50, 0, 50), max: new pc.Vec3(150, 100, 150) },
                effects: ['embers', 'smoke'],
                emberIntensity: 0.7,
                smokeIntensity: 0.5
            }
        ];
    }

    setupEventListeners() {
        this.app.on('weather:changed', this.onWeatherChanged, this);
        this.app.on('wind:changed', this.onWindChanged, this);
        this.app.on('time:changed', this.onTimeChanged, this);
        this.app.on('zone:entered', this.onZoneEntered, this);
        this.app.on('zone:exited', this.onZoneExited, this);
    }

    onWeatherChanged(data) {
        const { weatherType, intensity } = data;
        
        switch (weatherType) {
            case 'rain':
                this.activateRainEffects(intensity);
                break;
            case 'snow':
                this.activateSnowEffects(intensity);
                break;
            case 'fog':
                this.activateFogEffects(intensity);
                break;
            case 'clear':
                this.deactivateWeatherEffects();
                break;
        }
    }

    onWindChanged(data) {
        this.windDirection = data.direction;
        this.windStrength = data.strength;
        this.windVariation = data.variation || 0.5;
        
        // Update all active particle systems with new wind
        this.updateWindEffects();
    }

    onTimeChanged(data) {
        const { timeOfDay } = data;
        
        // Adjust particle visibility and intensity based on time
        this.adjustParticlesForTime(timeOfDay);
    }

    onZoneEntered(data) {
        const zone = this.zones.find(z => z.name === data.zoneName);
        if (zone) {
            this.activeZone = zone;
            this.activateZoneEffects(zone);
        }
    }

    onZoneExited(data) {
        if (this.activeZone && this.activeZone.name === data.zoneName) {
            this.deactivateZoneEffects(this.activeZone);
            this.activeZone = null;
        }
    }

    activateRainEffects(intensity) {
        const activeCount = Math.floor(this.maxRainParticles * intensity);
        
        for (let i = 0; i < activeCount; i++) {
            const rain = this.rainPool[i];
            if (rain && !rain.enabled) {
                this.positionParticleAroundPlayer(rain, 30);
                rain.enabled = true;
                rain.particlesystem.reset();
                rain.particlesystem.play();
            }
        }
    }

    activateSnowEffects(intensity) {
        const activeCount = Math.floor(this.maxSnowParticles * intensity);
        
        for (let i = 0; i < activeCount; i++) {
            const snow = this.snowPool[i];
            if (snow && !snow.enabled) {
                this.positionParticleAroundPlayer(snow, 25);
                snow.enabled = true;
                snow.particlesystem.reset();
                snow.particlesystem.play();
            }
        }
    }

    activateFogEffects(intensity) {
        const activeCount = Math.floor(this.maxFogParticles * intensity);
        
        for (let i = 0; i < activeCount; i++) {
            const fog = this.fogPool[i];
            if (fog && !fog.enabled) {
                this.positionParticleAroundPlayer(fog, 20);
                fog.enabled = true;
                fog.particlesystem.reset();
                fog.particlesystem.play();
            }
        }
    }

    activateZoneEffects(zone) {
        zone.effects.forEach(effect => {
            switch (effect) {
                case 'dust':
                    this.activateDustEffects(zone.dustIntensity || 0.5);
                    break;
                case 'leaves':
                    this.activateLeafEffects(zone.leafIntensity || 0.5);
                    break;
                case 'embers':
                    this.activateEmberEffects(zone.emberIntensity || 0.5);
                    break;
                case 'fog':
                    this.activateFogEffects(zone.fogIntensity || 0.3);
                    break;
            }
        });
    }

    activateDustEffects(intensity) {
        const activeCount = Math.floor(this.maxDustParticles * intensity);
        
        for (let i = 0; i < activeCount; i++) {
            const dust = this.dustPool[i];
            if (dust && !dust.enabled) {
                this.positionParticleAroundPlayer(dust, 15);
                dust.enabled = true;
                dust.particlesystem.reset();
                dust.particlesystem.play();
            }
        }
    }

    activateLeafEffects(intensity) {
        const activeCount = Math.floor(this.maxLeafParticles * intensity);
        
        for (let i = 0; i < activeCount; i++) {
            const leaf = this.leafPool[i];
            if (leaf && !leaf.enabled) {
                this.positionParticleAroundPlayer(leaf, 12);
                leaf.enabled = true;
                leaf.particlesystem.reset();
                leaf.particlesystem.play();
            }
        }
    }

    activateEmberEffects(intensity) {
        const activeCount = Math.floor(this.maxEmberParticles * intensity);
        
        for (let i = 0; i < activeCount; i++) {
            const ember = this.emberPool[i];
            if (ember && !ember.enabled) {
                this.positionParticleAroundPlayer(ember, 8);
                ember.enabled = true;
                ember.particlesystem.reset();
                ember.particlesystem.play();
            }
        }
    }

    deactivateWeatherEffects() {
        // Stop all weather-related effects
        [...this.rainPool, ...this.snowPool, ...this.fogPool].forEach(particle => {
            if (particle.enabled) {
                particle.enabled = false;
            }
        });
    }

    deactivateZoneEffects(zone) {
        // Stop zone-specific effects
        [...this.dustPool, ...this.leafPool, ...this.emberPool].forEach(particle => {
            if (particle.enabled) {
                particle.enabled = false;
            }
        });
    }

    positionParticleAroundPlayer(particle, radius) {
        if (!this.playerCamera) return;
        
        const playerPos = this.playerCamera.entity.getPosition();
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * radius;
        
        const x = playerPos.x + Math.cos(angle) * distance;
        const z = playerPos.z + Math.sin(angle) * distance;
        const y = playerPos.y + Math.random() * 10 - 5;
        
        particle.setPosition(x, y, z);
    }

    updateWindEffects() {
        // Apply wind to all active particles
        const allParticles = [
            ...this.dustPool,
            ...this.rainPool,
            ...this.snowPool,
            ...this.leafPool,
            ...this.emberPool
        ];
        
        allParticles.forEach(particle => {
            if (particle.enabled && particle.particlesystem) {
                const windForce = this.windDirection.clone().scale(this.windStrength);
                
                // Add variation
                windForce.add(new pc.Vec3(
                    (Math.random() - 0.5) * this.windVariation,
                    0,
                    (Math.random() - 0.5) * this.windVariation
                ));
                
                // Apply wind as external force
                particle.particlesystem.gravity = particle.particlesystem.gravity.clone().add(windForce);
            }
        });
    }

    adjustParticlesForTime(timeOfDay) {
        const isDaytime = timeOfDay > 6 && timeOfDay < 18;
        const isEvening = timeOfDay >= 18 && timeOfDay <= 20;
        const isNight = timeOfDay > 20 || timeOfDay < 6;
        
        // Adjust dust visibility (more visible in evening light)
        this.dustPool.forEach(dust => {
            if (dust.enabled) {
                const alpha = isEvening ? 0.6 : isDaytime ? 0.3 : 0.2;
                dust.particlesystem.colorStart.a = alpha;
            }
        });
        
        // Adjust ember brightness (more visible at night)
        this.emberPool.forEach(ember => {
            if (ember.enabled) {
                const brightness = isNight ? 1.5 : isDaytime ? 0.7 : 1.0;
                ember.particlesystem.colorStart.scale(brightness);
            }
        });
    }

    checkPlayerZone() {
        if (!this.playerCamera) return;
        
        const playerPos = this.playerCamera.entity.getPosition();
        const currentZone = this.zones.find(zone => 
            playerPos.x >= zone.bounds.min.x && playerPos.x <= zone.bounds.max.x &&
            playerPos.y >= zone.bounds.min.y && playerPos.y <= zone.bounds.max.y &&
            playerPos.z >= zone.bounds.min.z && playerPos.z <= zone.bounds.max.z
        );
        
        if (currentZone !== this.activeZone) {
            if (this.activeZone) {
                this.app.fire('zone:exited', { zoneName: this.activeZone.name });
            }
            
            if (currentZone) {
                this.app.fire('zone:entered', { zoneName: currentZone.name });
            }
        }
    }

    createLeafMesh() {
        // Create a simple leaf-shaped mesh
        return this.app.assets.find('leaf_mesh') || pc.createPlane(this.app.graphicsDevice, {
            halfExtents: new pc.Vec2(0.05, 0.08)
        });
    }

    update(dt) {
        // Update wind variation
        this.updateWindVariation(dt);
        
        // Check for zone changes
        this.checkPlayerZone();
        
        // Update particle positions relative to player
        this.updateParticlePositions(dt);
    }

    updateWindVariation(dt) {
        // Create natural wind variation
        const time = Date.now() * 0.001;
        const variation = Math.sin(time * 0.5) * this.windVariation;
        
        this.windDirection.x += variation * dt;
        this.windDirection.normalize();
    }

    updateParticlePositions(dt) {
        if (!this.playerCamera) return;
        
        const playerPos = this.playerCamera.entity.getPosition();
        const allPools = [this.dustPool, this.rainPool, this.snowPool, this.fogPool, this.emberPool, this.leafPool];
        
        allPools.forEach(pool => {
            pool.forEach(particle => {
                if (particle.enabled) {
                    const distance = particle.getPosition().distance(playerPos);
                    
                    // Reposition particles that are too far away
                    if (distance > 50) {
                        this.positionParticleAroundPlayer(particle, 30);
                        particle.particlesystem.reset();
                    }
                }
            });
        });
    }

    destroy() {
        // Clean up event listeners
        this.app.off('weather:changed', this.onWeatherChanged, this);
        this.app.off('wind:changed', this.onWindChanged, this);
        this.app.off('time:changed', this.onTimeChanged, this);
        this.app.off('zone:entered', this.onZoneEntered, this);
        this.app.off('zone:exited', this.onZoneExited, this);
        
        // Clean up particle pools
        const allPools = [this.dustPool, this.rainPool, this.snowPool, this.fogPool, this.emberPool, this.leafPool];
        allPools.forEach(pool => {
            pool.forEach(particle => particle.destroy());
        });
    }
}

pc.registerScript(EnvironmentalParticles, 'EnvironmentalParticles');
