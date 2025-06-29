var AIController = pc.createScript('aiController');

AIController.attributes.add('aiType', {
    type: 'string',
    enum: [
        { 'Soldier': 'soldier' },
        { 'Elite': 'elite' },
        { 'Sniper': 'sniper' },
        { 'Heavy': 'heavy' }
    ],
    default: 'soldier'
});

AIController.attributes.add('team', { type: 'string', default: 'red' });
AIController.attributes.add('aggroRange', { type: 'number', default: 20 });
AIController.attributes.add('attackRange', { type: 'number', default: 15 });
AIController.attributes.add('patrolRadius', { type: 'number', default: 10 });
AIController.attributes.add('moveSpeed', { type: 'number', default: 3 });
AIController.attributes.add('runSpeed', { type: 'number', default: 6 });
AIController.attributes.add('rotationSpeed', { type: 'number', default: 90 });
AIController.attributes.add('accuracy', { type: 'number', default: 0.7 });
AIController.attributes.add('reactionTime', { type: 'number', default: 0.5 });

// AI States
AIController.STATE_IDLE = 0;
AIController.STATE_PATROL = 1;
AIController.STATE_ALERT = 2;
AIController.STATE_COMBAT = 3;
AIController.STATE_SEARCH = 4;
AIController.STATE_RETREAT = 5;
AIController.STATE_DEAD = 6;

AIController.prototype.initialize = function() {
    // AI State
    this.currentState = AIController.STATE_IDLE;
    this.previousState = AIController.STATE_IDLE;
    this.stateTime = 0;
    
    // Target tracking
    this.currentTarget = null;
    this.lastKnownTargetPosition = new pc.Vec3();
    this.lastSeenTime = 0;
    this.hasLineOfSight = false;
    
    // Navigation
    this.patrolPoint = null;
    this.originalPosition = this.entity.getPosition().clone();
    this.destination = new pc.Vec3();
    this.isMoving = false;
    this.stuckTimer = 0;
    this.lastPosition = this.entity.getPosition().clone();
    
    // Combat
    this.lastFireTime = 0;
    this.fireRate = 2; // shots per second
    this.burstCount = 3;
    this.currentBurst = 0;
    this.isFiring = false;
    this.reloadTime = 2;
    this.lastReloadTime = 0;
    this.currentAmmo = 30;
    this.maxAmmo = 30;
    
    // Behavior modifiers
    this.alertLevel = 0; // 0-100
    this.courage = 50; // 0-100, affects retreat behavior
    this.aggressiveness = 50; // 0-100, affects attack behavior
    
    // Squad behavior
    this.squad = null;
    this.squadPosition = 'none'; // leader, follower, flanker
    
    // Detection
    this.visionRange = this.aggroRange;
    this.visionAngle = 120; // degrees
    this.hearingRange = 25;
    
    // Cover system
    this.currentCover = null;
    this.inCover = false;
    this.coverSearchRadius = 15;
    
    // Setup AI type specific values
    this.initializeAIType();
    
    // Get references
    this.healthSystem = this.entity.script.healthSystem;
    this.weaponController = this.entity.script.weaponController;
    
    // Bind events
    this.app.on('ai:targetSpotted', this.onTargetSpotted, this);
    this.app.on('ai:targetLost', this.onTargetLost, this);
    this.app.on('ai:underAttack', this.onUnderAttack, this);
    
    console.log('AIController initialized:', this.aiType, 'Team:', this.team);
};

AIController.prototype.initializeAIType = function() {
    switch (this.aiType) {
        case 'soldier':
            this.accuracy = 0.7;
            this.fireRate = 2;
            this.courage = 60;
            this.aggressiveness = 70;
            break;
        case 'elite':
            this.accuracy = 0.9;
            this.fireRate = 3;
            this.courage = 80;
            this.aggressiveness = 85;
            this.reactionTime = 0.3;
            break;
        case 'sniper':
            this.accuracy = 0.95;
            this.fireRate = 0.5;
            this.courage = 40;
            this.aggressiveness = 60;
            this.visionRange = 40;
            this.attackRange = 35;
            break;
        case 'heavy':
            this.accuracy = 0.6;
            this.fireRate = 4;
            this.courage = 90;
            this.aggressiveness = 95;
            this.moveSpeed = 2;
            this.runSpeed = 4;
            break;
    }
};

AIController.prototype.update = function(dt) {
    if (!this.entity.enabled || this.currentState === AIController.STATE_DEAD) return;
    
    this.stateTime += dt;
    
    // Update AI behavior based on current state
    this.updateBehavior(dt);
    
    // Update detection
    this.updateDetection(dt);
    
    // Update movement
    this.updateMovement(dt);
    
    // Update animations
    this.updateAnimations(dt);
    
    // Check for state transitions
    this.checkStateTransitions(dt);
};

AIController.prototype.updateBehavior = function(dt) {
    switch (this.currentState) {
        case AIController.STATE_IDLE:
            this.behaviorIdle(dt);
            break;
        case AIController.STATE_PATROL:
            this.behaviorPatrol(dt);
            break;
        case AIController.STATE_ALERT:
            this.behaviorAlert(dt);
            break;
        case AIController.STATE_COMBAT:
            this.behaviorCombat(dt);
            break;
        case AIController.STATE_SEARCH:
            this.behaviorSearch(dt);
            break;
        case AIController.STATE_RETREAT:
            this.behaviorRetreat(dt);
            break;
    }
};

AIController.prototype.behaviorIdle = function(dt) {
    // Occasionally look around
    if (this.stateTime > 3 && Math.random() < 0.1) {
        this.lookAround();
    }
    
    // Start patrolling after being idle
    if (this.stateTime > 5) {
        this.changeState(AIController.STATE_PATROL);
    }
};

AIController.prototype.behaviorPatrol = function(dt) {
    if (!this.patrolPoint) {
        this.setNewPatrolPoint();
    }
    
    // Move to patrol point
    this.moveTo(this.patrolPoint);
    
    // Check if reached patrol point
    const distance = this.entity.getPosition().distance(this.patrolPoint);
    if (distance < 2) {
        this.changeState(AIController.STATE_IDLE);
        this.patrolPoint = null;
    }
};

AIController.prototype.behaviorAlert = function(dt) {
    if (this.currentTarget) {
        // Look towards last known position
        this.lookAt(this.lastKnownTargetPosition);
        
        // Try to get line of sight
        if (this.hasLineOfSight) {
            this.changeState(AIController.STATE_COMBAT);
        } else if (this.stateTime > 8) {
            // Lost target for too long, start searching
            this.changeState(AIController.STATE_SEARCH);
        }
    }
};

AIController.prototype.behaviorCombat = function(dt) {
    if (!this.currentTarget) {
        this.changeState(AIController.STATE_SEARCH);
        return;
    }
    
    // Face target
    this.lookAt(this.currentTarget.getPosition());
    
    // Check if should find cover
    if (!this.inCover && this.shouldSeekCover()) {
        this.findAndMoveToCover();
    }
    
    // Attack target
    this.attackTarget(dt);
    
    // Check if should retreat
    if (this.shouldRetreat()) {
        this.changeState(AIController.STATE_RETREAT);
    }
};

AIController.prototype.behaviorSearch = function(dt) {
    // Move to last known target position
    if (this.lastKnownTargetPosition && !this.isMoving) {
        this.moveTo(this.lastKnownTargetPosition);
    }
    
    // Look around for target
    this.lookAround();
    
    // Give up search after a while
    if (this.stateTime > 15) {
        this.changeState(AIController.STATE_PATROL);
        this.currentTarget = null;
    }
};

AIController.prototype.behaviorRetreat = function(dt) {
    // Find retreat position (away from target)
    if (!this.isMoving) {
        const retreatPosition = this.findRetreatPosition();
        this.moveTo(retreatPosition);
    }
    
    // Continue attacking while retreating
    if (this.currentTarget && this.hasLineOfSight) {
        this.attackTarget(dt);
    }
    
    // Stop retreating if health recovered or target lost
    if (this.getHealthPercentage() > 0.5 || !this.currentTarget) {
        this.changeState(AIController.STATE_COMBAT);
    }
};

AIController.prototype.updateDetection = function(dt) {
    // Find potential targets
    const players = this.app.root.findByTag('player');
    const enemies = players.filter(player => {
        const playerTeam = player.tags.has('blue_team') ? 'blue' : 'red';
        return playerTeam !== this.team && !this.isPlayerDead(player);
    });
    
    let bestTarget = null;
    let bestScore = 0;
    
    enemies.forEach(enemy => {
        const score = this.evaluateTarget(enemy);
        if (score > bestScore) {
            bestTarget = enemy;
            bestScore = score;
        }
    });
    
    // Update current target
    if (bestTarget && bestScore > 0.3) {
        if (this.currentTarget !== bestTarget) {
            this.currentTarget = bestTarget;
            this.lastSeenTime = this.app.frame;
            this.app.fire('ai:targetSpotted', { ai: this.entity, target: bestTarget });
        }
        this.lastKnownTargetPosition.copy(bestTarget.getPosition());
    } else if (this.currentTarget) {
        // Lose target if not seen for a while
        if (this.app.frame - this.lastSeenTime > 3) {
            this.app.fire('ai:targetLost', { ai: this.entity, target: this.currentTarget });
            this.currentTarget = null;
        }
    }
};

AIController.prototype.evaluateTarget = function(target) {
    const position = this.entity.getPosition();
    const targetPos = target.getPosition();
    const distance = position.distance(targetPos);
    
    // Too far away
    if (distance > this.visionRange) return 0;
    
    // Check angle
    const forward = this.entity.forward;
    const toTarget = new pc.Vec3().sub2(targetPos, position).normalize();
    const angle = Math.acos(forward.dot(toTarget)) * pc.math.RAD_TO_DEG;
    
    if (angle > this.visionAngle / 2) return 0;
    
    // Check line of sight
    const hasLOS = this.checkLineOfSight(target);
    if (!hasLOS) return 0;
    
    // Calculate score based on distance and threat level
    let score = 1.0 - (distance / this.visionRange);
    
    // Prefer closer targets
    score *= (1.0 - distance / this.visionRange);
    
    // Prefer targets that are facing us (more threatening)
    const targetForward = target.forward || pc.Vec3.FORWARD;
    const targetToUs = new pc.Vec3().sub2(position, targetPos).normalize();
    const targetAngle = Math.acos(targetForward.dot(targetToUs)) * pc.math.RAD_TO_DEG;
    if (targetAngle < 90) score *= 1.2;
    
    return score;
};

AIController.prototype.checkLineOfSight = function(target) {
    const start = this.entity.getPosition().clone();
    start.y += 1.6; // Eye level
    
    const end = target.getPosition().clone();
    end.y += 1.6;
    
    const direction = new pc.Vec3().sub2(end, start).normalize();
    const distance = start.distance(end);
    
    const result = this.app.systems.rigidbody.raycastFirst(start, direction, distance);
    
    // Line of sight is clear if no hit or hit the target
    this.hasLineOfSight = !result || result.entity === target;
    return this.hasLineOfSight;
};

AIController.prototype.attackTarget = function(dt) {
    if (!this.currentTarget || !this.hasLineOfSight) return;
    
    const currentTime = this.app.frame;
    const timeSinceLastShot = currentTime - this.lastFireTime;
    
    // Check if can fire
    if (timeSinceLastShot >= 1 / this.fireRate && this.currentAmmo > 0) {
        this.fireAtTarget();
        this.lastFireTime = currentTime;
        this.currentBurst++;
        
        // Reload if burst complete or out of ammo
        if (this.currentBurst >= this.burstCount || this.currentAmmo <= 0) {
            this.startReload();
            this.currentBurst = 0;
        }
    }
};

AIController.prototype.fireAtTarget = function() {
    if (!this.currentTarget) return;
    
    const targetPos = this.currentTarget.getPosition();
    const myPos = this.entity.getPosition();
    
    // Add some inaccuracy based on AI accuracy
    const spread = (1 - this.accuracy) * 0.2;
    targetPos.x += (Math.random() - 0.5) * spread;
    targetPos.y += (Math.random() - 0.5) * spread;
    targetPos.z += (Math.random() - 0.5) * spread;
    
    // Fire weapon if available
    if (this.weaponController) {
        this.weaponController.fireAtPosition(targetPos);
    } else {
        // Manual raycast for AI without weapon controller
        this.performAIRaycast(targetPos);
    }
    
    this.currentAmmo--;
    
    // Fire event
    this.app.fire('ai:weaponFired', {
        ai: this.entity,
        target: this.currentTarget,
        position: myPos
    });
};

AIController.prototype.performAIRaycast = function(targetPos) {
    const start = this.entity.getPosition().clone();
    start.y += 1.6;
    
    const direction = new pc.Vec3().sub2(targetPos, start).normalize();
    const range = 100;
    
    const result = this.app.systems.rigidbody.raycastFirst(start, direction, range);
    
    if (result) {
        // Check if hit a player
        if (result.entity.tags.has('player')) {
            const damage = 25; // Base AI damage
            
            if (result.entity.script && result.entity.script.healthSystem) {
                result.entity.script.healthSystem.takeDamage(damage, this.entity);
            }
        }
        
        // Create impact effect
        this.app.fire('effect:impact', {
            position: result.point,
            normal: result.normal
        });
    }
};

AIController.prototype.startReload = function() {
    this.lastReloadTime = this.app.frame;
    
    setTimeout(() => {
        this.currentAmmo = this.maxAmmo;
    }, this.reloadTime * 1000);
};

AIController.prototype.moveTo = function(position) {
    this.destination.copy(position);
    this.isMoving = true;
};

AIController.prototype.updateMovement = function(dt) {
    if (!this.isMoving) return;
    
    const currentPos = this.entity.getPosition();
    const distance = currentPos.distance(this.destination);
    
    // Check if reached destination
    if (distance < 1) {
        this.isMoving = false;
        return;
    }
    
    // Calculate movement direction
    const direction = new pc.Vec3().sub2(this.destination, currentPos).normalize();
    
    // Determine speed based on state
    let speed = this.moveSpeed;
    if (this.currentState === AIController.STATE_COMBAT || 
        this.currentState === AIController.STATE_RETREAT) {
        speed = this.runSpeed;
    }
    
    // Apply movement
    const movement = direction.clone().scale(speed * dt);
    this.entity.setPosition(currentPos.add(movement));
    
    // Rotate towards movement direction
    this.lookAt(this.destination);
    
    // Check if stuck
    this.checkIfStuck(dt);
};

AIController.prototype.checkIfStuck = function(dt) {
    const currentPos = this.entity.getPosition();
    const distanceMoved = currentPos.distance(this.lastPosition);
    
    if (distanceMoved < 0.1 * dt) {
        this.stuckTimer += dt;
        
        if (this.stuckTimer > 2) {
            // Try to find alternate path or stop moving
            this.isMoving = false;
            this.stuckTimer = 0;
            
            // Try to find new destination
            if (this.currentState === AIController.STATE_PATROL) {
                this.setNewPatrolPoint();
            }
        }
    } else {
        this.stuckTimer = 0;
    }
    
    this.lastPosition.copy(currentPos);
};

AIController.prototype.lookAt = function(position) {
    const currentPos = this.entity.getPosition();
    const direction = new pc.Vec3().sub2(position, currentPos);
    direction.y = 0; // Keep on horizontal plane
    direction.normalize();
    
    if (direction.length() > 0) {
        const targetRotation = new pc.Quat().setFromMat4(new pc.Mat4().lookAt(pc.Vec3.ZERO, direction, pc.Vec3.UP));
        const currentRotation = this.entity.getRotation();
        
        const slerpedRotation = new pc.Quat().slerp(currentRotation, targetRotation, this.rotationSpeed * 0.016);
        this.entity.setRotation(slerpedRotation);
    }
};

AIController.prototype.lookAround = function() {
    // Rotate to a random direction for searching
    const randomAngle = Math.random() * 360;
    const targetPos = this.entity.getPosition().clone();
    targetPos.x += Math.cos(randomAngle * pc.math.DEG_TO_RAD) * 5;
    targetPos.z += Math.sin(randomAngle * pc.math.DEG_TO_RAD) * 5;
    
    this.lookAt(targetPos);
};

AIController.prototype.setNewPatrolPoint = function() {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * this.patrolRadius + 2;
    
    this.patrolPoint = this.originalPosition.clone();
    this.patrolPoint.x += Math.cos(angle) * distance;
    this.patrolPoint.z += Math.sin(angle) * distance;
};

AIController.prototype.shouldSeekCover = function() {
    return this.getHealthPercentage() < 0.7 && !this.inCover;
};

AIController.prototype.shouldRetreat = function() {
    const healthPercent = this.getHealthPercentage();
    return healthPercent < (1 - this.courage / 100) * 0.5;
};

AIController.prototype.findAndMoveToCover = function() {
    const coverPoints = this.app.root.findByTag('cover_point');
    let bestCover = null;
    let bestScore = 0;
    
    coverPoints.forEach(cover => {
        const score = this.evaluateCoverPoint(cover);
        if (score > bestScore) {
            bestCover = cover;
            bestScore = score;
        }
    });
    
    if (bestCover) {
        this.currentCover = bestCover;
        this.moveTo(bestCover.getPosition());
    }
};

AIController.prototype.evaluateCoverPoint = function(coverPoint) {
    const distance = this.entity.getPosition().distance(coverPoint.getPosition());
    
    // Too far away
    if (distance > this.coverSearchRadius) return 0;
    
    // Prefer closer cover
    let score = 1 - (distance / this.coverSearchRadius);
    
    // Check if cover is between us and target
    if (this.currentTarget) {
        const targetPos = this.currentTarget.getPosition();
        const myPos = this.entity.getPosition();
        const coverPos = coverPoint.getPosition();
        
        // Calculate if cover point provides protection from target
        const toTarget = new pc.Vec3().sub2(targetPos, myPos).normalize();
        const toCover = new pc.Vec3().sub2(coverPos, myPos).normalize();
        
        const angle = Math.acos(toTarget.dot(toCover)) * pc.math.RAD_TO_DEG;
        if (angle < 45) score *= 1.5; // Good cover
    }
    
    return score;
};

AIController.prototype.findRetreatPosition = function() {
    const myPos = this.entity.getPosition();
    const retreatPos = myPos.clone();
    
    if (this.currentTarget) {
        const targetPos = this.currentTarget.getPosition();
        const awayDirection = new pc.Vec3().sub2(myPos, targetPos).normalize();
        retreatPos.add(awayDirection.scale(10));
    } else {
        // Random retreat direction
        const angle = Math.random() * Math.PI * 2;
        retreatPos.x += Math.cos(angle) * 10;
        retreatPos.z += Math.sin(angle) * 10;
    }
    
    return retreatPos;
};

AIController.prototype.checkStateTransitions = function(dt) {
    const previousState = this.currentState;
    
    // Global state transitions
    if (this.healthSystem && this.healthSystem.isDead) {
        this.changeState(AIController.STATE_DEAD);
        return;
    }
    
    // Target-based transitions
    if (this.currentTarget && this.hasLineOfSight) {
        if (this.currentState !== AIController.STATE_COMBAT && 
            this.currentState !== AIController.STATE_RETREAT) {
            this.changeState(AIController.STATE_COMBAT);
        }
    } else if (this.currentTarget && !this.hasLineOfSight) {
        if (this.currentState === AIController.STATE_COMBAT) {
            this.changeState(AIController.STATE_ALERT);
        }
    } else if (!this.currentTarget) {
        if (this.currentState === AIController.STATE_COMBAT || 
            this.currentState === AIController.STATE_ALERT) {
            this.changeState(AIController.STATE_PATROL);
        }
    }
};

AIController.prototype.changeState = function(newState) {
    if (this.currentState === newState) return;
    
    this.previousState = this.currentState;
    this.currentState = newState;
    this.stateTime = 0;
    
    // State entry actions
    this.onStateEnter(newState);
    
    console.log(`AI ${this.entity.name} changed state from ${this.previousState} to ${newState}`);
};

AIController.prototype.onStateEnter = function(state) {
    switch (state) {
        case AIController.STATE_PATROL:
            this.setNewPatrolPoint();
            break;
        case AIController.STATE_COMBAT:
            this.alertLevel = 100;
            break;
        case AIController.STATE_DEAD:
            this.entity.enabled = false;
            break;
    }
};

AIController.prototype.updateAnimations = function(dt) {
    const anim = this.entity.anim;
    if (!anim) return;
    
    // Set animation based on state and movement
    if (this.isMoving) {
        const speed = this.currentState === AIController.STATE_COMBAT ? 'run' : 'walk';
        anim.setTrigger(speed);
    } else {
        anim.setTrigger('idle');
    }
    
    if (this.currentState === AIController.STATE_COMBAT && this.isFiring) {
        anim.setTrigger('fire');
    }
};

AIController.prototype.getHealthPercentage = function() {
    if (this.healthSystem) {
        return this.healthSystem.getHealthPercentage();
    }
    return 1.0;
};

AIController.prototype.isPlayerDead = function(player) {
    return player.script && player.script.healthSystem && player.script.healthSystem.isDead;
};

AIController.prototype.onTargetSpotted = function(data) {
    if (data.ai === this.entity) return;
    
    // Share target information with nearby AI
    const distance = this.entity.getPosition().distance(data.ai.getPosition());
    if (distance < 20) {
        this.currentTarget = data.target;
        this.lastKnownTargetPosition.copy(data.target.getPosition());
        this.changeState(AIController.STATE_ALERT);
    }
};

AIController.prototype.onTargetLost = function(data) {
    if (data.target === this.currentTarget) {
        this.changeState(AIController.STATE_SEARCH);
    }
};

AIController.prototype.onUnderAttack = function(data) {
    if (data.victim === this.entity) {
        this.currentTarget = data.attacker;
        this.lastKnownTargetPosition.copy(data.attacker.getPosition());
        this.changeState(AIController.STATE_COMBAT);
        this.alertLevel = 100;
    }
};