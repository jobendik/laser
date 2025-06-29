var SettingsManager = pc.createScript('settingsManager');

SettingsManager.attributes.add('autoSave', { type: 'boolean', default: true });
SettingsManager.attributes.add('saveInterval', { type: 'number', default: 30 }); // seconds
SettingsManager.attributes.add('settingsVersion', { type: 'string', default: '1.0' });

SettingsManager.prototype.initialize = function() {
    // Settings categories
    this.settings = {
        graphics: {
            resolution: { value: [1920, 1080], type: 'array', category: 'Graphics', label: 'Resolution' },
            quality: { value: 'high', type: 'string', category: 'Graphics', label: 'Quality Preset', options: ['low', 'medium', 'high', 'ultra'] },
            fullscreen: { value: false, type: 'boolean', category: 'Graphics', label: 'Fullscreen' },
            vsync: { value: true, type: 'boolean', category: 'Graphics', label: 'V-Sync' },
            fpsLimit: { value: 144, type: 'number', category: 'Graphics', label: 'FPS Limit', min: 30, max: 240 },
            antiAliasing: { value: 'msaa_4x', type: 'string', category: 'Graphics', label: 'Anti-Aliasing', options: ['none', 'fxaa', 'msaa_2x', 'msaa_4x', 'msaa_8x'] },
            shadows: { value: 'high', type: 'string', category: 'Graphics', label: 'Shadow Quality', options: ['off', 'low', 'medium', 'high', 'ultra'] },
            textures: { value: 'high', type: 'string', category: 'Graphics', label: 'Texture Quality', options: ['low', 'medium', 'high', 'ultra'] },
            effects: { value: 'high', type: 'string', category: 'Graphics', label: 'Effects Quality', options: ['low', 'medium', 'high', 'ultra'] },
            postProcessing: { value: true, type: 'boolean', category: 'Graphics', label: 'Post Processing' },
            bloom: { value: true, type: 'boolean', category: 'Graphics', label: 'Bloom' },
            ssao: { value: false, type: 'boolean', category: 'Graphics', label: 'SSAO' },
            motionBlur: { value: false, type: 'boolean', category: 'Graphics', label: 'Motion Blur' },
            fieldOfView: { value: 75, type: 'number', category: 'Graphics', label: 'Field of View', min: 60, max: 120 }
        },
        
        audio: {
            masterVolume: { value: 100, type: 'number', category: 'Audio', label: 'Master Volume', min: 0, max: 100 },
            musicVolume: { value: 70, type: 'number', category: 'Audio', label: 'Music Volume', min: 0, max: 100 },
            sfxVolume: { value: 100, type: 'number', category: 'Audio', label: 'SFX Volume', min: 0, max: 100 },
            voiceVolume: { value: 80, type: 'number', category: 'Audio', label: 'Voice Volume', min: 0, max: 100 },
            voiceChat: { value: true, type: 'boolean', category: 'Audio', label: 'Voice Chat' },
            pushToTalk: { value: false, type: 'boolean', category: 'Audio', label: 'Push to Talk' },
            audioQuality: { value: 'high', type: 'string', category: 'Audio', label: 'Audio Quality', options: ['low', 'medium', 'high'] },
            spatialAudio: { value: true, type: 'boolean', category: 'Audio', label: '3D Audio' },
            dynamicRange: { value: false, type: 'boolean', category: 'Audio', label: 'Dynamic Range Compression' }
        },
        
        controls: {
            mouseSensitivity: { value: 1.0, type: 'number', category: 'Controls', label: 'Mouse Sensitivity', min: 0.1, max: 5.0, step: 0.1 },
            aimSensitivity: { value: 0.8, type: 'number', category: 'Controls', label: 'ADS Sensitivity', min: 0.1, max: 3.0, step: 0.1 },
            invertMouseY: { value: false, type: 'boolean', category: 'Controls', label: 'Invert Mouse Y' },
            toggleAim: { value: false, type: 'boolean', category: 'Controls', label: 'Toggle Aim' },
            toggleCrouch: { value: false, type: 'boolean', category: 'Controls', label: 'Toggle Crouch' },
            autoRun: { value: false, type: 'boolean', category: 'Controls', label: 'Auto Run' },
            mouseAcceleration: { value: false, type: 'boolean', category: 'Controls', label: 'Mouse Acceleration' },
            mouseRawInput: { value: true, type: 'boolean', category: 'Controls', label: 'Raw Mouse Input' }
        },
        
        gameplay: {
            crosshairStyle: { value: 'default', type: 'string', category: 'Gameplay', label: 'Crosshair Style', options: ['default', 'dot', 'cross', 'circle', 'custom'] },
            crosshairColor: { value: '#00FF00', type: 'color', category: 'Gameplay', label: 'Crosshair Color' },
            crosshairOpacity: { value: 100, type: 'number', category: 'Gameplay', label: 'Crosshair Opacity', min: 0, max: 100 },
            showFPS: { value: false, type: 'boolean', category: 'Gameplay', label: 'Show FPS' },
            showPing: { value: true, type: 'boolean', category: 'Gameplay', label: 'Show Ping' },
            killFeedDuration: { value: 8, type: 'number', category: 'Gameplay', label: 'Kill Feed Duration (s)', min: 3, max: 15 },
            damageNumbers: { value: true, type: 'boolean', category: 'Gameplay', label: 'Damage Numbers' },
            hitMarkers: { value: true, type: 'boolean', category: 'Gameplay', label: 'Hit Markers' },
            autoPickupWeapons: { value: false, type: 'boolean', category: 'Gameplay', label: 'Auto Pickup Weapons' },
            autoReload: { value: false, type: 'boolean', category: 'Gameplay', label: 'Auto Reload' },
            spectatorMode: { value: 'free', type: 'string', category: 'Gameplay', label: 'Spectator Mode', options: ['free', 'follow', 'fixed'] }
        },
        
        interface: {
            uiScale: { value: 1.0, type: 'number', category: 'Interface', label: 'UI Scale', min: 0.5, max: 2.0, step: 0.1 },
            hudOpacity: { value: 100, type: 'number', category: 'Interface', label: 'HUD Opacity', min: 50, max: 100 },
            minimapSize: { value: 150, type: 'number', category: 'Interface', label: 'Minimap Size', min: 100, max: 300 },
            minimapOpacity: { value: 80, type: 'number', category: 'Interface', label: 'Minimap Opacity', min: 20, max: 100 },
            chatOpacity: { value: 80, type: 'number', category: 'Interface', label: 'Chat Opacity', min: 20, max: 100 },
            scoreboardStyle: { value: 'detailed', type: 'string', category: 'Interface', label: 'Scoreboard Style', options: ['simple', 'detailed', 'compact'] },
            language: { value: 'en', type: 'string', category: 'Interface', label: 'Language', options: ['en', 'es', 'fr', 'de', 'pt', 'ru', 'ja', 'ko', 'zh'] },
            colorBlindMode: { value: 'none', type: 'string', category: 'Interface', label: 'Colorblind Mode', options: ['none', 'protanopia', 'deuteranopia', 'tritanopia'] }
        },
        
        network: {
            maxPing: { value: 150, type: 'number', category: 'Network', label: 'Max Ping (ms)', min: 50, max: 500 },
            region: { value: 'auto', type: 'string', category: 'Network', label: 'Preferred Region', options: ['auto', 'na-east', 'na-west', 'eu-west', 'eu-east', 'asia-pacific', 'south-america'] },
            downloadRate: { value: 'unlimited', type: 'string', category: 'Network', label: 'Download Rate', options: ['128kb', '256kb', '512kb', '1mb', '2mb', 'unlimited'] },
            uploadRate: { value: 'unlimited', type: 'string', category: 'Network', label: 'Upload Rate', options: ['64kb', '128kb', '256kb', '512kb', '1mb', 'unlimited'] },
            packetLoss: { value: 5, type: 'number', category: 'Network', label: 'Max Packet Loss %', min: 0, max: 20 },
            interpolation: { value: true, type: 'boolean', category: 'Network', label: 'Client Interpolation' },
            prediction: { value: true, type: 'boolean', category: 'Network', label: 'Client Prediction' }
        },
        
        accessibility: {
            subtitles: { value: false, type: 'boolean', category: 'Accessibility', label: 'Subtitles' },
            subtitleSize: { value: 'medium', type: 'string', category: 'Accessibility', label: 'Subtitle Size', options: ['small', 'medium', 'large', 'extra-large'] },
            highContrast: { value: false, type: 'boolean', category: 'Accessibility', label: 'High Contrast' },
            reduceMotion: { value: false, type: 'boolean', category: 'Accessibility', label: 'Reduce Motion' },
            screenReader: { value: false, type: 'boolean', category: 'Accessibility', label: 'Screen Reader Support' },
            largeText: { value: false, type: 'boolean', category: 'Accessibility', label: 'Large Text' }
        }
    };
    
    // Key bindings stored separately
    this.keyBindings = {
        moveForward: { key: 'W', category: 'Movement', label: 'Move Forward' },
        moveBackward: { key: 'S', category: 'Movement', label: 'Move Backward' },
        moveLeft: { key: 'A', category: 'Movement', label: 'Move Left' },
        moveRight: { key: 'D', category: 'Movement', label: 'Move Right' },
        jump: { key: 'Space', category: 'Movement', label: 'Jump' },
        crouch: { key: 'C', category: 'Movement', label: 'Crouch' },
        run: { key: 'Shift', category: 'Movement', label: 'Run' },
        walk: { key: 'Ctrl', category: 'Movement', label: 'Walk' },
        
        fire: { key: 'Mouse1', category: 'Combat', label: 'Fire' },
        aim: { key: 'Mouse2', category: 'Combat', label: 'Aim Down Sights' },
        reload: { key: 'R', category: 'Combat', label: 'Reload' },
        melee: { key: 'V', category: 'Combat', label: 'Melee Attack' },
        grenade: { key: 'G', category: 'Combat', label: 'Throw Grenade' },
        
        weapon1: { key: '1', category: 'Weapons', label: 'Primary Weapon' },
        weapon2: { key: '2', category: 'Weapons', label: 'Secondary Weapon' },
        weapon3: { key: '3', category: 'Weapons', label: 'Melee Weapon' },
        weapon4: { key: '4', category: 'Weapons', label: 'Grenade' },
        nextWeapon: { key: 'Q', category: 'Weapons', label: 'Next Weapon' },
        prevWeapon: { key: 'MouseWheel', category: 'Weapons', label: 'Previous Weapon' },
        
        use: { key: 'E', category: 'Interaction', label: 'Use/Interact' },
        pickup: { key: 'F', category: 'Interaction', label: 'Pickup Item' },
        drop: { key: 'G', category: 'Interaction', label: 'Drop Weapon' },
        
        scoreboard: { key: 'Tab', category: 'Interface', label: 'Scoreboard' },
        chat: { key: 'T', category: 'Interface', label: 'Chat' },
        teamChat: { key: 'Y', category: 'Interface', label: 'Team Chat' },
        menu: { key: 'Escape', category: 'Interface', label: 'Menu' },
        map: { key: 'M', category: 'Interface', label: 'Map' },
        inventory: { key: 'I', category: 'Interface', label: 'Inventory' },
        
        pushToTalk: { key: 'Mouse4', category: 'Communication', label: 'Push to Talk' },
        voiceChat: { key: 'V', category: 'Communication', label: 'Voice Chat Toggle' },
        
        screenshot: { key: 'F12', category: 'Utility', label: 'Screenshot' },
        console: { key: '`', category: 'Utility', label: 'Console' },
        perfStats: { key: 'F11', category: 'Utility', label: 'Performance Stats' }
    };
    
    // Settings state
    this.hasUnsavedChanges = false;
    this.lastSaveTime = 0;
    this.settingsLoaded = false;
    
    // Validation rules
    this.validationRules = new Map();
    
    // Settings presets
    this.presets = {
        graphics: {
            'Low': { quality: 'low', shadows: 'low', textures: 'low', effects: 'low', postProcessing: false, bloom: false, ssao: false },
            'Medium': { quality: 'medium', shadows: 'medium', textures: 'medium', effects: 'medium', postProcessing: true, bloom: true, ssao: false },
            'High': { quality: 'high', shadows: 'high', textures: 'high', effects: 'high', postProcessing: true, bloom: true, ssao: true },
            'Ultra': { quality: 'ultra', shadows: 'ultra', textures: 'ultra', effects: 'ultra', postProcessing: true, bloom: true, ssao: true }
        }
    };
    
    // Setup validation rules
    this.initializeValidation();
    
    // Load settings
    this.loadSettings();
    
    // Setup auto-save
    if (this.autoSave) {
        this.setupAutoSave();
    }
    
    // Bind events
    this.app.on('settings:get', this.getSetting, this);
    this.app.on('settings:set', this.setSetting, this);
    this.app.on('settings:save', this.saveSettings, this);
    this.app.on('settings:load', this.loadSettings, this);
    this.app.on('settings:reset', this.resetSettings, this);
    this.app.on('settings:apply', this.applySettings, this);
    this.app.on('settings:validate', this.validateSetting, this);
    this.app.on('settings:getKeyBinding', this.getKeyBinding, this);
    this.app.on('settings:setKeyBinding', this.setKeyBinding, this);
    this.app.on('settings:applyPreset', this.applyPreset, this);
    
    console.log('SettingsManager initialized');
};

SettingsManager.prototype.initializeValidation = function() {
    // Add validation rules for specific settings
    this.validationRules.set('graphics.fpsLimit', (value) => {
        return value >= 30 && value <= 240;
    });
    
    this.validationRules.set('audio.masterVolume', (value) => {
        return value >= 0 && value <= 100;
    });
    
    this.validationRules.set('controls.mouseSensitivity', (value) => {
        return value >= 0.1 && value <= 5.0;
    });
    
    this.validationRules.set('graphics.resolution', (value) => {
        return Array.isArray(value) && value.length === 2 && value[0] > 0 && value[1] > 0;
    });
};

SettingsManager.prototype.update = function(dt) {
    // Auto-save check
    if (this.autoSave && this.hasUnsavedChanges) {
        const currentTime = Date.now();
        if (currentTime - this.lastSaveTime >= this.saveInterval * 1000) {
            this.saveSettings();
        }
    }
};

SettingsManager.prototype.getSetting = function(data) {
    const { category, key, callback } = data;
    const setting = this.getSettingValue(category, key);
    
    if (callback) {
        callback(setting);
    }
    
    return setting;
};

SettingsManager.prototype.getSettingValue = function(category, key) {
    if (this.settings[category] && this.settings[category][key]) {
        return this.settings[category][key].value;
    }
    return null;
};

SettingsManager.prototype.setSetting = function(data) {
    const { category, key, value, skipValidation = false } = data;
    
    if (!this.settings[category] || !this.settings[category][key]) {
        console.error('Invalid setting:', category, key);
        return false;
    }
    
    // Validate setting
    if (!skipValidation && !this.validateSetting({ category, key, value }).isValid) {
        console.error('Invalid setting value:', category, key, value);
        return false;
    }
    
    // Update setting
    const oldValue = this.settings[category][key].value;
    this.settings[category][key].value = value;
    
    // Mark as changed
    this.hasUnsavedChanges = true;
    
    // Fire change event
    this.app.fire('settings:changed', {
        category: category,
        key: key,
        oldValue: oldValue,
        newValue: value
    });
    
    // Apply setting immediately if needed
    this.applySpecificSetting(category, key, value);
    
    return true;
};

SettingsManager.prototype.validateSetting = function(data) {
    const { category, key, value } = data;
    const fullKey = `${category}.${key}`;
    
    // Check if validation rule exists
    if (this.validationRules.has(fullKey)) {
        const isValid = this.validationRules.get(fullKey)(value);
        return { isValid: isValid, error: isValid ? null : 'Validation failed' };
    }
    
    // Default validation based on setting type
    const setting = this.settings[category]?.[key];
    if (!setting) {
        return { isValid: false, error: 'Setting not found' };
    }
    
    switch (setting.type) {
        case 'number':
            const isNumber = typeof value === 'number' && !isNaN(value);
            const inRange = !setting.min || !setting.max || (value >= setting.min && value <= setting.max);
            return { isValid: isNumber && inRange, error: isNumber && inRange ? null : 'Invalid number or out of range' };
            
        case 'boolean':
            return { isValid: typeof value === 'boolean', error: typeof value === 'boolean' ? null : 'Must be boolean' };
            
        case 'string':
            const isString = typeof value === 'string';
            const inOptions = !setting.options || setting.options.includes(value);
            return { isValid: isString && inOptions, error: isString && inOptions ? null : 'Invalid string option' };
            
        case 'array':
            return { isValid: Array.isArray(value), error: Array.isArray(value) ? null : 'Must be array' };
            
        case 'color':
            const colorRegex = /^#[0-9A-F]{6}$/i;
            return { isValid: colorRegex.test(value), error: colorRegex.test(value) ? null : 'Invalid color format' };
            
        default:
            return { isValid: true, error: null };
    }
};

SettingsManager.prototype.applySpecificSetting = function(category, key, value) {
    // Apply settings that need immediate effect
    switch (`${category}.${key}`) {
        case 'audio.masterVolume':
        case 'audio.musicVolume':
        case 'audio.sfxVolume':
        case 'audio.voiceVolume':
            this.app.fire('audio:setVolume', { type: key.replace('Volume', ''), volume: value / 100 });
            break;
            
        case 'graphics.quality':
            this.applyPreset({ category: 'graphics', preset: value });
            break;
            
        case 'graphics.fpsLimit':
            this.app.fire('performance:setTargetFrameRate', value);
            break;
            
        case 'controls.mouseSensitivity':
            this.app.fire('input:setMouseSensitivity', value);
            break;
            
        case 'interface.language':
            this.app.fire('localization:setLanguage', value);
            break;
    }
};

SettingsManager.prototype.applySettings = function() {
    // Apply all settings to their respective systems
    
    // Graphics settings
    this.app.fire('graphics:applySettings', {
        resolution: this.getSettingValue('graphics', 'resolution'),
        quality: this.getSettingValue('graphics', 'quality'),
        fullscreen: this.getSettingValue('graphics', 'fullscreen'),
        vsync: this.getSettingValue('graphics', 'vsync'),
        antiAliasing: this.getSettingValue('graphics', 'antiAliasing'),
        shadows: this.getSettingValue('graphics', 'shadows'),
        textures: this.getSettingValue('graphics', 'textures'),
        effects: this.getSettingValue('graphics', 'effects'),
        postProcessing: this.getSettingValue('graphics', 'postProcessing'),
        bloom: this.getSettingValue('graphics', 'bloom'),
        ssao: this.getSettingValue('graphics', 'ssao'),
        motionBlur: this.getSettingValue('graphics', 'motionBlur'),
        fieldOfView: this.getSettingValue('graphics', 'fieldOfView')
    });
    
    // Audio settings
    this.app.fire('audio:applySettings', {
        masterVolume: this.getSettingValue('audio', 'masterVolume') / 100,
        musicVolume: this.getSettingValue('audio', 'musicVolume') / 100,
        sfxVolume: this.getSettingValue('audio', 'sfxVolume') / 100,
        voiceVolume: this.getSettingValue('audio', 'voiceVolume') / 100,
        spatialAudio: this.getSettingValue('audio', 'spatialAudio'),
        dynamicRange: this.getSettingValue('audio', 'dynamicRange')
    });
    
    // Control settings
    this.app.fire('input:applySettings', {
        mouseSensitivity: this.getSettingValue('controls', 'mouseSensitivity'),
        aimSensitivity: this.getSettingValue('controls', 'aimSensitivity'),
        invertMouseY: this.getSettingValue('controls', 'invertMouseY'),
        mouseAcceleration: this.getSettingValue('controls', 'mouseAcceleration'),
        mouseRawInput: this.getSettingValue('controls', 'mouseRawInput')
    });
    
    // Gameplay settings
    this.app.fire('gameplay:applySettings', {
        crosshairStyle: this.getSettingValue('gameplay', 'crosshairStyle'),
        crosshairColor: this.getSettingValue('gameplay', 'crosshairColor'),
        crosshairOpacity: this.getSettingValue('gameplay', 'crosshairOpacity'),
        showFPS: this.getSettingValue('gameplay', 'showFPS'),
        showPing: this.getSettingValue('gameplay', 'showPing'),
        damageNumbers: this.getSettingValue('gameplay', 'damageNumbers'),
        hitMarkers: this.getSettingValue('gameplay', 'hitMarkers'),
        autoPickupWeapons: this.getSettingValue('gameplay', 'autoPickupWeapons'),
        autoReload: this.getSettingValue('gameplay', 'autoReload')
    });
    
    // Interface settings
    this.app.fire('ui:applySettings', {
        uiScale: this.getSettingValue('interface', 'uiScale'),
        hudOpacity: this.getSettingValue('interface', 'hudOpacity'),
        minimapSize: this.getSettingValue('interface', 'minimapSize'),
        minimapOpacity: this.getSettingValue('interface', 'minimapOpacity'),
        chatOpacity: this.getSettingValue('interface', 'chatOpacity'),
        language: this.getSettingValue('interface', 'language'),
        colorBlindMode: this.getSettingValue('interface', 'colorBlindMode')
    });
    
    // Apply key bindings
    this.applyKeyBindings();
    
    console.log('All settings applied');
};

SettingsManager.prototype.saveSettings = function() {
    try {
        const settingsData = {
            version: this.settingsVersion,
            timestamp: Date.now(),
            settings: {},
            keyBindings: this.keyBindings
        };
        
        // Extract setting values
        Object.keys(this.settings).forEach(category => {
            settingsData.settings[category] = {};
            Object.keys(this.settings[category]).forEach(key => {
                settingsData.settings[category][key] = this.settings[category][key].value;
            });
        });
        
        localStorage.setItem('gameSettings', JSON.stringify(settingsData));
        
        this.hasUnsavedChanges = false;
        this.lastSaveTime = Date.now();
        
        this.app.fire('settings:saved', settingsData);
        
        console.log('Settings saved successfully');
        return true;
    } catch (error) {
        console.error('Failed to save settings:', error);
        return false;
    }
};

SettingsManager.prototype.loadSettings = function() {
    try {
        const savedData = localStorage.getItem('gameSettings');
        if (!savedData) {
            console.log('No saved settings found, using defaults');
            this.settingsLoaded = true;
            this.applySettings();
            return false;
        }
        
        const settingsData = JSON.parse(savedData);
        
        // Check version compatibility
        if (settingsData.version !== this.settingsVersion) {
            console.warn('Settings version mismatch, migrating...');
            this.migrateSettings(settingsData);
        }
        
        // Load settings
        if (settingsData.settings) {
            Object.keys(settingsData.settings).forEach(category => {
                if (this.settings[category]) {
                    Object.keys(settingsData.settings[category]).forEach(key => {
                        if (this.settings[category][key]) {
                            const value = settingsData.settings[category][key];
                            const validation = this.validateSetting({ category, key, value });
                            
                            if (validation.isValid) {
                                this.settings[category][key].value = value;
                            } else {
                                console.warn(`Invalid setting loaded: ${category}.${key}`, validation.error);
                            }
                        }
                    });
                }
            });
        }
        
        // Load key bindings
        if (settingsData.keyBindings) {
            Object.keys(settingsData.keyBindings).forEach(action => {
                if (this.keyBindings[action]) {
                    this.keyBindings[action].key = settingsData.keyBindings[action].key || this.keyBindings[action].key;
                }
            });
        }
        
        this.settingsLoaded = true;
        this.hasUnsavedChanges = false;
        
        // Apply loaded settings
        this.applySettings();
        
        this.app.fire('settings:loaded', settingsData);
        
        console.log('Settings loaded successfully');
        return true;
    } catch (error) {
        console.error('Failed to load settings:', error);
        this.settingsLoaded = true;
        this.applySettings();
        return false;
    }
};

SettingsManager.prototype.migrateSettings = function(oldSettings) {
    // Handle settings migration between versions
    console.log('Migrating settings from version', oldSettings.version, 'to', this.settingsVersion);
    
    // Example migration logic
    if (oldSettings.version === '0.9') {
        // Migrate old setting names or structures
        if (oldSettings.settings.video) {
            oldSettings.settings.graphics = oldSettings.settings.video;
            delete oldSettings.settings.video;
        }
    }
    
    oldSettings.version = this.settingsVersion;
};

SettingsManager.prototype.resetSettings = function(data = {}) {
    const { category = null, confirm = false } = data;
    
    if (!confirm) {
        this.app.fire('settings:resetRequested', { category });
        return;
    }
    
    if (category) {
        // Reset specific category
        Object.keys(this.settings[category]).forEach(key => {
            // Reset to default value (would need to store defaults separately)
            this.resetSettingToDefault(category, key);
        });
        
        console.log(`Reset ${category} settings to defaults`);
    } else {
        // Reset all settings
        Object.keys(this.settings).forEach(cat => {
            Object.keys(this.settings[cat]).forEach(key => {
                this.resetSettingToDefault(cat, key);
            });
        });
        
        // Reset key bindings
        this.resetKeyBindingsToDefault();
        
        console.log('Reset all settings to defaults');
    }
    
    this.hasUnsavedChanges = true;
    this.applySettings();
    
    this.app.fire('settings:reset', { category });
};

SettingsManager.prototype.resetSettingToDefault = function(category, key) {
    // This would reset to stored default values
    // For now, we'll implement basic defaults
    const setting = this.settings[category][key];
    
    switch (setting.type) {
        case 'boolean':
            setting.value = false;
            break;
        case 'number':
            setting.value = setting.min || 0;
            break;
        case 'string':
            setting.value = setting.options ? setting.options[0] : '';
            break;
        case 'array':
            setting.value = [];
            break;
    }
};

SettingsManager.prototype.resetKeyBindingsToDefault = function() {
    // Reset to default key bindings
    const defaults = {
        moveForward: 'W', moveBackward: 'S', moveLeft: 'A', moveRight: 'D',
        jump: 'Space', crouch: 'C', run: 'Shift', walk: 'Ctrl',
        fire: 'Mouse1', aim: 'Mouse2', reload: 'R', melee: 'V', grenade: 'G',
        weapon1: '1', weapon2: '2', weapon3: '3', weapon4: '4',
        nextWeapon: 'Q', prevWeapon: 'MouseWheel',
        use: 'E', pickup: 'F', drop: 'G',
        scoreboard: 'Tab', chat: 'T', teamChat: 'Y', menu: 'Escape'
    };
    
    Object.keys(defaults).forEach(action => {
        if (this.keyBindings[action]) {
            this.keyBindings[action].key = defaults[action];
        }
    });
};

SettingsManager.prototype.applyPreset = function(data) {
    const { category, preset } = data;
    
    if (!this.presets[category] || !this.presets[category][preset]) {
        console.error('Invalid preset:', category, preset);
        return false;
    }
    
    const presetSettings = this.presets[category][preset];
    
    Object.keys(presetSettings).forEach(key => {
        this.setSetting({
            category: category,
            key: key,
            value: presetSettings[key],
            skipValidation: false
        });
    });
    
    this.app.fire('settings:presetApplied', { category, preset });
    
    console.log(`Applied ${category} preset: ${preset}`);
    return true;
};

SettingsManager.prototype.getKeyBinding = function(data) {
    const { action, callback } = data;
    const binding = this.keyBindings[action];
    
    if (callback) {
        callback(binding);
    }
    
    return binding;
};

SettingsManager.prototype.setKeyBinding = function(data) {
    const { action, key } = data;
    
    if (!this.keyBindings[action]) {
        console.error('Invalid action:', action);
        return false;
    }
    
    // Check for conflicts
    const conflict = this.findKeyBindingConflict(key, action);
    if (conflict) {
        this.app.fire('settings:keyConflict', { action, key, conflict });
        return false;
    }
    
    const oldKey = this.keyBindings[action].key;
    this.keyBindings[action].key = key;
    
    this.hasUnsavedChanges = true;
    
    this.app.fire('settings:keyBindingChanged', {
        action: action,
        oldKey: oldKey,
        newKey: key
    });
    
    return true;
};

SettingsManager.prototype.findKeyBindingConflict = function(key, excludeAction) {
    for (const [action, binding] of Object.entries(this.keyBindings)) {
        if (action !== excludeAction && binding.key === key) {
            return action;
        }
    }
    return null;
};

SettingsManager.prototype.applyKeyBindings = function() {
    // Send key bindings to input manager
    this.app.fire('input:setKeyBindings', this.keyBindings);
};

SettingsManager.prototype.setupAutoSave = function() {
    // Auto-save is handled in the update loop
    this.lastSaveTime = Date.now();
};

SettingsManager.prototype.exportSettings = function() {
    const exportData = {
        version: this.settingsVersion,
        exported: Date.now(),
        settings: {},
        keyBindings: this.keyBindings
    };
    
    // Extract setting values
    Object.keys(this.settings).forEach(category => {
        exportData.settings[category] = {};
        Object.keys(this.settings[category]).forEach(key => {
            exportData.settings[category][key] = this.settings[category][key].value;
        });
    });
    
    return JSON.stringify(exportData, null, 2);
};

SettingsManager.prototype.importSettings = function(settingsJson) {
    try {
        const importData = JSON.parse(settingsJson);
        
        // Validate import data
        if (!importData.settings || !importData.version) {
            throw new Error('Invalid settings format');
        }
        
        // Load imported settings
        Object.keys(importData.settings).forEach(category => {
            if (this.settings[category]) {
                Object.keys(importData.settings[category]).forEach(key => {
                    if (this.settings[category][key]) {
                        const value = importData.settings[category][key];
                        this.setSetting({ category, key, value });
                    }
                });
            }
        });
        
        // Load imported key bindings
        if (importData.keyBindings) {
            Object.keys(importData.keyBindings).forEach(action => {
                if (this.keyBindings[action]) {
                    this.setKeyBinding({ action, key: importData.keyBindings[action].key });
                }
            });
        }
        
        this.applySettings();
        
        this.app.fire('settings:imported', importData);
        
        return true;
    } catch (error) {
        console.error('Failed to import settings:', error);
        return false;
    }
};

SettingsManager.prototype.getSettingsSchema = function() {
    // Return settings structure for UI generation
    const schema = {};
    
    Object.keys(this.settings).forEach(category => {
        schema[category] = {};
        Object.keys(this.settings[category]).forEach(key => {
            const setting = this.settings[category][key];
            schema[category][key] = {
                type: setting.type,
                label: setting.label,
                category: setting.category,
                options: setting.options,
                min: setting.min,
                max: setting.max,
                step: setting.step,
                value: setting.value
            };
        });
    });
    
    return schema;
};

SettingsManager.prototype.getKeyBindingsSchema = function() {
    return this.keyBindings;
};

SettingsManager.prototype.hasChanges = function() {
    return this.hasUnsavedChanges;
};

SettingsManager.prototype.getVersion = function() {
    return this.settingsVersion;
};