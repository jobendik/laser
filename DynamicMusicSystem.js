/**
 * DynamicMusicSystem.js
 * 
 * Adaptive music system that responds to gameplay events and emotions.
 * Features seamless transitions, combat intensity tracking, and interactive composition.
 */

var DynamicMusicSystem = pc.createScript('dynamicMusicSystem');

// Music system configuration
DynamicMusicSystem.attributes.add('musicVolume', {
    type: 'number',
    default: 0.6,
    min: 0,
    max: 1,
    description: 'Master music volume'
});

DynamicMusicSystem.attributes.add('crossfadeTime', {
    type: 'number',
    default: 2.0,
    description: 'Crossfade duration between tracks'
});

DynamicMusicSystem.attributes.add('enabled', {
    type: 'boolean',
    default: true,
    description: 'Enable dynamic music system'
});

// Initialize dynamic music system
DynamicMusicSystem.prototype.initialize = function() {
    if (!this.enabled) return;
    
    // Audio context and nodes
    this.audioContext = null;
    this.masterGain = null;
    this.crossfadeNode = null;
    
    // Music tracks and layers
    this.musicTracks = new Map();
    this.activeTracks = new Map();
    this.currentState = 'menu';
    this.targetState = 'menu';
    
    // Music layers for layered composition
    this.musicLayers = {
        ambient: { track: null, volume: 0, target: 0 },
        tension: { track: null, volume: 0, target: 0 },
        action: { track: null, volume: 0, target: 0 },
        victory: { track: null, volume: 0, target: 0 },
        defeat: { track: null, volume: 0, target: 0 }
    };
    
    // Game state tracking
    this.gameState = {
        inCombat: false,
        combatIntensity: 0,
        playerHealth: 1.0,
        teamScore: 0,
        enemyScore: 0,
        timeRemaining: 0,
        objectiveProgress: 0
    };
    
    // Emotional state tracking
    this.emotionalState = {
        tension: 0,      // 0-1, how tense the situation is
        excitement: 0,   // 0-1, how exciting/fast-paced
        victory: 0,      // 0-1, how close to winning
        defeat: 0,       // 0-1, how close to losing
        mystery: 0       // 0-1, how mysterious/unknown
    };
    
    // Music transition system
    this.transitionQueue = [];
    this.isTransitioning = false;
    this.transitionProgress = 0;
    
    // Timing and beat tracking
    this.beatTracker = {
        bpm: 120,
        currentBeat: 0,
        nextBeatTime: 0,
        isOnBeat: false
    };
    
    // Performance metrics
    this.performanceMetrics = {
        activeTracks: 0,
        memoryUsage: 0,
        processingTime: 0
    };

    this.initializeAudioContext();
    this.loadMusicTracks();
    this.setupEventListeners();
    this.startUpdateLoop();
    
    console.log('Dynamic Music System initialized');
};

// Initialize audio context for music
DynamicMusicSystem.prototype.initializeAudioContext = function() {
    try {
        // Use global audio context or create new one
        this.audioContext = this.app.audioContext || new (window.AudioContext || window.webkitAudioContext)();
        
        // Create master gain node
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = this.musicVolume;
        this.masterGain.connect(this.audioContext.destination);
        
        // Create crossfade node for smooth transitions
        this.crossfadeNode = this.audioContext.createGain();
        this.crossfadeNode.connect(this.masterGain);
        
        console.log('Music audio context initialized');
    } catch (error) {
        console.error('Failed to initialize music audio context:', error);
        this.enabled = false;
    }
};

// Load music tracks and configure states
DynamicMusicSystem.prototype.loadMusicTracks = function() {
    // Define music tracks for different states
    var trackDefinitions = {
        // Menu music
        menu: {
            file: 'menu_theme.ogg',
            loop: true,
            layers: ['ambient'],
            bpm: 80,
            mood: 'calm'
        },
        
        // Exploration music
        exploration: {
            file: 'exploration_ambient.ogg',
            loop: true,
            layers: ['ambient', 'mystery'],
            bpm: 90,
            mood: 'mysterious'
        },
        
        // Combat music layers
        combat_low: {
            file: 'combat_tension.ogg',
            loop: true,
            layers: ['tension'],
            bpm: 120,
            mood: 'tense'
        },
        
        combat_medium: {
            file: 'combat_action.ogg',
            loop: true,
            layers: ['tension', 'action'],
            bpm: 140,
            mood: 'intense'
        },
        
        combat_high: {
            file: 'combat_intense.ogg',
            loop: true,
            layers: ['action'],
            bpm: 160,
            mood: 'frantic'
        },
        
        // Victory music
        victory: {
            file: 'victory_theme.ogg',
            loop: false,
            layers: ['victory'],
            bpm: 110,
            mood: 'triumphant'
        },
        
        // Defeat music
        defeat: {
            file: 'defeat_theme.ogg',
            loop: false,
            layers: ['defeat'],
            bpm: 70,
            mood: 'somber'
        },
        
        // Suspense music
        suspense: {
            file: 'suspense_theme.ogg',
            loop: true,
            layers: ['tension', 'mystery'],
            bpm: 100,
            mood: 'suspenseful'
        }
    };
    
    // Load each track definition
    Object.keys(trackDefinitions).forEach(trackName => {
        var trackDef = trackDefinitions[trackName];
        this.loadMusicTrack(trackName, trackDef);
    });
};

// Load individual music track
DynamicMusicSystem.prototype.loadMusicTrack = function(trackName, definition) {
    // In a real implementation, this would load actual audio files
    var mockTrack = {
        name: trackName,
        definition: definition,
        audioBuffer: null,
        gainNode: null,
        sourceNode: null,
        isLoaded: false,
        isPlaying: false,
        currentTime: 0,
        duration: 120 // Mock 2-minute tracks
    };
    
    // Create gain node for this track
    mockTrack.gainNode = this.audioContext.createGain();
    mockTrack.gainNode.gain.value = 0;
    mockTrack.gainNode.connect(this.crossfadeNode);
    
    this.musicTracks.set(trackName, mockTrack);
    
    // Simulate loading
    setTimeout(() => {
        mockTrack.isLoaded = true;
        console.log(`Music track loaded: ${trackName}`);
    }, Math.random() * 1000);
};

// Setup event listeners for game events
DynamicMusicSystem.prototype.setupEventListeners = function() {
    // Combat events
    this.app.on('combat:start', this.onCombatStart, this);
    this.app.on('combat:end', this.onCombatEnd, this);
    this.app.on('combat:intensity', this.onCombatIntensityChange, this);
    
    // Game state events
    this.app.on('game:start', this.onGameStart, this);
    this.app.on('game:end', this.onGameEnd, this);
    this.app.on('game:victory', this.onVictory, this);
    this.app.on('game:defeat', this.onDefeat, this);
    
    // Player events
    this.app.on('player:health', this.onPlayerHealthChange, this);
    this.app.on('player:death', this.onPlayerDeath, this);
    this.app.on('player:respawn', this.onPlayerRespawn, this);
    
    // Objective events
    this.app.on('objective:progress', this.onObjectiveProgress, this);
    this.app.on('objective:completed', this.onObjectiveCompleted, this);
    
    // Environment events
    this.app.on('zone:enter', this.onZoneEnter, this);
    this.app.on('zone:exit', this.onZoneExit, this);
    
    // Settings events
    this.app.on('settings:music', this.onMusicSettingsChange, this);
};

// Start main update loop
DynamicMusicSystem.prototype.startUpdateLoop = function() {
    // Update emotional state and music every frame
    this.updateInterval = setInterval(() => {
        this.update();
    }, 1000 / 60); // 60 FPS
};

// Main update function
DynamicMusicSystem.prototype.update = function() {
    if (!this.enabled) return;
    
    var startTime = Date.now();
    
    // Update emotional state based on game state
    this.updateEmotionalState();
    
    // Update music layers based on emotional state
    this.updateMusicLayers();
    
    // Process music transitions
    this.updateTransitions();
    
    // Update beat tracking
    this.updateBeatTracking();
    
    // Update layer volumes
    this.updateLayerVolumes();
    
    // Update performance metrics
    this.performanceMetrics.processingTime = Date.now() - startTime;
    this.performanceMetrics.activeTracks = this.activeTracks.size;
};

// Update emotional state based on game conditions
DynamicMusicSystem.prototype.updateEmotionalState = function() {
    var state = this.gameState;
    var emotion = this.emotionalState;
    
    // Calculate tension based on combat and health
    var healthTension = 1.0 - state.playerHealth;
    var combatTension = state.inCombat ? state.combatIntensity : 0;
    emotion.tension = Math.max(healthTension, combatTension);
    
    // Calculate excitement based on combat intensity
    emotion.excitement = state.combatIntensity;
    
    // Calculate victory/defeat likelihood
    if (state.enemyScore > 0 || state.teamScore > 0) {
        var totalScore = state.teamScore + state.enemyScore;
        var winRatio = state.teamScore / totalScore;
        emotion.victory = Math.max(0, winRatio - 0.5) * 2;
        emotion.defeat = Math.max(0, 0.5 - winRatio) * 2;
    }
    
    // Update mystery based on exploration vs combat
    emotion.mystery = state.inCombat ? 0 : 0.7;
    
    // Smooth emotional transitions
    var smoothingFactor = 0.95;
    Object.keys(emotion).forEach(key => {
        if (emotion[key] !== emotion['last_' + key]) {
            emotion[key] = pc.math.lerp(emotion['last_' + key] || 0, emotion[key], 1 - smoothingFactor);
            emotion['last_' + key] = emotion[key];
        }
    });
};

// Update music layers based on emotional state
DynamicMusicSystem.prototype.updateMusicLayers = function() {
    var emotion = this.emotionalState;
    
    // Set target volumes for each layer
    this.musicLayers.ambient.target = Math.max(0.3, 1.0 - emotion.excitement);
    this.musicLayers.tension.target = emotion.tension;
    this.musicLayers.action.target = emotion.excitement;
    this.musicLayers.victory.target = emotion.victory;
    this.musicLayers.defeat.target = emotion.defeat;
    
    // Determine primary track based on dominant emotion
    var dominantEmotion = this.getDominantEmotion();
    this.selectPrimaryTrack(dominantEmotion);
};

// Get the dominant emotional state
DynamicMusicSystem.prototype.getDominantEmotion = function() {
    var emotion = this.emotionalState;
    var maxValue = 0;
    var dominantEmotion = 'ambient';
    
    Object.keys(emotion).forEach(key => {
        if (key.startsWith('last_')) return;
        
        if (emotion[key] > maxValue) {
            maxValue = emotion[key];
            dominantEmotion = key;
        }
    });
    
    return dominantEmotion;
};

// Select primary track based on emotional state
DynamicMusicSystem.prototype.selectPrimaryTrack = function(dominantEmotion) {
    var targetTrack = 'exploration'; // Default
    
    if (this.gameState.inCombat) {
        if (this.emotionalState.excitement > 0.8) {
            targetTrack = 'combat_high';
        } else if (this.emotionalState.excitement > 0.4) {
            targetTrack = 'combat_medium';
        } else {
            targetTrack = 'combat_low';
        }
    } else if (this.emotionalState.victory > 0.7) {
        targetTrack = 'victory';
    } else if (this.emotionalState.defeat > 0.7) {
        targetTrack = 'defeat';
    } else if (this.emotionalState.tension > 0.6) {
        targetTrack = 'suspense';
    }
    
    // Transition to new track if different
    if (targetTrack !== this.currentState) {
        this.transitionToTrack(targetTrack);
    }
};

// Transition to a new music track
DynamicMusicSystem.prototype.transitionToTrack = function(trackName) {
    if (this.isTransitioning) {
        // Queue the transition
        this.transitionQueue.push(trackName);
        return;
    }
    
    var newTrack = this.musicTracks.get(trackName);
    if (!newTrack || !newTrack.isLoaded) {
        console.warn(`Cannot transition to track: ${trackName}`);
        return;
    }
    
    console.log(`Transitioning music: ${this.currentState} -> ${trackName}`);
    
    this.isTransitioning = true;
    this.transitionProgress = 0;
    this.targetState = trackName;
    
    // Start crossfade
    this.startCrossfade(newTrack);
};

// Start crossfade between tracks
DynamicMusicSystem.prototype.startCrossfade = function(newTrack) {
    var currentTrack = this.activeTracks.get(this.currentState);
    
    // Start new track
    this.startMusicTrack(newTrack);
    
    // Crossfade volumes
    var crossfadeDuration = this.crossfadeTime;
    var currentTime = this.audioContext.currentTime;
    
    if (currentTrack) {
        // Fade out current track
        currentTrack.gainNode.gain.setTargetAtTime(0, currentTime, crossfadeDuration / 3);
        
        // Stop current track after fade
        setTimeout(() => {
            this.stopMusicTrack(currentTrack);
        }, crossfadeDuration * 1000);
    }
    
    // Fade in new track
    newTrack.gainNode.gain.setValueAtTime(0, currentTime);
    newTrack.gainNode.gain.setTargetAtTime(1, currentTime, crossfadeDuration / 3);
    
    // Finish transition after crossfade
    setTimeout(() => {
        this.finishTransition();
    }, crossfadeDuration * 1000);
};

// Start playing a music track
DynamicMusicSystem.prototype.startMusicTrack = function(track) {
    if (track.isPlaying) return;
    
    // Create audio source (mock implementation)
    track.sourceNode = {
        start: () => {
            track.isPlaying = true;
            console.log(`Started music track: ${track.name}`);
        },
        stop: () => {
            track.isPlaying = false;
            console.log(`Stopped music track: ${track.name}`);
        }
    };
    
    track.sourceNode.start();
    this.activeTracks.set(track.name, track);
    
    // Update beat tracker with track BPM
    if (track.definition.bpm) {
        this.beatTracker.bpm = track.definition.bpm;
    }
};

// Stop playing a music track
DynamicMusicSystem.prototype.stopMusicTrack = function(track) {
    if (!track.isPlaying) return;
    
    if (track.sourceNode) {
        track.sourceNode.stop();
        track.sourceNode = null;
    }
    
    this.activeTracks.delete(track.name);
};

// Finish music transition
DynamicMusicSystem.prototype.finishTransition = function() {
    this.currentState = this.targetState;
    this.isTransitioning = false;
    this.transitionProgress = 1;
    
    // Process queued transitions
    if (this.transitionQueue.length > 0) {
        var nextTransition = this.transitionQueue.shift();
        setTimeout(() => {
            this.transitionToTrack(nextTransition);
        }, 100);
    }
};

// Update layer volumes smoothly
DynamicMusicSystem.prototype.updateLayerVolumes = function() {
    Object.keys(this.musicLayers).forEach(layerName => {
        var layer = this.musicLayers[layerName];
        var currentVolume = layer.volume;
        var targetVolume = layer.target;
        
        if (Math.abs(currentVolume - targetVolume) > 0.01) {
            layer.volume = pc.math.lerp(currentVolume, targetVolume, 0.02);
            
            // Apply volume to track if active
            if (layer.track && layer.track.gainNode) {
                layer.track.gainNode.gain.setTargetAtTime(layer.volume, this.audioContext.currentTime, 0.1);
            }
        }
    });
};

// Update beat tracking for synchronization
DynamicMusicSystem.prototype.updateBeatTracking = function() {
    var currentTime = this.audioContext.currentTime;
    var beatInterval = 60 / this.beatTracker.bpm;
    
    if (currentTime >= this.beatTracker.nextBeatTime) {
        this.beatTracker.currentBeat++;
        this.beatTracker.nextBeatTime = currentTime + beatInterval;
        this.beatTracker.isOnBeat = true;
        
        // Fire beat event for synchronized effects
        this.app.fire('music:beat', {
            beat: this.beatTracker.currentBeat,
            bpm: this.beatTracker.bpm
        });
        
        // Reset on-beat flag after short duration
        setTimeout(() => {
            this.beatTracker.isOnBeat = false;
        }, 100);
    }
};

// Event handlers
DynamicMusicSystem.prototype.onCombatStart = function() {
    this.gameState.inCombat = true;
    this.gameState.combatIntensity = 0.5;
};

DynamicMusicSystem.prototype.onCombatEnd = function() {
    this.gameState.inCombat = false;
    this.gameState.combatIntensity = 0;
};

DynamicMusicSystem.prototype.onCombatIntensityChange = function(intensity) {
    this.gameState.combatIntensity = Math.max(0, Math.min(1, intensity));
};

DynamicMusicSystem.prototype.onGameStart = function() {
    this.transitionToTrack('exploration');
};

DynamicMusicSystem.prototype.onGameEnd = function() {
    this.transitionToTrack('menu');
};

DynamicMusicSystem.prototype.onVictory = function() {
    this.transitionToTrack('victory');
};

DynamicMusicSystem.prototype.onDefeat = function() {
    this.transitionToTrack('defeat');
};

DynamicMusicSystem.prototype.onPlayerHealthChange = function(health) {
    this.gameState.playerHealth = Math.max(0, Math.min(1, health / 100));
};

DynamicMusicSystem.prototype.onPlayerDeath = function() {
    this.gameState.playerHealth = 0;
};

DynamicMusicSystem.prototype.onPlayerRespawn = function() {
    this.gameState.playerHealth = 1.0;
};

DynamicMusicSystem.prototype.onObjectiveProgress = function(progress) {
    this.gameState.objectiveProgress = Math.max(0, Math.min(1, progress));
};

DynamicMusicSystem.prototype.onObjectiveCompleted = function() {
    // Brief victory sting
    this.playMusicStinger('objective_complete');
};

DynamicMusicSystem.prototype.onZoneEnter = function(zoneName) {
    // Adjust music based on zone
    if (zoneName === 'danger_zone') {
        this.emotionalState.tension = Math.max(this.emotionalState.tension, 0.7);
    }
};

// Play short musical stinger
DynamicMusicSystem.prototype.playMusicStinger = function(stingerName) {
    // Implementation for short musical flourishes
    console.log(`Playing music stinger: ${stingerName}`);
};

// Handle music settings changes
DynamicMusicSystem.prototype.onMusicSettingsChange = function(settings) {
    if (settings.musicVolume !== undefined) {
        this.musicVolume = settings.musicVolume;
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(this.musicVolume, this.audioContext.currentTime, 0.5);
        }
    }
    
    if (settings.musicEnabled !== undefined) {
        this.enabled = settings.musicEnabled;
        if (!this.enabled) {
            this.stopAllTracks();
        }
    }
};

// Stop all playing tracks
DynamicMusicSystem.prototype.stopAllTracks = function() {
    this.activeTracks.forEach((track) => {
        this.stopMusicTrack(track);
    });
};

// Get current music state
DynamicMusicSystem.prototype.getMusicState = function() {
    return {
        currentTrack: this.currentState,
        isTransitioning: this.isTransitioning,
        emotionalState: this.emotionalState,
        gameState: this.gameState,
        activeTracks: Array.from(this.activeTracks.keys()),
        performanceMetrics: this.performanceMetrics
    };
};

// Cleanup when destroyed
DynamicMusicSystem.prototype.destroy = function() {
    if (this.updateInterval) {
        clearInterval(this.updateInterval);
    }
    
    this.stopAllTracks();
};
