var WeaponController = pc.createScript('weaponController');

WeaponController.attributes.add('weaponData', { type: 'json', schema: [
    { name: 'name', type: 'string', default: 'Assault Rifle' },
    { name: 'type', type: 'string', default: 'rifle' },
    { name: 'damage', type: 'number', default: 30 },
    { name: 'fireRate', type: 'number', default: 600 }, // rounds per minute
    { name: 'reloadTime', type: 'number', default: 2.5 },
    { name: 'magazineSize', type: 'number', default: 30 },
    { name: 'maxAmmo', type: 'number', default: 180 },
    { name: 'range', type: 'number', default: 100 },
    { name: 'accuracy', type: 'number', default: 0.9 },
    { name: 'recoilPattern', type: 'json', default: [
        { x: 0, y: 0.1 }, { x: -0.05, y: 0.12 }, { x: 0.08, y: 0.15 }
    ]},
    { name: 'fireMode', type: 'string', default: 'auto' }, // semi, burst, auto
    { name: 'burstCount', type: 'number', default: 3 }
]});

WeaponController.attributes.add('muzzleFlash', { type: 'entity' });
WeaponController.attributes.add('shellEjection', { type: 'entity' });
WeaponController.attributes.add('firePoint', { type: 'entity' });
WeaponController.attributes.add('audioSource', { type: 'entity' });

WeaponController.prototype.initialize = function() {
    // Weapon state
    this.currentAmmo = this.weaponData.magazineSize;
    this.reserveAmmo = this.weaponData.maxAmmo - this.weaponData.magazineSize;
    this.isReloading = false;
    this.isFiring = false;
    this.isAiming = false;
    this.canFire = true;
    
    // Firing mechanics
    this.lastFireTime = 0;
    this.fireInterval = 60 / this.weaponData.fireRate; // Convert RPM to seconds
    this.burstFired = 0;
    this.recoilIndex = 0;
    
    // Raycast setup
    this.fireRay = new pc.Ray();
    this.fireRange = this.weaponData.range;
    
    // Input handling
    this.mouseDown = false;
    
    // Bind events
    this.app.mouse.on(pc.EVENT_MOUSEDOWN, this.onMouseDown, this);
    this.app.mouse.on(pc.EVENT_MOUSEUP, this.onMouseUp, this);
    this.app.keyboard.on(pc.EVENT_KEYDOWN, this.onKeyDown, this);
    this.app.on('weapon:reload', this.reload, this);
    
    console.log('WeaponController initialized:', this.weaponData.name);
};

WeaponController.prototype.update = function(dt) {
    if (!this.entity.enabled) return;
    
    this.handleFiring(dt);
    this.updateUI();
};

WeaponController.prototype.onMouseDown = function(event) {
    if (event.button === pc.MOUSEBUTTON_LEFT) {
        this.mouseDown = true;
        this.startFiring();
    } else if (event.button === pc.MOUSEBUTTON_RIGHT) {
        this.startAiming();
    }
};

WeaponController.prototype.onMouseUp = function(event) {
    if (event.button === pc.MOUSEBUTTON_LEFT) {
        this.mouseDown = false;
        this.stopFiring();
    } else if (event.button === pc.MOUSEBUTTON_RIGHT) {
        this.stopAiming();
    }
};

WeaponController.prototype.onKeyDown = function(event) {
    if (event.key === pc.KEY_R) {
        this.reload();
    }
};

WeaponController.prototype.startFiring = function() {
    if (!this.canFire || this.isReloading || this.currentAmmo <= 0) return;
    
    this.isFiring = true;
    this.burstFired = 0;
    
    // Fire immediately for first shot
    this.fire();
};

WeaponController.prototype.stopFiring = function() {
    this.isFiring = false;
    this.burstFired = 0;
};

WeaponController.prototype.handleFiring = function(dt) {
    if (!this.isFiring || !this.canFire || this.isReloading) return;
    
    const currentTime = this.app.frame;
    
    switch (this.weaponData.fireMode) {
        case 'semi':
            // Semi-auto: one shot per click
            this.isFiring = false;
            break;
            
        case 'burst':
            if (this.burstFired < this.weaponData.burstCount && 
                currentTime - this.lastFireTime >= this.fireInterval) {
                this.fire();
            } else if (this.burstFired >= this.weaponData.burstCount) {
                this.isFiring = false;
                this.burstFired = 0;
            }
            break;
            
        case 'auto':
            if (currentTime - this.lastFireTime >= this.fireInterval && this.mouseDown) {
                this.fire();
            }
            break;
    }
};

WeaponController.prototype.fire = function() {
    if (!this.canFire || this.currentAmmo <= 0 || this.isReloading) return;
    
    // Consume ammo
    this.currentAmmo--;
    this.burstFired++;
    this.lastFireTime = this.app.frame;
    
    // Perform raycast
    this.performRaycast();
    
    // Visual effects
    this.showMuzzleFlash();
    this.ejectShell();
    
    // Audio
    this.playFireSound();
    
    // Apply recoil
    this.applyRecoil();
    
    // Camera shake
    this.app.fire('camera:shake', 0.02, 0.1);
    
    // Fire event
    this.app.fire('weapon:fired', this.weaponData);
    
    // Auto reload if empty
    if (this.currentAmmo <= 0) {
        this.stopFiring();
        setTimeout(() => {
            this.reload();
        }, 100);
    }
};

WeaponController.prototype.performRaycast = function() {
    if (!this.firePoint) return;
    
    // Calculate spread based on accuracy and aiming
    let spread = (1 - this.weaponData.accuracy) * 0.1;
    if (this.isAiming) spread *= 0.3;
    
    // Add random spread
    const spreadX = (Math.random() - 0.5) * spread;
    const spreadY = (Math.random() - 0.5) * spread;
    
    // Get fire direction
    const firePos = this.firePoint.getPosition();
    const fireDir = this.firePoint.forward.clone();
    
    // Apply spread
    fireDir.x += spreadX;
    fireDir.y += spreadY;
    fireDir.normalize();
    
    // Perform raycast
    this.fireRay.set(firePos, fireDir);
    const result = this.app.systems.rigidbody.raycastFirst(
        this.fireRay.origin, 
        this.fireRay.direction, 
        this.fireRange
    );
    
    if (result) {
        this.handleHit(result);
    }
    
    // Create tracer effect
    this.createTracer(firePos, result ? result.point : firePos.clone().add(fireDir.scale(this.fireRange)));
};

WeaponController.prototype.handleHit = function(hitResult) {
    const hitEntity = hitResult.entity;
    const hitPoint = hitResult.point;
    const hitNormal = hitResult.normal;
    
    // Calculate damage with distance falloff
    const distance = hitResult.distance;
    const damageFalloff = Math.max(0.3, 1 - (distance / this.fireRange));
    const finalDamage = this.weaponData.damage * damageFalloff;
    
    // Create impact effect
    this.createImpactEffect(hitPoint, hitNormal);
    
    // Handle different entity types
    if (hitEntity.tags.has('player') || hitEntity.tags.has('ai')) {
        this.handleCharacterHit(hitEntity, finalDamage, hitPoint);
    } else {
        this.handleEnvironmentHit(hitEntity, hitPoint, hitNormal);
    }
};

WeaponController.prototype.handleCharacterHit = function(target, damage, hitPoint) {
    // Check for headshot
    if (hitPoint.y > target.getPosition().y + 1.6) {
        damage *= 2; // Headshot multiplier
        this.app.fire('ui:showDamageNumber', { 
            position: hitPoint, 
            damage: damage, 
            isHeadshot: true 
        });
    } else {
        this.app.fire('ui:showDamageNumber', { 
            position: hitPoint, 
            damage: damage, 
            isHeadshot: false 
        });
    }
    
    // Apply damage
    if (target.script && target.script.healthSystem) {
        target.script.healthSystem.takeDamage(damage, this.entity);
    }
    
    // Hit marker
    this.app.fire('ui:showHitMarker', hitPoint);
};

WeaponController.prototype.handleEnvironmentHit = function(target, hitPoint, hitNormal) {
    // Create bullet hole decal
    this.app.fire('decal:create', {
        type: 'bulletHole',
        position: hitPoint,
        normal: hitNormal,
        entity: target
    });
    
    // Ricochet chance
    if (Math.random() < 0.1) {
        this.createRicochet(hitPoint, hitNormal);
    }
};

WeaponController.prototype.reload = function() {
    if (this.isReloading || this.reserveAmmo <= 0 || 
        this.currentAmmo >= this.weaponData.magazineSize) return;
    
    this.isReloading = true;
    this.stopFiring();
    
    // Play reload animation and sound
    this.playReloadSound();
    this.app.fire('weapon:reloadStart', this.weaponData);
    
    // Calculate ammo to reload
    const ammoNeeded = this.weaponData.magazineSize - this.currentAmmo;
    const ammoToReload = Math.min(ammoNeeded, this.reserveAmmo);
    
    setTimeout(() => {
        this.currentAmmo += ammoToReload;
        this.reserveAmmo -= ammoToReload;
        this.isReloading = false;
        
        this.app.fire('weapon:reloadComplete', this.weaponData);
    }, this.weaponData.reloadTime * 1000);
};

WeaponController.prototype.startAiming = function() {
    if (this.isReloading) return;
    
    this.isAiming = true;
    this.app.fire('weapon:aiming', this.weaponData);
};

WeaponController.prototype.stopAiming = function() {
    this.isAiming = false;
    this.app.fire('weapon:stopAiming', this.weaponData);
};

WeaponController.prototype.applyRecoil = function() {
    if (this.recoilIndex >= this.weaponData.recoilPattern.length) {
        this.recoilIndex = this.weaponData.recoilPattern.length - 1;
    }
    
    const recoil = this.weaponData.recoilPattern[this.recoilIndex];
    const recoilMultiplier = this.isAiming ? 0.5 : 1.0;
    
    // Apply recoil to camera
    const camera = this.app.root.findByTag('camera')[0];
    if (camera && camera.script && camera.script.playerCamera) {
        camera.script.playerCamera.addRecoil(
            recoil.x * recoilMultiplier,
            recoil.y * recoilMultiplier
        );
    }
    
    this.recoilIndex++;
    
    // Reset recoil pattern after a delay
    setTimeout(() => {
        if (this.recoilIndex > 0) this.recoilIndex--;
    }, 300);
};

WeaponController.prototype.showMuzzleFlash = function() {
    if (this.muzzleFlash) {
        this.muzzleFlash.enabled = true;
        setTimeout(() => {
            this.muzzleFlash.enabled = false;
        }, 50);
    }
};

WeaponController.prototype.ejectShell = function() {
    if (this.shellEjection) {
        // Create shell casing effect
        this.app.fire('effect:shellEjection', {
            position: this.shellEjection.getPosition(),
            velocity: this.shellEjection.right.clone().scale(3)
        });
    }
};

WeaponController.prototype.createTracer = function(start, end) {
    this.app.fire('effect:tracer', {
        start: start,
        end: end,
        weaponType: this.weaponData.type
    });
};

WeaponController.prototype.createImpactEffect = function(position, normal) {
    this.app.fire('effect:impact', {
        position: position,
        normal: normal,
        weaponType: this.weaponData.type
    });
};

WeaponController.prototype.createRicochet = function(position, normal) {
    this.app.fire('effect:ricochet', {
        position: position,
        normal: normal
    });
};

WeaponController.prototype.playFireSound = function() {
    if (this.audioSource && this.audioSource.sound) {
        this.audioSource.sound.play('fire');
    }
};

WeaponController.prototype.playReloadSound = function() {
    if (this.audioSource && this.audioSource.sound) {
        this.audioSource.sound.play('reload');
    }
};

WeaponController.prototype.updateUI = function() {
    this.app.fire('ui:updateAmmo', {
        current: this.currentAmmo,
        reserve: this.reserveAmmo,
        isReloading: this.isReloading
    });
};

WeaponController.prototype.getWeaponData = function() {
    return {
        name: this.weaponData.name,
        type: this.weaponData.type,
        currentAmmo: this.currentAmmo,
        reserveAmmo: this.reserveAmmo,
        isReloading: this.isReloading,
        isAiming: this.isAiming
    };
};