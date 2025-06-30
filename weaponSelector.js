/**
 * WeaponSelector.js
 * Weapon selection and quick-swap UI system
 * Handles weapon wheel, quick select, and inventory display
 */

class WeaponSelector extends pc.ScriptType {
    static get scriptName() { return 'WeaponSelector'; }

    initialize() {
        this.weaponManager = this.app.root.findByName('WeaponManager')?.script?.weaponManager;
        this.inputManager = this.app.root.findByName('InputManager')?.script?.inputManager;
        this.hudManager = this.app.root.findByName('HUDManager')?.script?.hudManager;
        this.audioManager = this.app.root.findByName('AudioManager')?.script?.audioManager;
        
        // UI elements
        this.weaponWheel = null;
        this.quickSelectBar = null;
        this.weaponInfo = null;
        
        // State
        this.isWheelOpen = false;
        this.selectedWeaponIndex = 0;
        this.hoveredWeaponIndex = -1;
        this.wheelCenterX = 0;
        this.wheelCenterY = 0;
        this.wheelRadius = 120;
        
        // Settings
        this.quickSelectSlots = 4; // Number of quick select slots
        this.wheelActivationDelay = 200; // ms to hold before wheel appears
        this.fadeTime = 0.2; // seconds for UI fade
        
        // Input tracking
        this.mousePosition = { x: 0, y: 0 };
        this.wheelActivationTimer = 0;
        this.wheelKeyPressed = false;
        
        this.setupUI();
        this.setupEventListeners();
        this.updateWeaponDisplay();
    }

    setupUI() {
        this.createQuickSelectBar();
        this.createWeaponWheel();
        this.createWeaponInfo();
        this.setupCSS();
    }

    createQuickSelectBar() {
        this.quickSelectBar = document.createElement('div');
        this.quickSelectBar.id = 'weapon-quick-select';
        this.quickSelectBar.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 10px;
            z-index: 1000;
            pointer-events: none;
        `;
        
        // Create weapon slots
        for (let i = 0; i < this.quickSelectSlots; i++) {
            const slot = document.createElement('div');
            slot.className = 'weapon-slot';
            slot.id = `weapon-slot-${i}`;
            slot.style.cssText = `
                width: 60px;
                height: 60px;
                background: linear-gradient(145deg, rgba(0,0,0,0.8), rgba(50,50,50,0.8));
                border: 2px solid rgba(255,255,255,0.3);
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                color: white;
                font-weight: bold;
                transition: all 0.2s ease;
                position: relative;
                overflow: hidden;
            `;
            
            // Slot number
            const slotNumber = document.createElement('div');
            slotNumber.className = 'slot-number';
            slotNumber.textContent = (i + 1).toString();
            slotNumber.style.cssText = `
                position: absolute;
                top: 2px;
                left: 4px;
                font-size: 10px;
                color: rgba(255,255,255,0.6);
            `;
            
            // Weapon icon
            const weaponIcon = document.createElement('div');
            weaponIcon.className = 'weapon-icon';
            weaponIcon.style.cssText = `
                font-size: 20px;
                text-align: center;
            `;
            
            // Ammo indicator
            const ammoIndicator = document.createElement('div');
            ammoIndicator.className = 'ammo-indicator';
            ammoIndicator.style.cssText = `
                position: absolute;
                bottom: 2px;
                right: 4px;
                font-size: 8px;
                color: rgba(255,255,255,0.8);
            `;
            
            slot.appendChild(slotNumber);
            slot.appendChild(weaponIcon);
            slot.appendChild(ammoIndicator);
            this.quickSelectBar.appendChild(slot);
        }
        
        document.body.appendChild(this.quickSelectBar);
    }

    createWeaponWheel() {
        this.weaponWheel = document.createElement('div');
        this.weaponWheel.id = 'weapon-wheel';
        this.weaponWheel.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            width: 300px;
            height: 300px;
            transform: translate(-50%, -50%);
            background: radial-gradient(circle, rgba(0,0,0,0.1), rgba(0,0,0,0.8));
            border-radius: 50%;
            display: none;
            z-index: 2000;
            pointer-events: auto;
        `;
        
        // Center circle
        const centerCircle = document.createElement('div');
        centerCircle.className = 'wheel-center';
        centerCircle.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            width: 80px;
            height: 80px;
            background: linear-gradient(145deg, rgba(0,0,0,0.9), rgba(50,50,50,0.9));
            border: 3px solid rgba(255,255,255,0.4);
            border-radius: 50%;
            transform: translate(-50%, -50%);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            color: white;
            font-weight: bold;
            text-align: center;
        `;
        centerCircle.textContent = 'SELECT';
        
        this.weaponWheel.appendChild(centerCircle);
        document.body.appendChild(this.weaponWheel);
    }

    createWeaponInfo() {
        this.weaponInfo = document.createElement('div');
        this.weaponInfo.id = 'weapon-info';
        this.weaponInfo.style.cssText = `
            position: fixed;
            bottom: 200px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(145deg, rgba(0,0,0,0.9), rgba(30,30,30,0.9));
            border: 1px solid rgba(255,255,255,0.3);
            border-radius: 10px;
            padding: 15px;
            min-width: 250px;
            max-width: 350px;
            color: white;
            font-family: 'Segoe UI', sans-serif;
            display: none;
            z-index: 1500;
            pointer-events: none;
            backdrop-filter: blur(10px);
        `;
        
        document.body.appendChild(this.weaponInfo);
    }

    setupCSS() {
        const style = document.createElement('style');
        style.textContent = `
            .weapon-slot.active {
                border-color: #00ff00;
                box-shadow: 0 0 15px rgba(0,255,0,0.5);
                background: linear-gradient(145deg, rgba(0,50,0,0.8), rgba(0,100,0,0.6));
            }
            
            .weapon-slot.empty {
                opacity: 0.5;
            }
            
            .weapon-slot:not(.empty):hover {
                border-color: #ffff00;
                box-shadow: 0 0 10px rgba(255,255,0,0.3);
            }
            
            .weapon-wheel-segment {
                position: absolute;
                width: 100px;
                height: 100px;
                border: 2px solid rgba(255,255,255,0.2);
                border-radius: 10px;
                background: linear-gradient(145deg, rgba(0,0,0,0.7), rgba(50,50,50,0.7));
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                color: white;
                transition: all 0.2s ease;
                cursor: pointer;
                backdrop-filter: blur(5px);
            }
            
            .weapon-wheel-segment:hover,
            .weapon-wheel-segment.highlighted {
                border-color: #00ff00;
                background: linear-gradient(145deg, rgba(0,50,0,0.8), rgba(0,100,0,0.6));
                transform: scale(1.1);
                box-shadow: 0 0 20px rgba(0,255,0,0.4);
            }
            
            .weapon-wheel-segment.empty {
                opacity: 0.3;
                cursor: not-allowed;
            }
            
            .weapon-wheel-icon {
                font-size: 24px;
                margin-bottom: 5px;
            }
            
            .weapon-wheel-name {
                font-size: 10px;
                text-align: center;
                font-weight: bold;
            }
            
            .weapon-wheel-ammo {
                font-size: 8px;
                color: rgba(255,255,255,0.7);
                margin-top: 2px;
            }
            
            .weapon-info-header {
                display: flex;
                align-items: center;
                margin-bottom: 10px;
                padding-bottom: 8px;
                border-bottom: 1px solid rgba(255,255,255,0.2);
            }
            
            .weapon-info-icon {
                font-size: 32px;
                margin-right: 15px;
            }
            
            .weapon-info-title {
                flex-grow: 1;
            }
            
            .weapon-info-name {
                font-size: 16px;
                font-weight: bold;
                margin-bottom: 2px;
            }
            
            .weapon-info-type {
                font-size: 12px;
                color: rgba(255,255,255,0.7);
            }
            
            .weapon-info-stats {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
                margin-bottom: 10px;
            }
            
            .weapon-stat {
                display: flex;
                justify-content: space-between;
                font-size: 12px;
            }
            
            .weapon-stat-label {
                color: rgba(255,255,255,0.8);
            }
            
            .weapon-stat-value {
                color: white;
                font-weight: bold;
            }
            
            .weapon-info-ammo {
                text-align: center;
                padding: 8px;
                background: rgba(255,255,255,0.1);
                border-radius: 5px;
                font-size: 14px;
            }
            
            .ammo-current {
                font-size: 18px;
                font-weight: bold;
                color: #00ff00;
            }
            
            .ammo-reserve {
                color: rgba(255,255,255,0.8);
            }
            
            @keyframes wheelFadeIn {
                from {
                    opacity: 0;
                    transform: translate(-50%, -50%) scale(0.8);
                }
                to {
                    opacity: 1;
                    transform: translate(-50%, -50%) scale(1);
                }
            }
            
            @keyframes wheelFadeOut {
                from {
                    opacity: 1;
                    transform: translate(-50%, -50%) scale(1);
                }
                to {
                    opacity: 0;
                    transform: translate(-50%, -50%) scale(0.8);
                }
            }
            
            .weapon-wheel.show {
                animation: wheelFadeIn 0.2s ease;
            }
            
            .weapon-wheel.hide {
                animation: wheelFadeOut 0.2s ease;
            }
        `;
        
        document.head.appendChild(style);
    }

    setupEventListeners() {
        // Input events
        this.app.on('input:wheelkey:down', () => {
            this.wheelKeyPressed = true;
            this.wheelActivationTimer = 0;
        });
        
        this.app.on('input:wheelkey:up', () => {
            this.wheelKeyPressed = false;
            if (this.isWheelOpen) {
                this.selectWeapon();
                this.hideWeaponWheel();
            }
        });
        
        // Number key events for quick select
        for (let i = 1; i <= this.quickSelectSlots; i++) {
            this.app.on(`input:weapon${i}`, () => {
                this.selectWeaponSlot(i - 1);
            });
        }
        
        // Mouse events
        document.addEventListener('mousemove', (event) => {
            this.mousePosition.x = event.clientX;
            this.mousePosition.y = event.clientY;
            
            if (this.isWheelOpen) {
                this.updateWheelSelection();
            }
        });
        
        // Weapon events
        this.app.on('weapon:equipped', (weaponData) => {
            this.selectedWeaponIndex = weaponData.slotIndex;
            this.updateWeaponDisplay();
        });
        
        this.app.on('weapon:added', (weaponData) => {
            this.updateWeaponDisplay();
        });
        
        this.app.on('weapon:removed', (weaponData) => {
            this.updateWeaponDisplay();
        });
        
        this.app.on('weapon:ammoChanged', (weaponData) => {
            this.updateAmmoDisplay(weaponData);
        });
        
        // Next/Previous weapon
        this.app.on('input:nextWeapon', () => {
            this.selectNextWeapon();
        });
        
        this.app.on('input:prevWeapon', () => {
            this.selectPreviousWeapon();
        });
    }

    update(dt) {
        if (this.wheelKeyPressed && !this.isWheelOpen) {
            this.wheelActivationTimer += dt * 1000; // Convert to ms
            
            if (this.wheelActivationTimer >= this.wheelActivationDelay) {
                this.showWeaponWheel();
            }
        }
    }

    showWeaponWheel() {
        if (this.isWheelOpen || !this.weaponManager) return;
        
        this.isWheelOpen = true;
        this.createWheelSegments();
        
        // Show wheel
        this.weaponWheel.style.display = 'block';
        this.weaponWheel.classList.add('show');
        
        // Show weapon info
        this.showWeaponInfo();
        
        // Play sound
        this.playSound('weapon_wheel_open.wav');
        
        // Pause game time (optional)
        this.app.fire('game:pauseTime', true);
    }

    hideWeaponWheel() {
        if (!this.isWheelOpen) return;
        
        this.isWheelOpen = false;
        this.weaponWheel.classList.remove('show');
        this.weaponWheel.classList.add('hide');
        
        // Hide weapon info
        this.weaponInfo.style.display = 'none';
        
        setTimeout(() => {
            this.weaponWheel.style.display = 'none';
            this.weaponWheel.classList.remove('hide');
            this.clearWheelSegments();
        }, 200);
        
        // Resume game time
        this.app.fire('game:pauseTime', false);
        
        // Play sound
        this.playSound('weapon_wheel_close.wav');
    }

    createWheelSegments() {
        if (!this.weaponManager) return;
        
        const weapons = this.weaponManager.getAllWeapons();
        const angleStep = (2 * Math.PI) / Math.max(weapons.length, 6);
        
        weapons.forEach((weapon, index) => {
            const angle = index * angleStep;
            const segment = this.createWheelSegment(weapon, angle, index);
            this.weaponWheel.appendChild(segment);
        });
    }

    createWheelSegment(weapon, angle, index) {
        const segment = document.createElement('div');
        segment.className = 'weapon-wheel-segment';
        segment.dataset.weaponIndex = index;
        
        // Position segment around the wheel
        const x = Math.cos(angle - Math.PI / 2) * this.wheelRadius;
        const y = Math.sin(angle - Math.PI / 2) * this.wheelRadius;
        
        segment.style.transform = `translate(${x - 50}px, ${y - 50}px)`;
        
        // Weapon icon
        const icon = document.createElement('div');
        icon.className = 'weapon-wheel-icon';
        icon.textContent = this.getWeaponIcon(weapon.type);
        
        // Weapon name
        const name = document.createElement('div');
        name.className = 'weapon-wheel-name';
        name.textContent = weapon.name;
        
        // Ammo info
        const ammo = document.createElement('div');
        ammo.className = 'weapon-wheel-ammo';
        ammo.textContent = `${weapon.currentAmmo}/${weapon.reserveAmmo}`;
        
        segment.appendChild(icon);
        segment.appendChild(name);
        segment.appendChild(ammo);
        
        // Click handler
        segment.addEventListener('click', () => {
            this.hoveredWeaponIndex = index;
            this.selectWeapon();
            this.hideWeaponWheel();
        });
        
        return segment;
    }

    clearWheelSegments() {
        const segments = this.weaponWheel.querySelectorAll('.weapon-wheel-segment');
        segments.forEach(segment => segment.remove());
    }

    updateWheelSelection() {
        if (!this.isWheelOpen) return;
        
        // Calculate mouse position relative to wheel center
        const rect = this.weaponWheel.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const deltaX = this.mousePosition.x - centerX;
        const deltaY = this.mousePosition.y - centerY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        // If mouse is too close to center, don't select anything
        if (distance < 40) {
            this.hoveredWeaponIndex = -1;
            this.clearSegmentHighlights();
            return;
        }
        
        // Calculate angle and determine which segment is selected
        const angle = Math.atan2(deltaY, deltaX) + Math.PI / 2;
        const normalizedAngle = angle < 0 ? angle + 2 * Math.PI : angle;
        
        const weapons = this.weaponManager?.getAllWeapons() || [];
        const angleStep = (2 * Math.PI) / Math.max(weapons.length, 6);
        const segmentIndex = Math.floor(normalizedAngle / angleStep);
        
        if (segmentIndex >= 0 && segmentIndex < weapons.length) {
            this.hoveredWeaponIndex = segmentIndex;
            this.highlightSegment(segmentIndex);
            this.updateWeaponInfo(weapons[segmentIndex]);
        } else {
            this.hoveredWeaponIndex = -1;
            this.clearSegmentHighlights();
        }
    }

    highlightSegment(index) {
        this.clearSegmentHighlights();
        
        const segment = this.weaponWheel.querySelector(`[data-weapon-index="${index}"]`);
        if (segment) {
            segment.classList.add('highlighted');
        }
    }

    clearSegmentHighlights() {
        const segments = this.weaponWheel.querySelectorAll('.weapon-wheel-segment');
        segments.forEach(segment => segment.classList.remove('highlighted'));
    }

    selectWeapon() {
        if (this.hoveredWeaponIndex >= 0 && this.weaponManager) {
            this.weaponManager.equipWeaponByIndex(this.hoveredWeaponIndex);
            this.playSound('weapon_select.wav');
        }
    }

    selectWeaponSlot(slotIndex) {
        if (this.weaponManager) {
            this.weaponManager.equipWeaponBySlot(slotIndex);
            this.playSound('weapon_select.wav');
        }
    }

    selectNextWeapon() {
        if (this.weaponManager) {
            this.weaponManager.equipNextWeapon();
            this.playSound('weapon_select.wav');
        }
    }

    selectPreviousWeapon() {
        if (this.weaponManager) {
            this.weaponManager.equipPreviousWeapon();
            this.playSound('weapon_select.wav');
        }
    }

    updateWeaponDisplay() {
        if (!this.weaponManager) return;
        
        const weapons = this.weaponManager.getAllWeapons();
        const currentWeapon = this.weaponManager.getCurrentWeapon();
        
        // Update quick select slots
        for (let i = 0; i < this.quickSelectSlots; i++) {
            const slot = document.getElementById(`weapon-slot-${i}`);
            if (!slot) continue;
            
            const weapon = weapons[i];
            const icon = slot.querySelector('.weapon-icon');
            const ammo = slot.querySelector('.ammo-indicator');
            
            if (weapon) {
                slot.classList.remove('empty');
                icon.textContent = this.getWeaponIcon(weapon.type);
                ammo.textContent = weapon.currentAmmo;
                
                // Highlight current weapon
                if (currentWeapon && weapon.id === currentWeapon.id) {
                    slot.classList.add('active');
                } else {
                    slot.classList.remove('active');
                }
            } else {
                slot.classList.add('empty');
                slot.classList.remove('active');
                icon.textContent = '';
                ammo.textContent = '';
            }
        }
    }

    updateAmmoDisplay(weaponData) {
        const weapons = this.weaponManager?.getAllWeapons() || [];
        const weaponIndex = weapons.findIndex(w => w.id === weaponData.weaponId);
        
        if (weaponIndex >= 0 && weaponIndex < this.quickSelectSlots) {
            const slot = document.getElementById(`weapon-slot-${weaponIndex}`);
            const ammo = slot?.querySelector('.ammo-indicator');
            if (ammo) {
                ammo.textContent = weaponData.currentAmmo;
            }
        }
    }

    showWeaponInfo() {
        const currentWeapon = this.weaponManager?.getCurrentWeapon();
        if (currentWeapon) {
            this.updateWeaponInfo(currentWeapon);
            this.weaponInfo.style.display = 'block';
        }
    }

    updateWeaponInfo(weapon) {
        if (!weapon) {
            this.weaponInfo.style.display = 'none';
            return;
        }
        
        this.weaponInfo.innerHTML = `
            <div class="weapon-info-header">
                <div class="weapon-info-icon">${this.getWeaponIcon(weapon.type)}</div>
                <div class="weapon-info-title">
                    <div class="weapon-info-name">${weapon.name}</div>
                    <div class="weapon-info-type">${weapon.type.toUpperCase()}</div>
                </div>
            </div>
            <div class="weapon-info-stats">
                <div class="weapon-stat">
                    <span class="weapon-stat-label">Damage:</span>
                    <span class="weapon-stat-value">${weapon.damage}</span>
                </div>
                <div class="weapon-stat">
                    <span class="weapon-stat-label">Range:</span>
                    <span class="weapon-stat-value">${weapon.range}m</span>
                </div>
                <div class="weapon-stat">
                    <span class="weapon-stat-label">Fire Rate:</span>
                    <span class="weapon-stat-value">${weapon.fireRate} RPM</span>
                </div>
                <div class="weapon-stat">
                    <span class="weapon-stat-label">Accuracy:</span>
                    <span class="weapon-stat-value">${weapon.accuracy}%</span>
                </div>
            </div>
            <div class="weapon-info-ammo">
                <span class="ammo-current">${weapon.currentAmmo}</span>
                <span class="ammo-separator"> / </span>
                <span class="ammo-reserve">${weapon.reserveAmmo}</span>
            </div>
        `;
        
        this.weaponInfo.style.display = 'block';
    }

    getWeaponIcon(weaponType) {
        const icons = {
            assault: '🔫',
            sniper: '🎯',
            shotgun: '💥',
            smg: '🔫',
            lmg: '⚡',
            pistol: '🔫',
            rifle: '🎯',
            grenade: '💣',
            melee: '🗡️'
        };
        
        return icons[weaponType] || '🔫';
    }

    playSound(soundFile) {
        if (this.audioManager) {
            this.audioManager.playSound(soundFile, {
                volume: 0.3,
                category: 'ui'
            });
        }
    }

    // Settings
    setQuickSelectSlots(count) {
        this.quickSelectSlots = count;
        // Rebuild quick select bar
        this.quickSelectBar.innerHTML = '';
        this.createQuickSelectBar();
        this.updateWeaponDisplay();
    }

    setWheelRadius(radius) {
        this.wheelRadius = radius;
    }

    setActivationDelay(delay) {
        this.wheelActivationDelay = delay;
    }

    // Public API
    toggleWeaponWheel() {
        if (this.isWheelOpen) {
            this.hideWeaponWheel();
        } else {
            this.showWeaponWheel();
        }
    }

    isWheelActive() {
        return this.isWheelOpen;
    }

    getSelectedWeaponIndex() {
        return this.selectedWeaponIndex;
    }

    destroy() {
        if (this.quickSelectBar && this.quickSelectBar.parentNode) {
            this.quickSelectBar.parentNode.removeChild(this.quickSelectBar);
        }
        
        if (this.weaponWheel && this.weaponWheel.parentNode) {
            this.weaponWheel.parentNode.removeChild(this.weaponWheel);
        }
        
        if (this.weaponInfo && this.weaponInfo.parentNode) {
            this.weaponInfo.parentNode.removeChild(this.weaponInfo);
        }
    }
}

pc.registerScript(WeaponSelector, 'WeaponSelector');
