/**
 * Spatial Audio Manager - 3D Positional Audio System
 * Handles 3D audio positioning, occlusion, reverb zones, and environmental audio effects
 */

class SpatialAudioManager {
    constructor() {
        this.audioContext = null;
        this.listener = null;
        this.masterGain = null;
        this.isInitialized = false;
        
        this.audioSources = new Map();
        this.reverbZones = new Map();
        this.occlusionObjects = [];
        
        this.settings = {
            masterVolume: 1.0,
            distanceModel: 'inverse',
            dopplerEffect: true,
            occlusionEnabled: true,
            reverbEnabled: true,
            maxDistance: 1000,
            rolloffFactor: 1,
            refDistance: 1,
            coneInnerAngle: 360,
            coneOuterAngle: 360,
            coneOuterGain: 0
        };
        
        this.listenerProperties = {
            position: { x: 0, y: 0, z: 0 },
            orientation: {
                forward: { x: 0, y: 0, z: -1 },
                up: { x: 0, y: 1, z: 0 }
            },
            velocity: { x: 0, y: 0, z: 0 }
        };
        
        this.environmentalEffects = {
            underwater: {
                lowpass: 500,
                gain: 0.3,
                reverb: 'underwater'
            },
            indoor: {
                lowpass: 8000,
                gain: 0.8,
                reverb: 'room'
            },
            outdoor: {
                lowpass: 20000,
                gain: 1.0,
                reverb: 'none'
            },
            cave: {
                lowpass: 2000,
                gain: 0.6,
                reverb: 'cave'
            }
        };
        
        this.reverbConfigs = {
            none: {
                roomSize: 0,
                decay: 0,
                wetGain: 0,
                dryGain: 1
            },
            room: {
                roomSize: 0.3,
                decay: 1.5,
                wetGain: 0.3,
                dryGain: 0.7
            },
            hall: {
                roomSize: 0.8,
                decay: 3.0,
                wetGain: 0.5,
                dryGain: 0.5
            },
            cave: {
                roomSize: 0.9,
                decay: 4.0,
                wetGain: 0.7,
                dryGain: 0.3
            },
            underwater: {
                roomSize: 0.5,
                decay: 2.0,
                wetGain: 0.8,
                dryGain: 0.2
            }
        };
        
        this.audioCategories = {
            sfx: { volume: 1.0, enabled: true },
            music: { volume: 0.7, enabled: true },
            voice: { volume: 1.0, enabled: true },
            ambient: { volume: 0.6, enabled: true },
            ui: { volume: 0.8, enabled: true }
        };
        
        this.events = new EventTarget();
        
        this.init();
    }
    
    async init() {
        try {
            await this.initializeAudioContext();
            this.setupMasterGain();
            this.setupListener();
            this.bindEvents();
            this.isInitialized = true;
            
            this.events.dispatchEvent(new CustomEvent('audioInitialized'));
        } catch (error) {
            console.error('Failed to initialize spatial audio:', error);
        }
    }
    
    async initializeAudioContext() {
        try {
            // Create audio context
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
            
            // Resume context if suspended (due to autoplay policies)
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            console.log('Audio context initialized:', this.audioContext.state);
        } catch (error) {
            throw new Error('Web Audio API not supported: ' + error.message);
        }
    }
    
    setupMasterGain() {
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = this.settings.masterVolume;
        this.masterGain.connect(this.audioContext.destination);
    }
    
    setupListener() {
        this.listener = this.audioContext.listener;
        
        // Set initial listener position and orientation
        this.updateListenerPosition(this.listenerProperties.position);
        this.updateListenerOrientation(
            this.listenerProperties.orientation.forward,
            this.listenerProperties.orientation.up
        );
    }
    
    bindEvents() {
        // Listen for player camera updates
        if (window.playerCamera) {
            window.playerCamera.addEventListener('positionChanged', (event) => {
                this.updateListenerPosition(event.detail.position);
            });
            
            window.playerCamera.addEventListener('orientationChanged', (event) => {
                this.updateListenerOrientation(
                    event.detail.forward,
                    event.detail.up
                );
            });
        }
        
        // Listen for settings changes
        if (window.settingsManager) {
            window.settingsManager.addEventListener('audioSettingsChanged', (event) => {
                this.updateAudioSettings(event.detail);
            });
        }
    }
    
    // Audio Source Management
    createAudioSource(id, audioBuffer, config = {}) {
        if (!this.isInitialized) {
            console.warn('Audio system not initialized');
            return null;
        }
        
        const source = this.audioContext.createBufferSource();
        const panner = this.audioContext.createPanner();
        const gainNode = this.audioContext.createGain();
        const filterNode = this.audioContext.createBiquadFilter();
        
        // Configure source
        source.buffer = audioBuffer;
        source.loop = config.loop || false;
        source.playbackRate.value = config.playbackRate || 1.0;
        
        // Configure panner for 3D positioning
        panner.panningModel = 'HRTF';
        panner.distanceModel = this.settings.distanceModel;
        panner.maxDistance = config.maxDistance || this.settings.maxDistance;
        panner.refDistance = config.refDistance || this.settings.refDistance;
        panner.rolloffFactor = config.rolloffFactor || this.settings.rolloffFactor;
        panner.coneInnerAngle = config.coneInnerAngle || this.settings.coneInnerAngle;
        panner.coneOuterAngle = config.coneOuterAngle || this.settings.coneOuterAngle;
        panner.coneOuterGain = config.coneOuterGain || this.settings.coneOuterGain;
        
        // Configure gain
        gainNode.gain.value = config.volume || 1.0;
        
        // Configure filter for occlusion/environmental effects
        filterNode.type = 'lowpass';
        filterNode.frequency.value = config.filterFrequency || 20000;
        
        // Connect audio graph
        source.connect(filterNode);
        filterNode.connect(gainNode);
        gainNode.connect(panner);
        panner.connect(this.masterGain);
        
        const audioSource = {
            id: id,
            source: source,
            panner: panner,
            gain: gainNode,
            filter: filterNode,
            config: config,
            position: config.position || { x: 0, y: 0, z: 0 },
            velocity: config.velocity || { x: 0, y: 0, z: 0 },
            category: config.category || 'sfx',
            isPlaying: false,
            startTime: 0,
            duration: audioBuffer.duration
        };
        
        // Set initial position
        if (config.position) {
            this.setSourcePosition(audioSource, config.position);
        }
        
        // Handle source end
        source.addEventListener('ended', () => {
            this.handleSourceEnded(audioSource);
        });
        
        this.audioSources.set(id, audioSource);
        
        this.events.dispatchEvent(new CustomEvent('audioSourceCreated', {
            detail: { id: id, config: config }
        }));
        
        return audioSource;
    }
    
    playAudioSource(id, delay = 0) {
        const audioSource = this.audioSources.get(id);
        if (!audioSource) {
            console.warn(`Audio source ${id} not found`);
            return;
        }
        
        if (audioSource.isPlaying) {
            console.warn(`Audio source ${id} is already playing`);
            return;
        }
        
        try {
            audioSource.source.start(this.audioContext.currentTime + delay);
            audioSource.isPlaying = true;
            audioSource.startTime = this.audioContext.currentTime + delay;
            
            this.events.dispatchEvent(new CustomEvent('audioSourceStarted', {
                detail: { id: id }
            }));
        } catch (error) {
            console.error(`Failed to play audio source ${id}:`, error);
        }
    }
    
    stopAudioSource(id, fadeTime = 0) {
        const audioSource = this.audioSources.get(id);
        if (!audioSource || !audioSource.isPlaying) {
            return;
        }
        
        if (fadeTime > 0) {
            // Fade out
            const currentTime = this.audioContext.currentTime;
            audioSource.gain.gain.linearRampToValueAtTime(0, currentTime + fadeTime);
            
            setTimeout(() => {
                try {
                    audioSource.source.stop();
                } catch (error) {
                    // Source may have already ended
                }
            }, fadeTime * 1000);
        } else {
            try {
                audioSource.source.stop();
            } catch (error) {
                // Source may have already ended
            }
        }
        
        audioSource.isPlaying = false;
    }
    
    setSourcePosition(audioSource, position) {
        if (!audioSource.panner) return;
        
        audioSource.position = { ...position };
        
        if (audioSource.panner.positionX) {
            // Modern browsers
            audioSource.panner.positionX.value = position.x;
            audioSource.panner.positionY.value = position.y;
            audioSource.panner.positionZ.value = position.z;
        } else {
            // Fallback for older browsers
            audioSource.panner.setPosition(position.x, position.y, position.z);
        }
        
        // Update occlusion if enabled
        if (this.settings.occlusionEnabled) {
            this.updateOcclusion(audioSource);
        }
    }
    
    setSourceVelocity(audioSource, velocity) {
        if (!audioSource.panner || !this.settings.dopplerEffect) return;
        
        audioSource.velocity = { ...velocity };
        
        if (audioSource.panner.velocityX) {
            audioSource.panner.velocityX.value = velocity.x;
            audioSource.panner.velocityY.value = velocity.y;
            audioSource.panner.velocityZ.value = velocity.z;
        } else {
            audioSource.panner.setVelocity(velocity.x, velocity.y, velocity.z);
        }
    }
    
    // Listener Management
    updateListenerPosition(position) {
        this.listenerProperties.position = { ...position };
        
        if (this.listener.positionX) {
            this.listener.positionX.value = position.x;
            this.listener.positionY.value = position.y;
            this.listener.positionZ.value = position.z;
        } else {
            this.listener.setPosition(position.x, position.y, position.z);
        }
        
        // Update occlusion for all sources
        if (this.settings.occlusionEnabled) {
            this.audioSources.forEach(source => {
                this.updateOcclusion(source);
            });
        }
    }
    
    updateListenerOrientation(forward, up) {
        this.listenerProperties.orientation.forward = { ...forward };
        this.listenerProperties.orientation.up = { ...up };
        
        if (this.listener.forwardX) {
            this.listener.forwardX.value = forward.x;
            this.listener.forwardY.value = forward.y;
            this.listener.forwardZ.value = forward.z;
            this.listener.upX.value = up.x;
            this.listener.upY.value = up.y;
            this.listener.upZ.value = up.z;
        } else {
            this.listener.setOrientation(
                forward.x, forward.y, forward.z,
                up.x, up.y, up.z
            );
        }
    }
    
    setListenerVelocity(velocity) {
        this.listenerProperties.velocity = { ...velocity };
        
        if (this.listener.velocityX) {
            this.listener.velocityX.value = velocity.x;
            this.listener.velocityY.value = velocity.y;
            this.listener.velocityZ.value = velocity.z;
        } else if (this.listener.setVelocity) {
            this.listener.setVelocity(velocity.x, velocity.y, velocity.z);
        }
    }
    
    // Occlusion and Environmental Effects
    updateOcclusion(audioSource) {
        const listenerPos = this.listenerProperties.position;
        const sourcePos = audioSource.position;
        
        // Calculate occlusion factor
        const occlusionFactor = this.calculateOcclusion(listenerPos, sourcePos);
        
        // Apply occlusion to filter frequency
        const baseFrequency = audioSource.config.filterFrequency || 20000;
        const occludedFrequency = baseFrequency * (1 - occlusionFactor * 0.8);
        
        audioSource.filter.frequency.value = occludedFrequency;
        
        // Apply occlusion to gain
        const baseGain = audioSource.config.volume || 1.0;
        const occludedGain = baseGain * (1 - occlusionFactor * 0.5);
        audioSource.gain.gain.value = occludedGain;
    }
    
    calculateOcclusion(listenerPos, sourcePos) {
        let occlusionFactor = 0;
        
        // Check against occlusion objects
        for (const obj of this.occlusionObjects) {
            if (this.lineIntersectsObject(listenerPos, sourcePos, obj)) {
                occlusionFactor += obj.occlusionStrength || 0.5;
            }
        }
        
        return Math.min(1, occlusionFactor);
    }
    
    lineIntersectsObject(start, end, obj) {
        // Simplified ray-box intersection
        // In a real implementation, you'd use proper 3D collision detection
        const box = obj.boundingBox;
        if (!box) return false;
        
        // Basic AABB intersection check
        return (start.x < box.max.x && end.x > box.min.x &&
                start.y < box.max.y && end.y > box.min.y &&
                start.z < box.max.z && end.z > box.min.z);
    }
    
    addOcclusionObject(id, boundingBox, occlusionStrength = 0.5) {
        this.occlusionObjects.push({
            id: id,
            boundingBox: boundingBox,
            occlusionStrength: occlusionStrength
        });
    }
    
    removeOcclusionObject(id) {
        this.occlusionObjects = this.occlusionObjects.filter(obj => obj.id !== id);
    }
    
    // Reverb and Environmental Effects
    createReverbZone(id, position, radius, reverbType = 'room') {
        const reverbConfig = this.reverbConfigs[reverbType];
        if (!reverbConfig) {
            console.warn(`Reverb type ${reverbType} not found`);
            return;
        }
        
        const reverbZone = {
            id: id,
            position: position,
            radius: radius,
            reverbType: reverbType,
            config: reverbConfig
        };
        
        this.reverbZones.set(id, reverbZone);
    }
    
    removeReverbZone(id) {
        this.reverbZones.delete(id);
    }
    
    updateEnvironmentalEffects() {
        // Check which reverb zone the listener is in
        const listenerPos = this.listenerProperties.position;
        let activeZone = null;
        
        this.reverbZones.forEach(zone => {
            const distance = this.calculateDistance(listenerPos, zone.position);
            if (distance <= zone.radius) {
                activeZone = zone;
            }
        });
        
        // Apply environmental effects to all sources
        this.audioSources.forEach(source => {
            this.applyEnvironmentalEffects(source, activeZone);
        });
    }
    
    applyEnvironmentalEffects(audioSource, reverbZone) {
        // This would apply reverb and environmental filtering
        // In a full implementation, you'd use ConvolverNode for reverb
        if (reverbZone) {
            const config = reverbZone.config;
            // Apply reverb settings
            audioSource.filter.frequency.value *= config.dryGain;
            audioSource.gain.gain.value *= (config.dryGain + config.wetGain);
        }
    }
    
    calculateDistance(pos1, pos2) {
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        const dz = pos1.z - pos2.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    
    // Category Management
    setCategoryVolume(category, volume) {
        if (this.audioCategories[category]) {
            this.audioCategories[category].volume = Math.max(0, Math.min(1, volume));
            
            // Update all sources in this category
            this.audioSources.forEach(source => {
                if (source.category === category) {
                    const baseVolume = source.config.volume || 1.0;
                    source.gain.gain.value = baseVolume * this.audioCategories[category].volume;
                }
            });
        }
    }
    
    setCategoryEnabled(category, enabled) {
        if (this.audioCategories[category]) {
            this.audioCategories[category].enabled = enabled;
            
            // Mute/unmute sources in this category
            this.audioSources.forEach(source => {
                if (source.category === category) {
                    const volume = enabled ? 
                        (source.config.volume || 1.0) * this.audioCategories[category].volume : 0;
                    source.gain.gain.value = volume;
                }
            });
        }
    }
    
    // Utility Methods
    loadAudioBuffer(url) {
        return new Promise((resolve, reject) => {
            fetch(url)
                .then(response => response.arrayBuffer())
                .then(data => this.audioContext.decodeAudioData(data))
                .then(buffer => resolve(buffer))
                .catch(error => reject(error));
        });
    }
    
    setMasterVolume(volume) {
        this.settings.masterVolume = Math.max(0, Math.min(1, volume));
        this.masterGain.gain.value = this.settings.masterVolume;
    }
    
    enableOcclusion(enabled = true) {
        this.settings.occlusionEnabled = enabled;
    }
    
    enableReverb(enabled = true) {
        this.settings.reverbEnabled = enabled;
    }
    
    enableDopplerEffect(enabled = true) {
        this.settings.dopplerEffect = enabled;
    }
    
    handleSourceEnded(audioSource) {
        audioSource.isPlaying = false;
        
        // Remove non-looping sources
        if (!audioSource.source.loop) {
            this.audioSources.delete(audioSource.id);
        }
        
        this.events.dispatchEvent(new CustomEvent('audioSourceEnded', {
            detail: { id: audioSource.id }
        }));
    }
    
    updateAudioSettings(settings) {
        Object.assign(this.settings, settings);
        
        // Apply new settings to existing sources
        this.audioSources.forEach(source => {
            if (source.panner) {
                source.panner.distanceModel = this.settings.distanceModel;
                source.panner.maxDistance = this.settings.maxDistance;
                source.panner.rolloffFactor = this.settings.rolloffFactor;
            }
        });
    }
    
    // Public API methods for easy use
    playSound3D(audioBuffer, position, config = {}) {
        const id = 'sound_' + Date.now() + '_' + Math.random().toString(36).substr(2);
        
        const sourceConfig = {
            position: position,
            volume: config.volume || 1.0,
            loop: config.loop || false,
            category: config.category || 'sfx',
            maxDistance: config.maxDistance,
            rolloffFactor: config.rolloffFactor
        };
        
        const source = this.createAudioSource(id, audioBuffer, sourceConfig);
        if (source) {
            this.playAudioSource(id, config.delay || 0);
        }
        
        return id;
    }
    
    updateSoundPosition(id, position) {
        const source = this.audioSources.get(id);
        if (source) {
            this.setSourcePosition(source, position);
        }
    }
    
    stopSound(id, fadeTime = 0) {
        this.stopAudioSource(id, fadeTime);
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
            isInitialized: this.isInitialized,
            audioContextState: this.audioContext?.state,
            activeSources: this.audioSources.size,
            listenerPosition: this.listenerProperties.position,
            reverbZones: this.reverbZones.size,
            occlusionObjects: this.occlusionObjects.length,
            settings: this.settings,
            categories: this.audioCategories
        };
    }
    
    getActiveSourcesInfo() {
        const sources = [];
        this.audioSources.forEach((source, id) => {
            sources.push({
                id: id,
                isPlaying: source.isPlaying,
                position: source.position,
                category: source.category,
                volume: source.gain.gain.value
            });
        });
        return sources;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SpatialAudioManager;
} else {
    window.SpatialAudioManager = SpatialAudioManager;
}
