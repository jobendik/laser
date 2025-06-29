var EffectsManager = pc.createScript('effectsManager');

EffectsManager.attributes.add('effectTemplates', { type: 'json', array: true, schema: [
    { name: 'name', type: 'string' },
    { name: 'particleSystem', type: 'entity' },
    { name: 'duration', type: 'number', default: 1 },
    { name: 'poolSize', type: 'number', default: 10 }
]});

EffectsManager.attributes.add('maxActiveEffects', { type: 'number', default: 100 });
EffectsManager.attributes.add('cleanupInterval', { type: 'number', default: 5 });

EffectsManager.prototype.initialize = function() {
    // Effect pools for optimization
    this.effectPools = new Map();
    this.activeEffects = [];
    this.availableEffects = new Map();
    
    // Decal system
    this.decals = [];
    this.maxDecals = 200;
    this.decalCleanupTimer = 0;
    
    // Screen effects
    this.screenEffects = [];
    
    // Performance tracking
    this.lastCleanupTime = 0;
    
    // Initialize effect pools
    this.initializeEffectPools();
    
    // Bind effect events
    this.app.on('effect:muzzleFlash', this.createMuzzleFlash, this);
    this.app.on('effect:impact', this.createImpactEffect, this);
    this.app.on('effect:explosion', this.createExplosion, this);
    this.app.on('effect:tracer', this.createTracer, this);
    this.app.on('effect:shellEjection', this.createShellEjection, this);
    this.app.on('effect:blood', this.createBloodEffect, this);
    this.app.on('effect:smoke', this.createSmokeEffect, this);
    this.app.on('effect:fire', this.createFireEffect, this);
    this.app.on('effect:heal', this.createHealEffect, this);
    this.app.on('effect:shieldBreak', this.createShieldBreakEffect, this);
    this.app.on('effect:shieldRecharge', this.createShieldRechargeEffect, this);
    this.app.on('decal:create', this.createDecal, this);
    this.app.on('effect:screenFlash', this.createScreenFlash, this);
    this.app.on('effect:distortion', this.createDistortionEffect, this);
    
    console.log('EffectsManager initialized with', this.effectTemplates.length, 'effect templates');
};

EffectsManager.prototype.initializeEffectPools = function() {
    this.effectTemplates.forEach(template => {
        if (template.particleSystem) {
            const pool = [];
            
            // Pre-create effect instances
            for (let i = 0; i < template.poolSize; i++) {
                const effectInstance = this.createEffectInstance(template);
                if (effectInstance) {
                    effectInstance.enabled = false;
                    pool.push(effectInstance);
                }
            }
            
            this.effectPools.set(template.name, {
                template: template,
                pool: pool,
                activeCount: 0
            });
        }
    });
};

EffectsManager.prototype.createEffectInstance = function(template) {
    if (!template.particleSystem) return null;
    
    // Clone the template particle system
    const instance = template.particleSystem.clone();
    
    // Find appropriate parent container
    const effectsContainer = this.app.root.findByName('Effects_Container');
    if (effectsContainer) {
        effectsContainer.addChild(instance);
    } else {
        this.app.root.addChild(instance);
    }
    
    return instance;
};

EffectsManager.prototype.update = function(dt) {
    this.updateActiveEffects(dt);
    this.cleanupExpiredEffects(dt);
    this.updateDecals(dt);
    this.updateScreenEffects(dt);
    
    // Periodic cleanup
    if (Date.now() - this.lastCleanupTime > this.cleanupInterval * 1000) {
        this.performCleanup();
        this.lastCleanupTime = Date.now();
    }
};

EffectsManager.prototype.updateActiveEffects = function(dt) {
    for (let i = this.activeEffects.length - 1; i >= 0; i--) {
        const effect = this.activeEffects[i];
        effect.timeRemaining -= dt;
        
        // Update effect-specific behavior
        this.updateEffectBehavior(effect, dt);
        
        if (effect.timeRemaining <= 0) {
            this.returnEffectToPool(effect);
            this.activeEffects.splice(i, 1);
        }
    }
};

EffectsManager.prototype.updateEffectBehavior = function(effect, dt) {
    switch (effect.type) {
        case 'tracer':
            this.updateTracerEffect(effect, dt);
            break;
        case 'shellEjection':
            this.updateShellEjectionEffect(effect, dt);
            break;
        case 'muzzleFlash':
            this.updateMuzzleFlashEffect(effect, dt);
            break;
    }
};

EffectsManager.prototype.getEffectFromPool = function(effectName) {
    const poolData = this.effectPools.get(effectName);
    if (!poolData || poolData.pool.length === 0) {
        // Create new instance if pool is empty
        const newInstance = this.createEffectInstance(poolData.template);
        return newInstance;
    }
    
    const effect = poolData.pool.pop();
    poolData.activeCount++;
    return effect;
};

EffectsManager.prototype.returnEffectToPool = function(effect) {
    effect.enabled = false;
    
    // Reset effect properties
    if (effect.particlesystem) {
        effect.particlesystem.reset();
        effect.particlesystem.stop();
    }
    
    const poolData = this.effectPools.get(effect.effectType);
    if (poolData) {
        poolData.pool.push(effect);
        poolData.activeCount--;
    }
};

EffectsManager.prototype.createMuzzleFlash = function(data) {
    const effect = this.getEffectFromPool('muzzleFlash');
    if (!effect) return;
    
    // Position at weapon muzzle
    effect.setPosition(data.position || pc.Vec3.ZERO);
    effect.setRotation(data.rotation || pc.Quat.IDENTITY);
    
    // Scale based on weapon type
    let scale = 1.0;
    switch (data.weaponType) {
        case 'pistol':
            scale = 0.7;
            break;
        case 'rifle':
            scale = 1.0;
            break;
        case 'sniper':
            scale = 1.3;
            break;
        case 'shotgun':
            scale = 1.5;
            break;
    }
    effect.setLocalScale(scale, scale, scale);
    
    effect.enabled = true;
    if (effect.particlesystem) {
        effect.particlesystem.play();
    }
    
    // Add to active effects
    this.activeEffects.push({
        entity: effect,
        type: 'muzzleFlash',
        timeRemaining: 0.1,
        effectType: 'muzzleFlash'
    });
    
    // Create light flash
    this.createMuzzleLight(data.position, data.weaponType);
};

EffectsManager.prototype.createMuzzleLight = function(position, weaponType) {
    const lightEntity = new pc.Entity('MuzzleLight');
    lightEntity.addComponent('light', {
        type: pc.LIGHTTYPE_OMNI,
        color: new pc.Color(1, 0.8, 0.4),
        intensity: weaponType === 'sniper' ? 3 : 2,
        range: weaponType === 'shotgun' ? 8 : 5,
        castShadows: false
    });
    
    lightEntity.setPosition(position);
    this.app.root.addChild(lightEntity);
    
    // Fade out light
    setTimeout(() => {
        lightEntity.destroy();
    }, 50);
};

EffectsManager.prototype.createImpactEffect = function(data) {
    // Determine surface type
    const surfaceType = this.determineSurfaceType(data.entity);
    const effectName = 'impact_' + surfaceType;
    
    const effect = this.getEffectFromPool(effectName) || this.getEffectFromPool('impact_default');
    if (!effect) return;
    
    // Position at impact point
    effect.setPosition(data.position);
    
    // Orient based on surface normal
    if (data.normal) {
        const lookMatrix = new pc.Mat4().lookAt(pc.Vec3.ZERO, data.normal, pc.Vec3.UP);
        const rotation = new pc.Quat().setFromMat4(lookMatrix);
        effect.setRotation(rotation);
    }
    
    effect.enabled = true;
    if (effect.particlesystem) {
        effect.particlesystem.play();
    }
    
    this.activeEffects.push({
        entity: effect,
        type: 'impact',
        timeRemaining: 1.0,
        effectType: effectName
    });
    
    // Create impact sound
    this.app.fire('audio:playSound', {
        name: 'impact_' + surfaceType,
        position: data.position
    });
};

EffectsManager.prototype.determineSurfaceType = function(entity) {
    if (!entity || !entity.tags) return 'default';
    
    if (entity.tags.has('metal')) return 'metal';
    if (entity.tags.has('concrete')) return 'concrete';
    if (entity.tags.has('wood')) return 'wood';
    if (entity.tags.has('glass')) return 'glass';
    if (entity.tags.has('water')) return 'water';
    if (entity.tags.has('dirt')) return 'dirt';
    
    return 'default';
};

EffectsManager.prototype.createExplosion = function(data) {
    const effect = this.getEffectFromPool('explosion');
    if (!effect) return;
    
    effect.setPosition(data.position);
    
    // Scale based on explosion size
    const scale = data.scale || 1.0;
    effect.setLocalScale(scale, scale, scale);
    
    effect.enabled = true;
    if (effect.particlesystem) {
        effect.particlesystem.play();
    }
    
    this.activeEffects.push({
        entity: effect,
        type: 'explosion',
        timeRemaining: 3.0,
        effectType: 'explosion'
    });
    
    // Create explosion light
    this.createExplosionLight(data.position, scale);
    
    // Screen shake for nearby players
    const players = this.app.root.findByTag('player');
    players.forEach(player => {
        const distance = player.getPosition().distance(data.position);
        if (distance < 20) {
            const intensity = Math.max(0.1, 1 - distance / 20) * 0.3 * scale;
            this.app.fire('camera:shake', intensity, 1.0);
        }
    });
};

EffectsManager.prototype.createExplosionLight = function(position, scale) {
    const lightEntity = new pc.Entity('ExplosionLight');
    lightEntity.addComponent('light', {
        type: pc.LIGHTTYPE_OMNI,
        color: new pc.Color(1, 0.5, 0.2),
        intensity: 5 * scale,
        range: 15 * scale,
        castShadows: true
    });
    
    lightEntity.setPosition(position);
    this.app.root.addChild(lightEntity);
    
    // Fade out light over time
    let intensity = 5 * scale;
    const fadeInterval = setInterval(() => {
        intensity *= 0.9;
        lightEntity.light.intensity = intensity;
        
        if (intensity < 0.1) {
            clearInterval(fadeInterval);
            lightEntity.destroy();
        }
    }, 50);
};

EffectsManager.prototype.createTracer = function(data) {
    const tracerEntity = new pc.Entity('Tracer');
    
    // Create line renderer for tracer
    tracerEntity.addComponent('render', {
        type: 'asset'
    });
    
    // Position at start point
    tracerEntity.setPosition(data.start);
    
    // Calculate direction and distance
    const direction = new pc.Vec3().sub2(data.end, data.start);
    const distance = direction.length();
    direction.normalize();
    
    // Orient tracer
    const lookMatrix = new pc.Mat4().lookAt(pc.Vec3.ZERO, direction, pc.Vec3.UP);
    const rotation = new pc.Quat().setFromMat4(lookMatrix);
    tracerEntity.setRotation(rotation);
    
    this.app.root.addChild(tracerEntity);
    
    this.activeEffects.push({
        entity: tracerEntity,
        type: 'tracer',
        timeRemaining: 0.3,
        startPos: data.start.clone(),
        endPos: data.end.clone(),
        speed: distance / 0.3,
        effectType: 'tracer'
    });
};

EffectsManager.prototype.updateTracerEffect = function(effect, dt) {
    const progress = 1 - (effect.timeRemaining / 0.3);
    const currentPos = new pc.Vec3().lerp(effect.startPos, effect.endPos, progress);
    effect.entity.setPosition(currentPos);
    
    // Fade out over time
    if (effect.entity.render) {
        const opacity = effect.timeRemaining / 0.3;
        // Would set material opacity here
    }
};

EffectsManager.prototype.createShellEjection = function(data) {
    const shellEntity = new pc.Entity('Shell');
    
    shellEntity.addComponent('model', {
        type: 'cylinder'
    });
    
    shellEntity.addComponent('rigidbody', {
        type: 'dynamic',
        mass: 0.01
    });
    
    shellEntity.addComponent('collision', {
        type: 'cylinder',
        height: 0.02,
        radius: 0.005
    });
    
    // Position and apply force
    shellEntity.setPosition(data.position);
    shellEntity.setLocalScale(0.005, 0.02, 0.005);
    
    this.app.root.addChild(shellEntity);
    
    // Apply random ejection force
    const velocity = data.velocity || new pc.Vec3(2, 1, 0);
    velocity.x += (Math.random() - 0.5) * 2;
    velocity.y += Math.random() * 2;
    velocity.z += (Math.random() - 0.5) * 2;
    
    shellEntity.rigidbody.applyImpulse(velocity.x, velocity.y, velocity.z);
    
    // Add spin
    shellEntity.rigidbody.applyTorqueImpulse(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10
    );
    
    this.activeEffects.push({
        entity: shellEntity,
        type: 'shellEjection',
        timeRemaining: 10.0, // Shells stay for a while
        effectType: 'shellEjection'
    });
};

EffectsManager.prototype.createBloodEffect = function(data) {
    const effect = this.getEffectFromPool('blood');
    if (!effect) return;
    
    effect.setPosition(data.position);
    
    if (data.direction) {
        const lookMatrix = new pc.Mat4().lookAt(pc.Vec3.ZERO, data.direction, pc.Vec3.UP);
        const rotation = new pc.Quat().setFromMat4(lookMatrix);
        effect.setRotation(rotation);
    }
    
    effect.enabled = true;
    if (effect.particlesystem) {
        effect.particlesystem.play();
    }
    
    this.activeEffects.push({
        entity: effect,
        type: 'blood',
        timeRemaining: 2.0,
        effectType: 'blood'
    });
};

EffectsManager.prototype.createHealEffect = function(data) {
    const effect = this.getEffectFromPool('heal');
    if (!effect) return;
    
    // Follow the entity being healed
    effect.setPosition(data.entity.getPosition());
    effect.enabled = true;
    
    if (effect.particlesystem) {
        effect.particlesystem.play();
    }
    
    this.activeEffects.push({
        entity: effect,
        type: 'heal',
        timeRemaining: 1.5,
        followEntity: data.entity,
        effectType: 'heal'
    });
};

EffectsManager.prototype.createShieldBreakEffect = function(position) {
    const effect = this.getEffectFromPool('shieldBreak');
    if (!effect) return;
    
    effect.setPosition(position);
    effect.enabled = true;
    
    if (effect.particlesystem) {
        effect.particlesystem.play();
    }
    
    this.activeEffects.push({
        entity: effect,
        type: 'shieldBreak',
        timeRemaining: 1.0,
        effectType: 'shieldBreak'
    });
    
    // Screen flash effect
    this.app.fire('ui:flashEffect', {
        intensity: 0.3,
        duration: 200,
        color: new pc.Color(0, 0.5, 1)
    });
};

EffectsManager.prototype.createShieldRechargeEffect = function(position) {
    const effect = this.getEffectFromPool('shieldRecharge');
    if (!effect) return;
    
    effect.setPosition(position);
    effect.enabled = true;
    
    if (effect.particlesystem) {
        effect.particlesystem.play();
    }
    
    this.activeEffects.push({
        entity: effect,
        type: 'shieldRecharge',
        timeRemaining: 2.0,
        effectType: 'shieldRecharge'
    });
};

EffectsManager.prototype.createDecal = function(data) {
    // Limit total decals
    if (this.decals.length >= this.maxDecals) {
        const oldestDecal = this.decals.shift();
        if (oldestDecal.entity) {
            oldestDecal.entity.destroy();
        }
    }
    
    const decalEntity = new pc.Entity('Decal_' + data.type);
    
    decalEntity.addComponent('element', {
        type: pc.ELEMENTTYPE_IMAGE,
        anchor: [0.5, 0.5, 0.5, 0.5],
        pivot: [0.5, 0.5],
        width: this.getDecalSize(data.type),
        height: this.getDecalSize(data.type)
    });
    
    // Position on surface
    decalEntity.setPosition(data.position);
    
    if (data.normal) {
        const lookMatrix = new pc.Mat4().lookAt(pc.Vec3.ZERO, data.normal, pc.Vec3.UP);
        const rotation = new pc.Quat().setFromMat4(lookMatrix);
        decalEntity.setRotation(rotation);
    }
    
    // Slight offset from surface to prevent z-fighting
    const offset = data.normal ? data.normal.clone().scale(0.01) : new pc.Vec3(0, 0.01, 0);
    decalEntity.setPosition(decalEntity.getPosition().add(offset));
    
    this.app.root.addChild(decalEntity);
    
    this.decals.push({
        entity: decalEntity,
        type: data.type,
        createdTime: Date.now(),
        fadeTime: this.getDecalFadeTime(data.type)
    });
};

EffectsManager.prototype.getDecalSize = function(type) {
    switch (type) {
        case 'bulletHole':
            return 0.1;
        case 'bloodSplatter':
            return 0.3;
        case 'explosionMark':
            return 1.0;
        default:
            return 0.2;
    }
};

EffectsManager.prototype.getDecalFadeTime = function(type) {
    switch (type) {
        case 'bulletHole':
            return 30000; // 30 seconds
        case 'bloodSplatter':
            return 60000; // 60 seconds
        case 'explosionMark':
            return 120000; // 2 minutes
        default:
            return 30000;
    }
};

EffectsManager.prototype.updateDecals = function(dt) {
    const currentTime = Date.now();
    
    for (let i = this.decals.length - 1; i >= 0; i--) {
        const decal = this.decals[i];
        const age = currentTime - decal.createdTime;
        
        if (age > decal.fadeTime) {
            // Remove expired decal
            if (decal.entity) {
                decal.entity.destroy();
            }
            this.decals.splice(i, 1);
        } else if (age > decal.fadeTime * 0.8) {
            // Start fading
            const fadeProgress = (age - decal.fadeTime * 0.8) / (decal.fadeTime * 0.2);
            const opacity = 1 - fadeProgress;
            
            if (decal.entity && decal.entity.element) {
                decal.entity.element.opacity = opacity;
            }
        }
    }
};

EffectsManager.prototype.cleanupExpiredEffects = function(dt) {
    // Additional cleanup for effects that might have been missed
    this.activeEffects = this.activeEffects.filter(effect => {
        if (effect.timeRemaining <= 0 || !effect.entity || !effect.entity.enabled) {
            if (effect.entity) {
                this.returnEffectToPool(effect);
            }
            return false;
        }
        return true;
    });
};

EffectsManager.prototype.performCleanup = function() {
    // Cleanup orphaned effects
    const effectsContainer = this.app.root.findByName('Effects_Container');
    if (effectsContainer) {
        effectsContainer.children.forEach(child => {
            if (!child.enabled && !this.isInPool(child)) {
                child.destroy();
            }
        });
    }
    
    // Cleanup old decals beyond limit
    while (this.decals.length > this.maxDecals * 0.8) {
        const oldDecal = this.decals.shift();
        if (oldDecal.entity) {
            oldDecal.entity.destroy();
        }
    }
};

EffectsManager.prototype.isInPool = function(entity) {
    for (let [name, poolData] of this.effectPools) {
        if (poolData.pool.includes(entity)) {
            return true;
        }
    }
    return false;
};

EffectsManager.prototype.updateScreenEffects = function(dt) {
    for (let i = this.screenEffects.length - 1; i >= 0; i--) {
        const effect = this.screenEffects[i];
        effect.timeRemaining -= dt;
        
        if (effect.timeRemaining <= 0) {
            this.screenEffects.splice(i, 1);
        }
    }
};

EffectsManager.prototype.createScreenFlash = function(data) {
    this.screenEffects.push({
        type: 'flash',
        intensity: data.intensity || 0.5,
        color: data.color || new pc.Color(1, 1, 1),
        timeRemaining: (data.duration || 500) / 1000
    });
};

EffectsManager.prototype.getActiveEffectCount = function() {
    return this.activeEffects.length;
};

EffectsManager.prototype.clearAllEffects = function() {
    // Return all active effects to pools
    this.activeEffects.forEach(effect => {
        this.returnEffectToPool(effect);
    });
    this.activeEffects = [];
    
    // Clear decals
    this.decals.forEach(decal => {
        if (decal.entity) {
            decal.entity.destroy();
        }
    });
    this.decals = [];
    
    // Clear screen effects
    this.screenEffects = [];
};