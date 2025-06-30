/**
 * SecurityManager.js
 * Anti-cheat and security validation system
 * Handles input validation, movement speed validation, aim assist detection, and replay system
 */

class SecurityManager extends pc.ScriptType {
    static get scriptName() { return 'SecurityManager'; }

    initialize() {
        this.networkManager = this.app.root.findByName('Game_Manager').script.networkManager;
        this.gameManager = this.app.root.findByName('Game_Manager').script.gameManager;
        
        // Security validation settings
        this.maxMovementSpeed = 15.0; // Maximum allowed movement speed
        this.maxRotationSpeed = 720.0; // Maximum rotation per second
        this.validationRate = 60; // Validations per second
        this.suspicionThreshold = 10; // Violations before flagging
        
        // Tracking data
        this.playerViolations = new Map();
        this.replayData = [];
        this.lastValidationTime = 0;
        this.inputHistory = [];
        this.aimHistory = [];
        
        // Validation flags
        this.enableMovementValidation = true;
        this.enableAimAssistDetection = true;
        this.enableInputValidation = true;
        this.enableReplayRecording = true;
        
        this.startSecuritySystems();
    }

    startSecuritySystems() {
        // Start validation loops
        if (this.enableMovementValidation) {
            this.validateMovementLoop();
        }
        
        if (this.enableAimAssistDetection) {
            this.detectAimAssistLoop();
        }
        
        if (this.enableInputValidation) {
            this.validateInputLoop();
        }
        
        if (this.enableReplayRecording) {
            this.recordReplayData();
        }
    }

    validateMovementLoop() {
        const currentTime = Date.now();
        
        if (currentTime - this.lastValidationTime > 1000 / this.validationRate) {
            this.validatePlayerMovement();
            this.lastValidationTime = currentTime;
        }
        
        setTimeout(() => this.validateMovementLoop(), 16); // ~60fps
    }

    validatePlayerMovement() {
        const players = this.gameManager.getAllPlayers();
        
        players.forEach(player => {
            if (!player || !player.script.playerController) return;
            
            const velocity = player.script.playerController.getVelocity();
            const speed = velocity.length();
            
            // Check for speed hacking
            if (speed > this.maxMovementSpeed) {
                this.recordViolation(player.networkId, 'SPEED_HACK', {
                    speed: speed,
                    maxAllowed: this.maxMovementSpeed,
                    position: player.getPosition().clone()
                });
            }
            
            // Check for teleportation
            this.checkTeleportation(player);
            
            // Validate collision and physics
            this.validatePhysicsState(player);
        });
    }

    checkTeleportation(player) {
        const currentPos = player.getPosition();
        const lastPos = player.lastKnownPosition || currentPos;
        const distance = currentPos.distance(lastPos);
        const deltaTime = (Date.now() - (player.lastPositionTime || Date.now())) / 1000;
        
        if (deltaTime > 0) {
            const calculatedSpeed = distance / deltaTime;
            
            if (calculatedSpeed > this.maxMovementSpeed * 2) {
                this.recordViolation(player.networkId, 'TELEPORTATION', {
                    distance: distance,
                    time: deltaTime,
                    speed: calculatedSpeed
                });
            }
        }
        
        player.lastKnownPosition = currentPos.clone();
        player.lastPositionTime = Date.now();
    }

    validatePhysicsState(player) {
        if (!player.rigidbody) return;
        
        const velocity = player.rigidbody.linearVelocity;
        const isGrounded = player.script.playerController?.isGrounded;
        
        // Check for flying/noclip
        if (!isGrounded && velocity.y > -0.1 && velocity.y < 0.1) {
            if (!player.suspiciousHoverTime) {
                player.suspiciousHoverTime = Date.now();
            } else if (Date.now() - player.suspiciousHoverTime > 2000) { // 2 seconds
                this.recordViolation(player.networkId, 'FLYING_HACK', {
                    velocity: velocity.clone(),
                    isGrounded: isGrounded
                });
            }
        } else {
            player.suspiciousHoverTime = null;
        }
    }

    detectAimAssistLoop() {
        setTimeout(() => {
            this.analyzeAimPatterns();
            this.detectAimAssistLoop();
        }, 100); // Check every 100ms
    }

    analyzeAimPatterns() {
        const players = this.gameManager.getAllPlayers();
        
        players.forEach(player => {
            if (!player.script.playerCamera) return;
            
            const aimData = this.collectAimData(player);
            this.aimHistory.push(aimData);
            
            // Keep only last 100 samples
            if (this.aimHistory.length > 100) {
                this.aimHistory.shift();
            }
            
            // Analyze for suspicious patterns
            this.detectSuspiciousAiming(player, aimData);
        });
    }

    collectAimData(player) {
        const camera = player.script.playerCamera;
        return {
            playerId: player.networkId,
            timestamp: Date.now(),
            pitch: camera.pitch,
            yaw: camera.yaw,
            targetDistance: this.getNearestEnemyDistance(player),
            isAiming: player.script.weaponController?.isAiming || false
        };
    }

    detectSuspiciousAiming(player, aimData) {
        const recentAims = this.aimHistory.filter(data => 
            data.playerId === player.networkId && 
            Date.now() - data.timestamp < 5000
        );
        
        if (recentAims.length < 10) return;
        
        // Check for inhuman precision
        const aimAccuracy = this.calculateAimAccuracy(recentAims);
        if (aimAccuracy > 0.95) { // 95% accuracy is suspicious
            this.recordViolation(player.networkId, 'AIM_BOT', {
                accuracy: aimAccuracy,
                samples: recentAims.length
            });
        }
        
        // Check for perfect tracking
        const trackingConsistency = this.analyzeTrackingConsistency(recentAims);
        if (trackingConsistency > 0.9) {
            this.recordViolation(player.networkId, 'AIM_ASSIST', {
                consistency: trackingConsistency
            });
        }
    }

    calculateAimAccuracy(aimData) {
        // Calculate how often the player's crosshair is on target
        let hits = 0;
        aimData.forEach(data => {
            if (data.targetDistance < 2.0 && data.isAiming) {
                hits++;
            }
        });
        return hits / aimData.length;
    }

    analyzeTrackingConsistency(aimData) {
        // Analyze the smoothness and consistency of aim movements
        let totalVariation = 0;
        for (let i = 1; i < aimData.length; i++) {
            const prev = aimData[i - 1];
            const curr = aimData[i];
            const deltaTime = curr.timestamp - prev.timestamp;
            
            if (deltaTime > 0) {
                const pitchChange = Math.abs(curr.pitch - prev.pitch);
                const yawChange = Math.abs(curr.yaw - prev.yaw);
                const totalChange = pitchChange + yawChange;
                totalVariation += totalChange / deltaTime;
            }
        }
        
        return 1.0 - (totalVariation / aimData.length) / 1000; // Normalize
    }

    validateInputLoop() {
        setTimeout(() => {
            this.validatePlayerInput();
            this.validateInputLoop();
        }, 16); // ~60fps
    }

    validatePlayerInput() {
        const players = this.gameManager.getAllPlayers();
        
        players.forEach(player => {
            if (!player.script.inputManager) return;
            
            const inputData = player.script.inputManager.getInputSnapshot();
            this.inputHistory.push({
                playerId: player.networkId,
                timestamp: Date.now(),
                input: inputData
            });
            
            // Validate input patterns
            this.detectSuspiciousInput(player, inputData);
        });
        
        // Clean old input history
        const cutoffTime = Date.now() - 10000; // Keep 10 seconds
        this.inputHistory = this.inputHistory.filter(data => data.timestamp > cutoffTime);
    }

    detectSuspiciousInput(player, inputData) {
        // Check for impossible input combinations
        if (inputData.forward && inputData.backward) {
            this.recordViolation(player.networkId, 'IMPOSSIBLE_INPUT', {
                input: 'forward_backward_simultaneous'
            });
        }
        
        if (inputData.left && inputData.right) {
            this.recordViolation(player.networkId, 'IMPOSSIBLE_INPUT', {
                input: 'left_right_simultaneous'
            });
        }
        
        // Check for macro/scripted input
        this.detectMacroUsage(player);
    }

    detectMacroUsage(player) {
        const recentInputs = this.inputHistory.filter(data => 
            data.playerId === player.networkId && 
            Date.now() - data.timestamp < 3000
        );
        
        if (recentInputs.length < 30) return;
        
        // Analyze timing patterns
        const timings = [];
        for (let i = 1; i < recentInputs.length; i++) {
            timings.push(recentInputs[i].timestamp - recentInputs[i-1].timestamp);
        }
        
        // Check for suspiciously consistent timing
        const avgTiming = timings.reduce((a, b) => a + b, 0) / timings.length;
        const variance = timings.reduce((acc, timing) => acc + Math.pow(timing - avgTiming, 2), 0) / timings.length;
        
        if (variance < 1.0) { // Very low variance indicates macro usage
            this.recordViolation(player.networkId, 'MACRO_USAGE', {
                variance: variance,
                avgTiming: avgTiming
            });
        }
    }

    recordReplayData() {
        const gameState = this.gameManager.getGameState();
        
        this.replayData.push({
            timestamp: Date.now(),
            gameState: this.serializeGameState(gameState)
        });
        
        // Keep only last 5 minutes of replay data
        const cutoffTime = Date.now() - 300000; // 5 minutes
        this.replayData = this.replayData.filter(data => data.timestamp > cutoffTime);
        
        setTimeout(() => this.recordReplayData(), 100); // 10 fps for replay
    }

    serializeGameState(gameState) {
        // Serialize essential game state for replay
        return {
            players: gameState.players.map(player => ({
                id: player.networkId,
                position: player.getPosition().clone(),
                rotation: player.getEulerAngles().clone(),
                health: player.script.healthSystem?.getCurrentHealth(),
                weapon: player.script.weaponManager?.getCurrentWeapon()?.name
            })),
            projectiles: gameState.projectiles.map(proj => ({
                position: proj.getPosition().clone(),
                velocity: proj.rigidbody?.linearVelocity.clone()
            }))
        };
    }

    recordViolation(playerId, violationType, data) {
        if (!this.playerViolations.has(playerId)) {
            this.playerViolations.set(playerId, []);
        }
        
        const violation = {
            timestamp: Date.now(),
            type: violationType,
            data: data,
            severity: this.getViolationSeverity(violationType)
        };
        
        this.playerViolations.get(playerId).push(violation);
        
        // Check if player should be flagged/kicked
        this.evaluatePlayerStatus(playerId);
        
        // Log violation
        console.warn(`Security violation detected: ${violationType} by player ${playerId}`, data);
        
        // Send to server for logging
        if (this.networkManager && this.networkManager.isConnected()) {
            this.networkManager.sendSecurityReport(violation);
        }
    }

    getViolationSeverity(violationType) {
        const severityMap = {
            'SPEED_HACK': 'HIGH',
            'TELEPORTATION': 'CRITICAL',
            'FLYING_HACK': 'HIGH',
            'AIM_BOT': 'CRITICAL',
            'AIM_ASSIST': 'MEDIUM',
            'IMPOSSIBLE_INPUT': 'LOW',
            'MACRO_USAGE': 'MEDIUM'
        };
        
        return severityMap[violationType] || 'LOW';
    }

    evaluatePlayerStatus(playerId) {
        const violations = this.playerViolations.get(playerId) || [];
        const recentViolations = violations.filter(v => Date.now() - v.timestamp < 60000); // Last minute
        
        const criticalCount = recentViolations.filter(v => v.severity === 'CRITICAL').length;
        const highCount = recentViolations.filter(v => v.severity === 'HIGH').length;
        
        if (criticalCount >= 1 || highCount >= 3) {
            this.flagPlayer(playerId, 'SUSPECTED_CHEATER');
        }
        
        if (criticalCount >= 2 || violations.length >= this.suspicionThreshold) {
            this.kickPlayer(playerId, 'ANTI_CHEAT_VIOLATION');
        }
    }

    flagPlayer(playerId, reason) {
        console.log(`Player ${playerId} flagged for: ${reason}`);
        
        // Send flag notification to server
        if (this.networkManager) {
            this.networkManager.sendPlayerFlag(playerId, reason);
        }
        
        // Start enhanced monitoring
        this.enhancedMonitoring.add(playerId);
    }

    kickPlayer(playerId, reason) {
        console.log(`Player ${playerId} kicked for: ${reason}`);
        
        // Send kick command to server
        if (this.networkManager) {
            this.networkManager.kickPlayer(playerId, reason);
        }
    }

    getNearestEnemyDistance(player) {
        const enemies = this.gameManager.getEnemyPlayers(player);
        let minDistance = Infinity;
        
        enemies.forEach(enemy => {
            const distance = player.getPosition().distance(enemy.getPosition());
            if (distance < minDistance) {
                minDistance = distance;
            }
        });
        
        return minDistance;
    }

    // Public API methods
    getPlayerViolations(playerId) {
        return this.playerViolations.get(playerId) || [];
    }

    clearPlayerViolations(playerId) {
        this.playerViolations.delete(playerId);
    }

    getReplayData(startTime, endTime) {
        return this.replayData.filter(data => 
            data.timestamp >= startTime && data.timestamp <= endTime
        );
    }

    exportReplayData() {
        return JSON.stringify(this.replayData);
    }

    setValidationSettings(settings) {
        Object.assign(this, settings);
    }

    getSecurityReport() {
        const totalViolations = Array.from(this.playerViolations.values())
            .reduce((total, violations) => total + violations.length, 0);
            
        return {
            totalViolations: totalViolations,
            suspiciousPlayers: this.playerViolations.size,
            replayDataSize: this.replayData.length,
            uptime: Date.now() - this.startTime
        };
    }
}

pc.registerScript(SecurityManager, 'SecurityManager');
