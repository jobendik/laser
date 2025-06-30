/**
 * StateInterpolation.js
 * Handles client-side interpolation and prediction for smooth network gameplay
 */

class StateInterpolation extends pc.ScriptType {
    static get scriptName() { return 'StateInterpolation'; }

    initialize() {
        this.networkManager = this.app.root.findByName('Game_Manager').script.networkManager;
        this.gameManager = this.app.root.findByName('Game_Manager').script.gameManager;
        
        // Interpolation settings
        this.interpolationTime = 100; // ms behind server time
        this.extrapolationLimit = 500; // max ms to extrapolate
        this.snapThreshold = 2.0; // distance threshold for position snapping
        this.angularSnapThreshold = 45; // angle threshold for rotation snapping
        
        // State buffers for each networked entity
        this.entityStates = new Map();
        this.localPredictions = new Map();
        
        // Client prediction
        this.enableClientPrediction = true;
        this.predictionBuffer = [];
        this.maxPredictionSteps = 60; // ~1 second at 60fps
        this.lastConfirmedInput = 0;
        
        // Server reconciliation
        this.serverStates = [];
        this.maxServerStates = 100;
        
        // Performance tracking
        this.interpolationStats = {
            entities: 0,
            predictions: 0,
            corrections: 0,
            snapbacks: 0
        };
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.app.on('network:entityUpdate', this.onEntityUpdate, this);
        this.app.on('network:serverState', this.onServerState, this);
        this.app.on('network:inputConfirmation', this.onInputConfirmation, this);
        this.app.on('player:input', this.onPlayerInput, this);
    }

    onEntityUpdate(data) {
        const { entityId, state, serverTime } = data;
        
        if (!this.entityStates.has(entityId)) {
            this.entityStates.set(entityId, {
                history: [],
                lastUpdate: 0,
                entity: null
            });
        }
        
        const entityData = this.entityStates.get(entityId);
        
        // Add state to history
        entityData.history.push({
            ...state,
            serverTime: serverTime,
            receivedTime: Date.now()
        });
        
        // Limit history size
        if (entityData.history.length > 20) {
            entityData.history.shift();
        }
        
        entityData.lastUpdate = Date.now();
        
        // Find the entity if not cached
        if (!entityData.entity) {
            entityData.entity = this.findEntityById(entityId);
        }
    }

    onServerState(data) {
        const { state, serverTime } = data;
        
        this.serverStates.push({
            ...state,
            serverTime: serverTime,
            receivedTime: Date.now()
        });
        
        // Limit server state history
        if (this.serverStates.length > this.maxServerStates) {
            this.serverStates.shift();
        }
        
        // Reconcile with client predictions
        this.reconcileWithServer(state, serverTime);
    }

    onInputConfirmation(data) {
        const { inputSequence, serverTime } = data;
        this.lastConfirmedInput = inputSequence;
        
        // Remove confirmed predictions from buffer
        this.predictionBuffer = this.predictionBuffer.filter(
            prediction => prediction.sequence > inputSequence
        );
    }

    onPlayerInput(data) {
        if (!this.enableClientPrediction) return;
        
        const { input, sequence } = data;
        
        // Store prediction for later reconciliation
        this.predictionBuffer.push({
            input: { ...input },
            sequence: sequence,
            timestamp: Date.now(),
            appliedState: this.getCurrentPlayerState()
        });
        
        // Limit prediction buffer size
        if (this.predictionBuffer.length > this.maxPredictionSteps) {
            this.predictionBuffer.shift();
        }
        
        // Apply local prediction immediately
        this.applyLocalPrediction(input);
    }

    update(dt) {
        const currentTime = Date.now();
        const renderTime = currentTime - this.interpolationTime;
        
        // Interpolate all networked entities
        this.interpolateEntities(renderTime);
        
        // Update client predictions
        this.updateClientPredictions(dt);
        
        // Clean up old data
        this.cleanupOldData(currentTime);
        
        // Update stats
        this.updateInterpolationStats();
    }

    interpolateEntities(renderTime) {
        let entityCount = 0;
        
        this.entityStates.forEach((entityData, entityId) => {
            if (!entityData.entity || entityData.history.length < 2) return;
            
            const interpolatedState = this.calculateInterpolatedState(
                entityData.history, 
                renderTime
            );
            
            if (interpolatedState) {
                this.applyStateToEntity(entityData.entity, interpolatedState);
                entityCount++;
            }
        });
        
        this.interpolationStats.entities = entityCount;
    }

    calculateInterpolatedState(stateHistory, renderTime) {
        // Find two states to interpolate between
        let fromState = null;
        let toState = null;
        
        for (let i = 0; i < stateHistory.length - 1; i++) {
            const current = stateHistory[i];
            const next = stateHistory[i + 1];
            
            if (current.serverTime <= renderTime && next.serverTime >= renderTime) {
                fromState = current;
                toState = next;
                break;
            }
        }
        
        // If no suitable states found, use extrapolation or latest state
        if (!fromState || !toState) {
            const latestState = stateHistory[stateHistory.length - 1];
            
            // Check if we should extrapolate
            if (latestState.serverTime < renderTime && 
                renderTime - latestState.serverTime < this.extrapolationLimit) {
                return this.extrapolateState(stateHistory, renderTime);
            }
            
            return latestState;
        }
        
        // Calculate interpolation factor
        const timeDiff = toState.serverTime - fromState.serverTime;
        const factor = timeDiff > 0 ? (renderTime - fromState.serverTime) / timeDiff : 0;
        
        // Interpolate state
        return this.interpolateStates(fromState, toState, factor);
    }

    interpolateStates(fromState, toState, factor) {
        const result = { ...fromState };
        
        // Interpolate position
        if (fromState.position && toState.position) {
            result.position = {
                x: pc.math.lerp(fromState.position.x, toState.position.x, factor),
                y: pc.math.lerp(fromState.position.y, toState.position.y, factor),
                z: pc.math.lerp(fromState.position.z, toState.position.z, factor)
            };
        }
        
        // Interpolate rotation (using quaternions for smooth rotation)
        if (fromState.rotation && toState.rotation) {
            const fromQuat = new pc.Quat();
            const toQuat = new pc.Quat();
            
            fromQuat.setFromEulerAngles(
                fromState.rotation.x, 
                fromState.rotation.y, 
                fromState.rotation.z
            );
            toQuat.setFromEulerAngles(
                toState.rotation.x, 
                toState.rotation.y, 
                toState.rotation.z
            );
            
            const resultQuat = new pc.Quat();
            resultQuat.slerp(fromQuat, toQuat, factor);
            
            result.rotation = resultQuat.getEulerAngles();
        }
        
        // Interpolate velocity
        if (fromState.velocity && toState.velocity) {
            result.velocity = {
                x: pc.math.lerp(fromState.velocity.x, toState.velocity.x, factor),
                y: pc.math.lerp(fromState.velocity.y, toState.velocity.y, factor),
                z: pc.math.lerp(fromState.velocity.z, toState.velocity.z, factor)
            };
        }
        
        // Copy discrete values from the most recent state
        result.health = toState.health;
        result.weapon = toState.weapon;
        result.animation = toState.animation;
        
        return result;
    }

    extrapolateState(stateHistory, renderTime) {
        const latestState = stateHistory[stateHistory.length - 1];
        const timeDelta = (renderTime - latestState.serverTime) / 1000; // Convert to seconds
        
        const extrapolatedState = { ...latestState };
        
        // Extrapolate position based on velocity
        if (latestState.velocity) {
            extrapolatedState.position = {
                x: latestState.position.x + latestState.velocity.x * timeDelta,
                y: latestState.position.y + latestState.velocity.y * timeDelta,
                z: latestState.position.z + latestState.velocity.z * timeDelta
            };
        }
        
        return extrapolatedState;
    }

    applyStateToEntity(entity, state) {
        // Check if we need to snap instead of smooth interpolation
        const currentPos = entity.getPosition();
        const targetPos = new pc.Vec3(state.position.x, state.position.y, state.position.z);
        const distance = currentPos.distance(targetPos);
        
        if (distance > this.snapThreshold) {
            // Snap to position
            entity.setPosition(targetPos);
            this.interpolationStats.snapbacks++;
        } else {
            // Smooth interpolation
            entity.setPosition(targetPos);
        }
        
        // Apply rotation
        if (state.rotation) {
            const currentRot = entity.getEulerAngles();
            const targetRot = new pc.Vec3(state.rotation.x, state.rotation.y, state.rotation.z);
            
            // Check for angular snap
            const angleDiff = Math.abs(currentRot.y - targetRot.y);
            if (angleDiff > this.angularSnapThreshold) {
                entity.setEulerAngles(targetRot);
            } else {
                entity.setEulerAngles(targetRot);
            }
        }
        
        // Apply other state properties
        if (entity.script.healthSystem && state.health !== undefined) {
            entity.script.healthSystem.setHealth(state.health);
        }
        
        if (entity.script.weaponManager && state.weapon) {
            entity.script.weaponManager.equipWeapon(state.weapon);
        }
        
        if (entity.script.playerAnimationController && state.animation) {
            entity.script.playerAnimationController.playAnimation(state.animation);
        }
    }

    updateClientPredictions(dt) {
        if (!this.enableClientPrediction) return;
        
        // Apply pending predictions
        this.predictionBuffer.forEach(prediction => {
            if (prediction.sequence > this.lastConfirmedInput) {
                // This prediction hasn't been confirmed yet, keep applying it
                this.applyLocalPrediction(prediction.input);
            }
        });
        
        this.interpolationStats.predictions = this.predictionBuffer.length;
    }

    applyLocalPrediction(input) {
        // Apply input to local player immediately for responsive controls
        const localPlayer = this.getLocalPlayer();
        if (!localPlayer) return;
        
        // Store current state for rollback if needed
        const currentState = this.getCurrentPlayerState();
        this.localPredictions.set(Date.now(), currentState);
        
        // Apply input locally
        if (localPlayer.script.playerController) {
            localPlayer.script.playerController.processInput(input);
        }
    }

    reconcileWithServer(serverState, serverTime) {
        const localPlayer = this.getLocalPlayer();
        if (!localPlayer || !serverState.players) return;
        
        const localPlayerId = this.networkManager?.localPlayerId;
        const serverPlayerState = serverState.players.find(p => p.id === localPlayerId);
        
        if (!serverPlayerState) return;
        
        // Compare server state with our predicted state
        const currentLocalState = this.getCurrentPlayerState();
        const positionError = this.calculatePositionError(
            currentLocalState.position, 
            serverPlayerState.position
        );
        
        // If error is too large, correct it
        if (positionError > this.snapThreshold) {
            this.correctClientState(serverPlayerState, serverTime);
            this.interpolationStats.corrections++;
        }
    }

    correctClientState(serverState, serverTime) {
        const localPlayer = this.getLocalPlayer();
        if (!localPlayer) return;
        
        // Set position to server state
        localPlayer.setPosition(
            serverState.position.x, 
            serverState.position.y, 
            serverState.position.z
        );
        
        // Re-apply any inputs that happened after this server state
        const inputsToReapply = this.predictionBuffer.filter(
            prediction => prediction.timestamp > serverTime
        );
        
        inputsToReapply.forEach(prediction => {
            this.applyLocalPrediction(prediction.input);
        });
    }

    calculatePositionError(localPos, serverPos) {
        return Math.sqrt(
            Math.pow(localPos.x - serverPos.x, 2) +
            Math.pow(localPos.y - serverPos.y, 2) +
            Math.pow(localPos.z - serverPos.z, 2)
        );
    }

    getCurrentPlayerState() {
        const localPlayer = this.getLocalPlayer();
        if (!localPlayer) return null;
        
        return {
            position: localPlayer.getPosition().clone(),
            rotation: localPlayer.getEulerAngles().clone(),
            velocity: localPlayer.rigidbody?.linearVelocity.clone() || new pc.Vec3(),
            health: localPlayer.script.healthSystem?.getCurrentHealth() || 100,
            weapon: localPlayer.script.weaponManager?.getCurrentWeapon()?.name || null
        };
    }

    getLocalPlayer() {
        // Find local player entity
        return this.app.root.findByName('Player'); // Adjust based on your entity structure
    }

    findEntityById(entityId) {
        // Implementation depends on your entity ID system
        // This is a simplified example
        const entities = this.app.root.findComponents('script');
        return entities.find(comp => comp.entity.networkId === entityId)?.entity || null;
    }

    cleanupOldData(currentTime) {
        const maxAge = 5000; // 5 seconds
        
        // Clean up entity state histories
        this.entityStates.forEach((entityData, entityId) => {
            entityData.history = entityData.history.filter(
                state => currentTime - state.receivedTime < maxAge
            );
            
            // Remove entities with no recent updates
            if (currentTime - entityData.lastUpdate > maxAge) {
                this.entityStates.delete(entityId);
            }
        });
        
        // Clean up server states
        this.serverStates = this.serverStates.filter(
            state => currentTime - state.receivedTime < maxAge
        );
        
        // Clean up local predictions
        const validPredictions = new Map();
        this.localPredictions.forEach((state, timestamp) => {
            if (currentTime - timestamp < maxAge) {
                validPredictions.set(timestamp, state);
            }
        });
        this.localPredictions = validPredictions;
    }

    updateInterpolationStats() {
        // Update performance statistics
        // This can be used for monitoring and debugging
    }

    // Configuration methods
    setInterpolationTime(time) {
        this.interpolationTime = Math.max(0, time);
    }

    setSnapThreshold(threshold) {
        this.snapThreshold = Math.max(0, threshold);
    }

    enablePrediction(enable) {
        this.enableClientPrediction = enable;
        if (!enable) {
            this.predictionBuffer = [];
        }
    }

    getInterpolationStats() {
        return { ...this.interpolationStats };
    }

    // Debug methods
    debugDrawInterpolation() {
        // Draw debug information for interpolation
        this.entityStates.forEach((entityData, entityId) => {
            if (entityData.entity && entityData.history.length > 1) {
                // Draw interpolation path
                for (let i = 0; i < entityData.history.length - 1; i++) {
                    const from = entityData.history[i].position;
                    const to = entityData.history[i + 1].position;
                    
                    // Draw line between states (would need a debug drawing system)
                    // this.app.systems.debug.drawLine(from, to, pc.Color.GREEN);
                }
            }
        });
    }

    destroy() {
        // Clean up event listeners
        this.app.off('network:entityUpdate', this.onEntityUpdate, this);
        this.app.off('network:serverState', this.onServerState, this);
        this.app.off('network:inputConfirmation', this.onInputConfirmation, this);
        this.app.off('player:input', this.onPlayerInput, this);
        
        // Clear data structures
        this.entityStates.clear();
        this.localPredictions.clear();
        this.predictionBuffer = [];
        this.serverStates = [];
    }
}

pc.registerScript(StateInterpolation, 'StateInterpolation');
