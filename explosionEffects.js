/**
 * ExplosionEffects.js
 * Manages explosive effects including grenades, rockets, and environmental explosions
 */

class ExplosionEffects extends pc.ScriptType {
    static get scriptName() { return 'ExplosionEffects'; }

    initialize() {
        this.particleManager = this.app.root.findByName('Game_Manager').script.particleManager;
        this.audioManager = this.app.root.findByName('Game_Manager').script.audioManager;
        
        // Explosion pools
        this.fireballPool = [];
        this.smokePool = [];
        this.debrisPool = [];
        this.shockwavePool = [];
        this.sparkPool = [];
        
        // Explosion presets
        this.explosionTypes = {
            grenade: {
                radius: 8,
                damage: 100,
                fireballScale: 1.0,
                smokeAmount: 15,
                debrisCount: 20,
                shockwaveStrength: 1.0,
                sound: 'explosion_grenade'
            },
            rocket: {
                radius: 12,
                damage: 150,
                fireballScale: 1.5,
                smokeAmount: 25,
                debrisCount: 30,
                shockwaveStrength: 1.5,
                sound: 'explosion_rocket'
            },
            barrel: {
                radius: 10,
                damage: 120,
                fireballScale: 1.2,
                smokeAmount: 20,
                debrisCount: 25,
                shockwaveStrength: 1.2,
                sound: 'explosion_barrel'
            },
            vehicle: {
                radius: 15,
                damage: 200,
                fireballScale: 2.0,
                smokeAmount: 35,
                debrisCount: 40,
                shockwaveStrength: 2.0,
                sound: 'explosion_vehicle'
            },
            small: {
                radius: 4,
                damage: 50,
                fireballScale: 0.5,
                smokeAmount: 8,
                debrisCount: 10,
                shockwaveStrength: 0.5,
                sound: 'explosion_small'
            }
        };
        
        // Timing settings
        this.fireballDuration = 0.8;
        this.smokeDuration = 4.0;
        this.debrisDuration = 3.0;
        this.shockwaveDuration = 0.3;
        
        this.initializeExplosionPools();
        this.setupEventListeners();
    }

    initializeExplosionPools() {
        // Create fireball particles
        for (let i = 0; i < 10; i++) {
            const fireball = this.createFireballParticle();
            this.fireballPool.push(fireball);
        }
        
        // Create smoke particles
        for (let i = 0; i < 15; i++) {
            const smoke = this.createSmokeParticle();
            this.smokePool.push(smoke);
        }
        
        // Create debris particles
        for (let i = 0; i < 20; i++) {
            const debris = this.createDebrisParticle();
            this.debrisPool.push(debris);
        }
        
        // Create shockwave effects
        for (let i = 0; i < 8; i++) {
            const shockwave = this.createShockwaveEffect();
            this.shockwavePool.push(shockwave);
        }
        
        // Create spark particles
        for (let i = 0; i < 12; i++) {
            const spark = this.createSparkParticle();
            this.sparkPool.push(spark);
        }
    }

    createFireballParticle() {
        const entity = new pc.Entity('Fireball');
        const particleSystem = entity.addComponent('particlesystem', {
            numParticles: 20,
            lifetime: this.fireballDuration,
            rate: 50,
            startAngle: 0,
            startAngle2: 360,
            emitterShape: pc.EMITTERSHAPE_SPHERE,
            emitterRadius: 0.5,
            startVelocity: 2,
            startVelocity2: 8,
            billboard: true,
            startSize: 0.5,
            startSize2: 1.5,
            endSize: 0.1,
            endSize2: 0.3,
            colorStart: new pc.Color(1, 1, 0.8, 1),
            colorMid: new pc.Color(1, 0.5, 0.1, 0.8),
            colorEnd: new pc.Color(0.2, 0.1, 0.1, 0),
            blendType: pc.BLEND_ADDITIVE,
            colorMap: this.createFireballTexture()
        });
        
        entity.enabled = false;
        this.app.root.addChild(entity);
        return entity;
    }

    createSmokeParticle() {
        const entity = new pc.Entity('ExplosionSmoke');
        const particleSystem = entity.addComponent('particlesystem', {
            numParticles: 25,
            lifetime: this.smokeDuration,
            rate: 30,
            startAngle: 0,
            startAngle2: 360,
            emitterShape: pc.EMITTERSHAPE_SPHERE,
            emitterRadius: 1.0,
            startVelocity: 1,
            startVelocity2: 4,
            gravity: new pc.Vec3(0, 1, 0),
            billboard: true,
            startSize: 0.3,
            startSize2: 0.8,
            endSize: 2.0,
            endSize2: 4.0,
            colorStart: new pc.Color(0.2, 0.2, 0.2, 0.9),
            colorMid: new pc.Color(0.4, 0.4, 0.4, 0.6),
            colorEnd: new pc.Color(0.1, 0.1, 0.1, 0),
            blendType: pc.BLEND_NORMAL
        });
        
        entity.enabled = false;
        this.app.root.addChild(entity);
        return entity;
    }

    createDebrisParticle() {
        const entity = new pc.Entity('Debris');
        const particleSystem = entity.addComponent('particlesystem', {
            numParticles: 30,
            lifetime: this.debrisDuration,
            rate: 100,
            startAngle: 0,
            startAngle2: 360,
            emitterShape: pc.EMITTERSHAPE_SPHERE,
            emitterRadius: 0.3,
            startVelocity: 5,
            startVelocity2: 15,
            gravity: new pc.Vec3(0, -9.8, 0),
            orientation: pc.PARTICLEORIENTATION_WORLD,
            startSize: 0.05,
            startSize2: 0.15,
            endSize: 0.02,
            endSize2: 0.08,
            colorStart: new pc.Color(0.6, 0.4, 0.2, 1),
            colorEnd: new pc.Color(0.3, 0.2, 0.1, 1),
            mesh: this.createDebrisMesh()
        });
        
        entity.enabled = false;
        this.app.root.addChild(entity);
        return entity;
    }

    createShockwaveEffect() {
        const entity = new pc.Entity('Shockwave');
        
        // Create expanding ring mesh
        const mesh = entity.addComponent('render', {
            type: 'plane',
            material: this.createShockwaveMaterial()
        });
        
        entity.enabled = false;
        this.app.root.addChild(entity);
        return entity;
    }

    createSparkParticle() {
        const entity = new pc.Entity('ExplosionSpark');
        const particleSystem = entity.addComponent('particlesystem', {
            numParticles: 15,
            lifetime: 1.0,
            rate: 50,
            startAngle: 0,
            startAngle2: 360,
            emitterShape: pc.EMITTERSHAPE_SPHERE,
            emitterRadius: 0.2,
            startVelocity: 8,
            startVelocity2: 20,
            gravity: new pc.Vec3(0, -5, 0),
            billboard: true,
            startSize: 0.02,
            startSize2: 0.05,
            endSize: 0.005,
            endSize2: 0.01,
            colorStart: new pc.Color(1, 1, 0.8, 1),
            colorMid: new pc.Color(1, 0.6, 0.2, 0.8),
            colorEnd: new pc.Color(1, 0.2, 0, 0),
            blendType: pc.BLEND_ADDITIVE
        });
        
        entity.enabled = false;
        this.app.root.addChild(entity);
        return entity;
    }

    setupEventListeners() {
        this.app.on('explosion:create', this.createExplosion, this);
        this.app.on('grenade:explode', this.onGrenadeExplode, this);
        this.app.on('rocket:explode', this.onRocketExplode, this);
        this.app.on('barrel:explode', this.onBarrelExplode, this);
        this.app.on('vehicle:explode', this.onVehicleExplode, this);
    }

    createExplosion(data) {
        const { position, type = 'grenade', scale = 1.0, customSettings = {} } = data;
        
        // Get explosion settings
        const settings = { ...this.explosionTypes[type], ...customSettings };
        settings.fireballScale *= scale;
        settings.smokeAmount = Math.floor(settings.smokeAmount * scale);
        settings.debrisCount = Math.floor(settings.debrisCount * scale);
        
        // Play explosion sound
        if (this.audioManager && settings.sound) {
            this.audioManager.playSound3D(settings.sound, position, {
                volume: 0.8,
                maxDistance: settings.radius * 2
            });
        }
        
        // Create visual effects
        this.playFireball(position, settings);
        this.playExplosionSmoke(position, settings);
        this.playDebris(position, settings);
        this.playShockwave(position, settings);
        this.playSparks(position, settings);
        
        // Apply damage and physics forces
        this.applyExplosionForces(position, settings);
        
        // Screen shake for nearby players
        this.triggerScreenShake(position, settings);
        
        // Create decals
        this.createExplosionDecal(position, settings);
    }

    playFireball(position, settings) {
        const fireball = this.getAvailableParticle(this.fireballPool);
        if (!fireball) return;
        
        fireball.setPosition(position);
        fireball.setLocalScale(
            settings.fireballScale,
            settings.fireballScale,
            settings.fireballScale
        );
        
        const particleSystem = fireball.particlesystem;
        particleSystem.numParticles = Math.floor(20 * settings.fireballScale);
        particleSystem.startVelocity2 = 8 * settings.fireballScale;
        
        fireball.enabled = true;
        particleSystem.reset();
        particleSystem.play();
        
        setTimeout(() => {
            fireball.enabled = false;
        }, this.fireballDuration * 1000);
    }

    playExplosionSmoke(position, settings) {
        const smoke = this.getAvailableParticle(this.smokePool);
        if (!smoke) return;
        
        smoke.setPosition(position);
        smoke.setLocalScale(
            settings.fireballScale,
            settings.fireballScale,
            settings.fireballScale
        );
        
        const particleSystem = smoke.particlesystem;
        particleSystem.numParticles = settings.smokeAmount;
        particleSystem.emitterRadius = 1.0 * settings.fireballScale;
        
        smoke.enabled = true;
        particleSystem.reset();
        particleSystem.play();
        
        setTimeout(() => {
            smoke.enabled = false;
        }, this.smokeDuration * 1000);
    }

    playDebris(position, settings) {
        const debris = this.getAvailableParticle(this.debrisPool);
        if (!debris) return;
        
        debris.setPosition(position);
        
        const particleSystem = debris.particlesystem;
        particleSystem.numParticles = settings.debrisCount;
        particleSystem.startVelocity2 = 15 * settings.fireballScale;
        
        debris.enabled = true;
        particleSystem.reset();
        particleSystem.play();
        
        setTimeout(() => {
            debris.enabled = false;
        }, this.debrisDuration * 1000);
    }

    playShockwave(position, settings) {
        const shockwave = this.getAvailableParticle(this.shockwavePool);
        if (!shockwave) return;
        
        shockwave.setPosition(position);
        shockwave.setLocalScale(0.1, 0.1, 0.1);
        
        // Animate the shockwave expansion
        shockwave.enabled = true;
        
        const startScale = 0.1;
        const endScale = settings.radius * 0.5;
        const duration = this.shockwaveDuration;
        
        this.animateShockwave(shockwave, startScale, endScale, duration);
    }

    playSparks(position, settings) {
        const spark = this.getAvailableParticle(this.sparkPool);
        if (!spark) return;
        
        spark.setPosition(position);
        
        const particleSystem = spark.particlesystem;
        particleSystem.numParticles = Math.floor(15 * settings.fireballScale);
        particleSystem.startVelocity2 = 20 * settings.fireballScale;
        
        spark.enabled = true;
        particleSystem.reset();
        particleSystem.play();
        
        setTimeout(() => {
            spark.enabled = false;
        }, 1000);
    }

    animateShockwave(shockwave, startScale, endScale, duration) {
        const startTime = Date.now();
        
        const animate = () => {
            const elapsed = (Date.now() - startTime) / 1000;
            const progress = Math.min(elapsed / duration, 1);
            
            if (progress >= 1) {
                shockwave.enabled = false;
                return;
            }
            
            // Ease out animation
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            const currentScale = pc.math.lerp(startScale, endScale, easeProgress);
            
            shockwave.setLocalScale(currentScale, currentScale, currentScale);
            
            // Fade out alpha
            const alpha = 1 - progress;
            const material = shockwave.render.material;
            if (material) {
                material.opacity = alpha;
                material.update();
            }
            
            requestAnimationFrame(animate);
        };
        
        animate();
    }

    applyExplosionForces(position, settings) {
        // Find nearby entities and apply physics forces
        const nearbyEntities = this.findEntitiesInRadius(position, settings.radius);
        
        nearbyEntities.forEach(entity => {
            const distance = position.distance(entity.getPosition());
            const force = this.calculateExplosionForce(distance, settings);
            
            if (entity.rigidbody) {
                const direction = entity.getPosition().clone().sub(position).normalize();
                entity.rigidbody.applyImpulse(direction.scale(force));
            }
            
            // Apply damage if entity has health
            if (entity.script && entity.script.healthSystem) {
                const damage = this.calculateExplosionDamage(distance, settings);
                entity.script.healthSystem.takeDamage(damage, 'explosion');
            }
        });
    }

    calculateExplosionForce(distance, settings) {
        const maxForce = settings.shockwaveStrength * 1000;
        const falloff = Math.max(0, 1 - (distance / settings.radius));
        return maxForce * falloff;
    }

    calculateExplosionDamage(distance, settings) {
        const falloff = Math.max(0, 1 - (distance / settings.radius));
        return settings.damage * falloff;
    }

    findEntitiesInRadius(position, radius) {
        // Simple implementation - in a real game, you'd use a spatial partitioning system
        const nearbyEntities = [];
        
        this.app.root.findComponents('rigidbody').forEach(component => {
            const entity = component.entity;
            const distance = position.distance(entity.getPosition());
            
            if (distance <= radius) {
                nearbyEntities.push(entity);
            }
        });
        
        return nearbyEntities;
    }

    triggerScreenShake(position, settings) {
        // Trigger screen shake for nearby players
        this.app.fire('camera:shake', {
            position: position,
            intensity: settings.shockwaveStrength,
            radius: settings.radius * 2,
            duration: 0.5
        });
    }

    createExplosionDecal(position, settings) {
        // Create a scorch mark decal on the ground
        this.app.fire('decal:create', {
            type: 'scorch',
            position: position,
            size: settings.radius * 0.5,
            rotation: Math.random() * 360
        });
    }

    onGrenadeExplode(data) {
        this.createExplosion({
            position: data.position,
            type: 'grenade',
            scale: data.scale || 1.0
        });
    }

    onRocketExplode(data) {
        this.createExplosion({
            position: data.position,
            type: 'rocket',
            scale: data.scale || 1.0
        });
    }

    onBarrelExplode(data) {
        this.createExplosion({
            position: data.position,
            type: 'barrel',
            scale: data.scale || 1.0
        });
    }

    onVehicleExplode(data) {
        this.createExplosion({
            position: data.position,
            type: 'vehicle',
            scale: data.scale || 1.0
        });
    }

    getAvailableParticle(pool) {
        return pool.find(particle => !particle.enabled) || null;
    }

    createFireballTexture() {
        // Create a fireball texture programmatically
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        
        const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.3, 'rgba(255, 150, 50, 0.8)');
        gradient.addColorStop(0.7, 'rgba(255, 50, 0, 0.4)');
        gradient.addColorStop(1, 'rgba(50, 0, 0, 0)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 128, 128);
        
        const texture = new pc.Texture(this.app.graphicsDevice);
        texture.setSource(canvas);
        return texture;
    }

    createShockwaveMaterial() {
        const material = new pc.StandardMaterial();
        material.emissive = new pc.Color(0.8, 0.8, 1.0);
        material.opacity = 1.0;
        material.blendType = pc.BLEND_ADDITIVE;
        material.cull = pc.CULLFACE_NONE;
        material.update();
        return material;
    }

    createDebrisMesh() {
        // Return a simple box mesh for debris
        return pc.createBox(this.app.graphicsDevice);
    }

    destroy() {
        // Clean up event listeners
        this.app.off('explosion:create', this.createExplosion, this);
        this.app.off('grenade:explode', this.onGrenadeExplode, this);
        this.app.off('rocket:explode', this.onRocketExplode, this);
        this.app.off('barrel:explode', this.onBarrelExplode, this);
        this.app.off('vehicle:explode', this.onVehicleExplode, this);
        
        // Clean up particle pools
        [...this.fireballPool, ...this.smokePool, ...this.debrisPool, 
         ...this.shockwavePool, ...this.sparkPool]
            .forEach(particle => particle.destroy());
    }
}

pc.registerScript(ExplosionEffects, 'ExplosionEffects');
