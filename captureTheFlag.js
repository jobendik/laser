var CaptureTheFlag = pc.createScript('captureTheFlag');

CaptureTheFlag.attributes.add('captureLimit', { type: 'number', default: 3 });
CaptureTheFlag.attributes.add('timeLimit', { type: 'number', default: 1200 }); // 20 minutes
CaptureTheFlag.attributes.add('flagReturnTime', { type: 'number', default: 30 }); // Auto-return time
CaptureTheFlag.attributes.add('flagCaptureTime', { type: 'number', default: 0 }); // Instant capture
CaptureTheFlag.attributes.add('flagDropTime', { type: 'number', default: 3 }); // Time on ground before return
CaptureTheFlag.attributes.add('blueFlag', { type: 'entity' });
CaptureTheFlag.attributes.add('redFlag', { type: 'entity' });

// Flag states
CaptureTheFlag.FLAG_AT_BASE = 0;
CaptureTheFlag.FLAG_TAKEN = 1;
CaptureTheFlag.FLAG_DROPPED = 2;
CaptureTheFlag.FLAG_RETURNING = 3;

CaptureTheFlag.prototype.initialize = function() {
    // Game state
    this.isActive = false;
    this.isPaused = false;
    this.gameStartTime = 0;
    this.gameEndTime = 0;
    this.timeRemaining = this.timeLimit;
    
    // Team scores (flag captures)
    this.teamScores = {
        blue: 0,
        red: 0
    };
    
    // Flag states
    this.flags = {
        blue: {
            entity: this.blueFlag,
            state: CaptureTheFlag.FLAG_AT_BASE,
            carrier: null,
            basePosition: null,
            dropTime: 0,
            returnTimer: 0
        },
        red: {
            entity: this.redFlag,
            state: CaptureTheFlag.FLAG_AT_BASE,
            carrier: null,
            basePosition: null,
            dropTime: 0,
            returnTimer: 0
        }
    };
    
    // Player tracking
    this.players = new Map();
    this.teams = {
        blue: new Set(),
        red: new Set()
    };
    
    // Statistics
    this.matchStats = {
        totalCaptures: 0,
        totalReturns: 0,
        flagCarrierKills: 0,
        longestFlagHold: 0,
        fastestCapture: Infinity,
        mostCapturesPlayer: null,
        mostReturnsPlayer: null
    };
    
    // Flag indicators and effects
    this.flagIndicators = new Map();
    this.carrierEffects = new Map();
    
    // Initialize flags
    this.initializeFlags();
    
    // Bind events
    this.app.on('player:kill', this.onPlayerKill, this);
    this.app.on('player:died', this.onPlayerDied, this);
    this.app.on('player:joined', this.onPlayerJoined, this);
    this.app.on('player:left', this.onPlayerLeft, this);
    this.app.on('flag:pickup', this.onFlagPickup, this);
    this.app.on('flag:drop', this.onFlagDrop, this);
    this.app.on('flag:capture', this.onFlagCapture, this);
    this.app.on('flag:return', this.onFlagReturn, this);
    this.app.on('match:start', this.startMatch, this);
    this.app.on('match:end', this.endMatch, this);
    this.app.on('match:pause', this.pauseMatch, this);
    this.app.on('match:resume', this.resumeMatch, this);
    this.app.on('ctf:forceEnd', this.forceEndMatch, this);
    
    console.log('CaptureTheFlag game mode initialized');
};

CaptureTheFlag.prototype.initializeFlags = function() {
    // Initialize blue flag
    if (this.blueFlag) {
        this.setupFlag(this.blueFlag, 'blue');
        this.flags.blue.basePosition = this.blueFlag.getPosition().clone();
    }
    
    // Initialize red flag
    if (this.redFlag) {
        this.setupFlag(this.redFlag, 'red');
        this.flags.red.basePosition = this.redFlag.getPosition().clone();
    }
    
    console.log('Flags initialized');
};

CaptureTheFlag.prototype.setupFlag = function(flagEntity, team) {
    // Add flag script if not already present
    if (!flagEntity.script) {
        flagEntity.addComponent('script');
    }
    
    if (!flagEntity.script.flag) {
        flagEntity.script.create('flag', {
            team: team,
            ctfController: this.entity
        });
    }
    
    // Add collision for pickup
    if (!flagEntity.collision) {
        flagEntity.addComponent('collision', {
            type: 'cylinder',
            height: 2,
            radius: 1
        });
        flagEntity.collision.trigger = true;
    }
    
    // Add rigidbody for physics
    if (!flagEntity.rigidbody) {
        flagEntity.addComponent('rigidbody', {
            type: 'kinematic'
        });
    }
    
    // Visual setup
    this.setupFlagVisuals(flagEntity, team);
    
    // Create flag indicator
    this.createFlagIndicator(flagEntity, team);
    
    // Bind collision events
    flagEntity.collision.on('triggerenter', (entity) => {
        this.onFlagTriggerEnter(flagEntity, entity, team);
    });
    
    // Add flag tag
    flagEntity.tags.add('flag');
    flagEntity.tags.add(team + '_flag');
};

CaptureTheFlag.prototype.setupFlagVisuals = function(flagEntity, team) {
    // Ensure flag has a model
    if (!flagEntity.model) {
        flagEntity.addComponent('model', {
            type: 'cylinder'
        });
    }
    
    // Set team colors
    const flagColor = team === 'blue' ? new pc.Color(0.2, 0.5, 1) : new pc.Color(1, 0.2, 0.2);
    
    if (flagEntity.model.material) {
        flagEntity.model.material.diffuse = flagColor;
        flagEntity.model.material.emissive = flagColor.clone().scale(0.3);
        flagEntity.model.material.update();
    }
    
    // Add flag pole effect
    this.createFlagPole(flagEntity, team);
    
    // Add team glow effect
    this.createFlagGlow(flagEntity, team);
};

CaptureTheFlag.prototype.createFlagPole = function(flagEntity, team) {
    const pole = new pc.Entity('FlagPole');
    pole.addComponent('model', {
        type: 'cylinder'
    });
    
    pole.setLocalScale(0.1, 3, 0.1);
    pole.setLocalPosition(0, 1.5, 0);
    
    // Dark gray pole
    if (pole.model.material) {
        pole.model.material.diffuse = new pc.Color(0.3, 0.3, 0.3);
        pole.model.material.update();
    }
    
    flagEntity.addChild(pole);
};

CaptureTheFlag.prototype.createFlagGlow = function(flagEntity, team) {
    const glow = new pc.Entity('FlagGlow');
    glow.addComponent('light', {
        type: pc.LIGHTTYPE_OMNI,
        color: team === 'blue' ? new pc.Color(0.2, 0.5, 1) : new pc.Color(1, 0.2, 0.2),
        intensity: 2,
        range: 10,
        castShadows: false
    });
    
    glow.setLocalPosition(0, 2, 0);
    flagEntity.addChild(glow);
};

CaptureTheFlag.prototype.createFlagIndicator = function(flagEntity, team) {
    const indicator = new pc.Entity('FlagIndicator');
    indicator.addComponent('element', {
        type: pc.ELEMENTTYPE_IMAGE,
        color: team === 'blue' ? new pc.Color(0.2, 0.5, 1) : new pc.Color(1, 0.2, 0.2),
        anchor: [0.5, 0.5, 0.5, 0.5],
        pivot: [0.5, 0.5],
        width: 32,
        height: 32
    });
    
    // Add to world space UI
    this.flagIndicators.set(team, indicator);
    
    // Would need to position relative to flag in 3D space
    this.updateFlagIndicator(team);
};

CaptureTheFlag.prototype.update = function(dt) {
    if (!this.isActive || this.isPaused) return;
    
    this.updateTimer(dt);
    this.updateFlags(dt);
    this.updateCarrierEffects(dt);
    this.updateFlagIndicators(dt);
    this.checkWinConditions();
    this.updatePlayerStats(dt);
};

CaptureTheFlag.prototype.updateTimer = function(dt) {
    this.timeRemaining -= dt;
    
    // Fire time update events
    this.app.fire('ctf:timeUpdate', {
        timeRemaining: this.timeRemaining,
        timeElapsed: this.timeLimit - this.timeRemaining
    });
    
    // Time warnings
    if (this.timeRemaining <= 60 && Math.floor(this.timeRemaining) % 10 === 0) {
        this.app.fire('ctf:timeWarning', {
            timeRemaining: Math.floor(this.timeRemaining)
        });
    }
    
    // Check time limit
    if (this.timeRemaining <= 0) {
        this.endMatch('Time limit reached');
    }
};

CaptureTheFlag.prototype.updateFlags = function(dt) {
    Object.keys(this.flags).forEach(team => {
        const flag = this.flags[team];
        
        switch (flag.state) {
            case CaptureTheFlag.FLAG_DROPPED:
                this.updateDroppedFlag(flag, dt);
                break;
            case CaptureTheFlag.FLAG_RETURNING:
                this.updateReturningFlag(flag, dt);
                break;
            case CaptureTheFlag.FLAG_TAKEN:
                this.updateTakenFlag(flag, dt);
                break;
        }
    });
};

CaptureTheFlag.prototype.updateDroppedFlag = function(flag, dt) {
    flag.dropTime += dt;
    
    // Auto-return after flagReturnTime
    if (flag.dropTime >= this.flagReturnTime) {
        this.returnFlag(flag);
    }
    
    // Update visual effects (pulsing, etc.)
    this.updateDroppedFlagEffects(flag, dt);
};

CaptureTheFlag.prototype.updateReturningFlag = function(flag, dt) {
    flag.returnTimer -= dt;
    
    if (flag.returnTimer <= 0) {
        this.completeReturn(flag);
    }
    
    // Update return animation
    this.updateReturnAnimation(flag, dt);
};

CaptureTheFlag.prototype.updateTakenFlag = function(flag, dt) {
    // Update flag position to follow carrier
    if (flag.carrier && flag.entity) {
        const carrierPos = flag.carrier.getPosition();
        flag.entity.setPosition(carrierPos.x, carrierPos.y + 2, carrierPos.z);
    }
    
    // Update carry time for statistics
    const playerData = this.getPlayerData(flag.carrier);
    if (playerData) {
        playerData.flagCarryTime += dt;
        this.matchStats.longestFlagHold = Math.max(this.matchStats.longestFlagHold, playerData.flagCarryTime);
    }
};

CaptureTheFlag.prototype.updateCarrierEffects = function(dt) {
    this.carrierEffects.forEach((effect, player) => {
        if (player.enabled) {
            // Update carrier particle effects, trails, etc.
            this.updateCarrierParticles(player, effect, dt);
        }
    });
};

CaptureTheFlag.prototype.updateFlagIndicators = function(dt) {
    this.flagIndicators.forEach((indicator, team) => {
        this.updateFlagIndicator(team);
    });
};

CaptureTheFlag.prototype.updateFlagIndicator = function(team) {
    const flag = this.flags[team];
    const indicator = this.flagIndicators.get(team);
    
    if (!indicator || !flag.entity) return;
    
    // Convert 3D position to screen space
    const camera = this.app.root.findByTag('camera')[0];
    if (camera) {
        const flagPos = flag.entity.getPosition();
        const screenPos = camera.camera.worldToScreen(flagPos);
        
        // Update indicator position (simplified)
        indicator.setLocalPosition(screenPos.x, screenPos.y, 0);
        
        // Update indicator based on flag state
        switch (flag.state) {
            case CaptureTheFlag.FLAG_AT_BASE:
                indicator.element.opacity = 1.0;
                break;
            case CaptureTheFlag.FLAG_TAKEN:
                indicator.element.opacity = 0.7;
                break;
            case CaptureTheFlag.FLAG_DROPPED:
                indicator.element.opacity = 0.5 + Math.sin(Date.now() * 0.01) * 0.3;
                break;
        }
    }
};

CaptureTheFlag.prototype.checkWinConditions = function() {
    // Check capture limit
    if (this.teamScores.blue >= this.captureLimit) {
        this.endMatch('Blue team reached capture limit', 'blue');
    } else if (this.teamScores.red >= this.captureLimit) {
        this.endMatch('Red team reached capture limit', 'red');
    }
};

CaptureTheFlag.prototype.onFlagTriggerEnter = function(flagEntity, entity, team) {
    if (!entity.tags || !entity.tags.has('player')) return;
    
    const player = entity;
    const playerTeam = this.getPlayerTeam(player);
    const flag = this.flags[team];
    
    // Check if player can interact with flag
    if (flag.state === CaptureTheFlag.FLAG_AT_BASE && playerTeam !== team) {
        // Enemy picking up flag at base
        this.pickupFlag(player, team);
    } else if (flag.state === CaptureTheFlag.FLAG_DROPPED && playerTeam !== team) {
        // Enemy picking up dropped flag
        this.pickupFlag(player, team);
    } else if (flag.state === CaptureTheFlag.FLAG_DROPPED && playerTeam === team) {
        // Teammate returning dropped flag
        this.initiateReturn(player, team);
    } else if (flag.state === CaptureTheFlag.FLAG_TAKEN && playerTeam !== team) {
        // Already carried by someone else
        return;
    }
    
    // Check for capture opportunity
    this.checkForCapture(player);
};

CaptureTheFlag.prototype.pickupFlag = function(player, flagTeam) {
    const flag = this.flags[flagTeam];
    const playerTeam = this.getPlayerTeam(player);
    
    if (flag.state === CaptureTheFlag.FLAG_TAKEN) return;
    
    // Set flag as taken
    flag.state = CaptureTheFlag.FLAG_TAKEN;
    flag.carrier = player;
    flag.dropTime = 0;
    
    // Attach flag to player
    this.attachFlagToPlayer(flag, player);
    
    // Create carrier effects
    this.createCarrierEffects(player, flagTeam);
    
    // Update player stats
    const playerData = this.getPlayerData(player);
    if (playerData) {
        playerData.flagPickups++;
        playerData.flagCarryStartTime = Date.now();
        playerData.flagCarryTime = 0;
    }
    
    // Fire events
    this.app.fire('ctf:flagPickup', {
        flag: flagTeam,
        player: player,
        playerTeam: playerTeam
    });
    
    this.app.fire('ui:notification', {
        text: `${player.name} has taken the ${flagTeam} flag!`,
        color: flagTeam === 'blue' ? '#0080FF' : '#FF4040',
        duration: 3000
    });
    
    console.log(`${player.name} picked up ${flagTeam} flag`);
};

CaptureTheFlag.prototype.dropFlag = function(player, flagTeam, forced = false) {
    const flag = this.flags[flagTeam];
    
    if (flag.carrier !== player) return;
    
    // Drop flag at player position
    const dropPosition = player.getPosition().clone();
    flag.entity.setPosition(dropPosition);
    
    // Set flag as dropped
    flag.state = CaptureTheFlag.FLAG_DROPPED;
    flag.carrier = null;
    flag.dropTime = 0;
    
    // Remove carrier effects
    this.removeCarrierEffects(player);
    
    // Create drop effect
    this.createFlagDropEffect(dropPosition, flagTeam);
    
    // Update player stats
    const playerData = this.getPlayerData(player);
    if (playerData) {
        const carryTime = (Date.now() - playerData.flagCarryStartTime) / 1000;
        playerData.totalFlagCarryTime += carryTime;
    }
    
    // Fire events
    this.app.fire('ctf:flagDrop', {
        flag: flagTeam,
        player: player,
        position: dropPosition,
        forced: forced
    });
    
    const reasonText = forced ? 'dropped' : 'dropped';
    this.app.fire('ui:notification', {
        text: `${flagTeam} flag ${reasonText}!`,
        color: '#FFFF00',
        duration: 2000
    });
    
    console.log(`${flagTeam} flag dropped at`, dropPosition.toString());
};

CaptureTheFlag.prototype.returnFlag = function(flag) {
    if (flag.state === CaptureTheFlag.FLAG_AT_BASE) return;
    
    // Start return animation
    flag.state = CaptureTheFlag.FLAG_RETURNING;
    flag.returnTimer = 2.0; // 2 second return animation
    
    // Create return effect
    this.createFlagReturnEffect(flag);
};

CaptureTheFlag.prototype.completeReturn = function(flag) {
    // Return flag to base
    flag.state = CaptureTheFlag.FLAG_AT_BASE;
    flag.carrier = null;
    flag.dropTime = 0;
    flag.returnTimer = 0;
    
    if (flag.entity && flag.basePosition) {
        flag.entity.setPosition(flag.basePosition);
    }
    
    // Fire return event
    const team = Object.keys(this.flags).find(t => this.flags[t] === flag);
    this.app.fire('ctf:flagReturn', {
        flag: team,
        automatic: true
    });
    
    this.app.fire('ui:notification', {
        text: `${team} flag returned!`,
        color: '#00FF00',
        duration: 2000
    });
};

CaptureTheFlag.prototype.initiateReturn = function(player, flagTeam) {
    const flag = this.flags[flagTeam];
    
    if (flag.state !== CaptureTheFlag.FLAG_DROPPED) return;
    
    // Instant return or capture time
    if (this.flagCaptureTime <= 0) {
        this.completePlayerReturn(player, flagTeam);
    } else {
        // Start capture process
        this.startFlagCapture(player, flagTeam, 'return');
    }
};

CaptureTheFlag.prototype.completePlayerReturn = function(player, flagTeam) {
    const flag = this.flags[flagTeam];
    
    // Return flag to base
    this.completeReturn(flag);
    
    // Update player stats
    const playerData = this.getPlayerData(player);
    if (playerData) {
        playerData.flagReturns++;
    }
    
    // Update match stats
    this.matchStats.totalReturns++;
    if (!this.matchStats.mostReturnsPlayer || 
        playerData.flagReturns > this.getPlayerData(this.matchStats.mostReturnsPlayer).flagReturns) {
        this.matchStats.mostReturnsPlayer = player;
    }
    
    // Fire events
    this.app.fire('ctf:flagReturn', {
        flag: flagTeam,
        player: player,
        automatic: false
    });
    
    this.app.fire('ui:notification', {
        text: `${player.name} returned the ${flagTeam} flag!`,
        color: '#00FF00',
        duration: 3000
    });
    
    console.log(`${player.name} returned ${flagTeam} flag`);
};

CaptureTheFlag.prototype.checkForCapture = function(player) {
    const playerTeam = this.getPlayerTeam(player);
    const enemyTeam = playerTeam === 'blue' ? 'red' : 'blue';
    const ownFlag = this.flags[playerTeam];
    const enemyFlag = this.flags[enemyTeam];
    
    // Can only capture if carrying enemy flag and own flag is at base
    if (enemyFlag.carrier === player && ownFlag.state === CaptureTheFlag.FLAG_AT_BASE) {
        
        // Check if player is at their base (near their flag)
        const distance = player.getPosition().distance(ownFlag.basePosition);
        if (distance <= 3) { // Capture radius
            
            if (this.flagCaptureTime <= 0) {
                this.completeCapture(player, enemyTeam);
            } else {
                this.startFlagCapture(player, enemyTeam, 'capture');
            }
        }
    }
};

CaptureTheFlag.prototype.completeCapture = function(player, capturedFlagTeam) {
    const playerTeam = this.getPlayerTeam(player);
    const capturedFlag = this.flags[capturedFlagTeam];
    
    // Increase team score
    this.teamScores[playerTeam]++;
    
    // Return captured flag to enemy base
    this.completeReturn(capturedFlag);
    
    // Remove carrier effects
    this.removeCarrierEffects(player);
    
    // Update player stats
    const playerData = this.getPlayerData(player);
    if (playerData) {
        playerData.flagCaptures++;
        const captureTime = (Date.now() - playerData.flagCarryStartTime) / 1000;
        this.matchStats.fastestCapture = Math.min(this.matchStats.fastestCapture, captureTime);
    }
    
    // Update match stats
    this.matchStats.totalCaptures++;
    if (!this.matchStats.mostCapturesPlayer || 
        playerData.flagCaptures > this.getPlayerData(this.matchStats.mostCapturesPlayer).flagCaptures) {
        this.matchStats.mostCapturesPlayer = player;
    }
    
    // Create capture effect
    this.createCaptureEffect(player, capturedFlagTeam);
    
    // Fire events
    this.app.fire('ctf:flagCapture', {
        flag: capturedFlagTeam,
        player: player,
        playerTeam: playerTeam,
        teamScore: this.teamScores[playerTeam]
    });
    
    this.app.fire('ctf:scoreUpdate', {
        blueScore: this.teamScores.blue,
        redScore: this.teamScores.red
    });
    
    this.app.fire('ui:notification', {
        text: `${player.name} captured the ${capturedFlagTeam} flag!`,
        color: playerTeam === 'blue' ? '#0080FF' : '#FF4040',
        duration: 5000,
        important: true
    });
    
    console.log(`${player.name} captured ${capturedFlagTeam} flag! Score: ${playerTeam} ${this.teamScores[playerTeam]}`);
};

CaptureTheFlag.prototype.attachFlagToPlayer = function(flag, player) {
    if (!flag.entity) return;
    
    // Position flag above player
    const playerPos = player.getPosition();
    flag.entity.setPosition(playerPos.x, playerPos.y + 2, playerPos.z);
    
    // Could attach to a specific bone in the player model
    // For simplicity, we'll just update position in update loop
};

CaptureTheFlag.prototype.createCarrierEffects = function(player, flagTeam) {
    // Create particle trail for flag carrier
    const carrierEffect = new pc.Entity('CarrierEffect');
    carrierEffect.addComponent('particlesystem', {
        numParticles: 30,
        lifetime: 2,
        rate: 15,
        startVelocity: new pc.Vec3(0, 0.5, 0),
        startVelocity2: new pc.Vec3(0, 1.5, 0),
        colorMap: flagTeam === 'blue' ? new pc.Color(0.2, 0.5, 1) : new pc.Color(1, 0.2, 0.2),
        alphaGraph: new pc.CurveSet([
            [0, 0.8],
            [0.5, 0.6],
            [1, 0]
        ])
    });
    
    carrierEffect.setPosition(player.getPosition());
    this.app.root.addChild(carrierEffect);
    
    this.carrierEffects.set(player, {
        particles: carrierEffect,
        team: flagTeam
    });
    
    // Add carrier indicator on minimap
    this.app.fire('minimap:trackEntity', {
        entity: player,
        type: 'flag_carrier'
    });
};

CaptureTheFlag.prototype.removeCarrierEffects = function(player) {
    const effect = this.carrierEffects.get(player);
    if (effect) {
        if (effect.particles) {
            effect.particles.destroy();
        }
        this.carrierEffects.delete(player);
    }
    
    // Remove from minimap tracking
    this.app.fire('minimap:untrackEntity', {
        entity: player
    });
};

CaptureTheFlag.prototype.updateCarrierParticles = function(player, effect, dt) {
    if (effect.particles) {
        const playerPos = player.getPosition();
        effect.particles.setPosition(playerPos.x, playerPos.y + 1, playerPos.z);
    }
};

CaptureTheFlag.prototype.createFlagDropEffect = function(position, team) {
    this.app.fire('effect:flagDrop', {
        position: position,
        team: team
    });
};

CaptureTheFlag.prototype.createFlagReturnEffect = function(flag) {
    this.app.fire('effect:flagReturn', {
        startPos: flag.entity.getPosition(),
        endPos: flag.basePosition,
        team: Object.keys(this.flags).find(t => this.flags[t] === flag)
    });
};

CaptureTheFlag.prototype.createCaptureEffect = function(player, capturedTeam) {
    this.app.fire('effect:flagCapture', {
        position: player.getPosition(),
        capturedTeam: capturedTeam,
        capturingTeam: this.getPlayerTeam(player)
    });
    
    // Screen flash for all players
    this.app.fire('ui:flashEffect', {
        intensity: 0.3,
        duration: 500,
        color: this.getPlayerTeam(player) === 'blue' ? new pc.Color(0.2, 0.5, 1) : new pc.Color(1, 0.2, 0.2)
    });
};

CaptureTheFlag.prototype.onPlayerKill = function(data) {
    const killer = data.killer;
    const victim = data.victim;
    
    // Check if victim was carrying a flag
    Object.keys(this.flags).forEach(team => {
        const flag = this.flags[team];
        if (flag.carrier === victim) {
            this.dropFlag(victim, team, true);
            
            // Award points for killing flag carrier
            const killerData = this.getPlayerData(killer);
            if (killerData) {
                killerData.flagCarrierKills++;
                killerData.score += 150; // Bonus for killing flag carrier
            }
            
            this.matchStats.flagCarrierKills++;
        }
    });
};

CaptureTheFlag.prototype.onPlayerDied = function(data) {
    const player = data.entity;
    
    // Drop flag if carrying one
    Object.keys(this.flags).forEach(team => {
        const flag = this.flags[team];
        if (flag.carrier === player) {
            this.dropFlag(player, team, true);
        }
    });
};

CaptureTheFlag.prototype.onPlayerJoined = function(data) {
    const player = data.player || data.entity;
    const team = this.assignTeam(player);
    
    // Initialize player data
    this.players.set(player, {
        team: team,
        flagCaptures: 0,
        flagReturns: 0,
        flagPickups: 0,
        flagCarrierKills: 0,
        flagCarryTime: 0,
        totalFlagCarryTime: 0,
        flagCarryStartTime: 0,
        score: 0,
        joinTime: Date.now()
    });
    
    // Add to team
    this.teams[team].add(player);
    player.tags.add(team + '_team');
    
    console.log(`${player.name} joined ${team} team`);
};

CaptureTheFlag.prototype.onPlayerLeft = function(data) {
    const player = data.player || data.entity;
    const playerData = this.getPlayerData(player);
    
    if (playerData) {
        // Drop flag if carrying
        Object.keys(this.flags).forEach(team => {
            const flag = this.flags[team];
            if (flag.carrier === player) {
                this.dropFlag(player, team, true);
            }
        });
        
        // Remove from team
        this.teams[playerData.team].delete(player);
        player.tags.remove(playerData.team + '_team');
    }
    
    // Clean up
    this.players.delete(player);
    this.removeCarrierEffects(player);
};

CaptureTheFlag.prototype.startMatch = function() {
    this.isActive = true;
    this.gameStartTime = Date.now();
    this.timeRemaining = this.timeLimit;
    
    // Reset scores
    this.teamScores.blue = 0;
    this.teamScores.red = 0;
    
    // Reset flags
    Object.keys(this.flags).forEach(team => {
        const flag = this.flags[team];
        flag.state = CaptureTheFlag.FLAG_AT_BASE;
        flag.carrier = null;
        flag.dropTime = 0;
        if (flag.entity && flag.basePosition) {
            flag.entity.setPosition(flag.basePosition);
        }
    });
    
    // Reset player stats
    this.players.forEach(playerData => {
        playerData.flagCaptures = 0;
        playerData.flagReturns = 0;
        playerData.flagPickups = 0;
        playerData.flagCarrierKills = 0;
        playerData.flagCarryTime = 0;
        playerData.totalFlagCarryTime = 0;
        playerData.score = 0;
    });
    
    // Reset match stats
    this.matchStats = {
        totalCaptures: 0,
        totalReturns: 0,
        flagCarrierKills: 0,
        longestFlagHold: 0,
        fastestCapture: Infinity,
        mostCapturesPlayer: null,
        mostReturnsPlayer: null
    };
    
    this.app.fire('ctf:matchStart', {
        captureLimit: this.captureLimit,
        timeLimit: this.timeLimit
    });
    
    console.log('Capture the Flag match started');
};

CaptureTheFlag.prototype.endMatch = function(reason, winningTeam = null) {
    if (!this.isActive) return;
    
    this.isActive = false;
    this.gameEndTime = Date.now();
    
    // Drop all flags
    Object.keys(this.flags).forEach(team => {
        const flag = this.flags[team];
        if (flag.carrier) {
            this.dropFlag(flag.carrier, team, true);
        }
    });
    
    // Determine winner if not specified
    if (!winningTeam) {
        if (this.teamScores.blue > this.teamScores.red) {
            winningTeam = 'blue';
        } else if (this.teamScores.red > this.teamScores.blue) {
            winningTeam = 'red';
        } else {
            winningTeam = 'tie';
        }
    }
    
    // Calculate final stats
    const matchDuration = this.gameEndTime - this.gameStartTime;
    const finalStats = this.calculateFinalStats();
    
    this.app.fire('ctf:matchEnd', {
        winner: winningTeam,
        reason: reason,
        duration: matchDuration,
        finalScores: { ...this.teamScores },
        stats: finalStats
    });
    
    console.log(`CTF match ended - Winner: ${winningTeam}, Reason: ${reason}`);
};

CaptureTheFlag.prototype.calculateFinalStats = function() {
    const playerStats = [];
    
    this.players.forEach((playerData, player) => {
        playerStats.push({
            player: player,
            team: playerData.team,
            flagCaptures: playerData.flagCaptures,
            flagReturns: playerData.flagReturns,
            flagPickups: playerData.flagPickups,
            flagCarrierKills: playerData.flagCarrierKills,
            totalFlagCarryTime: playerData.totalFlagCarryTime,
            score: playerData.score
        });
    });
    
    // Sort by captures, then by score
    playerStats.sort((a, b) => {
        if (a.flagCaptures !== b.flagCaptures) {
            return b.flagCaptures - a.flagCaptures;
        }
        return b.score - a.score;
    });
    
    return {
        players: playerStats,
        match: { ...this.matchStats },
        teamScores: { ...this.teamScores }
    };
};

CaptureTheFlag.prototype.assignTeam = function(player) {
    // Balance teams
    const blueCount = this.teams.blue.size;
    const redCount = this.teams.red.size;
    return blueCount <= redCount ? 'blue' : 'red';
};

CaptureTheFlag.prototype.getPlayerData = function(player) {
    return this.players.get(player) || null;
};

CaptureTheFlag.prototype.getPlayerTeam = function(player) {
    const playerData = this.getPlayerData(player);
    return playerData ? playerData.team : null;
};

CaptureTheFlag.prototype.updatePlayerStats = function(dt) {
    // Update playtime and other time-based stats
    this.players.forEach(playerData => {
        playerData.playtime = Date.now() - playerData.joinTime;
    });
};

CaptureTheFlag.prototype.pauseMatch = function() {
    this.isPaused = true;
    this.app.fire('ctf:matchPaused');
};

CaptureTheFlag.prototype.resumeMatch = function() {
    this.isPaused = false;
    this.app.fire('ctf:matchResumed');
};

CaptureTheFlag.prototype.forceEndMatch = function(data) {
    this.endMatch('Admin ended match', data.winner);
};

CaptureTheFlag.prototype.getMatchStatus = function() {
    return {
        isActive: this.isActive,
        isPaused: this.isPaused,
        timeRemaining: this.timeRemaining,
        scores: { ...this.teamScores },
        flagStates: {
            blue: this.flags.blue.state,
            red: this.flags.red.state
        },
        flagCarriers: {
            blue: this.flags.blue.carrier ? this.flags.blue.carrier.name : null,
            red: this.flags.red.carrier ? this.flags.red.carrier.name : null
        }
    };
};