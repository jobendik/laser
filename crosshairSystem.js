/**
 * CrosshairSystem.js
 * Dynamic crosshair behavior system
 * Handles weapon-specific styling, accuracy visualization, hit confirmation feedback, and customization options
 */

class CrosshairSystem extends pc.ScriptType {
    static get scriptName() { return 'CrosshairSystem'; }

    initialize() {
        this.playerController = this.entity.script.playerController;
        this.weaponManager = this.entity.script.weaponManager;
        this.recoilSystem = this.entity.script.recoilSystem;
        this.gameManager = this.app.root.findByName('Game_Manager').script.gameManager;
        this.settingsManager = this.app.root.findByName('Game_Manager').script.settingsManager;
        
        // UI Elements
        this.crosshairElement = null;
        this.hitIndicatorElement = null;
        this.crosshairContainer = null;
        
        // Crosshair State
        this.currentCrosshair = 'default';
        this.isVisible = true;
        this.dynamicSpread = true;
        this.showHitIndicators = true;
        this.showDamageNumbers = true;
        
        // Crosshair Properties
        this.baseSize = 20;
        this.currentSize = 20;
        this.targetSize = 20;
        this.spreadMultiplier = 1.0;
        this.color = new pc.Color(1, 1, 1, 1);
        this.thickness = 2;
        this.gap = 4;
        
        // Animation Properties
        this.animationSpeed = 8.0;
        this.pulseEnabled = false;
        this.pulseSpeed = 2.0;
        this.pulseIntensity = 0.2;
        this.breathingAnimation = false;
        
        // Hit Feedback
        this.hitFeedbackDuration = 0.2;
        this.hitFeedbackIntensity = 1.5;
        this.currentHitFeedback = 0;
        this.lastHitTime = 0;
        this.hitStreakCount = 0;
        this.hitStreakTimeout = 2000;
        
        // Weapon-Specific Crosshairs
        this.weaponCrosshairs = new Map();
        this.customCrosshairs = new Map();
        
        // Damage Indicators
        this.damageNumbers = [];
        this.maxDamageNumbers = 5;
        this.damageNumberLifetime = 2000;
        
        // Settings
        this.userSettings = {
            style: 'classic',
            color: '#FFFFFF',
            size: 1.0,
            opacity: 1.0,
            thickness: 2,
            gap: 4,
            showSpread: true,
            showHitMarkers: true,
            enableAnimation: true
        };
        
        this.initializeCrosshairSystem();
        this.setupEventListeners();
    }

    initializeCrosshairSystem() {
        this.createCrosshairUI();
        this.loadCrosshairStyles();
        this.loadWeaponCrosshairs();
        this.loadUserSettings();
        this.applyCrosshairSettings();
    }

    createCrosshairUI() {
        // Create crosshair container
        this.crosshairContainer = new pc.Entity('CrosshairContainer');
        this.crosshairContainer.addComponent('element', {
            type: 'group',
            anchor: [0.5, 0.5, 0.5, 0.5],
            pivot: [0.5, 0.5]
        });
        
        // Create main crosshair element
        this.crosshairElement = new pc.Entity('Crosshair');
        this.crosshairElement.addComponent('element', {
            type: 'image',
            anchor: [0.5, 0.5, 0.5, 0.5],
            pivot: [0.5, 0.5],
            width: this.baseSize,
            height: this.baseSize
        });
        
        // Create hit indicator
        this.hitIndicatorElement = new pc.Entity('HitIndicator');
        this.hitIndicatorElement.addComponent('element', {
            type: 'image',
            anchor: [0.5, 0.5, 0.5, 0.5],
            pivot: [0.5, 0.5],
            width: this.baseSize * 1.5,
            height: this.baseSize * 1.5,
            opacity: 0
        });
        
        // Setup hierarchy
        this.crosshairContainer.addChild(this.crosshairElement);
        this.crosshairContainer.addChild(this.hitIndicatorElement);
        
        // Add to screen
        const screen = this.app.root.findByName('Screen');
        if (screen) {
            screen.addChild(this.crosshairContainer);
        }
        
        this.createCrosshairGeometry();
    }

    createCrosshairGeometry() {
        // Create SVG-like crosshair using multiple elements for flexibility
        this.crosshairParts = {
            top: this.createCrosshairLine('top'),
            bottom: this.createCrosshairLine('bottom'),
            left: this.createCrosshairLine('left'),
            right: this.createCrosshairLine('right'),
            center: this.createCrosshairDot('center')
        };
        
        Object.values(this.crosshairParts).forEach(part => {
            if (part) {
                this.crosshairElement.addChild(part);
            }
        });
    }

    createCrosshairLine(direction) {
        const line = new pc.Entity(`CrosshairLine_${direction}`);
        
        let width, height, x = 0, y = 0;
        
        switch (direction) {
            case 'top':
                width = this.thickness;
                height = this.baseSize / 4;
                y = this.gap + height / 2;
                break;
            case 'bottom':
                width = this.thickness;
                height = this.baseSize / 4;
                y = -(this.gap + height / 2);
                break;
            case 'left':
                width = this.baseSize / 4;
                height = this.thickness;
                x = -(this.gap + width / 2);
                break;
            case 'right':
                width = this.baseSize / 4;
                height = this.thickness;
                x = this.gap + width / 2;
                break;
        }
        
        line.addComponent('element', {
            type: 'image',
            anchor: [0.5, 0.5, 0.5, 0.5],
            pivot: [0.5, 0.5],
            width: width,
            height: height,
            color: this.color
        });
        
        line.setLocalPosition(x, y, 0);
        return line;
    }

    createCrosshairDot(type) {
        if (type !== 'center') return null;
        
        const dot = new pc.Entity('CrosshairDot');
        dot.addComponent('element', {
            type: 'image',
            anchor: [0.5, 0.5, 0.5, 0.5],
            pivot: [0.5, 0.5],
            width: this.thickness,
            height: this.thickness,
            color: this.color
        });
        
        return dot;
    }

    loadCrosshairStyles() {
        // Define various crosshair styles
        this.crosshairStyles = {
            classic: {
                showLines: true,
                showCenter: false,
                lineLength: 0.25,
                dynamicSpread: true,
                shape: 'cross'
            },
            dot: {
                showLines: false,
                showCenter: true,
                lineLength: 0,
                dynamicSpread: false,
                shape: 'dot'
            },
            circle: {
                showLines: false,
                showCenter: false,
                lineLength: 0,
                dynamicSpread: true,
                shape: 'circle'
            },
            cross_dot: {
                showLines: true,
                showCenter: true,
                lineLength: 0.2,
                dynamicSpread: true,
                shape: 'cross'
            },
            tactical: {
                showLines: true,
                showCenter: false,
                lineLength: 0.3,
                dynamicSpread: true,
                shape: 'cross',
                thickness: 1
            },
            minimal: {
                showLines: true,
                showCenter: false,
                lineLength: 0.15,
                dynamicSpread: false,
                shape: 'cross',
                thickness: 1,
                gap: 2
            }
        };
    }

    loadWeaponCrosshairs() {
        // Define weapon-specific crosshair configurations
        this.weaponCrosshairs.set('assault_rifle', {
            style: 'classic',
            baseSpread: 1.0,
            maxSpread: 3.0,
            spreadRecovery: 2.0,
            movementSpreadMultiplier: 1.5,
            aimingSpreadMultiplier: 0.3
        });
        
        this.weaponCrosshairs.set('sniper_rifle', {
            style: 'dot',
            baseSpread: 0.5,
            maxSpread: 1.5,
            spreadRecovery: 1.0,
            movementSpreadMultiplier: 2.0,
            aimingSpreadMultiplier: 0.1
        });
        
        this.weaponCrosshairs.set('shotgun', {
            style: 'circle',
            baseSpread: 2.0,
            maxSpread: 4.0,
            spreadRecovery: 1.5,
            movementSpreadMultiplier: 1.2,
            aimingSpreadMultiplier: 0.5
        });
        
        this.weaponCrosshairs.set('pistol', {
            style: 'cross_dot',
            baseSpread: 0.8,
            maxSpread: 2.0,
            spreadRecovery: 3.0,
            movementSpreadMultiplier: 1.3,
            aimingSpreadMultiplier: 0.4
        });
        
        this.weaponCrosshairs.set('smg', {
            style: 'tactical',
            baseSpread: 1.2,
            maxSpread: 3.5,
            spreadRecovery: 2.5,
            movementSpreadMultiplier: 1.1,
            aimingSpreadMultiplier: 0.6
        });
    }

    loadUserSettings() {
        // Load user crosshair preferences
        const savedSettings = this.settingsManager?.getSetting('crosshair') || {};
        this.userSettings = { ...this.userSettings, ...savedSettings };
    }

    applyCrosshairSettings() {
        const style = this.crosshairStyles[this.userSettings.style] || this.crosshairStyles.classic;
        
        // Apply style configuration
        this.applyCrosshairStyle(style);
        
        // Apply user customizations
        this.applyUserCustomizations();
    }

    applyCrosshairStyle(style) {
        // Show/hide crosshair parts based on style
        if (this.crosshairParts.top) {
            this.crosshairParts.top.enabled = style.showLines;
        }
        if (this.crosshairParts.bottom) {
            this.crosshairParts.bottom.enabled = style.showLines;
        }
        if (this.crosshairParts.left) {
            this.crosshairParts.left.enabled = style.showLines;
        }
        if (this.crosshairParts.right) {
            this.crosshairParts.right.enabled = style.showLines;
        }
        if (this.crosshairParts.center) {
            this.crosshairParts.center.enabled = style.showCenter;
        }
        
        // Apply style-specific properties
        this.dynamicSpread = style.dynamicSpread;
        
        if (style.thickness) {
            this.thickness = style.thickness;
        }
        
        if (style.gap) {
            this.gap = style.gap;
        }
    }

    applyUserCustomizations() {
        // Apply user color
        const color = this.parseColor(this.userSettings.color);
        this.setColor(color);
        
        // Apply user size
        this.baseSize *= this.userSettings.size;
        this.currentSize = this.baseSize;
        this.targetSize = this.baseSize;
        
        // Apply user opacity
        this.setOpacity(this.userSettings.opacity);
        
        // Apply user thickness and gap
        this.thickness = this.userSettings.thickness;
        this.gap = this.userSettings.gap;
        
        // Recreate geometry with new settings
        this.updateCrosshairGeometry();
    }

    parseColor(colorString) {
        // Parse hex color string to pc.Color
        const hex = colorString.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16) / 255;
        const g = parseInt(hex.substr(2, 2), 16) / 255;
        const b = parseInt(hex.substr(4, 2), 16) / 255;
        return new pc.Color(r, g, b, 1);
    }

    setupEventListeners() {
        // Weapon events
        this.app.on('weapon:changed', this.onWeaponChanged.bind(this));
        this.app.on('weapon:fire', this.onWeaponFire.bind(this));
        this.app.on('weapon:hit', this.onWeaponHit.bind(this));
        this.app.on('weapon:miss', this.onWeaponMiss.bind(this));
        
        // Player events
        this.app.on('player:aim_start', this.onAimStart.bind(this));
        this.app.on('player:aim_end', this.onAimEnd.bind(this));
        this.app.on('player:movement_changed', this.onMovementChanged.bind(this));
        this.app.on('player:stance_changed', this.onStanceChanged.bind(this));
        
        // Game events
        this.app.on('game:settings_changed', this.onSettingsChanged.bind(this));
        this.app.on('game:round_start', this.onRoundStart.bind(this));
        
        // Damage events
        this.app.on('damage:dealt', this.onDamageDealt.bind(this));
    }

    // Crosshair Updates
    updateCrosshairSpread(dt) {
        if (!this.dynamicSpread) return;
        
        const weapon = this.weaponManager?.getCurrentWeapon();
        if (!weapon) return;
        
        const weaponConfig = this.weaponCrosshairs.get(weapon.type) || {};
        const baseSpread = weaponConfig.baseSpread || 1.0;
        
        // Calculate spread factors
        let spreadMultiplier = baseSpread;
        
        // Movement spread
        const velocity = this.playerController?.getVelocity() || new pc.Vec3();
        const isMoving = velocity.length() > 0.1;
        if (isMoving) {
            const movementMultiplier = weaponConfig.movementSpreadMultiplier || 1.5;
            spreadMultiplier *= movementMultiplier;
        }
        
        // Aiming spread
        const isAiming = this.playerController?.isAiming() || false;
        if (isAiming) {
            const aimingMultiplier = weaponConfig.aimingSpreadMultiplier || 0.3;
            spreadMultiplier *= aimingMultiplier;
        }
        
        // Recoil spread
        const recoilAmount = this.recoilSystem?.getCurrentRecoil() || 0;
        spreadMultiplier += recoilAmount * 0.5;
        
        // Firing spread
        const timeSinceLastShot = Date.now() - (weapon.lastFireTime || 0);
        const spreadRecovery = weaponConfig.spreadRecovery || 2.0;
        const firingSpread = Math.max(0, 1 - (timeSinceLastShot / 1000) * spreadRecovery);
        spreadMultiplier += firingSpread;
        
        // Apply spread to crosshair size
        this.targetSize = this.baseSize * spreadMultiplier;
        
        // Smooth size transition
        const sizeDifference = this.targetSize - this.currentSize;
        this.currentSize += sizeDifference * this.animationSpeed * dt;
        
        this.updateCrosshairSize();
    }

    updateCrosshairSize() {
        if (!this.crosshairElement) return;
        
        // Update crosshair element size
        this.crosshairElement.element.width = this.currentSize;
        this.crosshairElement.element.height = this.currentSize;
        
        // Update individual line positions and sizes
        this.updateCrosshairLinePositions();
    }

    updateCrosshairLinePositions() {
        const scale = this.currentSize / this.baseSize;
        const scaledGap = this.gap * scale;
        const lineLength = (this.currentSize / 4) * scale;
        
        if (this.crosshairParts.top) {
            this.crosshairParts.top.setLocalPosition(0, scaledGap + lineLength / 2, 0);
            this.crosshairParts.top.element.height = lineLength;
        }
        
        if (this.crosshairParts.bottom) {
            this.crosshairParts.bottom.setLocalPosition(0, -(scaledGap + lineLength / 2), 0);
            this.crosshairParts.bottom.element.height = lineLength;
        }
        
        if (this.crosshairParts.left) {
            this.crosshairParts.left.setLocalPosition(-(scaledGap + lineLength / 2), 0, 0);
            this.crosshairParts.left.element.width = lineLength;
        }
        
        if (this.crosshairParts.right) {
            this.crosshairParts.right.setLocalPosition(scaledGap + lineLength / 2, 0, 0);
            this.crosshairParts.right.element.width = lineLength;
        }
    }

    updateCrosshairAnimation(dt) {
        if (!this.userSettings.enableAnimation) return;
        
        // Breathing animation
        if (this.breathingAnimation) {
            this.updateBreathingAnimation(dt);
        }
        
        // Pulse animation
        if (this.pulseEnabled) {
            this.updatePulseAnimation(dt);
        }
        
        // Hit feedback animation
        if (this.currentHitFeedback > 0) {
            this.updateHitFeedbackAnimation(dt);
        }
    }

    updateBreathingAnimation(dt) {
        const breathingPhase = Date.now() * 0.001 * this.pulseSpeed;
        const breathingOffset = Math.sin(breathingPhase) * 0.05;
        
        const breathingScale = 1 + breathingOffset;
        this.crosshairElement.setLocalScale(breathingScale, breathingScale, 1);
    }

    updatePulseAnimation(dt) {
        const pulsePhase = Date.now() * 0.001 * this.pulseSpeed;
        const pulseOffset = Math.sin(pulsePhase) * this.pulseIntensity;
        
        const opacity = this.userSettings.opacity + pulseOffset;
        this.setOpacity(pc.math.clamp(opacity, 0.1, 1.0));
    }

    updateHitFeedbackAnimation(dt) {
        this.currentHitFeedback -= dt / this.hitFeedbackDuration;
        this.currentHitFeedback = Math.max(0, this.currentHitFeedback);
        
        if (this.currentHitFeedback > 0) {
            const scale = 1 + this.currentHitFeedback * this.hitFeedbackIntensity;
            this.hitIndicatorElement.setLocalScale(scale, scale, 1);
            this.hitIndicatorElement.element.opacity = this.currentHitFeedback * 0.8;
        } else {
            this.hitIndicatorElement.element.opacity = 0;
        }
    }

    // Hit Feedback
    showHitIndicator(hitType = 'normal') {
        if (!this.showHitIndicators) return;
        
        this.currentHitFeedback = 1.0;
        this.lastHitTime = Date.now();
        
        // Update hit streak
        if (Date.now() - this.lastHitTime < this.hitStreakTimeout) {
            this.hitStreakCount++;
        } else {
            this.hitStreakCount = 1;
        }
        
        // Change hit indicator based on hit type
        switch (hitType) {
            case 'headshot':
                this.setHitIndicatorColor(new pc.Color(1, 0, 0, 1)); // Red
                break;
            case 'critical':
                this.setHitIndicatorColor(new pc.Color(1, 0.5, 0, 1)); // Orange
                break;
            case 'normal':
            default:
                this.setHitIndicatorColor(new pc.Color(1, 1, 1, 1)); // White
                break;
        }
        
        // Play hit sound
        this.playHitSound(hitType);
    }

    setHitIndicatorColor(color) {
        if (this.hitIndicatorElement?.element) {
            this.hitIndicatorElement.element.color = color;
        }
    }

    playHitSound(hitType) {
        // In a real implementation, this would play appropriate hit sounds
        const soundName = hitType === 'headshot' ? 'hit_headshot' : 'hit_normal';
        // this.audioManager?.playSound(soundName);
    }

    showDamageNumber(damage, position, isCritical = false) {
        if (!this.showDamageNumbers) return;
        
        // Limit damage numbers
        if (this.damageNumbers.length >= this.maxDamageNumbers) {
            const oldestDamageNumber = this.damageNumbers.shift();
            oldestDamageNumber.element.destroy();
        }
        
        const damageNumber = this.createDamageNumber(damage, position, isCritical);
        this.damageNumbers.push(damageNumber);
        
        // Animate damage number
        this.animateDamageNumber(damageNumber);
        
        // Schedule cleanup
        setTimeout(() => {
            this.removeDamageNumber(damageNumber);
        }, this.damageNumberLifetime);
    }

    createDamageNumber(damage, worldPosition, isCritical) {
        const damageEntity = new pc.Entity('DamageNumber');
        
        // Convert world position to screen position
        const camera = this.app.root.findByTag('camera')[0];
        const screenPos = this.worldToScreen(worldPosition, camera);
        
        damageEntity.addComponent('element', {
            type: 'text',
            text: Math.floor(damage).toString(),
            fontSize: isCritical ? 24 : 18,
            color: isCritical ? new pc.Color(1, 0, 0, 1) : new pc.Color(1, 1, 1, 1),
            anchor: [0.5, 0.5, 0.5, 0.5],
            pivot: [0.5, 0.5]
        });
        
        damageEntity.setLocalPosition(screenPos.x, screenPos.y, 0);
        
        // Add to screen
        const screen = this.app.root.findByName('Screen');
        if (screen) {
            screen.addChild(damageEntity);
        }
        
        return {
            element: damageEntity,
            startTime: Date.now(),
            isCritical: isCritical,
            startPosition: screenPos.clone()
        };
    }

    animateDamageNumber(damageNumber) {
        const duration = this.damageNumberLifetime;
        const startTime = damageNumber.startTime;
        const startPos = damageNumber.startPosition;
        
        const animateStep = () => {
            const elapsed = Date.now() - startTime;
            const progress = elapsed / duration;
            
            if (progress >= 1.0 || !damageNumber.element.parent) {
                return;
            }
            
            // Move upward
            const offset = progress * 50; // 50 pixels upward
            const newY = startPos.y + offset;
            
            // Fade out
            const alpha = 1.0 - progress;
            
            damageNumber.element.setLocalPosition(startPos.x, newY, 0);
            damageNumber.element.element.opacity = alpha;
            
            // Continue animation
            requestAnimationFrame(animateStep);
        };
        
        animateStep();
    }

    removeDamageNumber(damageNumber) {
        const index = this.damageNumbers.indexOf(damageNumber);
        if (index !== -1) {
            this.damageNumbers.splice(index, 1);
            if (damageNumber.element.parent) {
                damageNumber.element.destroy();
            }
        }
    }

    worldToScreen(worldPosition, camera) {
        // Convert 3D world position to 2D screen coordinates
        if (!camera) return new pc.Vec2();
        
        const screenPos = camera.camera.worldToScreen(worldPosition);
        return new pc.Vec2(screenPos.x, screenPos.y);
    }

    // Crosshair Customization
    setColor(color) {
        this.color = color;
        
        Object.values(this.crosshairParts).forEach(part => {
            if (part?.element) {
                part.element.color = color;
            }
        });
    }

    setOpacity(opacity) {
        if (this.crosshairContainer?.element) {
            this.crosshairContainer.element.opacity = opacity;
        }
    }

    setSize(size) {
        this.baseSize = size;
        this.currentSize = size;
        this.targetSize = size;
        this.updateCrosshairSize();
    }

    setStyle(styleName) {
        const style = this.crosshairStyles[styleName];
        if (style) {
            this.userSettings.style = styleName;
            this.applyCrosshairStyle(style);
            this.saveSettings();
        }
    }

    setVisibility(visible) {
        this.isVisible = visible;
        if (this.crosshairContainer) {
            this.crosshairContainer.enabled = visible;
        }
    }

    updateCrosshairGeometry() {
        // Recreate crosshair geometry with current settings
        if (this.crosshairElement) {
            // Remove existing parts
            Object.values(this.crosshairParts).forEach(part => {
                if (part?.parent) {
                    part.destroy();
                }
            });
            
            // Recreate with new settings
            this.createCrosshairGeometry();
        }
    }

    // Settings Management
    saveSettings() {
        if (this.settingsManager) {
            this.settingsManager.setSetting('crosshair', this.userSettings);
        }
    }

    resetToDefaults() {
        this.userSettings = {
            style: 'classic',
            color: '#FFFFFF',
            size: 1.0,
            opacity: 1.0,
            thickness: 2,
            gap: 4,
            showSpread: true,
            showHitMarkers: true,
            enableAnimation: true
        };
        
        this.applyCrosshairSettings();
        this.saveSettings();
    }

    // Event Handlers
    onWeaponChanged(data) {
        if (data.entity === this.entity) {
            const weapon = data.newWeapon;
            if (weapon) {
                this.currentCrosshair = weapon.type;
                this.applyCrosshairSettings();
            }
        }
    }

    onWeaponFire(data) {
        if (data.entity === this.entity) {
            // Add firing animation/feedback
            this.pulseEnabled = true;
            setTimeout(() => {
                this.pulseEnabled = false;
            }, 200);
        }
    }

    onWeaponHit(data) {
        if (data.shooter === this.entity) {
            const hitType = data.isHeadshot ? 'headshot' : 
                          data.isCritical ? 'critical' : 'normal';
            this.showHitIndicator(hitType);
            
            if (data.damage) {
                this.showDamageNumber(data.damage, data.hitPosition, data.isCritical);
            }
        }
    }

    onWeaponMiss(data) {
        if (data.shooter === this.entity) {
            // Reset hit streak on miss
            this.hitStreakCount = 0;
        }
    }

    onAimStart(data) {
        if (data.entity === this.entity) {
            // Crosshair changes when aiming
            this.breathingAnimation = false;
        }
    }

    onAimEnd(data) {
        if (data.entity === this.entity) {
            // Return to normal breathing animation
            this.breathingAnimation = true;
        }
    }

    onMovementChanged(data) {
        if (data.entity === this.entity) {
            // Movement affects crosshair spread
            // Handled in updateCrosshairSpread
        }
    }

    onStanceChanged(data) {
        if (data.entity === this.entity) {
            // Stance affects crosshair accuracy
            const stanceMultipliers = {
                standing: 1.0,
                crouching: 0.7,
                prone: 0.5
            };
            
            this.spreadMultiplier = stanceMultipliers[data.stance] || 1.0;
        }
    }

    onSettingsChanged(data) {
        if (data.category === 'crosshair') {
            this.loadUserSettings();
            this.applyCrosshairSettings();
        }
    }

    onRoundStart() {
        // Reset hit streak and feedback
        this.hitStreakCount = 0;
        this.currentHitFeedback = 0;
        
        // Clear damage numbers
        this.damageNumbers.forEach(damageNumber => {
            if (damageNumber.element.parent) {
                damageNumber.element.destroy();
            }
        });
        this.damageNumbers = [];
    }

    onDamageDealt(data) {
        if (data.attacker === this.entity) {
            this.showDamageNumber(data.damage, data.position, data.isCritical);
        }
    }

    // Public API
    getCrosshairSettings() {
        return { ...this.userSettings };
    }

    setCrosshairSetting(setting, value) {
        if (this.userSettings.hasOwnProperty(setting)) {
            this.userSettings[setting] = value;
            this.applyCrosshairSettings();
            this.saveSettings();
        }
    }

    getAvailableStyles() {
        return Object.keys(this.crosshairStyles);
    }

    getCurrentStyle() {
        return this.userSettings.style;
    }

    getHitStreak() {
        return this.hitStreakCount;
    }

    update(dt) {
        if (!this.isVisible) return;
        
        this.updateCrosshairSpread(dt);
        this.updateCrosshairAnimation(dt);
    }
}

pc.registerScript(CrosshairSystem, 'CrosshairSystem');
