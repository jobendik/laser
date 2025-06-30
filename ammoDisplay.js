/**
 * Ammo Display System - HUD Ammunition Counter
 * Displays current ammo, magazine count, reload progress, and low ammo warnings
 */

class AmmoDisplay {
    constructor() {
        this.currentAmmo = 0;
        this.maxAmmo = 30;
        this.reserveAmmo = 90;
        this.maxReserveAmmo = 120;
        this.reloadProgress = 0;
        this.isReloading = false;
        this.weaponType = 'rifle';
        
        this.displayElements = {
            currentAmmo: null,
            separator: null,
            reserveAmmo: null,
            reloadBar: null,
            lowAmmoWarning: null,
            weaponIcon: null,
            fireMode: null
        };
        
        this.styles = {
            normal: {
                color: '#FFFFFF',
                fontSize: '24px',
                fontWeight: 'bold',
                opacity: 1.0
            },
            lowAmmo: {
                color: '#FF6B6B',
                fontSize: '26px',
                fontWeight: 'bold',
                opacity: 1.0,
                animation: 'pulse'
            },
            critical: {
                color: '#FF3333',
                fontSize: '28px',
                fontWeight: 'bold',
                opacity: 1.0,
                animation: 'flash'
            },
            reloading: {
                color: '#FFA500',
                fontSize: '24px',
                fontWeight: 'bold',
                opacity: 0.8
            }
        };
        
        this.thresholds = {
            lowAmmo: 0.3,      // 30% of magazine
            critical: 0.1,     // 10% of magazine
            lowReserve: 0.2    // 20% of reserve ammo
        };
        
        this.animations = {
            ammoChange: {
                duration: 200,
                easing: 'ease-out'
            },
            reload: {
                duration: 100,
                easing: 'ease-in-out'
            },
            warning: {
                duration: 800,
                easing: 'ease-in-out'
            }
        };
        
        this.settings = {
            showReloadProgress: true,
            showFireMode: true,
            showWeaponIcon: true,
            compactMode: false,
            position: 'bottom-right',
            showReserveAmmo: true,
            showPercentage: false
        };
        
        this.isVisible = true;
        this.lastAmmoCount = 0;
        this.pulseAnimation = null;
        this.flashAnimation = null;
        
        this.events = new EventTarget();
        
        this.init();
    }
    
    init() {
        this.createHUDElements();
        this.bindEvents();
        this.updateDisplay();
    }
    
    createHUDElements() {
        if (!window.hudManager) {
            console.warn('HUD Manager not available');
            return;
        }
        
        // Create main ammo container
        const ammoContainer = document.createElement('div');
        ammoContainer.id = 'ammo-display';
        ammoContainer.className = 'hud-element ammo-display';
        
        // Current ammo number
        this.displayElements.currentAmmo = document.createElement('span');
        this.displayElements.currentAmmo.className = 'ammo-current';
        this.displayElements.currentAmmo.textContent = '30';
        
        // Separator
        this.displayElements.separator = document.createElement('span');
        this.displayElements.separator.className = 'ammo-separator';
        this.displayElements.separator.textContent = ' / ';
        
        // Reserve ammo
        this.displayElements.reserveAmmo = document.createElement('span');
        this.displayElements.reserveAmmo.className = 'ammo-reserve';
        this.displayElements.reserveAmmo.textContent = '90';
        
        // Reload progress bar
        this.displayElements.reloadBar = document.createElement('div');
        this.displayElements.reloadBar.className = 'reload-progress';
        this.displayElements.reloadBar.innerHTML = `
            <div class="reload-bar-bg">
                <div class="reload-bar-fill"></div>
            </div>
            <span class="reload-text">RELOADING</span>
        `;
        
        // Low ammo warning
        this.displayElements.lowAmmoWarning = document.createElement('div');
        this.displayElements.lowAmmoWarning.className = 'low-ammo-warning';
        this.displayElements.lowAmmoWarning.textContent = 'LOW AMMO';
        
        // Weapon icon
        this.displayElements.weaponIcon = document.createElement('img');
        this.displayElements.weaponIcon.className = 'weapon-icon';
        this.displayElements.weaponIcon.src = 'assets/ui/icons/rifle.png';
        
        // Fire mode indicator
        this.displayElements.fireMode = document.createElement('span');
        this.displayElements.fireMode.className = 'fire-mode';
        this.displayElements.fireMode.textContent = 'AUTO';
        
        // Assemble the display
        ammoContainer.appendChild(this.displayElements.weaponIcon);
        ammoContainer.appendChild(this.displayElements.currentAmmo);
        ammoContainer.appendChild(this.displayElements.separator);
        ammoContainer.appendChild(this.displayElements.reserveAmmo);
        ammoContainer.appendChild(this.displayElements.fireMode);
        ammoContainer.appendChild(this.displayElements.reloadBar);
        ammoContainer.appendChild(this.displayElements.lowAmmoWarning);
        
        // Add to HUD
        window.hudManager.addElement('ammoDisplay', ammoContainer);
        
        this.applyStyles();
        this.updateVisibility();
    }
    
    applyStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .ammo-display {
                position: fixed;
                bottom: 80px;
                right: 40px;
                font-family: 'Orbitron', monospace;
                color: #FFFFFF;
                font-size: 24px;
                font-weight: bold;
                text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
                z-index: 1000;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .ammo-current {
                color: #FFFFFF;
                font-size: 32px;
                min-width: 60px;
                text-align: right;
                transition: all 0.2s ease-out;
            }
            
            .ammo-separator {
                color: #CCCCCC;
                font-size: 24px;
            }
            
            .ammo-reserve {
                color: #CCCCCC;
                font-size: 20px;
                min-width: 40px;
            }
            
            .weapon-icon {
                width: 32px;
                height: 32px;
                opacity: 0.8;
                filter: drop-shadow(2px 2px 4px rgba(0, 0, 0, 0.8));
            }
            
            .fire-mode {
                color: #FFA500;
                font-size: 12px;
                font-weight: normal;
                background: rgba(0, 0, 0, 0.5);
                padding: 2px 6px;
                border-radius: 3px;
                margin-left: 8px;
            }
            
            .reload-progress {
                position: absolute;
                bottom: -25px;
                left: 0;
                right: 0;
                height: 20px;
                display: none;
            }
            
            .reload-bar-bg {
                width: 100%;
                height: 6px;
                background: rgba(0, 0, 0, 0.6);
                border-radius: 3px;
                overflow: hidden;
            }
            
            .reload-bar-fill {
                height: 100%;
                background: linear-gradient(90deg, #FFA500, #FF6B00);
                width: 0%;
                transition: width 0.1s ease-out;
                border-radius: 3px;
            }
            
            .reload-text {
                position: absolute;
                top: -18px;
                left: 50%;
                transform: translateX(-50%);
                font-size: 10px;
                color: #FFA500;
                font-weight: normal;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            
            .low-ammo-warning {
                position: absolute;
                top: -25px;
                left: 0;
                right: 0;
                text-align: center;
                font-size: 12px;
                color: #FF6B6B;
                font-weight: bold;
                opacity: 0;
                animation: pulse 1s infinite;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            
            @keyframes pulse {
                0%, 100% { opacity: 0.6; }
                50% { opacity: 1; }
            }
            
            @keyframes flash {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.3; }
            }
            
            @keyframes ammoChange {
                0% { transform: scale(1); }
                50% { transform: scale(1.1); }
                100% { transform: scale(1); }
            }
            
            .ammo-low {
                color: #FF6B6B !important;
                animation: pulse 2s infinite;
            }
            
            .ammo-critical {
                color: #FF3333 !important;
                animation: flash 1s infinite;
            }
            
            .ammo-reloading {
                color: #FFA500 !important;
                opacity: 0.8;
            }
            
            .compact-mode .ammo-display {
                font-size: 18px;
                gap: 4px;
            }
            
            .compact-mode .ammo-current {
                font-size: 24px;
                min-width: 40px;
            }
            
            .compact-mode .weapon-icon {
                width: 24px;
                height: 24px;
            }
        `;
        
        document.head.appendChild(style);
    }
    
    bindEvents() {
        // Listen for weapon events
        if (window.weaponManager) {
            window.weaponManager.addEventListener('ammoChanged', (event) => {
                this.updateAmmo(event.detail.current, event.detail.reserve);
            });
            
            window.weaponManager.addEventListener('weaponChanged', (event) => {
                this.updateWeapon(event.detail.weaponType, event.detail.fireMode);
            });
            
            window.weaponManager.addEventListener('reloadStarted', (event) => {
                this.startReload(event.detail.duration);
            });
            
            window.weaponManager.addEventListener('reloadFinished', () => {
                this.finishReload();
            });
        }
        
        // Listen for settings changes
        if (window.settingsManager) {
            window.settingsManager.addEventListener('hudSettingsChanged', (event) => {
                this.updateSettings(event.detail.ammoDisplay);
            });
        }
    }
    
    updateAmmo(current, reserve = null) {
        const oldAmmo = this.currentAmmo;
        this.currentAmmo = current;
        
        if (reserve !== null) {
            this.reserveAmmo = reserve;
        }
        
        this.updateDisplay();
        
        // Trigger ammo change animation if amount changed
        if (oldAmmo !== current) {
            this.animateAmmoChange();
            
            this.events.dispatchEvent(new CustomEvent('ammoChanged', {
                detail: { 
                    current: current, 
                    reserve: this.reserveAmmo,
                    previous: oldAmmo
                }
            }));
        }
        
        // Check for low ammo warnings
        this.checkAmmoWarnings();
    }
    
    updateWeapon(weaponType, fireMode = 'AUTO') {
        this.weaponType = weaponType;
        
        // Update weapon icon
        if (this.displayElements.weaponIcon) {
            this.displayElements.weaponIcon.src = `assets/ui/icons/${weaponType}.png`;
        }
        
        // Update fire mode
        if (this.displayElements.fireMode) {
            this.displayElements.fireMode.textContent = fireMode;
        }
        
        // Update max ammo based on weapon type
        this.updateMaxAmmo(weaponType);
    }
    
    updateMaxAmmo(weaponType) {
        const ammoCapacity = {
            pistol: { magazine: 15, reserve: 60 },
            rifle: { magazine: 30, reserve: 120 },
            sniper: { magazine: 5, reserve: 25 },
            shotgun: { magazine: 8, reserve: 32 },
            smg: { magazine: 25, reserve: 100 },
            lmg: { magazine: 100, reserve: 200 }
        };
        
        const capacity = ammoCapacity[weaponType] || ammoCapacity.rifle;
        this.maxAmmo = capacity.magazine;
        this.maxReserveAmmo = capacity.reserve;
    }
    
    startReload(duration = 2.0) {
        this.isReloading = true;
        this.reloadProgress = 0;
        
        if (this.displayElements.reloadBar) {
            this.displayElements.reloadBar.style.display = 'block';
        }
        
        // Animate reload progress
        this.animateReload(duration);
        
        this.updateDisplay();
    }
    
    finishReload() {
        this.isReloading = false;
        this.reloadProgress = 0;
        
        if (this.displayElements.reloadBar) {
            this.displayElements.reloadBar.style.display = 'none';
        }
        
        this.updateDisplay();
    }
    
    animateReload(duration) {
        const startTime = Date.now();
        
        const updateProgress = () => {
            if (!this.isReloading) return;
            
            const elapsed = (Date.now() - startTime) / 1000;
            this.reloadProgress = Math.min(elapsed / duration, 1.0);
            
            // Update reload bar
            const fillElement = this.displayElements.reloadBar?.querySelector('.reload-bar-fill');
            if (fillElement) {
                fillElement.style.width = `${this.reloadProgress * 100}%`;
            }
            
            if (this.reloadProgress < 1.0) {
                requestAnimationFrame(updateProgress);
            }
        };
        
        requestAnimationFrame(updateProgress);
    }
    
    updateDisplay() {
        if (!this.isVisible) return;
        
        // Update current ammo
        if (this.displayElements.currentAmmo) {
            this.displayElements.currentAmmo.textContent = this.currentAmmo.toString();
        }
        
        // Update reserve ammo
        if (this.displayElements.reserveAmmo && this.settings.showReserveAmmo) {
            this.displayElements.reserveAmmo.textContent = this.reserveAmmo.toString();
            this.displayElements.reserveAmmo.style.display = 'inline';
            this.displayElements.separator.style.display = 'inline';
        } else {
            if (this.displayElements.reserveAmmo) {
                this.displayElements.reserveAmmo.style.display = 'none';
            }
            if (this.displayElements.separator) {
                this.displayElements.separator.style.display = 'none';
            }
        }
        
        // Update percentage if enabled
        if (this.settings.showPercentage && this.displayElements.currentAmmo) {
            const percentage = Math.round((this.currentAmmo / this.maxAmmo) * 100);
            this.displayElements.currentAmmo.title = `${percentage}% of magazine`;
        }
        
        // Apply state-based styling
        this.applyStateStyles();
        
        // Update visibility of optional elements
        this.updateElementVisibility();
    }
    
    applyStateStyles() {
        const ammoElement = this.displayElements.currentAmmo;
        if (!ammoElement) return;
        
        // Remove existing state classes
        ammoElement.classList.remove('ammo-low', 'ammo-critical', 'ammo-reloading');
        
        if (this.isReloading) {
            ammoElement.classList.add('ammo-reloading');
        } else {
            const ammoRatio = this.currentAmmo / this.maxAmmo;
            
            if (ammoRatio <= this.thresholds.critical) {
                ammoElement.classList.add('ammo-critical');
            } else if (ammoRatio <= this.thresholds.lowAmmo) {
                ammoElement.classList.add('ammo-low');
            }
        }
    }
    
    updateElementVisibility() {
        // Fire mode
        if (this.displayElements.fireMode) {
            this.displayElements.fireMode.style.display = 
                this.settings.showFireMode ? 'inline' : 'none';
        }
        
        // Weapon icon
        if (this.displayElements.weaponIcon) {
            this.displayElements.weaponIcon.style.display = 
                this.settings.showWeaponIcon ? 'inline' : 'none';
        }
        
        // Reload progress
        if (this.displayElements.reloadBar) {
            this.displayElements.reloadBar.style.display = 
                (this.settings.showReloadProgress && this.isReloading) ? 'block' : 'none';
        }
    }
    
    checkAmmoWarnings() {
        const ammoRatio = this.currentAmmo / this.maxAmmo;
        const reserveRatio = this.reserveAmmo / this.maxReserveAmmo;
        
        // Low ammo warning
        if (ammoRatio <= this.thresholds.lowAmmo && this.displayElements.lowAmmoWarning) {
            this.displayElements.lowAmmoWarning.style.opacity = '1';
        } else if (this.displayElements.lowAmmoWarning) {
            this.displayElements.lowAmmoWarning.style.opacity = '0';
        }
        
        // Audio warnings
        if (window.audioManager) {
            if (ammoRatio <= this.thresholds.critical && this.currentAmmo > 0) {
                window.audioManager.playSound('ammo_critical', 0.4);
            } else if (ammoRatio <= this.thresholds.lowAmmo) {
                window.audioManager.playSound('ammo_low', 0.3);
            }
            
            if (this.currentAmmo === 0) {
                window.audioManager.playSound('ammo_empty', 0.5);
            }
        }
    }
    
    animateAmmoChange() {
        if (this.displayElements.currentAmmo) {
            this.displayElements.currentAmmo.style.animation = 'none';
            // Trigger reflow
            this.displayElements.currentAmmo.offsetHeight;
            this.displayElements.currentAmmo.style.animation = 'ammoChange 0.3s ease-out';
        }
    }
    
    // Public API methods
    setVisible(visible) {
        this.isVisible = visible;
        
        const container = document.getElementById('ammo-display');
        if (container) {
            container.style.display = visible ? 'flex' : 'none';
        }
    }
    
    updateSettings(settings) {
        Object.assign(this.settings, settings);
        this.updateDisplay();
        
        // Apply compact mode
        const container = document.getElementById('ammo-display');
        if (container) {
            container.classList.toggle('compact-mode', this.settings.compactMode);
        }
    }
    
    setPosition(position) {
        this.settings.position = position;
        
        const container = document.getElementById('ammo-display');
        if (!container) return;
        
        // Reset position styles
        container.style.top = 'auto';
        container.style.bottom = 'auto';
        container.style.left = 'auto';
        container.style.right = 'auto';
        
        // Apply new position
        switch (position) {
            case 'top-left':
                container.style.top = '40px';
                container.style.left = '40px';
                break;
            case 'top-right':
                container.style.top = '40px';
                container.style.right = '40px';
                break;
            case 'bottom-left':
                container.style.bottom = '80px';
                container.style.left = '40px';
                break;
            case 'bottom-right':
            default:
                container.style.bottom = '80px';
                container.style.right = '40px';
                break;
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
            currentAmmo: this.currentAmmo,
            maxAmmo: this.maxAmmo,
            reserveAmmo: this.reserveAmmo,
            maxReserveAmmo: this.maxReserveAmmo,
            isReloading: this.isReloading,
            reloadProgress: this.reloadProgress,
            weaponType: this.weaponType,
            isVisible: this.isVisible,
            settings: this.settings
        };
    }
    
    simulateLowAmmo() {
        this.updateAmmo(Math.floor(this.maxAmmo * this.thresholds.lowAmmo));
    }
    
    simulateEmptyAmmo() {
        this.updateAmmo(0);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AmmoDisplay;
} else {
    window.AmmoDisplay = AmmoDisplay;
}
