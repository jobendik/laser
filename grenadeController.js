var GrenadeController = pc.createScript('grenadeController');

GrenadeController.attributes.add('grenadeData', { type: 'json', schema: [
    { name: 'name', type: 'string', default: 'Frag Grenade' },
    { name: 'type', type: 'string', default: 'frag' }, // frag, smoke, flash, incendiary, emp
    { name: 'damage', type: 'number', default: 150 },
    { name: 'radius', type: 'number', default: 8 },
    { name: 'fuseTime', type: 'number', default: 4 },
    { name: 'throwForce', type: 'number', default: 15 },
    { name: 'bounces', type: 'number', default: 3 },
    { name: 'effectDuration', type: 'number', default: 0 } // For smoke/flash grenades
]});

GrenadeController.attributes.add('cookingEnabled', { type: 'boolean', default: true });
GrenadeController.attributes.add('maxCookTime', { type: 'number', default: 3.5 });
GrenadeController.attributes.add('indicatorEnabled', { type: 'boolean', default: true });
GrenadeController.attributes.add('trajectoryPreview', { type: 'boolean', default: true });

GrenadeController.prototype.initialize = function() {
    // Grenade state
    this.isArmed = false;
    this.isThrown = false;
    this.isExploded = false;
    this.isCooking = false;
    
    // Timing
    this.fuseTimer = 0;
    this.cookingTime = 0;
    this.armTime = 0.5; // Time before grenade becomes active
    
    // Physics
    this.velocity = new pc.Vec3();
    this.bounceCount = 0;
    this.hasLanded = false;
    this.lastBounceTime = 0;
    
    // Throwing mechanics
    this.thrower = null;
    this.throwDirection = new pc.Vec3();
    this.throwForceMultiplier = 1.0;
    
    // Visual effects
    this.indicatorEntity = null;
    this.trailEffect = null;
    this.warningIndicator = null;
    
    // Audio
    this.tickSound = null;
    this.bounceSound = null;
    
    // Setup components
    this.setupGrenadeModel();
    this.setupPhysics();
    this.setupEffects();
    this.setupAudio();
    
    // Bind events
    this.entity.collision.on('contact', this.onContact, this);
    this.app.on('grenade:throw', this.onThrowGrenade, this);
    this.app.on('grenade:cook', this.startCooking, this);
    this.app.on('grenade:release', this.releaseGrenade, this);
    
    console.log('GrenadeController initialized:', this.grenadeData.name);
};

GrenadeController.prototype.setupGrenadeModel = function() {
    // Set model based on grenade type
    if (!this.entity.model) {
        this.entity.addComponent('model', {
            type: 'sphere' // Fallback model
        });
        
        // Try to find specific grenade model
        const modelAsset = this.app.assets.find(this.grenadeData.type + '_grenade');
        if (modelAsset) {
            this.entity.model.asset = modelAsset;
        }
    }
    
    // Scale appropriately
    this.entity.setLocalScale(0.1, 0.1, 0.1);
    
    // Set material based on type
    this.setGrenadeAppearance();
};

GrenadeController.prototype.setGrenadeAppearance = function() {
    if (!this.entity.model) return;
    
    const color = this.getGrenadeColor();
    
    // Create or modify material
    if (this.entity.model.material) {
        this.entity.model.material.diffuse = color;
        this.entity.model.material.update();
    }
};

GrenadeController.prototype.getGrenadeColor = function() {
    switch (this.grenadeData.type) {
        case 'frag':
            return new pc.Color(0.3, 0.3, 0.3); // Dark gray
        case 'smoke':
            return new pc.Color(0.8, 0.8, 0.8); // Light gray
        case 'flash':
            return new pc.Color(1, 1, 0.8); // Yellow-white
        case 'incendiary':
            return new pc.Color(1, 0.3, 0.1); // Red-orange
        case 'emp':
            return new pc.Color(0.2, 0.5, 1); // Blue
        default:
            return new pc.Color(0.5, 0.5, 0.5); // Gray
    }
};

GrenadeController.prototype.setupPhysics = function() {
    // Add rigidbody for physics simulation
    if (!this.entity.rigidbody) {
        this.entity.addComponent('rigidbody', {
            type: 'dynamic',
            mass: 0.4, // 400g grenade
            restitution: 0.3, // Bounce factor
            friction: 0.6
        });
    }
    
    // Add collision for bouncing
    if (!this.entity.collision) {
        this.entity.addComponent('collision', {
            type: 'sphere',
            radius: 0.05
        });
    }
    
    // Initially disable physics until thrown
    this.entity.rigidbody.enabled = false;
};

GrenadeController.prototype.setupEffects = function() {
    // Create ticking indicator
    if (this.indicatorEnabled) {
        this.createTickingIndicator();
    }
    
    // Create trail effect
    this.createTrailEffect();
    
    // Create warning indicator (shows explosion radius)
    this.createWarningIndicator();
};

GrenadeController.prototype.createTickingIndicator = function() {
    this.indicatorEntity = new pc.Entity('TickingIndicator');
    this.indicatorEntity.addComponent('light', {
        type: pc.LIGHTTYPE_OMNI,
        color: new pc.Color(1, 0, 0),
        intensity: 0,
        range: 2,
        castShadows: false
    });
    
    this.entity.addChild(this.indicatorEntity);
};

GrenadeController.prototype.createTrailEffect = function() {
    // Create particle trail for thrown grenade
    this.trailEffect = new pc.Entity('GrenadeTrail');
    this.trailEffect.addComponent('particlesystem', {
        numParticles: 20,
        lifetime: 0.5,
        rate: 30,
        startVelocity: new pc.Vec3(0, -1, 0),
        startVelocity2: new pc.Vec3(0, -2, 0),
        colorMap: this.getGrenadeColor(),
        enabled: false
    });
    
    this.entity.addChild(this.trailEffect);
};

GrenadeController.prototype.createWarningIndicator = function() {
    // Create visual indicator of explosion radius (shown to enemies)
    this.warningIndicator = new pc.Entity('ExplosionWarning');
    this.warningIndicator.addComponent('model', {
        type: 'cylinder'
    });
    
    // Scale to explosion radius
    const scale = this.grenadeData.radius;
    this.warningIndicator.setLocalScale(scale, 0.01, scale);
    this.warningIndicator.setLocalPosition(0, -0.05, 0);
    
    // Make it semi-transparent red
    if (this.warningIndicator.model.material) {
        this.warningIndicator.model.material.diffuse = new pc.Color(1, 0, 0);
        this.warningIndicator.model.material.opacity = 0.3;
        this.warningIndicator.model.material.blendType = pc.BLEND_NORMAL;
        this.warningIndicator.model.material.update();
    }
    
    this.warningIndicator.enabled = false;
    this.entity.addChild(this.warningIndicator);
};

GrenadeController.prototype.setupAudio = function() {
    if (!this.entity.sound) {
        this.entity.addComponent('sound');
    }
    
    // Ticking sound
    this.entity.sound.addSlot('tick', {
        asset: this.app.assets.find('grenade_tick'),
        volume: 0.3,
        loop: false,
        autoPlay: false,
        is3d: true,
        minDistance: 2,
        maxDistance: 15
    });
    
    // Bounce sound
    this.entity.sound.addSlot('bounce', {
        asset: this.app.assets.find('grenade_bounce'),
        volume: 0.5,
        loop: false,
        autoPlay: false,
        is3d: true,
        minDistance: 3,
        maxDistance: 20
    });
    
    // Pin pull sound
    this.entity.sound.addSlot('pin', {
        asset: this.app.assets.find('grenade_pin'),
        volume: 0.6,
        loop: false,
        autoPlay: false,
        is3d: true,
        minDistance: 1,
        maxDistance: 8
    });
};

GrenadeController.prototype.update = function(dt) {
    if (this.isExploded) return;
    
    if (this.isCooking) {
        this.updateCooking(dt);
    }
    
    if (this.isThrown) {
        this.updateFuse(dt);
        this.updateEffects(dt);
        this.updateBouncing(dt);
    }
};

GrenadeController.prototype.updateCooking = function(dt) {
    this.cookingTime += dt;
    
    // Play pin sound when cooking starts
    if (this.cookingTime < dt && this.entity.sound) {
        this.entity.sound.play('pin');
    }
    
    // Auto-explode if cooked too long
    if (this.cookingTime >= this.maxCookTime) {
        this.explode();
        return;
    }
    
    // Ticking sound gets faster as time runs out
    const tickInterval = Math.max(0.2, 1.0 - (this.cookingTime / this.maxCookTime) * 0.8);
    if (Math.floor(this.cookingTime / tickInterval) > Math.floor((this.cookingTime - dt) / tickInterval)) {
        if (this.entity.sound) {
            this.entity.sound.play('tick');
        }
        
        // Flash indicator
        if (this.indicatorEntity && this.indicatorEntity.light) {
            this.indicatorEntity.light.intensity = 2;
            setTimeout(() => {
                if (this.indicatorEntity && this.indicatorEntity.light) {
                    this.indicatorEntity.light.intensity = 0;
                }
            }, 100);
        }
    }
};

GrenadeController.prototype.updateFuse = function(dt) {
    this.fuseTimer += dt;
    
    // Check if grenade is armed (safety delay)
    if (!this.isArmed && this.fuseTimer >= this.armTime) {
        this.isArmed = true;
        this.showWarningIndicator();
    }
    
    // Calculate remaining time (accounting for cooking time)
    const totalTime = this.grenadeData.fuseTime - this.cookingTime;
    
    if (this.fuseTimer >= totalTime) {
        this.explode();
        return;
    }
    
    // Ticking sound and effects
    const remainingTime = totalTime - this.fuseTimer;
    this.updateTickingEffects(remainingTime);
};

GrenadeController.prototype.updateTickingEffects = function(remainingTime) {
    // Faster ticking as explosion approaches
    const tickInterval = Math.max(0.1, remainingTime * 0.3);
    
    if (Math.floor((this.grenadeData.fuseTime - this.fuseTimer) / tickInterval) > 
        Math.floor((this.grenadeData.fuseTime - this.fuseTimer + 0.016) / tickInterval)) {
        
        if (this.entity.sound) {
            this.entity.sound.play('tick');
        }
        
        // Visual indicator
        if (this.indicatorEntity && this.indicatorEntity.light) {
            this.indicatorEntity.light.intensity = remainingTime < 1 ? 3 : 1;
            setTimeout(() => {
                if (this.indicatorEntity && this.indicatorEntity.light) {
                    this.indicatorEntity.light.intensity = 0;
                }
            }, 50);
        }
    }
};

GrenadeController.prototype.updateEffects = function(dt) {
    // Update trail effect
    if (this.trailEffect && this.entity.rigidbody) {
        const velocity = this.entity.rigidbody.linearVelocity;
        const speed = velocity.length();
        
        // Enable trail when moving fast
        this.trailEffect.enabled = speed > 2;
    }
};

GrenadeController.prototype.updateBouncing = function(dt) {
    if (!this.entity.rigidbody) return;
    
    const velocity = this.entity.rigidbody.linearVelocity;
    const speed = velocity.length();
    
    // Check if grenade has basically stopped moving
    if (speed < 0.5 && !this.hasLanded) {
        this.hasLanded = true;
        this.onLanded();
    }
};

GrenadeController.prototype.onContact = function(result) {
    if (!this.isThrown || this.isExploded) return;
    
    const currentTime = Date.now();
    
    // Prevent multiple bounces in short time
    if (currentTime - this.lastBounceTime < 100) return;
    
    this.lastBounceTime = currentTime;
    this.bounceCount++;
    
    // Play bounce sound
    if (this.entity.sound) {
        this.entity.sound.play('bounce');
    }
    
    // Reduce bouncing over time
    if (this.bounceCount >= this.grenadeData.bounces) {
        if (this.entity.rigidbody) {
            this.entity.rigidbody.restitution = 0.1;
        }
    }
    
    // Special handling for different grenade types
    this.handleContactByType(result);
};

GrenadeController.prototype.handleContactByType = function(result) {
    switch (this.grenadeData.type) {
        case 'impact':
            // Impact grenades explode on contact
            if (this.isArmed) {
                this.explode();
            }
            break;
            
        case 'sticky':
            // Sticky grenades attach to surfaces
            if (this.isArmed && this.entity.rigidbody) {
                this.entity.rigidbody.type = 'kinematic';
                this.entity.rigidbody.linearVelocity = pc.Vec3.ZERO;
                this.entity.rigidbody.angularVelocity = pc.Vec3.ZERO;
            }
            break;
    }
};

GrenadeController.prototype.onLanded = function() {
    // Show warning indicator when grenade lands
    this.showWarningIndicator();
    
    // Fire landed event
    this.app.fire('grenade:landed', {
        grenade: this.entity,
        position: this.entity.getPosition(),
        type: this.grenadeData.type
    });
};

GrenadeController.prototype.showWarningIndicator = function() {
    if (this.warningIndicator && this.isArmed) {
        this.warningIndicator.enabled = true;
        
        // Pulse effect
        let pulseTime = 0;
        const pulseInterval = setInterval(() => {
            if (this.isExploded || !this.warningIndicator) {
                clearInterval(pulseInterval);
                return;
            }
            
            pulseTime += 0.1;
            const opacity = 0.2 + Math.sin(pulseTime * 10) * 0.1;
            
            if (this.warningIndicator.model && this.warningIndicator.model.material) {
                this.warningIndicator.model.material.opacity = opacity;
                this.warningIndicator.model.material.update();
            }
        }, 100);
    }
};

GrenadeController.prototype.startCooking = function(data) {
    if (data.grenade !== this.entity) return;
    
    this.isCooking = true;
    this.cookingTime = 0;
    this.thrower = data.thrower;
    
    console.log('Grenade cooking started');
};

GrenadeController.prototype.releaseGrenade = function(data) {
    if (data.grenade !== this.entity || !this.isCooking) return;
    
    this.throwGrenade(data.direction, data.force);
};

GrenadeController.prototype.onThrowGrenade = function(data) {
    if (data.grenade !== this.entity) return;
    
    this.thrower = data.thrower;
    this.throwGrenade(data.direction, data.force);
};

GrenadeController.prototype.throwGrenade = function(direction, force) {
    this.isThrown = true;
    this.isCooking = false;
    this.fuseTimer = 0;
    
    // Enable physics
    this.entity.rigidbody.enabled = true;
    
    // Apply throw force
    const throwForce = direction.clone().scale(force * this.grenadeData.throwForce);
    this.entity.rigidbody.applyImpulse(throwForce);
    
    // Add some random spin
    const spin = new pc.Vec3(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10
    );
    this.entity.rigidbody.applyTorqueImpulse(spin);
    
    // Enable trail effect
    if (this.trailEffect) {
        this.trailEffect.enabled = true;
    }
    
    console.log('Grenade thrown');
};

GrenadeController.prototype.explode = function() {
    if (this.isExploded) return;
    
    this.isExploded = true;
    const explosionPos = this.entity.getPosition();
    
    // Apply damage based on grenade type
    switch (this.grenadeData.type) {
        case 'frag':
            this.createFragmentationExplosion(explosionPos);
            break;
        case 'smoke':
            this.createSmokeEffect(explosionPos);
            break;
        case 'flash':
            this.createFlashEffect(explosionPos);
            break;
        case 'incendiary':
            this.createIncendiaryEffect(explosionPos);
            break;
        case 'emp':
            this.createEMPEffect(explosionPos);
            break;
        default:
            this.createFragmentationExplosion(explosionPos);
    }
    
    // Create base explosion effect
    this.createExplosionEffect(explosionPos);
    
    // Hide grenade model
    this.entity.enabled = false;
    
    // Schedule cleanup
    setTimeout(() => {
        this.entity.destroy();
    }, 1000);
    
    console.log(`${this.grenadeData.name} exploded at`, explosionPos.toString());
};

GrenadeController.prototype.createFragmentationExplosion = function(position) {
    // Find entities in explosion radius
    const entities = this.findEntitiesInRadius(position, this.grenadeData.radius);
    
    entities.forEach(entity => {
        if (entity.entity === this.entity) return; // Don't damage self
        
        const distance = entity.distance;
        const target = entity.entity;
        
        // Calculate damage with falloff
        const damageFalloff = Math.max(0, 1 - (distance / this.grenadeData.radius));
        const damage = this.grenadeData.damage * damageFalloff;
        
        // Apply damage
        if (target.script && target.script.healthSystem) {
            target.script.healthSystem.takeDamage(damage, this.thrower, 'explosive');
        }
        
        // Apply knockback
        this.applyKnockback(target, position, distance);
    });
    
    // Fire explosion event
    this.app.fire('explosion:created', {
        position: position,
        radius: this.grenadeData.radius,
        damage: this.grenadeData.damage,
        type: 'fragmentation',
        source: this.thrower
    });
};

GrenadeController.prototype.createSmokeEffect = function(position) {
    // Create smoke cloud
    this.app.fire('effect:smokeCloud', {
        position: position,
        radius: this.grenadeData.radius,
        duration: this.grenadeData.effectDuration || 30000,
        density: 0.8
    });
    
    // Apply visibility reduction to players in area
    const entities = this.findEntitiesInRadius(position, this.grenadeData.radius);
    entities.forEach(entity => {
        if (entity.entity.tags && entity.entity.tags.has('player')) {
            this.app.fire('player:smokeEffect', {
                player: entity.entity,
                duration: 5000 // Temporary effect while in smoke
            });
        }
    });
};

GrenadeController.prototype.createFlashEffect = function(position) {
    // Find players in radius and check line of sight
    const entities = this.findEntitiesInRadius(position, this.grenadeData.radius);
    
    entities.forEach(entity => {
        if (!entity.entity.tags || !entity.entity.tags.has('player')) return;
        
        const player = entity.entity;
        const hasLineOfSight = this.checkLineOfSight(position, player.getPosition());
        
        if (hasLineOfSight) {
            // Calculate flash intensity based on distance and angle
            const intensity = 1 - (entity.distance / this.grenadeData.radius);
            const duration = 3000 * intensity; // Up to 3 seconds
            
            this.app.fire('player:flashEffect', {
                player: player,
                intensity: intensity,
                duration: duration
            });
        }
    });
    
    // Screen flash for all nearby players
    this.app.fire('effect:flashExplosion', {
        position: position,
        intensity: 2.0,
        radius: this.grenadeData.radius * 2
    });
};

GrenadeController.prototype.createIncendiaryEffect = function(position) {
    // Create fire area
    this.app.fire('effect:fireArea', {
        position: position,
        radius: this.grenadeData.radius,
        duration: this.grenadeData.effectDuration || 15000,
        damagePerSecond: 20
    });
    
    // Apply initial damage
    const entities = this.findEntitiesInRadius(position, this.grenadeData.radius);
    entities.forEach(entity => {
        if (entity.entity.script && entity.entity.script.healthSystem) {
            const damage = this.grenadeData.damage * 0.5; // Reduced initial damage
            entity.entity.script.healthSystem.takeDamage(damage, this.thrower, 'fire');
            
            // Apply burning effect
            entity.entity.script.healthSystem.addStatusEffect({
                type: 'burning',
                damagePerSecond: 10,
                duration: 5000
            });
        }
    });
};

GrenadeController.prototype.createEMPEffect = function(position) {
    // Disable electronic devices and HUD elements
    const entities = this.findEntitiesInRadius(position, this.grenadeData.radius);
    
    entities.forEach(entity => {
        if (entity.entity.tags && entity.entity.tags.has('player')) {
            this.app.fire('player:empEffect', {
                player: entity.entity,
                duration: this.grenadeData.effectDuration || 8000
            });
        }
        
        // Disable electronic equipment
        if (entity.entity.tags && entity.entity.tags.has('electronic')) {
            this.app.fire('equipment:empDisable', {
                entity: entity.entity,
                duration: this.grenadeData.effectDuration || 10000
            });
        }
    });
    
    // Visual EMP effect
    this.app.fire('effect:empBlast', {
        position: position,
        radius: this.grenadeData.radius
    });
};

GrenadeController.prototype.createExplosionEffect = function(position) {
    // Create visual explosion
    this.app.fire('effect:explosion', {
        position: position,
        scale: this.grenadeData.radius / 8,
        type: this.grenadeData.type
    });
    
    // Create screen shake
    const players = this.app.root.findByTag('player');
    players.forEach(player => {
        const distance = player.getPosition().distance(position);
        if (distance < this.grenadeData.radius * 3) {
            const intensity = Math.max(0.1, 1 - distance / (this.grenadeData.radius * 3));
            this.app.fire('camera:shake', intensity * 0.5, 1.0);
        }
    });
};

GrenadeController.prototype.findEntitiesInRadius = function(center, radius) {
    const entities = [];
    const allEntities = this.app.root.children;
    
    const checkEntity = (entity) => {
        const distance = entity.getPosition().distance(center);
        if (distance <= radius) {
            entities.push({ entity: entity, distance: distance });
        }
        
        // Check children recursively
        entity.children.forEach(child => checkEntity(child));
    };
    
    allEntities.forEach(entity => checkEntity(entity));
    
    return entities;
};

GrenadeController.prototype.checkLineOfSight = function(from, to) {
    const direction = new pc.Vec3().sub2(to, from).normalize();
    const distance = from.distance(to);
    
    const result = this.app.systems.rigidbody.raycastFirst(from, direction, distance);
    return !result; // No obstruction = line of sight
};

GrenadeController.prototype.applyKnockback = function(target, explosionPos, distance) {
    if (!target.rigidbody) return;
    
    const direction = new pc.Vec3().sub2(target.getPosition(), explosionPos).normalize();
    const falloff = Math.max(0, 1 - distance / this.grenadeData.radius);
    const knockbackForce = 10 * falloff;
    
    const force = direction.scale(knockbackForce);
    force.y = Math.abs(force.y) + 3; // Add upward component
    
    target.rigidbody.applyImpulse(force);
};

GrenadeController.prototype.getTrajectoryPreview = function(startPos, direction, force) {
    if (!this.trajectoryPreview) return [];
    
    const points = [];
    const gravity = -9.81;
    const mass = 0.4;
    const velocity = direction.clone().scale(force * this.grenadeData.throwForce / mass);
    
    let pos = startPos.clone();
    let vel = velocity.clone();
    const timeStep = 0.1;
    const maxTime = this.grenadeData.fuseTime;
    
    for (let t = 0; t < maxTime; t += timeStep) {
        points.push(pos.clone());
        
        // Update velocity (gravity)
        vel.y += gravity * timeStep;
        
        // Update position
        pos.add(vel.clone().scale(timeStep));
        
        // Simple collision check (would need more sophisticated implementation)
        if (pos.y < 0) break;
    }
    
    return points;
};

GrenadeController.prototype.setThrower = function(thrower) {
    this.thrower = thrower;
};

GrenadeController.prototype.setCookingTime = function(time) {
    this.cookingTime = Math.min(time, this.maxCookTime);
};

GrenadeController.prototype.getTimeToExplosion = function() {
    if (!this.isThrown && !this.isCooking) return this.grenadeData.fuseTime;
    
    const totalTime = this.grenadeData.fuseTime - this.cookingTime;
    return Math.max(0, totalTime - this.fuseTimer);
};

GrenadeController.prototype.defuse = function() {
    if (this.isExploded) return false;
    
    this.isExploded = true; // Prevent explosion
    this.entity.enabled = false;
    
    // Create defuse effect
    this.app.fire('effect:grenadeDefused', {
        position: this.entity.getPosition(),
        type: this.grenadeData.type
    });
    
    return true;
};