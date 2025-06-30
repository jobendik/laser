/**
 * Client Network Manager - Client-Side Networking
 * Handles server communication, state prediction, lag compensation, and multiplayer synchronization
 */

class ClientNetworkManager {
    constructor() {
        this.connection = null;
        this.connectionState = 'disconnected';
        this.serverEndpoint = 'ws://localhost:2567';
        this.roomName = 'gameRoom';
        this.playerId = null;
        this.sessionId = null;
        
        this.networkStats = {
            ping: 0,
            packetLoss: 0,
            bandwidth: 0,
            jitter: 0,
            lastPingTime: 0,
            pingHistory: []
        };
        
        this.prediction = {
            enabled: true,
            maxPredictionTime: 200, // milliseconds
            reconciliationBuffer: [],
            lastServerSnapshot: null,
            inputSequence: 0
        };
        
        this.interpolation = {
            enabled: true,
            bufferSize: 3,
            snapshots: [],
            renderTime: 0
        };
        
        this.messageQueue = {
            outbound: [],
            reliable: [],
            unreliable: [],
            maxQueueSize: 1000
        };
        
        this.compression = {
            enabled: true,
            threshold: 100, // bytes
            level: 6
        };
        
        this.security = {
            encryptionEnabled: false,
            tokenRefreshInterval: 300000, // 5 minutes
            maxReconnectAttempts: 5,
            reconnectDelay: 2000
        };
        
        this.syncedObjects = new Map();
        this.inputBuffer = [];
        this.serverTime = 0;
        this.timeOffset = 0;
        
        this.events = new EventTarget();
        
        this.init();
    }
    
    init() {
        this.setupHeartbeat();
        this.bindInputEvents();
    }
    
    // Connection Management
    async connect(endpoint = null, options = {}) {
        if (this.connectionState === 'connected' || this.connectionState === 'connecting') {
            console.warn('Already connected or connecting');
            return;
        }
        
        this.connectionState = 'connecting';
        const serverUrl = endpoint || this.serverEndpoint;
        
        try {
            // Use Colyseus or raw WebSocket
            if (window.Colyseus) {
                this.connection = new Colyseus.Client(serverUrl);
                this.room = await this.connection.joinOrCreate(this.roomName, options);
                this.setupColyseusHandlers();
            } else {
                this.connection = new WebSocket(serverUrl);
                this.setupWebSocketHandlers();
            }
            
            this.events.dispatchEvent(new CustomEvent('connecting', {
                detail: { endpoint: serverUrl }
            }));
            
        } catch (error) {
            this.handleConnectionError(error);
        }
    }
    
    setupColyseusHandlers() {
        if (!this.room) return;
        
        this.room.onJoin = () => {
            this.connectionState = 'connected';
            this.sessionId = this.room.sessionId;
            
            this.events.dispatchEvent(new CustomEvent('connected', {
                detail: { sessionId: this.sessionId }
            }));
            
            this.startNetworkLoop();
        };
        
        this.room.onLeave = (code) => {
            this.connectionState = 'disconnected';
            this.events.dispatchEvent(new CustomEvent('disconnected', {
                detail: { code: code }
            }));
        };
        
        this.room.onError = (code, message) => {
            this.handleConnectionError({ code, message });
        };
        
        this.room.onMessage = (type, message) => {
            this.handleServerMessage(type, message);
        };
        
        this.room.onStateChange = (state) => {
            this.handleStateUpdate(state);
        };
    }
    
    setupWebSocketHandlers() {
        this.connection.onopen = () => {
            this.connectionState = 'connected';
            this.events.dispatchEvent(new CustomEvent('connected'));
            this.startNetworkLoop();
        };
        
        this.connection.onclose = (event) => {
            this.connectionState = 'disconnected';
            this.events.dispatchEvent(new CustomEvent('disconnected', {
                detail: { code: event.code, reason: event.reason }
            }));
        };
        
        this.connection.onerror = (error) => {
            this.handleConnectionError(error);
        };
        
        this.connection.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleServerMessage(data.type, data.payload);
            } catch (error) {
                console.error('Failed to parse server message:', error);
            }
        };
    }
    
    disconnect() {
        if (this.connection) {
            if (this.room) {
                this.room.leave();
            } else {
                this.connection.close();
            }
        }
        
        this.connectionState = 'disconnected';
        this.stopNetworkLoop();
    }
    
    // Message Handling
    sendMessage(type, data, reliable = true) {
        if (this.connectionState !== 'connected') {
            console.warn('Cannot send message: not connected');
            return;
        }
        
        const message = {
            type: type,
            data: data,
            timestamp: this.getNetworkTime(),
            sequence: reliable ? this.getReliableSequence() : this.getUnreliableSequence()
        };
        
        if (reliable) {
            this.messageQueue.reliable.push(message);
        } else {
            this.messageQueue.unreliable.push(message);
        }
        
        this.processMessageQueue();
    }
    
    sendInput(inputData) {
        if (!this.prediction.enabled) {
            this.sendMessage('input', inputData, false);
            return;
        }
        
        // Client-side prediction
        const input = {
            ...inputData,
            sequence: this.prediction.inputSequence++,
            timestamp: this.getNetworkTime()
        };
        
        // Store for reconciliation
        this.prediction.reconciliationBuffer.push({
            input: input,
            state: this.getCurrentGameState()
        });
        
        // Apply input locally
        this.applyInputLocally(input);
        
        // Send to server
        this.sendMessage('input', input, false);
        
        // Cleanup old predictions
        this.cleanupPredictionBuffer();
    }
    
    handleServerMessage(type, data) {
        switch (type) {
            case 'gameState':
                this.handleGameStateUpdate(data);
                break;
            case 'playerUpdate':
                this.handlePlayerUpdate(data);
                break;
            case 'ping':
                this.handlePingResponse(data);
                break;
            case 'reconciliation':
                this.handleServerReconciliation(data);
                break;
            case 'chatMessage':
                this.handleChatMessage(data);
                break;
            case 'playerJoined':
                this.handlePlayerJoined(data);
                break;
            case 'playerLeft':
                this.handlePlayerLeft(data);
                break;
            case 'error':
                this.handleServerError(data);
                break;
            default:
                this.events.dispatchEvent(new CustomEvent('messageReceived', {
                    detail: { type, data }
                }));
        }
    }
    
    // State Management
    handleGameStateUpdate(stateData) {
        const snapshot = {
            timestamp: stateData.timestamp || this.getNetworkTime(),
            state: stateData,
            serverTime: stateData.serverTime
        };
        
        // Update server time offset
        if (stateData.serverTime) {
            this.updateTimeOffset(stateData.serverTime);
        }
        
        if (this.interpolation.enabled) {
            this.addInterpolationSnapshot(snapshot);
        } else {
            this.applyGameState(stateData);
        }
        
        this.prediction.lastServerSnapshot = snapshot;
    }
    
    handleServerReconciliation(data) {
        if (!this.prediction.enabled) return;
        
        const serverSequence = data.lastProcessedInput;
        
        // Find corresponding local prediction
        const predictionIndex = this.prediction.reconciliationBuffer.findIndex(
            p => p.input.sequence === serverSequence
        );
        
        if (predictionIndex === -1) return;
        
        // Check if server state matches our prediction
        const serverState = data.state;
        const localState = this.prediction.reconciliationBuffer[predictionIndex].state;
        
        if (!this.statesMatch(serverState, localState)) {
            console.log('Prediction mismatch - performing reconciliation');
            this.performReconciliation(serverState, predictionIndex);
        }
        
        // Clean up processed predictions
        this.prediction.reconciliationBuffer.splice(0, predictionIndex + 1);
    }
    
    performReconciliation(authorativeState, fromIndex) {
        // Apply authoritative server state
        this.applyGameState(authorativeState);
        
        // Re-apply any inputs that came after the reconciliation point
        for (let i = fromIndex + 1; i < this.prediction.reconciliationBuffer.length; i++) {
            const prediction = this.prediction.reconciliationBuffer[i];
            this.applyInputLocally(prediction.input);
        }
    }
    
    addInterpolationSnapshot(snapshot) {
        this.interpolation.snapshots.push(snapshot);
        
        // Keep buffer size manageable
        if (this.interpolation.snapshots.length > this.interpolation.bufferSize) {
            this.interpolation.snapshots.shift();
        }
        
        // Sort by timestamp
        this.interpolation.snapshots.sort((a, b) => a.timestamp - b.timestamp);
    }
    
    updateInterpolation() {
        if (!this.interpolation.enabled || this.interpolation.snapshots.length < 2) {
            return;
        }
        
        const currentTime = this.getNetworkTime();
        const renderTime = currentTime - 100; // 100ms interpolation delay
        
        // Find the two snapshots to interpolate between
        let fromSnapshot = null;
        let toSnapshot = null;
        
        for (let i = 0; i < this.interpolation.snapshots.length - 1; i++) {
            if (this.interpolation.snapshots[i].timestamp <= renderTime &&
                this.interpolation.snapshots[i + 1].timestamp >= renderTime) {
                fromSnapshot = this.interpolation.snapshots[i];
                toSnapshot = this.interpolation.snapshots[i + 1];
                break;
            }
        }
        
        if (fromSnapshot && toSnapshot) {
            const timeDiff = toSnapshot.timestamp - fromSnapshot.timestamp;
            const t = timeDiff > 0 ? (renderTime - fromSnapshot.timestamp) / timeDiff : 0;
            
            const interpolatedState = this.interpolateStates(fromSnapshot.state, toSnapshot.state, t);
            this.applyGameState(interpolatedState);
        }
    }
    
    // Network Stats and Monitoring
    setupHeartbeat() {
        setInterval(() => {
            if (this.connectionState === 'connected') {
                this.sendPing();
                this.updateNetworkStats();
            }
        }, 1000);
    }
    
    sendPing() {
        const pingTime = Date.now();
        this.networkStats.lastPingTime = pingTime;
        this.sendMessage('ping', { timestamp: pingTime }, false);
    }
    
    handlePingResponse(data) {
        const now = Date.now();
        const ping = now - this.networkStats.lastPingTime;
        
        this.networkStats.ping = ping;
        this.networkStats.pingHistory.push(ping);
        
        // Keep ping history reasonable size
        if (this.networkStats.pingHistory.length > 10) {
            this.networkStats.pingHistory.shift();
        }
        
        // Calculate jitter
        if (this.networkStats.pingHistory.length > 1) {
            const pingDiffs = [];
            for (let i = 1; i < this.networkStats.pingHistory.length; i++) {
                pingDiffs.push(Math.abs(
                    this.networkStats.pingHistory[i] - this.networkStats.pingHistory[i - 1]
                ));
            }
            this.networkStats.jitter = pingDiffs.reduce((a, b) => a + b, 0) / pingDiffs.length;
        }
        
        this.events.dispatchEvent(new CustomEvent('pingUpdate', {
            detail: { ping: this.networkStats.ping, jitter: this.networkStats.jitter }
        }));
    }
    
    updateNetworkStats() {
        // Calculate packet loss (simplified)
        const totalSent = this.messageQueue.reliable.length + this.messageQueue.unreliable.length;
        // This would need proper tracking of acknowledgments
        this.networkStats.packetLoss = 0; // Placeholder
        
        // Bandwidth estimation would require tracking data sent/received
        this.networkStats.bandwidth = 0; // Placeholder
    }
    
    // Utility Methods
    getNetworkTime() {
        return Date.now() + this.timeOffset;
    }
    
    updateTimeOffset(serverTime) {
        const clientTime = Date.now();
        this.timeOffset = serverTime - clientTime;
    }
    
    getReliableSequence() {
        return this.messageQueue.reliable.length;
    }
    
    getUnreliableSequence() {
        return this.messageQueue.unreliable.length;
    }
    
    processMessageQueue() {
        // Process reliable messages
        while (this.messageQueue.reliable.length > 0) {
            const message = this.messageQueue.reliable.shift();
            this.sendRawMessage(message);
        }
        
        // Process unreliable messages (with rate limiting)
        const maxUnreliablePerFrame = 10;
        let processed = 0;
        
        while (this.messageQueue.unreliable.length > 0 && processed < maxUnreliablePerFrame) {
            const message = this.messageQueue.unreliable.shift();
            this.sendRawMessage(message);
            processed++;
        }
    }
    
    sendRawMessage(message) {
        try {
            let data = JSON.stringify(message);
            
            // Compression if enabled and message is large enough
            if (this.compression.enabled && data.length > this.compression.threshold) {
                data = this.compressMessage(data);
            }
            
            if (this.room) {
                this.room.send(message.type, message.data);
            } else {
                this.connection.send(data);
            }
        } catch (error) {
            console.error('Failed to send message:', error);
        }
    }
    
    compressMessage(data) {
        // Placeholder for compression implementation
        // In a real implementation, you'd use a compression library
        return data;
    }
    
    startNetworkLoop() {
        if (this.networkLoopId) return;
        
        const networkLoop = () => {
            if (this.connectionState === 'connected') {
                this.processMessageQueue();
                this.updateInterpolation();
                this.networkLoopId = requestAnimationFrame(networkLoop);
            }
        };
        
        this.networkLoopId = requestAnimationFrame(networkLoop);
    }
    
    stopNetworkLoop() {
        if (this.networkLoopId) {
            cancelAnimationFrame(this.networkLoopId);
            this.networkLoopId = null;
        }
    }
    
    // Game State Helpers
    getCurrentGameState() {
        // This would return the current client game state
        // Implementation depends on your game state structure
        return {
            players: this.getPlayerStates(),
            timestamp: this.getNetworkTime()
        };
    }
    
    getPlayerStates() {
        // Placeholder - would get actual player states
        return {};
    }
    
    applyGameState(state) {
        // Apply the server state to the game
        if (window.gameManager) {
            window.gameManager.applyNetworkState(state);
        }
    }
    
    applyInputLocally(input) {
        // Apply input prediction locally
        if (window.playerController) {
            window.playerController.applyNetworkInput(input);
        }
    }
    
    statesMatch(state1, state2, tolerance = 0.1) {
        // Compare two game states within tolerance
        // This is a simplified comparison
        if (!state1 || !state2) return false;
        
        // Compare positions, rotations, etc.
        return Math.abs(state1.timestamp - state2.timestamp) < tolerance;
    }
    
    interpolateStates(from, to, t) {
        // Interpolate between two game states
        // This is a simplified implementation
        return {
            ...from,
            // Interpolate specific properties
            timestamp: from.timestamp + (to.timestamp - from.timestamp) * t
        };
    }
    
    cleanupPredictionBuffer() {
        const maxAge = this.prediction.maxPredictionTime;
        const cutoff = this.getNetworkTime() - maxAge;
        
        this.prediction.reconciliationBuffer = this.prediction.reconciliationBuffer.filter(
            p => p.input.timestamp > cutoff
        );
    }
    
    bindInputEvents() {
        // Bind to input manager for sending inputs
        if (window.inputManager) {
            window.inputManager.addEventListener('networkInput', (event) => {
                this.sendInput(event.detail);
            });
        }
    }
    
    handleConnectionError(error) {
        console.error('Network error:', error);
        this.connectionState = 'error';
        
        this.events.dispatchEvent(new CustomEvent('networkError', {
            detail: { error: error }
        }));
        
        // Attempt reconnection
        this.attemptReconnection();
    }
    
    attemptReconnection() {
        if (this.reconnectAttempts >= this.security.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            return;
        }
        
        this.reconnectAttempts = (this.reconnectAttempts || 0) + 1;
        
        setTimeout(() => {
            console.log(`Reconnection attempt ${this.reconnectAttempts}`);
            this.connect();
        }, this.security.reconnectDelay * this.reconnectAttempts);
    }
    
    // Event handlers for specific message types
    handlePlayerUpdate(data) {
        if (window.gameManager) {
            window.gameManager.updateRemotePlayer(data);
        }
    }
    
    handleChatMessage(data) {
        if (window.chatSystem) {
            window.chatSystem.addMessage(data);
        }
    }
    
    handlePlayerJoined(data) {
        this.events.dispatchEvent(new CustomEvent('playerJoined', {
            detail: data
        }));
    }
    
    handlePlayerLeft(data) {
        this.events.dispatchEvent(new CustomEvent('playerLeft', {
            detail: data
        }));
    }
    
    handleServerError(data) {
        console.error('Server error:', data);
        this.events.dispatchEvent(new CustomEvent('serverError', {
            detail: data
        }));
    }
    
    // Public API
    isConnected() {
        return this.connectionState === 'connected';
    }
    
    getConnectionState() {
        return this.connectionState;
    }
    
    getNetworkStats() {
        return { ...this.networkStats };
    }
    
    enablePrediction(enabled = true) {
        this.prediction.enabled = enabled;
    }
    
    enableInterpolation(enabled = true) {
        this.interpolation.enabled = enabled;
    }
    
    setCompressionLevel(level) {
        this.compression.level = Math.max(1, Math.min(9, level));
    }
    
    // Event listeners
    addEventListener(event, callback) {
        this.events.addEventListener(event, callback);
    }
    
    removeEventListener(event, callback) {
        this.events.removeEventListener(event, callback);
    }
    
    // Debug methods
    getDebugInfo() {
        return {
            connectionState: this.connectionState,
            networkStats: this.networkStats,
            predictionEnabled: this.prediction.enabled,
            interpolationEnabled: this.interpolation.enabled,
            messageQueueSize: this.messageQueue.outbound.length,
            predictionBufferSize: this.prediction.reconciliationBuffer.length,
            interpolationBufferSize: this.interpolation.snapshots.length
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ClientNetworkManager;
} else {
    window.ClientNetworkManager = ClientNetworkManager;
}
