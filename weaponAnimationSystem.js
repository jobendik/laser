/**
 * WeaponAnimationSystem.js
 * Comprehensive weapon animation management system
 * Handles weapon-specific animations, reload sequences, draw/holster, inspection, and attachment updates
 */

class WeaponAnimationSystem extends pc.ScriptType {
    static get scriptName() { return 'WeaponAnimationSystem'; }

    initialize() {
        this.weaponManager = this.entity.script.weaponManager;
        this.audioManager = this.app.root.findByName('Game_Manager').script.audioManager;
        this.networkManager = this.app.root.findByName('Game_Manager').script.networkManager;
        
        // Animation state
        this.currentAnimation = null;
        this.animationQueue = [];
        this.isAnimating = false;
        this.animationBlending = true;
        this.blendTime = 0.2;
        
        // Animation templates
        this.animationTemplates = new Map();
        this.weaponAnimationSets = new Map();
        
        // Timing data
        this.animationTimings = new Map();
        this.lastAnimationTime = 0;
        this.animationSpeed = 1.0;
        
        // IK and procedural animation
        this.ikEnabled = true;
        this.ikTargets = new Map();
        this.proceduralAnimations = [];
        
        // Event handlers
        this.animationEvents = new pc.EventHandler();
        
        this.initializeAnimationSystem();
        this.setupEventListeners();
    }

    initializeAnimationSystem() {
        this.setupAnimationTemplates();
        this.loadWeaponAnimationSets();
        this.initializeIKSystem();
    }

    setupAnimationTemplates() {
        // Define standard animation templates for different weapon types
        this.animationTemplates.set('assault_rifle', {
            idle: {
                duration: 3.0,
                loop: true,
                blendIn: 0.2,
                blendOut: 0.2
            },
            fire: {
                duration: 0.1,
                loop: false,
                blendIn: 0.05,
                blendOut: 0.05,
                priority: 10
            },
            reload: {
                duration: 2.5,
                loop: false,
                blendIn: 0.3,
                blendOut: 0.3,
                priority: 8,
                keyframes: {
                    magazineOut: 0.8,
                    magazineIn: 1.8,
                    boltPull: 2.2
                }
            },
            draw: {
                duration: 0.8,
                loop: false,
                blendIn: 0.1,
                blendOut: 0.2,
                priority: 5
            },
            holster: {
                duration: 0.6,
                loop: false,
                blendIn: 0.1,
                blendOut: 0.1,
                priority: 5
            },
            inspect: {
                duration: 3.5,
                loop: false,
                blendIn: 0.5,
                blendOut: 0.5,
                priority: 3
            },
            aim: {
                duration: 0.5,
                loop: true,
                blendIn: 0.2,
                blendOut: 0.2,
                priority: 7
            },
            run: {
                duration: 1.0,
                loop: true,
                blendIn: 0.3,
                blendOut: 0.3,
                priority: 4
            }
        });

        // Pistol animations
        this.animationTemplates.set('pistol', {
            idle: { duration: 2.5, loop: true, blendIn: 0.2, blendOut: 0.2 },
            fire: { duration: 0.08, loop: false, blendIn: 0.03, blendOut: 0.03, priority: 10 },
            reload: {
                duration: 1.8,
                loop: false,
                blendIn: 0.2,
                blendOut: 0.2,
                priority: 8,
                keyframes: {
                    magazineOut: 0.5,
                    magazineIn: 1.2,
                    slideRelease: 1.5
                }
            },
            draw: { duration: 0.5, loop: false, blendIn: 0.1, blendOut: 0.2, priority: 5 },
            holster: { duration: 0.4, loop: false, blendIn: 0.1, blendOut: 0.1, priority: 5 },
            inspect: { duration: 2.5, loop: false, blendIn: 0.3, blendOut: 0.3, priority: 3 },
            aim: { duration: 0.3, loop: true, blendIn: 0.15, blendOut: 0.15, priority: 7 }
        });

        // Sniper rifle animations
        this.animationTemplates.set('sniper_rifle', {
            idle: { duration: 4.0, loop: true, blendIn: 0.3, blendOut: 0.3 },
            fire: { duration: 0.15, loop: false, blendIn: 0.05, blendOut: 0.1, priority: 10 },
            reload: {
                duration: 3.5,
                loop: false,
                blendIn: 0.4,
                blendOut: 0.4,
                priority: 8,
                keyframes: {
                    boltOpen: 0.8,
                    magazineOut: 1.5,
                    magazineIn: 2.5,
                    boltClose: 3.0
                }
            },
            draw: { duration: 1.2, loop: false, blendIn: 0.2, blendOut: 0.3, priority: 5 },
            holster: { duration: 1.0, loop: false, blendIn: 0.2, blendOut: 0.2, priority: 5 },
            inspect: { duration: 4.0, loop: false, blendIn: 0.6, blendOut: 0.6, priority: 3 },
            aim: { duration: 0.8, loop: true, blendIn: 0.4, blendOut: 0.4, priority: 7 },
            boltAction: { duration: 0.6, loop: false, blendIn: 0.1, blendOut: 0.1, priority: 9 }
        });

        // Melee animations
        this.animationTemplates.set('melee', {
            idle: { duration: 2.0, loop: true, blendIn: 0.2, blendOut: 0.2 },
            attack1: { duration: 0.6, loop: false, blendIn: 0.1, blendOut: 0.2, priority: 10 },
            attack2: { duration: 0.8, loop: false, blendIn: 0.1, blendOut: 0.2, priority: 10 },
            block: { duration: 0.3, loop: true, blendIn: 0.1, blendOut: 0.1, priority: 8 },
            draw: { duration: 0.4, loop: false, blendIn: 0.1, blendOut: 0.1, priority: 5 },
            holster: { duration: 0.3, loop: false, blendIn: 0.1, blendOut: 0.1, priority: 5 },
            inspect: { duration: 2.0, loop: false, blendIn: 0.3, blendOut: 0.3, priority: 3 }
        });
    }

    loadWeaponAnimationSets() {
        // This would typically load from assets, but for now we'll define programmatically
        this.weaponAnimationSets.set('AK47', {
            type: 'assault_rifle',
            animations: {
                idle: 'ak47_idle',
                fire: 'ak47_fire',
                reload: 'ak47_reload',
                reload_empty: 'ak47_reload_empty',
                draw: 'ak47_draw',
                holster: 'ak47_holster',
                inspect: 'ak47_inspect',
                aim: 'ak47_aim',
                run: 'ak47_run'
            },
            customTimings: {
                reload: 2.3,
                reload_empty: 2.8
            }
        });

        this.weaponAnimationSets.set('M4A1', {
            type: 'assault_rifle',
            animations: {
                idle: 'm4a1_idle',
                fire: 'm4a1_fire',
                reload: 'm4a1_reload',
                reload_empty: 'm4a1_reload_empty',
                draw: 'm4a1_draw',
                holster: 'm4a1_holster',
                inspect: 'm4a1_inspect',
                aim: 'm4a1_aim',
                run: 'm4a1_run'
            }
        });

        this.weaponAnimationSets.set('Glock17', {
            type: 'pistol',
            animations: {
                idle: 'glock_idle',
                fire: 'glock_fire',
                reload: 'glock_reload',
                reload_empty: 'glock_reload_empty',
                draw: 'glock_draw',
                holster: 'glock_holster',
                inspect: 'glock_inspect',
                aim: 'glock_aim'
            }
        });
    }

    initializeIKSystem() {
        // Initialize Inverse Kinematics for procedural weapon handling
        this.ikTargets.set('leftHand', {
            target: null,
            weight: 1.0,
            enabled: true
        });
        
        this.ikTargets.set('rightHand', {
            target: null,
            weight: 1.0,
            enabled: true
        });
    }

    setupEventListeners() {
        // Weapon system events
        this.app.on('weapon:fire', this.playFireAnimation.bind(this));
        this.app.on('weapon:reload', this.playReloadAnimation.bind(this));
        this.app.on('weapon:switch', this.onWeaponSwitch.bind(this));
        this.app.on('weapon:aim', this.playAimAnimation.bind(this));
        this.app.on('weapon:inspect', this.playInspectAnimation.bind(this));
        
        // Movement events
        this.app.on('player:running', this.playRunAnimation.bind(this));
        this.app.on('player:walking', this.playIdleAnimation.bind(this));
        this.app.on('player:crouching', this.onCrouchStateChange.bind(this));
        
        // Animation completion events
        this.animationEvents.on('animation:complete', this.onAnimationComplete.bind(this));
        this.animationEvents.on('animation:keyframe', this.onAnimationKeyframe.bind(this));
    }

    // Core Animation Methods
    playAnimation(animationName, options = {}) {
        const currentWeapon = this.weaponManager?.getCurrentWeapon();
        if (!currentWeapon) return false;

        const weaponAnimSet = this.weaponAnimationSets.get(currentWeapon.name);
        if (!weaponAnimSet) return false;

        const weaponType = weaponAnimSet.type;
        const template = this.animationTemplates.get(weaponType);
        if (!template || !template[animationName]) return false;

        const animationData = {
            name: animationName,
            weaponName: currentWeapon.name,
            template: template[animationName],
            assetName: weaponAnimSet.animations[animationName],
            options: options,
            startTime: Date.now()
        };

        // Check priority system
        if (this.currentAnimation && 
            this.currentAnimation.template.priority > template[animationName].priority) {
            this.queueAnimation(animationData);
            return true;
        }

        this.executeAnimation(animationData);
        return true;
    }

    executeAnimation(animationData) {
        // Stop current animation if exists
        if (this.currentAnimation) {
            this.stopCurrentAnimation();
        }

        this.currentAnimation = animationData;
        this.isAnimating = true;

        // Get the actual animation component
        const animComponent = this.getAnimationComponent();
        if (!animComponent) return false;

        // Configure animation
        const template = animationData.template;
        animComponent.play(animationData.assetName, template.blendIn || 0.2);
        
        if (template.loop) {
            animComponent.loop = true;
        }

        // Set animation speed
        const speed = animationData.options.speed || this.animationSpeed;
        animComponent.speed = speed;

        // Schedule animation end
        if (!template.loop) {
            const duration = (template.duration || 1.0) / speed;
            setTimeout(() => {
                this.onAnimationComplete(animationData);
            }, duration * 1000);
        }

        // Setup keyframe triggers
        this.setupKeyframeTriggers(animationData);

        // Network synchronization
        if (this.networkManager) {
            this.networkManager.sendAnimationState({
                animation: animationData.name,
                weapon: animationData.weaponName,
                timestamp: animationData.startTime
            });
        }

        return true;
    }

    stopCurrentAnimation() {
        if (!this.currentAnimation) return;

        const animComponent = this.getAnimationComponent();
        if (animComponent) {
            const blendOut = this.currentAnimation.template.blendOut || 0.2;
            animComponent.stop(blendOut);
        }

        this.currentAnimation = null;
        this.isAnimating = false;
    }

    queueAnimation(animationData) {
        // Add to queue if not already queued
        const existing = this.animationQueue.find(anim => 
            anim.name === animationData.name && 
            anim.weaponName === animationData.weaponName
        );

        if (!existing) {
            this.animationQueue.push(animationData);
        }
    }

    processAnimationQueue() {
        if (this.animationQueue.length === 0 || this.isAnimating) return;

        // Sort by priority
        this.animationQueue.sort((a, b) => b.template.priority - a.template.priority);
        
        const nextAnimation = this.animationQueue.shift();
        this.executeAnimation(nextAnimation);
    }

    // Specific Animation Methods
    playFireAnimation() {
        const options = {
            speed: this.calculateFireAnimationSpeed()
        };
        this.playAnimation('fire', options);
    }

    playReloadAnimation(isEmpty = false) {
        const animName = isEmpty ? 'reload_empty' : 'reload';
        this.playAnimation(animName);
    }

    playAimAnimation(isAiming) {
        if (isAiming) {
            this.playAnimation('aim');
        } else {
            this.playIdleAnimation();
        }
    }

    playInspectAnimation() {
        this.playAnimation('inspect');
    }

    playIdleAnimation() {
        this.playAnimation('idle');
    }

    playRunAnimation() {
        this.playAnimation('run');
    }

    onWeaponSwitch(newWeapon, slot) {
        // Play holster animation for current weapon
        if (this.currentAnimation) {
            this.playAnimation('holster');
        }

        // Queue draw animation for new weapon
        setTimeout(() => {
            this.playAnimation('draw');
        }, 200); // Small delay for weapon switch
    }

    // Keyframe and Event Handling
    setupKeyframeTriggers(animationData) {
        const template = animationData.template;
        
        if (template.keyframes) {
            Object.entries(template.keyframes).forEach(([keyframeName, time]) => {
                const delay = time * 1000 / this.animationSpeed;
                
                setTimeout(() => {
                    this.onAnimationKeyframe(animationData, keyframeName);
                }, delay);
            });
        }
    }

    onAnimationKeyframe(animationData, keyframeName) {
        // Handle specific keyframe events
        switch (keyframeName) {
            case 'magazineOut':
                this.audioManager?.playSound('magazine_out', this.entity.getPosition());
                this.app.fire('animation:magazineOut');
                break;
                
            case 'magazineIn':
                this.audioManager?.playSound('magazine_in', this.entity.getPosition());
                this.app.fire('animation:magazineIn');
                break;
                
            case 'boltPull':
                this.audioManager?.playSound('bolt_pull', this.entity.getPosition());
                this.app.fire('animation:boltPull');
                break;
                
            case 'slideRelease':
                this.audioManager?.playSound('slide_release', this.entity.getPosition());
                this.app.fire('animation:slideRelease');
                break;
        }

        this.animationEvents.fire('animation:keyframe', {
            animation: animationData,
            keyframe: keyframeName
        });
    }

    onAnimationComplete(animationData) {
        if (this.currentAnimation === animationData) {
            this.currentAnimation = null;
            this.isAnimating = false;
        }

        this.animationEvents.fire('animation:complete', animationData);

        // Process queued animations
        setTimeout(() => {
            this.processAnimationQueue();
        }, 50);

        // Return to idle if no queued animations
        if (this.animationQueue.length === 0) {
            setTimeout(() => {
                if (!this.isAnimating) {
                    this.playIdleAnimation();
                }
            }, 100);
        }
    }

    // Procedural Animation and IK
    updateIK() {
        if (!this.ikEnabled) return;

        const currentWeapon = this.weaponManager?.getCurrentWeapon();
        if (!currentWeapon || !currentWeapon.entity) return;

        // Update hand IK targets based on weapon configuration
        this.updateHandIK(currentWeapon);
    }

    updateHandIK(weapon) {
        // Get weapon-specific IK targets
        const leftHandTarget = weapon.entity.findByName('LeftHandIK');
        const rightHandTarget = weapon.entity.findByName('RightHandIK');

        if (leftHandTarget) {
            this.ikTargets.get('leftHand').target = leftHandTarget;
        }

        if (rightHandTarget) {
            this.ikTargets.get('rightHand').target = rightHandTarget;
        }

        // Apply IK constraints
        this.applyIKConstraints();
    }

    applyIKConstraints() {
        // Apply inverse kinematics for realistic hand positioning
        this.ikTargets.forEach((ikData, targetName) => {
            if (ikData.enabled && ikData.target && ikData.weight > 0) {
                this.applyIKTarget(targetName, ikData);
            }
        });
    }

    applyIKTarget(targetName, ikData) {
        // Simplified IK application - in production this would be more complex
        const handBone = this.getHandBone(targetName);
        if (!handBone || !ikData.target) return;

        const targetPosition = ikData.target.getPosition();
        const targetRotation = ikData.target.getRotation();

        // Blend towards target position
        const currentPos = handBone.getPosition();
        const currentRot = handBone.getRotation();

        const blendedPos = new pc.Vec3().lerp(currentPos, targetPosition, ikData.weight);
        const blendedRot = new pc.Quat().slerp(currentRot, targetRotation, ikData.weight);

        handBone.setPosition(blendedPos);
        handBone.setRotation(blendedRot);
    }

    // Attachment Visual Updates
    updateAttachmentVisuals(weaponSlot, attachments) {
        const weapon = this.weaponManager?.getWeaponInSlot(weaponSlot);
        if (!weapon || !weapon.entity) return;

        // Update attachment visibility
        this.hideAllAttachments(weapon.entity);
        
        attachments.forEach(attachment => {
            this.showAttachment(weapon.entity, attachment);
        });

        // Update animation sets if needed
        this.updateAnimationSetForAttachments(weapon, attachments);
    }

    hideAllAttachments(weaponEntity) {
        // Hide all attachment points
        const attachmentPoints = ['Scope', 'Barrel', 'Grip', 'Stock', 'Magazine'];
        
        attachmentPoints.forEach(pointName => {
            const attachmentPoint = weaponEntity.findByName(pointName);
            if (attachmentPoint) {
                attachmentPoint.children.forEach(child => {
                    child.enabled = false;
                });
            }
        });
    }

    showAttachment(weaponEntity, attachment) {
        const attachmentPoint = weaponEntity.findByName(attachment.attachmentPoint);
        if (!attachmentPoint) return;

        // Find the specific attachment model
        const attachmentModel = attachmentPoint.findByName(attachment.model);
        if (attachmentModel) {
            attachmentModel.enabled = true;
        }
    }

    updateAnimationSetForAttachments(weapon, attachments) {
        // Some attachments may modify animation timing
        const stockAttachment = attachments.find(att => att.type === 'stock');
        const gripAttachment = attachments.find(att => att.type === 'grip');

        if (stockAttachment || gripAttachment) {
            // Modify reload timing based on attachments
            const baseReloadTime = this.getBaseReloadTime(weapon);
            let modifier = 1.0;

            if (stockAttachment && stockAttachment.effects.reloadSpeed) {
                modifier *= (1.0 + stockAttachment.effects.reloadSpeed);
            }

            if (gripAttachment && gripAttachment.effects.reloadSpeed) {
                modifier *= (1.0 + gripAttachment.effects.reloadSpeed);
            }

            this.updateAnimationSpeed('reload', modifier);
        }
    }

    // Utility Methods
    getAnimationComponent() {
        // Get the animation component from weapon or player entity
        const currentWeapon = this.weaponManager?.getCurrentWeapon();
        
        if (currentWeapon && currentWeapon.entity) {
            return currentWeapon.entity.anim;
        }
        
        return this.entity.anim;
    }

    getHandBone(handName) {
        // Return the hand bone for IK
        const animComponent = this.entity.anim;
        if (!animComponent) return null;

        const boneName = handName === 'leftHand' ? 'LeftHand' : 'RightHand';
        return animComponent.findBone(boneName);
    }

    calculateFireAnimationSpeed() {
        const currentWeapon = this.weaponManager?.getCurrentWeapon();
        if (!currentWeapon) return 1.0;

        // Base fire rate affects animation speed
        const fireRate = currentWeapon.stats?.fireRate || 600; // RPM
        const baseFireRate = 600; // Base RPM for 1.0x speed
        
        return fireRate / baseFireRate;
    }

    getBaseReloadTime(weapon) {
        const weaponAnimSet = this.weaponAnimationSets.get(weapon.name);
        if (!weaponAnimSet) return 2.5;

        return weaponAnimSet.customTimings?.reload || 
               this.animationTemplates.get(weaponAnimSet.type)?.reload?.duration || 2.5;
    }

    updateAnimationSpeed(animationName, speedModifier) {
        if (this.currentAnimation && this.currentAnimation.name === animationName) {
            const animComponent = this.getAnimationComponent();
            if (animComponent) {
                animComponent.speed = speedModifier;
            }
        }
    }

    onCrouchStateChange(isCrouching) {
        // Modify animation based on crouch state
        const speedModifier = isCrouching ? 0.8 : 1.0;
        this.animationSpeed = speedModifier;
    }

    // State queries
    isPlayingAnimation(animationName = null) {
        if (!this.currentAnimation) return false;
        
        if (animationName) {
            return this.currentAnimation.name === animationName;
        }
        
        return this.isAnimating;
    }

    getCurrentAnimation() {
        return this.currentAnimation;
    }

    getAnimationProgress() {
        if (!this.currentAnimation) return 0;
        
        const elapsed = Date.now() - this.currentAnimation.startTime;
        const duration = this.currentAnimation.template.duration * 1000;
        
        return Math.min(elapsed / duration, 1.0);
    }

    // Network synchronization
    getAnimationState() {
        return {
            current: this.currentAnimation ? {
                name: this.currentAnimation.name,
                weaponName: this.currentAnimation.weaponName,
                startTime: this.currentAnimation.startTime,
                progress: this.getAnimationProgress()
            } : null,
            isAnimating: this.isAnimating,
            animationSpeed: this.animationSpeed
        };
    }

    applyNetworkAnimationState(state) {
        if (state.current && (!this.currentAnimation || 
            this.currentAnimation.name !== state.current.name)) {
            
            const timeDiff = Date.now() - state.current.startTime;
            const options = {
                speed: state.animationSpeed || 1.0,
                networkSync: true,
                timeOffset: timeDiff / 1000
            };
            
            this.playAnimation(state.current.name, options);
        }
    }

    update(dt) {
        // Update IK system
        if (this.ikEnabled) {
            this.updateIK();
        }

        // Process procedural animations
        this.updateProceduralAnimations(dt);

        // Check for animation queue processing
        if (!this.isAnimating && this.animationQueue.length > 0) {
            this.processAnimationQueue();
        }
    }

    updateProceduralAnimations(dt) {
        // Update any procedural animations (breathing, weapon sway, etc.)
        this.proceduralAnimations.forEach(procAnim => {
            if (procAnim.enabled) {
                procAnim.update(dt);
            }
        });
    }
}

pc.registerScript(WeaponAnimationSystem, 'WeaponAnimationSystem');
