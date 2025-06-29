var WeaponPickup = pc.createScript('weaponPickup');

WeaponPickup.attributes.add('weaponData', { type: 'json', schema: [
    { name: 'name', type: 'string', default: 'Assault Rifle' },
    { name: 'type', type: 'string', default: 'rifle' },
    { name: 'damage', type: 'number', default: 30 },
    { name: 'fireRate', type: 'number', default: 600 },
    { name: 'reloadTime', type: 'number', default: 2.5 },
    { name: 'magazineSize', type: 'number', default: 30 },
    { name: 'maxAmmo', type: 'number', default: 180 },
    { name: 'range', type: 'number', default: 100 },
    { name: 'accuracy', type: 'number', default: 0.9 },
    { name: 'rarity', type: 'string', default: 'common' }
]});

WeaponPickup.attributes.add('pickupRange', { type: 'number', default: 3 });
WeaponPickup.attributes.add('respawnTime', { type: 'number', default: 30 });
WeaponPickup.attributes.add('floatHeight', { type: 'number', default: 0.5 });
WeaponPickup.attributes.add('rotationSpeed', { type: 'number', default: 45 });
WeaponPickup.attributes.add('bobSpeed', { type: 'number', default: 2 });
WeaponPickup.attributes.add('bobAmount', { type: 'number', default: 0.1 });
WeaponPickup.attributes.add('glowIntensity', { type: 'number', default: 1.5 });

WeaponPickup.prototype.initialize = function() {
    // Pickup state
    this.isAvailable = true;
    this.isPickedUp = false;
    this.lastPickupTime = 0;
    
    // Animation
    this.time = 0;
    this.originalPosition = this.entity.getPosition().clone();
    this.originalRotation = this.entity.getRotation().clone();
    
    // Player detection
    this.nearbyPlayers = new Set();
    this.pickedUpBy = null;
    
    // Visual effects
    this.glowEntity = null;
    this.uiPrompt = null;
    this.isHighlighted = false;
    
    // Ammo configuration
    this.currentAmmo = this.weaponData.magazineSize;
    this.reserveAmmo = this.weaponData.maxAmmo - this.weaponData.magazineSize;
    
    // Setup pickup components
    this.setupPickupModel();
    this.setupCollision();
    this.setupVisualEffects();
    this.setupAudio();
    
    // Bind events
    this.app.on('weapon:dropped', this.onWeaponDropped, this);
    this.entity.collision.on('triggerenter', this.onTriggerEnter, this);
    this.entity.collision.on('triggerleave', this.onTriggerLeave, this);
    
    console.log('WeaponPickup initialized:', this.weaponData.name);
};

WeaponPickup.prototype.setupPickupModel = function() {
    // Set model based on weapon type if not already set
    if (!this.entity.model) {
        this.entity.addComponent('model', {
            type: 'asset'
        });
        
        // Try to find weapon model asset
        const modelAsset = this.app.assets.find(this.weaponData.name + '_pickup');
        if (modelAsset) {
            this.entity.model.asset = modelAsset;
        } else {
            // Fallback to basic shape
            this.entity.model.type = 'box';
        }
    }
    
    // Scale based on weapon type
    this.setModelScale();
    
    // Set position slightly above ground
    const pos = this.originalPosition;
    this.entity.setPosition(pos.x, pos.y + this.floatHeight, pos.z);
};

WeaponPickup.prototype.setModelScale = function() {
    let scale = 1.0;
    
    switch (this.weaponData.type) {
        case 'pistol':
            scale = 0.8;
            break;
        case 'rifle':
            scale = 1.0;
            break;
        case 'sniper':
            scale = 1.2;
            break;
        case 'shotgun':
            scale = 1.1;
            break;
        case 'smg':
            scale = 0.9;
            break;
    }
    
    this.entity.setLocalScale(scale, scale, scale);
};

WeaponPickup.prototype.setupCollision = function() {
    // Add collision component for trigger detection
    if (!this.entity.collision) {
        this.entity.addComponent('collision', {
            type: 'box',
            halfExtents: new pc.Vec3(this.pickupRange, this.pickupRange, this.pickupRange)
        });
    }
    
    // Make it a trigger
    this.entity.collision.trigger = true;
    
    // Add rigidbody for trigger detection
    if (!this.entity.rigidbody) {
        this.entity.addComponent('rigidbody', {
            type: 'kinematic'
        });
    }
};

WeaponPickup.prototype.setupVisualEffects = function() {
    // Create glow effect
    this.createGlowEffect();
    
    // Add rarity-based effects
    this.addRarityEffects();
    
    // Create floating particles if high rarity
    if (this.weaponData.rarity === 'legendary' || this.weaponData.rarity === 'epic') {
        this.createFloatingParticles();
    }
};

WeaponPickup.prototype.createGlowEffect = function() {
    this.glowEntity = new pc.Entity('WeaponGlow');
    this.glowEntity.addComponent('light', {
        type: pc.LIGHTTYPE_OMNI,
        color: this.getRarityColor(),
        intensity: this.glowIntensity,
        range: this.pickupRange * 2,
        castShadows: false
    });
    
    this.entity.addChild(this.glowEntity);
    this.glowEntity.setLocalPosition(0, 0.5, 0);
};

WeaponPickup.prototype.addRarityEffects = function() {
    const color = this.getRarityColor();
    
    // Change material color based on rarity
    if (this.entity.model && this.entity.model.material) {
        this.entity.model.material.emissive = color;
        this.entity.model.material.emissiveIntensity = 0.3;
        this.entity.model.material.update();
    }
};

WeaponPickup.prototype.getRarityColor = function() {
    switch (this.weaponData.rarity) {
        case 'common':
            return new pc.Color(0.8, 0.8, 0.8); // White
        case 'uncommon':
            return new pc.Color(0.2, 1, 0.2); // Green
        case 'rare':
            return new pc.Color(0.2, 0.5, 1); // Blue
        case 'epic':
            return new pc.Color(0.8, 0.2, 1); // Purple
        case 'legendary':
            return new pc.Color(1, 0.6, 0.1); // Orange
        default:
            return new pc.Color(1, 1, 1); // White
    }
};

WeaponPickup.prototype.createFloatingParticles = function() {
    const particleEntity = new pc.Entity('WeaponParticles');
    particleEntity.addComponent('particlesystem', {
        numParticles: 20,
        lifetime: 2,
        rate: 10,
        startVelocity: new pc.Vec3(0, 0.5, 0),
        startVelocity2: new pc.Vec3(0, 1, 0),
        colorMap: this.getRarityColor(),
        alphaGraph: new pc.CurveSet([
            [0, 0],
            [0.5, 1],
            [1, 0]
        ])
    });
    
    this.entity.addChild(particleEntity);
    particleEntity.setLocalPosition(0, 0.5, 0);
};

WeaponPickup.prototype.setupAudio = function() {
    // Add audio component for pickup sounds
    if (!this.entity.sound) {
        this.entity.addComponent('sound');
    }
    
    // Add pickup sound slot
    this.entity.sound.addSlot('pickup', {
        asset: this.app.assets.find('weapon_pickup'),
        volume: 0.7,
        pitch: 1.0,
        loop: false,
        autoPlay: false,
        is3d: true,
        minDistance: 5,
        maxDistance: 20
    });
    
    // Add respawn sound slot
    this.entity.sound.addSlot('respawn', {
        asset: this.app.assets.find('weapon_respawn'),
        volume: 0.5,
        pitch: 1.0,
        loop: false,
        autoPlay: false,
        is3d: true,
        minDistance: 5,
        maxDistance: 30
    });
};

WeaponPickup.prototype.update = function(dt) {
    if (!this.isAvailable) {
        this.updateRespawn(dt);
        return;
    }
    
    this.updateAnimation(dt);
    this.updatePlayerDetection(dt);
    this.updateVisualEffects(dt);
};

WeaponPickup.prototype.updateAnimation = function(dt) {
    this.time += dt;
    
    // Floating animation
    const bobOffset = Math.sin(this.time * this.bobSpeed) * this.bobAmount;
    const currentPos = this.originalPosition.clone();
    currentPos.y += this.floatHeight + bobOffset;
    this.entity.setPosition(currentPos);
    
    // Rotation animation
    const rotationY = this.time * this.rotationSpeed;
    const newRotation = this.originalRotation.clone();
    newRotation.setFromAxisAngle(pc.Vec3.UP, rotationY * pc.math.DEG_TO_RAD);
    this.entity.setRotation(newRotation);
};

WeaponPickup.prototype.updatePlayerDetection = function(dt) {
    // Check if any nearby players can pick up the weapon
    this.nearbyPlayers.forEach(player => {
        if (this.canPlayerPickup(player)) {
            this.showPickupPrompt(player);
        } else {
            this.hidePickupPrompt(player);
        }
    });
};

WeaponPickup.prototype.updateVisualEffects = function(dt) {
    // Pulse glow effect
    if (this.glowEntity && this.glowEntity.light) {
        const pulseIntensity = this.glowIntensity + Math.sin(this.time * 3) * 0.3;
        this.glowEntity.light.intensity = pulseIntensity;
    }
    
    // Update highlight effect
    if (this.isHighlighted) {
        this.updateHighlightEffect(dt);
    }
};

WeaponPickup.prototype.updateRespawn = function(dt) {
    const currentTime = Date.now();
    
    if (currentTime - this.lastPickupTime >= this.respawnTime * 1000) {
        this.respawn();
    }
};

WeaponPickup.prototype.onTriggerEnter = function(entity) {
    if (entity.tags && entity.tags.has('player')) {
        this.nearbyPlayers.add(entity);
        this.highlightWeapon(true);
        
        // Show pickup UI
        this.app.fire('ui:showPickupPrompt', {
            weapon: this.weaponData,
            entity: this.entity,
            player: entity
        });
    }
};

WeaponPickup.prototype.onTriggerLeave = function(entity) {
    if (entity.tags && entity.tags.has('player')) {
        this.nearbyPlayers.delete(entity);
        
        if (this.nearbyPlayers.size === 0) {
            this.highlightWeapon(false);
        }
        
        // Hide pickup UI
        this.app.fire('ui:hidePickupPrompt', {
            weapon: this.weaponData,
            entity: this.entity,
            player: entity
        });
    }
};

WeaponPickup.prototype.canPlayerPickup = function(player) {
    if (!this.isAvailable || !player.enabled) return false;
    
    // Check if player has weapon manager
    const weaponManager = player.script && player.script.weaponManager;
    if (!weaponManager) return false;
    
    // Check if player is pressing pickup key
    const isPressingPickup = this.app.keyboard.isPressed(pc.KEY_E) || 
                            this.app.keyboard.isPressed(pc.KEY_F);
    
    return isPressingPickup;
};

WeaponPickup.prototype.showPickupPrompt = function(player) {
    // Create or update pickup prompt UI
    this.app.fire('ui:updatePickupPrompt', {
        weapon: this.weaponData,
        position: this.entity.getPosition(),
        canPickup: this.canPlayerPickup(player)
    });
};

WeaponPickup.prototype.hidePickupPrompt = function(player) {
    this.app.fire('ui:hidePickupPrompt', {
        weapon: this.weaponData,
        player: player
    });
};

WeaponPickup.prototype.highlightWeapon = function(highlight) {
    this.isHighlighted = highlight;
    
    if (highlight) {
        // Increase glow intensity
        if (this.glowEntity && this.glowEntity.light) {
            this.glowEntity.light.intensity = this.glowIntensity * 1.5;
        }
        
        // Add outline effect
        this.addOutlineEffect();
    } else {
        // Reset glow intensity
        if (this.glowEntity && this.glowEntity.light) {
            this.glowEntity.light.intensity = this.glowIntensity;
        }
        
        // Remove outline effect
        this.removeOutlineEffect();
    }
};

WeaponPickup.prototype.addOutlineEffect = function() {
    // Simple outline effect by scaling model slightly
    if (this.entity.model) {
        const currentScale = this.entity.getLocalScale();
        this.entity.setLocalScale(
            currentScale.x * 1.05,
            currentScale.y * 1.05,
            currentScale.z * 1.05
        );
    }
};

WeaponPickup.prototype.removeOutlineEffect = function() {
    // Reset scale
    this.setModelScale();
};

WeaponPickup.prototype.updateHighlightEffect = function(dt) {
    // Pulsing highlight effect
    if (this.entity.model && this.entity.model.material) {
        const pulseValue = 0.5 + Math.sin(this.time * 4) * 0.3;
        this.entity.model.material.emissiveIntensity = pulseValue;
        this.entity.model.material.update();
    }
};

WeaponPickup.prototype.pickupWeapon = function(player) {
    if (!this.isAvailable || !player) return false;
    
    const weaponManager = player.script && player.script.weaponManager;
    if (!weaponManager) return false;
    
    // Create weapon data for pickup
    const weaponPickupData = {
        ...this.weaponData,
        currentAmmo: this.currentAmmo,
        reserveAmmo: this.reserveAmmo
    };
    
    // Give weapon to player
    weaponManager.pickupWeapon(weaponPickupData);
    
    // Mark as picked up
    this.isAvailable = false;
    this.isPickedUp = true;
    this.pickedUpBy = player;
    this.lastPickupTime = Date.now();
    
    // Play pickup sound
    if (this.entity.sound) {
        this.entity.sound.play('pickup');
    }
    
    // Create pickup effect
    this.createPickupEffect();
    
    // Hide the weapon
    this.hideWeapon();
    
    // Fire pickup event
    this.app.fire('weapon:pickedUp', {
        weapon: this.weaponData,
        player: player,
        pickup: this.entity
    });
    
    // Hide UI prompts
    this.app.fire('ui:hidePickupPrompt', {
        weapon: this.weaponData,
        player: player
    });
    
    return true;
};

WeaponPickup.prototype.createPickupEffect = function() {
    // Create pickup particles
    this.app.fire('effect:weaponPickup', {
        position: this.entity.getPosition(),
        rarity: this.weaponData.rarity,
        color: this.getRarityColor()
    });
    
    // Screen flash for rare weapons
    if (this.weaponData.rarity === 'epic' || this.weaponData.rarity === 'legendary') {
        this.app.fire('ui:flashEffect', {
            intensity: 0.2,
            duration: 300,
            color: this.getRarityColor()
        });
    }
};

WeaponPickup.prototype.hideWeapon = function() {
    // Hide model and effects
    this.entity.enabled = false;
    
    // Clear nearby players
    this.nearbyPlayers.clear();
    this.isHighlighted = false;
};

WeaponPickup.prototype.respawn = function() {
    // Reset state
    this.isAvailable = true;
    this.isPickedUp = false;
    this.pickedUpBy = null;
    this.time = 0;
    
    // Show the weapon again
    this.entity.enabled = true;
    
    // Reset position
    const pos = this.originalPosition.clone();
    this.entity.setPosition(pos.x, pos.y + this.floatHeight, pos.z);
    
    // Reset ammo
    this.currentAmmo = this.weaponData.magazineSize;
    this.reserveAmmo = this.weaponData.maxAmmo - this.weaponData.magazineSize;
    
    // Play respawn sound
    if (this.entity.sound) {
        this.entity.sound.play('respawn');
    }
    
    // Create respawn effect
    this.app.fire('effect:weaponRespawn', {
        position: this.entity.getPosition(),
        rarity: this.weaponData.rarity
    });
    
    // Fire respawn event
    this.app.fire('weapon:respawned', {
        weapon: this.weaponData,
        pickup: this.entity
    });
    
    console.log('Weapon respawned:', this.weaponData.name);
};

WeaponPickup.prototype.forcePickup = function(player) {
    // Force pickup regardless of input
    return this.pickupWeapon(player);
};

WeaponPickup.prototype.setAmmo = function(current, reserve) {
    this.currentAmmo = current || this.weaponData.magazineSize;
    this.reserveAmmo = reserve || (this.weaponData.maxAmmo - this.currentAmmo);
};

WeaponPickup.prototype.onWeaponDropped = function(data) {
    // Handle when a weapon is dropped near this pickup
    if (data.weapon.name === this.weaponData.name) {
        // If same weapon type, potentially update ammo
        this.currentAmmo = Math.max(this.currentAmmo, data.currentAmmo || 0);
        this.reserveAmmo = Math.max(this.reserveAmmo, data.reserveAmmo || 0);
    }
};

WeaponPickup.prototype.getWeaponInfo = function() {
    return {
        name: this.weaponData.name,
        type: this.weaponData.type,
        rarity: this.weaponData.rarity,
        damage: this.weaponData.damage,
        currentAmmo: this.currentAmmo,
        reserveAmmo: this.reserveAmmo,
        isAvailable: this.isAvailable
    };
};

WeaponPickup.prototype.setRespawnTime = function(time) {
    this.respawnTime = time;
};

WeaponPickup.prototype.isNearPlayer = function(player) {
    return this.nearbyPlayers.has(player);
};

WeaponPickup.prototype.getDistanceToPlayer = function(player) {
    return this.entity.getPosition().distance(player.getPosition());
};