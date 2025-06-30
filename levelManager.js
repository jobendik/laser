/**
 * LevelManager.js
 * Comprehensive level loading and management system
 * Handles level loading/unloading, streaming, environmental state, interactive objects, and level-specific configurations
 */

class LevelManager extends pc.ScriptType {
    static get scriptName() { return 'LevelManager'; }

    initialize() {
        this.gameManager = this.app.root.findByName('Game_Manager').script.gameManager;
        this.networkManager = this.app.root.findByName('Game_Manager').script.networkManager;
        this.audioManager = this.app.root.findByName('Game_Manager').script.audioManager;
        this.performanceManager = this.app.root.findByName('Game_Manager').script.performanceManager;
        
        // Level management
        this.currentLevel = null;
        this.loadedLevels = new Map();
        this.levelConfigs = new Map();
        this.loadingQueue = [];
        this.unloadingQueue = [];
        
        // Streaming system
        this.streamingEnabled = true;
        this.streamingDistance = 200; // meters
        this.streamingCells = new Map();
        this.activeCells = new Set();
        this.playerPosition = new pc.Vec3();
        
        // Interactive objects
        this.interactiveObjects = new Map();
        this.triggerZones = new Map();
        this.elevators = new Map();
        this.doors = new Map();
        
        // Environmental state
        this.environmentalData = {
            lighting: {},
            weather: {},
            audio: {},
            physics: {},
            gameplay: {}
        };
        
        // Level instances and variants
        this.levelInstances = new Map();
        this.levelVariants = new Map();
        
        // Performance tracking
        this.loadingMetrics = {
            currentLoadTime: 0,
            averageLoadTime: 0,
            totalLoads: 0,
            failedLoads: 0
        };
        
        this.initializeLevelSystem();
        this.setupEventListeners();
    }

    initializeLevelSystem() {
        this.loadLevelConfigurations();
        this.initializeStreamingSystem();
        this.setupInteractiveObjectsSystem();
    }

    loadLevelConfigurations() {
        // Load level configuration data
        this.levelConfigs.set('urban_warfare', {
            name: 'Urban Warfare',
            description: 'City environment with destructible buildings',
            size: { x: 500, y: 100, z: 500 },
            maxPlayers: 32,
            gameMode: ['tdm', 'domination', 'ctf'],
            assets: {
                environment: 'urban_warfare_environment',
                lightmap: 'urban_warfare_lightmap',
                audio: 'urban_warfare_ambient',
                config: 'urban_warfare_config'
            },
            streaming: {
                enabled: true,
                cellSize: 50,
                preloadRadius: 2
            },
            interactives: [
                { type: 'door', count: 15 },
                { type: 'elevator', count: 3 },
                { type: 'destructible', count: 25 }
            ],
            spawnPoints: {
                team1: 8,
                team2: 8,
                ffa: 16,
                objectives: 5
            },
            lighting: {
                timeOfDay: 'afternoon',
                dynamic: true,
                shadows: 'high'
            },
            weather: {
                enabled: true,
                default: 'clear',
                variants: ['rain', 'fog']
            }
        });

        this.levelConfigs.set('industrial_complex', {
            name: 'Industrial Complex',
            description: 'Factory environment with machinery and catwalks',
            size: { x: 400, y: 80, z: 400 },
            maxPlayers: 24,
            gameMode: ['tdm', 'search_destroy'],
            assets: {
                environment: 'industrial_environment',
                lightmap: 'industrial_lightmap',
                audio: 'industrial_ambient',
                config: 'industrial_config'
            },
            streaming: {
                enabled: true,
                cellSize: 40,
                preloadRadius: 2
            },
            interactives: [
                { type: 'conveyor', count: 5 },
                { type: 'crane', count: 2 },
                { type: 'valve', count: 10 }
            ],
            spawnPoints: {
                team1: 6,
                team2: 6,
                ffa: 12,
                objectives: 3
            },
            lighting: {
                timeOfDay: 'night',
                dynamic: false,
                shadows: 'medium',
                artificialLighting: true
            },
            weather: {
                enabled: false
            }
        });

        this.levelConfigs.set('desert_compound', {
            name: 'Desert Compound',
            description: 'Military base in desert environment',
            size: { x: 600, y: 60, z: 600 },
            maxPlayers: 40,
            gameMode: ['tdm', 'ctf', 'battle_royale'],
            assets: {
                environment: 'desert_environment',
                lightmap: 'desert_lightmap',
                audio: 'desert_ambient',
                config: 'desert_config'
            },
            streaming: {
                enabled: true,
                cellSize: 60,
                preloadRadius: 3
            },
            interactives: [
                { type: 'gate', count: 4 },
                { type: 'watchtower', count: 6 },
                { type: 'bunker', count: 8 }
            ],
            spawnPoints: {
                team1: 10,
                team2: 10,
                ffa: 20,
                objectives: 7
            },
            lighting: {
                timeOfDay: 'day',
                dynamic: true,
                shadows: 'high',
                sunIntensity: 1.2
            },
            weather: {
                enabled: true,
                default: 'clear',
                variants: ['sandstorm', 'heat_haze']
            }
        });
    }

    initializeStreamingSystem() {
        if (!this.streamingEnabled) return;
        
        // Initialize streaming grid
        this.streamingCells.clear();
        this.activeCells.clear();
        
        // Set up streaming update interval
        this.streamingUpdateInterval = setInterval(() => {
            this.updateStreaming();
        }, 1000); // Update every second
    }

    setupInteractiveObjectsSystem() {
        // Initialize interactive object managers
        this.interactiveObjects.clear();
        this.triggerZones.clear();
        this.elevators.clear();
        this.doors.clear();
    }

    setupEventListeners() {
        // Game events
        this.app.on('game:loadLevel', this.loadLevel.bind(this));
        this.app.on('game:unloadLevel', this.unloadLevel.bind(this));
        this.app.on('game:switchLevel', this.switchLevel.bind(this));
        
        // Player events
        this.app.on('player:moved', this.onPlayerMoved.bind(this));
        this.app.on('player:respawn', this.onPlayerRespawn.bind(this));
        
        // Interactive object events
        this.app.on('interactive:trigger', this.onInteractiveTrigger.bind(this));
        this.app.on('door:open', this.onDoorOpen.bind(this));
        this.app.on('door:close', this.onDoorClose.bind(this));
        this.app.on('elevator:call', this.onElevatorCall.bind(this));
        
        // Network events
        this.app.on('network:levelSync', this.onNetworkLevelSync.bind(this));
        
        // Performance events
        this.app.on('performance:levelOptimize', this.optimizeLevel.bind(this));
    }

    // Level Loading/Unloading
    async loadLevel(levelId, options = {}) {
        const startTime = Date.now();
        
        try {
            console.log(`Loading level: ${levelId}`);
            
            const config = this.levelConfigs.get(levelId);
            if (!config) {
                throw new Error(`Level configuration not found: ${levelId}`);
            }

            // Check if level is already loaded
            if (this.loadedLevels.has(levelId)) {
                console.log(`Level ${levelId} already loaded`);
                return this.loadedLevels.get(levelId);
            }

            // Fire loading start event
            this.app.fire('level:loadStart', { levelId, config });

            // Create level instance
            const levelInstance = await this.createLevelInstance(levelId, config, options);
            
            // Load level assets
            await this.loadLevelAssets(levelInstance);
            
            // Initialize level systems
            await this.initializeLevelSystems(levelInstance);
            
            // Setup streaming if enabled
            if (config.streaming.enabled) {
                this.setupLevelStreaming(levelInstance);
            }
            
            // Setup interactive objects
            this.setupLevelInteractives(levelInstance);
            
            // Apply environmental settings
            this.applyEnvironmentalSettings(levelInstance);
            
            // Store level instance
            this.loadedLevels.set(levelId, levelInstance);
            this.currentLevel = levelInstance;
            
            // Update metrics
            const loadTime = Date.now() - startTime;
            this.updateLoadingMetrics(loadTime, true);
            
            // Fire loading complete event
            this.app.fire('level:loadComplete', { levelId, levelInstance, loadTime });
            
            console.log(`Level ${levelId} loaded successfully in ${loadTime}ms`);
            return levelInstance;
            
        } catch (error) {
            console.error(`Failed to load level ${levelId}:`, error);
            this.updateLoadingMetrics(Date.now() - startTime, false);
            this.app.fire('level:loadError', { levelId, error });
            throw error;
        }
    }

    async createLevelInstance(levelId, config, options) {
        const levelInstance = {
            id: levelId,
            config: config,
            options: options,
            entity: new pc.Entity(`Level_${levelId}`),
            assets: new Map(),
            systems: {},
            loadTime: Date.now(),
            isActive: false,
            streamingCells: new Map(),
            interactiveObjects: new Map(),
            spawnPoints: {
                team1: [],
                team2: [],
                ffa: [],
                objectives: []
            },
            environmentalState: {
                lighting: {},
                weather: {},
                audio: {},
                physics: {}
            }
        };

        // Add level entity to scene
        this.app.root.addChild(levelInstance.entity);
        
        return levelInstance;
    }

    async loadLevelAssets(levelInstance) {
        const config = levelInstance.config;
        const loadPromises = [];

        // Load environment assets
        if (config.assets.environment) {
            loadPromises.push(this.loadAsset(config.assets.environment, 'environment'));
        }

        // Load lightmap
        if (config.assets.lightmap) {
            loadPromises.push(this.loadAsset(config.assets.lightmap, 'lightmap'));
        }

        // Load audio assets
        if (config.assets.audio) {
            loadPromises.push(this.loadAsset(config.assets.audio, 'audio'));
        }

        // Load configuration data
        if (config.assets.config) {
            loadPromises.push(this.loadAsset(config.assets.config, 'config'));
        }

        // Wait for all assets to load
        const loadedAssets = await Promise.all(loadPromises);
        
        // Store assets in level instance
        loadedAssets.forEach(asset => {
            if (asset) {
                levelInstance.assets.set(asset.type, asset.data);
            }
        });
    }

    async loadAsset(assetName, assetType) {
        return new Promise((resolve, reject) => {
            // In a real implementation, this would load from PlayCanvas asset system
            // For now, we'll simulate asset loading
            setTimeout(() => {
                resolve({
                    type: assetType,
                    name: assetName,
                    data: { loaded: true, type: assetType }
                });
            }, 100 + Math.random() * 500); // Simulate load time
        });
    }

    async initializeLevelSystems(levelInstance) {
        const config = levelInstance.config;
        
        // Initialize spawn system
        this.initializeLevelSpawns(levelInstance);
        
        // Initialize navigation system
        if (config.navigation) {
            levelInstance.systems.navigation = this.initializeNavigation(levelInstance);
        }
        
        // Initialize physics system
        levelInstance.systems.physics = this.initializePhysics(levelInstance);
        
        // Initialize destruction system if needed
        if (config.destruction) {
            levelInstance.systems.destruction = this.initializeDestruction(levelInstance);
        }
        
        // Initialize cover system for AI
        levelInstance.systems.cover = this.initializeCoverSystem(levelInstance);
    }

    initializeLevelSpawns(levelInstance) {
        const config = levelInstance.config;
        
        // Create spawn points based on configuration
        Object.entries(config.spawnPoints).forEach(([spawnType, count]) => {
            for (let i = 0; i < count; i++) {
                const spawnPoint = this.createSpawnPoint(spawnType, i, levelInstance);
                levelInstance.spawnPoints[spawnType].push(spawnPoint);
            }
        });
    }

    createSpawnPoint(spawnType, index, levelInstance) {
        const spawnEntity = new pc.Entity(`SpawnPoint_${spawnType}_${index}`);
        
        // Position spawn points based on level layout
        const position = this.calculateSpawnPosition(spawnType, index, levelInstance);
        spawnEntity.setPosition(position);
        
        // Add spawn point script
        spawnEntity.addComponent('script');
        // spawnEntity.script.create('spawnPoint', { spawnType: spawnType });
        
        levelInstance.entity.addChild(spawnEntity);
        
        return {
            entity: spawnEntity,
            type: spawnType,
            index: index,
            position: position,
            isOccupied: false,
            lastUsed: 0
        };
    }

    calculateSpawnPosition(spawnType, index, levelInstance) {
        // This would be calculated based on level geometry and design
        // For now, we'll use a simple grid-based system
        const size = levelInstance.config.size;
        const gridSize = Math.ceil(Math.sqrt(index + 1));
        
        let x, z;
        
        switch (spawnType) {
            case 'team1':
                x = -size.x * 0.4 + (index % gridSize) * 10;
                z = -size.z * 0.4 + Math.floor(index / gridSize) * 10;
                break;
            case 'team2':
                x = size.x * 0.4 - (index % gridSize) * 10;
                z = size.z * 0.4 - Math.floor(index / gridSize) * 10;
                break;
            case 'ffa':
                x = (Math.random() - 0.5) * size.x * 0.8;
                z = (Math.random() - 0.5) * size.z * 0.8;
                break;
            case 'objectives':
                // Strategic positions for objectives
                const angle = (index / levelInstance.config.spawnPoints.objectives) * Math.PI * 2;
                const radius = Math.min(size.x, size.z) * 0.3;
                x = Math.cos(angle) * radius;
                z = Math.sin(angle) * radius;
                break;
            default:
                x = 0;
                z = 0;
        }
        
        return new pc.Vec3(x, 2, z); // Y=2 to spawn above ground
    }

    // Streaming System
    setupLevelStreaming(levelInstance) {
        const config = levelInstance.config;
        const streaming = config.streaming;
        
        if (!streaming.enabled) return;
        
        // Create streaming grid
        const cellSize = streaming.cellSize;
        const size = config.size;
        
        const cellsX = Math.ceil(size.x / cellSize);
        const cellsZ = Math.ceil(size.z / cellSize);
        
        for (let x = 0; x < cellsX; x++) {
            for (let z = 0; z < cellsZ; z++) {
                const cellId = `${x}_${z}`;
                const cell = {
                    id: cellId,
                    x: x,
                    z: z,
                    worldPos: new pc.Vec3(
                        (x - cellsX/2) * cellSize,
                        0,
                        (z - cellsZ/2) * cellSize
                    ),
                    size: cellSize,
                    isLoaded: false,
                    isActive: false,
                    assets: [],
                    entities: []
                };
                
                levelInstance.streamingCells.set(cellId, cell);
            }
        }
    }

    updateStreaming() {
        if (!this.currentLevel || !this.streamingEnabled) return;
        
        const config = this.currentLevel.config;
        if (!config.streaming.enabled) return;
        
        // Get player position (this would come from the player controller)
        this.updatePlayerPosition();
        
        // Calculate which cells should be active
        const activeCells = this.calculateActiveCells();
        
        // Load new cells
        activeCells.forEach(cellId => {
            if (!this.activeCells.has(cellId)) {
                this.loadStreamingCell(cellId);
            }
        });
        
        // Unload distant cells
        this.activeCells.forEach(cellId => {
            if (!activeCells.has(cellId)) {
                this.unloadStreamingCell(cellId);
            }
        });
        
        this.activeCells = activeCells;
    }

    updatePlayerPosition() {
        // Get position from local player
        const player = this.gameManager?.getLocalPlayer();
        if (player) {
            this.playerPosition.copy(player.getPosition());
        }
    }

    calculateActiveCells() {
        const activeCells = new Set();
        const config = this.currentLevel.config;
        const streaming = config.streaming;
        const cellSize = streaming.cellSize;
        const preloadRadius = streaming.preloadRadius;
        
        // Calculate player's cell
        const playerCellX = Math.floor(this.playerPosition.x / cellSize);
        const playerCellZ = Math.floor(this.playerPosition.z / cellSize);
        
        // Add cells within preload radius
        for (let x = playerCellX - preloadRadius; x <= playerCellX + preloadRadius; x++) {
            for (let z = playerCellZ - preloadRadius; z <= playerCellZ + preloadRadius; z++) {
                const cellId = `${x}_${z}`;
                if (this.currentLevel.streamingCells.has(cellId)) {
                    activeCells.add(cellId);
                }
            }
        }
        
        return activeCells;
    }

    loadStreamingCell(cellId) {
        const cell = this.currentLevel.streamingCells.get(cellId);
        if (!cell || cell.isLoaded) return;
        
        console.log(`Loading streaming cell: ${cellId}`);
        
        // Load cell assets (this would be asynchronous in a real implementation)
        this.loadCellAssets(cell).then(() => {
            cell.isLoaded = true;
            cell.isActive = true;
            
            // Enable cell entities
            cell.entities.forEach(entity => {
                entity.enabled = true;
            });
        });
    }

    unloadStreamingCell(cellId) {
        const cell = this.currentLevel.streamingCells.get(cellId);
        if (!cell || !cell.isLoaded) return;
        
        console.log(`Unloading streaming cell: ${cellId}`);
        
        // Disable cell entities
        cell.entities.forEach(entity => {
            entity.enabled = false;
        });
        
        // Unload assets if needed
        this.unloadCellAssets(cell);
        
        cell.isLoaded = false;
        cell.isActive = false;
    }

    async loadCellAssets(cell) {
        // Simulate loading cell-specific assets
        return new Promise(resolve => {
            setTimeout(() => {
                // Create some example entities for the cell
                for (let i = 0; i < 5; i++) {
                    const entity = new pc.Entity(`Cell_${cell.id}_Object_${i}`);
                    entity.setPosition(
                        cell.worldPos.x + Math.random() * cell.size,
                        Math.random() * 10,
                        cell.worldPos.z + Math.random() * cell.size
                    );
                    
                    this.currentLevel.entity.addChild(entity);
                    cell.entities.push(entity);
                }
                
                resolve();
            }, 50);
        });
    }

    unloadCellAssets(cell) {
        // Clean up cell assets
        cell.entities.forEach(entity => {
            entity.destroy();
        });
        cell.entities = [];
    }

    // Interactive Objects
    setupLevelInteractives(levelInstance) {
        const config = levelInstance.config;
        
        config.interactives.forEach(interactiveConfig => {
            for (let i = 0; i < interactiveConfig.count; i++) {
                this.createInteractiveObject(interactiveConfig.type, i, levelInstance);
            }
        });
    }

    createInteractiveObject(type, index, levelInstance) {
        const entity = new pc.Entity(`Interactive_${type}_${index}`);
        
        // Position based on type
        const position = this.calculateInteractivePosition(type, index, levelInstance);
        entity.setPosition(position);
        
        // Add appropriate components based on type
        switch (type) {
            case 'door':
                this.setupDoor(entity, index);
                break;
            case 'elevator':
                this.setupElevator(entity, index);
                break;
            case 'destructible':
                this.setupDestructible(entity, index);
                break;
            case 'conveyor':
                this.setupConveyor(entity, index);
                break;
            case 'crane':
                this.setupCrane(entity, index);
                break;
            case 'valve':
                this.setupValve(entity, index);
                break;
        }
        
        levelInstance.entity.addChild(entity);
        levelInstance.interactiveObjects.set(`${type}_${index}`, entity);
    }

    calculateInteractivePosition(type, index, levelInstance) {
        // Calculate positions based on level layout and type
        const size = levelInstance.config.size;
        
        // This would typically be loaded from level design data
        return new pc.Vec3(
            (Math.random() - 0.5) * size.x * 0.8,
            0,
            (Math.random() - 0.5) * size.z * 0.8
        );
    }

    setupDoor(entity, index) {
        // Add door functionality
        entity.addComponent('script');
        // entity.script.create('interactiveDoor', { doorId: index });
        
        // Add trigger zone
        const trigger = new pc.Entity('DoorTrigger');
        trigger.addComponent('collision', {
            type: 'box',
            halfExtents: [2, 2, 2]
        });
        trigger.addComponent('rigidbody', {
            type: 'kinematic'
        });
        
        entity.addChild(trigger);
        
        this.doors.set(index, {
            entity: entity,
            trigger: trigger,
            isOpen: false,
            isLocked: false,
            openTime: 0
        });
    }

    setupElevator(entity, index) {
        // Add elevator functionality
        entity.addComponent('script');
        // entity.script.create('elevator', { elevatorId: index });
        
        this.elevators.set(index, {
            entity: entity,
            currentFloor: 0,
            targetFloor: 0,
            isMoving: false,
            floors: [0, 10, 20], // Example floor heights
            speed: 2.0
        });
    }

    setupDestructible(entity, index) {
        // Add destructible functionality
        entity.addComponent('script');
        // entity.script.create('destructibleObject', { destructibleId: index });
        
        // Add health system
        entity.addComponent('script');
        // entity.script.create('healthSystem', { maxHealth: 100 });
    }

    // Environmental Settings
    applyEnvironmentalSettings(levelInstance) {
        const config = levelInstance.config;
        
        // Apply lighting settings
        this.applyLightingSettings(levelInstance, config.lighting);
        
        // Apply weather settings
        if (config.weather.enabled) {
            this.applyWeatherSettings(levelInstance, config.weather);
        }
        
        // Apply audio settings
        this.applyAudioSettings(levelInstance);
    }

    applyLightingSettings(levelInstance, lightingConfig) {
        // Create directional light (sun)
        const sunLight = new pc.Entity('SunLight');
        sunLight.addComponent('light', {
            type: 'directional',
            color: new pc.Color(1, 0.9, 0.8),
            intensity: lightingConfig.sunIntensity || 1.0,
            castShadows: lightingConfig.shadows !== 'off'
        });
        
        // Set sun position based on time of day
        this.setSunPosition(sunLight, lightingConfig.timeOfDay);
        
        levelInstance.entity.addChild(sunLight);
        levelInstance.environmentalState.lighting.sun = sunLight;
        
        // Add ambient lighting
        this.app.scene.ambientLight = new pc.Color(0.3, 0.3, 0.4);
        
        // Setup dynamic lighting if enabled
        if (lightingConfig.dynamic) {
            this.setupDynamicLighting(levelInstance);
        }
    }

    setSunPosition(sunLight, timeOfDay) {
        let elevation, azimuth;
        
        switch (timeOfDay) {
            case 'dawn':
                elevation = 10; // degrees
                azimuth = 90;
                break;
            case 'morning':
                elevation = 30;
                azimuth = 120;
                break;
            case 'afternoon':
                elevation = 60;
                azimuth = 180;
                break;
            case 'evening':
                elevation = 20;
                azimuth = 240;
                break;
            case 'night':
                elevation = -30;
                azimuth = 0;
                break;
            default:
                elevation = 45;
                azimuth = 180;
        }
        
        // Convert to radians and set rotation
        const elevRad = elevation * pc.math.DEG_TO_RAD;
        const azimRad = azimuth * pc.math.DEG_TO_RAD;
        
        sunLight.setEulerAngles(elevation, azimuth, 0);
    }

    setupDynamicLighting(levelInstance) {
        // Create dynamic lighting controller
        levelInstance.systems.lighting = {
            timeOfDay: 0, // 0-24 hours
            timeSpeed: 0.1, // Time progression speed
            update: (dt) => {
                // Update time of day and lighting
                levelInstance.systems.lighting.timeOfDay += dt * levelInstance.systems.lighting.timeSpeed;
                if (levelInstance.systems.lighting.timeOfDay >= 24) {
                    levelInstance.systems.lighting.timeOfDay = 0;
                }
                
                // Update sun position
                this.updateSunPosition(levelInstance);
            }
        };
    }

    updateSunPosition(levelInstance) {
        const lighting = levelInstance.systems.lighting;
        const sun = levelInstance.environmentalState.lighting.sun;
        
        if (!sun) return;
        
        // Calculate sun position based on time
        const timeRatio = lighting.timeOfDay / 24;
        const elevation = Math.sin(timeRatio * Math.PI * 2) * 90 - 30;
        const azimuth = timeRatio * 360;
        
        sun.setEulerAngles(elevation, azimuth, 0);
        
        // Adjust intensity based on elevation
        const intensity = Math.max(0, Math.sin(timeRatio * Math.PI * 2));
        sun.light.intensity = intensity;
    }

    applyWeatherSettings(levelInstance, weatherConfig) {
        if (!weatherConfig.enabled) return;
        
        // Initialize weather system
        levelInstance.systems.weather = {
            current: weatherConfig.default || 'clear',
            variants: weatherConfig.variants || [],
            transitionTime: 30, // seconds
            isTransitioning: false
        };
        
        // Apply initial weather
        this.setWeather(levelInstance, weatherConfig.default);
    }

    setWeather(levelInstance, weatherType) {
        const weather = levelInstance.systems.weather;
        if (!weather) return;
        
        weather.current = weatherType;
        
        // Apply weather effects based on type
        switch (weatherType) {
            case 'rain':
                this.enableRainEffects(levelInstance);
                break;
            case 'fog':
                this.enableFogEffects(levelInstance);
                break;
            case 'sandstorm':
                this.enableSandstormEffects(levelInstance);
                break;
            case 'clear':
                this.clearWeatherEffects(levelInstance);
                break;
        }
        
        this.app.fire('level:weatherChanged', { level: levelInstance, weather: weatherType });
    }

    applyAudioSettings(levelInstance) {
        // Setup ambient audio
        const ambientAudio = levelInstance.assets.get('audio');
        if (ambientAudio && this.audioManager) {
            this.audioManager.playAmbientLoop(ambientAudio, levelInstance.entity);
        }
        
        // Setup reverb zones
        this.setupReverbZones(levelInstance);
    }

    setupReverbZones(levelInstance) {
        // Create reverb zones for different areas
        const reverbZones = [
            { type: 'indoor', reverb: 'room' },
            { type: 'outdoor', reverb: 'outdoor' },
            { type: 'tunnel', reverb: 'tunnel' }
        ];
        
        reverbZones.forEach((zone, index) => {
            const reverbEntity = new pc.Entity(`ReverbZone_${index}`);
            reverbEntity.addComponent('script');
            // reverbEntity.script.create('reverbZone', { reverbType: zone.reverb });
            
            levelInstance.entity.addChild(reverbEntity);
        });
    }

    // Level switching and management
    async switchLevel(newLevelId, options = {}) {
        const currentLevelId = this.currentLevel?.id;
        
        if (currentLevelId === newLevelId) {
            console.log(`Already on level ${newLevelId}`);
            return;
        }
        
        console.log(`Switching from ${currentLevelId} to ${newLevelId}`);
        
        // Fire switch start event
        this.app.fire('level:switchStart', { from: currentLevelId, to: newLevelId });
        
        try {
            // Load new level
            const newLevel = await this.loadLevel(newLevelId, options);
            
            // Unload old level if specified
            if (options.unloadPrevious && currentLevelId) {
                this.unloadLevel(currentLevelId);
            }
            
            // Activate new level
            this.activateLevel(newLevelId);
            
            // Fire switch complete event
            this.app.fire('level:switchComplete', { from: currentLevelId, to: newLevelId });
            
        } catch (error) {
            console.error(`Failed to switch to level ${newLevelId}:`, error);
            this.app.fire('level:switchError', { from: currentLevelId, to: newLevelId, error });
            throw error;
        }
    }

    unloadLevel(levelId) {
        const levelInstance = this.loadedLevels.get(levelId);
        if (!levelInstance) {
            console.log(`Level ${levelId} not loaded`);
            return;
        }
        
        console.log(`Unloading level: ${levelId}`);
        
        // Fire unload start event
        this.app.fire('level:unloadStart', { levelId, levelInstance });
        
        // Deactivate level
        this.deactivateLevel(levelId);
        
        // Clean up systems
        this.cleanupLevelSystems(levelInstance);
        
        // Clean up streaming
        if (levelInstance.config.streaming.enabled) {
            this.cleanupLevelStreaming(levelInstance);
        }
        
        // Destroy level entity
        levelInstance.entity.destroy();
        
        // Remove from loaded levels
        this.loadedLevels.delete(levelId);
        
        // Update current level
        if (this.currentLevel === levelInstance) {
            this.currentLevel = null;
        }
        
        // Fire unload complete event
        this.app.fire('level:unloadComplete', { levelId });
        
        console.log(`Level ${levelId} unloaded`);
    }

    activateLevel(levelId) {
        const levelInstance = this.loadedLevels.get(levelId);
        if (!levelInstance) return;
        
        // Deactivate current level
        if (this.currentLevel && this.currentLevel !== levelInstance) {
            this.currentLevel.isActive = false;
            this.currentLevel.entity.enabled = false;
        }
        
        // Activate new level
        levelInstance.isActive = true;
        levelInstance.entity.enabled = true;
        this.currentLevel = levelInstance;
        
        // Update systems
        this.updateActiveLevelSystems(levelInstance);
        
        this.app.fire('level:activated', { levelId, levelInstance });
    }

    deactivateLevel(levelId) {
        const levelInstance = this.loadedLevels.get(levelId);
        if (!levelInstance) return;
        
        levelInstance.isActive = false;
        levelInstance.entity.enabled = false;
        
        this.app.fire('level:deactivated', { levelId, levelInstance });
    }

    // Event handlers
    onPlayerMoved(player) {
        if (player.isLocal) {
            this.playerPosition.copy(player.getPosition());
        }
    }

    onPlayerRespawn(player) {
        // Handle player respawn logic
        const spawnPoint = this.getOptimalSpawnPoint(player.team);
        if (spawnPoint) {
            player.setPosition(spawnPoint.position);
        }
    }

    onInteractiveTrigger(data) {
        const { objectId, player, action } = data;
        
        // Handle interactive object triggers
        const interactiveObject = this.currentLevel?.interactiveObjects.get(objectId);
        if (interactiveObject) {
            this.app.fire(`interactive:${action}`, { object: interactiveObject, player });
        }
    }

    onDoorOpen(doorId) {
        const door = this.doors.get(doorId);
        if (door && !door.isOpen && !door.isLocked) {
            door.isOpen = true;
            door.openTime = Date.now();
            
            // Animate door opening
            this.animateDoor(door, true);
            
            // Play door sound
            this.audioManager?.playSound('door_open', door.entity.getPosition());
        }
    }

    onDoorClose(doorId) {
        const door = this.doors.get(doorId);
        if (door && door.isOpen) {
            door.isOpen = false;
            
            // Animate door closing
            this.animateDoor(door, false);
            
            // Play door sound
            this.audioManager?.playSound('door_close', door.entity.getPosition());
        }
    }

    onElevatorCall(data) {
        const { elevatorId, targetFloor } = data;
        const elevator = this.elevators.get(elevatorId);
        
        if (elevator && !elevator.isMoving) {
            this.moveElevator(elevator, targetFloor);
        }
    }

    // Utility methods
    getOptimalSpawnPoint(team) {
        if (!this.currentLevel) return null;
        
        const spawnPoints = this.currentLevel.spawnPoints[team] || this.currentLevel.spawnPoints.ffa;
        if (!spawnPoints.length) return null;
        
        // Find least recently used spawn point
        let bestSpawn = spawnPoints[0];
        let oldestTime = bestSpawn.lastUsed;
        
        spawnPoints.forEach(spawn => {
            if (!spawn.isOccupied && spawn.lastUsed < oldestTime) {
                bestSpawn = spawn;
                oldestTime = spawn.lastUsed;
            }
        });
        
        bestSpawn.lastUsed = Date.now();
        return bestSpawn;
    }

    animateDoor(door, isOpening) {
        // Simple door animation - rotate around Y axis
        const targetRotation = isOpening ? 90 : 0;
        
        // This would use the PlayCanvas tween system in a real implementation
        const startRotation = door.entity.getEulerAngles().y;
        const animationTime = 1000; // 1 second
        const startTime = Date.now();
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / animationTime, 1);
            
            const currentRotation = pc.math.lerp(startRotation, targetRotation, progress);
            door.entity.setEulerAngles(0, currentRotation, 0);
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        animate();
    }

    moveElevator(elevator, targetFloor) {
        if (targetFloor < 0 || targetFloor >= elevator.floors.length) return;
        
        elevator.isMoving = true;
        elevator.targetFloor = targetFloor;
        
        const startHeight = elevator.floors[elevator.currentFloor];
        const targetHeight = elevator.floors[targetFloor];
        const distance = Math.abs(targetHeight - startHeight);
        const moveTime = distance / elevator.speed * 1000; // Convert to milliseconds
        
        const startTime = Date.now();
        const startPosition = elevator.entity.getPosition();
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / moveTime, 1);
            
            const currentHeight = pc.math.lerp(startHeight, targetHeight, progress);
            const newPosition = startPosition.clone();
            newPosition.y = currentHeight;
            elevator.entity.setPosition(newPosition);
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                elevator.currentFloor = targetFloor;
                elevator.isMoving = false;
                this.app.fire('elevator:arrived', { elevatorId: elevator.elevatorId, floor: targetFloor });
            }
        };
        
        animate();
    }

    enableRainEffects(levelInstance) {
        // Enable rain particle system
        // Adjust lighting
        // Add rain sound
    }

    enableFogEffects(levelInstance) {
        // Reduce render distance
        // Add fog particles
        // Adjust ambient lighting
    }

    enableSandstormEffects(levelInstance) {
        // Add sand particles
        // Reduce visibility
        // Add wind sound
    }

    clearWeatherEffects(levelInstance) {
        // Remove all weather effects
        // Reset visibility and lighting
    }

    cleanupLevelSystems(levelInstance) {
        // Clean up all level-specific systems
        if (levelInstance.systems.lighting?.update) {
            // Stop lighting updates
        }
        
        if (levelInstance.systems.weather) {
            // Clean up weather system
        }
        
        // Clear interactive objects
        levelInstance.interactiveObjects.clear();
    }

    cleanupLevelStreaming(levelInstance) {
        // Unload all streaming cells
        levelInstance.streamingCells.forEach(cell => {
            if (cell.isLoaded) {
                this.unloadCellAssets(cell);
            }
        });
        
        levelInstance.streamingCells.clear();
    }

    updateActiveLevelSystems(levelInstance) {
        // Update systems for the active level
        if (levelInstance.systems.lighting?.update) {
            // Start lighting updates
        }
    }

    updateLoadingMetrics(loadTime, success) {
        this.loadingMetrics.totalLoads++;
        
        if (success) {
            this.loadingMetrics.currentLoadTime = loadTime;
            this.loadingMetrics.averageLoadTime = 
                (this.loadingMetrics.averageLoadTime + loadTime) / 2;
        } else {
            this.loadingMetrics.failedLoads++;
        }
    }

    optimizeLevel() {
        if (!this.currentLevel) return;
        
        // Optimize current level based on performance
        if (this.performanceManager) {
            const performance = this.performanceManager.getPerformanceMetrics();
            
            if (performance.fps < 30) {
                // Reduce level quality
                this.reduceLevelQuality();
            }
        }
    }

    reduceLevelQuality() {
        // Implement level quality reduction
        // Reduce streaming distance
        this.streamingDistance *= 0.8;
        
        // Reduce shadow quality
        // Disable non-essential effects
    }

    // Public API
    getCurrentLevel() {
        return this.currentLevel;
    }

    getLevelConfig(levelId) {
        return this.levelConfigs.get(levelId);
    }

    getAllLevelConfigs() {
        return Array.from(this.levelConfigs.values());
    }

    isLevelLoaded(levelId) {
        return this.loadedLevels.has(levelId);
    }

    getLoadingMetrics() {
        return { ...this.loadingMetrics };
    }

    getStreamingStatus() {
        if (!this.currentLevel) return null;
        
        return {
            activeCells: this.activeCells.size,
            totalCells: this.currentLevel.streamingCells.size,
            streamingDistance: this.streamingDistance,
            playerPosition: this.playerPosition.clone()
        };
    }

    update(dt) {
        // Update active level systems
        if (this.currentLevel && this.currentLevel.systems.lighting?.update) {
            this.currentLevel.systems.lighting.update(dt);
        }
        
        // Update streaming system
        if (this.streamingEnabled) {
            // Streaming updates are handled by interval
        }
        
        // Update interactive objects
        this.updateInteractiveObjects(dt);
    }

    updateInteractiveObjects(dt) {
        // Update doors (auto-close after timeout)
        this.doors.forEach((door, doorId) => {
            if (door.isOpen && Date.now() - door.openTime > 10000) { // 10 seconds
                this.onDoorClose(doorId);
            }
        });
        
        // Update elevators
        this.elevators.forEach((elevator, elevatorId) => {
            // Elevator movement is handled in moveElevator method
        });
    }
}

pc.registerScript(LevelManager, 'LevelManager');
