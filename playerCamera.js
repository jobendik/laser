var PlayerCamera = pc.createScript('playerCamera');

PlayerCamera.attributes.add('fov', { type: 'number', default: 75 });
PlayerCamera.attributes.add('sprintFov', { type: 'number', default: 85 });
PlayerCamera.attributes.add('aimFov', { type: 'number', default: 50 });
PlayerCamera.attributes.add('bobIntensity', { type: 'number', default: 0.02 });
PlayerCamera.attributes.add('bobSpeed', { type: 'number', default: 10 });
PlayerCamera.attributes.add('shakeDecay', { type: 'number', default: 5 });
PlayerCamera.attributes.add('breathingIntensity', { type: 'number', default: 0.005 });

PlayerCamera.prototype.initialize = function() {
    this.camera = this.entity.camera;
    this.baseFov = this.fov;
    this.currentFov = this.fov;
    this.targetFov = this.fov;
    
    // Camera effects
    this.bobOffset = new pc.Vec3();
    this.shakeOffset = new pc.Vec3();
    this.breatheOffset = new pc.Vec3();
    this.basePosition = new pc.Vec3();
    
    // Bob animation
    this.bobTime = 0;
    this.lastBobPosition = new pc.Vec3();
    
    // Screen shake
    this.shakeTime = 0;
    this.shakeIntensity = 0;
    this.shakeDuration = 0;
    
    // Breathing
    this.breatheTime = 0;
    this.isAiming = false;
    
    // Player reference
    this.playerController = null;
    
    // Store initial position
    this.basePosition.copy(this.entity.getLocalPosition());
    
    // Set initial FOV
    this.camera.fov = this.fov;
    
    // Bind events
    this.app.on('camera:shake', this.addShake, this);
    this.app.on('weapon:fired', this.onWeaponFired, this);
    this.app.on('player:damaged', this.onPlayerDamaged, this);
    this.app.on('weapon:aiming', this.onAiming, this);
    this.app.on('weapon:stopAiming', this.onStopAiming, this);
    
    console.log('PlayerCamera initialized');
};

PlayerCamera.prototype.postInitialize = function() {
    // Find player controller in parent hierarchy
    let parent = this.entity.parent;
    while (parent && !this.playerController) {
        if (parent.script && parent.script.playerController) {
            this.playerController = parent.script.playerController;
            break;
        }
        parent = parent.parent;
    }
};

PlayerCamera.prototype.update = function(dt) {
    this.updateFOV(dt);
    this.updateBob(dt);
    this.updateShake(dt);
    this.updateBreathing(dt);
    this.applyEffects();
};

PlayerCamera.prototype.updateFOV = function(dt) {
    // Smoothly interpolate to target FOV
    const fovSpeed = 8;
    this.currentFov = pc.math.lerp(this.currentFov, this.targetFov, dt * fovSpeed);
    this.camera.fov = this.currentFov;
};

PlayerCamera.prototype.updateBob = function(dt) {
    if (!this.playerController) return;
    
    const movementState = this.playerController.getMovementState();
    const velocity = movementState.velocity;
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
    
    if (speed > 0.1 && movementState.isGrounded) {
        // Calculate bob based on movement speed
        let bobMultiplier = 1;
        if (movementState.isRunning) {
            bobMultiplier = 1.5;
            this.targetFov = this.sprintFov;
        } else if (movementState.isCrouching) {
            bobMultiplier = 0.5;
            this.targetFov = this.baseFov;
        } else {
            this.targetFov = this.baseFov;
        }
        
        // Update bob time
        this.bobTime += dt * this.bobSpeed * bobMultiplier;
        
        // Calculate bob offset
        this.bobOffset.x = Math.sin(this.bobTime * 2) * this.bobIntensity * bobMultiplier;
        this.bobOffset.y = Math.abs(Math.sin(this.bobTime)) * this.bobIntensity * bobMultiplier;
        this.bobOffset.z = 0;
    } else {
        // Reduce bobbing when not moving
        this.bobOffset.lerp(pc.Vec3.ZERO, dt * 5);
        
        if (!this.isAiming) {
            this.targetFov = this.baseFov;
        }
    }
};

PlayerCamera.prototype.updateShake = function(dt) {
    if (this.shakeTime > 0) {
        this.shakeTime -= dt;
        
        // Calculate shake intensity (decreases over time)
        const normalizedTime = this.shakeTime / this.shakeDuration;
        const intensity = this.shakeIntensity * normalizedTime;
        
        // Generate random shake offset
        this.shakeOffset.x = (Math.random() - 0.5) * intensity;
        this.shakeOffset.y = (Math.random() - 0.5) * intensity;
        this.shakeOffset.z = (Math.random() - 0.5) * intensity * 0.5;
    } else {
        // Smooth out shake
        this.shakeOffset.lerp(pc.Vec3.ZERO, dt * this.shakeDecay);
    }
};

PlayerCamera.prototype.updateBreathing = function(dt) {
    this.breatheTime += dt;
    
    // Subtle breathing effect
    const breatheIntensity = this.isAiming ? this.breathingIntensity * 2 : this.breathingIntensity;
    this.breatheOffset.y = Math.sin(this.breatheTime * 0.8) * breatheIntensity;
    this.breatheOffset.x = Math.sin(this.breatheTime * 0.6) * breatheIntensity * 0.5;
};

PlayerCamera.prototype.applyEffects = function() {
    // Combine all effects
    const finalPosition = new pc.Vec3();
    finalPosition.copy(this.basePosition);
    finalPosition.add(this.bobOffset);
    finalPosition.add(this.shakeOffset);
    finalPosition.add(this.breatheOffset);
    
    this.entity.setLocalPosition(finalPosition);
};

PlayerCamera.prototype.addShake = function(intensity, duration) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeDuration = duration || 0.5;
    this.shakeTime = this.shakeDuration;
};

PlayerCamera.prototype.onWeaponFired = function(weaponData) {
    // Add camera shake based on weapon type
    let shakeIntensity = 0.02;
    
    switch (weaponData.type) {
        case 'pistol':
            shakeIntensity = 0.015;
            break;
        case 'rifle':
            shakeIntensity = 0.025;
            break;
        case 'sniper':
            shakeIntensity = 0.04;
            break;
        case 'shotgun':
            shakeIntensity = 0.05;
            break;
    }
    
    this.addShake(shakeIntensity, 0.1);
};

PlayerCamera.prototype.onPlayerDamaged = function(damage) {
    // Shake camera when taking damage
    const intensity = Math.min(damage / 100 * 0.1, 0.08);
    this.addShake(intensity, 0.3);
    
    // Brief FOV change
    this.targetFov = this.baseFov - 5;
    setTimeout(() => {
        if (!this.isAiming) {
            this.targetFov = this.baseFov;
        }
    }, 200);
};

PlayerCamera.prototype.onAiming = function(weaponData) {
    this.isAiming = true;
    
    // Set aiming FOV based on weapon scope
    if (weaponData.scope) {
        this.targetFov = weaponData.scope.fov || this.aimFov;
    } else {
        this.targetFov = this.aimFov;
    }
};

PlayerCamera.prototype.onStopAiming = function() {
    this.isAiming = false;
    this.targetFov = this.baseFov;
};

PlayerCamera.prototype.setFOV = function(fov) {
    this.targetFov = fov;
};

PlayerCamera.prototype.resetFOV = function() {
    this.targetFov = this.baseFov;
};

PlayerCamera.prototype.addRecoil = function(horizontal, vertical) {
    // Apply recoil rotation to camera
    const recoilEntity = this.entity.parent; // Assuming parent handles pitch/yaw
    if (recoilEntity && recoilEntity.script && recoilEntity.script.playerController) {
        // Add to existing pitch/yaw
        recoilEntity.script.playerController.pitch += vertical;
        recoilEntity.script.playerController.yaw += horizontal;
        
        // Clamp pitch
        recoilEntity.script.playerController.pitch = pc.math.clamp(
            recoilEntity.script.playerController.pitch, -90, 90
        );
    }
};

PlayerCamera.prototype.flashEffect = function(intensity, duration) {
    // Create flash effect (would typically modify a post-processing effect)
    this.app.fire('ui:flashEffect', { intensity, duration });
};

PlayerCamera.prototype.hitMarker = function(position) {
    // Show hit marker at world position
    this.app.fire('ui:showHitMarker', position);
};