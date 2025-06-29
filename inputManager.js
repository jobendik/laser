var InputManager = pc.createScript('inputManager');

InputManager.attributes.add('mouseSensitivity', { type: 'number', default: 1.0, min: 0.1, max: 5.0 });
InputManager.attributes.add('invertMouseY', { type: 'boolean', default: false });
InputManager.attributes.add('keyRepeatDelay', { type: 'number', default: 0.5 });
InputManager.attributes.add('keyRepeatRate', { type: 'number', default: 0.1 });
InputManager.attributes.add('deadZone', { type: 'number', default: 0.1 });
InputManager.attributes.add('enableVibration', { type: 'boolean', default: true });

InputManager.prototype.initialize = function() {
    // Input state tracking
    this.keyStates = new Map();
    this.mouseStates = new Map();
    this.gamepadStates = new Map();
    this.touchStates = new Map();
    
    // Input bindings
    this.keyBindings = new Map();
    this.mouseBindings = new Map();
    this.gamepadBindings = new Map();
    this.touchBindings = new Map();
    
    // Input contexts (different control schemes)
    this.inputContexts = new Map();
    this.currentContext = 'default';
    this.contextStack = ['default'];
    
    // Key repeat system
    this.keyRepeatStates = new Map();
    
    // Mouse state
    this.mousePosition = new pc.Vec2();
    this.mouseDelta = new pc.Vec2();
    this.mouseWheel = 0;
    this.isMouseLocked = false;
    
    // Gamepad support
    this.connectedGamepads = new Map();
    this.gamepadDeadZones = new Map();
    this.gamepadVibration = new Map();
    
    // Touch support
    this.touches = new Map();
    this.touchGestures = {
        tap: { active: false, startTime: 0, position: new pc.Vec2() },
        swipe: { active: false, startPos: new pc.Vec2(), endPos: new pc.Vec2() },
        pinch: { active: false, startDistance: 0, currentDistance: 0 },
        hold: { active: false, startTime: 0, position: new pc.Vec2() }
    };
    
    // Input buffering for combos
    this.inputBuffer = [];
    this.maxBufferTime = 1000; // 1 second
    this.comboSequences = new Map();
    
    // Macro system
    this.macros = new Map();
    this.recordingMacro = null;
    
    // Initialize default bindings
    this.initializeDefaultBindings();
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Setup gamepad polling
    this.setupGamepadPolling();
    
    console.log('InputManager initialized');
};

InputManager.prototype.initializeDefaultBindings = function() {
    // Create default context
    this.inputContexts.set('default', {
        keyBindings: new Map(),
        mouseBindings: new Map(),
        gamepadBindings: new Map(),
        enabled: true
    });
    
    // Default key bindings
    const defaultKeys = {
        // Movement
        'moveForward': pc.KEY_W,
        'moveBackward': pc.KEY_S,
        'moveLeft': pc.KEY_A,
        'moveRight': pc.KEY_D,
        'jump': pc.KEY_SPACE,
        'crouch': pc.KEY_C,
        'run': pc.KEY_SHIFT,
        'walk': pc.KEY_CONTROL,
        
        // Combat
        'reload': pc.KEY_R,
        'melee': pc.KEY_V,
        'grenade': pc.KEY_G,
        'use': pc.KEY_E,
        'interact': pc.KEY_F,
        
        // Weapons
        'weapon1': pc.KEY_1,
        'weapon2': pc.KEY_2,
        'weapon3': pc.KEY_3,
        'weapon4': pc.KEY_4,
        'weapon5': pc.KEY_5,
        'nextWeapon': pc.KEY_Q,
        'prevWeapon': pc.KEY_TAB,
        
        // UI
        'scoreboard': pc.KEY_TAB,
        'chat': pc.KEY_T,
        'teamChat': pc.KEY_Y,
        'menu': pc.KEY_ESCAPE,
        'map': pc.KEY_M,
        'inventory': pc.KEY_I,
        
        // Utility
        'screenshot': pc.KEY_F12,
        'console': pc.KEY_GRAVE
    };
    
    Object.entries(defaultKeys).forEach(([action, key]) => {
        this.bindKey(action, key, 'default');
    });
    
    // Default mouse bindings
    const defaultMouse = {
        'fire': pc.MOUSEBUTTON_LEFT,
        'aim': pc.MOUSEBUTTON_RIGHT,
        'quickMelee': pc.MOUSEBUTTON_MIDDLE
    };
    
    Object.entries(defaultMouse).forEach(([action, button]) => {
        this.bindMouse(action, button, 'default');
    });
    
    // Default gamepad bindings (Xbox layout)
    const defaultGamepad = {
        'fire': 0, // A button
        'jump': 1, // B button
        'reload': 2, // X button
        'aim': 3, // Y button
        'run': 4, // LB
        'grenade': 5, // RB
        'crouch': 6, // LT (analog)
        'melee': 7, // RT (analog)
        'weapon1': 8, // Back/Select
        'menu': 9, // Start
        'leftStick': 10, // Left stick click
        'rightStick': 11  // Right stick click
    };
    
    Object.entries(defaultGamepad).forEach(([action, button]) => {
        this.bindGamepad(action, button, 'default');
    });
};

InputManager.prototype.setupEventListeners = function() {
    // Keyboard events
    this.app.keyboard.on(pc.EVENT_KEYDOWN, this.onKeyDown, this);
    this.app.keyboard.on(pc.EVENT_KEYUP, this.onKeyUp, this);
    
    // Mouse events
    this.app.mouse.on(pc.EVENT_MOUSEDOWN, this.onMouseDown, this);
    this.app.mouse.on(pc.EVENT_MOUSEUP, this.onMouseUp, this);
    this.app.mouse.on(pc.EVENT_MOUSEMOVE, this.onMouseMove, this);
    this.app.mouse.on(pc.EVENT_MOUSEWHEEL, this.onMouseWheel, this);
    
    // Touch events
    if (this.app.touch) {
        this.app.touch.on(pc.EVENT_TOUCHSTART, this.onTouchStart, this);
        this.app.touch.on(pc.EVENT_TOUCHEND, this.onTouchEnd, this);
        this.app.touch.on(pc.EVENT_TOUCHMOVE, this.onTouchMove, this);
        this.app.touch.on(pc.EVENT_TOUCHCANCEL, this.onTouchCancel, this);
    }
    
    // Window events
    window.addEventListener('gamepadconnected', this.onGamepadConnected.bind(this));
    window.addEventListener('gamepaddisconnected', this.onGamepadDisconnected.bind(this));
    
    // Pointer lock events
    document.addEventListener('pointerlockchange', this.onPointerLockChange.bind(this));
    document.addEventListener('pointerlockerror', this.onPointerLockError.bind(this));
};

InputManager.prototype.setupGamepadPolling = function() {
    // Gamepad polling (required for most browsers)
    this.gamepadPollingInterval = setInterval(() => {
        this.pollGamepads();
    }, 16); // ~60 FPS
};

InputManager.prototype.update = function(dt) {
    this.updateKeyRepeat(dt);
    this.updateInputBuffer(dt);
    this.updateTouchGestures(dt);
    this.updateMacroRecording(dt);
    this.processInputActions(dt);
};

InputManager.prototype.onKeyDown = function(event) {
    const key = event.key;
    
    // Update key state
    this.keyStates.set(key, {
        pressed: true,
        justPressed: !this.keyStates.has(key) || !this.keyStates.get(key).pressed,
        pressTime: Date.now(),
        repeatTime: 0
    });
    
    // Add to input buffer
    this.addToInputBuffer('key', key);
    
    // Check for bound actions
    this.checkKeyBindings(key, true);
    
    // Start key repeat
    this.startKeyRepeat(key);
    
    // Record macro if active
    if (this.recordingMacro) {
        this.recordingMacro.inputs.push({
            type: 'keydown',
            key: key,
            timestamp: Date.now()
        });
    }
};

InputManager.prototype.onKeyUp = function(event) {
    const key = event.key;
    
    // Update key state
    this.keyStates.set(key, {
        pressed: false,
        justReleased: true,
        releaseTime: Date.now()
    });
    
    // Check for bound actions
    this.checkKeyBindings(key, false);
    
    // Stop key repeat
    this.stopKeyRepeat(key);
    
    // Record macro if active
    if (this.recordingMacro) {
        this.recordingMacro.inputs.push({
            type: 'keyup',
            key: key,
            timestamp: Date.now()
        });
    }
};

InputManager.prototype.onMouseDown = function(event) {
    const button = event.button;
    
    // Update mouse state
    this.mouseStates.set(button, {
        pressed: true,
        justPressed: true,
        pressTime: Date.now(),
        position: new pc.Vec2(event.x, event.y)
    });
    
    // Add to input buffer
    this.addToInputBuffer('mouse', button);
    
    // Check for bound actions
    this.checkMouseBindings(button, true);
    
    // Request pointer lock for primary button
    if (button === pc.MOUSEBUTTON_LEFT && !this.isMouseLocked) {
        this.requestPointerLock();
    }
};

InputManager.prototype.onMouseUp = function(event) {
    const button = event.button;
    
    // Update mouse state
    this.mouseStates.set(button, {
        pressed: false,
        justReleased: true,
        releaseTime: Date.now(),
        position: new pc.Vec2(event.x, event.y)
    });
    
    // Check for bound actions
    this.checkMouseBindings(button, false);
};

InputManager.prototype.onMouseMove = function(event) {
    // Update mouse position and delta
    this.mousePosition.set(event.x, event.y);
    this.mouseDelta.set(event.dx * this.mouseSensitivity, event.dy * this.mouseSensitivity);
    
    if (this.invertMouseY) {
        this.mouseDelta.y *= -1;
    }
    
    // Fire mouse move event
    this.fireInputAction('mouseMove', {
        position: this.mousePosition,
        delta: this.mouseDelta,
        isLocked: this.isMouseLocked
    });
};

InputManager.prototype.onMouseWheel = function(event) {
    this.mouseWheel = event.wheel;
    
    // Fire mouse wheel event
    this.fireInputAction('mouseWheel', {
        delta: event.wheel,
        direction: event.wheel > 0 ? 'up' : 'down'
    });
    
    // Add to input buffer
    this.addToInputBuffer('wheel', event.wheel > 0 ? 'up' : 'down');
};

InputManager.prototype.onTouchStart = function(event) {
    event.touches.forEach(touch => {
        this.touches.set(touch.id, {
            id: touch.id,
            startPosition: new pc.Vec2(touch.x, touch.y),
            currentPosition: new pc.Vec2(touch.x, touch.y),
            startTime: Date.now(),
            active: true
        });
    });
    
    this.processTouchGestures('start', event);
};

InputManager.prototype.onTouchEnd = function(event) {
    event.touches.forEach(touch => {
        const touchData = this.touches.get(touch.id);
        if (touchData) {
            touchData.active = false;
            touchData.endTime = Date.now();
            touchData.endPosition = new pc.Vec2(touch.x, touch.y);
        }
    });
    
    this.processTouchGestures('end', event);
    
    // Clean up ended touches
    setTimeout(() => {
        event.touches.forEach(touch => {
            this.touches.delete(touch.id);
        });
    }, 100);
};

InputManager.prototype.onTouchMove = function(event) {
    event.touches.forEach(touch => {
        const touchData = this.touches.get(touch.id);
        if (touchData) {
            touchData.currentPosition.set(touch.x, touch.y);
        }
    });
    
    this.processTouchGestures('move', event);
};

InputManager.prototype.onTouchCancel = function(event) {
    event.touches.forEach(touch => {
        this.touches.delete(touch.id);
    });
    
    this.resetTouchGestures();
};

InputManager.prototype.onGamepadConnected = function(event) {
    const gamepad = event.gamepad;
    console.log('Gamepad connected:', gamepad.id);
    
    this.connectedGamepads.set(gamepad.index, {
        id: gamepad.id,
        index: gamepad.index,
        connected: true,
        buttons: new Array(gamepad.buttons.length).fill(false),
        axes: new Array(gamepad.axes.length).fill(0)
    });
    
    // Set default dead zones
    this.gamepadDeadZones.set(gamepad.index, {
        leftStick: this.deadZone,
        rightStick: this.deadZone,
        triggers: this.deadZone
    });
    
    this.fireInputAction('gamepadConnected', { gamepad: gamepad });
};

InputManager.prototype.onGamepadDisconnected = function(event) {
    const gamepad = event.gamepad;
    console.log('Gamepad disconnected:', gamepad.id);
    
    this.connectedGamepads.delete(gamepad.index);
    this.gamepadDeadZones.delete(gamepad.index);
    this.gamepadVibration.delete(gamepad.index);
    
    this.fireInputAction('gamepadDisconnected', { gamepad: gamepad });
};

InputManager.prototype.pollGamepads = function() {
    const gamepads = navigator.getGamepads();
    
    for (let i = 0; i < gamepads.length; i++) {
        const gamepad = gamepads[i];
        if (!gamepad || !this.connectedGamepads.has(i)) continue;
        
        const gamepadState = this.connectedGamepads.get(i);
        
        // Update button states
        for (let j = 0; j < gamepad.buttons.length; j++) {
            const button = gamepad.buttons[j];
            const wasPressed = gamepadState.buttons[j];
            const isPressed = button.pressed;
            
            if (isPressed !== wasPressed) {
                gamepadState.buttons[j] = isPressed;
                this.checkGamepadBindings(i, j, isPressed);
            }
        }
        
        // Update axis states
        for (let j = 0; j < gamepad.axes.length; j++) {
            const axisValue = gamepad.axes[j];
            const deadZone = this.getAxisDeadZone(i, j);
            
            const filteredValue = Math.abs(axisValue) < deadZone ? 0 : axisValue;
            
            if (filteredValue !== gamepadState.axes[j]) {
                gamepadState.axes[j] = filteredValue;
                this.fireInputAction('gamepadAxis', {
                    gamepadIndex: i,
                    axis: j,
                    value: filteredValue
                });
            }
        }
    }
};

InputManager.prototype.getAxisDeadZone = function(gamepadIndex, axisIndex) {
    const deadZones = this.gamepadDeadZones.get(gamepadIndex);
    if (!deadZones) return this.deadZone;
    
    // Map axis indices to dead zone types
    switch (axisIndex) {
        case 0: case 1: return deadZones.leftStick;
        case 2: case 3: return deadZones.rightStick;
        case 6: case 7: return deadZones.triggers;
        default: return this.deadZone;
    }
};

InputManager.prototype.checkKeyBindings = function(key, pressed) {
    const context = this.inputContexts.get(this.currentContext);
    if (!context || !context.enabled) return;
    
    context.keyBindings.forEach((boundKey, action) => {
        if (boundKey === key) {
            this.fireInputAction(action, { pressed: pressed, key: key });
        }
    });
};

InputManager.prototype.checkMouseBindings = function(button, pressed) {
    const context = this.inputContexts.get(this.currentContext);
    if (!context || !context.enabled) return;
    
    context.mouseBindings.forEach((boundButton, action) => {
        if (boundButton === button) {
            this.fireInputAction(action, { pressed: pressed, button: button });
        }
    });
};

InputManager.prototype.checkGamepadBindings = function(gamepadIndex, button, pressed) {
    const context = this.inputContexts.get(this.currentContext);
    if (!context || !context.enabled) return;
    
    context.gamepadBindings.forEach((boundButton, action) => {
        if (boundButton === button) {
            this.fireInputAction(action, { 
                pressed: pressed, 
                button: button, 
                gamepadIndex: gamepadIndex 
            });
        }
    });
};

InputManager.prototype.fireInputAction = function(action, data) {
    // Fire to global event system
    this.app.fire('input:' + action, data);
    
    // Check for combo sequences
    this.checkComboSequences(action);
};

InputManager.prototype.bindKey = function(action, key, context = 'default') {
    const ctx = this.inputContexts.get(context);
    if (ctx) {
        ctx.keyBindings.set(action, key);
    }
};

InputManager.prototype.bindMouse = function(action, button, context = 'default') {
    const ctx = this.inputContexts.get(context);
    if (ctx) {
        ctx.mouseBindings.set(action, button);
    }
};

InputManager.prototype.bindGamepad = function(action, button, context = 'default') {
    const ctx = this.inputContexts.get(context);
    if (ctx) {
        ctx.gamepadBindings.set(action, button);
    }
};

InputManager.prototype.unbindKey = function(action, context = 'default') {
    const ctx = this.inputContexts.get(context);
    if (ctx) {
        ctx.keyBindings.delete(action);
    }
};

InputManager.prototype.unbindMouse = function(action, context = 'default') {
    const ctx = this.inputContexts.get(context);
    if (ctx) {
        ctx.mouseBindings.delete(action);
    }
};

InputManager.prototype.unbindGamepad = function(action, context = 'default') {
    const ctx = this.inputContexts.get(context);
    if (ctx) {
        ctx.gamepadBindings.delete(action);
    }
};

InputManager.prototype.addInputContext = function(name, enabled = true) {
    this.inputContexts.set(name, {
        keyBindings: new Map(),
        mouseBindings: new Map(),
        gamepadBindings: new Map(),
        enabled: enabled
    });
};

InputManager.prototype.removeInputContext = function(name) {
    this.inputContexts.delete(name);
    
    // Remove from context stack
    const index = this.contextStack.indexOf(name);
    if (index >= 0) {
        this.contextStack.splice(index, 1);
    }
    
    // Update current context if necessary
    if (this.currentContext === name) {
        this.currentContext = this.contextStack[this.contextStack.length - 1] || 'default';
    }
};

InputManager.prototype.pushInputContext = function(name) {
    if (this.inputContexts.has(name)) {
        this.contextStack.push(name);
        this.currentContext = name;
    }
};

InputManager.prototype.popInputContext = function() {
    if (this.contextStack.length > 1) {
        this.contextStack.pop();
        this.currentContext = this.contextStack[this.contextStack.length - 1];
    }
};

InputManager.prototype.setInputContext = function(name) {
    if (this.inputContexts.has(name)) {
        this.currentContext = name;
        this.contextStack = [name];
    }
};

InputManager.prototype.addToInputBuffer = function(type, input) {
    this.inputBuffer.push({
        type: type,
        input: input,
        timestamp: Date.now()
    });
    
    // Limit buffer size
    if (this.inputBuffer.length > 20) {
        this.inputBuffer.shift();
    }
};

InputManager.prototype.updateInputBuffer = function(dt) {
    const currentTime = Date.now();
    
    // Remove old inputs
    this.inputBuffer = this.inputBuffer.filter(input => 
        currentTime - input.timestamp < this.maxBufferTime
    );
};

InputManager.prototype.addComboSequence = function(name, sequence, callback) {
    this.comboSequences.set(name, {
        sequence: sequence,
        callback: callback,
        currentIndex: 0,
        lastInputTime: 0
    });
};

InputManager.prototype.checkComboSequences = function(action) {
    const currentTime = Date.now();
    
    this.comboSequences.forEach((combo, name) => {
        const expectedAction = combo.sequence[combo.currentIndex];
        
        if (action === expectedAction) {
            combo.currentIndex++;
            combo.lastInputTime = currentTime;
            
            if (combo.currentIndex >= combo.sequence.length) {
                // Combo completed
                combo.callback();
                combo.currentIndex = 0;
            }
        } else {
            // Reset combo if wrong input or timeout
            if (currentTime - combo.lastInputTime > 1000) {
                combo.currentIndex = 0;
            }
        }
    });
};

InputManager.prototype.startKeyRepeat = function(key) {
    this.keyRepeatStates.set(key, {
        active: true,
        nextRepeatTime: Date.now() + this.keyRepeatDelay * 1000,
        repeatInterval: this.keyRepeatRate * 1000
    });
};

InputManager.prototype.stopKeyRepeat = function(key) {
    this.keyRepeatStates.delete(key);
};

InputManager.prototype.updateKeyRepeat = function(dt) {
    const currentTime = Date.now();
    
    this.keyRepeatStates.forEach((repeatState, key) => {
        if (currentTime >= repeatState.nextRepeatTime) {
            // Fire repeat event
            this.checkKeyBindings(key, true);
            
            // Schedule next repeat
            repeatState.nextRepeatTime = currentTime + repeatState.repeatInterval;
        }
    });
};

InputManager.prototype.requestPointerLock = function() {
    const canvas = this.app.graphicsDevice.canvas;
    if (canvas.requestPointerLock) {
        canvas.requestPointerLock();
    }
};

InputManager.prototype.exitPointerLock = function() {
    if (document.exitPointerLock) {
        document.exitPointerLock();
    }
};

InputManager.prototype.onPointerLockChange = function() {
    this.isMouseLocked = document.pointerLockElement === this.app.graphicsDevice.canvas;
    this.fireInputAction('pointerLockChange', { locked: this.isMouseLocked });
};

InputManager.prototype.onPointerLockError = function() {
    console.error('Pointer lock request failed');
    this.fireInputAction('pointerLockError', {});
};

InputManager.prototype.processTouchGestures = function(phase, event) {
    const touchCount = event.touches.length;
    
    if (touchCount === 1) {
        this.processSingleTouchGestures(phase, event.touches[0]);
    } else if (touchCount === 2) {
        this.processTwoTouchGestures(phase, event.touches);
    }
};

InputManager.prototype.processSingleTouchGestures = function(phase, touch) {
    switch (phase) {
        case 'start':
            this.touchGestures.tap.active = true;
            this.touchGestures.tap.startTime = Date.now();
            this.touchGestures.tap.position.set(touch.x, touch.y);
            
            this.touchGestures.hold.active = true;
            this.touchGestures.hold.startTime = Date.now();
            this.touchGestures.hold.position.set(touch.x, touch.y);
            break;
            
        case 'end':
            const tapDuration = Date.now() - this.touchGestures.tap.startTime;
            if (this.touchGestures.tap.active && tapDuration < 300) {
                this.fireInputAction('tap', { position: this.touchGestures.tap.position });
            }
            
            this.touchGestures.tap.active = false;
            this.touchGestures.hold.active = false;
            break;
    }
};

InputManager.prototype.processTwoTouchGestures = function(phase, touches) {
    if (phase === 'start') {
        const touch1 = touches[0];
        const touch2 = touches[1];
        const distance = Math.sqrt(
            Math.pow(touch2.x - touch1.x, 2) + 
            Math.pow(touch2.y - touch1.y, 2)
        );
        
        this.touchGestures.pinch.active = true;
        this.touchGestures.pinch.startDistance = distance;
        this.touchGestures.pinch.currentDistance = distance;
    }
};

InputManager.prototype.updateTouchGestures = function(dt) {
    // Check for hold gesture
    if (this.touchGestures.hold.active) {
        const holdDuration = Date.now() - this.touchGestures.hold.startTime;
        if (holdDuration > 1000) { // 1 second hold
            this.fireInputAction('hold', { 
                position: this.touchGestures.hold.position,
                duration: holdDuration 
            });
            this.touchGestures.hold.active = false;
        }
    }
};

InputManager.prototype.resetTouchGestures = function() {
    Object.keys(this.touchGestures).forEach(gesture => {
        this.touchGestures[gesture].active = false;
    });
};

InputManager.prototype.startMacroRecording = function(name) {
    this.recordingMacro = {
        name: name,
        inputs: [],
        startTime: Date.now()
    };
};

InputManager.prototype.stopMacroRecording = function() {
    if (this.recordingMacro) {
        this.macros.set(this.recordingMacro.name, {
            inputs: this.recordingMacro.inputs,
            duration: Date.now() - this.recordingMacro.startTime
        });
        
        this.recordingMacro = null;
        return true;
    }
    return false;
};

InputManager.prototype.playMacro = function(name) {
    const macro = this.macros.get(name);
    if (!macro) return false;
    
    const startTime = Date.now();
    
    macro.inputs.forEach(input => {
        setTimeout(() => {
            if (input.type === 'keydown') {
                this.simulateKeyPress(input.key);
            } else if (input.type === 'keyup') {
                this.simulateKeyRelease(input.key);
            }
        }, input.timestamp - macro.inputs[0].timestamp);
    });
    
    return true;
};

InputManager.prototype.simulateKeyPress = function(key) {
    this.onKeyDown({ key: key });
};

InputManager.prototype.simulateKeyRelease = function(key) {
    this.onKeyUp({ key: key });
};

InputManager.prototype.vibrateGamepad = function(gamepadIndex, intensity = 1.0, duration = 200) {
    if (!this.enableVibration) return;
    
    const gamepad = navigator.getGamepads()[gamepadIndex];
    if (gamepad && gamepad.vibrationActuator) {
        gamepad.vibrationActuator.playEffect('dual-rumble', {
            startDelay: 0,
            duration: duration,
            weakMagnitude: intensity * 0.5,
            strongMagnitude: intensity
        });
    }
};

InputManager.prototype.isActionPressed = function(action, context = null) {
    const ctx = context ? this.inputContexts.get(context) : this.inputContexts.get(this.currentContext);
    if (!ctx) return false;
    
    // Check key bindings
    const boundKey = ctx.keyBindings.get(action);
    if (boundKey && this.keyStates.has(boundKey)) {
        return this.keyStates.get(boundKey).pressed;
    }
    
    // Check mouse bindings
    const boundMouse = ctx.mouseBindings.get(action);
    if (boundMouse && this.mouseStates.has(boundMouse)) {
        return this.mouseStates.get(boundMouse).pressed;
    }
    
    // Check gamepad bindings
    const boundGamepad = ctx.gamepadBindings.get(action);
    if (boundGamepad !== undefined) {
        for (const [index, gamepadState] of this.connectedGamepads) {
            if (gamepadState.buttons[boundGamepad]) {
                return true;
            }
        }
    }
    
    return false;
};

InputManager.prototype.wasActionJustPressed = function(action, context = null) {
    const ctx = context ? this.inputContexts.get(context) : this.inputContexts.get(this.currentContext);
    if (!ctx) return false;
    
    const boundKey = ctx.keyBindings.get(action);
    if (boundKey && this.keyStates.has(boundKey)) {
        const keyState = this.keyStates.get(boundKey);
        if (keyState.justPressed) {
            keyState.justPressed = false; // Reset flag
            return true;
        }
    }
    
    const boundMouse = ctx.mouseBindings.get(action);
    if (boundMouse && this.mouseStates.has(boundMouse)) {
        const mouseState = this.mouseStates.get(boundMouse);
        if (mouseState.justPressed) {
            mouseState.justPressed = false; // Reset flag
            return true;
        }
    }
    
    return false;
};

InputManager.prototype.getMouseDelta = function() {
    const delta = this.mouseDelta.clone();
    this.mouseDelta.set(0, 0); // Reset delta
    return delta;
};

InputManager.prototype.getGamepadAxis = function(gamepadIndex, axis) {
    const gamepadState = this.connectedGamepads.get(gamepadIndex);
    return gamepadState ? gamepadState.axes[axis] || 0 : 0;
};

InputManager.prototype.saveBindings = function() {
    const bindings = {};
    this.inputContexts.forEach((context, name) => {
        bindings[name] = {
            keys: Object.fromEntries(context.keyBindings),
            mouse: Object.fromEntries(context.mouseBindings),
            gamepad: Object.fromEntries(context.gamepadBindings)
        };
    });
    
    localStorage.setItem('inputBindings', JSON.stringify(bindings));
};

InputManager.prototype.loadBindings = function() {
    const saved = localStorage.getItem('inputBindings');
    if (!saved) return;
    
    try {
        const bindings = JSON.parse(saved);
        Object.entries(bindings).forEach(([contextName, contextBindings]) => {
            const context = this.inputContexts.get(contextName);
            if (context) {
                // Load key bindings
                Object.entries(contextBindings.keys || {}).forEach(([action, key]) => {
                    context.keyBindings.set(action, key);
                });
                
                // Load mouse bindings
                Object.entries(contextBindings.mouse || {}).forEach(([action, button]) => {
                    context.mouseBindings.set(action, button);
                });
                
                // Load gamepad bindings
                Object.entries(contextBindings.gamepad || {}).forEach(([action, button]) => {
                    context.gamepadBindings.set(action, button);
                });
            }
        });
    } catch (e) {
        console.error('Failed to load input bindings:', e);
    }
};

InputManager.prototype.getInputStats = function() {
    return {
        currentContext: this.currentContext,
        contextStack: this.contextStack.slice(),
        connectedGamepads: this.connectedGamepads.size,
        activeTouches: this.touches.size,
        inputBufferSize: this.inputBuffer.length,
        isMouseLocked: this.isMouseLocked,
        recordingMacro: !!this.recordingMacro,
        macroCount: this.macros.size
    };
};