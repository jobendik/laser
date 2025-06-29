var AudioManager = pc.createScript('audioManager');

AudioManager.attributes.add('masterVolume', { type: 'number', default: 1.0, min: 0, max: 1 });
AudioManager.attributes.add('musicVolume', { type: 'number', default: 0.7, min: 0, max: 1 });
AudioManager.attributes.add('sfxVolume', { type: 'number', default: 1.0, min: 0, max: 1 });
AudioManager.attributes.add('voiceVolume', { type: 'number', default: 0.8, min: 0, max: 1 });
AudioManager.attributes.add('maxSimultaneousSounds', { type: 'number', default: 32 });
AudioManager.attributes.add('audioOcclusionEnabled', { type: 'boolean', default: true });
AudioManager.attributes.add('dynamicRangeCompression', { type: 'boolean', default: false });

AudioManager.prototype.initialize = function() {
    // Audio state
    this.isInitialized = false;
    this.activeSounds = new Map();
    this.soundPools = new Map();
    this.musicTracks = new Map();
    this.currentMusic = null;
    
    // 3D Audio settings
    this.audioListener = null;
    this.dopplerFactor = 1.0;
    this.speedOfSound = 343.3; // m/s
    this.rolloffFactor = 1.0;
    
    // Dynamic music system
    this.musicStates = {
        'menu': { track: 'menu_music', volume: 0.6, loop: true },
        'gameplay': { track: 'gameplay_music', volume: 0.4, loop: true },
        'combat': { track: 'combat_music', volume: 0.7, loop: true },
        'victory': { track: 'victory_music', volume: 0.8, loop: false },
        'defeat': { track: 'defeat_music', volume: 0.8, loop: false }
    };
    this.currentMusicState = 'menu';
    this.musicTransitionTime = 2.0;
    this.isMusicTransitioning = false;
    
    // Audio occlusion
    this.occlusionRays = [];
    this.maxOcclusionRays = 8;
    this.occlusionCheckInterval = 0.1; // seconds
    this.lastOcclusionCheck = 0;
    
    // Performance optimization
    this.maxAudioDistance = 100;
    this.culledSounds = [];
    this.soundPriorities = new Map();
    
    // Environmental audio
    this.reverbZones = [];
    this.currentReverbZone = null;
    this.ambientSounds = new Map();
    
    this.initializeAudioSystem();
    
    // Bind events
    this.app.on('audio:playSound', this.playSound, this);
    this.app.on('audio:playMusic', this.playMusic, this);
    this.app.on('audio:stopSound', this.stopSound, this);
    this.app.on('audio:stopMusic', this.stopMusic, this);
    this.app.on('audio:setVolume', this.setVolume, this);
    this.app.on('audio:changeMusicState', this.changeMusicState, this);
    this.app.on('audio:playWeaponSound', this.playWeaponSound, this);
    this.app.on('audio:playFootstep', this.playFootstepSound, this);
    this.app.on('audio:playVoice', this.playVoiceSound, this);
    this.app.on('weapon:fired', this.onWeaponFired, this);
    this.app.on('player:footstep', this.onPlayerFootstep, this);
    this.app.on('effect:explosion', this.onExplosion, this);
    
    console.log('AudioManager initialized');
};

AudioManager.prototype.initializeAudioSystem = function() {
    // Find or create audio listener
    this.audioListener = this.app.root.findByTag('audioListener')[0];
    if (!this.audioListener) {
        const camera = this.app.root.findByTag('camera')[0];
        if (camera) {
            this.audioListener = camera;
            camera.addComponent('audiolistener');
        }
    }
    
    // Set up audio context properties
    if (this.app.soundManager && this.app.soundManager.context) {
        const context = this.app.soundManager.context;
        
        // Set up 3D audio properties
        if (context.listener) {
            context.listener.dopplerFactor = this.dopplerFactor;
            context.listener.speedOfSound = this.speedOfSound;
        }
    }
    
    // Initialize sound pools
    this.initializeSoundPools();
    
    // Load and initialize reverb zones
    this.initializeReverbZones();
    
    this.isInitialized = true;
};

AudioManager.prototype.initializeSoundPools = function() {
    const soundTypes = [
        'weapon_fire', 'weapon_reload', 'footstep', 'impact',
        'explosion', 'voice', 'ui', 'ambient', 'music'
    ];
    
    soundTypes.forEach(type => {
        this.soundPools.set(type, {
            active: [],
            available: [],
            maxSize: this.getPoolSize(type)
        });
    });
};

AudioManager.prototype.getPoolSize = function(soundType) {
    switch (soundType) {
        case 'weapon_fire':
            return 16;
        case 'footstep':
            return 8;
        case 'impact':
            return 12;
        case 'voice':
            return 4;
        case 'ui':
            return 6;
        default:
            return 8;
    }
};

AudioManager.prototype.initializeReverbZones = function() {
    // Find reverb zones in scene
    const reverbEntities = this.app.root.findByTag('reverbZone');
    reverbEntities.forEach(entity => {
        if (entity.script && entity.script.reverbZone) {
            this.reverbZones.push({
                entity: entity,
                settings: entity.script.reverbZone.reverbSettings,
                bounds: entity.collision ? entity.collision : null
            });
        }
    });
};

AudioManager.prototype.update = function(dt) {
    if (!this.isInitialized) return;
    
    this.updateActiveSounds(dt);
    this.updateMusicSystem(dt);
    this.updateAudioOcclusion(dt);
    this.updateReverbZones(dt);
    this.cullDistantSounds(dt);
    this.manageSoundPriorities();
};

AudioManager.prototype.updateActiveSounds = function(dt) {
    this.activeSounds.forEach((soundData, soundId) => {
        // Update 3D position
        if (soundData.entity && soundData.sound && soundData.sound.entity) {
            soundData.sound.entity.setPosition(soundData.entity.getPosition());
        }
        
        // Update distance-based volume
        if (soundData.is3D && this.audioListener) {
            this.updateSoundDistance(soundData);
        }
        
        // Update sound aging
        soundData.age += dt;
        
        // Remove finished sounds
        if (soundData.sound && !soundData.sound.isPlaying && !soundData.loop) {
            this.removeActiveSound(soundId);
        }
    });
};

AudioManager.prototype.updateSoundDistance = function(soundData) {
    if (!this.audioListener || !soundData.entity) return;
    
    const listenerPos = this.audioListener.getPosition();
    const soundPos = soundData.entity.getPosition();
    const distance = listenerPos.distance(soundPos);
    
    // Calculate volume based on distance and rolloff
    let volumeMultiplier = 1.0;
    if (distance > soundData.minDistance) {
        const rolloffDistance = distance - soundData.minDistance;
        volumeMultiplier = soundData.minDistance / (soundData.minDistance + this.rolloffFactor * rolloffDistance);
    }
    
    // Apply occlusion if enabled
    if (this.audioOcclusionEnabled) {
        volumeMultiplier *= soundData.occlusionFactor || 1.0;
    }
    
    // Update sound volume
    if (soundData.sound) {
        soundData.sound.volume = soundData.baseVolume * volumeMultiplier * this.getSoundTypeVolume(soundData.type);
    }
};

AudioManager.prototype.updateAudioOcclusion = function(dt) {
    if (!this.audioOcclusionEnabled || !this.audioListener) return;
    
    this.lastOcclusionCheck += dt;
    if (this.lastOcclusionCheck < this.occlusionCheckInterval) return;
    
    this.lastOcclusionCheck = 0;
    
    // Check occlusion for important sounds
    this.activeSounds.forEach((soundData, soundId) => {
        if (soundData.is3D && soundData.checkOcclusion) {
            this.checkSoundOcclusion(soundData);
        }
    });
};

AudioManager.prototype.checkSoundOcclusion = function(soundData) {
    if (!soundData.entity || !this.audioListener) return;
    
    const listenerPos = this.audioListener.getPosition();
    const soundPos = soundData.entity.getPosition();
    const direction = new pc.Vec3().sub2(soundPos, listenerPos).normalize();
    const distance = listenerPos.distance(soundPos);
    
    // Perform raycast to check for occlusion
    const result = this.app.systems.rigidbody.raycastFirst(listenerPos, direction, distance);
    
    if (result && result.entity !== soundData.entity) {
        // Sound is occluded
        soundData.occlusionFactor = 0.3; // Muffled sound
    } else {
        // Clear line of "hearing"
        soundData.occlusionFactor = 1.0;
    }
};

AudioManager.prototype.updateMusicSystem = function(dt) {
    if (this.isMusicTransitioning && this.currentMusic) {
        // Handle music transitions
        // This would implement cross-fading between tracks
    }
    
    // Update dynamic music based on game state
    this.updateDynamicMusic();
};

AudioManager.prototype.updateDynamicMusic = function() {
    // Check game state and adjust music accordingly
    const gameManager = this.app.root.findByName('Game_Manager');
    if (gameManager && gameManager.script && gameManager.script.gameManager) {
        const gameState = gameManager.script.gameManager.gameState;
        
        let targetMusicState = 'gameplay';
        
        // Determine music state based on gameplay
        if (gameState === 0) { // Lobby
            targetMusicState = 'menu';
        } else if (gameState === 2) { // Active game
            // Check if player is in combat
            if (this.isPlayerInCombat()) {
                targetMusicState = 'combat';
            } else {
                targetMusicState = 'gameplay';
            }
        } else if (gameState === 3) { // Game ended
            targetMusicState = this.getMatchResult() === 'victory' ? 'victory' : 'defeat';
        }
        
        if (targetMusicState !== this.currentMusicState) {
            this.changeMusicState(targetMusicState);
        }
    }
};

AudioManager.prototype.isPlayerInCombat = function() {
    // Check if local player is in combat
    const localPlayer = this.app.root.findByName('Local_Player');
    if (localPlayer && localPlayer.script && localPlayer.script.weaponController) {
        return localPlayer.script.weaponController.lastFireTime > Date.now() - 5000; // 5 seconds
    }
    return false;
};

AudioManager.prototype.updateReverbZones = function(dt) {
    if (!this.audioListener) return;
    
    const listenerPos = this.audioListener.getPosition();
    let newReverbZone = null;
    
    // Check if listener is in any reverb zone
    this.reverbZones.forEach(zone => {
        if (zone.bounds && this.isPositionInBounds(listenerPos, zone.bounds)) {
            newReverbZone = zone;
        }
    });
    
    // Apply reverb changes
    if (newReverbZone !== this.currentReverbZone) {
        this.currentReverbZone = newReverbZone;
        this.applyReverbSettings(newReverbZone ? newReverbZone.settings : null);
    }
};

AudioManager.prototype.isPositionInBounds = function(position, bounds) {
    // Simple AABB check - would be more sophisticated in real implementation
    const boundsPos = bounds.entity.getPosition();
    const boundsScale = bounds.entity.getLocalScale();
    
    return Math.abs(position.x - boundsPos.x) < boundsScale.x &&
           Math.abs(position.y - boundsPos.y) < boundsScale.y &&
           Math.abs(position.z - boundsPos.z) < boundsScale.z;
};

AudioManager.prototype.applyReverbSettings = function(settings) {
    // Apply reverb settings to audio context
    // This would use Web Audio API reverb nodes in a real implementation
    if (settings) {
        console.log('Applying reverb:', settings.type);
    } else {
        console.log('Removing reverb');
    }
};

AudioManager.prototype.cullDistantSounds = function(dt) {
    if (!this.audioListener) return;
    
    const listenerPos = this.audioListener.getPosition();
    
    this.activeSounds.forEach((soundData, soundId) => {
        if (soundData.is3D && soundData.entity) {
            const distance = listenerPos.distance(soundData.entity.getPosition());
            
            if (distance > this.maxAudioDistance) {
                // Cull distant sound
                this.pauseSound(soundId);
                this.culledSounds.push(soundId);
            }
        }
    });
    
    // Restore culled sounds that are now in range
    for (let i = this.culledSounds.length - 1; i >= 0; i--) {
        const soundId = this.culledSounds[i];
        const soundData = this.activeSounds.get(soundId);
        
        if (soundData && soundData.entity) {
            const distance = listenerPos.distance(soundData.entity.getPosition());
            
            if (distance <= this.maxAudioDistance) {
                this.resumeSound(soundId);
                this.culledSounds.splice(i, 1);
            }
        }
    }
};

AudioManager.prototype.manageSoundPriorities = function() {
    // Manage sound priorities when approaching max simultaneous sounds
    if (this.activeSounds.size >= this.maxSimultaneousSounds) {
        const soundArray = Array.from(this.activeSounds.values());
        
        // Sort by priority (age, importance, distance)
        soundArray.sort((a, b) => {
            const priorityA = this.calculateSoundPriority(a);
            const priorityB = this.calculateSoundPriority(b);
            return priorityA - priorityB;
        });
        
        // Stop lowest priority sounds
        const soundsToStop = soundArray.slice(0, soundArray.length - this.maxSimultaneousSounds + 2);
        soundsToStop.forEach(soundData => {
            if (soundData.id) {
                this.stopSound(soundData.id);
            }
        });
    }
};

AudioManager.prototype.calculateSoundPriority = function(soundData) {
    let priority = 0;
    
    // Base priority by type
    switch (soundData.type) {
        case 'voice':
            priority += 100;
            break;
        case 'weapon_fire':
            priority += 80;
            break;
        case 'explosion':
            priority += 90;
            break;
        case 'ui':
            priority += 70;
            break;
        case 'footstep':
            priority += 30;
            break;
        case 'ambient':
            priority += 10;
            break;
    }
    
    // Distance penalty (closer = higher priority)
    if (soundData.is3D && soundData.entity && this.audioListener) {
        const distance = this.audioListener.getPosition().distance(soundData.entity.getPosition());
        priority -= distance;
    }
    
    // Age penalty (newer = higher priority)
    priority -= soundData.age * 10;
    
    return priority;
};

AudioManager.prototype.playSound = function(options) {
    if (!this.isInitialized) return null;
    
    const soundId = this.generateSoundId();
    const soundAsset = this.app.assets.find(options.name);
    
    if (!soundAsset) {
        console.warn('Sound asset not found:', options.name);
        return null;
    }
    
    // Create sound entity
    const soundEntity = new pc.Entity('Sound_' + soundId);
    soundEntity.addComponent('sound');
    soundEntity.sound.addSlot('default', {
        asset: soundAsset,
        volume: options.volume || 1.0,
        pitch: options.pitch || 1.0,
        loop: options.loop || false,
        autoPlay: true,
        is3d: options.is3D || false,
        minDistance: options.minDistance || 1,
        maxDistance: options.maxDistance || 10000,
        rollOffFactor: options.rollOffFactor || this.rolloffFactor
    });
    
    // Position sound in 3D space
    if (options.position) {
        soundEntity.setPosition(options.position);
    } else if (options.entity) {
        soundEntity.setPosition(options.entity.getPosition());
    }
    
    this.app.root.addChild(soundEntity);
    
    // Store sound data
    const soundData = {
        id: soundId,
        sound: soundEntity.sound.slot('default'),
        entity: options.entity || soundEntity,
        type: options.type || 'sfx',
        is3D: options.is3D || false,
        loop: options.loop || false,
        baseVolume: options.volume || 1.0,
        minDistance: options.minDistance || 1,
        maxDistance: options.maxDistance || 10000,
        checkOcclusion: options.checkOcclusion !== false,
        occlusionFactor: 1.0,
        age: 0,
        priority: options.priority || 50
    };
    
    this.activeSounds.set(soundId, soundData);
    
    // Add to sound pool
    const pool = this.soundPools.get(soundData.type);
    if (pool) {
        pool.active.push(soundData);
    }
    
    return soundId;
};

AudioManager.prototype.playWeaponSound = function(data) {
    const options = {
        name: data.soundName || 'weapon_' + data.weaponType + '_fire',
        position: data.position,
        volume: data.volume || 1.0,
        is3D: true,
        type: 'weapon_fire',
        minDistance: 5,
        maxDistance: 100,
        checkOcclusion: true,
        priority: 80
    };
    
    return this.playSound(options);
};

AudioManager.prototype.playFootstepSound = function(data) {
    const surfaceType = data.surfaceType || 'default';
    const options = {
        name: 'footstep_' + surfaceType,
        entity: data.entity,
        volume: data.volume || 0.6,
        is3D: true,
        type: 'footstep',
        minDistance: 1,
        maxDistance: 15,
        checkOcclusion: false,
        priority: 30
    };
    
    return this.playSound(options);
};

AudioManager.prototype.playVoiceSound = function(data) {
    const options = {
        name: data.voiceLine,
        entity: data.entity,
        volume: data.volume || 0.8,
        is3D: true,
        type: 'voice',
        minDistance: 3,
        maxDistance: 30,
        checkOcclusion: true,
        priority: 100
    };
    
    return this.playSound(options);
};

AudioManager.prototype.stopSound = function(soundId) {
    const soundData = this.activeSounds.get(soundId);
    if (soundData) {
        if (soundData.sound) {
            soundData.sound.stop();
        }
        this.removeActiveSound(soundId);
    }
};

AudioManager.prototype.pauseSound = function(soundId) {
    const soundData = this.activeSounds.get(soundId);
    if (soundData && soundData.sound) {
        soundData.sound.pause();
    }
};

AudioManager.prototype.resumeSound = function(soundId) {
    const soundData = this.activeSounds.get(soundId);
    if (soundData && soundData.sound) {
        soundData.sound.resume();
    }
};

AudioManager.prototype.removeActiveSound = function(soundId) {
    const soundData = this.activeSounds.get(soundId);
    if (soundData) {
        // Remove from pool
        const pool = this.soundPools.get(soundData.type);
        if (pool) {
            const index = pool.active.indexOf(soundData);
            if (index >= 0) {
                pool.active.splice(index, 1);
            }
        }
        
        // Destroy sound entity
        if (soundData.entity && soundData.entity.name.startsWith('Sound_')) {
            soundData.entity.destroy();
        }
        
        this.activeSounds.delete(soundId);
    }
};

AudioManager.prototype.changeMusicState = function(newState) {
    if (!this.musicStates[newState] || newState === this.currentMusicState) return;
    
    const newMusicData = this.musicStates[newState];
    
    // Transition to new music
    this.isMusicTransitioning = true;
    
    // Fade out current music
    if (this.currentMusic) {
        this.fadeOutMusic(this.currentMusic, this.musicTransitionTime / 2);
    }
    
    // Fade in new music
    setTimeout(() => {
        this.playMusic({
            name: newMusicData.track,
            volume: newMusicData.volume,
            loop: newMusicData.loop,
            fadeIn: this.musicTransitionTime / 2
        });
        
        this.currentMusicState = newState;
        this.isMusicTransitioning = false;
    }, (this.musicTransitionTime / 2) * 1000);
};

AudioManager.prototype.playMusic = function(options) {
    if (this.currentMusic) {
        this.stopMusic();
    }
    
    const musicId = this.playSound({
        name: options.name,
        volume: options.volume || this.musicVolume,
        loop: options.loop !== false,
        type: 'music',
        is3D: false,
        priority: 200
    });
    
    this.currentMusic = musicId;
    
    if (options.fadeIn) {
        this.fadeInMusic(musicId, options.fadeIn);
    }
    
    return musicId;
};

AudioManager.prototype.stopMusic = function() {
    if (this.currentMusic) {
        this.stopSound(this.currentMusic);
        this.currentMusic = null;
    }
};

AudioManager.prototype.fadeOutMusic = function(musicId, duration) {
    const soundData = this.activeSounds.get(musicId);
    if (!soundData || !soundData.sound) return;
    
    const startVolume = soundData.sound.volume;
    const fadeStep = startVolume / (duration * 60); // 60 FPS
    
    const fadeInterval = setInterval(() => {
        soundData.sound.volume = Math.max(0, soundData.sound.volume - fadeStep);
        
        if (soundData.sound.volume <= 0) {
            clearInterval(fadeInterval);
            this.stopSound(musicId);
        }
    }, 16); // ~60 FPS
};

AudioManager.prototype.fadeInMusic = function(musicId, duration) {
    const soundData = this.activeSounds.get(musicId);
    if (!soundData || !soundData.sound) return;
    
    const targetVolume = soundData.baseVolume;
    soundData.sound.volume = 0;
    
    const fadeStep = targetVolume / (duration * 60); // 60 FPS
    
    const fadeInterval = setInterval(() => {
        soundData.sound.volume = Math.min(targetVolume, soundData.sound.volume + fadeStep);
        
        if (soundData.sound.volume >= targetVolume) {
            clearInterval(fadeInterval);
        }
    }, 16); // ~60 FPS
};

AudioManager.prototype.setVolume = function(data) {
    switch (data.type) {
        case 'master':
            this.masterVolume = data.volume;
            break;
        case 'music':
            this.musicVolume = data.volume;
            break;
        case 'sfx':
            this.sfxVolume = data.volume;
            break;
        case 'voice':
            this.voiceVolume = data.volume;
            break;
    }
    
    // Update all active sounds of that type
    this.updateVolumeForType(data.type);
};

AudioManager.prototype.updateVolumeForType = function(type) {
    this.activeSounds.forEach((soundData) => {
        if (soundData.type === type || type === 'master') {
            const newVolume = soundData.baseVolume * this.getSoundTypeVolume(soundData.type);
            if (soundData.sound) {
                soundData.sound.volume = newVolume;
            }
        }
    });
};

AudioManager.prototype.getSoundTypeVolume = function(type) {
    let typeVolume = 1.0;
    
    switch (type) {
        case 'music':
            typeVolume = this.musicVolume;
            break;
        case 'voice':
            typeVolume = this.voiceVolume;
            break;
        default:
            typeVolume = this.sfxVolume;
            break;
    }
    
    return typeVolume * this.masterVolume;
};

AudioManager.prototype.generateSoundId = function() {
    return 'sound_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
};

AudioManager.prototype.onWeaponFired = function(weaponData) {
    const weapon = weaponData.entity || weaponData.weapon;
    if (weapon) {
        this.playWeaponSound({
            weaponType: weaponData.type,
            position: weapon.getPosition(),
            volume: 0.8
        });
    }
};

AudioManager.prototype.onPlayerFootstep = function(data) {
    this.playFootstepSound({
        entity: data.entity,
        surfaceType: data.surfaceType || 'concrete',
        volume: 0.6
    });
};

AudioManager.prototype.onExplosion = function(data) {
    this.playSound({
        name: 'explosion_' + (data.type || 'default'),
        position: data.position,
        volume: 1.2,
        is3D: true,
        type: 'explosion',
        minDistance: 10,
        maxDistance: 200,
        priority: 90
    });
};

AudioManager.prototype.getMatchResult = function() {
    // Determine if player won or lost
    const gameManager = this.app.root.findByName('Game_Manager');
    if (gameManager && gameManager.script && gameManager.script.gameManager) {
        // This would check the actual match results
        return 'victory'; // Placeholder
    }
    return 'defeat';
};

AudioManager.prototype.clearAllSounds = function() {
    // Stop all active sounds
    this.activeSounds.forEach((soundData, soundId) => {
        this.stopSound(soundId);
    });
    
    this.activeSounds.clear();
    this.culledSounds = [];
    
    // Clear sound pools
    this.soundPools.forEach(pool => {
        pool.active = [];
    });
};