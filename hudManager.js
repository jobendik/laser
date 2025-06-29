var HUDManager = pc.createScript('hudManager');

HUDManager.attributes.add('crosshairEntity', { type: 'entity' });
HUDManager.attributes.add('healthBarEntity', { type: 'entity' });
HUDManager.attributes.add('shieldBarEntity', { type: 'entity' });
HUDManager.attributes.add('armorBarEntity', { type: 'entity' });
HUDManager.attributes.add('ammoCountEntity', { type: 'entity' });
HUDManager.attributes.add('reserveAmmoEntity', { type: 'entity' });
HUDManager.attributes.add('weaponNameEntity', { type: 'entity' });
HUDManager.attributes.add('killFeedEntity', { type: 'entity' });
HUDManager.attributes.add('minimapEntity', { type: 'entity' });
HUDManager.attributes.add('scoreboardEntity', { type: 'entity' });

HUDManager.prototype.initialize = function() {
    // HUD state
    this.isHUDVisible = true;
    this.isScoreboardVisible = false;
    this.currentWeapon = null;
    
    // Health/Shield values
    this.currentHealth = 100;
    this.maxHealth = 100;
    this.currentShield = 50;
    this.maxShield = 50;
    this.currentArmor = 100;
    this.maxArmor = 100;
    
    // Ammo values
    this.currentAmmo = 30;
    this.reserveAmmo = 180;
    this.isReloading = false;
    
    // Kill feed
    this.killFeedMessages = [];
    this.maxKillFeedMessages = 5;
    this.killFeedTimeout = 8000; // 8 seconds
    
    // Damage numbers
    this.damageNumbers = [];
    
    // Hit markers
    this.hitMarkers = [];
    this.hitMarkerDuration = 500; // ms
    
    // Match info
    this.matchTime = 0;
    this.blueScore = 0;
    this.redScore = 0;
    
    // Crosshair state
    this.crosshairSpread = 0;
    this.baseCrosshairSize = 10;
    this.maxCrosshairSpread = 30;
    
    // Bind HUD events
    this.app.on('ui:updateHealth', this.updateHealthDisplay, this);
    this.app.on('ui:updateAmmo', this.updateAmmoDisplay, this);
    this.app.on('ui:updateWeapon', this.updateWeaponDisplay, this);
    this.app.on('ui:updateKillFeed', this.addKillFeedMessage, this);
    this.app.on('ui:updateMatchTime', this.updateMatchTime, this);
    this.app.on('ui:updateScores', this.updateScores, this);
    this.app.on('ui:showDamageNumber', this.showDamageNumber, this);
    this.app.on('ui:showHitMarker', this.showHitMarker, this);
    this.app.on('ui:flashEffect', this.flashEffect, this);
    this.app.on('ui:showGameHUD', this.showHUD, this);
    this.app.on('ui:hideGameHUD', this.hideHUD, this);
    this.app.on('ui:toggleScoreboard', this.toggleScoreboard, this);
    this.app.on('weapon:fired', this.onWeaponFired, this);
    this.app.on('weapon:aiming', this.onWeaponAiming, this);
    this.app.on('weapon:stopAiming', this.onStopAiming, this);
    
    // Keyboard input for scoreboard
    this.app.keyboard.on(pc.EVENT_KEYDOWN, this.onKeyDown, this);
    this.app.keyboard.on(pc.EVENT_KEYUP, this.onKeyUp, this);
    
    // Initialize UI elements
    this.initializeHUD();
    
    console.log('HUDManager initialized');
};

HUDManager.prototype.update = function(dt) {
    this.updateCrosshair(dt);
    this.updateDamageNumbers(dt);
    this.updateHitMarkers(dt);
    this.updateKillFeed(dt);
    this.updateMatchInfo(dt);
};

HUDManager.prototype.initializeHUD = function() {
    // Set initial values
    this.updateHealthDisplay({
        health: this.currentHealth,
        maxHealth: this.maxHealth,
        shield: this.currentShield,
        maxShield: this.maxShield,
        armor: this.currentArmor,
        maxArmor: this.maxArmor
    });
    
    this.updateAmmoDisplay({
        current: this.currentAmmo,
        reserve: this.reserveAmmo,
        isReloading: this.isReloading
    });
    
    // Initialize crosshair
    this.updateCrosshairAppearance();
};

HUDManager.prototype.onKeyDown = function(event) {
    if (event.key === pc.KEY_TAB) {
        this.showScoreboard();
    }
};

HUDManager.prototype.onKeyUp = function(event) {
    if (event.key === pc.KEY_TAB) {
        this.hideScoreboard();
    }
};

HUDManager.prototype.updateHealthDisplay = function(healthData) {
    this.currentHealth = healthData.health;
    this.maxHealth = healthData.maxHealth;
    this.currentShield = healthData.shield;
    this.maxShield = healthData.maxShield;
    this.currentArmor = healthData.armor;
    this.maxArmor = healthData.maxArmor;
    
    // Update health bar
    if (this.healthBarEntity && this.healthBarEntity.element) {
        const healthPercentage = this.currentHealth / this.maxHealth;
        this.healthBarEntity.element.width = healthPercentage * 200; // Assuming 200px max width
        
        // Change color based on health
        if (healthPercentage > 0.6) {
            this.healthBarEntity.element.color = new pc.Color(0, 1, 0); // Green
        } else if (healthPercentage > 0.3) {
            this.healthBarEntity.element.color = new pc.Color(1, 1, 0); // Yellow
        } else {
            this.healthBarEntity.element.color = new pc.Color(1, 0, 0); // Red
        }
    }
    
    // Update shield bar
    if (this.shieldBarEntity && this.shieldBarEntity.element) {
        const shieldPercentage = this.currentShield / this.maxShield;
        this.shieldBarEntity.element.width = shieldPercentage * 200;
        this.shieldBarEntity.element.color = new pc.Color(0, 0.5, 1); // Blue
    }
    
    // Update armor bar
    if (this.armorBarEntity && this.armorBarEntity.element) {
        const armorPercentage = this.currentArmor / this.maxArmor;
        this.armorBarEntity.element.width = armorPercentage * 200;
        this.armorBarEntity.element.color = new pc.Color(0.7, 0.7, 0.7); // Gray
    }
};

HUDManager.prototype.updateAmmoDisplay = function(ammoData) {
    this.currentAmmo = ammoData.current;
    this.reserveAmmo = ammoData.reserve;
    this.isReloading = ammoData.isReloading;
    
    // Update current ammo display
    if (this.ammoCountEntity && this.ammoCountEntity.element) {
        if (this.isReloading) {
            this.ammoCountEntity.element.text = 'RELOADING...';
            this.ammoCountEntity.element.color = new pc.Color(1, 1, 0); // Yellow
        } else {
            this.ammoCountEntity.element.text = this.currentAmmo.toString();
            
            // Change color based on ammo count
            if (this.currentAmmo <= 5) {
                this.ammoCountEntity.element.color = new pc.Color(1, 0, 0); // Red
            } else if (this.currentAmmo <= 10) {
                this.ammoCountEntity.element.color = new pc.Color(1, 1, 0); // Yellow
            } else {
                this.ammoCountEntity.element.color = new pc.Color(1, 1, 1); // White
            }
        }
    }
    
    // Update reserve ammo display
    if (this.reserveAmmoEntity && this.reserveAmmoEntity.element) {
        this.reserveAmmoEntity.element.text = '/ ' + this.reserveAmmo;
    }
};

HUDManager.prototype.updateWeaponDisplay = function(weaponData) {
    this.currentWeapon = weaponData;
    
    if (this.weaponNameEntity && this.weaponNameEntity.element) {
        this.weaponNameEntity.element.text = weaponData.name;
    }
};

HUDManager.prototype.addKillFeedMessage = function(data) {
    const message = {
        killer: data.killer,
        victim: data.victim,
        weapon: data.weapon || 'Unknown',
        timestamp: Date.now(),
        isHeadshot: data.isHeadshot || false
    };
    
    this.killFeedMessages.unshift(message);
    
    // Limit number of messages
    if (this.killFeedMessages.length > this.maxKillFeedMessages) {
        this.killFeedMessages.pop();
    }
    
    this.updateKillFeedDisplay();
};

HUDManager.prototype.updateKillFeedDisplay = function() {
    if (!this.killFeedEntity) return;
    
    // Clear existing children
    while (this.killFeedEntity.children.length > 0) {
        this.killFeedEntity.children[0].destroy();
    }
    
    // Create new kill feed entries
    this.killFeedMessages.forEach((message, index) => {
        const entry = this.createKillFeedEntry(message, index);
        this.killFeedEntity.addChild(entry);
    });
};

HUDManager.prototype.createKillFeedEntry = function(message, index) {
    const entry = new pc.Entity('KillFeedEntry_' + index);
    
    entry.addComponent('element', {
        type: pc.ELEMENTTYPE_GROUP,
        anchor: [1, 1, 1, 1],
        pivot: [1, 1],
        width: 300,
        height: 30
    });
    
    entry.setLocalPosition(0, -index * 35, 0);
    
    // Killer name
    const killerText = new pc.Entity('KillerText');
    killerText.addComponent('element', {
        type: pc.ELEMENTTYPE_TEXT,
        text: message.killer.name || 'Player',
        fontSize: 16,
        color: new pc.Color(1, 1, 1),
        anchor: [0, 0.5, 0, 0.5],
        pivot: [0, 0.5]
    });
    entry.addChild(killerText);
    
    // Weapon/action
    const actionText = new pc.Entity('ActionText');
    const actionString = message.isHeadshot ? ' [HEADSHOT] ' : ' killed ';
    actionText.addComponent('element', {
        type: pc.ELEMENTTYPE_TEXT,
        text: actionString,
        fontSize: 14,
        color: message.isHeadshot ? new pc.Color(1, 0.5, 0) : new pc.Color(0.7, 0.7, 0.7),
        anchor: [0.4, 0.5, 0.4, 0.5],
        pivot: [0.5, 0.5]
    });
    entry.addChild(actionText);
    
    // Victim name
    const victimText = new pc.Entity('VictimText');
    victimText.addComponent('element', {
        type: pc.ELEMENTTYPE_TEXT,
        text: message.victim.name || 'Player',
        fontSize: 16,
        color: new pc.Color(1, 1, 1),
        anchor: [1, 0.5, 1, 0.5],
        pivot: [1, 0.5]
    });
    entry.addChild(victimText);
    
    return entry;
};

HUDManager.prototype.updateKillFeed = function(dt) {
    const currentTime = Date.now();
    
    // Remove old messages
    this.killFeedMessages = this.killFeedMessages.filter(message => 
        currentTime - message.timestamp < this.killFeedTimeout
    );
    
    // Update display if messages were removed
    if (this.killFeedMessages.length !== this.killFeedEntity.children.length) {
        this.updateKillFeedDisplay();
    }
};

HUDManager.prototype.updateMatchTime = function(time) {
    this.matchTime = time;
    
    // Update match timer display
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const timeString = minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
    
    // Find and update timer element
    const timerElement = this.app.root.findByName('MatchTimer');
    if (timerElement && timerElement.element) {
        timerElement.element.text = timeString;
    }
};

HUDManager.prototype.updateScores = function(scores) {
    this.blueScore = scores.blue;
    this.redScore = scores.red;
    
    // Update score displays
    const blueScoreElement = this.app.root.findByName('BlueScore');
    if (blueScoreElement && blueScoreElement.element) {
        blueScoreElement.element.text = this.blueScore.toString();
    }
    
    const redScoreElement = this.app.root.findByName('RedScore');
    if (redScoreElement && redScoreElement.element) {
        redScoreElement.element.text = this.redScore.toString();
    }
};

HUDManager.prototype.showDamageNumber = function(data) {
    const damageNumber = {
        damage: Math.round(data.damage),
        position: data.position.clone(),
        isHeadshot: data.isHeadshot,
        startTime: Date.now(),
        duration: 2000 // 2 seconds
    };
    
    this.damageNumbers.push(damageNumber);
    this.createDamageNumberElement(damageNumber);
};

HUDManager.prototype.createDamageNumberElement = function(damageNumber) {
    const worldPos = damageNumber.position;
    const camera = this.app.root.findByTag('camera')[0];
    if (!camera) return;
    
    // Convert world position to screen position
    const screenPos = camera.camera.worldToScreen(worldPos);
    
    const element = new pc.Entity('DamageNumber');
    element.addComponent('element', {
        type: pc.ELEMENTTYPE_TEXT,
        text: damageNumber.damage.toString(),
        fontSize: damageNumber.isHeadshot ? 24 : 18,
        color: damageNumber.isHeadshot ? new pc.Color(1, 0.5, 0) : new pc.Color(1, 0, 0),
        anchor: [0.5, 0.5, 0.5, 0.5],
        pivot: [0.5, 0.5]
    });
    
    element.setLocalPosition(screenPos.x - this.app.graphicsDevice.width / 2, 
                           screenPos.y - this.app.graphicsDevice.height / 2, 0);
    
    // Add to UI container
    const uiContainer = this.app.root.findByName('UI_Container');
    if (uiContainer) {
        uiContainer.addChild(element);
    } else {
        this.app.root.addChild(element);
    }
    
    damageNumber.element = element;
};

HUDManager.prototype.updateDamageNumbers = function(dt) {
    const currentTime = Date.now();
    
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
        const damageNumber = this.damageNumbers[i];
        const elapsed = currentTime - damageNumber.startTime;
        const progress = elapsed / damageNumber.duration;
        
        if (progress >= 1) {
            // Remove expired damage number
            if (damageNumber.element) {
                damageNumber.element.destroy();
            }
            this.damageNumbers.splice(i, 1);
        } else {
            // Animate damage number
            if (damageNumber.element) {
                const opacity = 1 - progress;
                const offset = progress * 50; // Move up 50 pixels
                
                damageNumber.element.element.opacity = opacity;
                const currentPos = damageNumber.element.getLocalPosition();
                damageNumber.element.setLocalPosition(currentPos.x, currentPos.y + offset * dt * 60, currentPos.z);
            }
        }
    }
};

HUDManager.prototype.showHitMarker = function(position) {
    const hitMarker = {
        startTime: Date.now(),
        duration: this.hitMarkerDuration
    };
    
    this.hitMarkers.push(hitMarker);
    this.createHitMarkerElement(hitMarker);
};

HUDManager.prototype.createHitMarkerElement = function(hitMarker) {
    // Create simple crosshair hit marker in center of screen
    const element = new pc.Entity('HitMarker');
    element.addComponent('element', {
        type: pc.ELEMENTTYPE_TEXT,
        text: '+',
        fontSize: 32,
        color: new pc.Color(1, 1, 1),
        anchor: [0.5, 0.5, 0.5, 0.5],
        pivot: [0.5, 0.5]
    });
    
    const uiContainer = this.app.root.findByName('UI_Container');
    if (uiContainer) {
        uiContainer.addChild(element);
    } else {
        this.app.root.addChild(element);
    }
    
    hitMarker.element = element;
};

HUDManager.prototype.updateHitMarkers = function(dt) {
    const currentTime = Date.now();
    
    for (let i = this.hitMarkers.length - 1; i >= 0; i--) {
        const hitMarker = this.hitMarkers[i];
        const elapsed = currentTime - hitMarker.startTime;
        
        if (elapsed >= hitMarker.duration) {
            if (hitMarker.element) {
                hitMarker.element.destroy();
            }
            this.hitMarkers.splice(i, 1);
        } else {
            // Fade out hit marker
            if (hitMarker.element) {
                const progress = elapsed / hitMarker.duration;
                hitMarker.element.element.opacity = 1 - progress;
            }
        }
    }
};

HUDManager.prototype.updateCrosshair = function(dt) {
    if (!this.crosshairEntity) return;
    
    // Gradually reduce crosshair spread
    this.crosshairSpread = Math.max(0, this.crosshairSpread - dt * 50);
    this.updateCrosshairAppearance();
};

HUDManager.prototype.updateCrosshairAppearance = function() {
    if (!this.crosshairEntity) return;
    
    const totalSpread = this.baseCrosshairSize + this.crosshairSpread;
    
    // Update crosshair elements (assuming crosshair has child elements for each line)
    this.crosshairEntity.children.forEach((child, index) => {
        if (child.element) {
            // Position crosshair lines based on spread
            switch (index) {
                case 0: // Top
                    child.setLocalPosition(0, totalSpread / 2, 0);
                    break;
                case 1: // Bottom
                    child.setLocalPosition(0, -totalSpread / 2, 0);
                    break;
                case 2: // Left
                    child.setLocalPosition(-totalSpread / 2, 0, 0);
                    break;
                case 3: // Right
                    child.setLocalPosition(totalSpread / 2, 0, 0);
                    break;
            }
        }
    });
};

HUDManager.prototype.onWeaponFired = function(weaponData) {
    // Increase crosshair spread when firing
    this.crosshairSpread = Math.min(this.maxCrosshairSpread, this.crosshairSpread + 5);
};

HUDManager.prototype.onWeaponAiming = function(weaponData) {
    // Hide crosshair when aiming (using scope)
    if (this.crosshairEntity) {
        this.crosshairEntity.enabled = false;
    }
};

HUDManager.prototype.onStopAiming = function() {
    // Show crosshair when not aiming
    if (this.crosshairEntity) {
        this.crosshairEntity.enabled = true;
    }
};

HUDManager.prototype.showHUD = function() {
    this.isHUDVisible = true;
    this.entity.enabled = true;
};

HUDManager.prototype.hideHUD = function() {
    this.isHUDVisible = false;
    this.entity.enabled = false;
};

HUDManager.prototype.showScoreboard = function() {
    if (this.scoreboardEntity) {
        this.scoreboardEntity.enabled = true;
        this.isScoreboardVisible = true;
    }
};

HUDManager.prototype.hideScoreboard = function() {
    if (this.scoreboardEntity) {
        this.scoreboardEntity.enabled = false;
        this.isScoreboardVisible = false;
    }
};

HUDManager.prototype.toggleScoreboard = function() {
    if (this.isScoreboardVisible) {
        this.hideScoreboard();
    } else {
        this.showScoreboard();
    }
};

HUDManager.prototype.flashEffect = function(data) {
    // Create white flash overlay
    const flashEntity = new pc.Entity('FlashEffect');
    flashEntity.addComponent('element', {
        type: pc.ELEMENTTYPE_IMAGE,
        color: new pc.Color(1, 1, 1),
        opacity: data.intensity || 0.5,
        anchor: [0, 0, 1, 1],
        pivot: [0.5, 0.5]
    });
    
    this.app.root.addChild(flashEntity);
    
    // Fade out flash
    const duration = data.duration || 500;
    const startTime = Date.now();
    
    const fadeOut = () => {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / duration;
        
        if (progress >= 1) {
            flashEntity.destroy();
        } else {
            flashEntity.element.opacity = (data.intensity || 0.5) * (1 - progress);
            requestAnimationFrame(fadeOut);
        }
    };
    
    fadeOut();
};

HUDManager.prototype.updateMatchInfo = function(dt) {
    // Update any time-sensitive UI elements
    // This could include updating minimap, compass, objective markers, etc.
};