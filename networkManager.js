var NetworkManager = pc.createScript('networkManager');

NetworkManager.attributes.add('serverUrl', { type: 'string', default: 'ws://localhost:2567' });
NetworkManager.attributes.add('roomName', { type: 'string', default: 'fps_room' });
NetworkManager.attributes.add('maxPlayers', { type: 'number', default: 20 });
NetworkManager.attributes.add('tickRate', { type: 'number', default: 60 });
NetworkManager.attributes.add('interpolationDelay', { type: 'number', default: 100 }); // ms

NetworkManager.prototype.initialize = function() {
    // Network state
    this.isConnected = false;
    this.isHost = false;
    this.playerId = null;
    this.room = null;
    this.client = null;
    
    // Player management
    this.localPlayer = null;
    this.remotePlayers = new Map();
    this.playerTemplates = new Map();
    
    // Network synchronization
    this.lastSentTime = 0;
    this.sendRate = 1000 / this.tickRate; // ms between sends
    this.interpolationBuffer = [];
    
    // State prediction
    this.stateBuffer = [];
    this.maxBufferSize = 60; // Keep 1 second of states
    
    // Initialize client (Colyseus example)
    try {
        // This would typically use Colyseus client
        this.initializeClient();
    } catch (error) {
        console.warn('Network client not available, running in offline mode');
        this.initializeOfflineMode();
    }
    
    // Bind events
    this.app.on('network:sendPlayerState', this.sendPlayerState, this);
    this.app.on('network:sendChatMessage', this.sendChatMessage, this);
    this.app.on('network:sendWeaponFire', this.sendWeaponFire, this);
    this.app.on('player:spawned', this.onLocalPlayerSpawned, this);
    
    console.log('NetworkManager initialized');
};

NetworkManager.prototype.initializeClient = function() {
    // Example Colyseus client initialization
    // In real implementation, you would use the actual Colyseus client library
    
    /*
    this.client = new Colyseus.Client(this.serverUrl);
    this.joinRoom();
    */
    
    // Mock client for demonstration
    this.mockNetworking();
};

NetworkManager.prototype.mockNetworking = function() {
    // Mock networking for single-player testing
    this.isConnected = true;
    this.isHost = true;
    this.playerId = 'local_player';
    
    console.log('Mock networking initialized');
};

NetworkManager.prototype.initializeOfflineMode = function() {
    this.isConnected = false;
    this.isHost = true;
    this.playerId = 'offline_player';
    
    console.log('Offline mode initialized');
};

NetworkManager.prototype.joinRoom = function() {
    if (!this.client) return;
    
    /*
    // Real Colyseus implementation would look like:
    this.client.joinOrCreate(this.roomName, {
        maxClients: this.maxPlayers
    }).then(room => {
        this.room = room;
        this.onRoomJoined(room);
    }).catch(error => {
        console.error('Failed to join room:', error);
    });
    */
};

NetworkManager.prototype.onRoomJoined = function(room) {
    this.isConnected = true;
    this.playerId = room.sessionId;
    
    // Bind room events
    room.onStateChange(this.onStateChange.bind(this));
    room.onMessage('playerJoined', this.onPlayerJoined.bind(this));
    room.onMessage('playerLeft', this.onPlayerLeft.bind(this));
    room.onMessage('playerUpdate', this.onPlayerUpdate.bind(this));
    room.onMessage('weaponFired', this.onWeaponFired.bind(this));
    room.onMessage('chatMessage', this.onChatMessage.bind(this));
    
    console.log('Joined room:', room.id, 'as player:', this.playerId);
    
    // Spawn local player
    this.spawnLocalPlayer();
};

NetworkManager.prototype.update = function(dt) {
    if (!this.isConnected) return;
    
    this.updateNetworking(dt);
    this.interpolateRemotePlayers(dt);
    this.cleanupOldStates();
};

NetworkManager.prototype.updateNetworking = function(dt) {
    const currentTime = Date.now();
    
    // Send player state at regular intervals
    if (currentTime - this.lastSentTime >= this.sendRate) {
        this.sendLocalPlayerState();
        this.lastSentTime = currentTime;
    }
};

NetworkManager.prototype.sendLocalPlayerState = function() {
    if (!this.localPlayer || !this.room) return;
    
    const playerState = this.getLocalPlayerState();
    
    /*
    // Real implementation:
    this.room.send('playerUpdate', playerState);
    */
    
    // Mock: Just store locally for demonstration
    this.storePlayerState(playerState);
};

NetworkManager.prototype.getLocalPlayerState = function() {
    if (!this.localPlayer) return null;
    
    const transform = this.localPlayer.getPosition();
    const rotation = this.localPlayer.getRotation();
    const velocity = this.localPlayer.rigidbody ? this.localPlayer.rigidbody.linearVelocity : pc.Vec3.ZERO;
    
    // Get player controller state
    let movementState = {};
    if (this.localPlayer.script && this.localPlayer.script.playerController) {
        movementState = this.localPlayer.script.playerController.getMovementState();
    }
    
    // Get health state
    let healthState = {};
    if (this.localPlayer.script && this.localPlayer.script.healthSystem) {
        healthState = {
            health: this.localPlayer.script.healthSystem.currentHealth,
            shield: this.localPlayer.script.healthSystem.currentShield,
            armor: this.localPlayer.script.healthSystem.currentArmor,
            isDead: this.localPlayer.script.healthSystem.isDead
        };
    }
    
    return {
        playerId: this.playerId,
        timestamp: Date.now(),
        position: { x: transform.x, y: transform.y, z: transform.z },
        rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
        velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
        movement: movementState,
        health: healthState
    };
};

NetworkManager.prototype.storePlayerState = function(state) {
    this.stateBuffer.push(state);
    
    // Limit buffer size
    if (this.stateBuffer.length > this.maxBufferSize) {
        this.stateBuffer.shift();
    }
};

NetworkManager.prototype.onPlayerJoined = function(data) {
    console.log('Player joined:', data.playerId);
    this.spawnRemotePlayer(data);
    
    this.app.fire('player:joined', data);
};

NetworkManager.prototype.onPlayerLeft = function(data) {
    console.log('Player left:', data.playerId);
    this.removeRemotePlayer(data.playerId);
    
    this.app.fire('player:left', data);
};

NetworkManager.prototype.onPlayerUpdate = function(data) {
    this.updateRemotePlayer(data);
};

NetworkManager.prototype.onWeaponFired = function(data) {
    this.handleRemoteWeaponFire(data);
};

NetworkManager.prototype.onChatMessage = function(data) {
    this.app.fire('ui:chatMessage', data);
};

NetworkManager.prototype.spawnLocalPlayer = function() {
    const spawnPoint = this.getSpawnPoint();
    
    // Find or create local player entity
    this.localPlayer = this.app.root.findByName('Local_Player');
    if (!this.localPlayer) {
        this.localPlayer = this.createPlayerEntity('Local_Player', true);
    }
    
    if (spawnPoint) {
        this.localPlayer.setPosition(spawnPoint.getPosition());
        this.localPlayer.setRotation(spawnPoint.getRotation());
    }
    
    this.app.fire('player:spawned', {
        entity: this.localPlayer,
        playerId: this.playerId,
        isLocal: true
    });
};

NetworkManager.prototype.spawnRemotePlayer = function(playerData) {
    const playerEntity = this.createPlayerEntity(playerData.playerId, false);
    this.remotePlayers.set(playerData.playerId, {
        entity: playerEntity,
        lastState: null,
        interpolationStates: []
    });
    
    this.app.fire('player:spawned', {
        entity: playerEntity,
        playerId: playerData.playerId,
        isLocal: false
    });
};

NetworkManager.prototype.removeRemotePlayer = function(playerId) {
    const playerData = this.remotePlayers.get(playerId);
    if (playerData) {
        playerData.entity.destroy();
        this.remotePlayers.delete(playerId);
    }
};

NetworkManager.prototype.createPlayerEntity = function(playerId, isLocal) {
    // In real implementation, this would instantiate from a template
    const playerEntity = new pc.Entity(playerId);
    
    // Add basic components
    playerEntity.addComponent('model', {
        type: 'capsule'
    });
    
    playerEntity.addComponent('rigidbody', {
        type: 'dynamic',
        mass: 70
    });
    
    playerEntity.addComponent('collision', {
        type: 'capsule',
        height: 1.8,
        radius: 0.3
    });
    
    // Add scripts for local player only
    if (isLocal) {
        playerEntity.addComponent('script');
        playerEntity.script.create('playerController');
        playerEntity.script.create('healthSystem');
    }
    
    // Find appropriate parent container
    const playerContainer = this.app.root.findByName('Player_Container');
    if (playerContainer) {
        playerContainer.addChild(playerEntity);
    } else {
        this.app.root.addChild(playerEntity);
    }
    
    return playerEntity;
};

NetworkManager.prototype.updateRemotePlayer = function(playerState) {
    const playerData = this.remotePlayers.get(playerState.playerId);
    if (!playerData) return;
    
    // Add state to interpolation buffer
    playerData.interpolationStates.push({
        ...playerState,
        receivedTime: Date.now()
    });
    
    // Limit buffer size
    if (playerData.interpolationStates.length > 10) {
        playerData.interpolationStates.shift();
    }
    
    playerData.lastState = playerState;
};

NetworkManager.prototype.interpolateRemotePlayers = function(dt) {
    const currentTime = Date.now();
    const interpolationTime = currentTime - this.interpolationDelay;
    
    this.remotePlayers.forEach((playerData, playerId) => {
        this.interpolatePlayer(playerData, interpolationTime);
    });
};

NetworkManager.prototype.interpolatePlayer = function(playerData, targetTime) {
    const states = playerData.interpolationStates;
    if (states.length < 2) return;
    
    // Find two states to interpolate between
    let fromState = null;
    let toState = null;
    
    for (let i = 0; i < states.length - 1; i++) {
        if (states[i].timestamp <= targetTime && states[i + 1].timestamp >= targetTime) {
            fromState = states[i];
            toState = states[i + 1];
            break;
        }
    }
    
    if (!fromState || !toState) {
        // Use most recent state
        const latestState = states[states.length - 1];
        this.applyPlayerState(playerData.entity, latestState);
        return;
    }
    
    // Calculate interpolation factor
    const timeDiff = toState.timestamp - fromState.timestamp;
    const factor = timeDiff > 0 ? (targetTime - fromState.timestamp) / timeDiff : 0;
    
    // Interpolate position and rotation
    const interpolatedState = this.interpolateState(fromState, toState, factor);
    this.applyPlayerState(playerData.entity, interpolatedState);
};

NetworkManager.prototype.interpolateState = function(fromState, toState, factor) {
    const lerpedPos = {
        x: pc.math.lerp(fromState.position.x, toState.position.x, factor),
        y: pc.math.lerp(fromState.position.y, toState.position.y, factor),
        z: pc.math.lerp(fromState.position.z, toState.position.z, factor)
    };
    
    // Slerp rotation
    const fromQuat = new pc.Quat(fromState.rotation.x, fromState.rotation.y, fromState.rotation.z, fromState.rotation.w);
    const toQuat = new pc.Quat(toState.rotation.x, toState.rotation.y, toState.rotation.z, toState.rotation.w);
    const lerpedRot = new pc.Quat();
    lerpedRot.slerp(fromQuat, toQuat, factor);
    
    return {
        position: lerpedPos,
        rotation: { x: lerpedRot.x, y: lerpedRot.y, z: lerpedRot.z, w: lerpedRot.w },
        movement: toState.movement, // Use latest movement state
        health: toState.health
    };
};

NetworkManager.prototype.applyPlayerState = function(entity, state) {
    // Apply position and rotation
    entity.setPosition(state.position.x, state.position.y, state.position.z);
    entity.setRotation(state.rotation.x, state.rotation.y, state.rotation.z, state.rotation.w);
    
    // Apply movement animations if available
    if (entity.anim && state.movement) {
        // Update animation state based on movement
        // This would be handled by the animation system
    }
};

NetworkManager.prototype.sendWeaponFire = function(fireData) {
    if (!this.room) return;
    
    /*
    // Real implementation:
    this.room.send('weaponFired', {
        playerId: this.playerId,
        ...fireData
    });
    */
};

NetworkManager.prototype.handleRemoteWeaponFire = function(fireData) {
    // Handle weapon fire from remote player
    this.app.fire('weapon:remoteFired', fireData);
};

NetworkManager.prototype.sendChatMessage = function(message) {
    if (!this.room) return;
    
    /*
    // Real implementation:
    this.room.send('chatMessage', {
        playerId: this.playerId,
        message: message,
        timestamp: Date.now()
    });
    */
};

NetworkManager.prototype.getSpawnPoint = function() {
    const spawnPoints = this.app.root.findByName('Spawn_Points');
    if (!spawnPoints || spawnPoints.children.length === 0) return null;
    
    // Return random spawn point
    const randomIndex = Math.floor(Math.random() * spawnPoints.children.length);
    return spawnPoints.children[randomIndex];
};

NetworkManager.prototype.cleanupOldStates = function() {
    const cutoffTime = Date.now() - 5000; // 5 seconds
    
    this.remotePlayers.forEach(playerData => {
        playerData.interpolationStates = playerData.interpolationStates.filter(
            state => state.receivedTime > cutoffTime
        );
    });
    
    // Clean up local state buffer
    this.stateBuffer = this.stateBuffer.filter(
        state => state.timestamp > cutoffTime
    );
};

NetworkManager.prototype.disconnect = function() {
    if (this.room) {
        this.room.leave();
        this.room = null;
    }
    
    this.isConnected = false;
    this.remotePlayers.clear();
    
    console.log('Disconnected from server');
};

NetworkManager.prototype.onLocalPlayerSpawned = function(data) {
    if (data.isLocal) {
        this.localPlayer = data.entity;
    }
};