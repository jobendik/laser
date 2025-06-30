/**
 * Day Night Cycle System - Dynamic Time of Day Management
 * Controls lighting, shadows, environmental ambience, and time-based gameplay effects
 */

class DayNightCycle {
    constructor() {
        this.currentTime = 12.0; // 24-hour format (12.0 = noon)
        this.timeSpeed = 1.0; // Real-time multiplier (1.0 = real time)
        this.cycleDuration = 1440; // Minutes in a full cycle (24 hours)
        this.realTimeMultiplier = 60; // 1 real minute = 60 game minutes by default
        
        this.sunPosition = { x: 0, y: 1, z: 0 };
        this.moonPosition = { x: 0, y: -1, z: 0 };
        this.sunIntensity = 1.0;
        this.moonIntensity = 0.3;
        
        this.lightingConfig = {
            dawn: {
                time: 6.0,
                sunColor: [1.0, 0.7, 0.5],
                skyColor: [0.8, 0.5, 0.3],
                ambientColor: [0.3, 0.2, 0.2],
                fogColor: [0.9, 0.6, 0.4],
                intensity: 0.4
            },
            morning: {
                time: 9.0,
                sunColor: [1.0, 0.95, 0.8],
                skyColor: [0.5, 0.7, 1.0],
                ambientColor: [0.4, 0.4, 0.5],
                fogColor: [0.8, 0.9, 1.0],
                intensity: 0.8
            },
            noon: {
                time: 12.0,
                sunColor: [1.0, 1.0, 0.95],
                skyColor: [0.3, 0.6, 1.0],
                ambientColor: [0.5, 0.5, 0.6],
                fogColor: [0.7, 0.8, 1.0],
                intensity: 1.0
            },
            afternoon: {
                time: 15.0,
                sunColor: [1.0, 0.9, 0.7],
                skyColor: [0.4, 0.6, 0.9],
                ambientColor: [0.4, 0.4, 0.5],
                fogColor: [0.8, 0.8, 0.9],
                intensity: 0.9
            },
            dusk: {
                time: 18.0,
                sunColor: [1.0, 0.6, 0.3],
                skyColor: [0.8, 0.4, 0.2],
                ambientColor: [0.3, 0.2, 0.3],
                fogColor: [0.9, 0.5, 0.3],
                intensity: 0.3
            },
            night: {
                time: 22.0,
                sunColor: [0.2, 0.3, 0.5],
                skyColor: [0.1, 0.1, 0.2],
                ambientColor: [0.1, 0.1, 0.2],
                fogColor: [0.2, 0.2, 0.3],
                intensity: 0.1
            }
        };
        
        this.shadows = {
            enabled: true,
            quality: 'high',
            distance: 100,
            cascadeCount: 4,
            softness: 0.5
        };
        
        this.timeZone = 0; // UTC offset
        this.seasonalVariation = 0.0; // 0-1, affects day length
        this.weatherInfluence = true;
        
        this.events = new EventTarget();
        this.lastTimeOfDay = this.getTimeOfDay();
        
        this.lightSources = new Map();
        this.dynamicLights = [];
        
        this.init();
    }
    
    init() {
        this.calculateSunPosition();
        this.calculateMoonPosition();
        this.updateLighting();
        this.setupDynamicLights();
    }
    
    update(deltaTime) {
        this.updateTime(deltaTime);
        this.calculateSunPosition();
        this.calculateMoonPosition();
        this.updateLighting();
        this.updateShadows();
        this.updateEnvironmentalEffects();
        this.checkTimeOfDayChanges();
        this.updateDynamicLights();
    }
    
    updateTime(deltaTime) {
        // Convert delta time to game time based on speed multiplier
        const gameTimeIncrement = (deltaTime / 60) * this.timeSpeed * this.realTimeMultiplier;
        this.currentTime += gameTimeIncrement / 60; // Convert minutes to hours
        
        // Wrap around at 24 hours
        if (this.currentTime >= 24.0) {
            this.currentTime -= 24.0;
            this.events.dispatchEvent(new CustomEvent('newDay', {
                detail: { time: this.currentTime }
            }));
        }
    }
    
    calculateSunPosition() {
        // Calculate sun position based on time (simplified solar path)
        const timeRadians = (this.currentTime / 24.0) * Math.PI * 2 - Math.PI/2;
        const seasonalTilt = Math.sin(this.seasonalVariation * Math.PI * 2) * 0.4;
        
        this.sunPosition = {
            x: Math.cos(timeRadians),
            y: Math.sin(timeRadians) + seasonalTilt,
            z: Math.sin(timeRadians * 0.3) * 0.2
        };
        
        // Normalize
        const length = Math.sqrt(
            this.sunPosition.x * this.sunPosition.x +
            this.sunPosition.y * this.sunPosition.y +
            this.sunPosition.z * this.sunPosition.z
        );
        
        if (length > 0) {
            this.sunPosition.x /= length;
            this.sunPosition.y /= length;
            this.sunPosition.z /= length;
        }
        
        // Calculate sun intensity based on height
        this.sunIntensity = Math.max(0, this.sunPosition.y);
    }
    
    calculateMoonPosition() {
        // Moon is roughly opposite to sun
        this.moonPosition = {
            x: -this.sunPosition.x,
            y: -this.sunPosition.y + 0.3, // Slight offset
            z: -this.sunPosition.z
        };
        
        // Moon intensity based on position and phase
        this.moonIntensity = Math.max(0, this.moonPosition.y) * 0.3;
    }
    
    updateLighting() {
        const currentLighting = this.interpolateLighting();
        
        // Update global lighting
        if (window.lightingManager) {
            window.lightingManager.setSunDirection(this.sunPosition);
            window.lightingManager.setSunColor(currentLighting.sunColor);
            window.lightingManager.setSunIntensity(currentLighting.intensity);
            window.lightingManager.setAmbientColor(currentLighting.ambientColor);
            window.lightingManager.setSkyColor(currentLighting.skyColor);
            window.lightingManager.setFogColor(currentLighting.fogColor);
            
            // Moon lighting for night time
            if (this.sunIntensity < 0.1) {
                window.lightingManager.setMoonDirection(this.moonPosition);
                window.lightingManager.setMoonIntensity(this.moonIntensity);
            }
        }
        
        // Apply weather influence if enabled
        if (this.weatherInfluence && window.weatherSystem) {
            const weatherMultiplier = window.weatherSystem.getLightingMultiplier();
            this.applyWeatherLighting(weatherMultiplier);
        }
    }
    
    interpolateLighting() {
        const timePoints = Object.keys(this.lightingConfig).map(key => ({
            name: key,
            time: this.lightingConfig[key].time,
            config: this.lightingConfig[key]
        })).sort((a, b) => a.time - b.time);
        
        // Find the two time points to interpolate between
        let beforePoint = timePoints[timePoints.length - 1]; // Default to last point
        let afterPoint = timePoints[0]; // Default to first point
        
        for (let i = 0; i < timePoints.length; i++) {
            if (timePoints[i].time <= this.currentTime) {
                beforePoint = timePoints[i];
                afterPoint = timePoints[(i + 1) % timePoints.length];
            } else {
                break;
            }
        }
        
        // Calculate interpolation factor
        let timeDiff = afterPoint.time - beforePoint.time;
        if (timeDiff < 0) timeDiff += 24; // Handle day wrap-around
        
        let currentDiff = this.currentTime - beforePoint.time;
        if (currentDiff < 0) currentDiff += 24;
        
        const t = timeDiff > 0 ? currentDiff / timeDiff : 0;
        
        // Interpolate all lighting properties
        return {
            sunColor: this.interpolateColor(beforePoint.config.sunColor, afterPoint.config.sunColor, t),
            skyColor: this.interpolateColor(beforePoint.config.skyColor, afterPoint.config.skyColor, t),
            ambientColor: this.interpolateColor(beforePoint.config.ambientColor, afterPoint.config.ambientColor, t),
            fogColor: this.interpolateColor(beforePoint.config.fogColor, afterPoint.config.fogColor, t),
            intensity: this.lerp(beforePoint.config.intensity, afterPoint.config.intensity, t)
        };
    }
    
    interpolateColor(color1, color2, t) {
        return [
            this.lerp(color1[0], color2[0], t),
            this.lerp(color1[1], color2[1], t),
            this.lerp(color1[2], color2[2], t)
        ];
    }
    
    lerp(a, b, t) {
        return a + (b - a) * t;
    }
    
    updateShadows() {
        if (this.shadows.enabled && window.shadowManager) {
            // Update shadow direction based on sun position
            window.shadowManager.setShadowDirection(this.sunPosition);
            
            // Adjust shadow quality based on time of day
            const shadowIntensity = Math.max(0.1, this.sunIntensity);
            window.shadowManager.setShadowIntensity(shadowIntensity);
            
            // Adjust shadow distance based on lighting conditions
            const shadowDistance = this.shadows.distance * shadowIntensity;
            window.shadowManager.setShadowDistance(shadowDistance);
        }
    }
    
    updateEnvironmentalEffects() {
        // Update particle effects based on time of day
        if (window.particleManager) {
            // Dust particles during day
            if (this.isDaytime()) {
                window.particleManager.setDustParticles(true, this.sunIntensity * 0.3);
            } else {
                window.particleManager.setDustParticles(false);
            }
        }
        
        // Update audio ambience
        if (window.audioManager) {
            const timeOfDay = this.getTimeOfDay();
            window.audioManager.setTimeOfDayAmbience(timeOfDay, this.currentTime);
        }
    }
    
    updateDynamicLights() {
        // Update street lights, building lights, etc.
        const shouldActivateNightLights = this.sunIntensity < 0.3;
        
        this.lightSources.forEach((lightData, lightId) => {
            if (lightData.type === 'street' || lightData.type === 'building') {
                const shouldBeOn = shouldActivateNightLights || lightData.alwaysOn;
                
                if (window.lightingManager) {
                    window.lightingManager.setLightState(lightId, shouldBeOn);
                }
            }
        });
    }
    
    checkTimeOfDayChanges() {
        const currentTimeOfDay = this.getTimeOfDay();
        
        if (currentTimeOfDay !== this.lastTimeOfDay) {
            this.events.dispatchEvent(new CustomEvent('timeOfDayChanged', {
                detail: { 
                    from: this.lastTimeOfDay, 
                    to: currentTimeOfDay,
                    time: this.currentTime
                }
            }));
            
            this.lastTimeOfDay = currentTimeOfDay;
        }
    }
    
    applyWeatherLighting(weatherMultiplier) {
        if (window.lightingManager) {
            const currentIntensity = window.lightingManager.getSunIntensity();
            window.lightingManager.setSunIntensity(currentIntensity * weatherMultiplier);
        }
    }
    
    setupDynamicLights() {
        // This would typically be called by the level manager to register lights
        // For now, we'll just set up the framework
        this.lightSources.clear();
        
        // Example: Register some common light types
        this.registerLightType('street', {
            activationTime: 18.0,
            deactivationTime: 6.0,
            intensity: 0.8,
            color: [1.0, 0.9, 0.7]
        });
        
        this.registerLightType('building', {
            activationTime: 19.0,
            deactivationTime: 7.0,
            intensity: 0.6,
            color: [1.0, 1.0, 0.8]
        });
    }
    
    registerLightType(type, config) {
        // This would be called to register different types of lights
        // Each light instance would use these defaults
        this.lightSources.set(type + '_default', {
            type: type,
            ...config,
            alwaysOn: false
        });
    }
    
    registerLight(lightId, type, position, config = {}) {
        const defaultConfig = this.lightSources.get(type + '_default') || {};
        
        this.lightSources.set(lightId, {
            type: type,
            position: position,
            ...defaultConfig,
            ...config
        });
    }
    
    // Public API methods
    setTime(hour, minute = 0) {
        this.currentTime = hour + (minute / 60);
        if (this.currentTime >= 24) this.currentTime -= 24;
        if (this.currentTime < 0) this.currentTime += 24;
        
        this.events.dispatchEvent(new CustomEvent('timeSet', {
            detail: { time: this.currentTime }
        }));
    }
    
    setTimeSpeed(speed) {
        this.timeSpeed = Math.max(0, speed);
    }
    
    getTime() {
        return {
            hour: Math.floor(this.currentTime),
            minute: Math.floor((this.currentTime % 1) * 60),
            decimal: this.currentTime
        };
    }
    
    getTimeOfDay() {
        if (this.currentTime >= 5 && this.currentTime < 12) return 'morning';
        if (this.currentTime >= 12 && this.currentTime < 17) return 'afternoon';
        if (this.currentTime >= 17 && this.currentTime < 21) return 'evening';
        return 'night';
    }
    
    isDaytime() {
        return this.currentTime >= 6 && this.currentTime < 18;
    }
    
    isNighttime() {
        return !this.isDaytime();
    }
    
    getSunPosition() {
        return { ...this.sunPosition };
    }
    
    getMoonPosition() {
        return { ...this.moonPosition };
    }
    
    getSunIntensity() {
        return this.sunIntensity;
    }
    
    setSeasonalVariation(variation) {
        this.seasonalVariation = Math.max(0, Math.min(1, variation));
    }
    
    enableShadows(enabled = true) {
        this.shadows.enabled = enabled;
    }
    
    setShadowQuality(quality) {
        this.shadows.quality = quality;
        if (window.shadowManager) {
            window.shadowManager.setQuality(quality);
        }
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
            currentTime: this.currentTime,
            timeSpeed: this.timeSpeed,
            timeOfDay: this.getTimeOfDay(),
            sunPosition: this.sunPosition,
            sunIntensity: this.sunIntensity,
            moonPosition: this.moonPosition,
            moonIntensity: this.moonIntensity,
            isDaytime: this.isDaytime(),
            lightSourceCount: this.lightSources.size
        };
    }
    
    skipTo(timeOfDay) {
        const timeMap = {
            dawn: 6.0,
            morning: 9.0,
            noon: 12.0,
            afternoon: 15.0,
            dusk: 18.0,
            night: 22.0,
            midnight: 0.0
        };
        
        if (timeMap[timeOfDay] !== undefined) {
            this.setTime(timeMap[timeOfDay]);
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DayNightCycle;
} else {
    window.DayNightCycle = DayNightCycle;
}
