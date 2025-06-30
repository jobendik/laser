/**
 * AIPerception.js
 * Advanced AI perception system for line of sight, sound detection, player tracking, memory, and alert states
 */

class AIPerception extends pc.ScriptType {
    static get scriptName() { return 'AIPerception'; }

    initialize() {
        this.aiController = this.entity.script.aiController;
        this.gameManager = this.app.root.findByName('Game_Manager').script.gameManager;
        this.audioManager = this.app.root.findByName('Game_Manager').script.audioManager;
        
        // Perception settings
        this.sightRange = 50.0; // meters
        this.sightAngle = 90.0; // degrees (total cone)
        this.hearingRange = 30.0; // meters
        this.smellRange = 5.0; // meters (for close detection)
        
        // Line of sight settings
        this.losUpdateRate = 10; // checks per second
        this.losRaycastLayers = pc.LAYERID_WORLD | pc.LAYERID_DEFAULT;
        this.losCheckHeight = 1.7; // eye height
        
        // Sound detection
        this.soundSensitivity = 1.0;
        this.soundMemoryTime = 10000; // ms to remember sounds
        this.footstepDetectionRange = 8.0;
        this.weaponFireDetectionRange = 100.0;
        
        // Target tracking
        this.trackedTargets = new Map();
        this.maxTrackedTargets = 5;
        this.targetUpdateRate = 5; // updates per second
        
        // Memory system
        this.memoryDuration = 30000; // 30 seconds
        this.lastKnownPositions = new Map();
        this.suspiciousLocations = [];
        this.investigationPoints = [];
        
        // Alert states
        this.alertLevel = 'unaware'; // unaware, suspicious, alert, combat
        this.alertCooldownTime = 15000; // Time to cool down from alert
        this.lastAlertTime = 0;
        this.alertRadius = 25.0; // Range to alert nearby AI
        
        // Perception modifiers
        this.difficultyModifier = 1.0;
        this.weatherModifier = 1.0;
        this.lightingModifier = 1.0;
        this.noiseModifier = 1.0;
        
        // State tracking
        this.currentTarget = null;
        this.lastSeenTime = 0;
        this.lastHeardTime = 0;
        this.isSearching = false;
        this.searchTarget = null;
        
        // Performance optimization
        this.lastLOSCheck = 0;
        this.lastTargetUpdate = 0;
        this.perceptionFrame = Math.random() * 60; // Stagger updates
        
        this.initializePerception();
        this.setupEventListeners();
    }

    initializePerception() {
        // Initialize perception components
        this.setupVisionCone();
        this.setupHearingZone();
        this.initializeMemorySystem();
        
        // Apply difficulty settings
        this.applyDifficultyModifiers();
    }

    setupVisionCone() {
        // Create visual representation of vision cone (for debugging)
        if (this.app.scene.layers.getLayerByName('Debug')) {
            this.visionConeEntity = new pc.Entity('VisionCone');
            this.visionConeEntity.addComponent('render', {
                type: 'cone',
                material: this.createVisionConeMaterial()
            });
            
            this.entity.addChild(this.visionConeEntity);
            this.visionConeEntity.enabled = false; // Hidden by default
        }
    }

    setupHearingZone() {
        // Create hearing detection zone
        this.hearingZone = new pc.Entity('HearingZone');
        this.hearingZone.addComponent('collision', {
            type: 'sphere',
            radius: this.hearingRange
        });
        this.hearingZone.addComponent('rigidbody', {
            type: 'kinematic'
        });
        
        this.entity.addChild(this.hearingZone);
        this.hearingZone.enabled = false; // Use manual detection instead
    }

    initializeMemorySystem() {
        // Initialize memory storage
        this.memoryData = {
            seenTargets: new Map(),
            heardSounds: [],
            investigatedAreas: [],
            patrolRoutes: [],
            dangerZones: []
        };
    }

    applyDifficultyModifiers() {
        // Adjust perception based on game difficulty
        const difficulty = this.gameManager?.getDifficulty() || 'normal';
        
        switch (difficulty) {
            case 'easy':
                this.difficultyModifier = 0.7;
                this.sightRange *= 0.8;
                this.hearingRange *= 0.8;
                this.sightAngle *= 0.9;
                break;
            case 'normal':
                this.difficultyModifier = 1.0;
                break;
            case 'hard':
                this.difficultyModifier = 1.3;
                this.sightRange *= 1.2;
                this.hearingRange *= 1.2;
                this.sightAngle *= 1.1;
                break;
            case 'expert':
                this.difficultyModifier = 1.6;
                this.sightRange *= 1.4;
                this.hearingRange *= 1.4;
                this.sightAngle *= 1.2;
                this.soundSensitivity *= 1.5;
                break;
        }
    }

    setupEventListeners() {
        // Global sound events
        this.app.on('sound:gunshot', this.onGunshot.bind(this));
        this.app.on('sound:footstep', this.onFootstep.bind(this));
        this.app.on('sound:explosion', this.onExplosion.bind(this));
        this.app.on('sound:reload', this.onReload.bind(this));
        this.app.on('sound:interaction', this.onInteraction.bind(this));
        
        // AI communication events
        this.app.on('ai:alert', this.onAIAlert.bind(this));
        this.app.on('ai:targetLost', this.onTargetLost.bind(this));
        this.app.on('ai:targetFound', this.onTargetFound.bind(this));
        
        // Environmental events
        this.app.on('environment:lightingChange', this.onLightingChange.bind(this));
        this.app.on('environment:weatherChange', this.onWeatherChange.bind(this));
        
        // Player events
        this.app.on('player:died', this.onPlayerDied.bind(this));
        this.app.on('player:respawn', this.onPlayerRespawn.bind(this));
    }

    update(dt) {
        // Stagger perception updates for performance
        this.perceptionFrame += dt * 60;
        
        // Update line of sight
        if (this.perceptionFrame % (60 / this.losUpdateRate) < dt * 60) {
            this.updateLineOfSight();
        }
        
        // Update target tracking
        if (this.perceptionFrame % (60 / this.targetUpdateRate) < dt * 60) {
            this.updateTargetTracking();
        }
        
        // Update memory system
        this.updateMemorySystem(dt);
        
        // Update alert state
        this.updateAlertState(dt);
        
        // Update environmental modifiers
        this.updateEnvironmentalModifiers();
        
        // Clean up old memory
        if (this.perceptionFrame % 300 < dt * 60) { // Every 5 seconds
            this.cleanupMemory();
        }
    }

    // Line of Sight System
    updateLineOfSight() {
        const potentialTargets = this.getPotentialTargets();
        
        potentialTargets.forEach(target => {
            if (this.canSeeTarget(target)) {
                this.onTargetSeen(target);
            } else if (this.trackedTargets.has(target.getGuid())) {
                this.onTargetLostSight(target);
            }
        });
    }

    getPotentialTargets() {
        // Get all players and relevant entities within sight range
        const targets = [];
        const players = this.gameManager?.getAllPlayers() || [];
        const aiPosition = this.entity.getPosition();
        
        players.forEach(player => {
            if (player === this.entity) return; // Don't target self
            
            const distance = aiPosition.distance(player.getPosition());
            if (distance <= this.getEffectiveSightRange()) {
                targets.push(player);
            }
        });
        
        return targets;
    }

    canSeeTarget(target) {
        const aiPosition = this.entity.getPosition();
        const aiForward = this.entity.forward;
        
        // Add eye height offset
        const eyePosition = aiPosition.clone();
        eyePosition.y += this.losCheckHeight;
        
        const targetPosition = target.getPosition();
        targetPosition.y += 1.7; // Target head height
        
        // Check distance
        const distance = eyePosition.distance(targetPosition);
        if (distance > this.getEffectiveSightRange()) {
            return false;
        }
        
        // Check angle (field of view)
        const directionToTarget = targetPosition.clone().sub(eyePosition).normalize();
        const angle = Math.acos(aiForward.dot(directionToTarget)) * pc.math.RAD_TO_DEG;
        
        if (angle > this.getEffectiveSightAngle() / 2) {
            return false;
        }
        
        // Raycast for line of sight
        const raycastResult = this.app.systems.rigidbody.raycastFirst(
            eyePosition, 
            targetPosition,
            this.losRaycastLayers
        );
        
        if (raycastResult) {
            // Check if we hit the target or something between us and target
            return raycastResult.entity === target || 
                   this.isTargetBehindCover(raycastResult, target, distance);
        }
        
        return true; // Clear line of sight
    }

    isTargetBehindCover(raycastResult, target, distance) {
        // Check if target is partially visible behind cover
        const hitDistance = raycastResult.point.distance(this.entity.getPosition());
        const targetDistance = distance;
        
        // If we hit something close to the target, they might be partially visible
        return Math.abs(hitDistance - targetDistance) < 0.5;
    }

    onTargetSeen(target) {
        const targetId = target.getGuid();
        const currentTime = Date.now();
        
        // Update tracking data
        if (!this.trackedTargets.has(targetId)) {
            this.trackedTargets.set(targetId, {
                entity: target,
                firstSeenTime: currentTime,
                lastSeenTime: currentTime,
                lastPosition: target.getPosition().clone(),
                timesLost: 0,
                threatLevel: this.calculateThreatLevel(target)
            });
            
            // Fire target found event
            this.app.fire('ai:targetFound', {
                ai: this.entity,
                target: target,
                position: target.getPosition()
            });
        } else {
            // Update existing tracking
            const trackingData = this.trackedTargets.get(targetId);
            trackingData.lastSeenTime = currentTime;
            trackingData.lastPosition = target.getPosition().clone();
        }
        
        // Update current target if this is more threatening
        this.updateCurrentTarget(target);
        
        // Update memory
        this.addToMemory('seen', target);
        
        // Escalate alert level
        this.escalateAlertLevel('alert');
    }

    onTargetLostSight(target) {
        const targetId = target.getGuid();
        const trackingData = this.trackedTargets.get(targetId);
        
        if (trackingData) {
            trackingData.timesLost++;
            
            // Store last known position
            this.lastKnownPositions.set(targetId, {
                position: trackingData.lastPosition.clone(),
                timestamp: Date.now(),
                confidence: this.calculatePositionConfidence(trackingData)
            });
            
            // If lost too many times, remove from tracking
            if (trackingData.timesLost > 3) {
                this.trackedTargets.delete(targetId);
                
                if (this.currentTarget === target) {
                    this.currentTarget = null;
                    this.isSearching = true;
                    this.searchTarget = trackingData.lastPosition.clone();
                }
            }
        }
    }

    // Sound Detection System
    onGunshot(soundData) {
        const distance = this.entity.getPosition().distance(soundData.position);
        const effectiveRange = this.weaponFireDetectionRange * this.getEffectiveHearingModifier();
        
        if (distance <= effectiveRange) {
            const confidence = 1.0 - (distance / effectiveRange);
            this.processSoundEvent({
                type: 'gunshot',
                position: soundData.position,
                source: soundData.source,
                confidence: confidence,
                threat: 'high',
                investigation: true
            });
        }
    }

    onFootstep(soundData) {
        const distance = this.entity.getPosition().distance(soundData.position);
        const effectiveRange = this.footstepDetectionRange * this.getEffectiveHearingModifier();
        
        if (distance <= effectiveRange) {
            const confidence = 1.0 - (distance / effectiveRange);
            this.processSoundEvent({
                type: 'footstep',
                position: soundData.position,
                source: soundData.source,
                confidence: confidence,
                threat: 'low',
                investigation: false
            });
        }
    }

    onExplosion(soundData) {
        const distance = this.entity.getPosition().distance(soundData.position);
        const effectiveRange = this.hearingRange * 3 * this.getEffectiveHearingModifier();
        
        if (distance <= effectiveRange) {
            const confidence = 1.0;
            this.processSoundEvent({
                type: 'explosion',
                position: soundData.position,
                source: soundData.source,
                confidence: confidence,
                threat: 'critical',
                investigation: true
            });
        }
    }

    onReload(soundData) {
        const distance = this.entity.getPosition().distance(soundData.position);
        const effectiveRange = this.hearingRange * 0.3 * this.getEffectiveHearingModifier();
        
        if (distance <= effectiveRange) {
            const confidence = 1.0 - (distance / effectiveRange);
            this.processSoundEvent({
                type: 'reload',
                position: soundData.position,
                source: soundData.source,
                confidence: confidence,
                threat: 'medium',
                investigation: true
            });
        }
    }

    onInteraction(soundData) {
        const distance = this.entity.getPosition().distance(soundData.position);
        const effectiveRange = this.hearingRange * 0.5 * this.getEffectiveHearingModifier();
        
        if (distance <= effectiveRange) {
            const confidence = 1.0 - (distance / effectiveRange);
            this.processSoundEvent({
                type: 'interaction',
                position: soundData.position,
                source: soundData.source,
                confidence: confidence,
                threat: 'low',
                investigation: true
            });
        }
    }

    processSoundEvent(soundEvent) {
        // Add to memory
        this.addToMemory('heard', soundEvent);
        
        // Update alert level based on threat
        switch (soundEvent.threat) {
            case 'critical':
                this.escalateAlertLevel('combat');
                break;
            case 'high':
                this.escalateAlertLevel('alert');
                break;
            case 'medium':
                this.escalateAlertLevel('suspicious');
                break;
            case 'low':
                if (this.alertLevel === 'unaware') {
                    this.escalateAlertLevel('suspicious');
                }
                break;
        }
        
        // Add investigation point if needed
        if (soundEvent.investigation && soundEvent.confidence > 0.3) {
            this.addInvestigationPoint(soundEvent.position, soundEvent.type);
        }
        
        // Alert nearby AI
        if (soundEvent.threat === 'high' || soundEvent.threat === 'critical') {
            this.alertNearbyAI(soundEvent);
        }
    }

    // Target Tracking and Management
    updateTargetTracking() {
        // Update all tracked targets
        this.trackedTargets.forEach((trackingData, targetId) => {
            const target = trackingData.entity;
            
            // Check if target is still valid
            if (!target || !target.enabled) {
                this.trackedTargets.delete(targetId);
                return;
            }
            
            // Update threat level
            trackingData.threatLevel = this.calculateThreatLevel(target);
            
            // Check if we should continue tracking
            const timeSinceLastSeen = Date.now() - trackingData.lastSeenTime;
            if (timeSinceLastSeen > this.memoryDuration) {
                this.trackedTargets.delete(targetId);
                
                if (this.currentTarget === target) {
                    this.selectNewTarget();
                }
            }
        });
        
        // Select best target
        this.selectBestTarget();
    }

    updateCurrentTarget(newTarget) {
        const newThreat = this.calculateThreatLevel(newTarget);
        const currentThreat = this.currentTarget ? 
            this.calculateThreatLevel(this.currentTarget) : 0;
        
        if (newThreat > currentThreat) {
            this.currentTarget = newTarget;
            this.isSearching = false;
            this.searchTarget = null;
        }
    }

    selectBestTarget() {
        let bestTarget = null;
        let highestThreat = 0;
        
        this.trackedTargets.forEach((trackingData) => {
            if (trackingData.threat > highestThreat) {
                highestThreat = trackingData.threat;
                bestTarget = trackingData.entity;
            }
        });
        
        if (bestTarget !== this.currentTarget) {
            this.currentTarget = bestTarget;
            
            if (bestTarget) {
                this.isSearching = false;
                this.searchTarget = null;
            }
        }
    }

    selectNewTarget() {
        this.currentTarget = null;
        this.selectBestTarget();
        
        if (!this.currentTarget && this.lastKnownPositions.size > 0) {
            // Start searching for last known position
            const recentPosition = this.getMostRecentKnownPosition();
            if (recentPosition) {
                this.isSearching = true;
                this.searchTarget = recentPosition.position;
            }
        }
    }

    calculateThreatLevel(target) {
        let threat = 1.0;
        
        // Distance factor
        const distance = this.entity.getPosition().distance(target.getPosition());
        const distanceFactor = Math.max(0.1, 1.0 - (distance / this.sightRange));
        threat *= distanceFactor;
        
        // Health factor (wounded targets are less threatening)
        if (target.script && target.script.healthSystem) {
            const healthRatio = target.script.healthSystem.getHealthRatio();
            threat *= (0.5 + healthRatio * 0.5);
        }
        
        // Weapon factor
        if (target.script && target.script.weaponManager) {
            const weapon = target.script.weaponManager.getCurrentWeapon();
            if (weapon) {
                threat *= this.getWeaponThreatMultiplier(weapon);
            }
        }
        
        // Visibility factor
        if (this.canSeeTarget(target)) {
            threat *= 1.5; // Higher threat if we can see them
        }
        
        // Recent activity factor
        const trackingData = this.trackedTargets.get(target.getGuid());
        if (trackingData) {
            const timeSinceLastSeen = Date.now() - trackingData.lastSeenTime;
            if (timeSinceLastSeen < 5000) { // Recently seen
                threat *= 1.3;
            }
        }
        
        return threat;
    }

    getWeaponThreatMultiplier(weapon) {
        // Assign threat multipliers based on weapon type
        switch (weapon.type) {
            case 'sniper_rifle':
                return 1.8;
            case 'assault_rifle':
                return 1.5;
            case 'shotgun':
                return 1.4;
            case 'lmg':
                return 1.6;
            case 'smg':
                return 1.2;
            case 'pistol':
                return 1.0;
            case 'melee':
                return 0.8;
            default:
                return 1.0;
        }
    }

    // Memory System
    updateMemorySystem(dt) {
        // Update memory decay
        this.decayMemory(dt);
        
        // Update investigation points
        this.updateInvestigationPoints(dt);
        
        // Update suspicious locations
        this.updateSuspiciousLocations(dt);
    }

    addToMemory(type, data) {
        const memoryEntry = {
            type: type,
            data: data,
            timestamp: Date.now(),
            position: data.position ? data.position.clone() : null,
            confidence: data.confidence || 1.0
        };
        
        switch (type) {
            case 'seen':
                this.memoryData.seenTargets.set(data.getGuid(), memoryEntry);
                break;
            case 'heard':
                this.memoryData.heardSounds.push(memoryEntry);
                break;
        }
    }

    decayMemory(dt) {
        const currentTime = Date.now();
        
        // Decay seen targets
        this.memoryData.seenTargets.forEach((memory, targetId) => {
            if (currentTime - memory.timestamp > this.memoryDuration) {
                this.memoryData.seenTargets.delete(targetId);
            }
        });
        
        // Decay heard sounds
        this.memoryData.heardSounds = this.memoryData.heardSounds.filter(memory => 
            currentTime - memory.timestamp < this.soundMemoryTime
        );
    }

    addInvestigationPoint(position, type) {
        const investigationPoint = {
            position: position.clone(),
            type: type,
            timestamp: Date.now(),
            priority: this.getInvestigationPriority(type),
            investigated: false
        };
        
        this.investigationPoints.push(investigationPoint);
        
        // Sort by priority
        this.investigationPoints.sort((a, b) => b.priority - a.priority);
        
        // Limit number of investigation points
        if (this.investigationPoints.length > 10) {
            this.investigationPoints = this.investigationPoints.slice(0, 10);
        }
    }

    updateInvestigationPoints(dt) {
        const currentTime = Date.now();
        
        // Remove old investigation points
        this.investigationPoints = this.investigationPoints.filter(point =>
            currentTime - point.timestamp < 60000 // 1 minute max
        );
    }

    updateSuspiciousLocations(dt) {
        // Update and decay suspicious locations
        this.suspiciousLocations = this.suspiciousLocations.filter(location =>
            Date.now() - location.timestamp < 30000 // 30 seconds
        );
    }

    getInvestigationPriority(type) {
        const priorities = {
            'gunshot': 10,
            'explosion': 15,
            'reload': 8,
            'interaction': 5,
            'footstep': 3
        };
        
        return priorities[type] || 1;
    }

    getMostRecentKnownPosition() {
        let mostRecent = null;
        let latestTime = 0;
        
        this.lastKnownPositions.forEach((positionData) => {
            if (positionData.timestamp > latestTime) {
                latestTime = positionData.timestamp;
                mostRecent = positionData;
            }
        });
        
        return mostRecent;
    }

    // Alert System
    updateAlertState(dt) {
        const currentTime = Date.now();
        
        // Check for alert cooldown
        if (this.alertLevel !== 'unaware' && 
            currentTime - this.lastAlertTime > this.alertCooldownTime) {
            
            if (!this.currentTarget && !this.isSearching) {
                this.deescalateAlertLevel();
            }
        }
        
        // Update alert behavior based on level
        this.updateAlertBehavior();
    }

    escalateAlertLevel(newLevel) {
        const levels = ['unaware', 'suspicious', 'alert', 'combat'];
        const currentIndex = levels.indexOf(this.alertLevel);
        const newIndex = levels.indexOf(newLevel);
        
        if (newIndex > currentIndex) {
            this.alertLevel = newLevel;
            this.lastAlertTime = Date.now();
            
            // Fire alert event
            this.app.fire('ai:alertLevelChanged', {
                ai: this.entity,
                oldLevel: levels[currentIndex],
                newLevel: newLevel
            });
            
            // Alert nearby AI
            if (newLevel === 'alert' || newLevel === 'combat') {
                this.alertNearbyAI({
                    type: 'alert',
                    level: newLevel,
                    position: this.entity.getPosition()
                });
            }
        }
    }

    deescalateAlertLevel() {
        const levels = ['unaware', 'suspicious', 'alert', 'combat'];
        const currentIndex = levels.indexOf(this.alertLevel);
        
        if (currentIndex > 0) {
            const newLevel = levels[currentIndex - 1];
            this.alertLevel = newLevel;
            
            this.app.fire('ai:alertLevelChanged', {
                ai: this.entity,
                oldLevel: levels[currentIndex],
                newLevel: newLevel
            });
        }
    }

    updateAlertBehavior() {
        // Adjust perception based on alert level
        switch (this.alertLevel) {
            case 'unaware':
                this.losUpdateRate = 5;
                this.targetUpdateRate = 3;
                break;
            case 'suspicious':
                this.losUpdateRate = 8;
                this.targetUpdateRate = 5;
                break;
            case 'alert':
                this.losUpdateRate = 12;
                this.targetUpdateRate = 8;
                break;
            case 'combat':
                this.losUpdateRate = 15;
                this.targetUpdateRate = 10;
                break;
        }
    }

    alertNearbyAI(alertData) {
        const nearbyAI = this.gameManager?.getNearbyAI(
            this.entity.getPosition(), 
            this.alertRadius
        ) || [];
        
        nearbyAI.forEach(ai => {
            if (ai !== this.entity && ai.script && ai.script.aiPerception) {
                ai.script.aiPerception.receiveAlert(alertData);
            }
        });
    }

    receiveAlert(alertData) {
        // Process alert from another AI
        switch (alertData.type) {
            case 'alert':
                this.escalateAlertLevel('suspicious');
                this.addInvestigationPoint(alertData.position, 'alert');
                break;
            case 'targetFound':
                if (alertData.target) {
                    this.addToMemory('heard', {
                        type: 'target_report',
                        position: alertData.position,
                        source: alertData.target,
                        confidence: 0.8
                    });
                }
                break;
        }
    }

    // Environmental Modifiers
    updateEnvironmentalModifiers() {
        // Update lighting modifier
        this.updateLightingModifier();
        
        // Update weather modifier
        this.updateWeatherModifier();
        
        // Update noise modifier
        this.updateNoiseModifier();
    }

    updateLightingModifier() {
        // This would be based on current lighting conditions
        // For now, use a simplified system
        const timeOfDay = this.app.scene.ambientLight;
        const brightness = (timeOfDay.r + timeOfDay.g + timeOfDay.b) / 3;
        
        if (brightness < 0.3) {
            this.lightingModifier = 0.6; // Reduced sight in darkness
        } else if (brightness > 0.8) {
            this.lightingModifier = 1.2; // Enhanced sight in bright light
        } else {
            this.lightingModifier = 1.0;
        }
    }

    updateWeatherModifier() {
        // This would be based on current weather conditions
        // Placeholder implementation
        this.weatherModifier = 1.0;
    }

    updateNoiseModifier() {
        // This would be based on ambient noise levels
        // Placeholder implementation
        this.noiseModifier = 1.0;
    }

    // Environmental event handlers
    onLightingChange(lightingData) {
        this.updateLightingModifier();
    }

    onWeatherChange(weatherData) {
        switch (weatherData.type) {
            case 'rain':
                this.weatherModifier = 0.7;
                this.noiseModifier = 1.3; // Rain masks sounds
                break;
            case 'fog':
                this.weatherModifier = 0.5;
                break;
            case 'clear':
                this.weatherModifier = 1.0;
                this.noiseModifier = 1.0;
                break;
        }
    }

    // AI communication event handlers
    onAIAlert(alertData) {
        if (alertData.ai !== this.entity) {
            this.receiveAlert(alertData);
        }
    }

    onTargetLost(targetData) {
        if (targetData.target === this.currentTarget) {
            this.onTargetLostSight(targetData.target);
        }
    }

    onTargetFound(targetData) {
        if (targetData.ai !== this.entity) {
            // Another AI found a target, investigate
            this.addInvestigationPoint(targetData.position, 'target_report');
        }
    }

    onPlayerDied(playerData) {
        const playerId = playerData.player.getGuid();
        
        // Remove from tracking
        this.trackedTargets.delete(playerId);
        this.lastKnownPositions.delete(playerId);
        
        if (this.currentTarget === playerData.player) {
            this.selectNewTarget();
        }
    }

    onPlayerRespawn(playerData) {
        // Reset any memory of this player
        const playerId = playerData.player.getGuid();
        this.trackedTargets.delete(playerId);
        this.lastKnownPositions.delete(playerId);
    }

    // Utility methods
    getEffectiveSightRange() {
        return this.sightRange * this.difficultyModifier * this.lightingModifier * this.weatherModifier;
    }

    getEffectiveSightAngle() {
        return this.sightAngle * this.difficultyModifier;
    }

    getEffectiveHearingModifier() {
        return this.difficultyModifier * this.noiseModifier;
    }

    calculatePositionConfidence(trackingData) {
        const timeSinceLastSeen = Date.now() - trackingData.lastSeenTime;
        const maxTime = 10000; // 10 seconds
        
        return Math.max(0, 1.0 - (timeSinceLastSeen / maxTime));
    }

    cleanupMemory() {
        // Clean up old data to prevent memory leaks
        const currentTime = Date.now();
        
        // Clean up investigation points
        this.investigationPoints = this.investigationPoints.filter(point =>
            currentTime - point.timestamp < 60000
        );
        
        // Clean up suspicious locations
        this.suspiciousLocations = this.suspiciousLocations.filter(location =>
            currentTime - location.timestamp < 30000
        );
        
        // Clean up last known positions
        this.lastKnownPositions.forEach((positionData, targetId) => {
            if (currentTime - positionData.timestamp > this.memoryDuration) {
                this.lastKnownPositions.delete(targetId);
            }
        });
    }

    createVisionConeMaterial() {
        const material = new pc.StandardMaterial();
        material.diffuse = new pc.Color(1, 1, 0); // Yellow
        material.opacity = 0.3;
        material.transparent = true;
        material.cull = pc.CULLFACE_NONE;
        return material;
    }

    // Public API methods
    getCurrentTarget() {
        return this.currentTarget;
    }

    getAlertLevel() {
        return this.alertLevel;
    }

    getTrackedTargets() {
        return Array.from(this.trackedTargets.values());
    }

    getInvestigationPoints() {
        return [...this.investigationPoints];
    }

    getLastKnownPosition(targetId) {
        return this.lastKnownPositions.get(targetId);
    }

    hasLineOfSight(target) {
        return this.canSeeTarget(target);
    }

    getPerceptionState() {
        return {
            alertLevel: this.alertLevel,
            currentTarget: this.currentTarget ? this.currentTarget.getGuid() : null,
            trackedTargets: this.trackedTargets.size,
            isSearching: this.isSearching,
            investigationPoints: this.investigationPoints.length,
            memoryEntries: this.memoryData.seenTargets.size + this.memoryData.heardSounds.length
        };
    }

    setDebugMode(enabled) {
        if (this.visionConeEntity) {
            this.visionConeEntity.enabled = enabled;
        }
    }

    // Network synchronization for multiplayer AI
    getNetworkState() {
        return {
            alertLevel: this.alertLevel,
            currentTarget: this.currentTarget ? this.currentTarget.getGuid() : null,
            isSearching: this.isSearching,
            searchTarget: this.searchTarget
        };
    }

    applyNetworkState(state) {
        this.alertLevel = state.alertLevel;
        this.isSearching = state.isSearching;
        this.searchTarget = state.searchTarget;
        
        // Find current target by GUID if provided
        if (state.currentTarget) {
            const players = this.gameManager?.getAllPlayers() || [];
            this.currentTarget = players.find(p => p.getGuid() === state.currentTarget) || null;
        } else {
            this.currentTarget = null;
        }
    }
}

pc.registerScript(AIPerception, 'AIPerception');
