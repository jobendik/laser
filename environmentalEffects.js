/**
 * EnvironmentalEffects.js
 * Environmental visual and audio effects system
 * Handles wind, dust, rain, snow, and ambient environmental effects
 */

class EnvironmentalEffects extends pc.ScriptType {
    static get scriptName() { return 'EnvironmentalEffects'; }

    initialize() {
        this.weatherSystem = this.app.root.findByName('WeatherSystem')?.script?.weatherSystem;
        this.audioManager = this.app.root.findByName('AudioManager')?.script?.audioManager;
        
        // Effect pools
        this.dustParticles = [];
        this.rainDrops = [];
        this.snowFlakes = [];
        this.windEffects = [];
        this.fogEffects = [];
        
        // Environment parameters
        this.windStrength = 0.0;
        this.windDirection = new pc.Vec3(1, 0, 0);
        this.ambientDustLevel = 0.3;
        this.fogDensity = 0.0;
        this.precipitationIntensity = 0.0;
        
        // Effect states
        this.activeEffects = new Map();
        this.environmentalSounds = new Map();
        
        // Initialize effect systems
        this.initializeParticleSystems();
        this.initializeEnvironmentalSounds();
        this.setupEventListeners();
        
        // Start ambient effects
        this.startAmbientEffects();
    }

    initializeParticleSystems() {
        this.createDustSystem();
        this.createRainSystem();
        this.createSnowSystem();
        this.createWindSystem();
        this.createFogSystem();
    }

    createDustSystem() {
        this.dustSystem = {
            particles: [],
            maxParticles: 100,
            spawnRate: 5.0,
            spawnTimer: 0.0,
            windAffected: true,
            
            create: () => {
                return {
                    position: new pc.Vec3(),
                    velocity: new pc.Vec3(),
                    size: 0.1 + Math.random() * 0.3,
                    opacity: 0.1 + Math.random() * 0.3,
                    lifetime: 5.0 + Math.random() * 10.0,
                    age: 0.0,
                    rotationSpeed: (Math.random() - 0.5) * 2.0
                };
            }
        };
    }

    createRainSystem() {
        this.rainSystem = {
            particles: [],
            maxParticles: 500,
            spawnRate: 50.0,
            spawnTimer: 0.0,
            windAffected: true,
            
            create: () => {
                return {
                    position: new pc.Vec3(),
                    velocity: new pc.Vec3(0, -20, 0),
                    size: 0.05,
                    opacity: 0.8,
                    lifetime: 3.0,
                    age: 0.0,
                    length: 1.0 + Math.random() * 2.0
                };
            }
        };
    }

    createSnowSystem() {
        this.snowSystem = {
            particles: [],
            maxParticles: 200,
            spawnRate: 20.0,
            spawnTimer: 0.0,
            windAffected: true,
            
            create: () => {
                return {
                    position: new pc.Vec3(),
                    velocity: new pc.Vec3(0, -2, 0),
                    size: 0.1 + Math.random() * 0.2,
                    opacity: 0.7 + Math.random() * 0.3,
                    lifetime: 10.0 + Math.random() * 5.0,
                    age: 0.0,
                    drift: new pc.Vec3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2)
                };
            }
        };
    }

    createWindSystem() {
        this.windSystem = {
            effects: [],
            maxEffects: 20,
            
            createLeafEffect: () => {
                return {
                    position: new pc.Vec3(),
                    velocity: new pc.Vec3(),
                    rotation: new pc.Vec3(),
                    rotationSpeed: new pc.Vec3(),
                    size: 0.2 + Math.random() * 0.3,
                    opacity: 0.6 + Math.random() * 0.4,
                    lifetime: 3.0 + Math.random() * 2.0,
                    age: 0.0,
                    type: 'leaf'
                };
            },
            
            createDebrisEffect: () => {
                return {
                    position: new pc.Vec3(),
                    velocity: new pc.Vec3(),
                    rotation: new pc.Vec3(),
                    rotationSpeed: new pc.Vec3(),
                    size: 0.1 + Math.random() * 0.2,
                    opacity: 0.4 + Math.random() * 0.3,
                    lifetime: 2.0 + Math.random() * 3.0,
                    age: 0.0,
                    type: 'debris'
                };
            }
        };
    }

    createFogSystem() {
        this.fogSystem = {
            density: 0.0,
            color: new pc.Color(0.8, 0.8, 0.9, 1.0),
            near: 10.0,
            far: 100.0,
            height: 50.0,
            
            patches: [],
            maxPatches: 10,
            
            createPatch: () => {
                return {
                    position: new pc.Vec3(),
                    size: 20.0 + Math.random() * 30.0,
                    density: 0.3 + Math.random() * 0.4,
                    drift: new pc.Vec3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2),
                    lifetime: 30.0 + Math.random() * 60.0,
                    age: 0.0
                };
            }
        };
    }

    initializeEnvironmentalSounds() {
        // Wind sounds
        this.environmentalSounds.set('wind_light', {
            sound: 'wind_light.wav',
            volume: 0.0,
            loop: true,
            instance: null
        });
        
        this.environmentalSounds.set('wind_strong', {
            sound: 'wind_strong.wav',
            volume: 0.0,
            loop: true,
            instance: null
        });
        
        // Rain sounds
        this.environmentalSounds.set('rain_light', {
            sound: 'rain_light.wav',
            volume: 0.0,
            loop: true,
            instance: null
        });
        
        this.environmentalSounds.set('rain_heavy', {
            sound: 'rain_heavy.wav',
            volume: 0.0,
            loop: true,
            instance: null
        });
        
        // Ambient nature sounds
        this.environmentalSounds.set('forest_ambient', {
            sound: 'forest_ambient.wav',
            volume: 0.3,
            loop: true,
            instance: null
        });
        
        this.environmentalSounds.set('desert_ambient', {
            sound: 'desert_ambient.wav',
            volume: 0.2,
            loop: true,
            instance: null
        });
        
        // Initialize sound instances
        this.environmentalSounds.forEach((soundData, key) => {
            if (this.audioManager) {
                soundData.instance = this.audioManager.createSound(soundData.sound, {
                    loop: soundData.loop,
                    volume: 0.0
                });
            }
        });
    }

    setupEventListeners() {
        // Weather system events
        this.app.on('weather:changed', (weatherData) => {
            this.updateWeatherEffects(weatherData);
        });
        
        // Wind events
        this.app.on('wind:changed', (windData) => {
            this.updateWindEffects(windData);
        });
        
        // Explosion events (create dust and debris)
        this.app.on('explosion:occurred', (explosionData) => {
            this.createExplosionEffects(explosionData);
        });
        
        // Vehicle events (dust trails)
        this.app.on('vehicle:moved', (vehicleData) => {
            this.createVehicleDust(vehicleData);
        });
    }

    startAmbientEffects() {
        // Start ambient dust
        this.startEffect('dust', {
            intensity: this.ambientDustLevel,
            continuous: true
        });
        
        // Start ambient sounds based on environment
        this.startAmbientSounds();
    }

    startAmbientSounds() {
        // Determine environment type (could be based on level or biome)
        const environmentType = this.getEnvironmentType();
        
        switch (environmentType) {
            case 'forest':
                this.playEnvironmentalSound('forest_ambient', 0.3);
                break;
            case 'desert':
                this.playEnvironmentalSound('desert_ambient', 0.2);
                break;
            case 'urban':
                // Urban ambient sounds would go here
                break;
        }
    }

    getEnvironmentType() {
        // This would typically check the current level or biome
        // For now, return a default
        return 'forest';
    }

    updateWeatherEffects(weatherData) {
        const { type, intensity } = weatherData;
        
        switch (type) {
            case 'rain':
                this.startRain(intensity);
                break;
            case 'snow':
                this.startSnow(intensity);
                break;
            case 'fog':
                this.setFogDensity(intensity);
                break;
            case 'clear':
                this.clearPrecipitation();
                break;
        }
    }

    updateWindEffects(windData) {
        const { strength, direction } = windData;
        
        this.windStrength = strength;
        this.windDirection.copy(direction);
        
        // Update wind sounds
        if (strength < 0.3) {
            this.playEnvironmentalSound('wind_light', strength * 2);
            this.stopEnvironmentalSound('wind_strong');
        } else {
            this.playEnvironmentalSound('wind_strong', (strength - 0.3) * 1.43);
            this.stopEnvironmentalSound('wind_light');
        }
        
        // Spawn wind effects
        if (strength > 0.4) {
            this.spawnWindEffects(strength);
        }
    }

    startRain(intensity) {
        this.precipitationIntensity = intensity;
        this.rainSystem.spawnRate = intensity * 100;
        
        // Play rain sounds
        if (intensity < 0.5) {
            this.playEnvironmentalSound('rain_light', intensity * 2);
            this.stopEnvironmentalSound('rain_heavy');
        } else {
            this.playEnvironmentalSound('rain_heavy', (intensity - 0.5) * 2);
            this.stopEnvironmentalSound('rain_light');
        }
        
        this.activeEffects.set('rain', true);
    }

    startSnow(intensity) {
        this.precipitationIntensity = intensity;
        this.snowSystem.spawnRate = intensity * 40;
        this.activeEffects.set('snow', true);
    }

    setFogDensity(density) {
        this.fogDensity = density;
        this.fogSystem.density = density;
        
        // Update scene fog
        if (this.app.scene.fog) {
            this.app.scene.fog = pc.FOG_LINEAR;
            this.app.scene.fogColor = this.fogSystem.color;
            this.app.scene.fogStart = this.fogSystem.near;
            this.app.scene.fogEnd = this.fogSystem.far * (1.0 - density);
        }
    }

    clearPrecipitation() {
        this.precipitationIntensity = 0.0;
        this.activeEffects.delete('rain');
        this.activeEffects.delete('snow');
        
        this.stopEnvironmentalSound('rain_light');
        this.stopEnvironmentalSound('rain_heavy');
    }

    spawnWindEffects(strength) {
        const camera = this.app.root.findByName('Camera');
        if (!camera) return;
        
        const cameraPos = camera.getPosition();
        
        // Spawn leaves and debris
        for (let i = 0; i < strength * 5; i++) {
            const effect = Math.random() > 0.7 ? 
                this.windSystem.createLeafEffect() : 
                this.windSystem.createDebrisEffect();
            
            // Position around camera
            effect.position.set(
                cameraPos.x + (Math.random() - 0.5) * 100,
                cameraPos.y + Math.random() * 20,
                cameraPos.z + (Math.random() - 0.5) * 100
            );
            
            // Wind-affected velocity
            effect.velocity.copy(this.windDirection).scale(strength * 10);
            effect.velocity.y += (Math.random() - 0.5) * 2;
            
            this.windSystem.effects.push(effect);
        }
        
        // Limit wind effects
        if (this.windSystem.effects.length > this.windSystem.maxEffects) {
            this.windSystem.effects.splice(0, this.windSystem.effects.length - this.windSystem.maxEffects);
        }
    }

    createExplosionEffects(explosionData) {
        const { position, force } = explosionData;
        
        // Create dust cloud
        for (let i = 0; i < 20; i++) {
            const dust = this.dustSystem.create();
            dust.position.copy(position);
            dust.position.add(new pc.Vec3(
                (Math.random() - 0.5) * 10,
                Math.random() * 5,
                (Math.random() - 0.5) * 10
            ));
            
            dust.velocity.set(
                (Math.random() - 0.5) * force,
                Math.random() * force * 0.5,
                (Math.random() - 0.5) * force
            );
            
            dust.size *= 1.5;
            dust.opacity *= 2.0;
            dust.lifetime = 3.0;
            
            this.dustSystem.particles.push(dust);
        }
        
        // Create debris
        for (let i = 0; i < 10; i++) {
            const debris = this.windSystem.createDebrisEffect();
            debris.position.copy(position);
            debris.velocity.set(
                (Math.random() - 0.5) * force * 2,
                Math.random() * force,
                (Math.random() - 0.5) * force * 2
            );
            
            this.windSystem.effects.push(debris);
        }
    }

    createVehicleDust(vehicleData) {
        const { position, velocity, groundType } = vehicleData;
        
        if (groundType === 'dirt' || groundType === 'sand') {
            const dustCount = Math.min(velocity.length() * 0.1, 5);
            
            for (let i = 0; i < dustCount; i++) {
                const dust = this.dustSystem.create();
                dust.position.copy(position);
                dust.position.add(new pc.Vec3(
                    (Math.random() - 0.5) * 3,
                    0.5,
                    (Math.random() - 0.5) * 3
                ));
                
                dust.velocity.set(
                    -velocity.x * 0.1 + (Math.random() - 0.5) * 2,
                    1 + Math.random() * 2,
                    -velocity.z * 0.1 + (Math.random() - 0.5) * 2
                );
                
                dust.lifetime = 2.0;
                this.dustSystem.particles.push(dust);
            }
        }
    }

    startEffect(effectType, options = {}) {
        switch (effectType) {
            case 'dust':
                this.activeEffects.set('dust', true);
                this.dustSystem.spawnRate = (options.intensity || 1.0) * 5.0;
                break;
            case 'fog':
                this.setFogDensity(options.intensity || 0.5);
                break;
        }
    }

    stopEffect(effectType) {
        this.activeEffects.delete(effectType);
    }

    playEnvironmentalSound(soundKey, volume) {
        const soundData = this.environmentalSounds.get(soundKey);
        if (soundData && soundData.instance) {
            soundData.instance.volume = volume;
            if (!soundData.instance.isPlaying) {
                soundData.instance.play();
            }
        }
    }

    stopEnvironmentalSound(soundKey) {
        const soundData = this.environmentalSounds.get(soundKey);
        if (soundData && soundData.instance && soundData.instance.isPlaying) {
            soundData.instance.stop();
        }
    }

    update(dt) {
        this.updateDustSystem(dt);
        this.updateRainSystem(dt);
        this.updateSnowSystem(dt);
        this.updateWindSystem(dt);
        this.updateFogSystem(dt);
        this.updateAmbientVariations(dt);
    }

    updateDustSystem(dt) {
        if (!this.activeEffects.has('dust')) return;
        
        // Spawn new particles
        this.dustSystem.spawnTimer += dt;
        if (this.dustSystem.spawnTimer >= 1.0 / this.dustSystem.spawnRate) {
            this.spawnDustParticle();
            this.dustSystem.spawnTimer = 0.0;
        }
        
        // Update existing particles
        for (let i = this.dustSystem.particles.length - 1; i >= 0; i--) {
            const particle = this.dustSystem.particles[i];
            
            particle.age += dt;
            if (particle.age >= particle.lifetime) {
                this.dustSystem.particles.splice(i, 1);
                continue;
            }
            
            // Apply wind
            const windForce = this.windDirection.clone().scale(this.windStrength * 2);
            particle.velocity.add(windForce.scale(dt));
            
            // Apply gravity
            particle.velocity.y -= 1.0 * dt;
            
            // Update position
            particle.position.add(particle.velocity.clone().scale(dt));
            
            // Fade out over time
            const ageRatio = particle.age / particle.lifetime;
            particle.opacity = (1.0 - ageRatio) * 0.3;
        }
    }

    spawnDustParticle() {
        if (this.dustSystem.particles.length >= this.dustSystem.maxParticles) {
            return;
        }
        
        const camera = this.app.root.findByName('Camera');
        if (!camera) return;
        
        const cameraPos = camera.getPosition();
        const dust = this.dustSystem.create();
        
        // Position around camera
        dust.position.set(
            cameraPos.x + (Math.random() - 0.5) * 50,
            cameraPos.y + Math.random() * 10,
            cameraPos.z + (Math.random() - 0.5) * 50
        );
        
        this.dustSystem.particles.push(dust);
    }

    updateRainSystem(dt) {
        if (!this.activeEffects.has('rain')) return;
        
        // Spawn new raindrops
        this.rainSystem.spawnTimer += dt;
        if (this.rainSystem.spawnTimer >= 1.0 / this.rainSystem.spawnRate) {
            this.spawnRaindrop();
            this.rainSystem.spawnTimer = 0.0;
        }
        
        // Update existing raindrops
        for (let i = this.rainSystem.particles.length - 1; i >= 0; i--) {
            const drop = this.rainSystem.particles[i];
            
            drop.age += dt;
            if (drop.age >= drop.lifetime) {
                this.rainSystem.particles.splice(i, 1);
                continue;
            }
            
            // Apply wind
            const windForce = this.windDirection.clone().scale(this.windStrength * 5);
            drop.velocity.add(windForce.scale(dt));
            
            // Update position
            drop.position.add(drop.velocity.clone().scale(dt));
            
            // Check ground collision
            if (drop.position.y <= 0) {
                this.rainSystem.particles.splice(i, 1);
                // Could spawn splash effect here
            }
        }
    }

    spawnRaindrop() {
        if (this.rainSystem.particles.length >= this.rainSystem.maxParticles) {
            return;
        }
        
        const camera = this.app.root.findByName('Camera');
        if (!camera) return;
        
        const cameraPos = camera.getPosition();
        const drop = this.rainSystem.create();
        
        // Position above camera
        drop.position.set(
            cameraPos.x + (Math.random() - 0.5) * 100,
            cameraPos.y + 50 + Math.random() * 20,
            cameraPos.z + (Math.random() - 0.5) * 100
        );
        
        this.rainSystem.particles.push(drop);
    }

    updateSnowSystem(dt) {
        if (!this.activeEffects.has('snow')) return;
        
        // Similar to rain but with different physics
        this.snowSystem.spawnTimer += dt;
        if (this.snowSystem.spawnTimer >= 1.0 / this.snowSystem.spawnRate) {
            this.spawnSnowflake();
            this.snowSystem.spawnTimer = 0.0;
        }
        
        // Update existing snowflakes
        for (let i = this.snowSystem.particles.length - 1; i >= 0; i--) {
            const flake = this.snowSystem.particles[i];
            
            flake.age += dt;
            if (flake.age >= flake.lifetime || flake.position.y <= 0) {
                this.snowSystem.particles.splice(i, 1);
                continue;
            }
            
            // Apply wind and drift
            const windForce = this.windDirection.clone().scale(this.windStrength * 3);
            flake.velocity.add(windForce.scale(dt));
            flake.velocity.add(flake.drift.clone().scale(dt * Math.sin(flake.age * 2)));
            
            // Update position
            flake.position.add(flake.velocity.clone().scale(dt));
        }
    }

    spawnSnowflake() {
        if (this.snowSystem.particles.length >= this.snowSystem.maxParticles) {
            return;
        }
        
        const camera = this.app.root.findByName('Camera');
        if (!camera) return;
        
        const cameraPos = camera.getPosition();
        const flake = this.snowSystem.create();
        
        flake.position.set(
            cameraPos.x + (Math.random() - 0.5) * 80,
            cameraPos.y + 40 + Math.random() * 10,
            cameraPos.z + (Math.random() - 0.5) * 80
        );
        
        this.snowSystem.particles.push(flake);
    }

    updateWindSystem(dt) {
        // Update wind effects (leaves, debris)
        for (let i = this.windSystem.effects.length - 1; i >= 0; i--) {
            const effect = this.windSystem.effects[i];
            
            effect.age += dt;
            if (effect.age >= effect.lifetime) {
                this.windSystem.effects.splice(i, 1);
                continue;
            }
            
            // Update physics
            effect.velocity.y -= 2.0 * dt; // gravity
            effect.position.add(effect.velocity.clone().scale(dt));
            effect.rotation.add(effect.rotationSpeed.clone().scale(dt));
            
            // Fade out
            const ageRatio = effect.age / effect.lifetime;
            effect.opacity = (1.0 - ageRatio) * 0.7;
        }
    }

    updateFogSystem(dt) {
        if (this.fogDensity <= 0) return;
        
        // Update fog patches for local fog effects
        for (let i = this.fogSystem.patches.length - 1; i >= 0; i--) {
            const patch = this.fogSystem.patches[i];
            
            patch.age += dt;
            if (patch.age >= patch.lifetime) {
                this.fogSystem.patches.splice(i, 1);
                continue;
            }
            
            // Drift fog patch
            patch.position.add(patch.drift.clone().scale(dt));
        }
    }

    updateAmbientVariations(dt) {
        // Add subtle variations to ambient effects
        // This could include random gusts of wind, dust devils, etc.
        
        if (Math.random() < 0.001) { // 0.1% chance per frame
            this.createRandomGust();
        }
    }

    createRandomGust() {
        const gustStrength = 0.3 + Math.random() * 0.7;
        const gustDirection = new pc.Vec3(
            Math.random() - 0.5,
            0,
            Math.random() - 0.5
        ).normalize();
        
        // Temporary wind effect
        const originalStrength = this.windStrength;
        const originalDirection = this.windDirection.clone();
        
        this.windStrength = gustStrength;
        this.windDirection.copy(gustDirection);
        
        // Revert after a short time
        setTimeout(() => {
            this.windStrength = originalStrength;
            this.windDirection.copy(originalDirection);
        }, 2000 + Math.random() * 3000);
    }

    // Public API
    setEnvironment(environmentType) {
        this.stopAllAmbientSounds();
        
        switch (environmentType) {
            case 'forest':
                this.playEnvironmentalSound('forest_ambient', 0.3);
                this.ambientDustLevel = 0.1;
                break;
            case 'desert':
                this.playEnvironmentalSound('desert_ambient', 0.2);
                this.ambientDustLevel = 0.5;
                break;
            case 'urban':
                this.ambientDustLevel = 0.2;
                break;
        }
    }

    stopAllAmbientSounds() {
        this.environmentalSounds.forEach((soundData, key) => {
            this.stopEnvironmentalSound(key);
        });
    }

    getParticleCount() {
        return this.dustSystem.particles.length + 
               this.rainSystem.particles.length + 
               this.snowSystem.particles.length + 
               this.windSystem.effects.length;
    }

    setEffectQuality(quality) {
        // Adjust max particles based on quality setting
        const multiplier = quality === 'low' ? 0.5 : quality === 'high' ? 1.5 : 1.0;
        
        this.dustSystem.maxParticles = Math.floor(100 * multiplier);
        this.rainSystem.maxParticles = Math.floor(500 * multiplier);
        this.snowSystem.maxParticles = Math.floor(200 * multiplier);
        this.windSystem.maxEffects = Math.floor(20 * multiplier);
    }
}

pc.registerScript(EnvironmentalEffects, 'EnvironmentalEffects');
