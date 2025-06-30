/**
 * Interactive Objects System - Handles Player Interactions with Environment
 * Manages doors, switches, elevators, computers, vehicles, and other interactive elements
 */

class InteractiveObjects {
    constructor() {
        this.objects = new Map();
        this.playerInteractions = new Map();
        this.interactionRange = 2.0;
        this.currentInteractable = null;
        this.interactionCooldown = 0.5; // seconds
        this.lastInteractionTime = 0;
        
        this.objectTypes = {
            door: {
                animation: 'slide',
                duration: 1.0,
                sound: 'door_open',
                requiresKey: false,
                autoClose: true,
                autoCloseDelay: 3.0
            },
            switch: {
                animation: 'toggle',
                duration: 0.2,
                sound: 'switch_click',
                requiresKey: false,
                autoClose: false
            },
            button: {
                animation: 'press',
                duration: 0.3,
                sound: 'button_press',
                requiresKey: false,
                autoClose: true,
                autoCloseDelay: 1.0
            },
            computer: {
                animation: 'none',
                duration: 0.0,
                sound: 'computer_beep',
                requiresKey: false,
                opensInterface: true
            },
            elevator: {
                animation: 'move',
                duration: 3.0,
                sound: 'elevator_move',
                requiresKey: false,
                autoClose: false
            },
            vehicle: {
                animation: 'none',
                duration: 0.0,
                sound: 'vehicle_enter',
                requiresKey: false,
                opensInterface: false,
                enterable: true
            },
            container: {
                animation: 'open',
                duration: 0.8,
                sound: 'container_open',
                requiresKey: false,
                opensInterface: true,
                autoClose: true,
                autoCloseDelay: 5.0
            },
            keypad: {
                animation: 'none',
                duration: 0.0,
                sound: 'keypad_beep',
                requiresCode: true,
                opensInterface: true
            }
        };
        
        this.interactionPrompts = new Map();
        this.animationQueue = [];
        this.events = new EventTarget();
        
        this.init();
    }
    
    init() {
        this.setupInteractionPrompts();
        this.bindInputEvents();
    }
    
    setupInteractionPrompts() {
        this.interactionPrompts.set('door', 'Press [E] to open door');
        this.interactionPrompts.set('switch', 'Press [E] to flip switch');
        this.interactionPrompts.set('button', 'Press [E] to press button');
        this.interactionPrompts.set('computer', 'Press [E] to use computer');
        this.interactionPrompts.set('elevator', 'Press [E] to call elevator');
        this.interactionPrompts.set('vehicle', 'Press [E] to enter vehicle');
        this.interactionPrompts.set('container', 'Press [E] to open container');
        this.interactionPrompts.set('keypad', 'Press [E] to enter code');
        this.interactionPrompts.set('locked', 'Locked - Requires key');
        this.interactionPrompts.set('disabled', 'Disabled');
    }
    
    bindInputEvents() {
        if (window.inputManager) {
            window.inputManager.on('keyPressed', (event) => {
                if (event.key === 'KeyE' || event.key === 'Interact') {
                    this.attemptInteraction();
                }
            });
        }
    }
    
    update(deltaTime) {
        this.updatePlayerProximity();
        this.updateAnimations(deltaTime);
        this.updateAutoClosing(deltaTime);
        this.updateInteractionPrompts();
    }
    
    updatePlayerProximity() {
        if (!window.playerController) return;
        
        const playerPosition = window.playerController.getPosition();
        let closestObject = null;
        let closestDistance = this.interactionRange;
        
        this.objects.forEach((obj, id) => {
            if (!obj.enabled) return;
            
            const distance = this.calculateDistance(playerPosition, obj.position);
            if (distance <= this.interactionRange && distance < closestDistance) {
                closestDistance = distance;
                closestObject = { id, ...obj };
            }
        });
        
        // Update current interactable
        if (closestObject && closestObject.id !== this.currentInteractable?.id) {
            this.setCurrentInteractable(closestObject);
        } else if (!closestObject && this.currentInteractable) {
            this.clearCurrentInteractable();
        }
    }
    
    setCurrentInteractable(obj) {
        this.currentInteractable = obj;
        
        this.events.dispatchEvent(new CustomEvent('interactableEntered', {
            detail: { object: obj }
        }));
        
        // Show interaction prompt
        this.showInteractionPrompt(obj);
    }
    
    clearCurrentInteractable() {
        if (this.currentInteractable) {
            this.events.dispatchEvent(new CustomEvent('interactableExited', {
                detail: { object: this.currentInteractable }
            }));
        }
        
        this.currentInteractable = null;
        this.hideInteractionPrompt();
    }
    
    showInteractionPrompt(obj) {
        let promptText = this.interactionPrompts.get(obj.type) || 'Press [E] to interact';
        
        if (obj.locked) {
            promptText = this.interactionPrompts.get('locked');
        } else if (!obj.enabled) {
            promptText = this.interactionPrompts.get('disabled');
        } else if (obj.customPrompt) {
            promptText = obj.customPrompt;
        }
        
        if (window.hudManager) {
            window.hudManager.showInteractionPrompt(promptText, obj.position);
        }
    }
    
    hideInteractionPrompt() {
        if (window.hudManager) {
            window.hudManager.hideInteractionPrompt();
        }
    }
    
    attemptInteraction() {
        if (!this.currentInteractable) return;
        
        const currentTime = Date.now() / 1000;
        if (currentTime - this.lastInteractionTime < this.interactionCooldown) {
            return;
        }
        
        const obj = this.currentInteractable;
        
        // Check if interaction is possible
        if (!this.canInteract(obj)) {
            this.handleFailedInteraction(obj);
            return;
        }
        
        this.performInteraction(obj);
        this.lastInteractionTime = currentTime;
    }
    
    canInteract(obj) {
        if (!obj.enabled) return false;
        if (obj.locked && !this.hasRequiredKey(obj)) return false;
        if (obj.requiresCode && !obj.codeEntered) return false;
        if (obj.cooldownUntil && Date.now() / 1000 < obj.cooldownUntil) return false;
        
        return true;
    }
    
    hasRequiredKey(obj) {
        if (!obj.requiredKey) return true;
        
        if (window.inventorySystem) {
            return window.inventorySystem.hasItem(obj.requiredKey);
        }
        
        return false;
    }
    
    performInteraction(obj) {
        const objectData = this.objects.get(obj.id);
        if (!objectData) return;
        
        this.events.dispatchEvent(new CustomEvent('objectInteracted', {
            detail: { object: obj }
        }));
        
        // Handle different interaction types
        switch (obj.type) {
            case 'door':
                this.handleDoorInteraction(objectData);
                break;
            case 'switch':
                this.handleSwitchInteraction(objectData);
                break;
            case 'button':
                this.handleButtonInteraction(objectData);
                break;
            case 'computer':
                this.handleComputerInteraction(objectData);
                break;
            case 'elevator':
                this.handleElevatorInteraction(objectData);
                break;
            case 'vehicle':
                this.handleVehicleInteraction(objectData);
                break;
            case 'container':
                this.handleContainerInteraction(objectData);
                break;
            case 'keypad':
                this.handleKeypadInteraction(objectData);
                break;
            default:
                this.handleGenericInteraction(objectData);
        }
        
        // Play interaction sound
        this.playInteractionSound(obj);
        
        // Start animation if specified
        this.startInteractionAnimation(objectData);
        
        // Handle auto-close timing
        if (obj.autoClose && obj.autoCloseDelay > 0) {
            objectData.autoCloseTime = Date.now() / 1000 + obj.autoCloseDelay;
        }
    }
    
    handleDoorInteraction(obj) {
        obj.state = obj.state === 'closed' ? 'open' : 'closed';
        
        this.events.dispatchEvent(new CustomEvent('doorStateChanged', {
            detail: { objectId: obj.id, state: obj.state }
        }));
        
        // Update collision if available
        if (window.physicsManager) {
            window.physicsManager.setObjectCollision(obj.id, obj.state === 'closed');
        }
    }
    
    handleSwitchInteraction(obj) {
        obj.state = obj.state === 'off' ? 'on' : 'off';
        
        // Trigger connected systems
        if (obj.connectedObjects) {
            obj.connectedObjects.forEach(connectedId => {
                this.triggerConnectedObject(connectedId, obj.state === 'on');
            });
        }
        
        this.events.dispatchEvent(new CustomEvent('switchToggled', {
            detail: { objectId: obj.id, state: obj.state }
        }));
    }
    
    handleButtonInteraction(obj) {
        obj.state = 'pressed';
        
        // Buttons typically trigger something then reset
        if (obj.connectedObjects) {
            obj.connectedObjects.forEach(connectedId => {
                this.triggerConnectedObject(connectedId, true);
            });
        }
        
        this.events.dispatchEvent(new CustomEvent('buttonPressed', {
            detail: { objectId: obj.id }
        }));
    }
    
    handleComputerInteraction(obj) {
        // Open computer interface
        if (window.uiManager) {
            window.uiManager.openComputerInterface(obj.id, obj.computerData);
        }
        
        this.events.dispatchEvent(new CustomEvent('computerAccessed', {
            detail: { objectId: obj.id }
        }));
    }
    
    handleElevatorInteraction(obj) {
        if (obj.state === 'idle') {
            obj.state = 'moving';
            obj.targetFloor = obj.targetFloor || (obj.currentFloor === 0 ? 1 : 0);
            
            // Start elevator movement
            this.startElevatorMovement(obj);
        }
    }
    
    handleVehicleInteraction(obj) {
        if (window.playerController) {
            window.playerController.enterVehicle(obj.id);
        }
        
        this.events.dispatchEvent(new CustomEvent('vehicleEntered', {
            detail: { objectId: obj.id }
        }));
    }
    
    handleContainerInteraction(obj) {
        obj.state = obj.state === 'closed' ? 'open' : 'closed';
        
        if (obj.state === 'open' && window.inventorySystem) {
            window.inventorySystem.openContainerInterface(obj.id, obj.contents);
        }
        
        this.events.dispatchEvent(new CustomEvent('containerOpened', {
            detail: { objectId: obj.id, contents: obj.contents }
        }));
    }
    
    handleKeypadInteraction(obj) {
        if (window.uiManager) {
            window.uiManager.openKeypadInterface(obj.id, (code) => {
                this.validateKeypadCode(obj.id, code);
            });
        }
    }
    
    handleGenericInteraction(obj) {
        // Default interaction behavior
        obj.interactionCount = (obj.interactionCount || 0) + 1;
        
        this.events.dispatchEvent(new CustomEvent('genericInteraction', {
            detail: { objectId: obj.id, count: obj.interactionCount }
        }));
    }
    
    validateKeypadCode(objectId, enteredCode) {
        const obj = this.objects.get(objectId);
        if (!obj) return;
        
        if (enteredCode === obj.correctCode) {
            obj.locked = false;
            obj.codeEntered = true;
            
            this.events.dispatchEvent(new CustomEvent('keypadCodeCorrect', {
                detail: { objectId: objectId }
            }));
            
            // Trigger connected objects
            if (obj.connectedObjects) {
                obj.connectedObjects.forEach(connectedId => {
                    this.triggerConnectedObject(connectedId, true);
                });
            }
        } else {
            this.events.dispatchEvent(new CustomEvent('keypadCodeIncorrect', {
                detail: { objectId: objectId, enteredCode: enteredCode }
            }));
            
            // Play error sound
            if (window.audioManager) {
                window.audioManager.playSound('keypad_error', 0.6);
            }
        }
        
        // Close keypad interface
        if (window.uiManager) {
            window.uiManager.closeKeypadInterface();
        }
    }
    
    triggerConnectedObject(objectId, activated) {
        const connectedObj = this.objects.get(objectId);
        if (!connectedObj) return;
        
        // Enable/disable or open/close based on the connected object type
        if (activated) {
            connectedObj.enabled = true;
            if (connectedObj.type === 'door') {
                connectedObj.state = 'open';
            }
        } else {
            if (connectedObj.type === 'door') {
                connectedObj.state = 'closed';
            }
        }
        
        this.events.dispatchEvent(new CustomEvent('connectedObjectTriggered', {
            detail: { objectId: objectId, activated: activated }
        }));
    }
    
    startInteractionAnimation(obj) {
        const typeConfig = this.objectTypes[obj.type];
        if (!typeConfig || typeConfig.animation === 'none') return;
        
        const animation = {
            objectId: obj.id,
            type: typeConfig.animation,
            duration: typeConfig.duration,
            startTime: Date.now() / 1000,
            progress: 0
        };
        
        this.animationQueue.push(animation);
    }
    
    updateAnimations(deltaTime) {
        this.animationQueue = this.animationQueue.filter(animation => {
            const currentTime = Date.now() / 1000;
            const elapsed = currentTime - animation.startTime;
            animation.progress = Math.min(elapsed / animation.duration, 1.0);
            
            // Update object animation state
            this.updateObjectAnimation(animation);
            
            // Remove completed animations
            return animation.progress < 1.0;
        });
    }
    
    updateObjectAnimation(animation) {
        const obj = this.objects.get(animation.objectId);
        if (!obj) return;
        
        // Apply animation based on type
        switch (animation.type) {
            case 'slide':
                this.updateSlideAnimation(obj, animation);
                break;
            case 'rotate':
                this.updateRotateAnimation(obj, animation);
                break;
            case 'scale':
                this.updateScaleAnimation(obj, animation);
                break;
            case 'move':
                this.updateMoveAnimation(obj, animation);
                break;
        }
    }
    
    updateSlideAnimation(obj, animation) {
        // Example: sliding door animation
        const progress = this.easeInOut(animation.progress);
        const slideAmount = obj.state === 'open' ? progress : (1.0 - progress);
        
        if (window.renderManager) {
            window.renderManager.setObjectTransform(obj.id, {
                position: {
                    x: obj.originalPosition.x + (obj.slideDirection.x * slideAmount * obj.slideDistance),
                    y: obj.originalPosition.y + (obj.slideDirection.y * slideAmount * obj.slideDistance),
                    z: obj.originalPosition.z + (obj.slideDirection.z * slideAmount * obj.slideDistance)
                }
            });
        }
    }
    
    updateAutoClosing(deltaTime) {
        const currentTime = Date.now() / 1000;
        
        this.objects.forEach((obj, id) => {
            if (obj.autoCloseTime && currentTime >= obj.autoCloseTime) {
                obj.autoCloseTime = null;
                
                // Auto-close the object
                if (obj.type === 'door' && obj.state === 'open') {
                    obj.state = 'closed';
                    this.startInteractionAnimation(obj);
                } else if (obj.type === 'button' && obj.state === 'pressed') {
                    obj.state = 'idle';
                    this.startInteractionAnimation(obj);
                }
                
                this.events.dispatchEvent(new CustomEvent('objectAutoClosed', {
                    detail: { objectId: id }
                }));
            }
        });
    }
    
    updateInteractionPrompts() {
        // Update prompt position to follow object
        if (this.currentInteractable && window.hudManager) {
            window.hudManager.updateInteractionPromptPosition(this.currentInteractable.position);
        }
    }
    
    playInteractionSound(obj) {
        const typeConfig = this.objectTypes[obj.type];
        if (!typeConfig || !typeConfig.sound) return;
        
        if (window.audioManager) {
            window.audioManager.playSound(typeConfig.sound, 0.7, obj.position);
        }
    }
    
    // Public API methods
    registerObject(id, config) {
        const defaultConfig = this.objectTypes[config.type] || {};
        
        const obj = {
            id: id,
            enabled: true,
            state: config.initialState || 'closed',
            locked: config.locked || false,
            ...defaultConfig,
            ...config,
            originalPosition: { ...config.position },
            interactionCount: 0
        };
        
        this.objects.set(id, obj);
        
        this.events.dispatchEvent(new CustomEvent('objectRegistered', {
            detail: { objectId: id, object: obj }
        }));
    }
    
    removeObject(id) {
        this.objects.delete(id);
        
        if (this.currentInteractable && this.currentInteractable.id === id) {
            this.clearCurrentInteractable();
        }
    }
    
    setObjectState(id, state) {
        const obj = this.objects.get(id);
        if (obj) {
            obj.state = state;
        }
    }
    
    lockObject(id, locked = true) {
        const obj = this.objects.get(id);
        if (obj) {
            obj.locked = locked;
        }
    }
    
    enableObject(id, enabled = true) {
        const obj = this.objects.get(id);
        if (obj) {
            obj.enabled = enabled;
        }
    }
    
    connectObjects(sourceId, targetIds) {
        const sourceObj = this.objects.get(sourceId);
        if (sourceObj) {
            sourceObj.connectedObjects = Array.isArray(targetIds) ? targetIds : [targetIds];
        }
    }
    
    // Utility methods
    calculateDistance(pos1, pos2) {
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        const dz = pos1.z - pos2.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    
    easeInOut(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }
    
    handleFailedInteraction(obj) {
        if (obj.locked) {
            if (window.hudManager) {
                window.hudManager.showNotification('This is locked', 'warning');
            }
            if (window.audioManager) {
                window.audioManager.playSound('interaction_fail', 0.5);
            }
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
            objectCount: this.objects.size,
            currentInteractable: this.currentInteractable?.id || null,
            activeAnimations: this.animationQueue.length,
            interactionRange: this.interactionRange
        };
    }
    
    listObjects() {
        const objectList = [];
        this.objects.forEach((obj, id) => {
            objectList.push({
                id: id,
                type: obj.type,
                state: obj.state,
                enabled: obj.enabled,
                locked: obj.locked
            });
        });
        return objectList;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = InteractiveObjects;
} else {
    window.InteractiveObjects = InteractiveObjects;
}
