var PlayerController = pc.createScript('playerController');

PlayerController.attributes.add('walkSpeed', { type: 'number', default: 5 });
PlayerController.attributes.add('runSpeed', { type: 'number', default: 8 });
PlayerController.attributes.add('crouchSpeed', { type: 'number', default: 2.5 });
PlayerController.attributes.add('jumpPower', { type: 'number', default: 8 });
PlayerController.attributes.add('mouseSensitivity', { type: 'number', default: 0.3 });
PlayerController.attributes.add('cameraPitch', { type: 'entity' });
PlayerController.attributes.add('cameraYaw', { type: 'entity' });

PlayerController.prototype.initialize = function() {
    this.force = new pc.Vec3();
    this.movement = new pc.Vec3();
    this.eulers = new pc.Vec3();
    
    // Input state
    this.isRunning = false;
    this.isCrouching = false;
    this.isGrounded = false;
    this.canJump = true;
    
    // Mouse look
    this.pitch = 0;
    this.yaw = 0;
    
    // Get rigidbody
    this.rigidbody = this.entity.rigidbody;
    
    // Lock cursor for FPS control
    if (this.app.mouse.isPointerLocked()) {
        this.enableMouseLook();
    }
    
    // Bind input events
    this.app.mouse.on(pc.EVENT_MOUSEDOWN, this.onMouseDown, this);
    this.app.mouse.on(pc.EVENT_MOUSEMOVE, this.onMouseMove, this);
    this.app.keyboard.on(pc.EVENT_KEYDOWN, this.onKeyDown, this);
    this.app.keyboard.on(pc.EVENT_KEYUP, this.onKeyUp, this);
    
    // Ground check
    this.groundCheckDistance = 1.1;
    this.groundCheckRay = new pc.Ray();
    
    console.log('PlayerController initialized');
};

PlayerController.prototype.update = function(dt) {
    if (!this.entity.enabled) return;
    
    this.checkGrounded();
    this.handleMovement(dt);
    this.handleJump();
    this.updateAnimations();
};

PlayerController.prototype.onMouseDown = function(event) {
    if (!this.app.mouse.isPointerLocked()) {
        this.app.mouse.enablePointerLock();
    }
};

PlayerController.prototype.onMouseMove = function(event) {
    if (!this.app.mouse.isPointerLocked()) return;
    
    // Update pitch and yaw
    this.pitch -= event.dy * this.mouseSensitivity;
    this.yaw -= event.dx * this.mouseSensitivity;
    
    // Clamp pitch
    this.pitch = pc.math.clamp(this.pitch, -90, 90);
    
    // Apply rotations
    if (this.cameraPitch) {
        this.cameraPitch.setLocalEulerAngles(this.pitch, 0, 0);
    }
    
    if (this.cameraYaw) {
        this.cameraYaw.setLocalEulerAngles(0, this.yaw, 0);
    }
};

PlayerController.prototype.onKeyDown = function(event) {
    switch (event.key) {
        case pc.KEY_SHIFT:
            this.isRunning = true;
            break;
        case pc.KEY_C:
        case pc.KEY_CONTROL:
            this.isCrouching = true;
            break;
        case pc.KEY_SPACE:
            if (this.canJump && this.isGrounded) {
                this.jump();
            }
            break;
    }
};

PlayerController.prototype.onKeyUp = function(event) {
    switch (event.key) {
        case pc.KEY_SHIFT:
            this.isRunning = false;
            break;
        case pc.KEY_C:
        case pc.KEY_CONTROL:
            this.isCrouching = false;
            break;
    }
};

PlayerController.prototype.handleMovement = function(dt) {
    this.movement.set(0, 0, 0);
    
    // Get input
    let x = 0;
    let z = 0;
    
    if (this.app.keyboard.isPressed(pc.KEY_A)) x -= 1;
    if (this.app.keyboard.isPressed(pc.KEY_D)) x += 1;
    if (this.app.keyboard.isPressed(pc.KEY_W)) z -= 1;
    if (this.app.keyboard.isPressed(pc.KEY_S)) z += 1;
    
    // Normalize diagonal movement
    if (x !== 0 && z !== 0) {
        x *= 0.707;
        z *= 0.707;
    }
    
    // Apply movement relative to camera direction
    const forward = this.cameraYaw ? this.cameraYaw.forward : this.entity.forward;
    const right = this.cameraYaw ? this.cameraYaw.right : this.entity.right;
    
    this.movement.add(pc.Vec3.scale(right, x));
    this.movement.add(pc.Vec3.scale(forward, z));
    
    // Determine speed
    let speed = this.walkSpeed;
    if (this.isRunning && !this.isCrouching) {
        speed = this.runSpeed;
    } else if (this.isCrouching) {
        speed = this.crouchSpeed;
    }
    
    // Apply movement
    if (this.movement.length() > 0) {
        this.movement.normalize();
        this.movement.scale(speed);
        
        // Apply force to rigidbody
        this.force.copy(this.movement);
        this.force.y = 0; // Don't affect vertical movement
        
        const currentVel = this.rigidbody.linearVelocity;
        this.force.x = (this.force.x - currentVel.x) * 10;
        this.force.z = (this.force.z - currentVel.z) * 10;
        
        this.rigidbody.applyForce(this.force);
    } else {
        // Apply friction when not moving
        const currentVel = this.rigidbody.linearVelocity;
        this.force.set(-currentVel.x * 8, 0, -currentVel.z * 8);
        this.rigidbody.applyForce(this.force);
    }
};

PlayerController.prototype.handleJump = function() {
    if (this.app.keyboard.wasPressed(pc.KEY_SPACE) && this.isGrounded && this.canJump) {
        this.jump();
    }
};

PlayerController.prototype.jump = function() {
    if (!this.isGrounded || !this.canJump) return;
    
    this.rigidbody.applyImpulse(0, this.jumpPower, 0);
    this.isGrounded = false;
    this.canJump = false;
    
    // Prevent multiple jumps
    setTimeout(() => {
        this.canJump = true;
    }, 200);
    
    // Fire jump event
    this.app.fire('player:jumped', this.entity);
};

PlayerController.prototype.checkGrounded = function() {
    const pos = this.entity.getPosition();
    this.groundCheckRay.set(pos, pc.Vec3.DOWN);
    
    const result = this.app.systems.rigidbody.raycastFirst(this.groundCheckRay.origin, this.groundCheckRay.direction, this.groundCheckDistance);
    
    this.isGrounded = result && result.entity !== this.entity;
};

PlayerController.prototype.updateAnimations = function() {
    const anim = this.entity.anim;
    if (!anim) return;
    
    const velocity = this.rigidbody.linearVelocity;
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
    
    // Set animation parameters
    if (this.isCrouching) {
        anim.setTrigger('crouch');
    } else if (speed > 0.1) {
        if (this.isRunning) {
            anim.setTrigger('run');
        } else {
            anim.setTrigger('walk');
        }
    } else {
        anim.setTrigger('idle');
    }
    
    if (!this.isGrounded) {
        anim.setTrigger('jump');
    }
};

PlayerController.prototype.getMovementState = function() {
    return {
        isRunning: this.isRunning,
        isCrouching: this.isCrouching,
        isGrounded: this.isGrounded,
        velocity: this.rigidbody.linearVelocity.clone()
    };
};

PlayerController.prototype.setEnabled = function(enabled) {
    this.entity.enabled = enabled;
    
    if (!enabled && this.app.mouse.isPointerLocked()) {
        this.app.mouse.disablePointerLock();
    }
};

PlayerController.prototype.enableMouseLook = function() {
    this.app.mouse.enablePointerLock();
};

PlayerController.prototype.disableMouseLook = function() {
    this.app.mouse.disablePointerLock();
};