/**
 * Health Display System - Player Health and Status HUD
 * Displays health, shields, armor, and status effects with visual feedback
 */

class HealthDisplay {
    constructor() {
        this.health = 100;
        this.maxHealth = 100;
        this.shield = 50;
        this.maxShield = 50;
        this.armor = 0;
        this.maxArmor = 100;
        
        this.statusEffects = new Map();
        this.damageFlash = false;
        this.healingAnimation = false;
        this.lastDamageTime = 0;
        
        this.displayElements = {
            healthBar: null,
            healthNumber: null,
            shieldBar: null,
            armorBar: null,
            statusContainer: null,
            damageOverlay: null,
            healthIcon: null
        };
        
        this.thresholds = {
            critical: 0.25,    // 25% health
            low: 0.50,         // 50% health
            warning: 0.75      // 75% health
        };
        
        this.colors = {
            health: {
                full: '#4CAF50',      // Green
                high: '#8BC34A',      // Light green
                medium: '#FFC107',    // Yellow
                low: '#FF9800',       // Orange
                critical: '#F44336'   // Red
            },
            shield: {
                full: '#2196F3',      // Blue
                depleted: '#607D8B'   // Blue grey
            },
            armor: {
                full: '#9E9E9E',      // Grey
                damaged: '#795548'    // Brown
            }
        };
        
        this.animations = {
            damageFlash: {
                duration: 300,
                color: 'rgba(255, 0, 0, 0.3)'
            },
            healing: {
                duration: 500,
                color: 'rgba(0, 255, 0, 0.2)'
            },
            shieldRecharge: {
                duration: 200,
                color: 'rgba(0, 150, 255, 0.3)'
            }
        };
        
        this.settings = {
            showNumbers: true,
            showPercentage: false,
            animateChanges: true,
            showStatusEffects: true,
            compactMode: false,
            position: 'bottom-left',
            orientation: 'horizontal',
            showArmor: true,
            showShield: true
        };
        
        this.regeneration = {
            healthEnabled: false,
            healthRate: 1, // HP per second
            healthDelay: 5, // seconds after damage
            shieldEnabled: true,
            shieldRate: 5, // Shield per second
            shieldDelay: 3 // seconds after damage
        };
        
        this.isVisible = true;
        this.events = new EventTarget();
        
        this.init();
    }
    
    init() {
        this.createHUDElements();
        this.bindEvents();
        this.updateDisplay();
        this.startRegenerationLoop();
    }
    
    createHUDElements() {
        if (!window.hudManager) {
            console.warn('HUD Manager not available');
            return;
        }
        
        // Create main health container
        const healthContainer = document.createElement('div');
        healthContainer.id = 'health-display';
        healthContainer.className = 'hud-element health-display';
        
        // Health section
        const healthSection = document.createElement('div');
        healthSection.className = 'health-section';
        
        // Health icon
        this.displayElements.healthIcon = document.createElement('div');
        this.displayElements.healthIcon.className = 'health-icon';
        this.displayElements.healthIcon.innerHTML = '❤️';
        
        // Health bar background
        const healthBarBg = document.createElement('div');
        healthBarBg.className = 'health-bar-bg';
        
        // Health bar fill
        this.displayElements.healthBar = document.createElement('div');
        this.displayElements.healthBar.className = 'health-bar-fill';
        
        // Health number
        this.displayElements.healthNumber = document.createElement('span');
        this.displayElements.healthNumber.className = 'health-number';
        this.displayElements.healthNumber.textContent = '100';
        
        healthBarBg.appendChild(this.displayElements.healthBar);
        healthSection.appendChild(this.displayElements.healthIcon);
        healthSection.appendChild(healthBarBg);
        healthSection.appendChild(this.displayElements.healthNumber);
        
        // Shield section
        const shieldSection = document.createElement('div');
        shieldSection.className = 'shield-section';
        
        const shieldBarBg = document.createElement('div');
        shieldBarBg.className = 'shield-bar-bg';
        
        this.displayElements.shieldBar = document.createElement('div');
        this.displayElements.shieldBar.className = 'shield-bar-fill';
        
        shieldBarBg.appendChild(this.displayElements.shieldBar);
        shieldSection.appendChild(shieldBarBg);
        
        // Armor section
        const armorSection = document.createElement('div');
        armorSection.className = 'armor-section';
        
        const armorBarBg = document.createElement('div');
        armorBarBg.className = 'armor-bar-bg';
        
        this.displayElements.armorBar = document.createElement('div');
        this.displayElements.armorBar.className = 'armor-bar-fill';
        
        armorBarBg.appendChild(this.displayElements.armorBar);
        armorSection.appendChild(armorBarBg);
        
        // Status effects container
        this.displayElements.statusContainer = document.createElement('div');
        this.displayElements.statusContainer.className = 'status-effects';
        
        // Damage overlay
        this.displayElements.damageOverlay = document.createElement('div');
        this.displayElements.damageOverlay.className = 'damage-overlay';
        
        // Assemble the display
        healthContainer.appendChild(healthSection);
        healthContainer.appendChild(shieldSection);
        healthContainer.appendChild(armorSection);
        healthContainer.appendChild(this.displayElements.statusContainer);
        healthContainer.appendChild(this.displayElements.damageOverlay);
        
        // Add to HUD
        window.hudManager.addElement('healthDisplay', healthContainer);
        
        this.applyStyles();
        this.updateVisibility();
    }
    
    applyStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .health-display {
                position: fixed;
                bottom: 40px;
                left: 40px;
                z-index: 1000;
                display: flex;
                flex-direction: column;
                gap: 8px;
                min-width: 200px;
            }
            
            .health-section {
                display: flex;
                align-items: center;
                gap: 10px;
                background: rgba(0, 0, 0, 0.6);
                padding: 8px 12px;
                border-radius: 6px;
                border: 2px solid rgba(255, 255, 255, 0.1);
            }
            
            .health-icon {
                font-size: 20px;
                filter: drop-shadow(0 0 4px rgba(255, 0, 0, 0.5));
            }
            
            .health-bar-bg, .shield-bar-bg, .armor-bar-bg {
                flex: 1;
                height: 16px;
                background: rgba(0, 0, 0, 0.8);
                border-radius: 8px;
                overflow: hidden;
                border: 1px solid rgba(255, 255, 255, 0.2);
                position: relative;
            }
            
            .health-bar-fill {
                height: 100%;
                background: linear-gradient(90deg, #4CAF50, #8BC34A);
                width: 100%;
                transition: all 0.3s ease-out;
                border-radius: 8px;
                position: relative;
            }
            
            .shield-bar-fill {
                height: 100%;
                background: linear-gradient(90deg, #2196F3, #64B5F6);
                width: 100%;
                transition: all 0.3s ease-out;
                border-radius: 8px;
                position: relative;
            }
            
            .armor-bar-fill {
                height: 100%;
                background: linear-gradient(90deg, #9E9E9E, #BDBDBD);
                width: 100%;
                transition: all 0.3s ease-out;
                border-radius: 8px;
                position: relative;
            }
            
            .health-bar-fill::after,
            .shield-bar-fill::after,
            .armor-bar-fill::after {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(90deg, 
                    transparent 0%, 
                    rgba(255, 255, 255, 0.3) 50%, 
                    transparent 100%);
                animation: shimmer 2s infinite;
            }
            
            @keyframes shimmer {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
            }
            
            .health-number {
                color: #FFFFFF;
                font-family: 'Orbitron', monospace;
                font-size: 18px;
                font-weight: bold;
                min-width: 40px;
                text-align: right;
                text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
            }
            
            .shield-section {
                height: 8px;
                background: rgba(0, 0, 0, 0.4);
                border-radius: 4px;
                overflow: hidden;
                border: 1px solid rgba(33, 150, 243, 0.3);
            }
            
            .armor-section {
                height: 6px;
                background: rgba(0, 0, 0, 0.4);
                border-radius: 3px;
                overflow: hidden;
                border: 1px solid rgba(158, 158, 158, 0.3);
            }
            
            .status-effects {
                display: flex;
                gap: 4px;
                flex-wrap: wrap;
                max-width: 200px;
            }
            
            .status-effect {
                width: 24px;
                height: 24px;
                border-radius: 4px;
                background: rgba(0, 0, 0, 0.8);
                border: 1px solid rgba(255, 255, 255, 0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                position: relative;
                cursor: pointer;
            }
            
            .status-effect.positive {
                border-color: rgba(76, 175, 80, 0.5);
                background: rgba(76, 175, 80, 0.2);
            }
            
            .status-effect.negative {
                border-color: rgba(244, 67, 54, 0.5);
                background: rgba(244, 67, 54, 0.2);
            }
            
            .status-effect .duration {
                position: absolute;
                bottom: -2px;
                left: 0;
                right: 0;
                height: 2px;
                background: rgba(255, 255, 255, 0.6);
                border-radius: 1px;
            }
            
            .damage-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                pointer-events: none;
                background: radial-gradient(circle at center, 
                    transparent 40%, 
                    rgba(255, 0, 0, 0.1) 70%, 
                    rgba(255, 0, 0, 0.3) 100%);
                opacity: 0;
                transition: opacity 0.2s ease-out;
                z-index: 999;
            }
            
            .damage-overlay.active {
                opacity: 1;
            }
            
            .health-critical .health-bar-fill {
                background: linear-gradient(90deg, #F44336, #FF5722);
                animation: pulse-red 1s infinite;
            }
            
            .health-low .health-bar-fill {
                background: linear-gradient(90deg, #FF9800, #FFC107);
            }
            
            .shield-depleted .shield-bar-fill {
                background: linear-gradient(90deg, #607D8B, #90A4AE);
                opacity: 0.5;
            }
            
            @keyframes pulse-red {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.6; }
            }
            
            @keyframes heal-flash {
                0% { background: rgba(0, 255, 0, 0.3); }
                100% { background: transparent; }
            }
            
            @keyframes shield-recharge {
                0% { box-shadow: inset 0 0 10px rgba(33, 150, 243, 0.8); }
                100% { box-shadow: inset 0 0 10px transparent; }
            }
            
            .healing .health-bar-fill {
                animation: heal-flash 0.5s ease-out;
            }
            
            .shield-recharging .shield-bar-fill {
                animation: shield-recharge 0.3s ease-out;
            }
            
            .compact-mode .health-display {
                min-width: 150px;
                gap: 4px;
            }
            
            .compact-mode .health-section {
                padding: 4px 8px;
                gap: 6px;
            }
            
            .compact-mode .health-bar-bg {
                height: 12px;
            }
            
            .compact-mode .shield-section,
            .compact-mode .armor-section {
                height: 6px;
            }
            
            .horizontal .health-display {
                flex-direction: row;
                align-items: center;
            }
            
            .vertical .health-display {
                flex-direction: column;
            }
        `;
        
        document.head.appendChild(style);
    }
    
    bindEvents() {
        // Listen for health events
        if (window.healthSystem) {
            window.healthSystem.addEventListener('healthChanged', (event) => {
                this.updateHealth(event.detail.current, event.detail.max);
            });
            
            window.healthSystem.addEventListener('shieldChanged', (event) => {
                this.updateShield(event.detail.current, event.detail.max);
            });
            
            window.healthSystem.addEventListener('armorChanged', (event) => {
                this.updateArmor(event.detail.current, event.detail.max);
            });
            
            window.healthSystem.addEventListener('damageTaken', (event) => {
                this.showDamageEffect(event.detail.amount, event.detail.type);
            });
            
            window.healthSystem.addEventListener('statusEffectAdded', (event) => {
                this.addStatusEffect(event.detail.effect);
            });
            
            window.healthSystem.addEventListener('statusEffectRemoved', (event) => {
                this.removeStatusEffect(event.detail.effectId);
            });
        }
        
        // Listen for settings changes
        if (window.settingsManager) {
            window.settingsManager.addEventListener('hudSettingsChanged', (event) => {
                this.updateSettings(event.detail.healthDisplay);
            });
        }
    }
    
    updateHealth(current, max = null) {
        const oldHealth = this.health;
        this.health = Math.max(0, current);
        
        if (max !== null) {
            this.maxHealth = max;
        }
        
        // Trigger healing animation if health increased
        if (current > oldHealth) {
            this.showHealingEffect();
        }
        
        this.updateHealthDisplay();
        
        this.events.dispatchEvent(new CustomEvent('healthUpdated', {
            detail: { 
                current: this.health, 
                max: this.maxHealth,
                previous: oldHealth
            }
        }));
        
        // Audio feedback
        this.playHealthAudio(oldHealth);
    }
    
    updateShield(current, max = null) {
        const oldShield = this.shield;
        this.shield = Math.max(0, current);
        
        if (max !== null) {
            this.maxShield = max;
        }
        
        // Trigger shield recharge animation if shield increased
        if (current > oldShield && oldShield < this.maxShield) {
            this.showShieldRechargeEffect();
        }
        
        this.updateShieldDisplay();
    }
    
    updateArmor(current, max = null) {
        this.armor = Math.max(0, current);
        
        if (max !== null) {
            this.maxArmor = max;
        }
        
        this.updateArmorDisplay();
    }
    
    updateHealthDisplay() {
        const healthRatio = this.health / this.maxHealth;
        
        // Update health bar
        if (this.displayElements.healthBar) {
            this.displayElements.healthBar.style.width = `${healthRatio * 100}%`;
            
            // Update color based on health level
            const section = this.displayElements.healthBar.parentElement.parentElement;
            section.classList.remove('health-critical', 'health-low');
            
            if (healthRatio <= this.thresholds.critical) {
                section.classList.add('health-critical');
                this.displayElements.healthBar.style.background = 
                    `linear-gradient(90deg, ${this.colors.health.critical}, #FF5722)`;
            } else if (healthRatio <= this.thresholds.low) {
                section.classList.add('health-low');
                this.displayElements.healthBar.style.background = 
                    `linear-gradient(90deg, ${this.colors.health.low}, ${this.colors.health.medium})`;
            } else {
                this.displayElements.healthBar.style.background = 
                    `linear-gradient(90deg, ${this.colors.health.full}, ${this.colors.health.high})`;
            }
        }
        
        // Update health number
        if (this.displayElements.healthNumber) {
            if (this.settings.showNumbers) {
                if (this.settings.showPercentage) {
                    this.displayElements.healthNumber.textContent = `${Math.round(healthRatio * 100)}%`;
                } else {
                    this.displayElements.healthNumber.textContent = Math.round(this.health).toString();
                }
                this.displayElements.healthNumber.style.display = 'block';
            } else {
                this.displayElements.healthNumber.style.display = 'none';
            }
        }
    }
    
    updateShieldDisplay() {
        const shieldRatio = this.maxShield > 0 ? this.shield / this.maxShield : 0;
        
        if (this.displayElements.shieldBar) {
            this.displayElements.shieldBar.style.width = `${shieldRatio * 100}%`;
            
            const section = this.displayElements.shieldBar.parentElement.parentElement;
            section.classList.toggle('shield-depleted', this.shield === 0);
        }
        
        // Show/hide shield section
        const shieldSection = document.querySelector('.shield-section');
        if (shieldSection) {
            shieldSection.style.display = 
                (this.settings.showShield && this.maxShield > 0) ? 'block' : 'none';
        }
    }
    
    updateArmorDisplay() {
        const armorRatio = this.maxArmor > 0 ? this.armor / this.maxArmor : 0;
        
        if (this.displayElements.armorBar) {
            this.displayElements.armorBar.style.width = `${armorRatio * 100}%`;
        }
        
        // Show/hide armor section
        const armorSection = document.querySelector('.armor-section');
        if (armorSection) {
            armorSection.style.display = 
                (this.settings.showArmor && this.maxArmor > 0) ? 'block' : 'none';
        }
    }
    
    showDamageEffect(amount, type = 'generic') {
        this.lastDamageTime = Date.now() / 1000;
        
        // Show damage overlay
        if (this.displayElements.damageOverlay) {
            this.displayElements.damageOverlay.classList.add('active');
            
            setTimeout(() => {
                this.displayElements.damageOverlay.classList.remove('active');
            }, this.animations.damageFlash.duration);
        }
        
        // Screen shake effect
        if (window.playerCamera) {
            const shakeIntensity = Math.min(amount / 50, 1.0);
            window.playerCamera.addScreenShake(shakeIntensity, 0.3);
        }
    }
    
    showHealingEffect() {
        const healthSection = document.querySelector('.health-section');
        if (healthSection) {
            healthSection.classList.add('healing');
            
            setTimeout(() => {
                healthSection.classList.remove('healing');
            }, this.animations.healing.duration);
        }
    }
    
    showShieldRechargeEffect() {
        const shieldSection = document.querySelector('.shield-section');
        if (shieldSection) {
            shieldSection.classList.add('shield-recharging');
            
            setTimeout(() => {
                shieldSection.classList.remove('shield-recharging');
            }, this.animations.shieldRecharge.duration);
        }
    }
    
    addStatusEffect(effect) {
        this.statusEffects.set(effect.id, effect);
        this.updateStatusEffectsDisplay();
    }
    
    removeStatusEffect(effectId) {
        this.statusEffects.delete(effectId);
        this.updateStatusEffectsDisplay();
    }
    
    updateStatusEffectsDisplay() {
        if (!this.displayElements.statusContainer || !this.settings.showStatusEffects) {
            return;
        }
        
        // Clear existing effects
        this.displayElements.statusContainer.innerHTML = '';
        
        // Add current effects
        this.statusEffects.forEach((effect, id) => {
            const effectElement = document.createElement('div');
            effectElement.className = `status-effect ${effect.type}`;
            effectElement.title = effect.name;
            effectElement.innerHTML = effect.icon || '?';
            
            // Add duration bar if effect has duration
            if (effect.duration > 0) {
                const durationBar = document.createElement('div');
                durationBar.className = 'duration';
                effectElement.appendChild(durationBar);
                
                // Animate duration
                this.animateStatusDuration(durationBar, effect);
            }
            
            this.displayElements.statusContainer.appendChild(effectElement);
        });
    }
    
    animateStatusDuration(durationBar, effect) {
        const startTime = Date.now();
        const duration = effect.duration * 1000; // Convert to milliseconds
        
        const updateDuration = () => {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, 1 - (elapsed / duration));
            
            durationBar.style.width = `${remaining * 100}%`;
            
            if (remaining > 0) {
                requestAnimationFrame(updateDuration);
            }
        };
        
        updateDuration();
    }
    
    startRegenerationLoop() {
        setInterval(() => {
            this.processRegeneration();
        }, 1000); // Update every second
    }
    
    processRegeneration() {
        const currentTime = Date.now() / 1000;
        
        // Health regeneration
        if (this.regeneration.healthEnabled && 
            this.health < this.maxHealth &&
            (currentTime - this.lastDamageTime) >= this.regeneration.healthDelay) {
            
            const newHealth = Math.min(this.maxHealth, this.health + this.regeneration.healthRate);
            this.updateHealth(newHealth);
        }
        
        // Shield regeneration
        if (this.regeneration.shieldEnabled && 
            this.shield < this.maxShield &&
            (currentTime - this.lastDamageTime) >= this.regeneration.shieldDelay) {
            
            const newShield = Math.min(this.maxShield, this.shield + this.regeneration.shieldRate);
            this.updateShield(newShield);
        }
    }
    
    playHealthAudio(oldHealth) {
        if (!window.audioManager) return;
        
        const healthRatio = this.health / this.maxHealth;
        
        if (this.health < oldHealth) {
            // Damage taken
            if (healthRatio <= this.thresholds.critical) {
                window.audioManager.playSound('health_critical', 0.6);
            } else if (healthRatio <= this.thresholds.low) {
                window.audioManager.playSound('health_low', 0.4);
            }
        } else if (this.health > oldHealth) {
            // Healing
            window.audioManager.playSound('health_restore', 0.3);
        }
    }
    
    // Public API methods
    setVisible(visible) {
        this.isVisible = visible;
        
        const container = document.getElementById('health-display');
        if (container) {
            container.style.display = visible ? 'flex' : 'none';
        }
    }
    
    updateSettings(settings) {
        Object.assign(this.settings, settings);
        this.updateDisplay();
        this.updateVisibility();
        
        // Apply layout changes
        const container = document.getElementById('health-display');
        if (container) {
            container.classList.toggle('compact-mode', this.settings.compactMode);
            container.classList.toggle('horizontal', this.settings.orientation === 'horizontal');
            container.classList.toggle('vertical', this.settings.orientation === 'vertical');
        }
    }
    
    updateDisplay() {
        this.updateHealthDisplay();
        this.updateShieldDisplay();
        this.updateArmorDisplay();
        this.updateStatusEffectsDisplay();
    }
    
    updateVisibility() {
        // Update visibility of individual components based on settings
        this.updateHealthDisplay();
        this.updateShieldDisplay();
        this.updateArmorDisplay();
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
            health: this.health,
            maxHealth: this.maxHealth,
            shield: this.shield,
            maxShield: this.maxShield,
            armor: this.armor,
            maxArmor: this.maxArmor,
            statusEffects: Array.from(this.statusEffects.keys()),
            isVisible: this.isVisible,
            settings: this.settings,
            regeneration: this.regeneration
        };
    }
    
    simulateDamage(amount) {
        const newHealth = Math.max(0, this.health - amount);
        this.updateHealth(newHealth);
        this.showDamageEffect(amount);
    }
    
    simulateHealing(amount) {
        const newHealth = Math.min(this.maxHealth, this.health + amount);
        this.updateHealth(newHealth);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HealthDisplay;
} else {
    window.HealthDisplay = HealthDisplay;
}
