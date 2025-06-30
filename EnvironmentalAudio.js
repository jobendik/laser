/**
 * EnvironmentalAudio.js
 * 
 * Ambient and environmental soundscape management system.
 * Handles dynamic weather audio, atmospheric effects, audio zones,
 * and environmental sound mixing for immersive gameplay.
 */

var EnvironmentalAudio = pc.createScript('environmentalAudio');

// Audio configuration
EnvironmentalAudio.attributes.add('masterVolume', {
    type: 'number',
    default: 0.7,
    min: 0,
    max: 1,
    description: 'Master environmental audio volume'
});

EnvironmentalAudio.attributes.add('audioQuality', {
    type: 'string',
    default: 'high',
    enum: [
        { 'low': 'Low' },
        { 'medium': 'Medium' },
        { 'high': 'High' }
    ],
    description: 'Audio quality setting'
});

EnvironmentalAudio.attributes.add('enableOcclusion', {
    type: 'boolean',
    default: true,
    description: 'Enable audio occlusion effects'
});

EnvironmentalAudio.attributes.add('reverbEnabled', {
    type: 'boolean',
    default: true,
    description: 'Enable environmental reverb'
});

// Initialize environmental audio system
EnvironmentalAudio.prototype.initialize = function() {
    // Audio context and nodes
    this.audioContext = null;
    this.masterGain = null;
    this.reverbNode = null;
    this.compressor = null;
    
    // Audio zones and regions
    this.audioZones = new Map();
    this.currentZone = null;
    this.zoneTransition = null;
    
    // Ambient audio layers
    this.ambientLayers = {
        base: null,        // Base ambient layer
        weather: null,     // Weather effects
        location: null,    // Location-specific sounds
        activity: null,    // Activity-based audio
        time: null         // Time of day ambience
    };
    
    // Weather audio states
    this.weatherStates = {
        clear: { wind: 0.2, rain: 0, storm: 0, fog: 0 },
        cloudy: { wind: 0.4, rain: 0, storm: 0, fog: 0.1 },
        rainy: { wind: 0.6, rain: 0.8, storm: 0, fog: 0.3 },
        stormy: { wind: 0.9, rain: 1.0, storm: 0.7, fog: 0.2 },
        foggy: { wind: 0.3, rain: 0, storm: 0, fog: 0.9 }
    };
    
    // Time-based audio variations
    this.timeStates = {
        dawn: { birds: 0.8, insects: 0.3, urban: 0.2, nature: 0.9 },
        day: { birds: 0.6, insects: 0.5, urban: 0.8, nature: 0.7 },
        dusk: { birds: 0.4, insects: 0.8, urban: 0.6, nature: 0.8 },
        night: { birds: 0.1, insects: 0.9, urban: 0.4, nature: 0.6 }
    };
    
    // Audio pool for performance
    this.audioPool = {
        ambient: [],
        effects: [],
        positional: []
    };
    
    // Performance tracking
    this.performanceMetrics = {
        activeAudioSources: 0,
        processingTime: 0,
        memoryUsage: 0
    };

    this.initializeAudioContext();
    this.createAudioZones();
    this.setupAmbientLayers();
    this.setupEventListeners();
    
    console.log('Environmental Audio system initialized');
};

// Initialize Web Audio API context
EnvironmentalAudio.prototype.initializeAudioContext = function() {
    try {
        // Create audio context
        var AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContext();
        
        // Create master gain node
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = this.masterVolume;
        this.masterGain.connect(this.audioContext.destination);
        
        // Create compressor for dynamic range
        this.compressor = this.audioContext.createDynamicsCompressor();
        this.compressor.threshold.value = -24;
        this.compressor.knee.value = 30;
        this.compressor.ratio.value = 12;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.25;
        this.compressor.connect(this.masterGain);
        
        // Create reverb if enabled
        if (this.reverbEnabled) {
            this.createReverbNode();
        }
        
        console.log('Web Audio API context initialized');
    } catch (error) {
        console.error('Failed to initialize audio context:', error);
    }
};

// Create convolution reverb node
EnvironmentalAudio.prototype.createReverbNode = function() {
    this.reverbNode = this.audioContext.createConvolver();
    
    // Generate impulse response for reverb
    this.generateImpulseResponse(2, 3, false).then(impulse => {
        this.reverbNode.buffer = impulse;
    });
    
    // Create reverb gain control
    this.reverbGain = this.audioContext.createGain();
    this.reverbGain.gain.value = 0.3;
    
    // Connect reverb chain
    this.reverbNode.connect(this.reverbGain);
    this.reverbGain.connect(this.compressor);
};

// Generate impulse response for reverb
EnvironmentalAudio.prototype.generateImpulseResponse = function(duration, decay, reverse) {
    return new Promise((resolve) => {
        var length = this.audioContext.sampleRate * duration;
        var impulse = this.audioContext.createBuffer(2, length, this.audioContext.sampleRate);
        
        for (var channel = 0; channel < 2; channel++) {
            var channelData = impulse.getChannelData(channel);
            for (var i = 0; i < length; i++) {
                var n = length - i;
                channelData[i] = (Math.random() * 2 - 1) * Math.pow(n / length, decay);
            }
        }
        
        if (reverse) {
            for (var channel = 0; channel < 2; channel++) {
                Array.prototype.reverse.call(impulse.getChannelData(channel));
            }
        }
        
        resolve(impulse);
    });
};

// Create audio zones for different areas
EnvironmentalAudio.prototype.createAudioZones = function() {
    // Urban zone
    this.audioZones.set('urban', {
        name: 'Urban',
        ambient: {
            traffic: 0.6,
            citylife: 0.8,
            construction: 0.3,
            sirens: 0.1
        },
        reverb: 'urban',
        occlusion: 0.7,
        bounds: new pc.BoundingBox()
    });
    
    // Forest zone
    this.audioZones.set('forest', {
        name: 'Forest',
        ambient: {
            birds: 0.8,
            insects: 0.6,
            wind: 0.7,
            rustling: 0.5
        },
        reverb: 'forest',
        occlusion: 0.3,
        bounds: new pc.BoundingBox()
    });
    
    // Industrial zone
    this.audioZones.set('industrial', {
        name: 'Industrial',
        ambient: {
            machinery: 0.9,
            steam: 0.4,
            metal: 0.6,
            electrical: 0.3
        },
        reverb: 'industrial',
        occlusion: 0.8,
        bounds: new pc.BoundingBox()
    });
    
    // Indoor zone
    this.audioZones.set('indoor', {
        name: 'Indoor',
        ambient: {
            hvac: 0.3,
            fluorescent: 0.2,
            footsteps: 0.1,
            doors: 0.1
        },
        reverb: 'room',
        occlusion: 0.9,
        bounds: new pc.BoundingBox()
    });
    
    // Underground zone
    this.audioZones.set('underground', {
        name: 'Underground',
        ambient: {
            dripping: 0.4,
            echo: 0.6,
            pipes: 0.3,
            electrical: 0.2
        },
        reverb: 'cave',
        occlusion: 0.95,
        bounds: new pc.BoundingBox()
    });
};

// Setup ambient audio layers
EnvironmentalAudio.prototype.setupAmbientLayers = function() {
    // Create gain nodes for each layer
    Object.keys(this.ambientLayers).forEach(layerName => {
        var gainNode = this.audioContext.createGain();
        gainNode.gain.value = 0;
        gainNode.connect(this.compressor);
        
        this.ambientLayers[layerName] = {
            gainNode: gainNode,
            audioSources: [],
            crossfadeTarget: 0,
            crossfadeSpeed: 1.0
        };
    });
};

// Setup event listeners
EnvironmentalAudio.prototype.setupEventListeners = function() {
    // Weather changes
    this.app.on('weather:change', this.onWeatherChange, this);
    
    // Time of day changes
    this.app.on('time:change', this.onTimeChange, this);
    
    // Player movement (for zone detection)
    this.app.on('player:move', this.checkAudioZone, this);
    
    // Game events that affect audio
    this.app.on('explosion:nearby', this.onExplosionNearby, this);
    this.app.on('combat:start', this.onCombatStart, this);
    this.app.on('combat:end', this.onCombatEnd, this);
    
    // Audio settings changes
    this.app.on('settings:audio', this.onAudioSettingsChange, this);
};

// Update environmental audio
EnvironmentalAudio.prototype.update = function(dt) {
    // Update layer crossfades
    this.updateLayerCrossfades(dt);
    
    // Update zone transitions
    this.updateZoneTransitions(dt);
    
    // Update positional audio
    this.updatePositionalAudio(dt);
    
    // Update weather audio
    this.updateWeatherAudio(dt);
    
    // Update performance metrics
    this.updatePerformanceMetrics();
};

// Update audio layer crossfades
EnvironmentalAudio.prototype.updateLayerCrossfades = function(dt) {
    Object.keys(this.ambientLayers).forEach(layerName => {
        var layer = this.ambientLayers[layerName];
        var currentGain = layer.gainNode.gain.value;
        var targetGain = layer.crossfadeTarget;
        
        if (Math.abs(currentGain - targetGain) > 0.01) {
            var newGain = pc.math.lerp(currentGain, targetGain, layer.crossfadeSpeed * dt);
            layer.gainNode.gain.value = newGain;
        }
    });
};

// Update zone transitions
EnvironmentalAudio.prototype.updateZoneTransitions = function(dt) {
    if (!this.zoneTransition) return;
    
    this.zoneTransition.progress += dt / this.zoneTransition.duration;
    
    if (this.zoneTransition.progress >= 1.0) {
        // Transition complete
        this.finishZoneTransition();
    } else {
        // Update transition mixing
        this.updateTransitionMixing();
    }
};

// Check which audio zone the player is in
EnvironmentalAudio.prototype.checkAudioZone = function(playerPosition) {
    var newZone = null;
    
    // Check each zone for containment
    for (var [zoneName, zone] of this.audioZones) {
        if (zone.bounds.containsPoint(playerPosition)) {
            newZone = zoneName;
            break;
        }
    }
    
    // If zone changed, start transition
    if (newZone !== this.currentZone) {
        this.startZoneTransition(newZone);
    }
};

// Start transition to new audio zone
EnvironmentalAudio.prototype.startZoneTransition = function(newZoneName) {
    this.zoneTransition = {
        fromZone: this.currentZone,
        toZone: newZoneName,
        progress: 0,
        duration: 2.0 // 2 second transition
    };
    
    console.log(`Starting audio zone transition: ${this.currentZone} -> ${newZoneName}`);
};

// Finish zone transition
EnvironmentalAudio.prototype.finishZoneTransition = function() {
    this.currentZone = this.zoneTransition.toZone;
    this.zoneTransition = null;
    
    // Apply new zone audio settings
    this.applyZoneAudioSettings();
};

// Apply audio settings for current zone
EnvironmentalAudio.prototype.applyZoneAudioSettings = function() {
    if (!this.currentZone) return;
    
    var zone = this.audioZones.get(this.currentZone);
    if (!zone) return;
    
    // Update ambient layer targets based on zone
    Object.keys(zone.ambient).forEach(soundType => {
        var targetVolume = zone.ambient[soundType];
        this.setAmbientLayerTarget('location', targetVolume);
    });
    
    // Update reverb settings
    this.updateReverbForZone(zone);
    
    // Update occlusion settings
    this.updateOcclusionForZone(zone);
};

// Handle weather changes
EnvironmentalAudio.prototype.onWeatherChange = function(weatherType, intensity) {
    var weatherState = this.weatherStates[weatherType];
    if (!weatherState) return;
    
    // Update weather layer based on state
    Object.keys(weatherState).forEach(effectType => {
        var volume = weatherState[effectType] * intensity;
        this.playWeatherEffect(effectType, volume);
    });
    
    console.log(`Weather audio updated: ${weatherType} (${intensity})`);
};

// Handle time of day changes
EnvironmentalAudio.prototype.onTimeChange = function(timeOfDay, hour) {
    var timeState = this.timeStates[timeOfDay];
    if (!timeState) return;
    
    // Update time-based ambient sounds
    Object.keys(timeState).forEach(soundType => {
        var volume = timeState[soundType];
        this.setTimeAmbientVolume(soundType, volume);
    });
    
    console.log(`Time audio updated: ${timeOfDay} (${hour}:00)`);
};

// Play weather effect
EnvironmentalAudio.prototype.playWeatherEffect = function(effectType, volume) {
    var layer = this.ambientLayers.weather;
    
    // Find or create audio source for effect
    var audioSource = this.findWeatherAudioSource(effectType);
    if (!audioSource) {
        audioSource = this.createWeatherAudioSource(effectType);
    }
    
    if (audioSource) {
        this.setAudioSourceVolume(audioSource, volume);
    }
};

// Set ambient volume for time-based sounds
EnvironmentalAudio.prototype.setTimeAmbientVolume = function(soundType, volume) {
    var layer = this.ambientLayers.time;
    
    var audioSource = this.findTimeAudioSource(soundType);
    if (!audioSource) {
        audioSource = this.createTimeAudioSource(soundType);
    }
    
    if (audioSource) {
        this.setAudioSourceVolume(audioSource, volume);
    }
};

// Create weather audio source
EnvironmentalAudio.prototype.createWeatherAudioSource = function(effectType) {
    // This would load and create actual audio sources
    var mockAudioSource = {
        type: effectType,
        layer: 'weather',
        gainNode: this.audioContext.createGain(),
        playing: false
    };
    
    mockAudioSource.gainNode.connect(this.ambientLayers.weather.gainNode);
    this.ambientLayers.weather.audioSources.push(mockAudioSource);
    
    return mockAudioSource;
};

// Create time-based audio source
EnvironmentalAudio.prototype.createTimeAudioSource = function(soundType) {
    var mockAudioSource = {
        type: soundType,
        layer: 'time',
        gainNode: this.audioContext.createGain(),
        playing: false
    };
    
    mockAudioSource.gainNode.connect(this.ambientLayers.time.gainNode);
    this.ambientLayers.time.audioSources.push(mockAudioSource);
    
    return mockAudioSource;
};

// Find existing weather audio source
EnvironmentalAudio.prototype.findWeatherAudioSource = function(effectType) {
    return this.ambientLayers.weather.audioSources.find(source => 
        source.type === effectType
    );
};

// Find existing time audio source
EnvironmentalAudio.prototype.findTimeAudioSource = function(soundType) {
    return this.ambientLayers.time.audioSources.find(source => 
        source.type === soundType
    );
};

// Set audio source volume
EnvironmentalAudio.prototype.setAudioSourceVolume = function(audioSource, volume) {
    if (audioSource && audioSource.gainNode) {
        audioSource.gainNode.gain.setTargetAtTime(volume, this.audioContext.currentTime, 0.5);
        
        if (volume > 0 && !audioSource.playing) {
            this.startAudioSource(audioSource);
        } else if (volume === 0 && audioSource.playing) {
            this.stopAudioSource(audioSource);
        }
    }
};

// Start audio source playback
EnvironmentalAudio.prototype.startAudioSource = function(audioSource) {
    // Implementation would start actual audio playback
    audioSource.playing = true;
    console.log(`Starting audio source: ${audioSource.type}`);
};

// Stop audio source playback
EnvironmentalAudio.prototype.stopAudioSource = function(audioSource) {
    // Implementation would stop actual audio playback
    audioSource.playing = false;
    console.log(`Stopping audio source: ${audioSource.type}`);
};

// Set ambient layer target volume
EnvironmentalAudio.prototype.setAmbientLayerTarget = function(layerName, targetVolume) {
    var layer = this.ambientLayers[layerName];
    if (layer) {
        layer.crossfadeTarget = targetVolume;
    }
};

// Handle explosion nearby
EnvironmentalAudio.prototype.onExplosionNearby = function(explosionData) {
    // Temporarily duck ambient audio
    this.duckAmbientAudio(0.3, 2.0); // Duck to 30% for 2 seconds
    
    // Add ringing effect if very close
    var distance = explosionData.distance || 100;
    if (distance < 20) {
        this.addEarRingingEffect(3.0);
    }
};

// Handle combat start
EnvironmentalAudio.prototype.onCombatStart = function() {
    // Increase activity layer intensity
    this.setAmbientLayerTarget('activity', 0.8);
    
    // Reduce base ambient slightly
    this.setAmbientLayerTarget('base', 0.6);
};

// Handle combat end
EnvironmentalAudio.prototype.onCombatEnd = function() {
    // Return to normal ambient levels
    this.setAmbientLayerTarget('activity', 0.3);
    this.setAmbientLayerTarget('base', 1.0);
};

// Duck ambient audio temporarily
EnvironmentalAudio.prototype.duckAmbientAudio = function(duckLevel, duration) {
    var originalVolume = this.masterGain.gain.value;
    
    // Duck immediately
    this.masterGain.gain.setTargetAtTime(originalVolume * duckLevel, this.audioContext.currentTime, 0.1);
    
    // Restore after duration
    setTimeout(() => {
        this.masterGain.gain.setTargetAtTime(originalVolume, this.audioContext.currentTime, 0.5);
    }, duration * 1000);
};

// Add ear ringing effect
EnvironmentalAudio.prototype.addEarRingingEffect = function(duration) {
    // Create high-frequency tone
    var oscillator = this.audioContext.createOscillator();
    var gainNode = this.audioContext.createGain();
    
    oscillator.frequency.value = 4000; // 4kHz ringing
    gainNode.gain.value = 0.1;
    
    oscillator.connect(gainNode);
    gainNode.connect(this.compressor);
    
    oscillator.start();
    
    // Fade out over duration
    gainNode.gain.setTargetAtTime(0, this.audioContext.currentTime + 0.5, duration / 3);
    
    // Stop after duration
    setTimeout(() => {
        oscillator.stop();
    }, duration * 1000);
};

// Update reverb for current zone
EnvironmentalAudio.prototype.updateReverbForZone = function(zone) {
    if (!this.reverbNode || !zone.reverb) return;
    
    // Load appropriate impulse response for zone
    this.loadZoneReverb(zone.reverb);
};

// Load zone-specific reverb
EnvironmentalAudio.prototype.loadZoneReverb = function(reverbType) {
    var reverbSettings = {
        urban: { duration: 1.5, decay: 2.0 },
        forest: { duration: 0.8, decay: 1.0 },
        industrial: { duration: 2.5, decay: 3.0 },
        room: { duration: 0.5, decay: 0.8 },
        cave: { duration: 4.0, decay: 5.0 }
    };
    
    var settings = reverbSettings[reverbType];
    if (settings) {
        this.generateImpulseResponse(settings.duration, settings.decay, false).then(impulse => {
            this.reverbNode.buffer = impulse;
        });
    }
};

// Update performance metrics
EnvironmentalAudio.prototype.updatePerformanceMetrics = function() {
    var activeCount = 0;
    
    Object.values(this.ambientLayers).forEach(layer => {
        activeCount += layer.audioSources.filter(source => source.playing).length;
    });
    
    this.performanceMetrics.activeAudioSources = activeCount;
    this.performanceMetrics.memoryUsage = this.audioContext ? this.audioContext.state : 'unknown';
};

// Handle audio settings changes
EnvironmentalAudio.prototype.onAudioSettingsChange = function(settings) {
    if (settings.environmentalVolume !== undefined) {
        this.masterGain.gain.value = settings.environmentalVolume;
    }
    
    if (settings.reverbEnabled !== undefined) {
        this.reverbEnabled = settings.reverbEnabled;
        // Reconnect audio graph if needed
    }
    
    if (settings.audioQuality !== undefined) {
        this.audioQuality = settings.audioQuality;
        this.adjustAudioQuality();
    }
};

// Adjust audio quality based on settings
EnvironmentalAudio.prototype.adjustAudioQuality = function() {
    var qualitySettings = {
        low: { maxSources: 8, updateRate: 30 },
        medium: { maxSources: 16, updateRate: 60 },
        high: { maxSources: 32, updateRate: 120 }
    };
    
    var settings = qualitySettings[this.audioQuality];
    if (settings) {
        // Implement quality adjustments
        console.log(`Audio quality set to ${this.audioQuality}:`, settings);
    }
};

// Get current audio state
EnvironmentalAudio.prototype.getAudioState = function() {
    return {
        currentZone: this.currentZone,
        masterVolume: this.masterGain ? this.masterGain.gain.value : 0,
        layerVolumes: Object.keys(this.ambientLayers).reduce((acc, layerName) => {
            acc[layerName] = this.ambientLayers[layerName].gainNode.gain.value;
            return acc;
        }, {}),
        performanceMetrics: this.performanceMetrics
    };
};
