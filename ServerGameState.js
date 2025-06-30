/**
 * ServerGameState.js
 * 
 * Server-side authoritative game state management system.
 * Handles physics simulation, collision detection, anti-cheat validation,
 * and state synchronization for multiplayer gameplay.
 */

var ServerGameState = pc.createScript('serverGameState');

// Server state properties
ServerGameState.attributes.add('tickRate', {
    type: 'number',
    default: 60,
    description: 'Server simulation tick rate (Hz)'
});

ServerGameState.attributes.add('maxPlayers', {
    type: 'number',
    default: 32,
    description: 'Maximum players per game session'
});

ServerGameState.attributes.add('antiCheatEnabled', {
    type: 'boolean',
    default: true,
    description: 'Enable server-side anti-cheat validation'
});

ServerGameState.attributes.add('physicsEnabled', {
    type: 'boolean',
    default: true,
    description: 'Enable server-side physics simulation'
});

// Initialize server game state
ServerGameState.prototype.initialize = function() {
    // Server state data
    this.gameState = {
        players: new Map(),
        projectiles: new Map(),
        explosions: [],
        pickups: new Map(),
        objectives: new Map(),
        gameMode: null,
        matchTime: 0,
        matchActive: false
    };

    // Physics simulation
    this.physicsWorld = null;
    this.collisionBodies = new Map();
    
    // Network state
    this.lastTickTime = 0;
    this.currentTick = 0;
    this.stateHistory = [];
    this.maxHistorySize = 120; // 2 seconds at 60fps

    // Validation settings
    this.validationConfig = {
        maxMoveSpeed: 10.0,
        maxAcceleration: 50.0,
        maxRotationSpeed: 360.0,
        maxJumpHeight: 3.0,
        weaponFireRates: new Map()
    };

    // Performance monitoring
    this.performanceMetrics = {
        tickTime: 0,
        physicsTime: 0,
        networkTime: 0,
        validationTime: 0
    };

    this.initializePhysics();
    this.setupValidation();
    this.startGameLoop();

    console.log('Server Game State initialized');
};

// Initialize server-side physics
ServerGameState.prototype.initializePhysics = function() {
    if (!this.physicsEnabled) return;

    // Create physics world with server settings
    this.physicsWorld = {
        gravity: new pc.Vec3(0, -9.81, 0),
        timeStep: 1 / this.tickRate,
        bodies: new Map(),
        constraints: new Map()
    };

    console.log('Server physics initialized');
};

// Setup validation parameters
ServerGameState.prototype.setupValidation = function() {
    // Load weapon configurations for validation
    this.validationConfig.weaponFireRates.set('assault_rifle', 600); // RPM
    this.validationConfig.weaponFireRates.set('sniper_rifle', 60);
    this.validationConfig.weaponFireRates.set('pistol', 300);
    this.validationConfig.weaponFireRates.set('shotgun', 150);

    console.log('Validation parameters configured');
};

// Start main game loop
ServerGameState.prototype.startGameLoop = function() {
    this.lastTickTime = Date.now();
    
    // Server tick loop
    setInterval(() => {
        this.tick();
    }, 1000 / this.tickRate);
};

// Main server tick
ServerGameState.prototype.tick = function() {
    var startTime = Date.now();
    var deltaTime = (startTime - this.lastTickTime) / 1000;
    this.lastTickTime = startTime;

    // Update game state
    this.updatePhysics(deltaTime);
    this.updateProjectiles(deltaTime);
    this.updateExplosions(deltaTime);
    this.updatePickups(deltaTime);
    this.updateObjectives(deltaTime);
    
    // Process player inputs
    this.processPlayerInputs(deltaTime);
    
    // Validate game state
    if (this.antiCheatEnabled) {
        this.validateGameState();
    }

    // Store state snapshot
    this.storeStateSnapshot();
    
    // Send state updates to clients
    this.broadcastGameState();
    
    // Update performance metrics
    this.performanceMetrics.tickTime = Date.now() - startTime;
    this.currentTick++;
};

// Update server physics simulation
ServerGameState.prototype.updatePhysics = function(deltaTime) {
    if (!this.physicsWorld) return;

    var physicsStart = Date.now();

    // Update physics bodies
    this.physicsWorld.bodies.forEach((body, id) => {
        // Apply gravity
        body.velocity.add(this.physicsWorld.gravity.clone().scale(deltaTime));
        
        // Update position
        body.position.add(body.velocity.clone().scale(deltaTime));
        
        // Check collisions
        this.checkCollisions(body);
    });

    this.performanceMetrics.physicsTime = Date.now() - physicsStart;
};

// Update projectile simulation
ServerGameState.prototype.updateProjectiles = function(deltaTime) {
    this.gameState.projectiles.forEach((projectile, id) => {
        // Update projectile position
        projectile.position.add(projectile.velocity.clone().scale(deltaTime));
        projectile.lifetime -= deltaTime;

        // Check for hits
        var hit = this.checkProjectileHit(projectile);
        if (hit || projectile.lifetime <= 0) {
            this.destroyProjectile(id, hit);
        }
    });
};

// Check projectile collisions
ServerGameState.prototype.checkProjectileHit = function(projectile) {
    // Raycast for collision detection
    var start = projectile.lastPosition.clone();
    var end = projectile.position.clone();
    var direction = end.clone().sub(start).normalize();
    var distance = start.distance(end);

    // Check player hits
    for (var [playerId, player] of this.gameState.players) {
        if (player.id === projectile.ownerId) continue;
        
        var playerPos = player.position.clone();
        var distToPlayer = start.distance(playerPos);
        
        if (distToPlayer <= distance + 1.0) { // 1m hit radius
            return {
                type: 'player',
                target: player,
                position: playerPos,
                damage: projectile.damage
            };
        }
    }

    // Check environment hits
    // Implementation would use actual collision geometry
    
    return null;
};

// Process player input validation
ServerGameState.prototype.processPlayerInputs = function(deltaTime) {
    var validationStart = Date.now();

    this.gameState.players.forEach((player, id) => {
        if (!player.inputBuffer.length) return;

        // Process buffered inputs
        var input = player.inputBuffer.shift();
        
        // Validate movement
        if (!this.validateMovement(player, input)) {
            this.flagSuspiciousActivity(player.id, 'invalid_movement');
            return;
        }

        // Validate actions
        if (!this.validateActions(player, input)) {
            this.flagSuspiciousActivity(player.id, 'invalid_action');
            return;
        }

        // Apply validated input
        this.applyPlayerInput(player, input, deltaTime);
    });

    this.performanceMetrics.validationTime = Date.now() - validationStart;
};

// Validate player movement
ServerGameState.prototype.validateMovement = function(player, input) {
    // Check movement speed
    var moveVector = input.movement || new pc.Vec3();
    var moveSpeed = moveVector.length();
    
    if (moveSpeed > this.validationConfig.maxMoveSpeed) {
        return false;
    }

    // Check position delta
    var expectedPos = player.position.clone().add(moveVector);
    var actualPos = input.position || player.position;
    var positionDelta = expectedPos.distance(actualPos);
    
    if (positionDelta > 5.0) { // 5m tolerance
        return false;
    }

    // Check for teleportation
    var lastPos = player.lastValidPosition || player.position;
    var timeDelta = input.timestamp - player.lastInputTime;
    var maxDistance = this.validationConfig.maxMoveSpeed * timeDelta;
    
    if (lastPos.distance(actualPos) > maxDistance) {
        return false;
    }

    return true;
};

// Validate player actions
ServerGameState.prototype.validateActions = function(player, input) {
    // Validate weapon firing rate
    if (input.firing && player.weapon) {
        var weaponType = player.weapon.type;
        var maxFireRate = this.validationConfig.weaponFireRates.get(weaponType) || 600;
        var minInterval = 60000 / maxFireRate; // ms between shots
        
        var timeSinceLastShot = input.timestamp - player.lastShotTime;
        if (timeSinceLastShot < minInterval * 0.8) { // 20% tolerance
            return false;
        }
    }

    // Validate ammunition
    if (input.firing && player.ammo <= 0) {
        return false;
    }

    return true;
};

// Apply validated player input
ServerGameState.prototype.applyPlayerInput = function(player, input, deltaTime) {
    // Update player position
    if (input.position) {
        player.lastValidPosition = player.position.clone();
        player.position.copy(input.position);
    }

    // Update player rotation
    if (input.rotation) {
        player.rotation.copy(input.rotation);
    }

    // Handle weapon firing
    if (input.firing && player.weapon && player.ammo > 0) {
        this.createProjectile(player, input);
        player.ammo--;
        player.lastShotTime = input.timestamp;
    }

    // Handle other actions
    if (input.reloading) {
        this.startReload(player);
    }

    player.lastInputTime = input.timestamp;
};

// Create server projectile
ServerGameState.prototype.createProjectile = function(player, input) {
    var projectileId = 'proj_' + this.currentTick + '_' + player.id;
    
    var projectile = {
        id: projectileId,
        ownerId: player.id,
        position: player.position.clone(),
        lastPosition: player.position.clone(),
        velocity: input.aimDirection.clone().scale(player.weapon.velocity || 300),
        damage: player.weapon.damage || 25,
        lifetime: 5.0,
        timestamp: Date.now()
    };

    this.gameState.projectiles.set(projectileId, projectile);
};

// Destroy projectile and handle impact
ServerGameState.prototype.destroyProjectile = function(projectileId, hit) {
    var projectile = this.gameState.projectiles.get(projectileId);
    if (!projectile) return;

    // Handle hit damage
    if (hit && hit.type === 'player') {
        this.applyDamage(hit.target, projectile.damage, projectile.ownerId);
    }

    // Create explosion/impact effect
    if (hit) {
        this.gameState.explosions.push({
            position: hit.position,
            type: 'projectile_impact',
            timestamp: Date.now()
        });
    }

    this.gameState.projectiles.delete(projectileId);
};

// Apply damage to player
ServerGameState.prototype.applyDamage = function(player, damage, attackerId) {
    player.health -= damage;
    
    if (player.health <= 0) {
        this.killPlayer(player, attackerId);
    }

    // Broadcast damage event
    this.broadcastEvent('player_damage', {
        playerId: player.id,
        damage: damage,
        attackerId: attackerId,
        health: player.health
    });
};

// Handle player death
ServerGameState.prototype.killPlayer = function(player, killerId) {
    player.alive = false;
    player.deathTime = Date.now();

    // Update scores
    if (killerId && killerId !== player.id) {
        var killer = this.gameState.players.get(killerId);
        if (killer) {
            killer.kills++;
        }
    }
    player.deaths++;

    // Broadcast kill event
    this.broadcastEvent('player_killed', {
        playerId: player.id,
        killerId: killerId,
        position: player.position
    });
};

// Store state snapshot for rollback
ServerGameState.prototype.storeStateSnapshot = function() {
    var snapshot = {
        tick: this.currentTick,
        timestamp: Date.now(),
        players: new Map(),
        projectiles: new Map()
    };

    // Copy player states
    this.gameState.players.forEach((player, id) => {
        snapshot.players.set(id, {
            position: player.position.clone(),
            rotation: player.rotation.clone(),
            health: player.health,
            ammo: player.ammo
        });
    });

    // Copy projectile states
    this.gameState.projectiles.forEach((projectile, id) => {
        snapshot.projectiles.set(id, {
            position: projectile.position.clone(),
            velocity: projectile.velocity.clone(),
            lifetime: projectile.lifetime
        });
    });

    this.stateHistory.push(snapshot);

    // Limit history size
    if (this.stateHistory.length > this.maxHistorySize) {
        this.stateHistory.shift();
    }
};

// Validate entire game state for cheating
ServerGameState.prototype.validateGameState = function() {
    // Check for impossible player states
    this.gameState.players.forEach((player, id) => {
        // Check health bounds
        if (player.health < 0 || player.health > 100) {
            this.flagSuspiciousActivity(id, 'invalid_health');
        }

        // Check position bounds
        if (Math.abs(player.position.y) > 1000) {
            this.flagSuspiciousActivity(id, 'out_of_bounds');
        }
    });
};

// Flag suspicious player activity
ServerGameState.prototype.flagSuspiciousActivity = function(playerId, reason) {
    console.warn(`Suspicious activity detected for player ${playerId}: ${reason}`);
    
    // Log incident for review
    this.app.fire('security:incident', {
        playerId: playerId,
        reason: reason,
        timestamp: Date.now(),
        gameState: this.getPlayerState(playerId)
    });
};

// Broadcast game state to clients
ServerGameState.prototype.broadcastGameState = function() {
    var networkStart = Date.now();

    var stateUpdate = {
        tick: this.currentTick,
        timestamp: Date.now(),
        players: {},
        projectiles: {},
        events: []
    };

    // Serialize player states
    this.gameState.players.forEach((player, id) => {
        stateUpdate.players[id] = {
            position: player.position,
            rotation: player.rotation,
            health: player.health,
            alive: player.alive
        };
    });

    // Serialize projectile states
    this.gameState.projectiles.forEach((projectile, id) => {
        stateUpdate.projectiles[id] = {
            position: projectile.position,
            velocity: projectile.velocity
        };
    });

    // Send to network manager
    this.app.fire('network:broadcast', stateUpdate);

    this.performanceMetrics.networkTime = Date.now() - networkStart;
};

// Get player state for specific player
ServerGameState.prototype.getPlayerState = function(playerId) {
    var player = this.gameState.players.get(playerId);
    if (!player) return null;

    return {
        id: playerId,
        position: player.position.clone(),
        rotation: player.rotation.clone(),
        health: player.health,
        ammo: player.ammo,
        weapon: player.weapon
    };
};

// Broadcast game event
ServerGameState.prototype.broadcastEvent = function(eventType, data) {
    this.app.fire('network:event', {
        type: eventType,
        data: data,
        timestamp: Date.now()
    });
};

// Add new player to game
ServerGameState.prototype.addPlayer = function(playerId, playerData) {
    var player = {
        id: playerId,
        position: new pc.Vec3(0, 0, 0),
        rotation: new pc.Vec3(0, 0, 0),
        lastValidPosition: new pc.Vec3(0, 0, 0),
        health: 100,
        ammo: 30,
        weapon: { type: 'assault_rifle', damage: 25, velocity: 300 },
        alive: true,
        kills: 0,
        deaths: 0,
        inputBuffer: [],
        lastInputTime: 0,
        lastShotTime: 0
    };

    this.gameState.players.set(playerId, player);
    console.log(`Player ${playerId} added to game state`);
};

// Remove player from game
ServerGameState.prototype.removePlayer = function(playerId) {
    this.gameState.players.delete(playerId);
    console.log(`Player ${playerId} removed from game state`);
};

// Get performance metrics
ServerGameState.prototype.getPerformanceMetrics = function() {
    return {
        tickRate: this.tickRate,
        currentTick: this.currentTick,
        playerCount: this.gameState.players.size,
        projectileCount: this.gameState.projectiles.size,
        metrics: this.performanceMetrics
    };
};
