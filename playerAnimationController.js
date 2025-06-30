/**
 * PlayerAnimationController.js
 * Player animation system for first/third person animation sync, state machine management, IK weapon handling, and gesture system
 * Manages complex animation blending, procedural animations, and networked animation synchronization
 */

class PlayerAnimationController extends pc.ScriptType {
    static get scriptName() { return 'PlayerAnimationController'; }

    initialize() {
        this.playerController = this.entity.script.playerController;
        this.weaponManager = this.entity.script.weaponManager;
        this.healthSystem = this.entity.script.healthSystem;
        this.networkManager = this.app.root.findByName('Game_Manager').script.networkManager;
        this.audioManager = this.app.root.findByName('Game_Manager').script.audioManager;
        
        // Animation State
        this.currentState = 'idle';
        this.previousState = 'idle';
        this.stateTransitionTime = 0;
        this.transitionDuration = 0.2;
        this.animationBlending = true;
        
        // Animation Components
        this.animationComponent = this.entity.anim;
        this.firstPersonRig = null;
        this.thirdPersonRig = null;
        this.weaponRig = null;
        
        // Animation Layers
        this.animationLayers = {
            base: { weight: 1.0, state: null },
            upper: { weight: 0.0, state: null },
            additive: { weight: 0.0, state: null },
            facial: { weight: 1.0, state: null }
        };
        
        // Movement Animations
        this.movementStates = {
            idle: { animation: 'idle', speed: 1.0, loop: true },
            walk: { animation: 'walk', speed: 1.0, loop: true },
            run: { animation: 'run', speed: 1.0, loop: true },
            sprint: { animation: 'sprint', speed: 1.0, loop: true },
            crouch_idle: { animation: 'crouch_idle', speed: 1.0, loop: true },
            crouch_walk: { animation: 'crouch_walk', speed: 1.0, loop: true },
            prone_idle: { animation: 'prone_idle', speed: 1.0, loop: true },
            prone_crawl: { animation: 'prone_crawl', speed: 1.0, loop: true }
        };
        
        // Weapon Animations
        this.weaponAnimations = {
            draw: { duration: 0.5, interruptyable: false },
            holster: { duration: 0.4, interruptyable: false },
            fire: { duration: 0.1, interruptyable: false },
            reload: { duration: 2.0, interruptyable: true },
            aim: { duration: 0.3, interruptyable: true },
            inspect: { duration: 3.0, interruptyable: true }
        };
        
        // IK System
        this.ikEnabled = true;
        this.ikTargets = {
            leftHand: null,
            rightHand: null,
            leftFoot: null,
            rightFoot: null,
            head: null,
            spine: null
        };
        this.ikWeights = {
            leftHand: 0.0,
            rightHand: 0.0,
            leftFoot: 1.0,
            rightFoot: 1.0,
            head: 0.5,
            spine: 0.3
        };
        
        // Gesture System
        this.gestureQueue = [];
        this.currentGesture = null;
        this.gestureBlendWeight = 0.0;
        this.availableGestures = {
            wave: { duration: 2.0, priority: 1 },
            point: { duration: 1.5, priority: 2 },
            thumbsUp: { duration: 1.0, priority: 1 },
            salute: { duration: 2.5, priority: 2 },
            surrender: { duration: 3.0, priority: 3 }
        };
        
        // Procedural Animation
        this.breathingEnabled = true;
        this.breathingIntensity = 1.0;
        this.breathingRate = 1.0;
        this.weaponSwayEnabled = true;
        this.headBobEnabled = true;
        this.footstepSync = true;
        
        // Network Synchronization
        this.networkSync = true;
        this.lastNetworkUpdate = 0;
        this.networkUpdateRate = 10; // updates per second
        this.animationDesync = 0;
        
        // Performance Settings
        this.animationLOD = 'high';
        this.distanceLOD = false;
        this.cullingDistance = 50;
        this.updateFrequency = 60;
        
        this.initializeAnimationSystem();
        this.setupEventListeners();
    }

    initializeAnimationSystem() {
        this.setupAnimationComponent();
        this.loadAnimationSets();
        this.initializeIKSystem();
        this.setupAnimationLayers();
        this.setupProceduralAnimations();
    }

    setupAnimationComponent() {
        if (!this.animationComponent) {
            this.entity.addComponent('anim', {
                activate: true
            });
            this.animationComponent = this.entity.anim;
        }
        
        // Find animation rigs
        this.firstPersonRig = this.entity.findByName('FirstPersonRig');
        this.thirdPersonRig = this.entity.findByName('ThirdPersonRig');
        this.weaponRig = this.entity.findByName('WeaponRig');
        
        // Setup animation state graph
        this.setupAnimationStateGraph();
    }

    setupAnimationStateGraph() {
        if (!this.animationComponent.stateGraph) {
            // Create state graph programmatically
            const stateGraph = {
                layers: [
                    {
                        name: 'baseLayer',
                        states: this.createMovementStates(),
                        transitions: this.createMovementTransitions()
                    },
                    {
                        name: 'upperLayer',
                        states: this.createUpperBodyStates(),
                        transitions: this.createUpperBodyTransitions(),
                        mask: this.createUpperBodyMask()
                    },
                    {
                        name: 'additiveLayer',
                        states: this.createAdditiveStates(),
                        blendType: 'additive'
                    }
                ]
            };
            
            this.animationComponent.stateGraph = stateGraph;
        }
    }

    createMovementStates() {
        const states = {};
        
        Object.keys(this.movementStates).forEach(stateName => {
            const stateData = this.movementStates[stateName];
            states[stateName] = {
                name: stateName,
                clip: stateData.animation,
                speed: stateData.speed,
                loop: stateData.loop
            };
        });
        
        return states;
    }

    createMovementTransitions() {
        return [
            { from: 'idle', to: 'walk', condition: 'speed > 0.1' },
            { from: 'walk', to: 'run', condition: 'speed > 3.0' },
            { from: 'run', to: 'sprint', condition: 'speed > 6.0 && sprinting' },
            { from: 'any', to: 'crouch_idle', condition: 'crouching && speed < 0.1' },
            { from: 'any', to: 'crouch_walk', condition: 'crouching && speed > 0.1' },
            { from: 'any', to: 'prone_idle', condition: 'prone && speed < 0.1' },
            { from: 'any', to: 'prone_crawl', condition: 'prone && speed > 0.1' }
        ];
    }

    createUpperBodyStates() {
        return {
            weapon_idle: { clip: 'weapon_idle', loop: true },
            weapon_aim: { clip: 'weapon_aim', loop: true },
            weapon_fire: { clip: 'weapon_fire', loop: false },
            weapon_reload: { clip: 'weapon_reload', loop: false },
            weapon_draw: { clip: 'weapon_draw', loop: false },
            weapon_holster: { clip: 'weapon_holster', loop: false }
        };
    }

    createUpperBodyTransitions() {
        return [
            { from: 'weapon_idle', to: 'weapon_aim', condition: 'aiming' },
            { from: 'weapon_aim', to: 'weapon_fire', condition: 'firing' },
            { from: 'weapon_idle', to: 'weapon_reload', condition: 'reloading' },
            { from: 'any', to: 'weapon_draw', condition: 'weapon_changed' }
        ];
    }

    createUpperBodyMask() {
        // Define which bones are affected by upper body layer
        return [
            'spine1', 'spine2', 'spine3',
            'neck', 'head',
            'leftShoulder', 'leftArm', 'leftForearm', 'leftHand',
            'rightShoulder', 'rightArm', 'rightForearm', 'rightHand'
        ];
    }

    createAdditiveStates() {
        return {
            breathing: { clip: 'breathing', loop: true },
            weapon_sway: { clip: 'weapon_sway', loop: true },
            head_bob: { clip: 'head_bob', loop: true }
        };
    }

    loadAnimationSets() {
        // Load animation assets based on character type
        const characterType = this.entity.tags?.list[0] || 'soldier';
        this.loadCharacterAnimations(characterType);
        this.loadWeaponAnimations();
        this.loadGestureAnimations();
    }

    loadCharacterAnimations(characterType) {
        // In a real implementation, load from asset registry
        this.characterAnimations = {
            idle: `${characterType}_idle`,
            walk: `${characterType}_walk`,
            run: `${characterType}_run`,
            sprint: `${characterType}_sprint`,
            crouch_idle: `${characterType}_crouch_idle`,
            crouch_walk: `${characterType}_crouch_walk`,
            prone_idle: `${characterType}_prone_idle`,
            prone_crawl: `${characterType}_prone_crawl`,
            death: `${characterType}_death`,
            hit_reaction: `${characterType}_hit_reaction`
        };
    }

    loadWeaponAnimations() {
        // Load weapon-specific animations
        this.weaponAnimationSets = new Map();
        
        // Default weapon animations
        this.weaponAnimationSets.set('rifle', {
            idle: 'rifle_idle',
            draw: 'rifle_draw',
            holster: 'rifle_holster',
            fire: 'rifle_fire',
            reload: 'rifle_reload',
            aim: 'rifle_aim',
            inspect: 'rifle_inspect'
        });
        
        this.weaponAnimationSets.set('pistol', {
            idle: 'pistol_idle',
            draw: 'pistol_draw',
            holster: 'pistol_holster',
            fire: 'pistol_fire',
            reload: 'pistol_reload',
            aim: 'pistol_aim',
            inspect: 'pistol_inspect'
        });
    }

    loadGestureAnimations() {
        this.gestureAnimations = {
            wave: 'gesture_wave',
            point: 'gesture_point',
            thumbsUp: 'gesture_thumbs_up',
            salute: 'gesture_salute',
            surrender: 'gesture_surrender'
        };
    }

    initializeIKSystem() {
        // Setup IK chains for different body parts
        this.ikChains = {
            leftArm: {
                bones: ['leftShoulder', 'leftArm', 'leftForearm', 'leftHand'],
                target: null,
                weight: 0.0
            },
            rightArm: {
                bones: ['rightShoulder', 'rightArm', 'rightForearm', 'rightHand'],
                target: null,
                weight: 0.0
            },
            leftLeg: {
                bones: ['leftThigh', 'leftShin', 'leftFoot'],
                target: null,
                weight: 1.0
            },
            rightLeg: {
                bones: ['rightThigh', 'rightShin', 'rightFoot'],
                target: null,
                weight: 1.0
            }
        };
        
        this.setupWeaponIK();
    }

    setupWeaponIK() {
        // Setup IK targets for weapon handling
        if (this.weaponRig) {
            this.weaponIKTargets = {
                grip: this.weaponRig.findByName('GripTarget'),
                foregrip: this.weaponRig.findByName('ForegripTarget'),
                stock: this.weaponRig.findByName('StockTarget')
            };
        }
    }

    setupAnimationLayers() {
        // Configure animation layer weights and masks
        this.animationComponent.baseLayer.weight = 1.0;
        
        if (this.animationComponent.addLayer) {
            this.upperBodyLayer = this.animationComponent.addLayer('UpperBody');
            this.upperBodyLayer.weight = 1.0;
            this.upperBodyLayer.mask = this.createUpperBodyMask();
            
            this.additiveLayer = this.animationComponent.addLayer('Additive');
            this.additiveLayer.blendType = pc.ANIM_LAYER_ADDITIVE;
            this.additiveLayer.weight = 0.5;
        }
    }

    setupProceduralAnimations() {
        // Initialize procedural animation parameters
        this.proceduralAnimations = {
            breathing: {
                enabled: this.breathingEnabled,
                frequency: 0.5, // breaths per second
                amplitude: 0.02,
                phase: 0
            },
            weaponSway: {
                enabled: this.weaponSwayEnabled,
                swayAmount: 0.01,
                frequency: 0.3,
                damping: 0.95
            },
            headBob: {
                enabled: this.headBobEnabled,
                bobAmount: 0.005,
                frequency: 2.0,
                damping: 0.8
            }
        };
    }

    setupEventListeners() {
        // Player movement events
        this.app.on('player:movement_state_changed', this.onMovementStateChanged.bind(this));
        this.app.on('player:stance_changed', this.onStanceChanged.bind(this));
        this.app.on('player:speed_changed', this.onSpeedChanged.bind(this));
        
        // Weapon events
        this.app.on('weapon:changed', this.onWeaponChanged.bind(this));
        this.app.on('weapon:fire', this.onWeaponFire.bind(this));
        this.app.on('weapon:reload', this.onWeaponReload.bind(this));
        this.app.on('weapon:aim', this.onWeaponAim.bind(this));
        this.app.on('weapon:inspect', this.onWeaponInspect.bind(this));
        
        // Health events
        this.app.on('health:damage_taken', this.onDamageTaken.bind(this));
        this.app.on('health:death', this.onDeath.bind(this));
        this.app.on('health:revive', this.onRevive.bind(this));
        
        // Gesture events
        this.app.on('player:gesture', this.onGestureRequested.bind(this));
        this.app.on('input:gesture', this.onGestureInput.bind(this));
        
        // Network events
        this.app.on('network:animation_sync', this.onAnimationSync.bind(this));
    }

    // Animation State Management
    changeAnimationState(newState, params = {}) {
        if (newState === this.currentState) return;
        
        this.previousState = this.currentState;
        this.currentState = newState;
        this.stateTransitionTime = 0;
        
        // Handle state-specific logic
        this.onStateEnter(newState, params);
        
        // Update animation component
        if (this.animationComponent && this.animationComponent.baseLayer) {
            const transitionTime = params.transitionTime || this.transitionDuration;
            this.animationComponent.baseLayer.transition(newState, transitionTime);
        }
        
        // Network synchronization
        if (this.networkSync) {
            this.syncAnimationState(newState, params);
        }
    }

    onStateEnter(state, params) {
        switch (state) {
            case 'death':
                this.onDeathAnimationStart();
                break;
            case 'hit_reaction':
                this.onHitReactionStart(params);
                break;
            case 'weapon_reload':
                this.onReloadAnimationStart();
                break;
            case 'weapon_inspect':
                this.onInspectAnimationStart();
                break;
        }
    }

    onDeathAnimationStart() {
        // Disable IK and procedural animations
        this.ikEnabled = false;
        this.breathingEnabled = false;
        this.weaponSwayEnabled = false;
        
        // Play death sound
        if (this.audioManager) {
            this.audioManager.play3D('player_death', this.entity.getPosition());
        }
    }

    onHitReactionStart(params) {
        const hitDirection = params.direction || new pc.Vec3(0, 0, 1);
        const hitIntensity = params.intensity || 1.0;
        
        // Calculate hit reaction direction
        this.calculateHitReaction(hitDirection, hitIntensity);
    }

    onReloadAnimationStart() {
        // Update IK targets for reload
        this.updateReloadIK();
    }

    onInspectAnimationStart() {
        // Update IK for weapon inspection
        this.updateInspectIK();
    }

    // Movement Animation Control
    updateMovementAnimation(dt) {
        const velocity = this.playerController?.getVelocity() || new pc.Vec3();
        const speed = velocity.length();
        const stance = this.playerController?.getStance() || 'standing';
        const isGrounded = this.playerController?.isGrounded() || true;
        
        if (!isGrounded) {
            this.updateAirborneAnimation(velocity);
            return;
        }
        
        // Determine movement state
        let targetState = this.determineMovementState(speed, stance);
        
        if (targetState !== this.currentState) {
            this.changeAnimationState(targetState);
        }
        
        // Update animation speed based on movement speed
        this.updateAnimationSpeed(speed, stance);
    }

    determineMovementState(speed, stance) {
        const isMoving = speed > 0.1;
        
        switch (stance) {
            case 'crouching':
                return isMoving ? 'crouch_walk' : 'crouch_idle';
            case 'prone':
                return isMoving ? 'prone_crawl' : 'prone_idle';
            default: // standing
                if (!isMoving) return 'idle';
                if (speed > 6.0 && this.playerController?.isSprinting()) return 'sprint';
                if (speed > 3.0) return 'run';
                return 'walk';
        }
    }

    updateAnimationSpeed(speed, stance) {
        const baseSpeed = this.getBaseSpeedForStance(stance);
        const speedRatio = speed / baseSpeed;
        const clampedRatio = pc.math.clamp(speedRatio, 0.5, 2.0);
        
        if (this.animationComponent.baseLayer) {
            this.animationComponent.baseLayer.activeState.speed = clampedRatio;
        }
    }

    getBaseSpeedForStance(stance) {
        switch (stance) {
            case 'crouching': return 2.0;
            case 'prone': return 1.0;
            default: return 5.0;
        }
    }

    updateAirborneAnimation(velocity) {
        const verticalVelocity = velocity.y;
        
        if (verticalVelocity > 1.0) {
            this.changeAnimationState('jump_up');
        } else if (verticalVelocity < -1.0) {
            this.changeAnimationState('fall');
        } else {
            this.changeAnimationState('jump_float');
        }
    }

    // Weapon Animation Control
    updateWeaponAnimation() {
        const currentWeapon = this.weaponManager?.getCurrentWeapon();
        
        if (!currentWeapon) {
            this.updateUnarmedAnimation();
            return;
        }
        
        this.updateWeaponIK(currentWeapon);
        this.updateWeaponSpecificAnimation(currentWeapon);
    }

    updateWeaponIK(weapon) {
        if (!this.ikEnabled || !weapon) return;
        
        const weaponType = weapon.type;
        const ikTargets = this.weaponIKTargets;
        
        if (!ikTargets) return;
        
        // Update hand IK targets based on weapon
        this.updateHandIK(weapon, weaponType);
        this.updateWeaponStockIK(weapon);
    }

    updateHandIK(weapon, weaponType) {
        const rightHandTarget = this.ikTargets.rightHand;
        const leftHandTarget = this.ikTargets.leftHand;
        
        if (rightHandTarget && this.weaponIKTargets.grip) {
            rightHandTarget.setPosition(this.weaponIKTargets.grip.getPosition());
            rightHandTarget.setRotation(this.weaponIKTargets.grip.getRotation());
            this.ikWeights.rightHand = 1.0;
        }
        
        if (leftHandTarget && this.weaponIKTargets.foregrip) {
            leftHandTarget.setPosition(this.weaponIKTargets.foregrip.getPosition());
            leftHandTarget.setRotation(this.weaponIKTargets.foregrip.getRotation());
            this.ikWeights.leftHand = weaponType === 'pistol' ? 0.0 : 1.0;
        }
    }

    updateWeaponStockIK(weapon) {
        // Update shoulder/stock positioning for rifles
        if (weapon.type === 'rifle' || weapon.type === 'sniper') {
            const shoulderTarget = this.ikTargets.spine;
            
            if (shoulderTarget && this.weaponIKTargets.stock) {
                shoulderTarget.setPosition(this.weaponIKTargets.stock.getPosition());
                this.ikWeights.spine = 0.5;
            }
        }
    }

    updateWeaponSpecificAnimation(weapon) {
        const weaponAnimSet = this.weaponAnimationSets.get(weapon.type);
        
        if (!weaponAnimSet) return;
        
        // Update upper body layer with weapon-specific animations
        if (this.upperBodyLayer) {
            const isAiming = this.playerController?.isAiming() || false;
            const targetAnim = isAiming ? weaponAnimSet.aim : weaponAnimSet.idle;
            
            this.upperBodyLayer.transition(targetAnim, 0.2);
        }
    }

    updateUnarmedAnimation() {
        // Clear weapon IK
        this.ikWeights.rightHand = 0.0;
        this.ikWeights.leftHand = 0.0;
        this.ikWeights.spine = 0.0;
        
        // Transition to unarmed animations
        if (this.upperBodyLayer) {
            this.upperBodyLayer.transition('unarmed_idle', 0.3);
        }
    }

    updateReloadIK() {
        // Special IK setup for reload animations
        const weapon = this.weaponManager?.getCurrentWeapon();
        if (!weapon) return;
        
        // Temporarily adjust IK weights for reload
        this.ikWeights.leftHand = 0.3; // Allow some animation override
        this.ikWeights.rightHand = 0.5;
        
        // Reset after reload duration
        setTimeout(() => {
            this.ikWeights.leftHand = weapon.type === 'pistol' ? 0.0 : 1.0;
            this.ikWeights.rightHand = 1.0;
        }, this.weaponAnimations.reload.duration * 1000);
    }

    updateInspectIK() {
        // Special IK for weapon inspection
        this.ikWeights.leftHand = 0.2;
        this.ikWeights.rightHand = 0.3;
        
        setTimeout(() => {
            const weapon = this.weaponManager?.getCurrentWeapon();
            if (weapon) {
                this.ikWeights.leftHand = weapon.type === 'pistol' ? 0.0 : 1.0;
                this.ikWeights.rightHand = 1.0;
            }
        }, this.weaponAnimations.inspect.duration * 1000);
    }

    // Gesture System
    playGesture(gestureName, priority = 1) {
        if (!this.availableGestures[gestureName]) return false;
        
        const gesture = {
            name: gestureName,
            priority: priority,
            duration: this.availableGestures[gestureName].duration,
            startTime: Date.now()
        };
        
        // Check if we can interrupt current gesture
        if (this.currentGesture && this.currentGesture.priority >= priority) {
            this.gestureQueue.push(gesture);
            return false;
        }
        
        this.startGesture(gesture);
        return true;
    }

    startGesture(gesture) {
        this.currentGesture = gesture;
        this.gestureBlendWeight = 0.0;
        
        // Play gesture animation
        const gestureAnim = this.gestureAnimations[gesture.name];
        if (gestureAnim && this.additiveLayer) {
            this.additiveLayer.play(gestureAnim);
        }
        
        // Network sync
        if (this.networkSync) {
            this.syncGesture(gesture.name);
        }
    }

    updateGestures(dt) {
        if (!this.currentGesture) {
            this.processGestureQueue();
            return;
        }
        
        const elapsed = Date.now() - this.currentGesture.startTime;
        const progress = elapsed / (this.currentGesture.duration * 1000);
        
        if (progress >= 1.0) {
            this.endCurrentGesture();
        } else {
            // Update gesture blend weight
            this.updateGestureBlending(progress);
        }
    }

    updateGestureBlending(progress) {
        // Fade in, hold, fade out curve
        if (progress < 0.2) {
            this.gestureBlendWeight = progress / 0.2;
        } else if (progress > 0.8) {
            this.gestureBlendWeight = (1.0 - progress) / 0.2;
        } else {
            this.gestureBlendWeight = 1.0;
        }
        
        if (this.additiveLayer) {
            this.additiveLayer.weight = this.gestureBlendWeight;
        }
    }

    endCurrentGesture() {
        this.currentGesture = null;
        this.gestureBlendWeight = 0.0;
        
        if (this.additiveLayer) {
            this.additiveLayer.weight = 0.0;
        }
        
        this.processGestureQueue();
    }

    processGestureQueue() {
        if (this.gestureQueue.length === 0) return;
        
        // Sort by priority and start next gesture
        this.gestureQueue.sort((a, b) => b.priority - a.priority);
        const nextGesture = this.gestureQueue.shift();
        this.startGesture(nextGesture);
    }

    // Procedural Animations
    updateProceduralAnimations(dt) {
        if (this.breathingEnabled) {
            this.updateBreathingAnimation(dt);
        }
        
        if (this.weaponSwayEnabled) {
            this.updateWeaponSwayAnimation(dt);
        }
        
        if (this.headBobEnabled) {
            this.updateHeadBobAnimation(dt);
        }
    }

    updateBreathingAnimation(dt) {
        const breathing = this.proceduralAnimations.breathing;
        breathing.phase += dt * breathing.frequency * 2 * Math.PI;
        
        const breathingOffset = Math.sin(breathing.phase) * breathing.amplitude * this.breathingIntensity;
        
        // Apply breathing to chest/spine
        const spineTarget = this.ikTargets.spine;
        if (spineTarget) {
            const basePosition = spineTarget.getLocalPosition();
            basePosition.y += breathingOffset;
            spineTarget.setLocalPosition(basePosition);
        }
    }

    updateWeaponSwayAnimation(dt) {
        const weaponSway = this.proceduralAnimations.weaponSway;
        const currentWeapon = this.weaponManager?.getCurrentWeapon();
        
        if (!currentWeapon || !this.weaponRig) return;
        
        // Get player input for sway
        const mouseInput = this.playerController?.getMouseInput() || new pc.Vec2();
        
        // Calculate sway based on mouse movement
        const swayX = mouseInput.x * weaponSway.swayAmount;
        const swayY = mouseInput.y * weaponSway.swayAmount;
        
        // Apply damping
        weaponSway.currentSway = weaponSway.currentSway || new pc.Vec2();
        weaponSway.currentSway.lerp(weaponSway.currentSway, new pc.Vec2(swayX, swayY), 1 - weaponSway.damping);
        
        // Apply to weapon rig
        const swayRotation = new pc.Vec3(swayY, swayX, 0);
        this.weaponRig.setLocalEulerAngles(swayRotation);
    }

    updateHeadBobAnimation(dt) {
        const headBob = this.proceduralAnimations.headBob;
        const velocity = this.playerController?.getVelocity() || new pc.Vec3();
        const speed = velocity.length();
        
        if (speed < 0.1) return;
        
        headBob.phase = (headBob.phase || 0) + dt * headBob.frequency * speed;
        
        const bobOffset = Math.sin(headBob.phase) * headBob.bobAmount * speed;
        
        // Apply to head/camera
        const headTarget = this.ikTargets.head;
        if (headTarget) {
            const basePosition = headTarget.getLocalPosition();
            basePosition.y += bobOffset;
            headTarget.setLocalPosition(basePosition);
        }
    }

    // Facial Animation
    updateFacialAnimation(dt) {
        // Update facial expressions based on game state
        const health = this.healthSystem?.currentHealth || 100;
        const maxHealth = this.healthSystem?.maxHealth || 100;
        const healthRatio = health / maxHealth;
        
        // Pain expression
        if (healthRatio < 0.3) {
            this.setFacialExpression('pain', 1.0 - healthRatio);
        }
        
        // Fear/stress expression during combat
        const inCombat = this.playerController?.isInCombat() || false;
        if (inCombat) {
            this.setFacialExpression('stress', 0.6);
        }
    }

    setFacialExpression(expression, intensity) {
        // Apply facial animation blends
        // In a real implementation, this would control facial blend shapes/bones
        if (this.animationComponent.facialLayer) {
            this.animationComponent.facialLayer.setParameter(expression, intensity);
        }
    }

    // Hit Reaction System
    calculateHitReaction(hitDirection, intensity) {
        // Calculate hit reaction based on damage direction and intensity
        const localHitDirection = this.entity.getRotation().transformVector(hitDirection);
        
        let reactionType = 'hit_front';
        if (localHitDirection.x > 0.5) reactionType = 'hit_right';
        else if (localHitDirection.x < -0.5) reactionType = 'hit_left';
        else if (localHitDirection.z < -0.5) reactionType = 'hit_back';
        
        this.playHitReaction(reactionType, intensity);
    }

    playHitReaction(reactionType, intensity) {
        // Play appropriate hit reaction animation
        if (this.additiveLayer) {
            this.additiveLayer.play(reactionType);
            this.additiveLayer.weight = pc.math.clamp(intensity, 0.3, 1.0);
            
            // Fade out hit reaction
            setTimeout(() => {
                if (this.additiveLayer) {
                    this.additiveLayer.weight = 0.0;
                }
            }, 500);
        }
    }

    // Network Synchronization
    syncAnimationState(state, params) {
        if (!this.networkManager) return;
        
        this.networkManager.sendMessage('animation:state_change', {
            playerId: this.entity.networkId,
            state: state,
            params: params,
            timestamp: Date.now()
        });
    }

    syncGesture(gestureName) {
        if (!this.networkManager) return;
        
        this.networkManager.sendMessage('animation:gesture', {
            playerId: this.entity.networkId,
            gesture: gestureName,
            timestamp: Date.now()
        });
    }

    // Event Handlers
    onMovementStateChanged(data) {
        if (data.entity === this.entity) {
            this.updateMovementAnimation(0);
        }
    }

    onStanceChanged(data) {
        if (data.entity === this.entity) {
            this.updateMovementAnimation(0);
        }
    }

    onSpeedChanged(data) {
        if (data.entity === this.entity) {
            this.updateAnimationSpeed(data.speed, data.stance);
        }
    }

    onWeaponChanged(data) {
        if (data.entity === this.entity) {
            const weaponType = data.newWeapon?.type;
            this.changeAnimationState('weapon_draw', { weaponType: weaponType });
        }
    }

    onWeaponFire(data) {
        if (data.entity === this.entity) {
            this.playWeaponFireAnimation();
        }
    }

    onWeaponReload(data) {
        if (data.entity === this.entity) {
            this.changeAnimationState('weapon_reload');
        }
    }

    onWeaponAim(data) {
        if (data.entity === this.entity) {
            // Handled in updateWeaponAnimation
        }
    }

    onWeaponInspect(data) {
        if (data.entity === this.entity) {
            this.changeAnimationState('weapon_inspect');
        }
    }

    onDamageTaken(data) {
        if (data.target === this.entity) {
            this.calculateHitReaction(data.direction, data.intensity);
        }
    }

    onDeath(data) {
        if (data.entity === this.entity) {
            this.changeAnimationState('death');
        }
    }

    onRevive(data) {
        if (data.entity === this.entity) {
            this.changeAnimationState('idle');
            this.ikEnabled = true;
            this.breathingEnabled = true;
            this.weaponSwayEnabled = true;
        }
    }

    onGestureRequested(data) {
        if (data.entity === this.entity) {
            this.playGesture(data.gesture, data.priority);
        }
    }

    onGestureInput(data) {
        // Handle gesture input from player
        this.playGesture(data.gesture);
    }

    onAnimationSync(data) {
        // Handle networked animation synchronization
        if (data.playerId === this.entity.networkId) return; // Don't sync own animations
        
        if (data.type === 'state_change') {
            this.changeAnimationState(data.state, data.params);
        } else if (data.type === 'gesture') {
            this.playGesture(data.gesture);
        }
    }

    playWeaponFireAnimation() {
        if (this.upperBodyLayer) {
            this.upperBodyLayer.play('weapon_fire');
            
            // Return to idle after fire animation
            setTimeout(() => {
                if (this.upperBodyLayer) {
                    this.upperBodyLayer.transition('weapon_idle', 0.1);
                }
            }, this.weaponAnimations.fire.duration * 1000);
        }
    }

    // Performance Optimization
    updateAnimationLOD() {
        // Adjust animation quality based on distance from camera
        const cameras = this.app.root.findByTag('camera');
        if (cameras.length === 0) return;
        
        const camera = cameras[0];
        const distance = this.entity.getPosition().distance(camera.getPosition());
        
        if (distance > this.cullingDistance) {
            this.animationLOD = 'none';
            this.setAnimationEnabled(false);
        } else if (distance > this.cullingDistance * 0.5) {
            this.animationLOD = 'low';
            this.updateFrequency = 30;
        } else {
            this.animationLOD = 'high';
            this.updateFrequency = 60;
        }
    }

    setAnimationEnabled(enabled) {
        if (this.animationComponent) {
            this.animationComponent.enabled = enabled;
        }
    }

    // Public API
    getCurrentState() {
        return this.currentState;
    }

    isPlayingGesture() {
        return this.currentGesture !== null;
    }

    setIKWeight(target, weight) {
        if (this.ikWeights.hasOwnProperty(target)) {
            this.ikWeights[target] = pc.math.clamp(weight, 0, 1);
        }
    }

    getIKWeight(target) {
        return this.ikWeights[target] || 0;
    }

    setProceduralAnimationEnabled(type, enabled) {
        switch (type) {
            case 'breathing':
                this.breathingEnabled = enabled;
                break;
            case 'weaponSway':
                this.weaponSwayEnabled = enabled;
                break;
            case 'headBob':
                this.headBobEnabled = enabled;
                break;
        }
    }

    update(dt) {
        // Performance optimization
        this.updateAnimationLOD();
        
        if (this.animationLOD === 'none') return;
        
        // Core animation updates
        this.updateMovementAnimation(dt);
        this.updateWeaponAnimation();
        this.updateProceduralAnimations(dt);
        this.updateGestures(dt);
        this.updateFacialAnimation(dt);
        
        // State transition updates
        if (this.stateTransitionTime < this.transitionDuration) {
            this.stateTransitionTime += dt;
        }
        
        // Network sync
        const currentTime = Date.now();
        if (this.networkSync && currentTime - this.lastNetworkUpdate > 1000 / this.networkUpdateRate) {
            this.lastNetworkUpdate = currentTime;
            // Periodic sync if needed
        }
    }
}

pc.registerScript(PlayerAnimationController, 'PlayerAnimationController');
