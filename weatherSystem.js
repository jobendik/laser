/**
 * Weather System - Environmental Weather Effects
 * Manages dynamic weather conditions, atmospheric effects, and environmental impacts
 */

class WeatherSystem {
    constructor() {
        this.currentWeather = 'clear';
        this.weatherIntensity = 0.0;
        this.transitionSpeed = 0.01;
        this.weatherDuration = 300; // seconds
        this.weatherTimer = 0;
        
        this.weatherTypes = {
            clear: {
                visibility: 1.0,
                windStrength: 0.1,
                precipitation: 0.0,
                fogDensity: 0.0,
                lightingMultiplier: 1.0,
                soundDamping: 1.0
            },
            rain: {
                visibility: 0.7,
                windStrength: 0.5,
                precipitation: 0.8,
                fogDensity: 0.3,
                lightingMultiplier: 0.6,
                soundDamping: 0.8
            },
            fog: {
                visibility: 0.3,
                windStrength: 0.2,
                precipitation: 0.0,
                fogDensity: 0.9,
                lightingMultiplier: 0.4,
                soundDamping: 0.7
            },
            storm: {
                visibility: 0.4,
                windStrength: 0.9,
                precipitation: 1.0,
                fogDensity: 0.5,
                lightingMultiplier: 0.3,
                soundDamping: 0.6
            },
            snow: {
                visibility: 0.6,
                windStrength: 0.4,
                precipitation: 0.6,
                fogDensity: 0.4,
                lightingMultiplier: 0.8,
                soundDamping: 0.9
            },
            sandstorm: {
                visibility: 0.2,
                windStrength: 1.0,
                precipitation: 0.0,
                fogDensity: 0.8,
                lightingMultiplier: 0.2,
                soundDamping: 0.5
            }
        };
        
        this.particleEffects = new Map();
        this.environmentalSounds = new Map();
        this.dynamicWeatherEnabled = true;
        this.weatherChangeChance = 0.001;
        
        this.windDirection = { x: 1, y: 0, z: 0 };
        this.windVariation = 0.0;
        
        this.events = new EventTarget();
        
        this.init();
    }
    
    init() {
        this.setupParticleEffects();
        this.setupEnvironmentalSounds();
        this.updateWeatherEffects();
    }
    
    setupParticleEffects() {
        // Rain particles
        this.particleEffects.set('rain', {
            count: 2000,
            spread: { x: 100, y: 20, z: 100 },
            velocity: { x: 0, y: -15, z: 0 },
            size: { min: 0.1, max: 0.3 },
            color: [0.7, 0.8, 1.0, 0.6],
            lifetime: 2.0
        });
        
        // Snow particles
        this.particleEffects.set('snow', {
            count: 1500,
            spread: { x: 80, y: 30, z: 80 },
            velocity: { x: 0, y: -3, z: 0 },
            size: { min: 0.2, max: 0.8 },
            color: [1.0, 1.0, 1.0, 0.8],
            lifetime: 5.0
        });
        
        // Sandstorm particles
        this.particleEffects.set('sandstorm', {
            count: 3000,
            spread: { x: 200, y: 50, z: 200 },
            velocity: { x: 10, y: 2, z: 0 },
            size: { min: 0.5, max: 2.0 },
            color: [0.8, 0.6, 0.3, 0.4],
            lifetime: 3.0
        });
    }
    
    setupEnvironmentalSounds() {
        this.environmentalSounds.set('rain', {
            sound: 'rain_ambient',
            volume: 0.3,
            loop: true,
            fadeTime: 2.0
        });
        
        this.environmentalSounds.set('wind', {
            sound: 'wind_ambient',
            volume: 0.2,
            loop: true,
            fadeTime: 3.0
        });
        
        this.environmentalSounds.set('thunder', {
            sound: 'thunder_distant',
            volume: 0.5,
            loop: false,
            randomInterval: { min: 10, max: 30 }
        });
    }
    
    update(deltaTime) {
        this.weatherTimer += deltaTime;
        
        if (this.dynamicWeatherEnabled) {
            this.checkWeatherChange();
        }
        
        this.updateWindVariation(deltaTime);
        this.updateParticleEffects(deltaTime);
        this.updateEnvironmentalAudio(deltaTime);
        this.updateGameplayEffects();
    }
    
    checkWeatherChange() {
        if (Math.random() < this.weatherChangeChance || 
            this.weatherTimer > this.weatherDuration) {
            
            const weatherTypes = Object.keys(this.weatherTypes);
            const currentIndex = weatherTypes.indexOf(this.currentWeather);
            let newWeather;
            
            // Prefer gradual weather transitions
            if (Math.random() < 0.7) {
                const adjacentWeathers = this.getAdjacentWeathers(this.currentWeather);
                newWeather = adjacentWeathers[Math.floor(Math.random() * adjacentWeathers.length)];
            } else {
                newWeather = weatherTypes[Math.floor(Math.random() * weatherTypes.length)];
            }
            
            if (newWeather !== this.currentWeather) {
                this.transitionToWeather(newWeather);
            }
        }
    }
    
    getAdjacentWeathers(currentWeather) {
        const transitions = {
            clear: ['rain', 'fog'],
            rain: ['clear', 'storm', 'fog'],
            fog: ['clear', 'rain'],
            storm: ['rain', 'clear'],
            snow: ['clear', 'fog'],
            sandstorm: ['clear']
        };
        
        return transitions[currentWeather] || ['clear'];
    }
    
    transitionToWeather(newWeather) {
        const oldWeather = this.currentWeather;
        this.currentWeather = newWeather;
        this.weatherTimer = 0;
        
        this.events.dispatchEvent(new CustomEvent('weatherChanged', {
            detail: { from: oldWeather, to: newWeather }
        }));
        
        console.log(`Weather changing from ${oldWeather} to ${newWeather}`);
    }
    
    updateWindVariation(deltaTime) {
        this.windVariation += deltaTime * 0.5;
        
        const baseWind = this.getCurrentWeatherData().windStrength;
        const variation = Math.sin(this.windVariation) * 0.3;
        const currentWindStrength = baseWind + variation;
        
        // Update wind direction with some randomness
        this.windDirection.x += (Math.random() - 0.5) * deltaTime * 0.1;
        this.windDirection.z += (Math.random() - 0.5) * deltaTime * 0.1;
        
        // Normalize wind direction
        const length = Math.sqrt(
            this.windDirection.x * this.windDirection.x + 
            this.windDirection.z * this.windDirection.z
        );
        if (length > 0) {
            this.windDirection.x /= length;
            this.windDirection.z /= length;
        }
    }
    
    updateParticleEffects(deltaTime) {
        const weatherData = this.getCurrentWeatherData();
        
        // Update precipitation particles
        if (weatherData.precipitation > 0) {
            const effectType = this.getParticleEffectType();
            const effect = this.particleEffects.get(effectType);
            
            if (effect) {
                this.spawnParticles(effect, weatherData.precipitation);
            }
        }
    }
    
    getParticleEffectType() {
        switch (this.currentWeather) {
            case 'rain':
            case 'storm':
                return 'rain';
            case 'snow':
                return 'snow';
            case 'sandstorm':
                return 'sandstorm';
            default:
                return null;
        }
    }
    
    spawnParticles(effect, intensity) {
        // This would interface with the particle manager
        // For now, we'll just track the effect requirements
        const spawnCount = Math.floor(effect.count * intensity);
        
        // Apply wind effects to particle velocity
        const windEffect = this.getCurrentWeatherData().windStrength;
        const modifiedVelocity = {
            x: effect.velocity.x + (this.windDirection.x * windEffect * 5),
            y: effect.velocity.y,
            z: effect.velocity.z + (this.windDirection.z * windEffect * 5)
        };
        
        // Emit particles with modified properties
        this.emitParticles(effect, modifiedVelocity, spawnCount);
    }
    
    emitParticles(effect, velocity, count) {
        // Interface with particle manager to spawn particles
        // This would typically call ParticleManager.emit()
        if (window.particleManager) {
            window.particleManager.emit({
                ...effect,
                velocity: velocity,
                count: count
            });
        }
    }
    
    updateEnvironmentalAudio(deltaTime) {
        const weatherData = this.getCurrentWeatherData();
        
        // Update audio based on weather conditions
        if (window.audioManager) {
            // Rain audio
            if (weatherData.precipitation > 0.3) {
                const rainSound = this.environmentalSounds.get('rain');
                window.audioManager.playAmbient(
                    rainSound.sound, 
                    rainSound.volume * weatherData.precipitation
                );
            }
            
            // Wind audio
            if (weatherData.windStrength > 0.3) {
                const windSound = this.environmentalSounds.get('wind');
                window.audioManager.playAmbient(
                    windSound.sound, 
                    windSound.volume * weatherData.windStrength
                );
            }
            
            // Thunder for storms
            if (this.currentWeather === 'storm' && Math.random() < 0.002) {
                const thunderSound = this.environmentalSounds.get('thunder');
                window.audioManager.playSound(thunderSound.sound, thunderSound.volume);
            }
        }
    }
    
    updateGameplayEffects() {
        const weatherData = this.getCurrentWeatherData();
        
        // Apply visibility effects
        if (window.gameManager) {
            window.gameManager.setEnvironmentalVisibility(weatherData.visibility);
        }
        
        // Apply movement effects (wind resistance, slippery surfaces)
        if (window.playerController) {
            const movementModifier = 1.0 - (weatherData.windStrength * 0.1);
            window.playerController.setMovementModifier(movementModifier);
        }
        
        // Apply weapon effects (wind affecting projectiles)
        if (window.weaponManager) {
            window.weaponManager.setWindConditions(
                this.windDirection, 
                weatherData.windStrength
            );
        }
    }
    
    getCurrentWeatherData() {
        return this.weatherTypes[this.currentWeather];
    }
    
    setWeather(weatherType, intensity = 1.0) {
        if (this.weatherTypes[weatherType]) {
            this.currentWeather = weatherType;
            this.weatherIntensity = Math.max(0, Math.min(1, intensity));
            this.weatherTimer = 0;
            
            this.events.dispatchEvent(new CustomEvent('weatherSet', {
                detail: { weather: weatherType, intensity: intensity }
            }));
        }
    }
    
    getVisibilityModifier() {
        return this.getCurrentWeatherData().visibility;
    }
    
    getWindVector() {
        const strength = this.getCurrentWeatherData().windStrength;
        return {
            x: this.windDirection.x * strength,
            y: 0,
            z: this.windDirection.z * strength
        };
    }
    
    getFogDensity() {
        return this.getCurrentWeatherData().fogDensity;
    }
    
    getLightingMultiplier() {
        return this.getCurrentWeatherData().lightingMultiplier;
    }
    
    getSoundDampingFactor() {
        return this.getCurrentWeatherData().soundDamping;
    }
    
    enableDynamicWeather(enabled = true) {
        this.dynamicWeatherEnabled = enabled;
    }
    
    setWeatherChangeFrequency(chance) {
        this.weatherChangeChance = Math.max(0, Math.min(1, chance));
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
            currentWeather: this.currentWeather,
            weatherIntensity: this.weatherIntensity,
            weatherTimer: this.weatherTimer,
            windDirection: this.windDirection,
            windStrength: this.getCurrentWeatherData().windStrength,
            visibility: this.getCurrentWeatherData().visibility,
            dynamicWeatherEnabled: this.dynamicWeatherEnabled
        };
    }
    
    forceWeatherChange() {
        this.weatherTimer = this.weatherDuration + 1;
        this.checkWeatherChange();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WeatherSystem;
} else {
    window.WeatherSystem = WeatherSystem;
}
