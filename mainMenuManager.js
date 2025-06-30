/**
 * MainMenuManager.js
 * Main menu interface and navigation system
 * Handles main menu UI, navigation, settings, and game flow
 */

class MainMenuManager extends pc.ScriptType {
    static get scriptName() { return 'MainMenuManager'; }

    initialize() {
        this.audioManager = this.app.root.findByName('AudioManager')?.script?.audioManager;
        this.settingsManager = this.app.root.findByName('SettingsManager')?.script?.settingsManager;
        this.networkManager = this.app.root.findByName('NetworkManager')?.script?.networkManager;
        
        // Menu state
        this.currentMenu = 'main';
        this.previousMenu = null;
        this.menuStack = [];
        this.isTransitioning = false;
        
        // UI elements
        this.menuContainer = null;
        this.menuElements = new Map();
        this.buttons = new Map();
        
        // Menu data
        this.playerProfile = {
            username: 'Player',
            level: 1,
            experience: 0,
            stats: {
                kills: 0,
                deaths: 0,
                wins: 0,
                gamesPlayed: 0
            }
        };
        
        // Settings
        this.backgroundVideo = null;
        this.musicEnabled = true;
        this.sfxEnabled = true;
        
        this.createMainMenu();
        this.setupEventListeners();
        this.loadPlayerProfile();
        this.startBackgroundMusic();
    }

    createMainMenu() {
        this.createMenuContainer();
        this.createMainMenuScreen();
        this.createMultiplayerMenuScreen();
        this.createSettingsMenuScreen();
        this.createProfileMenuScreen();
        this.createCreditsScreen();
        this.setupMenuCSS();
        this.showMenu('main');
    }

    createMenuContainer() {
        this.menuContainer = document.createElement('div');
        this.menuContainer.id = 'main-menu-container';
        this.menuContainer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.5)), url('assets/images/menu-background.jpg');
            background-size: cover;
            background-position: center;
            font-family: 'Orbitron', 'Arial', sans-serif;
            color: white;
            z-index: 5000;
            overflow: hidden;
        `;
        
        // Background video overlay
        this.createBackgroundVideo();
        
        document.body.appendChild(this.menuContainer);
    }

    createBackgroundVideo() {
        this.backgroundVideo = document.createElement('video');
        this.backgroundVideo.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            opacity: 0.3;
            z-index: -1;
        `;
        this.backgroundVideo.src = 'assets/videos/menu-background.mp4';
        this.backgroundVideo.autoplay = true;
        this.backgroundVideo.loop = true;
        this.backgroundVideo.muted = true;
        
        this.menuContainer.appendChild(this.backgroundVideo);
    }

    createMainMenuScreen() {
        const mainMenu = document.createElement('div');
        mainMenu.id = 'menu-main';
        mainMenu.className = 'menu-screen';
        mainMenu.innerHTML = `
            <div class="menu-header">
                <h1 class="game-title">RIFT COMBAT</h1>
                <div class="game-subtitle">Tactical First-Person Shooter</div>
            </div>
            
            <div class="menu-content">
                <div class="main-buttons">
                    <button class="menu-btn primary" data-action="singleplayer">
                        <span class="btn-icon">🎯</span>
                        <span class="btn-text">Single Player</span>
                    </button>
                    
                    <button class="menu-btn primary" data-action="multiplayer">
                        <span class="btn-icon">🌐</span>
                        <span class="btn-text">Multiplayer</span>
                    </button>
                    
                    <button class="menu-btn secondary" data-action="settings">
                        <span class="btn-icon">⚙️</span>
                        <span class="btn-text">Settings</span>
                    </button>
                    
                    <button class="menu-btn secondary" data-action="profile">
                        <span class="btn-icon">👤</span>
                        <span class="btn-text">Profile</span>
                    </button>
                    
                    <button class="menu-btn secondary" data-action="credits">
                        <span class="btn-icon">📜</span>
                        <span class="btn-text">Credits</span>
                    </button>
                    
                    <button class="menu-btn danger" data-action="quit">
                        <span class="btn-icon">🚪</span>
                        <span class="btn-text">Quit</span>
                    </button>
                </div>
                
                <div class="menu-sidebar">
                    <div class="player-info">
                        <div class="player-avatar">👤</div>
                        <div class="player-details">
                            <div class="player-name">${this.playerProfile.username}</div>
                            <div class="player-level">Level ${this.playerProfile.level}</div>
                            <div class="player-xp">
                                <div class="xp-bar">
                                    <div class="xp-fill" style="width: ${(this.playerProfile.experience % 1000) / 10}%"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="quick-stats">
                        <div class="stat-item">
                            <span class="stat-label">K/D Ratio:</span>
                            <span class="stat-value">${this.calculateKDRatio()}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Win Rate:</span>
                            <span class="stat-value">${this.calculateWinRate()}%</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Games:</span>
                            <span class="stat-value">${this.playerProfile.stats.gamesPlayed}</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="menu-footer">
                <div class="version-info">Version 1.0.0</div>
                <div class="connection-status" id="connection-status">Offline</div>
            </div>
        `;
        
        this.menuElements.set('main', mainMenu);
        this.menuContainer.appendChild(mainMenu);
    }

    createMultiplayerMenuScreen() {
        const multiplayerMenu = document.createElement('div');
        multiplayerMenu.id = 'menu-multiplayer';
        multiplayerMenu.className = 'menu-screen';
        multiplayerMenu.innerHTML = `
            <div class="menu-header">
                <h2>Multiplayer</h2>
                <button class="back-btn" data-action="back">← Back</button>
            </div>
            
            <div class="menu-content">
                <div class="mp-modes">
                    <div class="mode-category">
                        <h3>Quick Match</h3>
                        <button class="menu-btn primary" data-action="quickmatch">
                            <span class="btn-icon">⚡</span>
                            <span class="btn-text">Find Match</span>
                        </button>
                    </div>
                    
                    <div class="mode-category">
                        <h3>Game Modes</h3>
                        <button class="menu-btn secondary" data-action="teamdeathmatch">
                            <span class="btn-icon">⚔️</span>
                            <span class="btn-text">Team Deathmatch</span>
                        </button>
                        <button class="menu-btn secondary" data-action="captureflag">
                            <span class="btn-icon">🏴</span>
                            <span class="btn-text">Capture the Flag</span>
                        </button>
                        <button class="menu-btn secondary" data-action="domination">
                            <span class="btn-icon">🏰</span>
                            <span class="btn-text">Domination</span>
                        </button>
                        <button class="menu-btn secondary" data-action="battleroyale">
                            <span class="btn-icon">👑</span>
                            <span class="btn-text">Battle Royale</span>
                        </button>
                    </div>
                    
                    <div class="mode-category">
                        <h3>Server Browser</h3>
                        <button class="menu-btn secondary" data-action="serverbrowser">
                            <span class="btn-icon">🌐</span>
                            <span class="btn-text">Browse Servers</span>
                        </button>
                        <button class="menu-btn secondary" data-action="createserver">
                            <span class="btn-icon">➕</span>
                            <span class="btn-text">Create Server</span>
                        </button>
                    </div>
                </div>
                
                <div class="mp-info">
                    <div class="server-status">
                        <h4>Server Status</h4>
                        <div class="status-item">
                            <span>Players Online:</span>
                            <span id="players-online">Loading...</span>
                        </div>
                        <div class="status-item">
                            <span>Active Servers:</span>
                            <span id="active-servers">Loading...</span>
                        </div>
                        <div class="status-item">
                            <span>Ping:</span>
                            <span id="server-ping">--ms</span>
                        </div>
                    </div>
                    
                    <div class="recent-matches">
                        <h4>Recent Matches</h4>
                        <div class="match-list" id="recent-matches">
                            <div class="match-item">No recent matches</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        this.menuElements.set('multiplayer', multiplayerMenu);
        this.menuContainer.appendChild(multiplayerMenu);
    }

    createSettingsMenuScreen() {
        const settingsMenu = document.createElement('div');
        settingsMenu.id = 'menu-settings';
        settingsMenu.className = 'menu-screen';
        settingsMenu.innerHTML = `
            <div class="menu-header">
                <h2>Settings</h2>
                <button class="back-btn" data-action="back">← Back</button>
            </div>
            
            <div class="menu-content">
                <div class="settings-categories">
                    <div class="settings-nav">
                        <button class="settings-tab active" data-tab="video">Video</button>
                        <button class="settings-tab" data-tab="audio">Audio</button>
                        <button class="settings-tab" data-tab="controls">Controls</button>
                        <button class="settings-tab" data-tab="gameplay">Gameplay</button>
                    </div>
                    
                    <div class="settings-content">
                        <div class="settings-panel active" id="settings-video">
                            <div class="setting-item">
                                <label>Resolution</label>
                                <select id="resolution">
                                    <option value="1920x1080">1920x1080</option>
                                    <option value="1680x1050">1680x1050</option>
                                    <option value="1440x900">1440x900</option>
                                    <option value="1280x720">1280x720</option>
                                </select>
                            </div>
                            
                            <div class="setting-item">
                                <label>Graphics Quality</label>
                                <select id="graphics-quality">
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                    <option value="ultra">Ultra</option>
                                </select>
                            </div>
                            
                            <div class="setting-item">
                                <label>Field of View</label>
                                <input type="range" id="fov" min="60" max="120" value="90">
                                <span class="range-value">90°</span>
                            </div>
                            
                            <div class="setting-item">
                                <label>VSync</label>
                                <input type="checkbox" id="vsync">
                            </div>
                        </div>
                        
                        <div class="settings-panel" id="settings-audio">
                            <div class="setting-item">
                                <label>Master Volume</label>
                                <input type="range" id="master-volume" min="0" max="100" value="100">
                                <span class="range-value">100%</span>
                            </div>
                            
                            <div class="setting-item">
                                <label>SFX Volume</label>
                                <input type="range" id="sfx-volume" min="0" max="100" value="80">
                                <span class="range-value">80%</span>
                            </div>
                            
                            <div class="setting-item">
                                <label>Music Volume</label>
                                <input type="range" id="music-volume" min="0" max="100" value="60">
                                <span class="range-value">60%</span>
                            </div>
                            
                            <div class="setting-item">
                                <label>Voice Chat Volume</label>
                                <input type="range" id="voice-volume" min="0" max="100" value="70">
                                <span class="range-value">70%</span>
                            </div>
                        </div>
                        
                        <div class="settings-panel" id="settings-controls">
                            <div class="control-bindings">
                                <div class="binding-item">
                                    <span>Move Forward</span>
                                    <button class="key-bind" data-action="forward">W</button>
                                </div>
                                <div class="binding-item">
                                    <span>Move Backward</span>
                                    <button class="key-bind" data-action="backward">S</button>
                                </div>
                                <div class="binding-item">
                                    <span>Move Left</span>
                                    <button class="key-bind" data-action="left">A</button>
                                </div>
                                <div class="binding-item">
                                    <span>Move Right</span>
                                    <button class="key-bind" data-action="right">D</button>
                                </div>
                                <div class="binding-item">
                                    <span>Jump</span>
                                    <button class="key-bind" data-action="jump">SPACE</button>
                                </div>
                                <div class="binding-item">
                                    <span>Crouch</span>
                                    <button class="key-bind" data-action="crouch">CTRL</button>
                                </div>
                                <div class="binding-item">
                                    <span>Fire</span>
                                    <button class="key-bind" data-action="fire">LMB</button>
                                </div>
                                <div class="binding-item">
                                    <span>Aim</span>
                                    <button class="key-bind" data-action="aim">RMB</button>
                                </div>
                                <div class="binding-item">
                                    <span>Reload</span>
                                    <button class="key-bind" data-action="reload">R</button>
                                </div>
                            </div>
                        </div>
                        
                        <div class="settings-panel" id="settings-gameplay">
                            <div class="setting-item">
                                <label>Mouse Sensitivity</label>
                                <input type="range" id="mouse-sensitivity" min="0.1" max="5.0" step="0.1" value="1.0">
                                <span class="range-value">1.0</span>
                            </div>
                            
                            <div class="setting-item">
                                <label>Crosshair Color</label>
                                <input type="color" id="crosshair-color" value="#00ff00">
                            </div>
                            
                            <div class="setting-item">
                                <label>Show FPS Counter</label>
                                <input type="checkbox" id="show-fps">
                            </div>
                            
                            <div class="setting-item">
                                <label>Auto-Run</label>
                                <input type="checkbox" id="auto-run">
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="settings-buttons">
                    <button class="menu-btn secondary" data-action="reset-defaults">Reset to Defaults</button>
                    <button class="menu-btn primary" data-action="apply-settings">Apply Settings</button>
                </div>
            </div>
        `;
        
        this.menuElements.set('settings', settingsMenu);
        this.menuContainer.appendChild(settingsMenu);
    }

    createProfileMenuScreen() {
        const profileMenu = document.createElement('div');
        profileMenu.id = 'menu-profile';
        profileMenu.className = 'menu-screen';
        profileMenu.innerHTML = `
            <div class="menu-header">
                <h2>Player Profile</h2>
                <button class="back-btn" data-action="back">← Back</button>
            </div>
            
            <div class="menu-content">
                <div class="profile-sections">
                    <div class="profile-overview">
                        <div class="profile-avatar">👤</div>
                        <div class="profile-info">
                            <input type="text" id="username" value="${this.playerProfile.username}" class="username-input">
                            <div class="level-info">
                                <span>Level ${this.playerProfile.level}</span>
                                <div class="xp-progress">
                                    <div class="xp-bar">
                                        <div class="xp-fill" style="width: ${(this.playerProfile.experience % 1000) / 10}%"></div>
                                    </div>
                                    <span>${this.playerProfile.experience % 1000}/1000 XP</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="detailed-stats">
                        <h3>Combat Statistics</h3>
                        <div class="stats-grid">
                            <div class="stat-card">
                                <div class="stat-number">${this.playerProfile.stats.kills}</div>
                                <div class="stat-label">Total Kills</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-number">${this.playerProfile.stats.deaths}</div>
                                <div class="stat-label">Total Deaths</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-number">${this.calculateKDRatio()}</div>
                                <div class="stat-label">K/D Ratio</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-number">${this.playerProfile.stats.wins}</div>
                                <div class="stat-label">Wins</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-number">${this.playerProfile.stats.gamesPlayed}</div>
                                <div class="stat-label">Games Played</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-number">${this.calculateWinRate()}%</div>
                                <div class="stat-label">Win Rate</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="achievements">
                        <h3>Achievements</h3>
                        <div class="achievement-list">
                            <div class="achievement-item locked">
                                <div class="achievement-icon">🎯</div>
                                <div class="achievement-info">
                                    <div class="achievement-name">First Blood</div>
                                    <div class="achievement-desc">Get your first kill</div>
                                </div>
                            </div>
                            <div class="achievement-item locked">
                                <div class="achievement-icon">💀</div>
                                <div class="achievement-info">
                                    <div class="achievement-name">Killing Spree</div>
                                    <div class="achievement-desc">Get 5 kills without dying</div>
                                </div>
                            </div>
                            <div class="achievement-item locked">
                                <div class="achievement-icon">🏆</div>
                                <div class="achievement-info">
                                    <div class="achievement-name">Victory</div>
                                    <div class="achievement-desc">Win your first match</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="profile-buttons">
                    <button class="menu-btn secondary" data-action="save-profile">Save Changes</button>
                </div>
            </div>
        `;
        
        this.menuElements.set('profile', profileMenu);
        this.menuContainer.appendChild(profileMenu);
    }

    createCreditsScreen() {
        const creditsMenu = document.createElement('div');
        creditsMenu.id = 'menu-credits';
        creditsMenu.className = 'menu-screen';
        creditsMenu.innerHTML = `
            <div class="menu-header">
                <h2>Credits</h2>
                <button class="back-btn" data-action="back">← Back</button>
            </div>
            
            <div class="menu-content">
                <div class="credits-content">
                    <div class="credits-section">
                        <h3>Development Team</h3>
                        <div class="credit-item">
                            <strong>Lead Developer:</strong> Game Studio
                        </div>
                        <div class="credit-item">
                            <strong>Game Design:</strong> Design Team
                        </div>
                        <div class="credit-item">
                            <strong>Programming:</strong> Development Team
                        </div>
                        <div class="credit-item">
                            <strong>Art & Graphics:</strong> Art Team
                        </div>
                        <div class="credit-item">
                            <strong>Audio & Music:</strong> Audio Team
                        </div>
                    </div>
                    
                    <div class="credits-section">
                        <h3>Special Thanks</h3>
                        <div class="credit-item">PlayCanvas Engine Team</div>
                        <div class="credit-item">Open Source Community</div>
                        <div class="credit-item">Beta Testers</div>
                    </div>
                    
                    <div class="credits-section">
                        <h3>Third Party Assets</h3>
                        <div class="credit-item">Sound Effects: Various Artists</div>
                        <div class="credit-item">Music: Royalty Free Tracks</div>
                        <div class="credit-item">Fonts: Google Fonts</div>
                    </div>
                    
                    <div class="credits-footer">
                        <p>Built with PlayCanvas Engine</p>
                        <p>© 2024 Rift Combat. All rights reserved.</p>
                    </div>
                </div>
            </div>
        `;
        
        this.menuElements.set('credits', creditsMenu);
        this.menuContainer.appendChild(creditsMenu);
    }

    setupMenuCSS() {
        const style = document.createElement('style');
        style.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap');
            
            .menu-screen {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                display: none;
                flex-direction: column;
                opacity: 0;
                transition: opacity 0.3s ease;
            }
            
            .menu-screen.active {
                display: flex;
                opacity: 1;
            }
            
            .menu-header {
                padding: 20px 40px;
                background: linear-gradient(to bottom, rgba(0,0,0,0.8), rgba(0,0,0,0.4));
                border-bottom: 2px solid rgba(0,255,255,0.3);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .game-title {
                font-family: 'Orbitron', sans-serif;
                font-size: 3.5em;
                font-weight: 900;
                margin: 0;
                text-shadow: 0 0 20px rgba(0,255,255,0.5);
                background: linear-gradient(45deg, #00ffff, #0080ff);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }
            
            .game-subtitle {
                font-size: 1.2em;
                color: rgba(255,255,255,0.7);
                margin-top: 5px;
            }
            
            .menu-content {
                flex: 1;
                display: flex;
                padding: 40px;
                gap: 40px;
            }
            
            .main-buttons {
                display: flex;
                flex-direction: column;
                gap: 15px;
                min-width: 300px;
            }
            
            .menu-btn {
                display: flex;
                align-items: center;
                padding: 15px 25px;
                background: linear-gradient(145deg, rgba(0,0,0,0.8), rgba(50,50,50,0.6));
                border: 2px solid rgba(255,255,255,0.2);
                border-radius: 10px;
                color: white;
                font-size: 1.1em;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.3s ease;
                text-decoration: none;
                font-family: 'Orbitron', sans-serif;
            }
            
            .menu-btn:hover {
                background: linear-gradient(145deg, rgba(0,100,200,0.6), rgba(0,150,255,0.4));
                border-color: rgba(0,255,255,0.6);
                box-shadow: 0 0 20px rgba(0,255,255,0.3);
                transform: translateY(-2px);
            }
            
            .menu-btn.primary {
                border-color: rgba(0,255,0,0.4);
            }
            
            .menu-btn.primary:hover {
                background: linear-gradient(145deg, rgba(0,150,0,0.6), rgba(0,200,0,0.4));
                border-color: rgba(0,255,0,0.8);
                box-shadow: 0 0 20px rgba(0,255,0,0.3);
            }
            
            .menu-btn.danger {
                border-color: rgba(255,0,0,0.4);
            }
            
            .menu-btn.danger:hover {
                background: linear-gradient(145deg, rgba(150,0,0,0.6), rgba(200,0,0,0.4));
                border-color: rgba(255,0,0,0.8);
                box-shadow: 0 0 20px rgba(255,0,0,0.3);
            }
            
            .btn-icon {
                font-size: 1.5em;
                margin-right: 15px;
            }
            
            .back-btn {
                background: rgba(0,0,0,0.6);
                border: 1px solid rgba(255,255,255,0.3);
                color: white;
                padding: 10px 20px;
                border-radius: 5px;
                cursor: pointer;
                font-family: 'Orbitron', sans-serif;
                transition: all 0.2s ease;
            }
            
            .back-btn:hover {
                background: rgba(255,255,255,0.1);
                border-color: rgba(255,255,255,0.6);
            }
            
            .menu-sidebar {
                background: rgba(0,0,0,0.6);
                border: 1px solid rgba(255,255,255,0.2);
                border-radius: 15px;
                padding: 25px;
                min-width: 250px;
                backdrop-filter: blur(10px);
            }
            
            .player-info {
                display: flex;
                align-items: center;
                margin-bottom: 25px;
                padding-bottom: 20px;
                border-bottom: 1px solid rgba(255,255,255,0.2);
            }
            
            .player-avatar {
                font-size: 3em;
                margin-right: 15px;
                background: linear-gradient(145deg, rgba(0,100,200,0.6), rgba(0,150,255,0.4));
                border-radius: 50%;
                width: 60px;
                height: 60px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .player-name {
                font-size: 1.3em;
                font-weight: bold;
                margin-bottom: 5px;
            }
            
            .player-level {
                color: rgba(255,255,255,0.7);
                margin-bottom: 8px;
            }
            
            .xp-bar {
                width: 100%;
                height: 8px;
                background: rgba(255,255,255,0.2);
                border-radius: 4px;
                overflow: hidden;
            }
            
            .xp-fill {
                height: 100%;
                background: linear-gradient(90deg, #00ff00, #00aa00);
                transition: width 0.3s ease;
            }
            
            .quick-stats {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            
            .stat-item {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
            }
            
            .stat-label {
                color: rgba(255,255,255,0.7);
            }
            
            .stat-value {
                font-weight: bold;
                color: #00ff00;
            }
            
            .menu-footer {
                padding: 20px 40px;
                background: rgba(0,0,0,0.6);
                border-top: 1px solid rgba(255,255,255,0.2);
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 0.9em;
                color: rgba(255,255,255,0.6);
            }
            
            .settings-nav {
                display: flex;
                gap: 10px;
                margin-bottom: 30px;
            }
            
            .settings-tab {
                padding: 10px 20px;
                background: rgba(0,0,0,0.6);
                border: 1px solid rgba(255,255,255,0.2);
                color: white;
                cursor: pointer;
                border-radius: 5px;
                transition: all 0.2s ease;
            }
            
            .settings-tab.active,
            .settings-tab:hover {
                background: rgba(0,100,200,0.6);
                border-color: rgba(0,255,255,0.6);
            }
            
            .settings-panel {
                display: none;
            }
            
            .settings-panel.active {
                display: block;
            }
            
            .setting-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 15px 0;
                border-bottom: 1px solid rgba(255,255,255,0.1);
            }
            
            .setting-item label {
                color: white;
                font-weight: bold;
            }
            
            .setting-item input,
            .setting-item select {
                background: rgba(0,0,0,0.6);
                border: 1px solid rgba(255,255,255,0.3);
                color: white;
                padding: 8px;
                border-radius: 5px;
            }
            
            @keyframes slideInLeft {
                from {
                    transform: translateX(-100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            
            @keyframes slideOutLeft {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(-100%);
                    opacity: 0;
                }
            }
            
            .menu-screen.slide-in {
                animation: slideInLeft 0.3s ease;
            }
            
            .menu-screen.slide-out {
                animation: slideOutLeft 0.3s ease;
            }
        `;
        
        document.head.appendChild(style);
    }

    setupEventListeners() {
        // Button click handlers
        this.menuContainer.addEventListener('click', (event) => {
            const action = event.target.closest('[data-action]')?.dataset.action;
            if (action) {
                this.handleMenuAction(action);
            }
        });
        
        // Settings tabs
        this.menuContainer.addEventListener('click', (event) => {
            const tab = event.target.closest('[data-tab]')?.dataset.tab;
            if (tab) {
                this.showSettingsTab(tab);
            }
        });
        
        // Range input updates
        this.menuContainer.addEventListener('input', (event) => {
            if (event.target.type === 'range') {
                const valueSpan = event.target.nextElementSibling;
                if (valueSpan && valueSpan.classList.contains('range-value')) {
                    valueSpan.textContent = event.target.value + 
                        (event.target.id === 'fov' ? '°' : '%');
                }
            }
        });
        
        // Network events
        this.app.on('network:connected', () => {
            this.updateConnectionStatus('Connected');
        });
        
        this.app.on('network:disconnected', () => {
            this.updateConnectionStatus('Offline');
        });
        
        // Game events
        this.app.on('game:started', () => {
            this.hideMainMenu();
        });
        
        this.app.on('game:ended', () => {
            this.showMainMenu();
        });
    }

    handleMenuAction(action) {
        if (this.isTransitioning) return;
        
        this.playButtonSound();
        
        switch (action) {
            case 'singleplayer':
                this.startSinglePlayer();
                break;
            case 'multiplayer':
                this.showMenu('multiplayer');
                break;
            case 'settings':
                this.showMenu('settings');
                break;
            case 'profile':
                this.showMenu('profile');
                break;
            case 'credits':
                this.showMenu('credits');
                break;
            case 'quit':
                this.quitGame();
                break;
            case 'back':
                this.goBack();
                break;
            case 'quickmatch':
                this.startQuickMatch();
                break;
            case 'teamdeathmatch':
                this.startGameMode('teamdeathmatch');
                break;
            case 'captureflag':
                this.startGameMode('captureflag');
                break;
            case 'domination':
                this.startGameMode('domination');
                break;
            case 'battleroyale':
                this.startGameMode('battleroyale');
                break;
            case 'apply-settings':
                this.applySettings();
                break;
            case 'reset-defaults':
                this.resetToDefaults();
                break;
            case 'save-profile':
                this.saveProfile();
                break;
        }
    }

    showMenu(menuName) {
        if (this.isTransitioning) return;
        
        this.isTransitioning = true;
        
        // Store previous menu for back navigation
        this.previousMenu = this.currentMenu;
        this.menuStack.push(this.currentMenu);
        
        // Hide current menu
        const currentMenuElement = this.menuElements.get(this.currentMenu);
        if (currentMenuElement) {
            currentMenuElement.classList.remove('active');
        }
        
        // Show new menu
        const newMenuElement = this.menuElements.get(menuName);
        if (newMenuElement) {
            setTimeout(() => {
                newMenuElement.classList.add('active');
                this.currentMenu = menuName;
                this.isTransitioning = false;
            }, 150);
        } else {
            this.isTransitioning = false;
        }
    }

    goBack() {
        if (this.menuStack.length > 0) {
            const previousMenu = this.menuStack.pop();
            this.showMenu(previousMenu);
        } else {
            this.showMenu('main');
        }
    }

    showSettingsTab(tabName) {
        // Hide all panels
        const panels = this.menuContainer.querySelectorAll('.settings-panel');
        panels.forEach(panel => panel.classList.remove('active'));
        
        // Hide all tabs
        const tabs = this.menuContainer.querySelectorAll('.settings-tab');
        tabs.forEach(tab => tab.classList.remove('active'));
        
        // Show selected panel and tab
        const targetPanel = this.menuContainer.querySelector(`#settings-${tabName}`);
        const targetTab = this.menuContainer.querySelector(`[data-tab="${tabName}"]`);
        
        if (targetPanel) targetPanel.classList.add('active');
        if (targetTab) targetTab.classList.add('active');
    }

    startSinglePlayer() {
        this.app.fire('menu:startSinglePlayer');
        this.hideMainMenu();
    }

    startQuickMatch() {
        if (this.networkManager) {
            this.networkManager.findQuickMatch();
        }
    }

    startGameMode(mode) {
        this.app.fire('menu:startGameMode', { mode: mode });
        this.hideMainMenu();
    }

    applySettings() {
        // Collect settings from form
        const settings = this.collectSettings();
        
        // Apply settings
        if (this.settingsManager) {
            this.settingsManager.applySettings(settings);
        }
        
        this.app.fire('settings:applied', settings);
        this.showMenu('main');
    }

    collectSettings() {
        return {
            video: {
                resolution: this.menuContainer.querySelector('#resolution')?.value,
                quality: this.menuContainer.querySelector('#graphics-quality')?.value,
                fov: parseInt(this.menuContainer.querySelector('#fov')?.value),
                vsync: this.menuContainer.querySelector('#vsync')?.checked
            },
            audio: {
                master: parseInt(this.menuContainer.querySelector('#master-volume')?.value),
                sfx: parseInt(this.menuContainer.querySelector('#sfx-volume')?.value),
                music: parseInt(this.menuContainer.querySelector('#music-volume')?.value),
                voice: parseInt(this.menuContainer.querySelector('#voice-volume')?.value)
            },
            controls: {
                sensitivity: parseFloat(this.menuContainer.querySelector('#mouse-sensitivity')?.value)
            },
            gameplay: {
                crosshairColor: this.menuContainer.querySelector('#crosshair-color')?.value,
                showFPS: this.menuContainer.querySelector('#show-fps')?.checked,
                autoRun: this.menuContainer.querySelector('#auto-run')?.checked
            }
        };
    }

    resetToDefaults() {
        // Reset all form values to defaults
        if (this.settingsManager) {
            this.settingsManager.resetToDefaults();
        }
    }

    saveProfile() {
        const username = this.menuContainer.querySelector('#username')?.value;
        if (username) {
            this.playerProfile.username = username;
            this.savePlayerProfile();
        }
    }

    quitGame() {
        this.app.fire('game:quit');
        // In a real implementation, this would close the game
        console.log('Game quit requested');
    }

    hideMainMenu() {
        this.menuContainer.style.display = 'none';
        this.stopBackgroundMusic();
    }

    showMainMenu() {
        this.menuContainer.style.display = 'block';
        this.showMenu('main');
        this.startBackgroundMusic();
    }

    startBackgroundMusic() {
        if (this.audioManager && this.musicEnabled) {
            this.audioManager.playMusic('menu_music.mp3', {
                loop: true,
                volume: 0.3
            });
        }
    }

    stopBackgroundMusic() {
        if (this.audioManager) {
            this.audioManager.stopMusic();
        }
    }

    playButtonSound() {
        if (this.audioManager && this.sfxEnabled) {
            this.audioManager.playSound('menu_button.wav', {
                volume: 0.5,
                category: 'ui'
            });
        }
    }

    updateConnectionStatus(status) {
        const statusElement = this.menuContainer.querySelector('#connection-status');
        if (statusElement) {
            statusElement.textContent = status;
            statusElement.style.color = status === 'Connected' ? '#00ff00' : '#ff6666';
        }
    }

    loadPlayerProfile() {
        // Load from localStorage or server
        const savedProfile = localStorage.getItem('playerProfile');
        if (savedProfile) {
            try {
                this.playerProfile = JSON.parse(savedProfile);
            } catch (e) {
                console.warn('Failed to load player profile');
            }
        }
    }

    savePlayerProfile() {
        localStorage.setItem('playerProfile', JSON.stringify(this.playerProfile));
    }

    calculateKDRatio() {
        const { kills, deaths } = this.playerProfile.stats;
        return deaths > 0 ? (kills / deaths).toFixed(2) : kills.toFixed(2);
    }

    calculateWinRate() {
        const { wins, gamesPlayed } = this.playerProfile.stats;
        return gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;
    }

    updatePlayerStats(stats) {
        Object.assign(this.playerProfile.stats, stats);
        this.savePlayerProfile();
    }

    // Public API
    isMenuVisible() {
        return this.menuContainer.style.display !== 'none';
    }

    getCurrentMenu() {
        return this.currentMenu;
    }

    destroy() {
        this.stopBackgroundMusic();
        
        if (this.menuContainer && this.menuContainer.parentNode) {
            this.menuContainer.parentNode.removeChild(this.menuContainer);
        }
    }
}

pc.registerScript(MainMenuManager, 'MainMenuManager');
