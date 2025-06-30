/**
 * PauseMenuSystem.js
 * Manages the in-game pause menu with settings, controls, and game options
 */

class PauseMenuSystem extends pc.ScriptType {
    static get scriptName() { return 'PauseMenuSystem'; }

    initialize() {
        this.gameManager = this.app.root.findByName('Game_Manager').script.gameManager;
        this.settingsManager = this.app.root.findByName('Game_Manager').script.settingsManager;
        this.audioManager = this.app.root.findByName('Game_Manager').script.audioManager;
        this.networkManager = this.app.root.findByName('Game_Manager').script.networkManager;
        
        // Menu state
        this.isVisible = false;
        this.currentPanel = 'main';
        this.pauseKey = 'Escape';
        
        // Menu panels
        this.panels = {
            main: 'Main Menu',
            settings: 'Settings',
            graphics: 'Graphics',
            audio: 'Audio',
            controls: 'Controls',
            gameplay: 'Gameplay'
        };
        
        this.createPauseMenu();
        this.setupEventListeners();
    }

    createPauseMenu() {
        // Main pause menu container
        this.pauseMenu = document.createElement('div');
        this.pauseMenu.id = 'pause-menu';
        this.pauseMenu.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(5px);
            display: none;
            z-index: 2000;
            font-family: Arial, sans-serif;
            color: white;
        `;
        
        document.body.appendChild(this.pauseMenu);
        
        this.createMenuContent();
        this.createMenuPanels();
        this.addMenuStyles();
    }

    createMenuContent() {
        this.menuContent = document.createElement('div');
        this.menuContent.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 80%;
            max-width: 800px;
            height: 70%;
            max-height: 600px;
            background: rgba(20, 20, 20, 0.95);
            border: 2px solid #444;
            border-radius: 12px;
            display: flex;
            overflow: hidden;
        `;
        
        this.pauseMenu.appendChild(this.menuContent);
        
        this.createSidebar();
        this.createMainArea();
    }

    createSidebar() {
        this.sidebar = document.createElement('div');
        this.sidebar.style.cssText = `
            width: 250px;
            background: rgba(0, 0, 0, 0.3);
            border-right: 1px solid #666;
            padding: 20px 0;
        `;
        
        // Menu title
        const title = document.createElement('div');
        title.style.cssText = `
            font-size: 24px;
            font-weight: bold;
            text-align: center;
            margin-bottom: 30px;
            color: #fff;
        `;
        title.textContent = 'GAME PAUSED';
        
        this.sidebar.appendChild(title);
        
        // Navigation buttons
        this.createNavigationButtons();
        
        this.menuContent.appendChild(this.sidebar);
    }

    createNavigationButtons() {
        const navButtons = [
            { id: 'main', label: 'Resume Game', icon: '▶️' },
            { id: 'settings', label: 'Settings', icon: '⚙️' },
            { id: 'graphics', label: 'Graphics', icon: '🎨' },
            { id: 'audio', label: 'Audio', icon: '🔊' },
            { id: 'controls', label: 'Controls', icon: '🎮' },
            { id: 'gameplay', label: 'Gameplay', icon: '🎯' }
        ];
        
        this.navButtonElements = {};
        
        navButtons.forEach(button => {
            const buttonElement = document.createElement('button');
            buttonElement.className = 'nav-button';
            buttonElement.dataset.panel = button.id;
            buttonElement.style.cssText = `
                width: 100%;
                padding: 15px 20px;
                background: none;
                border: none;
                color: #ccc;
                text-align: left;
                font-size: 16px;
                cursor: pointer;
                transition: all 0.3s ease;
                border-left: 3px solid transparent;
            `;
            
            buttonElement.innerHTML = `
                <span style="margin-right: 10px;">${button.icon}</span>
                ${button.label}
            `;
            
            buttonElement.addEventListener('click', () => {
                if (button.id === 'main') {
                    this.resumeGame();
                } else {
                    this.showPanel(button.id);
                }
            });
            
            buttonElement.addEventListener('mouseenter', () => {
                buttonElement.style.background = 'rgba(255, 255, 255, 0.1)';
                buttonElement.style.color = '#fff';
            });
            
            buttonElement.addEventListener('mouseleave', () => {
                if (this.currentPanel !== button.id) {
                    buttonElement.style.background = 'none';
                    buttonElement.style.color = '#ccc';
                }
            });
            
            this.navButtonElements[button.id] = buttonElement;
            this.sidebar.appendChild(buttonElement);
        });
        
        // Add disconnect/quit buttons
        this.createActionButtons();
    }

    createActionButtons() {
        const actionsContainer = document.createElement('div');
        actionsContainer.style.cssText = `
            margin-top: 30px;
            padding: 0 20px;
        `;
        
        // Disconnect button (for multiplayer)
        if (this.networkManager?.isConnected()) {
            const disconnectButton = document.createElement('button');
            disconnectButton.className = 'action-button danger';
            disconnectButton.textContent = 'Disconnect';
            disconnectButton.onclick = () => this.disconnect();
            actionsContainer.appendChild(disconnectButton);
        }
        
        // Quit to main menu
        const quitButton = document.createElement('button');
        quitButton.className = 'action-button danger';
        quitButton.textContent = 'Quit to Menu';
        quitButton.onclick = () => this.quitToMenu();
        actionsContainer.appendChild(quitButton);
        
        this.sidebar.appendChild(actionsContainer);
    }

    createMainArea() {
        this.mainArea = document.createElement('div');
        this.mainArea.style.cssText = `
            flex: 1;
            padding: 30px;
            overflow-y: auto;
        `;
        
        this.menuContent.appendChild(this.mainArea);
    }

    createMenuPanels() {
        this.panelElements = {};
        
        // Settings panel
        this.panelElements.settings = this.createSettingsPanel();
        
        // Graphics panel
        this.panelElements.graphics = this.createGraphicsPanel();
        
        // Audio panel
        this.panelElements.audio = this.createAudioPanel();
        
        // Controls panel
        this.panelElements.controls = this.createControlsPanel();
        
        // Gameplay panel
        this.panelElements.gameplay = this.createGameplayPanel();
        
        // Add all panels to main area
        Object.values(this.panelElements).forEach(panel => {
            panel.style.display = 'none';
            this.mainArea.appendChild(panel);
        });
    }

    createSettingsPanel() {
        const panel = document.createElement('div');
        panel.innerHTML = `
            <h2 style="margin-bottom: 30px; color: #fff;">General Settings</h2>
            
            <div class="setting-group">
                <h3>Display</h3>
                <div class="setting-item">
                    <label>Field of View</label>
                    <input type="range" id="fov-slider" min="60" max="120" value="90" class="slider">
                    <span id="fov-value">90°</span>
                </div>
                
                <div class="setting-item">
                    <label>UI Scale</label>
                    <input type="range" id="ui-scale-slider" min="0.8" max="1.5" step="0.1" value="1.0" class="slider">
                    <span id="ui-scale-value">100%</span>
                </div>
            </div>
            
            <div class="setting-group">
                <h3>Gameplay</h3>
                <div class="setting-item">
                    <label>Show FPS Counter</label>
                    <input type="checkbox" id="show-fps" class="checkbox">
                </div>
                
                <div class="setting-item">
                    <label>Auto-Reload</label>
                    <input type="checkbox" id="auto-reload" class="checkbox">
                </div>
                
                <div class="setting-item">
                    <label>Toggle Aim</label>
                    <input type="checkbox" id="toggle-aim" class="checkbox">
                </div>
            </div>
        `;
        
        this.setupSettingsListeners(panel);
        return panel;
    }

    createGraphicsPanel() {
        const panel = document.createElement('div');
        panel.innerHTML = `
            <h2 style="margin-bottom: 30px; color: #fff;">Graphics Settings</h2>
            
            <div class="setting-group">
                <h3>Quality</h3>
                <div class="setting-item">
                    <label>Overall Quality</label>
                    <select id="overall-quality" class="select">
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="ultra">Ultra</option>
                    </select>
                </div>
                
                <div class="setting-item">
                    <label>Texture Quality</label>
                    <select id="texture-quality" class="select">
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="ultra">Ultra</option>
                    </select>
                </div>
                
                <div class="setting-item">
                    <label>Shadow Quality</label>
                    <select id="shadow-quality" class="select">
                        <option value="off">Off</option>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                    </select>
                </div>
            </div>
            
            <div class="setting-group">
                <h3>Effects</h3>
                <div class="setting-item">
                    <label>Anti-Aliasing</label>
                    <input type="checkbox" id="anti-aliasing" class="checkbox">
                </div>
                
                <div class="setting-item">
                    <label>V-Sync</label>
                    <input type="checkbox" id="vsync" class="checkbox">
                </div>
                
                <div class="setting-item">
                    <label>Motion Blur</label>
                    <input type="checkbox" id="motion-blur" class="checkbox">
                </div>
            </div>
        `;
        
        this.setupGraphicsListeners(panel);
        return panel;
    }

    createAudioPanel() {
        const panel = document.createElement('div');
        panel.innerHTML = `
            <h2 style="margin-bottom: 30px; color: #fff;">Audio Settings</h2>
            
            <div class="setting-group">
                <h3>Volume</h3>
                <div class="setting-item">
                    <label>Master Volume</label>
                    <input type="range" id="master-volume" min="0" max="100" value="100" class="slider">
                    <span id="master-volume-value">100%</span>
                </div>
                
                <div class="setting-item">
                    <label>Music Volume</label>
                    <input type="range" id="music-volume" min="0" max="100" value="80" class="slider">
                    <span id="music-volume-value">80%</span>
                </div>
                
                <div class="setting-item">
                    <label>SFX Volume</label>
                    <input type="range" id="sfx-volume" min="0" max="100" value="90" class="slider">
                    <span id="sfx-volume-value">90%</span>
                </div>
                
                <div class="setting-item">
                    <label>Voice Chat Volume</label>
                    <input type="range" id="voice-volume" min="0" max="100" value="85" class="slider">
                    <span id="voice-volume-value">85%</span>
                </div>
            </div>
            
            <div class="setting-group">
                <h3>Audio Quality</h3>
                <div class="setting-item">
                    <label>Audio Quality</label>
                    <select id="audio-quality" class="select">
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                    </select>
                </div>
                
                <div class="setting-item">
                    <label>3D Audio</label>
                    <input type="checkbox" id="spatial-audio" class="checkbox" checked>
                </div>
            </div>
        `;
        
        this.setupAudioListeners(panel);
        return panel;
    }

    createControlsPanel() {
        const panel = document.createElement('div');
        panel.innerHTML = `
            <h2 style="margin-bottom: 30px; color: #fff;">Controls</h2>
            
            <div class="setting-group">
                <h3>Mouse Sensitivity</h3>
                <div class="setting-item">
                    <label>General Sensitivity</label>
                    <input type="range" id="mouse-sensitivity" min="0.1" max="5.0" step="0.1" value="1.0" class="slider">
                    <span id="mouse-sensitivity-value">1.0</span>
                </div>
                
                <div class="setting-item">
                    <label>ADS Sensitivity</label>
                    <input type="range" id="ads-sensitivity" min="0.1" max="2.0" step="0.1" value="0.8" class="slider">
                    <span id="ads-sensitivity-value">0.8</span>
                </div>
                
                <div class="setting-item">
                    <label>Invert Y-Axis</label>
                    <input type="checkbox" id="invert-y" class="checkbox">
                </div>
            </div>
            
            <div class="setting-group">
                <h3>Key Bindings</h3>
                <div id="key-bindings-list">
                    <!-- Key bindings will be populated here -->
                </div>
                
                <button class="button" onclick="pauseMenuSystem.resetControls()">Reset to Default</button>
            </div>
        `;
        
        this.setupControlsListeners(panel);
        this.populateKeyBindings(panel);
        return panel;
    }

    createGameplayPanel() {
        const panel = document.createElement('div');
        panel.innerHTML = `
            <h2 style="margin-bottom: 30px; color: #fff;">Gameplay Settings</h2>
            
            <div class="setting-group">
                <h3>HUD</h3>
                <div class="setting-item">
                    <label>Show Crosshair</label>
                    <input type="checkbox" id="show-crosshair" class="checkbox" checked>
                </div>
                
                <div class="setting-item">
                    <label>Show Minimap</label>
                    <input type="checkbox" id="show-minimap" class="checkbox" checked>
                </div>
                
                <div class="setting-item">
                    <label>Show Damage Numbers</label>
                    <input type="checkbox" id="show-damage-numbers" class="checkbox" checked>
                </div>
                
                <div class="setting-item">
                    <label>Show Kill Feed</label>
                    <input type="checkbox" id="show-kill-feed" class="checkbox" checked>
                </div>
            </div>
            
            <div class="setting-group">
                <h3>Assistance</h3>
                <div class="setting-item">
                    <label>Auto-Sprint</label>
                    <input type="checkbox" id="auto-sprint" class="checkbox">
                </div>
                
                <div class="setting-item">
                    <label>Auto-Switch Weapons</label>
                    <input type="checkbox" id="auto-switch-weapons" class="checkbox" checked>
                </div>
                
                <div class="setting-item">
                    <label>Colorblind Support</label>
                    <select id="colorblind-support" class="select">
                        <option value="none">None</option>
                        <option value="protanopia">Protanopia</option>
                        <option value="deuteranopia">Deuteranopia</option>
                        <option value="tritanopia">Tritanopia</option>
                    </select>
                </div>
            </div>
        `;
        
        this.setupGameplayListeners(panel);
        return panel;
    }

    addMenuStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .setting-group {
                margin-bottom: 30px;
                padding-bottom: 20px;
                border-bottom: 1px solid #444;
            }
            
            .setting-group h3 {
                color: #ffa500;
                margin-bottom: 15px;
                font-size: 18px;
            }
            
            .setting-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 15px;
                padding: 10px 0;
            }
            
            .setting-item label {
                flex: 1;
                font-size: 14px;
                color: #ccc;
            }
            
            .slider {
                width: 150px;
                margin-right: 10px;
            }
            
            .slider::-webkit-slider-thumb {
                background: #ffa500;
            }
            
            .select {
                background: rgba(0, 0, 0, 0.5);
                color: white;
                border: 1px solid #666;
                padding: 5px 10px;
                border-radius: 4px;
                min-width: 120px;
            }
            
            .checkbox {
                width: 20px;
                height: 20px;
                accent-color: #ffa500;
            }
            
            .button {
                background: #4a90e2;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                transition: background 0.2s;
            }
            
            .button:hover {
                background: #357abd;
            }
            
            .action-button {
                width: 100%;
                margin-bottom: 10px;
                background: #666;
                color: white;
                border: none;
                padding: 12px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                transition: background 0.2s;
            }
            
            .action-button.danger {
                background: #e74c3c;
            }
            
            .action-button.danger:hover {
                background: #c0392b;
            }
            
            .nav-button.active {
                background: rgba(255, 255, 255, 0.1) !important;
                color: #fff !important;
                border-left-color: #ffa500 !important;
            }
            
            .key-binding {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 0;
                border-bottom: 1px solid #333;
            }
            
            .key-binding:last-child {
                border-bottom: none;
            }
            
            .key-button {
                background: rgba(0, 0, 0, 0.5);
                color: white;
                border: 1px solid #666;
                padding: 5px 15px;
                border-radius: 4px;
                cursor: pointer;
                min-width: 80px;
                text-align: center;
            }
            
            .key-button:hover {
                background: rgba(255, 255, 255, 0.1);
            }
            
            .key-button.recording {
                background: #ffa500;
                color: #000;
            }
        `;
        
        document.head.appendChild(style);
    }

    setupEventListeners() {
        this.app.on('input:keydown', this.onKeyDown, this);
        window.pauseMenuSystem = this; // Global reference for button callbacks
    }

    onKeyDown(data) {
        if (data.key === this.pauseKey) {
            this.togglePauseMenu();
        }
    }

    showPauseMenu() {
        if (this.isVisible) return;
        
        this.isVisible = true;
        this.pauseMenu.style.display = 'block';
        
        // Pause the game
        this.app.fire('game:pause', true);
        
        // Show cursor
        this.app.mouse.disablePointerLock();
        
        // Show default panel
        this.showPanel('settings');
        
        // Load current settings
        this.loadCurrentSettings();
    }

    hidePauseMenu() {
        if (!this.isVisible) return;
        
        this.isVisible = false;
        this.pauseMenu.style.display = 'none';
        
        // Resume the game
        this.app.fire('game:pause', false);
        
        // Hide cursor
        this.app.mouse.enablePointerLock();
    }

    togglePauseMenu() {
        if (this.isVisible) {
            this.hidePauseMenu();
        } else {
            this.showPauseMenu();
        }
    }

    showPanel(panelId) {
        // Hide all panels
        Object.values(this.panelElements).forEach(panel => {
            panel.style.display = 'none';
        });
        
        // Update navigation buttons
        Object.values(this.navButtonElements).forEach(button => {
            button.classList.remove('active');
        });
        
        // Show selected panel
        if (this.panelElements[panelId]) {
            this.panelElements[panelId].style.display = 'block';
            this.navButtonElements[panelId].classList.add('active');
            this.currentPanel = panelId;
        }
    }

    resumeGame() {
        this.hidePauseMenu();
    }

    disconnect() {
        if (this.networkManager) {
            this.networkManager.disconnect();
        }
        this.quitToMenu();
    }

    quitToMenu() {
        // Save settings before quitting
        this.saveSettings();
        
        // Fire quit event
        this.app.fire('game:quit');
        
        this.hidePauseMenu();
    }

    // Settings management methods
    setupSettingsListeners(panel) {
        // FOV slider
        const fovSlider = panel.querySelector('#fov-slider');
        const fovValue = panel.querySelector('#fov-value');
        fovSlider.addEventListener('input', (e) => {
            fovValue.textContent = e.target.value + '°';
            this.updateSetting('fov', e.target.value);
        });
        
        // UI Scale slider
        const uiScaleSlider = panel.querySelector('#ui-scale-slider');
        const uiScaleValue = panel.querySelector('#ui-scale-value');
        uiScaleSlider.addEventListener('input', (e) => {
            uiScaleValue.textContent = Math.round(e.target.value * 100) + '%';
            this.updateSetting('uiScale', e.target.value);
        });
        
        // Checkboxes
        panel.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.updateSetting(e.target.id, e.target.checked);
            });
        });
    }

    setupGraphicsListeners(panel) {
        panel.querySelectorAll('select').forEach(select => {
            select.addEventListener('change', (e) => {
                this.updateSetting(e.target.id, e.target.value);
            });
        });
        
        panel.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.updateSetting(e.target.id, e.target.checked);
            });
        });
    }

    setupAudioListeners(panel) {
        // Volume sliders
        panel.querySelectorAll('input[type="range"]').forEach(slider => {
            const valueSpan = panel.querySelector(`#${slider.id}-value`);
            slider.addEventListener('input', (e) => {
                valueSpan.textContent = e.target.value + '%';
                this.updateAudioSetting(slider.id, e.target.value);
            });
        });
        
        panel.querySelectorAll('select, input[type="checkbox"]').forEach(control => {
            control.addEventListener('change', (e) => {
                this.updateAudioSetting(e.target.id, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
            });
        });
    }

    setupControlsListeners(panel) {
        panel.querySelectorAll('input[type="range"]').forEach(slider => {
            const valueSpan = panel.querySelector(`#${slider.id}-value`);
            slider.addEventListener('input', (e) => {
                valueSpan.textContent = e.target.value;
                this.updateControlSetting(slider.id, e.target.value);
            });
        });
        
        panel.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.updateControlSetting(e.target.id, e.target.checked);
            });
        });
    }

    setupGameplayListeners(panel) {
        panel.querySelectorAll('input, select').forEach(control => {
            control.addEventListener('change', (e) => {
                const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
                this.updateGameplaySetting(e.target.id, value);
            });
        });
    }

    updateSetting(setting, value) {
        if (this.settingsManager) {
            this.settingsManager.setSetting(setting, value);
        }
    }

    updateAudioSetting(setting, value) {
        if (this.audioManager) {
            switch (setting) {
                case 'master-volume':
                    this.audioManager.setMasterVolume(value / 100);
                    break;
                case 'music-volume':
                    this.audioManager.setMusicVolume(value / 100);
                    break;
                case 'sfx-volume':
                    this.audioManager.setSFXVolume(value / 100);
                    break;
                case 'voice-volume':
                    this.audioManager.setVoiceVolume(value / 100);
                    break;
                default:
                    this.updateSetting(setting, value);
            }
        }
    }

    updateControlSetting(setting, value) {
        // Update control settings
        this.updateSetting(setting, value);
    }

    updateGameplaySetting(setting, value) {
        // Update gameplay settings
        this.updateSetting(setting, value);
        
        // Apply immediate changes
        switch (setting) {
            case 'show-crosshair':
                this.app.fire('hud:toggleCrosshair', value);
                break;
            case 'show-minimap':
                this.app.fire('hud:toggleMinimap', value);
                break;
            case 'show-damage-numbers':
                this.app.fire('hud:toggleDamageNumbers', value);
                break;
            case 'show-kill-feed':
                this.app.fire('hud:toggleKillFeed', value);
                break;
        }
    }

    loadCurrentSettings() {
        if (!this.settingsManager) return;
        
        const settings = this.settingsManager.getAllSettings();
        
        // Load settings into UI controls
        Object.entries(settings).forEach(([key, value]) => {
            const element = document.getElementById(key);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = value;
                } else if (element.type === 'range') {
                    element.value = value;
                    const valueSpan = document.getElementById(key + '-value');
                    if (valueSpan) {
                        valueSpan.textContent = value + (key.includes('volume') ? '%' : key === 'fov' ? '°' : '');
                    }
                } else {
                    element.value = value;
                }
            }
        });
    }

    saveSettings() {
        if (this.settingsManager) {
            this.settingsManager.saveSettings();
        }
    }

    populateKeyBindings(panel) {
        const keyBindingsList = panel.querySelector('#key-bindings-list');
        
        const defaultBindings = {
            'Move Forward': 'W',
            'Move Backward': 'S',
            'Move Left': 'A',
            'Move Right': 'D',
            'Jump': 'Space',
            'Crouch': 'LeftControl',
            'Sprint': 'LeftShift',
            'Fire': 'Mouse1',
            'Aim': 'Mouse2',
            'Reload': 'R',
            'Use/Interact': 'E',
            'Grenade': 'G',
            'Melee': 'V',
            'Scoreboard': 'Tab'
        };
        
        Object.entries(defaultBindings).forEach(([action, key]) => {
            const binding = document.createElement('div');
            binding.className = 'key-binding';
            binding.innerHTML = `
                <span>${action}</span>
                <button class="key-button" data-action="${action}">${key}</button>
            `;
            keyBindingsList.appendChild(binding);
        });
    }

    resetControls() {
        // Reset all controls to default
        if (this.settingsManager) {
            this.settingsManager.resetControlsToDefault();
            this.loadCurrentSettings();
        }
    }

    destroy() {
        // Clean up event listeners
        this.app.off('input:keydown', this.onKeyDown, this);
        
        // Remove UI
        if (this.pauseMenu && this.pauseMenu.parentNode) {
            this.pauseMenu.parentNode.removeChild(this.pauseMenu);
        }
        
        // Clean up global reference
        if (window.pauseMenuSystem === this) {
            delete window.pauseMenuSystem;
        }
    }
}

pc.registerScript(PauseMenuSystem, 'PauseMenuSystem');
