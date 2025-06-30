/**
 * WeaponAudio.js
 * Weapon-specific audio system
 * Handles weapon sounds, reloading, firing, and audio effects
 */

class WeaponAudio extends pc.ScriptType {
    static get scriptName() { return 'WeaponAudio'; }

    initialize() {
        this.audioManager = this.app.root.findByName('AudioManager')?.script?.audioManager;
        this.weaponManager = this.app.root.findByName('WeaponManager')?.script?.weaponManager;
        this.playerEntity = this.app.root.findByName('Player');
        
        // Audio pools for different weapon sounds
        this.fireSounds = new Map();
        this.reloadSounds = new Map();
        this.impactSounds = new Map();
        this.foleyInSounds = new Map();
        this.emptySounds = new Map();
        
        // Active sound instances
        this.activeSounds = new Map();
        this.loopingSounds = new Map();
        
        // Audio settings
        this.masterVolume = 1.0;
        this.fireVolumeMultiplier = 0.8;
        this.reloadVolumeMultiplier = 0.6;
        this.impactVolumeMultiplier = 0.5;
        this.foleyVolumeMultiplier = 0.4;
        
        // Distance attenuation settings
        this.maxAudibleDistance = 500; // meters
        this.referenceDistance = 10; // meters
        this.rolloffFactor = 2.0;
        
        // Weapon-specific configurations
        this.weaponConfigs = new Map();
        
        this.initializeWeaponConfigs();
        this.preloadWeaponSounds();
        this.setupEventListeners();
    }

    initializeWeaponConfigs() {
        // Define audio configurations for different weapon types
        this.weaponConfigs.set('assault', {
            fireSound: ['assault_fire_01.wav', 'assault_fire_02.wav', 'assault_fire_03.wav'],
            reloadSound: 'assault_reload.wav',
            emptySound: 'weapon_empty.wav',
            impactSounds: ['bullet_impact_01.wav', 'bullet_impact_02.wav'],
            foleyIn: 'assault_foley_in.wav',
            foleyOut: 'assault_foley_out.wav',
            shellEject: 'shell_eject_rifle.wav',
            boltAction: null,
            fireVolume: 0.9,
            reloadVolume: 0.7,
            pitch: { min: 0.95, max: 1.05 },
            suppressorModifier: { volume: 0.4, pitch: 0.8 }
        });
        
        this.weaponConfigs.set('sniper', {
            fireSound: ['sniper_fire_01.wav', 'sniper_fire_02.wav'],
            reloadSound: 'sniper_reload.wav',
            emptySound: 'weapon_empty.wav',
            impactSounds: ['bullet_impact_01.wav', 'bullet_impact_02.wav'],
            foleyIn: 'sniper_foley_in.wav',
            foleyOut: 'sniper_foley_out.wav',
            shellEject: 'shell_eject_rifle.wav',
            boltAction: 'sniper_bolt.wav',
            fireVolume: 1.2,
            reloadVolume: 0.8,
            pitch: { min: 0.98, max: 1.02 },
            suppressorModifier: { volume: 0.3, pitch: 0.7 }
        });
        
        this.weaponConfigs.set('shotgun', {
            fireSound: ['shotgun_fire_01.wav', 'shotgun_fire_02.wav'],
            reloadSound: 'shotgun_reload_shell.wav',
            emptySound: 'weapon_empty.wav',
            impactSounds: ['shotgun_impact_01.wav', 'shotgun_impact_02.wav'],
            foleyIn: 'shotgun_foley_in.wav',
            foleyOut: 'shotgun_foley_out.wav',
            shellEject: 'shell_eject_shotgun.wav',
            pumpAction: 'shotgun_pump.wav',
            fireVolume: 1.1,
            reloadVolume: 0.6,
            pitch: { min: 0.9, max: 1.1 },
            suppressorModifier: null // Shotguns typically can't be suppressed
        });
        
        this.weaponConfigs.set('smg', {
            fireSound: ['smg_fire_01.wav', 'smg_fire_02.wav', 'smg_fire_03.wav'],
            reloadSound: 'smg_reload.wav',
            emptySound: 'weapon_empty.wav',
            impactSounds: ['bullet_impact_01.wav', 'bullet_impact_02.wav'],
            foleyIn: 'smg_foley_in.wav',
            foleyOut: 'smg_foley_out.wav',
            shellEject: 'shell_eject_pistol.wav',
            boltAction: null,
            fireVolume: 0.7,
            reloadVolume: 0.6,
            pitch: { min: 0.98, max: 1.08 },
            suppressorModifier: { volume: 0.3, pitch: 0.85 }
        });
        
        this.weaponConfigs.set('pistol', {
            fireSound: ['pistol_fire_01.wav', 'pistol_fire_02.wav'],
            reloadSound: 'pistol_reload.wav',
            emptySound: 'weapon_empty.wav',
            impactSounds: ['bullet_impact_01.wav', 'bullet_impact_02.wav'],
            foleyIn: 'pistol_foley_in.wav',
            foleyOut: 'pistol_foley_out.wav',
            shellEject: 'shell_eject_pistol.wav',
            slideAction: 'pistol_slide.wav',
            fireVolume: 0.6,
            reloadVolume: 0.5,
            pitch: { min: 0.95, max: 1.1 },
            suppressorModifier: { volume: 0.25, pitch: 0.9 }
        });
        
        this.weaponConfigs.set('lmg', {
            fireSound: ['lmg_fire_01.wav', 'lmg_fire_02.wav'],
            reloadSound: 'lmg_reload.wav',
            emptySound: 'weapon_empty.wav',
            impactSounds: ['bullet_impact_01.wav', 'bullet_impact_02.wav'],
            foleyIn: 'lmg_foley_in.wav',
            foleyOut: 'lmg_foley_out.wav',
            shellEject: 'shell_eject_rifle.wav',
            beltFeed: 'lmg_belt_feed.wav',
            fireVolume: 1.3,
            reloadVolume: 0.9,
            pitch: { min: 0.92, max: 1.02 },
            suppressorModifier: null // LMGs typically can't be suppressed
        });
    }

    preloadWeaponSounds() {
        this.weaponConfigs.forEach((config, weaponType) => {
            // Preload fire sounds
            if (Array.isArray(config.fireSound)) {
                config.fireSound.forEach(sound => {
                    this.preloadSound(sound);
                });
            } else {
                this.preloadSound(config.fireSound);
            }
            
            // Preload other sounds
            this.preloadSound(config.reloadSound);
            this.preloadSound(config.emptySound);
            this.preloadSound(config.foleyIn);
            this.preloadSound(config.foleyOut);
            this.preloadSound(config.shellEject);
            
            if (config.boltAction) this.preloadSound(config.boltAction);
            if (config.pumpAction) this.preloadSound(config.pumpAction);
            if (config.slideAction) this.preloadSound(config.slideAction);
            if (config.beltFeed) this.preloadSound(config.beltFeed);
            
            // Preload impact sounds
            if (config.impactSounds) {
                config.impactSounds.forEach(sound => {
                    this.preloadSound(sound);
                });
            }
        });
    }

    preloadSound(soundFile) {
        if (this.audioManager && soundFile) {
            this.audioManager.preloadSound(soundFile);
        }
    }

    setupEventListeners() {
        // Weapon fire events
        this.app.on('weapon:fired', (data) => {
            this.playWeaponFireSound(data);
        });
        
        // Weapon reload events
        this.app.on('weapon:reloadStarted', (data) => {
            this.playReloadSound(data);
        });
        
        this.app.on('weapon:reloadCompleted', (data) => {
            this.playReloadCompleteSound(data);
        });
        
        // Weapon empty events
        this.app.on('weapon:empty', (data) => {
            this.playEmptySound(data);
        });
        
        // Weapon equip events
        this.app.on('weapon:equipped', (data) => {
            this.playEquipSound(data);
        });
        
        // Weapon unequip events
        this.app.on('weapon:unequipped', (data) => {
            this.playUnequipSound(data);
        });
        
        // Impact events
        this.app.on('projectile:hit', (data) => {
            this.playImpactSound(data);
        });
        
        // Shell ejection events
        this.app.on('weapon:shellEjected', (data) => {
            this.playShellEjectSound(data);
        });
        
        // Weapon action events (bolt, pump, slide)
        this.app.on('weapon:boltAction', (data) => {
            this.playBoltActionSound(data);
        });
        
        this.app.on('weapon:pumpAction', (data) => {
            this.playPumpActionSound(data);
        });
        
        this.app.on('weapon:slideAction', (data) => {
            this.playSlideActionSound(data);
        });
        
        // Settings events
        this.app.on('audio:volumeChanged', (data) => {
            this.updateVolume(data);
        });
    }

    playWeaponFireSound(data) {
        const { weapon, position, suppressed } = data;
        const config = this.weaponConfigs.get(weapon.type);
        
        if (!config || !this.audioManager) return;
        
        // Select random fire sound if multiple available
        let fireSound = config.fireSound;
        if (Array.isArray(fireSound)) {
            fireSound = fireSound[Math.floor(Math.random() * fireSound.length)];
        }
        
        // Calculate volume and pitch
        let volume = config.fireVolume * this.fireVolumeMultiplier * this.masterVolume;
        let pitch = this.getRandomPitch(config.pitch);
        
        // Apply suppressor effects
        if (suppressed && config.suppressorModifier) {
            volume *= config.suppressorModifier.volume;
            pitch *= config.suppressorModifier.pitch;
        }
        
        // Play sound with 3D positioning
        const soundInstance = this.audioManager.play3DSound(fireSound, {
            position: position || this.getWeaponPosition(),
            volume: volume,
            pitch: pitch,
            maxDistance: this.maxAudibleDistance,
            referenceDistance: this.referenceDistance,
            rolloffFactor: this.rolloffFactor
        });
        
        // Store instance for potential stopping
        if (soundInstance) {
            this.activeSounds.set(`fire_${Date.now()}`, soundInstance);
        }
        
        // Fire weapon fire audio event for other systems
        this.app.fire('weaponAudio:fired', {
            weapon: weapon,
            volume: volume,
            suppressed: suppressed
        });
    }

    playReloadSound(data) {
        const { weapon, position } = data;
        const config = this.weaponConfigs.get(weapon.type);
        
        if (!config || !this.audioManager) return;
        
        const volume = config.reloadVolume * this.reloadVolumeMultiplier * this.masterVolume;
        const pitch = this.getRandomPitch(config.pitch, 0.5); // Less pitch variation for reload
        
        const soundInstance = this.audioManager.play3DSound(config.reloadSound, {
            position: position || this.getWeaponPosition(),
            volume: volume,
            pitch: pitch,
            maxDistance: this.maxAudibleDistance * 0.3, // Reload sounds don't travel as far
            referenceDistance: this.referenceDistance * 0.5,
            rolloffFactor: this.rolloffFactor
        });
        
        if (soundInstance) {
            this.activeSounds.set(`reload_${weapon.id}`, soundInstance);
        }
    }

    playReloadCompleteSound(data) {
        const { weapon, position } = data;
        const config = this.weaponConfigs.get(weapon.type);
        
        if (!config || !this.audioManager) return;
        
        // Play bolt/slide action sound after reload
        if (config.boltAction) {
            setTimeout(() => {
                this.playBoltActionSound(data);
            }, 100);
        } else if (config.slideAction) {
            setTimeout(() => {
                this.playSlideActionSound(data);
            }, 100);
        }
    }

    playEmptySound(data) {
        const { weapon, position } = data;
        const config = this.weaponConfigs.get(weapon.type);
        
        if (!config || !this.audioManager) return;
        
        const volume = 0.3 * this.masterVolume;
        
        this.audioManager.play3DSound(config.emptySound, {
            position: position || this.getWeaponPosition(),
            volume: volume,
            maxDistance: this.maxAudibleDistance * 0.1,
            referenceDistance: this.referenceDistance * 0.2
        });
    }

    playEquipSound(data) {
        const { weapon, position } = data;
        const config = this.weaponConfigs.get(weapon.type);
        
        if (!config || !this.audioManager) return;
        
        const volume = config.reloadVolume * this.foleyVolumeMultiplier * this.masterVolume;
        
        this.audioManager.play3DSound(config.foleyIn, {
            position: position || this.getWeaponPosition(),
            volume: volume,
            maxDistance: this.maxAudibleDistance * 0.1,
            referenceDistance: this.referenceDistance * 0.1
        });
    }

    playUnequipSound(data) {
        const { weapon, position } = data;
        const config = this.weaponConfigs.get(weapon.type);
        
        if (!config || !this.audioManager) return;
        
        const volume = config.reloadVolume * this.foleyVolumeMultiplier * this.masterVolume;
        
        this.audioManager.play3DSound(config.foleyOut, {
            position: position || this.getWeaponPosition(),
            volume: volume,
            maxDistance: this.maxAudibleDistance * 0.1,
            referenceDistance: this.referenceDistance * 0.1
        });
    }

    playImpactSound(data) {
        const { weapon, position, material } = data;
        const config = this.weaponConfigs.get(weapon.type);
        
        if (!config || !this.audioManager) return;
        
        // Select random impact sound
        let impactSound = config.impactSounds[0];
        if (config.impactSounds.length > 1) {
            impactSound = config.impactSounds[Math.floor(Math.random() * config.impactSounds.length)];
        }
        
        // Modify sound based on material
        let volume = this.impactVolumeMultiplier * this.masterVolume;
        let pitch = 1.0;
        
        switch (material) {
            case 'metal':
                pitch = 1.2;
                volume *= 1.1;
                break;
            case 'wood':
                pitch = 0.9;
                volume *= 0.8;
                break;
            case 'concrete':
                pitch = 1.1;
                volume *= 1.2;
                break;
            case 'flesh':
                volume *= 0.6;
                pitch = 0.8;
                break;
        }
        
        this.audioManager.play3DSound(impactSound, {
            position: position,
            volume: volume,
            pitch: pitch,
            maxDistance: this.maxAudibleDistance * 0.3,
            referenceDistance: this.referenceDistance * 0.5,
            rolloffFactor: this.rolloffFactor
        });
    }

    playShellEjectSound(data) {
        const { weapon, position } = data;
        const config = this.weaponConfigs.get(weapon.type);
        
        if (!config || !this.audioManager || !config.shellEject) return;
        
        const volume = 0.2 * this.masterVolume;
        const pitch = this.getRandomPitch({ min: 0.9, max: 1.1 });
        
        // Delay shell eject sound slightly
        setTimeout(() => {
            this.audioManager.play3DSound(config.shellEject, {
                position: position || this.getWeaponPosition(),
                volume: volume,
                pitch: pitch,
                maxDistance: this.maxAudibleDistance * 0.05,
                referenceDistance: this.referenceDistance * 0.1
            });
        }, 50);
    }

    playBoltActionSound(data) {
        const { weapon, position } = data;
        const config = this.weaponConfigs.get(weapon.type);
        
        if (!config || !this.audioManager || !config.boltAction) return;
        
        const volume = 0.4 * this.masterVolume;
        
        this.audioManager.play3DSound(config.boltAction, {
            position: position || this.getWeaponPosition(),
            volume: volume,
            maxDistance: this.maxAudibleDistance * 0.2,
            referenceDistance: this.referenceDistance * 0.3
        });
    }

    playPumpActionSound(data) {
        const { weapon, position } = data;
        const config = this.weaponConfigs.get(weapon.type);
        
        if (!config || !this.audioManager || !config.pumpAction) return;
        
        const volume = 0.5 * this.masterVolume;
        
        this.audioManager.play3DSound(config.pumpAction, {
            position: position || this.getWeaponPosition(),
            volume: volume,
            maxDistance: this.maxAudibleDistance * 0.2,
            referenceDistance: this.referenceDistance * 0.3
        });
    }

    playSlideActionSound(data) {
        const { weapon, position } = data;
        const config = this.weaponConfigs.get(weapon.type);
        
        if (!config || !this.audioManager || !config.slideAction) return;
        
        const volume = 0.3 * this.masterVolume;
        
        this.audioManager.play3DSound(config.slideAction, {
            position: position || this.getWeaponPosition(),
            volume: volume,
            maxDistance: this.maxAudibleDistance * 0.15,
            referenceDistance: this.referenceDistance * 0.2
        });
    }

    getWeaponPosition() {
        // Get weapon position from player or weapon entity
        if (this.playerEntity) {
            const position = this.playerEntity.getPosition().clone();
            position.y += 1.5; // Approximate weapon height
            return position;
        }
        
        return new pc.Vec3(0, 0, 0);
    }

    getRandomPitch(pitchRange, variation = 1.0) {
        if (!pitchRange) return 1.0;
        
        const range = (pitchRange.max - pitchRange.min) * variation;
        const min = pitchRange.min + (1.0 - variation) * (pitchRange.max - pitchRange.min) / 2;
        
        return min + Math.random() * range;
    }

    updateVolume(data) {
        if (data.category === 'weapons' || data.category === 'master') {
            this.masterVolume = data.volume;
        }
    }

    // Public API
    setWeaponVolumeMultiplier(category, multiplier) {
        switch (category) {
            case 'fire':
                this.fireVolumeMultiplier = multiplier;
                break;
            case 'reload':
                this.reloadVolumeMultiplier = multiplier;
                break;
            case 'impact':
                this.impactVolumeMultiplier = multiplier;
                break;
            case 'foley':
                this.foleyVolumeMultiplier = multiplier;
                break;
        }
    }

    setDistanceSettings(maxDistance, referenceDistance, rolloffFactor) {
        this.maxAudibleDistance = maxDistance;
        this.referenceDistance = referenceDistance;
        this.rolloffFactor = rolloffFactor;
    }

    stopAllWeaponSounds() {
        this.activeSounds.forEach((sound, key) => {
            if (sound && sound.stop) {
                sound.stop();
            }
        });
        this.activeSounds.clear();
        
        this.loopingSounds.forEach((sound, key) => {
            if (sound && sound.stop) {
                sound.stop();
            }
        });
        this.loopingSounds.clear();
    }

    stopWeaponSounds(weaponId) {
        // Stop sounds for specific weapon
        const keysToRemove = [];
        
        this.activeSounds.forEach((sound, key) => {
            if (key.includes(weaponId)) {
                if (sound && sound.stop) {
                    sound.stop();
                }
                keysToRemove.push(key);
            }
        });
        
        keysToRemove.forEach(key => this.activeSounds.delete(key));
    }

    addCustomWeaponConfig(weaponType, config) {
        this.weaponConfigs.set(weaponType, config);
    }

    getWeaponConfig(weaponType) {
        return this.weaponConfigs.get(weaponType);
    }

    // Cleanup
    destroy() {
        this.stopAllWeaponSounds();
    }
}

pc.registerScript(WeaponAudio, 'WeaponAudio');
