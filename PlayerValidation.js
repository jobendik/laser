/**
 * PlayerValidation.js
 * 
 * Server-side player validation and anti-cheat system.
 * Handles movement validation, action verification, rate limiting,
 * sanity checking, and exploit detection for multiplayer security.
 */

var PlayerValidation = pc.createScript('playerValidation');

// Validation configuration
PlayerValidation.attributes.add('strictMode', {
    type: 'boolean',
    default: true,
    description: 'Enable strict validation checks'
});

PlayerValidation.attributes.add('toleranceLevel', {
    type: 'number',
    default: 0.1,
    description: 'Validation tolerance (0.0 - 1.0)'
});

PlayerValidation.attributes.add('maxViolations', {
    type: 'number',
    default: 5,
    description: 'Max violations before action'
});

// Initialize validation system
PlayerValidation.prototype.initialize = function() {
    // Validation rules
    this.validationRules = {
        movement: {
            maxSpeed: 10.0,           // m/s
            maxAcceleration: 50.0,    // m/s²
            maxJumpHeight: 3.0,       // meters
            maxFallSpeed: 30.0,       // m/s
            teleportThreshold: 20.0   // meters
        },
        rotation: {
            maxAngularVelocity: 720.0, // degrees/second
            snapThreshold: 180.0       // degrees
        },
        combat: {
            minFireInterval: 50,       // milliseconds
            maxFireRate: 1200,         // rounds per minute
            maxDamagePerSecond: 500,   // damage units
            aimSnapThreshold: 90.0     // degrees
        },
        network: {
            maxPacketRate: 120,        // packets per second
            maxInputBuffer: 10,        // buffered inputs
            timestampTolerance: 1000   // milliseconds
        }
    };

    // Player tracking data
    this.playerData = new Map();
    
    // Violation tracking
    this.violations = new Map();
    
    // Rate limiting
    this.rateLimits = new Map();
    
    // Statistical analysis
    this.statistics = {
        totalValidations: 0,
        failedValidations: 0,
        suspiciousActivities: 0,
        falsePositives: 0
    };

    // Setup event listeners
    this.setupEventListeners();
    
    console.log('Player Validation system initialized');
};

// Setup validation event listeners
PlayerValidation.prototype.setupEventListeners = function() {
    // Player input validation
    this.app.on('player:input', this.validatePlayerInput, this);
    
    // Player action validation
    this.app.on('player:action', this.validatePlayerAction, this);
    
    // Player movement validation
    this.app.on('player:movement', this.validatePlayerMovement, this);
    
    // Combat action validation
    this.app.on('player:combat', this.validateCombatAction, this);
    
    // Network packet validation
    this.app.on('network:packet', this.validateNetworkPacket, this);
};

// Validate player input packet
PlayerValidation.prototype.validatePlayerInput = function(playerId, inputData) {
    this.statistics.totalValidations++;
    
    var player = this.getPlayerData(playerId);
    var currentTime = Date.now();
    
    // Basic sanity checks
    if (!this.validateInputSanity(inputData)) {
        this.logViolation(playerId, 'invalid_input_format', inputData);
        return false;
    }

    // Timestamp validation
    if (!this.validateTimestamp(player, inputData.timestamp, currentTime)) {
        this.logViolation(playerId, 'invalid_timestamp', inputData);
        return false;
    }

    // Rate limiting
    if (!this.checkRateLimit(playerId, currentTime)) {
        this.logViolation(playerId, 'rate_limit_exceeded', inputData);
        return false;
    }

    // Movement validation
    if (inputData.movement && !this.validateMovementInput(player, inputData)) {
        this.logViolation(playerId, 'invalid_movement', inputData);
        return false;
    }

    // Rotation validation
    if (inputData.rotation && !this.validateRotationInput(player, inputData)) {
        this.logViolation(playerId, 'invalid_rotation', inputData);
        return false;
    }

    // Update player tracking data
    this.updatePlayerData(playerId, inputData, currentTime);
    
    return true;
};

// Validate input data sanity
PlayerValidation.prototype.validateInputSanity = function(inputData) {
    // Check required fields
    if (!inputData || typeof inputData !== 'object') {
        return false;
    }

    // Validate timestamp
    if (!inputData.timestamp || typeof inputData.timestamp !== 'number') {
        return false;
    }

    // Validate position if present
    if (inputData.position) {
        if (!this.isValidVector3(inputData.position)) {
            return false;
        }
        
        // Check for NaN or infinite values
        if (!this.isFiniteVector3(inputData.position)) {
            return false;
        }
    }

    // Validate rotation if present
    if (inputData.rotation) {
        if (!this.isValidVector3(inputData.rotation)) {
            return false;
        }
        
        if (!this.isFiniteVector3(inputData.rotation)) {
            return false;
        }
    }

    return true;
};

// Validate timestamp
PlayerValidation.prototype.validateTimestamp = function(player, timestamp, currentTime) {
    // Check if timestamp is reasonable
    var timeDiff = Math.abs(currentTime - timestamp);
    
    if (timeDiff > this.validationRules.network.timestampTolerance) {
        return false;
    }

    // Check for time travel (future timestamps)
    if (timestamp > currentTime + 100) { // 100ms tolerance
        return false;
    }

    // Check for very old timestamps
    if (player.lastTimestamp && timestamp < player.lastTimestamp - 1000) {
        return false;
    }

    return true;
};

// Check rate limiting
PlayerValidation.prototype.checkRateLimit = function(playerId, currentTime) {
    var rateData = this.rateLimits.get(playerId);
    
    if (!rateData) {
        rateData = {
            packets: [],
            windowStart: currentTime
        };
        this.rateLimits.set(playerId, rateData);
    }

    // Clean old packets (1 second window)
    var windowSize = 1000;
    rateData.packets = rateData.packets.filter(time => 
        currentTime - time < windowSize
    );

    // Check rate limit
    if (rateData.packets.length >= this.validationRules.network.maxPacketRate) {
        return false;
    }

    // Add current packet
    rateData.packets.push(currentTime);
    
    return true;
};

// Validate movement input
PlayerValidation.prototype.validateMovementInput = function(player, inputData) {
    var movement = inputData.movement;
    var deltaTime = (inputData.timestamp - player.lastTimestamp) / 1000;
    
    if (deltaTime <= 0 || deltaTime > 1.0) {
        return true; // Skip validation for invalid delta time
    }

    // Check movement speed
    var moveSpeed = movement.length();
    if (moveSpeed > this.validationRules.movement.maxSpeed * (1 + this.toleranceLevel)) {
        return false;
    }

    // Check acceleration
    if (player.lastMovement) {
        var acceleration = movement.clone().sub(player.lastMovement).scale(1 / deltaTime);
        var accelMagnitude = acceleration.length();
        
        if (accelMagnitude > this.validationRules.movement.maxAcceleration * (1 + this.toleranceLevel)) {
            return false;
        }
    }

    // Check position change consistency
    if (inputData.position && player.lastPosition) {
        var expectedPos = player.lastPosition.clone().add(movement.clone().scale(deltaTime));
        var actualPos = inputData.position;
        var positionError = expectedPos.distance(actualPos);
        
        var maxError = this.validationRules.movement.maxSpeed * deltaTime * this.toleranceLevel;
        if (positionError > maxError && positionError > 0.5) {
            return false;
        }
    }

    // Check for teleportation
    if (inputData.position && player.lastPosition) {
        var distance = player.lastPosition.distance(inputData.position);
        var maxDistance = this.validationRules.movement.maxSpeed * deltaTime * 2;
        
        if (distance > Math.max(maxDistance, this.validationRules.movement.teleportThreshold)) {
            return false;
        }
    }

    return true;
};

// Validate rotation input
PlayerValidation.prototype.validateRotationInput = function(player, inputData) {
    var rotation = inputData.rotation;
    var deltaTime = (inputData.timestamp - player.lastTimestamp) / 1000;
    
    if (deltaTime <= 0 || deltaTime > 1.0) {
        return true; // Skip validation for invalid delta time
    }

    // Check for instant rotation snapping
    if (player.lastRotation) {
        var rotationDelta = rotation.clone().sub(player.lastRotation);
        
        // Normalize angles
        rotationDelta.x = this.normalizeAngle(rotationDelta.x);
        rotationDelta.y = this.normalizeAngle(rotationDelta.y);
        rotationDelta.z = this.normalizeAngle(rotationDelta.z);
        
        var rotationSpeed = rotationDelta.length() / deltaTime;
        
        if (rotationSpeed > this.validationRules.rotation.maxAngularVelocity * (1 + this.toleranceLevel)) {
            // Check if it's a valid snap turn
            var snapAngle = Math.max(Math.abs(rotationDelta.x), Math.abs(rotationDelta.y));
            if (snapAngle < this.validationRules.rotation.snapThreshold) {
                return false;
            }
        }
    }

    return true;
};

// Validate combat action
PlayerValidation.prototype.validateCombatAction = function(playerId, actionData) {
    var player = this.getPlayerData(playerId);
    var currentTime = Date.now();
    
    // Validate fire rate
    if (actionData.type === 'fire') {
        if (!this.validateFireRate(player, actionData, currentTime)) {
            this.logViolation(playerId, 'invalid_fire_rate', actionData);
            return false;
        }
    }

    // Validate aim consistency
    if (actionData.aimDirection && !this.validateAimConsistency(player, actionData)) {
        this.logViolation(playerId, 'aim_bot_detected', actionData);
        return false;
    }

    // Validate damage output
    if (!this.validateDamageOutput(player, actionData, currentTime)) {
        this.logViolation(playerId, 'excessive_damage', actionData);
        return false;
    }

    return true;
};

// Validate weapon fire rate
PlayerValidation.prototype.validateFireRate = function(player, actionData, currentTime) {
    var weapon = actionData.weapon || player.currentWeapon;
    if (!weapon) return true;

    // Get weapon fire rate limits
    var maxFireRate = weapon.fireRate || this.validationRules.combat.maxFireRate;
    var minInterval = 60000 / maxFireRate; // Convert RPM to ms

    // Check time since last shot
    if (player.lastShotTime) {
        var timeSinceLastShot = currentTime - player.lastShotTime;
        var minAllowedInterval = minInterval * (1 - this.toleranceLevel);
        
        if (timeSinceLastShot < minAllowedInterval) {
            return false;
        }
    }

    // Update last shot time
    player.lastShotTime = currentTime;
    
    return true;
};

// Validate aim consistency for aimbot detection
PlayerValidation.prototype.validateAimConsistency = function(player, actionData) {
    var aimDirection = actionData.aimDirection;
    
    // Check for impossible aim snapping
    if (player.lastAimDirection) {
        var angleDiff = this.getAngleBetweenVectors(player.lastAimDirection, aimDirection);
        
        // Very quick, precise aim changes are suspicious
        if (angleDiff > this.validationRules.combat.aimSnapThreshold) {
            var timeDiff = actionData.timestamp - player.lastAimTime;
            
            // If the aim changed too quickly, it's suspicious
            if (timeDiff < 50) { // 50ms threshold
                return false;
            }
        }
    }

    // Check aim smoothness (human aim should have some jitter)
    if (!this.checkAimHumanLike(player, aimDirection)) {
        return false;
    }

    // Update aim tracking
    player.lastAimDirection = aimDirection.clone();
    player.lastAimTime = actionData.timestamp;
    
    return true;
};

// Check if aim movement appears human-like
PlayerValidation.prototype.checkAimHumanLike = function(player, aimDirection) {
    // Collect recent aim samples
    if (!player.aimHistory) {
        player.aimHistory = [];
    }

    player.aimHistory.push(aimDirection.clone());
    
    // Keep only recent samples
    if (player.aimHistory.length > 10) {
        player.aimHistory.shift();
    }

    // Need enough samples for analysis
    if (player.aimHistory.length < 5) {
        return true;
    }

    // Calculate aim smoothness/jitter
    var totalVariation = 0;
    for (var i = 1; i < player.aimHistory.length; i++) {
        var diff = this.getAngleBetweenVectors(
            player.aimHistory[i-1], 
            player.aimHistory[i]
        );
        totalVariation += diff;
    }

    var averageVariation = totalVariation / (player.aimHistory.length - 1);
    
    // Too little variation indicates bot-like behavior
    if (averageVariation < 0.1) { // Very small threshold
        return false;
    }

    return true;
};

// Validate damage output to prevent damage hacks
PlayerValidation.prototype.validateDamageOutput = function(player, actionData, currentTime) {
    if (!actionData.damage) return true;

    // Track damage over time
    if (!player.damageHistory) {
        player.damageHistory = [];
    }

    // Add current damage
    player.damageHistory.push({
        damage: actionData.damage,
        timestamp: currentTime
    });

    // Clean old damage records (1 second window)
    player.damageHistory = player.damageHistory.filter(record => 
        currentTime - record.timestamp < 1000
    );

    // Calculate damage per second
    var totalDamage = player.damageHistory.reduce((sum, record) => sum + record.damage, 0);
    
    if (totalDamage > this.validationRules.combat.maxDamagePerSecond) {
        return false;
    }

    return true;
};

// Log validation violation
PlayerValidation.prototype.logViolation = function(playerId, violationType, data) {
    this.statistics.failedValidations++;
    
    // Get or create violation record
    var violations = this.violations.get(playerId) || {
        count: 0,
        types: new Map(),
        firstViolation: Date.now(),
        lastViolation: Date.now()
    };

    violations.count++;
    violations.lastViolation = Date.now();
    violations.types.set(violationType, (violations.types.get(violationType) || 0) + 1);
    
    this.violations.set(playerId, violations);

    // Log the violation
    console.warn(`Validation violation for player ${playerId}: ${violationType}`, data);

    // Check if action should be taken
    if (violations.count >= this.maxViolations) {
        this.takeAction(playerId, violations);
    }

    // Fire violation event
    this.app.fire('validation:violation', {
        playerId: playerId,
        type: violationType,
        data: data,
        totalViolations: violations.count
    });
};

// Take action against violating player
PlayerValidation.prototype.takeAction = function(playerId, violations) {
    var severity = this.calculateViolationSeverity(violations);
    
    if (severity >= 0.8) {
        // High severity - immediate ban
        this.app.fire('security:ban', {
            playerId: playerId,
            reason: 'Multiple validation violations',
            violations: violations
        });
    } else if (severity >= 0.5) {
        // Medium severity - temporary ban
        this.app.fire('security:tempban', {
            playerId: playerId,
            duration: 3600000, // 1 hour
            reason: 'Suspicious activity detected',
            violations: violations
        });
    } else {
        // Low severity - warning
        this.app.fire('security:warning', {
            playerId: playerId,
            reason: 'Validation violations detected',
            violations: violations
        });
    }
};

// Calculate violation severity score
PlayerValidation.prototype.calculateViolationSeverity = function(violations) {
    var severityWeights = {
        'aim_bot_detected': 1.0,
        'invalid_fire_rate': 0.8,
        'excessive_damage': 0.9,
        'invalid_movement': 0.6,
        'rate_limit_exceeded': 0.3,
        'invalid_timestamp': 0.4,
        'invalid_rotation': 0.5
    };

    var totalSeverity = 0;
    var totalViolations = 0;

    violations.types.forEach((count, type) => {
        var weight = severityWeights[type] || 0.5;
        totalSeverity += weight * count;
        totalViolations += count;
    });

    return totalViolations > 0 ? totalSeverity / totalViolations : 0;
};

// Get or create player data
PlayerValidation.prototype.getPlayerData = function(playerId) {
    var playerData = this.playerData.get(playerId);
    
    if (!playerData) {
        playerData = {
            id: playerId,
            lastTimestamp: 0,
            lastPosition: null,
            lastRotation: null,
            lastMovement: null,
            lastAimDirection: null,
            lastAimTime: 0,
            lastShotTime: 0,
            aimHistory: [],
            damageHistory: [],
            currentWeapon: null
        };
        this.playerData.set(playerId, playerData);
    }
    
    return playerData;
};

// Update player tracking data
PlayerValidation.prototype.updatePlayerData = function(playerId, inputData, currentTime) {
    var player = this.getPlayerData(playerId);
    
    player.lastTimestamp = inputData.timestamp;
    
    if (inputData.position) {
        player.lastPosition = inputData.position.clone();
    }
    
    if (inputData.rotation) {
        player.lastRotation = inputData.rotation.clone();
    }
    
    if (inputData.movement) {
        player.lastMovement = inputData.movement.clone();
    }
};

// Utility functions
PlayerValidation.prototype.isValidVector3 = function(vec) {
    return vec && typeof vec.x === 'number' && typeof vec.y === 'number' && typeof vec.z === 'number';
};

PlayerValidation.prototype.isFiniteVector3 = function(vec) {
    return isFinite(vec.x) && isFinite(vec.y) && isFinite(vec.z);
};

PlayerValidation.prototype.normalizeAngle = function(angle) {
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    return angle;
};

PlayerValidation.prototype.getAngleBetweenVectors = function(v1, v2) {
    var dot = v1.dot(v2);
    var mag1 = v1.length();
    var mag2 = v2.length();
    
    if (mag1 === 0 || mag2 === 0) return 0;
    
    var cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
    return Math.acos(cosAngle) * pc.math.RAD_TO_DEG;
};

// Get validation statistics
PlayerValidation.prototype.getStatistics = function() {
    return {
        totalValidations: this.statistics.totalValidations,
        failedValidations: this.statistics.failedValidations,
        successRate: this.statistics.totalValidations > 0 ? 
            (this.statistics.totalValidations - this.statistics.failedValidations) / this.statistics.totalValidations : 0,
        activePlayers: this.playerData.size,
        totalViolations: Array.from(this.violations.values()).reduce((sum, v) => sum + v.count, 0)
    };
};

// Clean up disconnected players
PlayerValidation.prototype.cleanupPlayer = function(playerId) {
    this.playerData.delete(playerId);
    this.violations.delete(playerId);
    this.rateLimits.delete(playerId);
};
