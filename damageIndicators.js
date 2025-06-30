/**
 * DamageIndicators.js
 * Visual system for showing damage taken and dealt to players
 */

class DamageIndicators extends pc.ScriptType {
    static get scriptName() { return 'DamageIndicators'; }

    initialize() {
        this.camera = this.app.root.findByName('Player').findByName('Head').camera;
        this.healthSystem = this.entity.script.healthSystem;
        
        // Damage indicator pools
        this.damageTextPool = [];
        this.directionIndicatorPool = [];
        this.bloodEffectPool = [];
        
        // Settings
        this.maxTextIndicators = 20;
        this.maxDirectionIndicators = 8;
        this.maxBloodEffects = 15;
        
        // Damage text settings
        this.damageTextDuration = 2.0;
        this.damageTextRiseDistance = 100;
        this.damageTextFadeDelay = 0.5;
        
        // Direction indicator settings
        this.directionIndicatorDuration = 2.0;
        this.directionIndicatorDistance = 200;
        
        // Blood effect settings
        this.bloodEffectDuration = 1.5;
        this.bloodEffectIntensity = 1.0;
        
        // Color schemes
        this.damageColors = {
            normal: '#ff6666',
            critical: '#ff0000',
            headshot: '#ffff00',
            friendly: '#66ccff',
            self: '#ffffff'
        };
        
        this.createIndicatorPools();
        this.setupEventListeners();
        this.createBloodOverlay();
    }

    createIndicatorPools() {
        // Create damage text pool
        for (let i = 0; i < this.maxTextIndicators; i++) {
            const textIndicator = this.createDamageTextElement();
            this.damageTextPool.push(textIndicator);
        }
        
        // Create direction indicator pool
        for (let i = 0; i < this.maxDirectionIndicators; i++) {
            const directionIndicator = this.createDirectionIndicatorElement();
            this.directionIndicatorPool.push(directionIndicator);
        }
        
        // Create blood effect pool
        for (let i = 0; i < this.maxBloodEffects; i++) {
            const bloodEffect = this.createBloodEffectElement();
            this.bloodEffectPool.push(bloodEffect);
        }
    }

    createDamageTextElement() {
        const element = document.createElement('div');
        element.className = 'damage-text';
        element.style.cssText = `
            position: fixed;
            font-family: 'Arial Black', Arial, sans-serif;
            font-weight: bold;
            font-size: 24px;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
            pointer-events: none;
            z-index: 1000;
            display: none;
            white-space: nowrap;
        `;
        
        document.body.appendChild(element);
        return {
            element: element,
            active: false,
            startTime: 0,
            initialPosition: { x: 0, y: 0 },
            targetPosition: { x: 0, y: 0 },
            damage: 0,
            type: 'normal'
        };
    }

    createDirectionIndicatorElement() {
        const element = document.createElement('div');
        element.className = 'direction-indicator';
        element.style.cssText = `
            position: fixed;
            width: 60px;
            height: 60px;
            background: radial-gradient(circle, rgba(255, 0, 0, 0.8) 0%, rgba(255, 0, 0, 0) 70%);
            border: 2px solid rgba(255, 0, 0, 0.6);
            border-radius: 50%;
            pointer-events: none;
            z-index: 999;
            display: none;
            transform-origin: center;
        `;
        
        // Add directional arrow
        const arrow = document.createElement('div');
        arrow.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            width: 0;
            height: 0;
            border-left: 8px solid transparent;
            border-right: 8px solid transparent;
            border-bottom: 16px solid rgba(255, 0, 0, 0.8);
            transform: translate(-50%, -50%) rotate(-90deg);
        `;
        
        element.appendChild(arrow);
        document.body.appendChild(element);
        
        return {
            element: element,
            arrow: arrow,
            active: false,
            startTime: 0,
            angle: 0,
            distance: this.directionIndicatorDistance
        };
    }

    createBloodEffectElement() {
        const element = document.createElement('div');
        element.className = 'blood-effect';
        element.style.cssText = `
            position: fixed;
            width: 100px;
            height: 100px;
            background: radial-gradient(circle, rgba(200, 0, 0, 0.6) 0%, rgba(200, 0, 0, 0) 70%);
            border-radius: 50%;
            pointer-events: none;
            z-index: 998;
            display: none;
            filter: blur(2px);
        `;
        
        document.body.appendChild(element);
        
        return {
            element: element,
            active: false,
            startTime: 0,
            position: { x: 0, y: 0 },
            velocity: { x: 0, y: 0 },
            scale: 1.0
        };
    }

    createBloodOverlay() {
        this.bloodOverlay = document.createElement('div');
        this.bloodOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(circle at center, transparent 40%, rgba(200, 0, 0, 0) 60%, rgba(200, 0, 0, 0.3) 100%);
            pointer-events: none;
            z-index: 997;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        
        document.body.appendChild(this.bloodOverlay);
    }

    setupEventListeners() {
        this.app.on('damage:taken', this.onDamageTaken, this);
        this.app.on('damage:dealt', this.onDamageDealt, this);
        this.app.on('player:healed', this.onPlayerHealed, this);
        this.app.on('player:killed', this.onPlayerKilled, this);
    }

    onDamageTaken(data) {
        const { damage, damageType, attackerPosition, bodyPart, isCritical, isHeadshot } = data;
        
        // Show damage text
        this.showDamageText(damage, damageType, isCritical, isHeadshot, true);
        
        // Show directional damage indicator if attacker position is known
        if (attackerPosition) {
            this.showDirectionIndicator(attackerPosition);
        }
        
        // Show blood effects
        this.showBloodEffects(damage, bodyPart);
        
        // Update blood overlay based on health
        this.updateBloodOverlay();
        
        // Screen flash effect
        this.showDamageFlash(damage);
    }

    onDamageDealt(data) {
        const { damage, targetPosition, damageType, isCritical, isHeadshot, isKill } = data;
        
        // Show floating damage text at target position
        if (targetPosition) {
            this.showDamageText(damage, damageType, isCritical, isHeadshot, false, targetPosition);
        }
        
        // Show special effects for critical hits
        if (isCritical || isHeadshot) {
            this.showCriticalHitEffect(targetPosition, isHeadshot);
        }
        
        // Show kill confirmation
        if (isKill) {
            this.showKillConfirmation();
        }
    }

    onPlayerHealed(data) {
        const { amount, healType } = data;
        
        // Show healing text
        this.showHealingText(amount, healType);
        
        // Update blood overlay
        this.updateBloodOverlay();
    }

    onPlayerKilled(data) {
        // Show death screen effect
        this.showDeathEffect();
    }

    showDamageText(damage, damageType, isCritical, isHeadshot, isTaken, worldPosition = null) {
        const textIndicator = this.getAvailableTextIndicator();
        if (!textIndicator) return;
        
        // Determine damage type and color
        let type = 'normal';
        if (isHeadshot) type = 'headshot';
        else if (isCritical) type = 'critical';
        else if (damageType === 'friendly') type = 'friendly';
        else if (damageType === 'self') type = 'self';
        
        textIndicator.damage = damage;
        textIndicator.type = type;
        textIndicator.active = true;
        textIndicator.startTime = Date.now();
        
        // Set position
        let screenPos;
        if (worldPosition && this.camera) {
            screenPos = this.worldToScreen(worldPosition);
        } else {
            // Random position around screen center for damage taken
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            const offsetX = (Math.random() - 0.5) * 200;
            const offsetY = (Math.random() - 0.5) * 200;
            screenPos = { x: centerX + offsetX, y: centerY + offsetY };
        }
        
        textIndicator.initialPosition = { ...screenPos };
        textIndicator.targetPosition = {
            x: screenPos.x + (Math.random() - 0.5) * 100,
            y: screenPos.y - this.damageTextRiseDistance
        };
        
        // Style the text
        const element = textIndicator.element;
        element.textContent = isTaken ? `-${damage}` : `${damage}`;
        element.style.color = this.damageColors[type];
        element.style.left = screenPos.x + 'px';
        element.style.top = screenPos.y + 'px';
        element.style.transform = 'translate(-50%, -50%)';
        element.style.opacity = '1';
        element.style.display = 'block';
        
        // Special styling for critical hits
        if (isCritical || isHeadshot) {
            element.style.fontSize = '32px';
            element.style.textShadow = '0 0 10px ' + this.damageColors[type];
        } else {
            element.style.fontSize = '24px';
            element.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.8)';
        }
    }

    showDirectionIndicator(attackerPosition) {
        const indicator = this.getAvailableDirectionIndicator();
        if (!indicator) return;
        
        const playerPosition = this.entity.getPosition();
        const direction = attackerPosition.clone().sub(playerPosition).normalize();
        
        // Calculate angle for positioning indicator
        const angle = Math.atan2(direction.x, direction.z) * (180 / Math.PI);
        
        indicator.active = true;
        indicator.startTime = Date.now();
        indicator.angle = angle;
        
        // Position indicator on screen edge
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const radians = angle * (Math.PI / 180);
        
        const x = centerX + Math.sin(radians) * indicator.distance;
        const y = centerY - Math.cos(radians) * indicator.distance;
        
        const element = indicator.element;
        element.style.left = x + 'px';
        element.style.top = y + 'px';
        element.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
        element.style.display = 'block';
        element.style.opacity = '1';
    }

    showBloodEffects(damage, bodyPart) {
        const effectCount = Math.min(Math.floor(damage / 20) + 1, 5);
        
        for (let i = 0; i < effectCount; i++) {
            const bloodEffect = this.getAvailableBloodEffect();
            if (!bloodEffect) break;
            
            bloodEffect.active = true;
            bloodEffect.startTime = Date.now();
            
            // Random position on screen
            bloodEffect.position = {
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight
            };
            
            // Random movement
            bloodEffect.velocity = {
                x: (Math.random() - 0.5) * 100,
                y: (Math.random() - 0.5) * 100
            };
            
            bloodEffect.scale = 0.5 + Math.random() * 0.5;
            
            const element = bloodEffect.element;
            element.style.left = bloodEffect.position.x + 'px';
            element.style.top = bloodEffect.position.y + 'px';
            element.style.transform = `translate(-50%, -50%) scale(${bloodEffect.scale})`;
            element.style.display = 'block';
            element.style.opacity = '0.8';
        }
    }

    showHealingText(amount, healType) {
        const textIndicator = this.getAvailableTextIndicator();
        if (!textIndicator) return;
        
        textIndicator.damage = amount;
        textIndicator.type = 'healing';
        textIndicator.active = true;
        textIndicator.startTime = Date.now();
        
        // Center position
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const offsetX = (Math.random() - 0.5) * 100;
        const offsetY = (Math.random() - 0.5) * 100;
        
        textIndicator.initialPosition = { x: centerX + offsetX, y: centerY + offsetY };
        textIndicator.targetPosition = {
            x: centerX + offsetX,
            y: centerY + offsetY - 80
        };
        
        const element = textIndicator.element;
        element.textContent = `+${amount}`;
        element.style.color = '#00ff00';
        element.style.fontSize = '20px';
        element.style.textShadow = '0 0 8px #00ff00';
        element.style.left = textIndicator.initialPosition.x + 'px';
        element.style.top = textIndicator.initialPosition.y + 'px';
        element.style.transform = 'translate(-50%, -50%)';
        element.style.opacity = '1';
        element.style.display = 'block';
    }

    showCriticalHitEffect(targetPosition, isHeadshot) {
        // Create screen flash for critical hits
        const flash = document.createElement('div');
        flash.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: ${isHeadshot ? 'rgba(255, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.2)'};
            pointer-events: none;
            z-index: 1001;
        `;
        
        document.body.appendChild(flash);
        
        setTimeout(() => {
            flash.remove();
        }, 100);
    }

    showKillConfirmation() {
        // Show kill confirmation text
        const confirmation = document.createElement('div');
        confirmation.style.cssText = `
            position: fixed;
            top: 20%;
            left: 50%;
            transform: translateX(-50%);
            font-family: 'Arial Black', Arial, sans-serif;
            font-size: 32px;
            font-weight: bold;
            color: #ff0000;
            text-shadow: 0 0 15px #ff0000;
            pointer-events: none;
            z-index: 1002;
            opacity: 1;
            transition: opacity 0.5s ease;
        `;
        confirmation.textContent = 'ELIMINATED';
        
        document.body.appendChild(confirmation);
        
        setTimeout(() => {
            confirmation.style.opacity = '0';
            setTimeout(() => confirmation.remove(), 500);
        }, 1000);
    }

    showDamageFlash(damage) {
        const intensity = Math.min(damage / 100, 1.0);
        const flash = document.createElement('div');
        flash.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(255, 0, 0, ${intensity * 0.3});
            pointer-events: none;
            z-index: 996;
        `;
        
        document.body.appendChild(flash);
        
        setTimeout(() => {
            flash.remove();
        }, 150);
    }

    showDeathEffect() {
        // Red screen fade for death
        const deathOverlay = document.createElement('div');
        deathOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(circle, rgba(0, 0, 0, 0.8) 0%, rgba(200, 0, 0, 0.6) 100%);
            pointer-events: none;
            z-index: 1003;
            opacity: 0;
            transition: opacity 1s ease;
        `;
        
        document.body.appendChild(deathOverlay);
        
        setTimeout(() => {
            deathOverlay.style.opacity = '1';
        }, 100);
    }

    updateBloodOverlay() {
        if (!this.healthSystem) return;
        
        const healthPercent = this.healthSystem.currentHealth / this.healthSystem.maxHealth;
        const damagePercent = 1 - healthPercent;
        
        // Show more blood overlay as health decreases
        this.bloodOverlay.style.opacity = Math.max(0, damagePercent * 0.5);
    }

    worldToScreen(worldPosition) {
        if (!this.camera) {
            return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        }
        
        const screenPosition = new pc.Vec3();
        this.camera.worldToScreen(worldPosition, screenPosition);
        
        return {
            x: screenPosition.x,
            y: screenPosition.y
        };
    }

    getAvailableTextIndicator() {
        return this.damageTextPool.find(indicator => !indicator.active) || null;
    }

    getAvailableDirectionIndicator() {
        return this.directionIndicatorPool.find(indicator => !indicator.active) || null;
    }

    getAvailableBloodEffect() {
        return this.bloodEffectPool.find(effect => !effect.active) || null;
    }

    update(dt) {
        const currentTime = Date.now();
        
        // Update damage text indicators
        this.damageTextPool.forEach(indicator => {
            if (!indicator.active) return;
            
            const elapsed = (currentTime - indicator.startTime) / 1000;
            const progress = elapsed / this.damageTextDuration;
            
            if (progress >= 1) {
                indicator.active = false;
                indicator.element.style.display = 'none';
                return;
            }
            
            // Animate position
            const easedProgress = this.easeOutQuad(progress);
            const x = pc.math.lerp(indicator.initialPosition.x, indicator.targetPosition.x, easedProgress);
            const y = pc.math.lerp(indicator.initialPosition.y, indicator.targetPosition.y, easedProgress);
            
            indicator.element.style.left = x + 'px';
            indicator.element.style.top = y + 'px';
            
            // Fade out
            const fadeProgress = Math.max(0, 1 - (elapsed - this.damageTextFadeDelay) / (this.damageTextDuration - this.damageTextFadeDelay));
            indicator.element.style.opacity = fadeProgress;
        });
        
        // Update direction indicators
        this.directionIndicatorPool.forEach(indicator => {
            if (!indicator.active) return;
            
            const elapsed = (currentTime - indicator.startTime) / 1000;
            const progress = elapsed / this.directionIndicatorDuration;
            
            if (progress >= 1) {
                indicator.active = false;
                indicator.element.style.display = 'none';
                return;
            }
            
            // Fade out
            indicator.element.style.opacity = 1 - progress;
        });
        
        // Update blood effects
        this.bloodEffectPool.forEach(effect => {
            if (!effect.active) return;
            
            const elapsed = (currentTime - effect.startTime) / 1000;
            const progress = elapsed / this.bloodEffectDuration;
            
            if (progress >= 1) {
                effect.active = false;
                effect.element.style.display = 'none';
                return;
            }
            
            // Update position
            effect.position.x += effect.velocity.x * dt;
            effect.position.y += effect.velocity.y * dt;
            
            effect.element.style.left = effect.position.x + 'px';
            effect.element.style.top = effect.position.y + 'px';
            
            // Fade out
            effect.element.style.opacity = (1 - progress) * 0.8;
            
            // Scale down
            const scale = effect.scale * (1 - progress * 0.5);
            effect.element.style.transform = `translate(-50%, -50%) scale(${scale})`;
        });
    }

    easeOutQuad(t) {
        return t * (2 - t);
    }

    destroy() {
        // Clean up event listeners
        this.app.off('damage:taken', this.onDamageTaken, this);
        this.app.off('damage:dealt', this.onDamageDealt, this);
        this.app.off('player:healed', this.onPlayerHealed, this);
        this.app.off('player:killed', this.onPlayerKilled, this);
        
        // Remove all UI elements
        this.damageTextPool.forEach(indicator => {
            if (indicator.element.parentNode) {
                indicator.element.parentNode.removeChild(indicator.element);
            }
        });
        
        this.directionIndicatorPool.forEach(indicator => {
            if (indicator.element.parentNode) {
                indicator.element.parentNode.removeChild(indicator.element);
            }
        });
        
        this.bloodEffectPool.forEach(effect => {
            if (effect.element.parentNode) {
                effect.element.parentNode.removeChild(effect.element);
            }
        });
        
        if (this.bloodOverlay && this.bloodOverlay.parentNode) {
            this.bloodOverlay.parentNode.removeChild(this.bloodOverlay);
        }
    }
}

pc.registerScript(DamageIndicators, 'DamageIndicators');
