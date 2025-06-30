var RecoilSystem = pc.createScript('recoilSystem');

RecoilSystem.attributes.add('recoilPattern', { type: 'json', array: true, schema: [
    { name: 'x', type: 'number', default: 0 },
    { name: 'y', type: 'number', default: 0.1 },
    { name: 'intensity', type: 'number', default: 1.0 }
]});

RecoilSystem.attributes.add('recoilRecoveryRate', { type: 'number', default: 10 });
RecoilSystem.attributes.add('maxRecoilSpread', { type: 'number', default: 5.0 });
RecoilSystem.attributes.add('firstShotMultiplier', { type: 'number', default: 0.8 });
RecoilSystem.attributes.add('aimingReduction', { type: 'number', default: 0.5 });
RecoilSystem.attributes.add('crouchingReduction', { type: 'number', default: 0.7 });
RecoilSystem.attributes.add('movementPenalty', { type: 'number', default: 1.5 });

RecoilSystem.prototype.initialize = function() {
    // Recoil state
    this.currentRecoilIndex = 0;
    this.totalRecoil = new pc.Vec2(0, 0);
    this.recoilVelocity = new pc.Vec2(0, 0);
    this.recoilAccumulation = new pc.Vec2(0, 0);
    
    // Timing
    this.lastShotTime = 0;
    this.shotInterval = 0;
    this.recoilResetTime = 300; // ms
    
    // Player state modifiers
    this.isAiming = false;
    this.isCrouching = false;
    this.isMoving = false;
    this.movementSpeed = 0;
    
    // Camera reference
    this.playerCamera = null;
    this.weaponController = null;
    
    // Recoil smoothing
    this.smoothingFactor = 0.1;
    this.targetRecoil = new pc.Vec2(0, 0);
    
    // Visual recoil (weapon model movement)
    this.visualRecoilAmount = new pc.Vec3(0, 0, 0);
    this.visualRecoilTarget = new pc.Vec3(0, 0, 0);
    this.visualRecoveryRate = 15;
    
    // Advanced recoil patterns
    this.horizontalVariance = 0.3; // Random horizontal spread
    this.recoilCurve = new pc.CurveSet(); // For complex recoil patterns
    
    // Bind events
    this.app.on('weapon:fired', this.onWeaponFired, this);
    this.app.on('weapon:aiming', this.onAiming, this);
    this.app.on('weapon:stopAiming', this.onStopAiming, this);
    this.app.on('player:stanceChanged', this.onStanceChanged, this);
    this.app.on('player:movementChanged', this.onMovementChanged, this);
    
    // Find camera and weapon controller
    this.findComponents();
    
    console.log('RecoilSystem initialized with', this.recoilPattern.length, 'recoil points');
};

RecoilSystem.prototype.findComponents = function() {
    // Find player camera
    this.playerCamera = this.app.root.findByTag('camera')[0];
    if (this.playerCamera && this.playerCamera.script && this.playerCamera.script.playerCamera) {
        this.playerCamera = this.playerCamera.script.playerCamera;
    }
    
    // Find weapon controller (usually on parent or sibling)
    let parent = this.entity.parent;
    while (parent && !this.weaponController) {
        if (parent.script && parent.script.weaponController) {
            this.weaponController = parent.script.weaponController;
            break;
        }
        parent = parent.parent;
    }
};

RecoilSystem.prototype.update = function(dt) {
    this.updateRecoilRecovery(dt);
    this.updateVisualRecoil(dt);
    this.checkRecoilReset(dt);
};

RecoilSystem.prototype.updateRecoilRecovery = function(dt) {
    // Smooth recovery of recoil accumulation
    if (this.recoilAccumulation.length() > 0.01) {
        const recoveryRate = this.recoilRecoveryRate * dt;
        this.recoilAccumulation.lerp(pc.Vec2.ZERO, recoveryRate);
        
        // Apply recovered recoil to camera
        this.applyRecoilToCamera(-this.recoilVelocity.x * recoveryRate, -this.recoilVelocity.y * recoveryRate);
        this.recoilVelocity.lerp(pc.Vec2.ZERO, recoveryRate);
    }
};

RecoilSystem.prototype.updateVisualRecoil = function(dt) {
    // Update weapon visual recoil
    if (this.visualRecoilAmount.length() > 0.001) {
        this.visualRecoilAmount.lerp(pc.Vec3.ZERO, this.visualRecoveryRate * dt);
        this.applyVisualRecoilToWeapon();
    }
};

RecoilSystem.prototype.checkRecoilReset = function(dt) {
    const currentTime = Date.now();
    
    // Reset recoil pattern if enough time has passed since last shot
    if (currentTime - this.lastShotTime > this.recoilResetTime) {
        this.currentRecoilIndex = 0;
    }
};

RecoilSystem.prototype.onWeaponFired = function(weaponData) {
    // Only apply recoil for weapons attached to this system
    if (this.weaponController && weaponData.entity !== this.weaponController.entity) return;
    
    this.lastShotTime = Date.now();
    
    // Calculate recoil based on current shot in pattern
    const recoilData = this.calculateRecoil(weaponData);
    
    // Apply recoil
    this.applyRecoil(recoilData);
    
    // Advance recoil pattern
    this.advanceRecoilPattern();
};

RecoilSystem.prototype.calculateRecoil = function(weaponData) {
    let recoilPoint;
    
    // Get recoil pattern point
    if (this.currentRecoilIndex < this.recoilPattern.length) {
        recoilPoint = this.recoilPattern[this.currentRecoilIndex];
    } else {
        // Use last pattern point for sustained fire
        recoilPoint = this.recoilPattern[this.recoilPattern.length - 1];
    }
    
    // Apply weapon-specific multipliers
    let horizontalRecoil = recoilPoint.x * recoilPoint.intensity;
    let verticalRecoil = recoilPoint.y * recoilPoint.intensity;
    
    // Add random horizontal variance
    horizontalRecoil += (Math.random() - 0.5) * this.horizontalVariance;
    
    // Apply first shot accuracy bonus
    if (this.currentRecoilIndex === 0) {
        horizontalRecoil *= this.firstShotMultiplier;
        verticalRecoil *= this.firstShotMultiplier;
    }
    
    // Apply stance modifiers
    const stanceMultiplier = this.getStanceMultiplier();
    horizontalRecoil *= stanceMultiplier;
    verticalRecoil *= stanceMultiplier;
    
    // Apply movement penalty
    const movementMultiplier = this.getMovementMultiplier();
    horizontalRecoil *= movementMultiplier;
    verticalRecoil *= movementMultiplier;
    
    // Apply weapon-specific modifiers
    if (weaponData.recoilMultiplier) {
        horizontalRecoil *= weaponData.recoilMultiplier;
        verticalRecoil *= weaponData.recoilMultiplier;
    }
    
    return {
        horizontal: horizontalRecoil,
        vertical: verticalRecoil,
        weaponType: weaponData.type
    };
};

RecoilSystem.prototype.getStanceMultiplier = function() {
    if (this.isAiming) return this.aimingReduction;
    if (this.isCrouching) return this.crouchingReduction;
    return 1.0;
};

RecoilSystem.prototype.getMovementMultiplier = function() {
    if (this.isMoving) {
        // Scale penalty based on movement speed
        const speedFactor = Math.min(this.movementSpeed / 10, 1.0);
        return 1.0 + (this.movementPenalty - 1.0) * speedFactor;
    }
    return 1.0;
};

RecoilSystem.prototype.applyRecoil = function(recoilData) {
    // Apply camera recoil
    this.applyRecoilToCamera(recoilData.horizontal, recoilData.vertical);
    
    // Apply visual weapon recoil
    this.applyVisualRecoil(recoilData);
    
    // Update accumulation for recovery
    this.recoilAccumulation.x += Math.abs(recoilData.horizontal);
    this.recoilAccumulation.y += Math.abs(recoilData.vertical);
    
    // Update velocity for smooth recovery
    this.recoilVelocity.x = recoilData.horizontal;
    this.recoilVelocity.y = recoilData.vertical;
    
    // Clamp maximum spread
    this.recoilAccumulation.x = Math.min(this.recoilAccumulation.x, this.maxRecoilSpread);
    this.recoilAccumulation.y = Math.min(this.recoilAccumulation.y, this.maxRecoilSpread);
};

RecoilSystem.prototype.applyRecoilToCamera = function(horizontal, vertical) {
    if (!this.playerCamera) return;
    
    // Apply recoil to camera rotation
    if (this.playerCamera.addRecoil) {
        this.playerCamera.addRecoil(horizontal, vertical);
    } else if (this.playerCamera.entity && this.playerCamera.entity.script && this.playerCamera.entity.script.playerController) {
        // Fallback to player controller
        const controller = this.playerCamera.entity.script.playerController;
        controller.pitch += vertical;
        controller.yaw += horizontal;
        
        // Clamp pitch
        controller.pitch = pc.math.clamp(controller.pitch, -90, 90);
    }
};

RecoilSystem.prototype.applyVisualRecoil = function(recoilData) {
    // Calculate visual recoil for weapon model
    const visualIntensity = 0.5; // Scale down visual recoil
    
    this.visualRecoilTarget.x = -recoilData.horizontal * visualIntensity;
    this.visualRecoilTarget.y = -recoilData.vertical * visualIntensity * 0.5;
    this.visualRecoilTarget.z = Math.abs(recoilData.vertical) * visualIntensity * 0.3; // Weapon kickback
    
    // Add to current visual recoil
    this.visualRecoilAmount.add(this.visualRecoilTarget);
    
    // Clamp visual recoil
    this.visualRecoilAmount.x = pc.math.clamp(this.visualRecoilAmount.x, -2, 2);
    this.visualRecoilAmount.y = pc.math.clamp(this.visualRecoilAmount.y, -1, 1);
    this.visualRecoilAmount.z = pc.math.clamp(this.visualRecoilAmount.z, -0.5, 0.5);
};

RecoilSystem.prototype.applyVisualRecoilToWeapon = function() {
    // Apply visual recoil to weapon model
    const currentRotation = this.entity.getLocalEulerAngles();
    const targetRotation = new pc.Vec3(
        currentRotation.x + this.visualRecoilAmount.y * 10, // Pitch
        currentRotation.y + this.visualRecoilAmount.x * 5,  // Yaw
        currentRotation.z // Roll stays the same
    );
    
    this.entity.setLocalEulerAngles(targetRotation);
    
    // Apply position offset for kickback
    const currentPosition = this.entity.getLocalPosition();
    const targetPosition = new pc.Vec3(
        currentPosition.x,
        currentPosition.y,
        currentPosition.z + this.visualRecoilAmount.z
    );
    
    this.entity.setLocalPosition(targetPosition);
};

RecoilSystem.prototype.advanceRecoilPattern = function() {
    this.currentRecoilIndex++;
    
    // Don't exceed pattern length for cycling
    if (this.currentRecoilIndex >= this.recoilPattern.length) {
        this.currentRecoilIndex = this.recoilPattern.length - 1;
    }
};

RecoilSystem.prototype.onAiming = function(weaponData) {
    this.isAiming = true;
};

RecoilSystem.prototype.onStopAiming = function() {
    this.isAiming = false;
};

RecoilSystem.prototype.onStanceChanged = function(data) {
    this.isCrouching = data.isCrouching || false;
};

RecoilSystem.prototype.onMovementChanged = function(data) {
    this.isMoving = data.isMoving || false;
    this.movementSpeed = data.speed || 0;
};

RecoilSystem.prototype.resetRecoil = function() {
    this.currentRecoilIndex = 0;
    this.recoilAccumulation.set(0, 0);
    this.recoilVelocity.set(0, 0);
    this.visualRecoilAmount.set(0, 0, 0);
};

RecoilSystem.prototype.setRecoilPattern = function(pattern) {
    this.recoilPattern = pattern;
    this.resetRecoil();
};

RecoilSystem.prototype.getRecoilMultiplier = function() {
    // Return current recoil intensity for crosshair expansion
    const baseSpread = this.recoilAccumulation.length();
    const stanceMultiplier = this.getStanceMultiplier();
    const movementMultiplier = this.getMovementMultiplier();
    
    return baseSpread * stanceMultiplier * movementMultiplier;
};

RecoilSystem.prototype.getRecoilStats = function() {
    return {
        currentIndex: this.currentRecoilIndex,
        accumulation: this.recoilAccumulation.length(),
        velocity: this.recoilVelocity.length(),
        visualRecoil: this.visualRecoilAmount.length(),
        stanceMultiplier: this.getStanceMultiplier(),
        movementMultiplier: this.getMovementMultiplier()
    };
};