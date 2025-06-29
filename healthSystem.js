var HealthSystem = pc.createScript('healthSystem');

HealthSystem.attributes.add('maxHealth', { type: 'number', default: 100 });
HealthSystem.attributes.add('maxShield', { type: 'number', default: 50 });
HealthSystem.attributes.add('maxArmor', { type: 'number', default: 100 });
HealthSystem.attributes.add('healthRegenRate', { type: 'number', default: 5 }); // HP per second
HealthSystem.attributes.add('shieldRegenRate', { type: 'number', default: 10 }); // Shield per second
HealthSystem.attributes.add('healthRegenDelay', { type: 'number', default: 5 }); // Seconds before regen starts
HealthSystem.attributes.add('shieldRegenDelay', { type: 'number', default: 3 }); // Seconds before shield regen
HealthSystem.attributes.add('isPlayer', { type: 'boolean', default: true });

HealthSystem.prototype.initialize = function() {
    // Current values
    this.currentHealth = this.maxHealth;
    this.currentShield = this.maxShield;
    this.currentArmor = this.maxArmor;
    
    // Regeneration tracking
    this.lastDamageTime = 0;
    this.lastShieldDamageTime = 0;
    this.isRegenerating = false;
    this.isShieldRegenerating = false;
    
    // Status effects
    this.statusEffects = [];
    this.damageOverTime = [];
    
    // Death state
    this.isDead = false;
    this.respawnTime = 5; // seconds
    
    // Damage resistance
    this.damageResistance = 0; // 0-1 scale
    
    // Bind events
    this.app.on('health:heal', this.heal, this);
    this.app.on('health:addShield', this.addShield, this);
    this.app.on('health:addArmor', this.addArmor, this);
    this.app.on('health:statusEffect', this.addStatusEffect, this);
    
    console.log('HealthSystem initialized for:', this.entity.name);
};

HealthSystem.prototype.update = function(dt) {
    if (this.isDead) return;
    
    this.updateRegeneration(dt);
    this.updateStatusEffects(dt);
    this.updateDamageOverTime(dt);
    this.updateUI();
};

HealthSystem.prototype.takeDamage = function(damage, source, damageType) {
    if (this.isDead || damage <= 0) return 0;
    
    // Apply damage type modifiers
    let finalDamage = this.calculateDamage(damage, damageType);
    
    // Apply damage resistance
    finalDamage *= (1 - this.damageResistance);
    
    let actualDamage = 0;
    
    // Damage order: Shield -> Armor -> Health
    if (this.currentShield > 0) {
        const shieldDamage = Math.min(this.currentShield, finalDamage);
        this.currentShield -= shieldDamage;
        actualDamage += shieldDamage;
        finalDamage -= shieldDamage;
        this.lastShieldDamageTime = this.app.frame;
        
        // Shield break effect
        if (this.currentShield <= 0) {
            this.app.fire('effect:shieldBreak', this.entity.getPosition());
        }
    }
    
    if (finalDamage > 0 && this.currentArmor > 0) {
        const armorDamage = Math.min(this.currentArmor, finalDamage * 0.7); // Armor absorbs 70%
        this.currentArmor -= armorDamage;
        actualDamage += armorDamage;
        finalDamage *= 0.3; // 30% passes through armor
    }
    
    if (finalDamage > 0) {
        this.currentHealth -= finalDamage;
        actualDamage += finalDamage;
        this.lastDamageTime = this.app.frame;
    }
    
    // Clamp values
    this.currentHealth = Math.max(0, this.currentHealth);
    this.currentShield = Math.max(0, this.currentShield);
    this.currentArmor = Math.max(0, this.currentArmor);
    
    // Fire damage event
    this.app.fire('player:damaged', {
        entity: this.entity,
        damage: actualDamage,
        source: source,
        type: damageType
    });
    
    // Check for death
    if (this.currentHealth <= 0 && !this.isDead) {
        this.die(source);
    }
    
    // Camera shake for player
    if (this.isPlayer) {
        this.app.fire('camera:shake', actualDamage / 100 * 0.05, 0.2);
    }
    
    return actualDamage;
};

HealthSystem.prototype.calculateDamage = function(baseDamage, damageType) {
    let multiplier = 1.0;
    
    switch (damageType) {
        case 'bullet':
            multiplier = 1.0;
            break;
        case 'explosive':
            multiplier = 1.2;
            break;
        case 'fire':
            multiplier = 0.8;
            break;
        case 'poison':
            multiplier = 0.6;
            break;
        default:
            multiplier = 1.0;
    }
    
    return baseDamage * multiplier;
};

HealthSystem.prototype.heal = function(amount, source) {
    if (this.isDead) return 0;
    
    const oldHealth = this.currentHealth;
    this.currentHealth = Math.min(this.maxHealth, this.currentHealth + amount);
    const actualHealing = this.currentHealth - oldHealth;
    
    // Show healing effect
    if (actualHealing > 0) {
        this.app.fire('effect:heal', {
            entity: this.entity,
            amount: actualHealing,
            source: source
        });
    }
    
    return actualHealing;
};

HealthSystem.prototype.addShield = function(amount) {
    if (this.isDead) return 0;
    
    const oldShield = this.currentShield;
    this.currentShield = Math.min(this.maxShield, this.currentShield + amount);
    const actualShield = this.currentShield - oldShield;
    
    if (actualShield > 0) {
        this.app.fire('effect:shieldRecharge', this.entity.getPosition());
    }
    
    return actualShield;
};

HealthSystem.prototype.addArmor = function(amount) {
    if (this.isDead) return 0;
    
    const oldArmor = this.currentArmor;
    this.currentArmor = Math.min(this.maxArmor, this.currentArmor + amount);
    return this.currentArmor - oldArmor;
};

HealthSystem.prototype.updateRegeneration = function(dt) {
    const currentTime = this.app.frame;
    
    // Health regeneration
    if (this.currentHealth < this.maxHealth && 
        currentTime - this.lastDamageTime >= this.healthRegenDelay) {
        
        if (!this.isRegenerating) {
            this.isRegenerating = true;
            this.app.fire('effect:healthRegen:start', this.entity);
        }
        
        this.currentHealth = Math.min(this.maxHealth, 
            this.currentHealth + this.healthRegenRate * dt);
    } else if (this.isRegenerating) {
        this.isRegenerating = false;
        this.app.fire('effect:healthRegen:stop', this.entity);
    }
    
    // Shield regeneration
    if (this.currentShield < this.maxShield && 
        currentTime - this.lastShieldDamageTime >= this.shieldRegenDelay) {
        
        if (!this.isShieldRegenerating) {
            this.isShieldRegenerating = true;
            this.app.fire('effect:shieldRegen:start', this.entity);
        }
        
        this.currentShield = Math.min(this.maxShield, 
            this.currentShield + this.shieldRegenRate * dt);
    } else if (this.isShieldRegenerating && this.currentShield >= this.maxShield) {
        this.isShieldRegenerating = false;
        this.app.fire('effect:shieldRegen:stop', this.entity);
    }
};

HealthSystem.prototype.updateStatusEffects = function(dt) {
    for (let i = this.statusEffects.length - 1; i >= 0; i--) {
        const effect = this.statusEffects[i];
        effect.duration -= dt;
        
        // Apply effect
        this.applyStatusEffect(effect, dt);
        
        // Remove expired effects
        if (effect.duration <= 0) {
            this.removeStatusEffect(i);
        }
    }
};

HealthSystem.prototype.updateDamageOverTime = function(dt) {
    for (let i = this.damageOverTime.length - 1; i >= 0; i--) {
        const dot = this.damageOverTime[i];
        dot.timer -= dt;
        
        if (dot.timer <= 0) {
            this.takeDamage(dot.damage, dot.source, dot.type);
            dot.timer = dot.interval;
            dot.duration -= dot.interval;
            
            if (dot.duration <= 0) {
                this.damageOverTime.splice(i, 1);
            }
        }
    }
};

HealthSystem.prototype.addStatusEffect = function(effect) {
    // Check if effect already exists
    const existingIndex = this.statusEffects.findIndex(e => e.type === effect.type);
    
    if (existingIndex >= 0) {
        // Refresh duration or stack effect
        if (effect.stackable) {
            this.statusEffects[existingIndex].intensity += effect.intensity;
        }
        this.statusEffects[existingIndex].duration = Math.max(
            this.statusEffects[existingIndex].duration,
            effect.duration
        );
    } else {
        this.statusEffects.push(effect);
    }
    
    this.app.fire('ui:statusEffect:add', effect);
};

HealthSystem.prototype.applyStatusEffect = function(effect, dt) {
    switch (effect.type) {
        case 'poison':
            // Damage over time handled separately
            break;
        case 'slow':
            // Would modify movement speed - handled by PlayerController
            break;
        case 'regeneration':
            this.heal(effect.intensity * dt, 'regeneration');
            break;
        case 'damage_boost':
            // Would modify damage output - handled by WeaponController
            break;
    }
};

HealthSystem.prototype.removeStatusEffect = function(index) {
    const effect = this.statusEffects[index];
    this.statusEffects.splice(index, 1);
    this.app.fire('ui:statusEffect:remove', effect);
};

HealthSystem.prototype.addDamageOverTime = function(damage, duration, interval, source, type) {
    this.damageOverTime.push({
        damage: damage,
        duration: duration,
        interval: interval,
        timer: interval,
        source: source,
        type: type || 'poison'
    });
};

HealthSystem.prototype.die = function(killer) {
    if (this.isDead) return;
    
    this.isDead = true;
    this.currentHealth = 0;
    
    // Fire death events
    this.app.fire('player:died', {
        entity: this.entity,
        killer: killer
    });
    
    if (killer && killer !== this.entity) {
        this.app.fire('player:kill', {
            killer: killer,
            victim: this.entity
        });
    }
    
    // Death effects
    this.app.fire('effect:death', this.entity.getPosition());
    
    // Disable entity components
    if (this.entity.rigidbody) {
        this.entity.rigidbody.enabled = false;
    }
    
    if (this.entity.collision) {
        this.entity.collision.enabled = false;
    }
    
    // Schedule respawn
    if (this.isPlayer) {
        this.scheduleRespawn();
    }
};

HealthSystem.prototype.scheduleRespawn = function() {
    setTimeout(() => {
        this.respawn();
    }, this.respawnTime * 1000);
};

HealthSystem.prototype.respawn = function() {
    this.reset();
    
    // Re-enable components
    if (this.entity.rigidbody) {
        this.entity.rigidbody.enabled = true;
    }
    
    if (this.entity.collision) {
        this.entity.collision.enabled = true;
    }
    
    // Fire respawn event
    this.app.fire('player:respawned', this.entity);
};

HealthSystem.prototype.reset = function() {
    this.currentHealth = this.maxHealth;
    this.currentShield = this.maxShield;
    this.currentArmor = this.maxArmor;
    this.isDead = false;
    this.isRegenerating = false;
    this.isShieldRegenerating = false;
    this.statusEffects = [];
    this.damageOverTime = [];
    this.lastDamageTime = 0;
    this.lastShieldDamageTime = 0;
};

HealthSystem.prototype.updateUI = function() {
    if (this.isPlayer) {
        this.app.fire('ui:updateHealth', {
            health: this.currentHealth,
            maxHealth: this.maxHealth,
            shield: this.currentShield,
            maxShield: this.maxShield,
            armor: this.currentArmor,
            maxArmor: this.maxArmor,
            isRegenerating: this.isRegenerating,
            isShieldRegenerating: this.isShieldRegenerating
        });
    }
};

HealthSystem.prototype.getHealthPercentage = function() {
    return this.currentHealth / this.maxHealth;
};

HealthSystem.prototype.getShieldPercentage = function() {
    return this.currentShield / this.maxShield;
};

HealthSystem.prototype.getArmorPercentage = function() {
    return this.currentArmor / this.maxArmor;
};

HealthSystem.prototype.isFullHealth = function() {
    return this.currentHealth >= this.maxHealth;
};

HealthSystem.prototype.hasStatusEffect = function(type) {
    return this.statusEffects.some(effect => effect.type === type);
};