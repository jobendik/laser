var WeaponManager = pc.createScript('weaponManager');

WeaponManager.attributes.add('weaponSlots', { type: 'json', array: true, schema: [
    { name: 'slotName', type: 'string' },
    { name: 'weaponEntity', type: 'entity' },
    { name: 'keyBinding', type: 'number' },
    { name: 'isActive', type: 'boolean', default: false }
]});

WeaponManager.attributes.add('switchTime', { type: 'number', default: 0.5 });
WeaponManager.attributes.add('holsterTime', { type: 'number', default: 0.3 });
WeaponManager.attributes.add('defaultWeaponSlot', { type: 'number', default: 0 });

WeaponManager.prototype.initialize = function() {
    // Weapon state
    this.currentWeaponIndex = -1;
    this.currentWeapon = null;
    this.previousWeaponIndex = -1;
    this.isSwitching = false;
    this.switchStartTime = 0;
    
    // Weapon slots management
    this.weapons = new Map();
    this.activeSlots = [];
    
    // Input handling
    this.mouseWheelDelta = 0;
    this.numberKeyPressed = -1;
    
    // Animation states
    this.isHolstering = false;
    this.isDrawing = false;
    
    // Ammo sharing system
    this.ammoTypes = new Map();
    this.sharedAmmo = {
        'pistol': 120,
        'rifle': 180,
        'sniper': 30,
        'shotgun': 48,
        'smg': 200
    };
    
    // Initialize weapon slots
    this.initializeWeaponSlots();
    
    // Bind input events
    this.app.mouse.on(pc.EVENT_MOUSEWHEEL, this.onMouseWheel, this);
    this.app.keyboard.on(pc.EVENT_KEYDOWN, this.onKeyDown, this);
    
    // Bind weapon events
    this.app.on('weapon:switch', this.switchToWeapon, this);
    this.app.on('weapon:switchNext', this.switchToNextWeapon, this);
    this.app.on('weapon:switchPrevious', this.switchToPreviousWeapon, this);
    this.app.on('weapon:quickSwitch', this.quickSwitchWeapon, this);
    this.app.on('weapon:drop', this.dropCurrentWeapon, this);
    this.app.on('weapon:pickup', this.pickupWeapon, this);
    this.app.on('weapon:reload', this.handleReload, this);
    
    // Start with default weapon
    this.switchToWeapon(this.defaultWeaponSlot);
    
    console.log('WeaponManager initialized with', this.weaponSlots.length, 'slots');
};

WeaponManager.prototype.initializeWeaponSlots = function() {
    this.weaponSlots.forEach((slot, index) => {
        if (slot.weaponEntity) {
            this.weapons.set(index, {
                entity: slot.weaponEntity,
                name: slot.slotName,
                keyBinding: slot.keyBinding,
                controller: slot.weaponEntity.script ? slot.weaponEntity.script.weaponController : null,
                isEquipped: false
            });
            
            // Initially hide all weapons
            slot.weaponEntity.enabled = false;
            
            // Get ammo type for shared ammo system
            if (slot.weaponEntity.script && slot.weaponEntity.script.weaponController) {
                const weaponData = slot.weaponEntity.script.weaponController.weaponData;
                this.ammoTypes.set(index, weaponData.type);
            }
            
            this.activeSlots.push(index);
        }
    });
};

WeaponManager.prototype.update = function(dt) {
    this.handleWeaponSwitching(dt);
    this.updateCurrentWeapon(dt);
    this.handleInputBuffering();
};

WeaponManager.prototype.onMouseWheel = function(event) {
    if (this.isSwitching) return;
    
    this.mouseWheelDelta += event.wheel;
    
    // Switch weapons with mouse wheel
    if (Math.abs(this.mouseWheelDelta) >= 1) {
        if (this.mouseWheelDelta > 0) {
            this.switchToNextWeapon();
        } else {
            this.switchToPreviousWeapon();
        }
        this.mouseWheelDelta = 0;
    }
};

WeaponManager.prototype.onKeyDown = function(event) {
    // Handle number key weapon switching
    if (event.key >= pc.KEY_1 && event.key <= pc.KEY_9) {
        const slotIndex = event.key - pc.KEY_1;
        this.numberKeyPressed = slotIndex;
    }
    
    // Handle special keys
    switch (event.key) {
        case pc.KEY_Q:
            this.quickSwitchWeapon();
            break;
        case pc.KEY_G:
            this.dropCurrentWeapon();
            break;
    }
};

WeaponManager.prototype.handleInputBuffering = function() {
    // Handle buffered number key input
    if (this.numberKeyPressed >= 0) {
        if (this.activeSlots.includes(this.numberKeyPressed)) {
            this.switchToWeapon(this.numberKeyPressed);
        }
        this.numberKeyPressed = -1;
    }
};

WeaponManager.prototype.handleWeaponSwitching = function(dt) {
    if (!this.isSwitching) return;
    
    const switchProgress = (Date.now() - this.switchStartTime) / (this.switchTime * 1000);
    
    if (switchProgress >= 1) {
        // Switch complete
        this.completeSwitching();
    } else if (switchProgress >= 0.5 && this.isHolstering) {
        // Midpoint - switch from holster to draw
        this.startDrawing();
    }
};

WeaponManager.prototype.switchToWeapon = function(slotIndex) {
    if (this.isSwitching || slotIndex === this.currentWeaponIndex || !this.weapons.has(slotIndex)) {
        return false;
    }
    
    this.previousWeaponIndex = this.currentWeaponIndex;
    this.targetWeaponIndex = slotIndex;
    this.isSwitching = true;
    this.isHolstering = true;
    this.isDrawing = false;
    this.switchStartTime = Date.now();
    
    // Start holster animation
    if (this.currentWeapon) {
        this.playWeaponAnimation('holster');
        this.app.fire('weapon:holsterStart', this.currentWeapon);
    } else {
        // No current weapon, skip to drawing
        this.startDrawing();
    }
    
    console.log('Switching to weapon slot:', slotIndex);
    return true;
};

WeaponManager.prototype.startDrawing = function() {
    this.isHolstering = false;
    this.isDrawing = true;
    
    // Hide current weapon
    if (this.currentWeapon) {
        this.currentWeapon.entity.enabled = false;
        this.currentWeapon.isEquipped = false;
    }
    
    // Show new weapon
    const newWeapon = this.weapons.get(this.targetWeaponIndex);
    if (newWeapon) {
        newWeapon.entity.enabled = true;
        newWeapon.isEquipped = true;
        this.currentWeapon = newWeapon;
        this.currentWeaponIndex = this.targetWeaponIndex;
        
        // Start draw animation
        this.playWeaponAnimation('draw');
        this.app.fire('weapon:drawStart', newWeapon);
        
        // Update shared ammo
        this.updateWeaponAmmo(newWeapon);
    }
};

WeaponManager.prototype.completeSwitching = function() {
    this.isSwitching = false;
    this.isHolstering = false;
    this.isDrawing = false;
    
    if (this.currentWeapon) {
        this.playWeaponAnimation('idle');
        this.app.fire('weapon:switchComplete', {
            weapon: this.currentWeapon,
            previousIndex: this.previousWeaponIndex,
            currentIndex: this.currentWeaponIndex
        });
        
        // Update UI
        this.app.fire('ui:updateWeapon', this.getCurrentWeaponData());
    }
};

WeaponManager.prototype.switchToNextWeapon = function() {
    if (this.activeSlots.length === 0) return;
    
    const currentIndex = this.activeSlots.indexOf(this.currentWeaponIndex);
    const nextIndex = (currentIndex + 1) % this.activeSlots.length;
    this.switchToWeapon(this.activeSlots[nextIndex]);
};

WeaponManager.prototype.switchToPreviousWeapon = function() {
    if (this.activeSlots.length === 0) return;
    
    const currentIndex = this.activeSlots.indexOf(this.currentWeaponIndex);
    const prevIndex = (currentIndex - 1 + this.activeSlots.length) % this.activeSlots.length;
    this.switchToWeapon(this.activeSlots[prevIndex]);
};

WeaponManager.prototype.quickSwitchWeapon = function() {
    if (this.previousWeaponIndex >= 0 && this.weapons.has(this.previousWeaponIndex)) {
        this.switchToWeapon(this.previousWeaponIndex);
    }
};

WeaponManager.prototype.updateCurrentWeapon = function(dt) {
    if (!this.currentWeapon || this.isSwitching) return;
    
    // Update weapon controller if available
    if (this.currentWeapon.controller) {
        // The weapon controller handles its own update
        // We just need to sync ammo with shared system
        this.syncSharedAmmo();
    }
};

WeaponManager.prototype.syncSharedAmmo = function() {
    if (!this.currentWeapon || !this.currentWeapon.controller) return;
    
    const weaponController = this.currentWeapon.controller;
    const ammoType = this.ammoTypes.get(this.currentWeaponIndex);
    
    if (ammoType && this.sharedAmmo.hasOwnProperty(ammoType)) {
        // Sync reserve ammo with shared pool
        const totalAmmo = weaponController.currentAmmo + weaponController.reserveAmmo;
        const maxAmmo = weaponController.weaponData.maxAmmo;
        
        // Update shared ammo pool
        this.sharedAmmo[ammoType] = Math.max(0, this.sharedAmmo[ammoType] - (maxAmmo - totalAmmo));
    }
};

WeaponManager.prototype.updateWeaponAmmo = function(weapon) {
    if (!weapon.controller) return;
    
    const weaponController = weapon.controller;
    const ammoType = this.ammoTypes.get(this.currentWeaponIndex);
    
    if (ammoType && this.sharedAmmo.hasOwnProperty(ammoType)) {
        // Set reserve ammo from shared pool
        const currentTotal = weaponController.currentAmmo + weaponController.reserveAmmo;
        const maxAmmo = weaponController.weaponData.maxAmmo;
        const availableSharedAmmo = this.sharedAmmo[ammoType];
        
        const totalAmmo = Math.min(maxAmmo, currentTotal + availableSharedAmmo);
        weaponController.reserveAmmo = totalAmmo - weaponController.currentAmmo;
        
        // Update shared ammo pool
        this.sharedAmmo[ammoType] = Math.max(0, availableSharedAmmo - (totalAmmo - currentTotal));
    }
};

WeaponManager.prototype.handleReload = function() {
    if (!this.currentWeapon || !this.currentWeapon.controller || this.isSwitching) return;
    
    const weaponController = this.currentWeapon.controller;
    const ammoType = this.ammoTypes.get(this.currentWeaponIndex);
    
    if (ammoType && this.sharedAmmo.hasOwnProperty(ammoType)) {
        // Check if we have ammo to reload
        const ammoNeeded = weaponController.weaponData.magazineSize - weaponController.currentAmmo;
        const availableAmmo = Math.min(ammoNeeded, weaponController.reserveAmmo + this.sharedAmmo[ammoType]);
        
        if (availableAmmo > 0) {
            // Perform reload
            weaponController.reload();
            
            // Update shared ammo after reload
            setTimeout(() => {
                this.syncSharedAmmo();
            }, weaponController.weaponData.reloadTime * 1000);
        }
    } else {
        // No ammo sharing, use weapon's built-in reload
        weaponController.reload();
    }
};

WeaponManager.prototype.pickupWeapon = function(weaponData) {
    // Find empty slot or replace current weapon
    let targetSlot = this.findEmptySlot();
    
    if (targetSlot === -1) {
        // No empty slot, replace current weapon
        targetSlot = this.currentWeaponIndex;
        this.dropCurrentWeapon();
    }
    
    // Create weapon entity from data
    const weaponEntity = this.createWeaponFromData(weaponData);
    
    // Add to slot
    this.addWeaponToSlot(targetSlot, weaponEntity, weaponData);
    
    // Switch to new weapon
    this.switchToWeapon(targetSlot);
    
    this.app.fire('weapon:pickedUp', {
        weaponData: weaponData,
        slot: targetSlot
    });
};

WeaponManager.prototype.dropCurrentWeapon = function() {
    if (!this.currentWeapon || this.currentWeaponIndex < 0) return;
    
    const droppedWeapon = this.currentWeapon;
    const droppedSlot = this.currentWeaponIndex;
    
    // Create weapon pickup in world
    this.createWeaponPickup(droppedWeapon);
    
    // Remove from slot
    this.removeWeaponFromSlot(droppedSlot);
    
    // Switch to next available weapon
    const nextSlot = this.findNextAvailableSlot();
    if (nextSlot >= 0) {
        this.switchToWeapon(nextSlot);
    } else {
        this.currentWeapon = null;
        this.currentWeaponIndex = -1;
    }
    
    this.app.fire('weapon:dropped', {
        weapon: droppedWeapon,
        slot: droppedSlot
    });
};

WeaponManager.prototype.createWeaponFromData = function(weaponData) {
    // This would typically instantiate from a weapon template
    const weaponEntity = new pc.Entity(weaponData.name);
    
    // Add weapon components based on data
    weaponEntity.addComponent('script');
    weaponEntity.script.create('weaponController', {
        weaponData: weaponData
    });
    
    // Add to appropriate parent
    const weaponHolder = this.app.root.findByName('Weapon_Holder');
    if (weaponHolder) {
        weaponHolder.addChild(weaponEntity);
    } else {
        this.entity.addChild(weaponEntity);
    }
    
    return weaponEntity;
};

WeaponManager.prototype.createWeaponPickup = function(weapon) {
    const playerPos = this.entity.getPosition();
    const forward = this.entity.forward;
    
    // Create pickup entity
    const pickup = new pc.Entity('WeaponPickup_' + weapon.name);
    pickup.addComponent('model', {
        type: 'box' // Would be actual weapon model
    });
    
    pickup.addComponent('rigidbody', {
        type: 'dynamic',
        mass: 1
    });
    
    pickup.addComponent('collision', {
        type: 'box'
    });
    
    // Position in front of player
    const dropPosition = playerPos.clone().add(forward.scale(2));
    pickup.setPosition(dropPosition);
    
    // Add pickup script
    pickup.addComponent('script');
    pickup.script.create('weaponPickup', {
        weaponData: weapon.controller ? weapon.controller.weaponData : null
    });
    
    this.app.root.addChild(pickup);
    
    // Apply some force
    pickup.rigidbody.applyImpulse(forward.x * 5, 2, forward.z * 5);
};

WeaponManager.prototype.addWeaponToSlot = function(slotIndex, weaponEntity, weaponData) {
    // Remove existing weapon from slot if any
    if (this.weapons.has(slotIndex)) {
        this.removeWeaponFromSlot(slotIndex);
    }
    
    // Add new weapon
    this.weapons.set(slotIndex, {
        entity: weaponEntity,
        name: weaponData.name,
        controller: weaponEntity.script ? weaponEntity.script.weaponController : null,
        isEquipped: false
    });
    
    // Add to active slots if not already there
    if (!this.activeSlots.includes(slotIndex)) {
        this.activeSlots.push(slotIndex);
        this.activeSlots.sort();
    }
    
    // Set ammo type
    this.ammoTypes.set(slotIndex, weaponData.type);
    
    // Initially hide
    weaponEntity.enabled = false;
};

WeaponManager.prototype.removeWeaponFromSlot = function(slotIndex) {
    const weapon = this.weapons.get(slotIndex);
    if (weapon) {
        weapon.entity.destroy();
        this.weapons.delete(slotIndex);
        this.ammoTypes.delete(slotIndex);
        
        const activeIndex = this.activeSlots.indexOf(slotIndex);
        if (activeIndex >= 0) {
            this.activeSlots.splice(activeIndex, 1);
        }
    }
};

WeaponManager.prototype.findEmptySlot = function() {
    for (let i = 0; i < this.weaponSlots.length; i++) {
        if (!this.weapons.has(i)) {
            return i;
        }
    }
    return -1;
};

WeaponManager.prototype.findNextAvailableSlot = function() {
    if (this.activeSlots.length === 0) return -1;
    
    // Find next slot after current
    for (let i = 0; i < this.activeSlots.length; i++) {
        if (this.activeSlots[i] > this.currentWeaponIndex) {
            return this.activeSlots[i];
        }
    }
    
    // Wrap around to first slot
    return this.activeSlots[0];
};

WeaponManager.prototype.playWeaponAnimation = function(animationName) {
    if (this.currentWeapon && this.currentWeapon.entity.anim) {
        this.currentWeapon.entity.anim.setTrigger(animationName);
    }
};

WeaponManager.prototype.getCurrentWeaponData = function() {
    if (!this.currentWeapon || !this.currentWeapon.controller) return null;
    
    return this.currentWeapon.controller.getWeaponData();
};

WeaponManager.prototype.getWeaponInSlot = function(slotIndex) {
    return this.weapons.get(slotIndex) || null;
};

WeaponManager.prototype.hasWeaponInSlot = function(slotIndex) {
    return this.weapons.has(slotIndex);
};

WeaponManager.prototype.getAvailableSlots = function() {
    return this.activeSlots.slice();
};

WeaponManager.prototype.addAmmo = function(ammoType, amount) {
    if (this.sharedAmmo.hasOwnProperty(ammoType)) {
        this.sharedAmmo[ammoType] += amount;
        
        // Update current weapon if it uses this ammo type
        const currentAmmoType = this.ammoTypes.get(this.currentWeaponIndex);
        if (currentAmmoType === ammoType && this.currentWeapon) {
            this.updateWeaponAmmo(this.currentWeapon);
        }
        
        return true;
    }
    return false;
};

WeaponManager.prototype.getAmmoCount = function(ammoType) {
    return this.sharedAmmo[ammoType] || 0;
};

WeaponManager.prototype.canReload = function() {
    if (!this.currentWeapon || !this.currentWeapon.controller) return false;
    
    const weaponController = this.currentWeapon.controller;
    const ammoType = this.ammoTypes.get(this.currentWeaponIndex);
    
    if (ammoType && this.sharedAmmo.hasOwnProperty(ammoType)) {
        return (weaponController.reserveAmmo + this.sharedAmmo[ammoType]) > 0 &&
               weaponController.currentAmmo < weaponController.weaponData.magazineSize;
    }
    
    return weaponController.reserveAmmo > 0 &&
           weaponController.currentAmmo < weaponController.weaponData.magazineSize;
};

WeaponManager.prototype.isCurrentWeapon = function(weaponEntity) {
    return this.currentWeapon && this.currentWeapon.entity === weaponEntity;
};

WeaponManager.prototype.enableWeaponInput = function(enabled) {
    if (this.currentWeapon && this.currentWeapon.controller) {
        this.currentWeapon.controller.canFire = enabled;
    }
};