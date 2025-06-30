/**
 * AICombat.js
 * AI Combat system for weapon usage, tactical positioning, cover system integration, and combat coordination
 * Handles weapon selection, firing decisions, suppression mechanics, and grenade usage
 */

class AICombat extends pc.ScriptType {
    static get scriptName() { return 'AICombat'; }

    initialize() {
        this.aiController = this.entity.script.aiController;
        this.perception = this.entity.script.aiPerception;
        this.pathfinding = this.entity.script.aiPathfinding;
        this.weaponManager = this.entity.script.weaponManager;
        this.gameManager = this.app.root.findByName('Game_Manager').script.gameManager;
        this.audioManager = this.app.root.findByName('Game_Manager').script.audioManager;
        
        // Combat State
        this.isInCombat = false;
        this.currentTarget = null;
        this.lastTargetPosition = new pc.Vec3();
        this.targetLostTime = 0;
        this.combatStartTime = 0;
        
        // Weapon Management
        this.preferredWeapon = null;
        this.lastShotTime = 0;
        this.burstCount = 0;
        this.maxBurstSize = 3;
        this.burstCooldown = 0.5;
        
        // Tactical Data
        this.coverPosition = null;
        this.lastCoverTime = 0;
        this.suppressionLevel = 0;
        this.flanking = false;
        this.advancing = false;
        
        // Accuracy and Skill
        this.baseAccuracy = 0.7;
        this.currentAccuracy = 0.7;
        this.accuracyModifiers = new Map();
        this.reactionTime = 0.3;
        this.aimTime = 0.8;
        
        // Grenade Usage
        this.lastGrenadeTime = 0;
        this.grenadeThrowCooldown = 15;
        this.grenadeThrowRange = 30;
        
        // Combat Metrics
        this.combatMetrics = {
            shotsFired: 0,
            shotsHit: 0,
            kills: 0,
            damageDealt: 0,
            timeInCombat: 0
        };
        
        this.initializeCombat();
        this.setupEventListeners();
    }

    initializeCombat() {
        this.loadCombatSettings();
        this.setupAccuracyModifiers();
        this.setupWeaponPreferences();
    }

    loadCombatSettings() {
        // Load difficulty-based combat settings
        const difficulty = this.aiController?.difficultyLevel || 'medium';
        const settings = this.getCombatSettings(difficulty);
        
        this.baseAccuracy = settings.accuracy;
        this.reactionTime = settings.reactionTime;
        this.aimTime = settings.aimTime;
        this.maxBurstSize = settings.burstSize;
    }

    getCombatSettings(difficulty) {
        const settings = {
            easy: {
                accuracy: 0.4,
                reactionTime: 0.8,
                aimTime: 1.5,
                burstSize: 2
            },
            medium: {
                accuracy: 0.7,
                reactionTime: 0.3,
                aimTime: 0.8,
                burstSize: 3
            },
            hard: {
                accuracy: 0.85,
                reactionTime: 0.15,
                aimTime: 0.4,
                burstSize: 4
            },
            expert: {
                accuracy: 0.95,
                reactionTime: 0.1,
                aimTime: 0.2,
                burstSize: 5
            }
        };
        
        return settings[difficulty] || settings.medium;
    }

    setupAccuracyModifiers() {
        this.accuracyModifiers.set('distance', 1.0);
        this.accuracyModifiers.set('movement', 1.0);
        this.accuracyModifiers.set('suppression', 1.0);
        this.accuracyModifiers.set('health', 1.0);
        this.accuracyModifiers.set('weapon', 1.0);
        this.accuracyModifiers.set('stance', 1.0);
    }

    setupWeaponPreferences() {
        // AI weapon preferences based on engagement range
        this.weaponPreferences = {
            close: ['shotgun', 'smg', 'pistol'],
            medium: ['assault_rifle', 'carbine'],
            long: ['sniper_rifle', 'dmr', 'assault_rifle']
        };
    }

    setupEventListeners() {
        // Combat events
        this.app.on('weapon:hit', this.onWeaponHit.bind(this));
        this.app.on('weapon:miss', this.onWeaponMiss.bind(this));
        this.app.on('ai:suppressed', this.onSuppressed.bind(this));
        this.app.on('damage:taken', this.onDamageTaken.bind(this));
        
        // Tactical events
        this.app.on('cover:available', this.onCoverAvailable.bind(this));
        this.app.on('ally:needs_support', this.onAllyNeedsSupport.bind(this));
    }

    // Combat Engagement
    engageCombat(target) {
        this.isInCombat = true;
        this.currentTarget = target;
        this.combatStartTime = Date.now();
        this.lastTargetPosition = target.getPosition().clone();
        
        // Select appropriate weapon
        this.selectWeaponForTarget(target);
        
        // Begin tracking target
        this.startTargetTracking();
        
        this.app.fire('ai:combat_engaged', {
            entity: this.entity,
            target: target
        });
    }

    disengageCombat() {
        this.isInCombat = false;
        this.currentTarget = null;
        this.targetLostTime = 0;
        this.burstCount = 0;
        
        // Update combat metrics
        this.combatMetrics.timeInCombat += Date.now() - this.combatStartTime;
        
        this.app.fire('ai:combat_disengaged', {
            entity: this.entity
        });
    }

    updateCombat(visibleEnemies) {
        if (!this.isInCombat) return;
        
        // Select best target from visible enemies
        this.selectBestTarget(visibleEnemies);
        
        if (this.currentTarget) {
            this.updateTargetTracking();
            this.updateAccuracy();
            this.makeFireDecision();
            this.updateTacticalPosition();
        } else {
            this.handleLostTarget();
        }
    }

    selectBestTarget(enemies) {
        if (enemies.length === 0) {
            this.currentTarget = null;
            return;
        }
        
        let bestTarget = null;
        let bestScore = -1;
        
        enemies.forEach(enemy => {
            const score = this.calculateTargetScore(enemy);
            if (score > bestScore) {
                bestScore = score;
                bestTarget = enemy;
            }
        });
        
        if (bestTarget && bestTarget !== this.currentTarget) {
            this.currentTarget = bestTarget;
            this.selectWeaponForTarget(bestTarget);
        }
    }

    calculateTargetScore(enemy) {
        const position = this.entity.getPosition();
        const enemyPosition = enemy.getPosition();
        const distance = position.distance(enemyPosition);
        
        let score = 100;
        
        // Prioritize closer enemies
        score -= distance * 0.5;
        
        // Prioritize enemies with lower health
        const enemyHealth = enemy.script.healthSystem?.currentHealth || 100;
        score += (100 - enemyHealth) * 0.3;
        
        // Prioritize enemies that can see us
        const canSeeUs = this.perception?.canEnemySeeUs(enemy) || false;
        if (canSeeUs) score += 20;
        
        // Prioritize enemies pointing at us
        const isAimingAtUs = this.isEnemyAimingAtUs(enemy);
        if (isAimingAtUs) score += 30;
        
        return score;
    }

    selectWeaponForTarget(target) {
        if (!this.weaponManager) return;
        
        const distance = this.entity.getPosition().distance(target.getPosition());
        let rangeCategory = 'medium';
        
        if (distance < 15) rangeCategory = 'close';
        else if (distance > 50) rangeCategory = 'long';
        
        const preferredWeapons = this.weaponPreferences[rangeCategory];
        const availableWeapons = this.weaponManager.getAvailableWeapons();
        
        // Find best available weapon for this range
        for (const weaponType of preferredWeapons) {
            const weapon = availableWeapons.find(w => w.type === weaponType);
            if (weapon) {
                this.weaponManager.switchToWeapon(weapon);
                break;
            }
        }
    }

    // Firing Logic
    makeFireDecision() {
        if (!this.currentTarget || !this.weaponManager?.getCurrentWeapon()) return;
        
        const currentTime = Date.now();
        const timeSinceLastShot = currentTime - this.lastShotTime;
        
        // Check if we can fire
        if (!this.canFire()) return;
        
        // Check if target is in range and line of sight
        if (!this.hasLineOfSight() || !this.isTargetInRange()) return;
        
        // Check burst fire logic
        if (this.shouldStartBurst()) {
            this.startBurstFire();
        } else if (this.isInBurst() && this.shouldContinueBurst()) {
            this.continueBurstFire();
        }
    }

    canFire() {
        const weapon = this.weaponManager?.getCurrentWeapon();
        if (!weapon) return false;
        
        // Check ammunition
        if (weapon.currentAmmo <= 0) {
            this.weaponManager.reload();
            return false;
        }
        
        // Check if weapon is ready
        return weapon.readyToFire;
    }

    shouldStartBurst() {
        const currentTime = Date.now();
        const timeSinceLastShot = currentTime - this.lastShotTime;
        
        return this.burstCount === 0 && 
               timeSinceLastShot > this.burstCooldown * 1000 &&
               this.hasGoodShot();
    }

    shouldContinueBurst() {
        return this.burstCount < this.maxBurstSize && this.hasGoodShot();
    }

    hasGoodShot() {
        if (!this.currentTarget) return false;
        
        const accuracy = this.calculateCurrentAccuracy();
        const shotChance = Math.random();
        
        return shotChance < accuracy;
    }

    startBurstFire() {
        this.burstCount = 1;
        this.fireWeapon();
    }

    continueBurstFire() {
        this.burstCount++;
        this.fireWeapon();
    }

    isInBurst() {
        return this.burstCount > 0 && this.burstCount < this.maxBurstSize;
    }

    fireWeapon() {
        if (!this.weaponManager?.getCurrentWeapon()) return;
        
        const aimPosition = this.calculateAimPosition();
        this.weaponManager.fire(aimPosition);
        
        this.lastShotTime = Date.now();
        this.combatMetrics.shotsFired++;
        
        // Reset burst if we've completed it
        if (this.burstCount >= this.maxBurstSize) {
            this.burstCount = 0;
        }
    }

    calculateAimPosition() {
        if (!this.currentTarget) return new pc.Vec3();
        
        const targetPosition = this.currentTarget.getPosition();
        const targetVelocity = this.getTargetVelocity();
        const projectileSpeed = this.getProjectileSpeed();
        const distance = this.entity.getPosition().distance(targetPosition);
        const travelTime = distance / projectileSpeed;
        
        // Lead the target
        const leadPosition = targetPosition.clone().add(targetVelocity.clone().scale(travelTime));
        
        // Add accuracy spread
        const spread = this.calculateAccuracySpread();
        leadPosition.add(spread);
        
        return leadPosition;
    }

    calculateAccuracySpread() {
        const accuracy = this.calculateCurrentAccuracy();
        const maxSpread = 2.0; // Maximum spread in world units
        const spread = maxSpread * (1 - accuracy);
        
        return new pc.Vec3(
            (Math.random() - 0.5) * spread,
            (Math.random() - 0.5) * spread * 0.5, // Less vertical spread
            (Math.random() - 0.5) * spread
        );
    }

    // Accuracy Calculation
    calculateCurrentAccuracy() {
        let accuracy = this.baseAccuracy;
        
        // Apply all modifiers
        for (const [, modifier] of this.accuracyModifiers) {
            accuracy *= modifier;
        }
        
        // Clamp between 0 and 1
        return Math.max(0, Math.min(1, accuracy));
    }

    updateAccuracy() {
        this.updateDistanceModifier();
        this.updateMovementModifier();
        this.updateSuppressionModifier();
        this.updateHealthModifier();
        this.updateWeaponModifier();
        this.updateStanceModifier();
        
        this.currentAccuracy = this.calculateCurrentAccuracy();
    }

    updateDistanceModifier() {
        if (!this.currentTarget) return;
        
        const distance = this.entity.getPosition().distance(this.currentTarget.getPosition());
        const weapon = this.weaponManager?.getCurrentWeapon();
        const effectiveRange = weapon?.effectiveRange || 50;
        
        let modifier = 1.0;
        if (distance > effectiveRange) {
            modifier = Math.max(0.3, effectiveRange / distance);
        }
        
        this.accuracyModifiers.set('distance', modifier);
    }

    updateMovementModifier() {
        const velocity = this.entity.rigidbody?.linearVelocity || new pc.Vec3();
        const speed = velocity.length();
        
        let modifier = 1.0;
        if (speed > 0.5) {
            modifier = Math.max(0.4, 1.0 - (speed * 0.1));
        }
        
        this.accuracyModifiers.set('movement', modifier);
    }

    updateSuppressionModifier() {
        const modifier = Math.max(0.2, 1.0 - (this.suppressionLevel * 0.8));
        this.accuracyModifiers.set('suppression', modifier);
    }

    updateHealthModifier() {
        const health = this.entity.script.healthSystem?.currentHealth || 100;
        const modifier = Math.max(0.5, health / 100);
        this.accuracyModifiers.set('health', modifier);
    }

    updateWeaponModifier() {
        const weapon = this.weaponManager?.getCurrentWeapon();
        const modifier = weapon?.accuracy || 1.0;
        this.accuracyModifiers.set('weapon', modifier);
    }

    updateStanceModifier() {
        // Check if in cover or prone
        const inCover = this.isInCover();
        const modifier = inCover ? 1.2 : 1.0;
        this.accuracyModifiers.set('stance', modifier);
    }

    // Tactical Positioning
    updateTacticalPosition() {
        this.evaluateCoverNeed();
        this.evaluateFlankingOpportunity();
        this.evaluateAdvancingOpportunity();
    }

    evaluateCoverNeed() {
        const health = this.entity.script.healthSystem?.currentHealth || 100;
        const underFire = this.isUnderFire();
        const inCover = this.isInCover();
        
        if ((health < 50 || underFire || this.suppressionLevel > 0.5) && !inCover) {
            this.seekCover();
        }
    }

    evaluateFlankingOpportunity() {
        if (this.flanking || !this.currentTarget) return;
        
        const squadMates = this.getSquadMates();
        const targetEngaged = squadMates.some(mate => 
            mate.script.aiCombat?.currentTarget === this.currentTarget
        );
        
        if (targetEngaged && Math.random() < 0.3) {
            this.attemptFlankingManeuver();
        }
    }

    evaluateAdvancingOpportunity() {
        if (this.advancing || !this.currentTarget) return;
        
        const distance = this.entity.getPosition().distance(this.currentTarget.getPosition());
        const weapon = this.weaponManager?.getCurrentWeapon();
        const optimalRange = weapon?.optimalRange || 30;
        
        if (distance > optimalRange * 1.5 && this.isPathClear()) {
            this.attemptAdvance();
        }
    }

    seekCover() {
        const coverPoint = this.findNearestCover();
        if (coverPoint && this.pathfinding) {
            this.pathfinding.setDestination(coverPoint);
            this.coverPosition = coverPoint;
            this.lastCoverTime = Date.now();
        }
    }

    attemptFlankingManeuver() {
        if (!this.currentTarget || !this.pathfinding) return;
        
        const flankPosition = this.calculateFlankPosition();
        if (flankPosition) {
            this.pathfinding.setDestination(flankPosition);
            this.flanking = true;
            
            setTimeout(() => {
                this.flanking = false;
            }, 10000); // 10 second flanking timeout
        }
    }

    attemptAdvance() {
        if (!this.currentTarget || !this.pathfinding) return;
        
        const advancePosition = this.calculateAdvancePosition();
        if (advancePosition) {
            this.pathfinding.setDestination(advancePosition);
            this.advancing = true;
            
            setTimeout(() => {
                this.advancing = false;
            }, 8000); // 8 second advance timeout
        }
    }

    // Grenade Usage
    evaluateGrenadeUsage() {
        const currentTime = Date.now();
        if (currentTime - this.lastGrenadeTime < this.grenadeThrowCooldown * 1000) return;
        
        if (!this.currentTarget) return;
        
        const distance = this.entity.getPosition().distance(this.currentTarget.getPosition());
        if (distance > this.grenadeThrowRange) return;
        
        const targetInCover = this.isTargetInCover();
        const multipleEnemies = this.perception?.getVisibleEnemies().length > 1;
        
        if ((targetInCover || multipleEnemies) && Math.random() < 0.3) {
            this.throwGrenade();
        }
    }

    throwGrenade() {
        if (!this.currentTarget) return;
        
        const grenadeManager = this.entity.script.grenadeController;
        if (grenadeManager && grenadeManager.hasGrenades()) {
            const throwPosition = this.calculateGrenadeThrowPosition();
            grenadeManager.throwGrenade(throwPosition);
            this.lastGrenadeTime = Date.now();
        }
    }

    calculateGrenadeThrowPosition() {
        const targetPosition = this.currentTarget.getPosition();
        const targetVelocity = this.getTargetVelocity();
        const grenadeDelay = 3.0; // Typical grenade fuse time
        
        // Predict where target will be
        return targetPosition.clone().add(targetVelocity.clone().scale(grenadeDelay));
    }

    // Utility Methods
    hasLineOfSight() {
        if (!this.currentTarget) return false;
        
        const start = this.entity.getPosition();
        start.y += 1.7; // Eye height
        const end = this.currentTarget.getPosition();
        end.y += 1.7;
        
        const result = this.app.systems.rigidbody.raycastFirst(start, end);
        return !result || result.entity === this.currentTarget;
    }

    isTargetInRange() {
        if (!this.currentTarget) return false;
        
        const distance = this.entity.getPosition().distance(this.currentTarget.getPosition());
        const weapon = this.weaponManager?.getCurrentWeapon();
        const maxRange = weapon?.maxRange || 100;
        
        return distance <= maxRange;
    }

    isInCover() {
        const coverPoints = this.app.root.findByTag('cover');
        const position = this.entity.getPosition();
        
        return coverPoints.some(cover => {
            return position.distance(cover.getPosition()) < 2;
        });
    }

    isUnderFire() {
        // Check if recently took damage from weapons
        const healthSystem = this.entity.script.healthSystem;
        return healthSystem?.isUnderFire() || false;
    }

    isTargetInCover() {
        if (!this.currentTarget) return false;
        
        const coverPoints = this.app.root.findByTag('cover');
        const targetPosition = this.currentTarget.getPosition();
        
        return coverPoints.some(cover => {
            return targetPosition.distance(cover.getPosition()) < 3;
        });
    }

    getTargetVelocity() {
        if (!this.currentTarget?.rigidbody) return new pc.Vec3();
        return this.currentTarget.rigidbody.linearVelocity || new pc.Vec3();
    }

    getProjectileSpeed() {
        const weapon = this.weaponManager?.getCurrentWeapon();
        return weapon?.projectileSpeed || 400; // Default bullet speed
    }

    findNearestCover() {
        const coverPoints = this.app.root.findByTag('cover');
        const position = this.entity.getPosition();
        
        let nearestCover = null;
        let nearestDistance = Infinity;
        
        coverPoints.forEach(cover => {
            const distance = position.distance(cover.getPosition());
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestCover = cover.getPosition();
            }
        });
        
        return nearestCover;
    }

    calculateFlankPosition() {
        if (!this.currentTarget) return null;
        
        const targetPos = this.currentTarget.getPosition();
        const myPos = this.entity.getPosition();
        const toTarget = targetPos.clone().sub(myPos).normalize();
        
        // Calculate perpendicular direction for flanking
        const flankDirection = new pc.Vec3(-toTarget.z, 0, toTarget.x);
        const flankDistance = 20;
        
        return targetPos.clone().add(flankDirection.scale(flankDistance));
    }

    calculateAdvancePosition() {
        if (!this.currentTarget) return null;
        
        const targetPos = this.currentTarget.getPosition();
        const myPos = this.entity.getPosition();
        const toTarget = targetPos.clone().sub(myPos).normalize();
        
        // Move closer but maintain some distance
        const advanceDistance = myPos.distance(targetPos) * 0.3;
        return myPos.clone().add(toTarget.scale(advanceDistance));
    }

    getSquadMates() {
        // Get AI entities in the same squad
        const squad = this.aiController?.squad;
        if (!squad) return [];
        
        return squad.filter(entity => entity !== this.entity && entity.script.aiController);
    }

    isPathClear() {
        // Simple path checking - could be enhanced with proper pathfinding
        if (!this.currentTarget) return false;
        
        const start = this.entity.getPosition();
        const end = this.currentTarget.getPosition();
        const result = this.app.systems.rigidbody.raycastFirst(start, end);
        
        return !result || result.entity === this.currentTarget;
    }

    isEnemyAimingAtUs(enemy) {
        // Check if enemy is pointing weapon in our direction
        const enemyForward = enemy.forward;
        const toUs = this.entity.getPosition().sub(enemy.getPosition()).normalize();
        const dot = enemyForward.dot(toUs);
        
        return dot > 0.8; // Roughly within 36 degrees
    }

    startTargetTracking() {
        this.lastTargetPosition = this.currentTarget?.getPosition().clone() || new pc.Vec3();
    }

    updateTargetTracking() {
        if (this.currentTarget) {
            this.lastTargetPosition = this.currentTarget.getPosition().clone();
            this.targetLostTime = 0;
        }
    }

    handleLostTarget() {
        this.targetLostTime += 1/60; // Assuming 60 FPS
        
        if (this.targetLostTime > 3) {
            // Lost target for too long, disengage
            this.disengageCombat();
        }
    }

    // Event Handlers
    onWeaponHit(data) {
        if (data.shooter === this.entity) {
            this.combatMetrics.shotsHit++;
            this.combatMetrics.damageDealt += data.damage;
            
            if (data.target.script.healthSystem?.currentHealth <= 0) {
                this.combatMetrics.kills++;
            }
        }
    }

    onWeaponMiss(data) {
        if (data.shooter === this.entity) {
            // Adjust firing pattern on miss
            this.burstCooldown = Math.min(1.0, this.burstCooldown * 1.1);
        }
    }

    onSuppressed(data) {
        if (data.target === this.entity) {
            this.suppressionLevel = Math.min(1.0, this.suppressionLevel + data.amount);
            
            // Suppression decays over time
            setTimeout(() => {
                this.suppressionLevel = Math.max(0, this.suppressionLevel - data.amount);
            }, 5000);
        }
    }

    onDamageTaken(data) {
        if (data.target === this.entity) {
            // React to taking damage
            if (!this.isInCombat && data.attacker) {
                this.engageCombat(data.attacker);
            }
        }
    }

    onCoverAvailable(coverData) {
        if (this.isInCombat && !this.isInCover()) {
            this.seekCover();
        }
    }

    onAllyNeedsSupport(data) {
        if (this.isInCombat && data.ally.squad === this.aiController?.squad) {
            // Consider providing suppressive fire
            if (Math.random() < 0.4) {
                this.currentTarget = data.threat;
            }
        }
    }

    // Public API
    getCurrentTarget() {
        return this.currentTarget;
    }

    getCombatMetrics() {
        return { ...this.combatMetrics };
    }

    getCurrentAccuracy() {
        return this.currentAccuracy;
    }

    isSuppressed() {
        return this.suppressionLevel > 0.3;
    }

    update(dt) {
        if (this.isInCombat) {
            this.evaluateGrenadeUsage();
        }
        
        // Decay suppression over time
        if (this.suppressionLevel > 0) {
            this.suppressionLevel = Math.max(0, this.suppressionLevel - dt * 0.2);
        }
    }
}

pc.registerScript(AICombat, 'AICombat');
