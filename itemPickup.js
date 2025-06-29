var ItemPickup = pc.createScript('itemPickup');

ItemPickup.attributes.add('itemData', { type: 'json', schema: [
    { name: 'name', type: 'string', default: 'Health Pack' },
    { name: 'type', type: 'string', default: 'health' }, // health, armor, shield, ammo, powerup
    { name: 'value', type: 'number', default: 50 },
    { name: 'rarity', type: 'string', default: 'common' }, // common, uncommon, rare, epic, legendary
    { name: 'stackable', type: 'boolean', default: false },
    { name: 'consumeOnPickup', type: 'boolean', default: true },
    { name: 'duration', type: 'number', default: 0 }, // For temporary effects
    { name: 'cooldown', type: 'number', default: 0 } // Cooldown before effect can be applied again
]});

ItemPickup.attributes.add('pickupRange', { type: 'number', default: 2 });
ItemPickup.attributes.add('respawnTime', { type: 'number', default: 30 });
ItemPickup.attributes.add('floatHeight', { type: 'number', default: 0.3 });
ItemPickup.attributes.add('rotationSpeed', { type: 'number', default: 60 });
ItemPickup.attributes.add('bobSpeed', { type: 'number', default: 3 });
ItemPickup.attributes.add('bobAmount', { type: 'number', default: 0.05 });
ItemPickup.attributes.add('glowIntensity', { type: 'number', default: 1.0 });
ItemPickup.attributes.add('autoPickup', { type: 'boolean', default: false });

ItemPickup.prototype.initialize = function() {
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
    this.eligiblePlayers = new Set();
    this.lastPlayerCheck = 0;
    
    // Visual effects
    this.glowEntity = null;
    this.particleEntity = null;
    this.uiPrompt = null;
    this.isHighlighted = false;
    
    // Item effect configuration
    this.effectConfig = this.getEffectConfig();
    
    // Setup pickup components
    this.setupPickupModel();
    this.setupCollision();
    this.setupVisualEffects();
    this.setupAudio();
    
    // Bind events
    this.entity.collision.on('triggerenter', this.onTriggerEnter, this);
    this.entity.collision.on('triggerleave', this.onTriggerLeave, this);
    this.app.on('item:respawn', this.onItemRespawn, this);
    this.app.on('player:healthChanged', this.onPlayerHealthChanged, this);
    
    console.log('ItemPickup initialized:', this.itemData.name, this.itemData.type);
};

ItemPickup.prototype.getEffectConfig = function() {
    // Define item effects based on type
    const configs = {
        health: {
            targetStat: 'health',
            canOverheal: false,
            instantEffect: true,
            statusEffect: null
        },
        armor: {
            targetStat: 'armor',
            canOverheal: false,
            instantEffect: true,
            statusEffect: null
        },
        shield: {
            targetStat: 'shield',
            canOverheal: false,
            instantEffect: true,
            statusEffect: null
        },
        ammo: {
            targetStat: 'ammo',
            ammoType: 'all', // or specific type like 'rifle', 'pistol'
            instantEffect: true,
            statusEffect: null
        },
        speed_boost: {
            targetStat: 'movement',
            instantEffect: false,
            statusEffect: {
                type: 'speed_boost',
                multiplier: 1.5,
                duration: this.itemData.duration || 10000
            }
        },
        damage_boost: {
            targetStat: 'damage',
            instantEffect: false,
            statusEffect: {
                type: 'damage_boost',
                multiplier: 1.3,
                duration: this.itemData.duration || 15000
            }
        },
        invisibility: {
            targetStat: 'visibility',
            instantEffect: false,
            statusEffect: {
                type: 'invisibility',
                opacity: 0.3,
                duration: this.itemData.duration || 8000
            }
        },
        regeneration: {
            targetStat: 'health',
            instantEffect: false,
            statusEffect: {
                type: 'regeneration',
                ratePerSecond: 5,
                duration: this.itemData.duration || 20000
            }
        }
    };
    
    return configs[this.itemData.type] || configs.health;
};

ItemPickup.prototype.setupPickupModel = function() {
    // Set model based on item type if not already set
    if (!this.entity.model) {
        this.entity.addComponent('model', {
            type: 'asset'
        });
        
        // Try to find item model asset
        const modelAsset = this.app.assets.find(this.itemData.name.replace(' ', '_') + '_model');
        if (modelAsset) {
            this.entity.model.asset = modelAsset;
        } else {
            // Fallback based on item type
            this.setFallbackModel();
        }
    }
    
    // Scale based on item type and rarity
    this.setModelScale();
    
    // Set position slightly above ground
    const pos = this.originalPosition;
    this.entity.setPosition(pos.x, pos.y + this.floatHeight, pos.z);
};

ItemPickup.prototype.setFallbackModel = function() {
    switch (this.itemData.type) {
        case 'health':
            this.entity.model.type = 'capsule';
            break;
        case 'armor':
            this.entity.model.type = 'box';
            break;
        case 'shield':
            this.entity.model.type = 'sphere';
            break;
        case 'ammo':
            this.entity.model.type = 'cylinder';
            break;
        default:
            this.entity.model.type = 'box';
    }
};

ItemPickup.prototype.setModelScale = function() {
    let scale = 1.0;
    
    // Base scale by item type
    switch (this.itemData.type) {
        case 'health':
            scale = 0.6;
            break;
        case 'armor':
            scale = 0.8;
            break;
        case 'shield':
            scale = 0.7;
            break;
        case 'ammo':
            scale = 0.5;
            break;
        default:
            scale = 0.8;
    }
    
    // Rarity multiplier
    const rarityScale = this.getRarityScale();
    scale *= rarityScale;
    
    this.entity.setLocalScale(scale, scale, scale);
};

ItemPickup.prototype.getRarityScale = function() {
    switch (this.itemData.rarity) {
        case 'common': return 1.0;
        case 'uncommon': return 1.1;
        case 'rare': return 1.2;
        case 'epic': return 1.3;
        case 'legendary': return 1.5;
        default: return 1.0;
    }
};

ItemPickup.prototype.setupCollision = function() {
    // Add collision component for trigger detection
    if (!this.entity.collision) {
        this.entity.addComponent('collision', {
            type: 'sphere',
            radius: this.pickupRange
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

ItemPickup.prototype.setupVisualEffects = function() {
    // Create glow effect
    this.createGlowEffect();
    
    // Add rarity-based effects
    this.addRarityEffects();
    
    // Create particles for rare items
    if (this.itemData.rarity === 'epic' || this.itemData.rarity === 'legendary') {
        this.createParticleEffects();
    }
};

ItemPickup.prototype.createGlowEffect = function() {
    this.glowEntity = new pc.Entity('ItemGlow');
    this.glowEntity.addComponent('light', {
        type: pc.LIGHTTYPE_OMNI,
        color: this.getItemColor(),
        intensity: this.glowIntensity,
        range: this.pickupRange * 3,
        castShadows: false
    });
    
    this.entity.addChild(this.glowEntity);
    this.glowEntity.setLocalPosition(0, 0.2, 0);
};

ItemPickup.prototype.addRarityEffects = function() {
    const color = this.getItemColor();
    
    // Change material color based on item type and rarity
    if (this.entity.model && this.entity.model.material) {
        this.entity.model.material.emissive = color;
        this.entity.model.material.emissiveIntensity = this.getRarityEmissiveIntensity();
        this.entity.model.material.update();
    }
};

ItemPickup.prototype.getItemColor = function() {
    // Base color by item type
    let baseColor;
    switch (this.itemData.type) {
        case 'health':
            baseColor = new pc.Color(0.2, 1, 0.2); // Green
            break;
        case 'armor':
            baseColor = new pc.Color(0.7, 0.7, 0.7); // Gray
            break;
        case 'shield':
            baseColor = new pc.Color(0.2, 0.5, 1); // Blue
            break;
        case 'ammo':
            baseColor = new pc.Color(1, 0.8, 0.2); // Yellow
            break;
        case 'speed_boost':
            baseColor = new pc.Color(0.2, 1, 1); // Cyan
            break;
        case 'damage_boost':
            baseColor = new pc.Color(1, 0.4, 0.2); // Orange
            break;
        case 'invisibility':
            baseColor = new pc.Color(0.8, 0.2, 1); // Purple
            break;
        default:
            baseColor = new pc.Color(1, 1, 1); // White
    }
    
    // Modify by rarity
    switch (this.itemData.rarity) {
        case 'uncommon':
            baseColor = baseColor.lerp(new pc.Color(0.2, 1, 0.2), 0.2);
            break;
        case 'rare':
            baseColor = baseColor.lerp(new pc.Color(0.2, 0.5, 1), 0.3);
            break;
        case 'epic':
            baseColor = baseColor.lerp(new pc.Color(0.8, 0.2, 1), 0.4);
            break;
        case 'legendary':
            baseColor = baseColor.lerp(new pc.Color(1, 0.6, 0.1), 0.5);
            break;
    }
    
    return baseColor;
};

ItemPickup.prototype.getRarityEmissiveIntensity = function() {
    switch (this.itemData.rarity) {
        case 'common': return 0.2;
        case 'uncommon': return 0.3;
        case 'rare': return 0.5;
        case 'epic': return 0.7;
        case 'legendary': return 1.0;
        default: return 0.2;
    }
};

ItemPickup.prototype.createParticleEffects = function() {
    this.particleEntity = new pc.Entity('ItemParticles');
    this.particleEntity.addComponent('particlesystem', {
        numParticles: 15,
        lifetime: 1.5,
        rate: 8,
        startVelocity: new pc.Vec3(0, 0.3, 0),
        startVelocity2: new pc.Vec3(0, 0.8, 0),
        colorMap: this.getItemColor(),
        alphaGraph: new pc.CurveSet([
            [0, 0],
            [0.3, 1],
            [1, 0]
        ])
    });
    
    this.entity.addChild(this.particleEntity);
    this.particleEntity.setLocalPosition(0, 0.3, 0);
};

ItemPickup.prototype.setupAudio = function() {
    // Add audio component for pickup sounds
    if (!this.entity.sound) {
        this.entity.addComponent('sound');
    }
    
    // Add pickup sound slot
    const pickupSoundName = 'pickup_' + this.itemData.type;
    this.entity.sound.addSlot('pickup', {
        asset: this.app.assets.find(pickupSoundName) || this.app.assets.find('item_pickup'),
        volume: 0.8,
        pitch: this.getRarityPitch(),
        loop: false,
        autoPlay: false,
        is3d: true,
        minDistance: 3,
        maxDistance: 15
    });
    
    // Add respawn sound slot
    this.entity.sound.addSlot('respawn', {
        asset: this.app.assets.find('item_respawn'),
        volume: 0.5,
        pitch: 1.0,
        loop: false,
        autoPlay: false,
        is3d: true,
        minDistance: 5,
        maxDistance: 25
    });
};

ItemPickup.prototype.getRarityPitch = function() {
    switch (this.itemData.rarity) {
        case 'common': return 1.0;
        case 'uncommon': return 1.1;
        case 'rare': return 1.2;
        case 'epic': return 1.3;
        case 'legendary': return 1.5;
        default: return 1.0;
    }
};

ItemPickup.prototype.update = function(dt) {
    if (!this.isAvailable) {
        this.updateRespawn(dt);
        return;
    }
    
    this.updateAnimation(dt);
    this.updatePlayerEligibility(dt);
    this.updateVisualEffects(dt);
    this.updateAutoPickup(dt);
};

ItemPickup.prototype.updateAnimation = function(dt) {
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

ItemPickup.prototype.updatePlayerEligibility = function(dt) {
    const currentTime = Date.now();
    
    // Only check every 100ms for performance
    if (currentTime - this.lastPlayerCheck < 100) return;
    this.lastPlayerCheck = currentTime;
    
    // Update eligible players list
    this.eligiblePlayers.clear();
    this.nearbyPlayers.forEach(player => {
        if (this.canPlayerPickup(player)) {
            this.eligiblePlayers.add(player);
        }
    });
    
    // Update UI prompts
    this.updateUIPrompts();
};

ItemPickup.prototype.updateVisualEffects = function(dt) {
    // Pulse glow effect
    if (this.glowEntity && this.glowEntity.light) {
        const pulseIntensity = this.glowIntensity + Math.sin(this.time * 4) * 0.2;
        this.glowEntity.light.intensity = pulseIntensity;
    }
    
    // Update highlight effect
    if (this.isHighlighted) {
        this.updateHighlightEffect(dt);
    }
};

ItemPickup.prototype.updateAutoPickup = function(dt) {
    if (!this.autoPickup) return;
    
    // Auto-pickup for eligible players
    this.eligiblePlayers.forEach(player => {
        if (this.canPlayerPickup(player)) {
            this.pickupItem(player);
        }
    });
};

ItemPickup.prototype.updateRespawn = function(dt) {
    const currentTime = Date.now();
    
    if (currentTime - this.lastPickupTime >= this.respawnTime * 1000) {
        this.respawn();
    }
};

ItemPickup.prototype.onTriggerEnter = function(entity) {
    if (entity.tags && entity.tags.has('player')) {
        this.nearbyPlayers.add(entity);
        this.highlightItem(true);
        
        // Show pickup UI
        this.app.fire('ui:showItemPrompt', {
            item: this.itemData,
            entity: this.entity,
            player: entity
        });
    }
};

ItemPickup.prototype.onTriggerLeave = function(entity) {
    if (entity.tags && entity.tags.has('player')) {
        this.nearbyPlayers.delete(entity);
        this.eligiblePlayers.delete(entity);
        
        if (this.nearbyPlayers.size === 0) {
            this.highlightItem(false);
        }
        
        // Hide pickup UI
        this.app.fire('ui:hideItemPrompt', {
            item: this.itemData,
            entity: this.entity,
            player: entity
        });
    }
};

ItemPickup.prototype.canPlayerPickup = function(player) {
    if (!this.isAvailable || !player.enabled) return false;
    
    // Check if player has health/armor system
    const healthSystem = player.script && player.script.healthSystem;
    if (!healthSystem) return false;
    
    // Check if player can benefit from this item
    switch (this.itemData.type) {
        case 'health':
            return !healthSystem.isFullHealth();
        case 'armor':
            return healthSystem.currentArmor < healthSystem.maxArmor;
        case 'shield':
            return healthSystem.currentShield < healthSystem.maxShield;
        case 'ammo':
            return this.canPlayerUseAmmo(player);
        default:
            return true; // Powerups can always be picked up
    }
};

ItemPickup.prototype.canPlayerUseAmmo = function(player) {
    const weaponManager = player.script && player.script.weaponManager;
    if (!weaponManager) return false;
    
    // Check if player has weapons that can use this ammo
    if (this.effectConfig.ammoType === 'all') {
        return weaponManager.canReload();
    } else {
        // Check specific ammo type
        return weaponManager.getAmmoCount(this.effectConfig.ammoType) < 
               weaponManager.getMaxAmmoCount(this.effectConfig.ammoType);
    }
};

ItemPickup.prototype.pickupItem = function(player) {
    if (!this.isAvailable || !this.canPlayerPickup(player)) return false;
    
    // Apply item effect
    const success = this.applyItemEffect(player);
    if (!success) return false;
    
    // Mark as picked up
    this.isAvailable = false;
    this.isPickedUp = true;
    this.lastPickupTime = Date.now();
    
    // Play pickup sound
    if (this.entity.sound) {
        this.entity.sound.play('pickup');
    }
    
    // Create pickup effect
    this.createPickupEffect(player);
    
    // Hide the item
    this.hideItem();
    
    // Fire pickup event
    this.app.fire('item:pickedUp', {
        item: this.itemData,
        player: player,
        pickup: this.entity
    });
    
    // Hide UI prompts
    this.app.fire('ui:hideItemPrompt', {
        item: this.itemData,
        player: player
    });
    
    console.log(`${player.name} picked up ${this.itemData.name}`);
    return true;
};

ItemPickup.prototype.applyItemEffect = function(player) {
    const healthSystem = player.script && player.script.healthSystem;
    const weaponManager = player.script && player.script.weaponManager;
    
    if (!healthSystem) return false;
    
    switch (this.itemData.type) {
        case 'health':
            return healthSystem.heal(this.itemData.value, 'item') > 0;
            
        case 'armor':
            return healthSystem.addArmor(this.itemData.value) > 0;
            
        case 'shield':
            return healthSystem.addShield(this.itemData.value) > 0;
            
        case 'ammo':
            if (weaponManager) {
                if (this.effectConfig.ammoType === 'all') {
                    return weaponManager.addAmmoToAllWeapons(this.itemData.value);
                } else {
                    return weaponManager.addAmmo(this.effectConfig.ammoType, this.itemData.value);
                }
            }
            return false;
            
        default:
            // Apply status effect for powerups
            return this.applyStatusEffect(player);
    }
};

ItemPickup.prototype.applyStatusEffect = function(player) {
    const healthSystem = player.script && player.script.healthSystem;
    if (!healthSystem || !this.effectConfig.statusEffect) return false;
    
    const effect = {
        ...this.effectConfig.statusEffect,
        source: 'item_' + this.itemData.name
    };
    
    healthSystem.addStatusEffect(effect);
    
    // Apply immediate effects
    switch (effect.type) {
        case 'speed_boost':
            this.app.fire('player:speedBoost', {
                player: player,
                multiplier: effect.multiplier,
                duration: effect.duration
            });
            break;
            
        case 'damage_boost':
            this.app.fire('player:damageBoost', {
                player: player,
                multiplier: effect.multiplier,
                duration: effect.duration
            });
            break;
            
        case 'invisibility':
            this.app.fire('player:invisibility', {
                player: player,
                opacity: effect.opacity,
                duration: effect.duration
            });
            break;
    }
    
    return true;
};

ItemPickup.prototype.createPickupEffect = function(player) {
    // Create pickup particles
    this.app.fire('effect:itemPickup', {
        position: this.entity.getPosition(),
        itemType: this.itemData.type,
        rarity: this.itemData.rarity,
        color: this.getItemColor()
    });
    
    // Screen flash for rare items
    if (this.itemData.rarity === 'epic' || this.itemData.rarity === 'legendary') {
        this.app.fire('ui:flashEffect', {
            intensity: 0.15,
            duration: 200,
            color: this.getItemColor()
        });
    }
    
    // Show pickup text
    this.app.fire('ui:showPickupText', {
        text: '+' + this.itemData.value + ' ' + this.itemData.name,
        position: player.getPosition(),
        color: this.getItemColor()
    });
};

ItemPickup.prototype.hideItem = function() {
    // Hide model and effects
    this.entity.enabled = false;
    
    // Clear nearby players
    this.nearbyPlayers.clear();
    this.eligiblePlayers.clear();
    this.isHighlighted = false;
};

ItemPickup.prototype.respawn = function() {
    // Reset state
    this.isAvailable = true;
    this.isPickedUp = false;
    this.time = 0;
    
    // Show the item again
    this.entity.enabled = true;
    
    // Reset position
    const pos = this.originalPosition.clone();
    this.entity.setPosition(pos.x, pos.y + this.floatHeight, pos.z);
    
    // Play respawn sound
    if (this.entity.sound) {
        this.entity.sound.play('respawn');
    }
    
    // Create respawn effect
    this.app.fire('effect:itemRespawn', {
        position: this.entity.getPosition(),
        itemType: this.itemData.type,
        rarity: this.itemData.rarity
    });
    
    // Fire respawn event
    this.app.fire('item:respawned', {
        item: this.itemData,
        pickup: this.entity
    });
    
    console.log('Item respawned:', this.itemData.name);
};

ItemPickup.prototype.highlightItem = function(highlight) {
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

ItemPickup.prototype.addOutlineEffect = function() {
    // Simple outline effect by scaling model slightly
    if (this.entity.model) {
        const currentScale = this.entity.getLocalScale();
        this.entity.setLocalScale(
            currentScale.x * 1.1,
            currentScale.y * 1.1,
            currentScale.z * 1.1
        );
    }
};

ItemPickup.prototype.removeOutlineEffect = function() {
    // Reset scale
    this.setModelScale();
};

ItemPickup.prototype.updateHighlightEffect = function(dt) {
    // Pulsing highlight effect
    if (this.entity.model && this.entity.model.material) {
        const pulseValue = 0.3 + Math.sin(this.time * 6) * 0.2;
        this.entity.model.material.emissiveIntensity = pulseValue;
        this.entity.model.material.update();
    }
};

ItemPickup.prototype.updateUIPrompts = function() {
    // Update UI for eligible players
    this.eligiblePlayers.forEach(player => {
        this.app.fire('ui:updateItemPrompt', {
            item: this.itemData,
            position: this.entity.getPosition(),
            canPickup: true,
            player: player
        });
    });
    
    // Update UI for ineligible players
    this.nearbyPlayers.forEach(player => {
        if (!this.eligiblePlayers.has(player)) {
            this.app.fire('ui:updateItemPrompt', {
                item: this.itemData,
                position: this.entity.getPosition(),
                canPickup: false,
                player: player,
                reason: this.getIneligibilityReason(player)
            });
        }
    });
};

ItemPickup.prototype.getIneligibilityReason = function(player) {
    const healthSystem = player.script && player.script.healthSystem;
    
    switch (this.itemData.type) {
        case 'health':
            return healthSystem && healthSystem.isFullHealth() ? 'Health Full' : 'Cannot Use';
        case 'armor':
            return healthSystem && healthSystem.currentArmor >= healthSystem.maxArmor ? 'Armor Full' : 'Cannot Use';
        case 'shield':
            return healthSystem && healthSystem.currentShield >= healthSystem.maxShield ? 'Shield Full' : 'Cannot Use';
        case 'ammo':
            return 'Ammo Full';
        default:
            return 'Cannot Use';
    }
};

ItemPickup.prototype.onItemRespawn = function(data) {
    // Handle global item respawn events
    if (data.itemType === this.itemData.type && !this.isAvailable) {
        // Chance to respawn early
        if (Math.random() < 0.1) {
            this.respawn();
        }
    }
};

ItemPickup.prototype.onPlayerHealthChanged = function(data) {
    // Re-evaluate eligibility when player health changes
    if (this.nearbyPlayers.has(data.player)) {
        // Small delay to prevent constant updates
        setTimeout(() => {
            this.updatePlayerEligibility(0);
        }, 100);
    }
};

ItemPickup.prototype.forcePickup = function(player) {
    // Force pickup regardless of eligibility
    return this.pickupItem(player);
};

ItemPickup.prototype.setRespawnTime = function(time) {
    this.respawnTime = time;
};

ItemPickup.prototype.getItemInfo = function() {
    return {
        name: this.itemData.name,
        type: this.itemData.type,
        value: this.itemData.value,
        rarity: this.itemData.rarity,
        isAvailable: this.isAvailable,
        nearbyPlayers: this.nearbyPlayers.size,
        eligiblePlayers: this.eligiblePlayers.size
    };
};

ItemPickup.prototype.isNearPlayer = function(player) {
    return this.nearbyPlayers.has(player);
};

ItemPickup.prototype.isEligiblePlayer = function(player) {
    return this.eligiblePlayers.has(player);
};