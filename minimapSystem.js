var MinimapSystem = pc.createScript('minimapSystem');

MinimapSystem.attributes.add('minimapCamera', { type: 'entity' });
MinimapSystem.attributes.add('minimapSize', { type: 'number', default: 200 });
MinimapSystem.attributes.add('mapScale', { type: 'number', default: 1.0 });
MinimapSystem.attributes.add('updateRate', { type: 'number', default: 30 }); // FPS
MinimapSystem.attributes.add('radarRange', { type: 'number', default: 50 });
MinimapSystem.attributes.add('showEnemies', { type: 'boolean', default: false });
MinimapSystem.attributes.add('showObjectives', { type: 'boolean', default: true });
MinimapSystem.attributes.add('rotateWithPlayer', { type: 'boolean', default: true });
MinimapSystem.attributes.add('zoomLevels', { type: 'json', default: [0.5, 1.0, 2.0, 4.0] });

MinimapSystem.prototype.initialize = function() {
    // Minimap state
    this.isEnabled = true;
    this.currentZoomIndex = 1;
    this.currentZoom = this.zoomLevels[this.currentZoomIndex];
    this.mapRotation = 0;
    
    // Player tracking
    this.localPlayer = null;
    this.trackedEntities = new Map();
    this.staticMarkers = new Map();
    
    // Update timing
    this.lastUpdateTime = 0;
    this.updateInterval = 1000 / this.updateRate;
    
    // UI elements
    this.minimapUI = null;
    this.playerBlips = new Map();
    this.objectiveBlips = new Map();
    this.markerBlips = new Map();
    
    // Minimap bounds
    this.mapBounds = {
        min: new pc.Vec2(-100, -100),
        max: new pc.Vec2(100, 100)
    };
    
    // Blip types and colors
    this.blipConfig = {
        'local_player': { color: '#00FF00', size: 8, shape: 'triangle' },
        'teammate': { color: '#0080FF', size: 6, shape: 'circle' },
        'enemy': { color: '#FF0000', size: 6, shape: 'circle' },
        'objective': { color: '#FFD700', size: 10, shape: 'diamond' },
        'weapon': { color: '#FF8000', size: 4, shape: 'square' },
        'item': { color: '#FFFFFF', size: 3, shape: 'circle' },
        'vehicle': { color: '#800080', size: 8, shape: 'square' },
        'hazard': { color: '#FF4444', size: 6, shape: 'triangle' },
        'waypoint': { color: '#00FFFF', size: 8, shape: 'star' }
    };
    
    // Initialize minimap
    this.setupMinimap();
    this.calculateMapBounds();
    
    // Bind events
    this.app.on('minimap:toggle', this.toggleMinimap, this);
    this.app.on('minimap:zoom', this.zoomMinimap, this);
    this.app.on('minimap:addMarker', this.addMarker, this);
    this.app.on('minimap:removeMarker', this.removeMarker, this);
    this.app.on('minimap:trackEntity', this.trackEntity, this);
    this.app.on('minimap:untrackEntity', this.untrackEntity, this);
    this.app.on('player:spawned', this.onPlayerSpawned, this);
    this.app.on('objective:created', this.onObjectiveCreated, this);
    this.app.on('objective:completed', this.onObjectiveCompleted, this);
    
    // Keyboard bindings for zoom
    this.app.keyboard.on(pc.EVENT_KEYDOWN, this.onKeyDown, this);
    
    console.log('MinimapSystem initialized');
};

MinimapSystem.prototype.setupMinimap = function() {
    // Create minimap UI container
    this.minimapUI = new pc.Entity('MinimapUI');
    this.minimapUI.addComponent('element', {
        type: pc.ELEMENTTYPE_GROUP,
        anchor: [1, 1, 1, 1],
        pivot: [1, 1],
        width: this.minimapSize,
        height: this.minimapSize,
        useInput: true
    });
    
    // Position in top-right corner
    this.minimapUI.setLocalPosition(-this.minimapSize/2 - 20, -this.minimapSize/2 - 20, 0);
    
    // Create background
    this.createMinimapBackground();
    
    // Create border
    this.createMinimapBorder();
    
    // Create center marker (local player)
    this.createCenterMarker();
    
    // Create zoom indicator
    this.createZoomIndicator();
    
    // Add to UI container
    const uiContainer = this.app.root.findByName('UI_Container');
    if (uiContainer) {
        uiContainer.addChild(this.minimapUI);
    } else {
        this.app.root.addChild(this.minimapUI);
    }
    
    // Setup minimap camera if provided
    if (this.minimapCamera) {
        this.setupMinimapCamera();
    }
};

MinimapSystem.prototype.createMinimapBackground = function() {
    const background = new pc.Entity('MinimapBackground');
    background.addComponent('element', {
        type: pc.ELEMENTTYPE_IMAGE,
        color: new pc.Color(0.1, 0.1, 0.1, 0.8),
        anchor: [0, 0, 1, 1],
        pivot: [0.5, 0.5]
    });
    
    this.minimapUI.addChild(background);
    this.minimapBackground = background;
};

MinimapSystem.prototype.createMinimapBorder = function() {
    const border = new pc.Entity('MinimapBorder');
    border.addComponent('element', {
        type: pc.ELEMENTTYPE_IMAGE,
        color: new pc.Color(1, 1, 1, 0.5),
        anchor: [0, 0, 1, 1],
        pivot: [0.5, 0.5],
        margin: new pc.Vec4(2, 2, 2, 2)
    });
    
    this.minimapUI.addChild(border);
};

MinimapSystem.prototype.createCenterMarker = function() {
    this.centerMarker = new pc.Entity('CenterMarker');
    this.centerMarker.addComponent('element', {
        type: pc.ELEMENTTYPE_IMAGE,
        color: new pc.Color(0, 1, 0, 1),
        anchor: [0.5, 0.5, 0.5, 0.5],
        pivot: [0.5, 0.5],
        width: 8,
        height: 8
    });
    
    this.minimapUI.addChild(this.centerMarker);
};

MinimapSystem.prototype.createZoomIndicator = function() {
    this.zoomIndicator = new pc.Entity('ZoomIndicator');
    this.zoomIndicator.addComponent('element', {
        type: pc.ELEMENTTYPE_TEXT,
        text: '1.0x',
        fontSize: 12,
        color: new pc.Color(1, 1, 1, 0.8),
        anchor: [0, 0, 0, 0],
        pivot: [0, 0]
    });
    
    this.zoomIndicator.setLocalPosition(5, 5, 0);
    this.minimapUI.addChild(this.zoomIndicator);
    this.updateZoomIndicator();
};

MinimapSystem.prototype.setupMinimapCamera = function() {
    // Configure overhead camera for minimap rendering
    this.minimapCamera.camera.projection = pc.PROJECTION_ORTHOGRAPHIC;
    this.minimapCamera.camera.orthoHeight = this.radarRange;
    this.minimapCamera.camera.nearClip = 0.1;
    this.minimapCamera.camera.farClip = 200;
    this.minimapCamera.camera.clearColor = new pc.Color(0.1, 0.1, 0.1, 0);
    
    // Create render target for minimap
    const device = this.app.graphicsDevice;
    const renderTarget = new pc.RenderTarget({
        colorBuffer: device.createTexture({
            width: 256,
            height: 256,
            format: pc.PIXELFORMAT_R8_G8_B8_A8,
            autoMipmap: true
        }),
        depth: true
    });
    
    this.minimapCamera.camera.renderTarget = renderTarget;
    
    // Apply texture to minimap background
    if (this.minimapBackground && this.minimapBackground.element) {
        this.minimapBackground.element.textureAsset = renderTarget.colorBuffer;
    }
};

MinimapSystem.prototype.calculateMapBounds = function() {
    // Calculate map bounds from level geometry
    const levelContainer = this.app.root.findByName('Level_Container');
    if (!levelContainer) return;
    
    let minX = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxZ = -Infinity;
    
    const calculateBounds = (entity) => {
        if (entity.model && entity.enabled) {
            const pos = entity.getPosition();
            const scale = entity.getLocalScale();
            
            minX = Math.min(minX, pos.x - scale.x);
            maxX = Math.max(maxX, pos.x + scale.x);
            minZ = Math.min(minZ, pos.z - scale.z);
            maxZ = Math.max(maxZ, pos.z + scale.z);
        }
        
        entity.children.forEach(child => calculateBounds(child));
    };
    
    calculateBounds(levelContainer);
    
    if (minX !== Infinity) {
        this.mapBounds.min.set(minX, minZ);
        this.mapBounds.max.set(maxX, maxZ);
        
        console.log('Map bounds calculated:', this.mapBounds);
    }
};

MinimapSystem.prototype.update = function(dt) {
    if (!this.isEnabled) return;
    
    const currentTime = Date.now();
    
    // Update at specified rate
    if (currentTime - this.lastUpdateTime >= this.updateInterval) {
        this.updateMinimap();
        this.lastUpdateTime = currentTime;
    }
    
    this.updateMinimapCamera();
};

MinimapSystem.prototype.updateMinimap = function() {
    // Find local player if not set
    if (!this.localPlayer) {
        this.localPlayer = this.app.root.findByName('Local_Player');
    }
    
    if (!this.localPlayer) return;
    
    // Update player rotation for minimap orientation
    if (this.rotateWithPlayer) {
        const playerRotation = this.localPlayer.getRotation();
        this.mapRotation = playerRotation.getEulerAngles().y;
        this.minimapUI.setLocalEulerAngles(0, 0, -this.mapRotation);
    }
    
    // Update all tracked entities
    this.updateTrackedEntities();
    
    // Update blips
    this.updateBlips();
};

MinimapSystem.prototype.updateMinimapCamera = function() {
    if (!this.minimapCamera || !this.localPlayer) return;
    
    // Position camera above player
    const playerPos = this.localPlayer.getPosition();
    this.minimapCamera.setPosition(playerPos.x, playerPos.y + 50, playerPos.z);
    
    // Set camera zoom based on current zoom level
    this.minimapCamera.camera.orthoHeight = this.radarRange / this.currentZoom;
    
    // Rotate camera with player if enabled
    if (this.rotateWithPlayer) {
        const playerRotation = this.localPlayer.getRotation();
        this.minimapCamera.setRotation(playerRotation);
    }
};

MinimapSystem.prototype.updateTrackedEntities = function() {
    // Update player entities
    const players = this.app.root.findByTag('player');
    players.forEach(player => {
        if (player.enabled) {
            this.updatePlayerBlip(player);
        }
    });
    
    // Update objective entities
    const objectives = this.app.root.findByTag('objective');
    objectives.forEach(objective => {
        if (objective.enabled) {
            this.updateObjectiveBlip(objective);
        }
    });
    
    // Update tracked entities
    this.trackedEntities.forEach((data, entity) => {
        if (entity.enabled) {
            this.updateEntityBlip(entity, data.type);
        }
    });
};

MinimapSystem.prototype.updatePlayerBlip = function(player) {
    if (!this.isEntityInRange(player)) {
        this.removeBlip(player, 'player');
        return;
    }
    
    let blipType = 'enemy';
    if (player === this.localPlayer) {
        return; // Local player is represented by center marker
    } else if (this.isSameTeam(player, this.localPlayer)) {
        blipType = 'teammate';
    } else if (!this.showEnemies) {
        this.removeBlip(player, 'player');
        return;
    }
    
    this.createOrUpdateBlip(player, blipType, 'player');
};

MinimapSystem.prototype.updateObjectiveBlip = function(objective) {
    if (!this.showObjectives) {
        this.removeBlip(objective, 'objective');
        return;
    }
    
    this.createOrUpdateBlip(objective, 'objective', 'objective');
};

MinimapSystem.prototype.updateEntityBlip = function(entity, type) {
    if (!this.isEntityInRange(entity)) {
        this.removeBlip(entity, 'tracked');
        return;
    }
    
    this.createOrUpdateBlip(entity, type, 'tracked');
};

MinimapSystem.prototype.createOrUpdateBlip = function(entity, blipType, category) {
    const blipId = entity.getGuid();
    let blipMap = this.getBlipMap(category);
    
    let blip = blipMap.get(blipId);
    if (!blip) {
        blip = this.createBlip(entity, blipType);
        blipMap.set(blipId, blip);
        this.minimapUI.addChild(blip);
    }
    
    // Update position
    this.updateBlipPosition(blip, entity);
    
    // Update appearance if type changed
    if (blip.blipType !== blipType) {
        this.updateBlipAppearance(blip, blipType);
        blip.blipType = blipType;
    }
};

MinimapSystem.prototype.createBlip = function(entity, blipType) {
    const config = this.blipConfig[blipType] || this.blipConfig['item'];
    
    const blip = new pc.Entity('Blip_' + blipType);
    blip.addComponent('element', {
        type: pc.ELEMENTTYPE_IMAGE,
        color: pc.Color.fromString(config.color),
        anchor: [0.5, 0.5, 0.5, 0.5],
        pivot: [0.5, 0.5],
        width: config.size,
        height: config.size
    });
    
    blip.blipType = blipType;
    blip.targetEntity = entity;
    
    // Set shape based on config
    this.setBlipShape(blip, config.shape);
    
    return blip;
};

MinimapSystem.prototype.setBlipShape = function(blip, shape) {
    // This would set different textures or materials based on shape
    // For now, we'll use a simple approach with rotation
    switch (shape) {
        case 'triangle':
            blip.setLocalEulerAngles(0, 0, 0);
            break;
        case 'diamond':
            blip.setLocalEulerAngles(0, 0, 45);
            break;
        case 'star':
            // Would need special texture
            break;
    }
};

MinimapSystem.prototype.updateBlipPosition = function(blip, entity) {
    if (!this.localPlayer) return;
    
    const playerPos = this.localPlayer.getPosition();
    const entityPos = entity.getPosition();
    
    // Calculate relative position
    const relativePos = new pc.Vec2(
        entityPos.x - playerPos.x,
        entityPos.z - playerPos.z
    );
    
    // Apply rotation if minimap rotates with player
    if (this.rotateWithPlayer) {
        const cos = Math.cos(-this.mapRotation * pc.math.DEG_TO_RAD);
        const sin = Math.sin(-this.mapRotation * pc.math.DEG_TO_RAD);
        const rotatedX = relativePos.x * cos - relativePos.y * sin;
        const rotatedY = relativePos.x * sin + relativePos.y * cos;
        relativePos.set(rotatedX, rotatedY);
    }
    
    // Scale to minimap coordinates
    const scale = (this.minimapSize / 2) / (this.radarRange / this.currentZoom);
    const blipPos = new pc.Vec2(
        relativePos.x * scale,
        -relativePos.y * scale // Flip Y for UI coordinates
    );
    
    // Clamp to minimap bounds
    const maxOffset = this.minimapSize / 2 - 5;
    blipPos.x = pc.math.clamp(blipPos.x, -maxOffset, maxOffset);
    blipPos.y = pc.math.clamp(blipPos.y, -maxOffset, maxOffset);
    
    blip.setLocalPosition(blipPos.x, blipPos.y, 0);
    
    // Fade out blips near edge
    const edgeDistance = Math.sqrt(blipPos.x * blipPos.x + blipPos.y * blipPos.y);
    const fadeStart = maxOffset * 0.8;
    if (edgeDistance > fadeStart) {
        const fadeAmount = 1 - ((edgeDistance - fadeStart) / (maxOffset - fadeStart));
        blip.element.opacity = fadeAmount;
    } else {
        blip.element.opacity = 1;
    }
};

MinimapSystem.prototype.updateBlipAppearance = function(blip, blipType) {
    const config = this.blipConfig[blipType] || this.blipConfig['item'];
    
    blip.element.color = pc.Color.fromString(config.color);
    blip.element.width = config.size;
    blip.element.height = config.size;
    
    this.setBlipShape(blip, config.shape);
};

MinimapSystem.prototype.removeBlip = function(entity, category) {
    const blipId = entity.getGuid();
    const blipMap = this.getBlipMap(category);
    
    const blip = blipMap.get(blipId);
    if (blip) {
        blip.destroy();
        blipMap.delete(blipId);
    }
};

MinimapSystem.prototype.getBlipMap = function(category) {
    switch (category) {
        case 'player':
            return this.playerBlips;
        case 'objective':
            return this.objectiveBlips;
        case 'tracked':
            return this.markerBlips;
        default:
            return this.markerBlips;
    }
};

MinimapSystem.prototype.updateBlips = function() {
    // Remove blips for destroyed entities
    this.cleanupDestroyedBlips();
    
    // Update blip visibility based on distance
    this.updateBlipVisibility();
};

MinimapSystem.prototype.cleanupDestroyedBlips = function() {
    const cleanupMap = (blipMap) => {
        blipMap.forEach((blip, entityId) => {
            if (!blip.targetEntity || !blip.targetEntity.enabled) {
                blip.destroy();
                blipMap.delete(entityId);
            }
        });
    };
    
    cleanupMap(this.playerBlips);
    cleanupMap(this.objectiveBlips);
    cleanupMap(this.markerBlips);
};

MinimapSystem.prototype.updateBlipVisibility = function() {
    // Could implement sophisticated visibility rules here
    // For now, all blips in range are visible
};

MinimapSystem.prototype.isEntityInRange = function(entity) {
    if (!this.localPlayer) return false;
    
    const distance = this.localPlayer.getPosition().distance(entity.getPosition());
    return distance <= this.radarRange;
};

MinimapSystem.prototype.isSameTeam = function(player1, player2) {
    if (!player1 || !player2) return false;
    
    if (player1.tags.has('blue_team') && player2.tags.has('blue_team')) return true;
    if (player1.tags.has('red_team') && player2.tags.has('red_team')) return true;
    
    return false;
};

MinimapSystem.prototype.onKeyDown = function(event) {
    switch (event.key) {
        case pc.KEY_EQUAL: // +/= key
            this.zoomIn();
            break;
        case pc.KEY_MINUS:
            this.zoomOut();
            break;
        case pc.KEY_N:
            this.toggleMinimap();
            break;
    }
};

MinimapSystem.prototype.toggleMinimap = function() {
    this.isEnabled = !this.isEnabled;
    this.minimapUI.enabled = this.isEnabled;
    
    this.app.fire('ui:minimapToggled', { enabled: this.isEnabled });
};

MinimapSystem.prototype.zoomMinimap = function(data) {
    if (data.direction === 'in') {
        this.zoomIn();
    } else if (data.direction === 'out') {
        this.zoomOut();
    } else if (data.level !== undefined) {
        this.setZoom(data.level);
    }
};

MinimapSystem.prototype.zoomIn = function() {
    if (this.currentZoomIndex < this.zoomLevels.length - 1) {
        this.currentZoomIndex++;
        this.currentZoom = this.zoomLevels[this.currentZoomIndex];
        this.updateZoomIndicator();
    }
};

MinimapSystem.prototype.zoomOut = function() {
    if (this.currentZoomIndex > 0) {
        this.currentZoomIndex--;
        this.currentZoom = this.zoomLevels[this.currentZoomIndex];
        this.updateZoomIndicator();
    }
};

MinimapSystem.prototype.setZoom = function(zoomLevel) {
    const index = this.zoomLevels.indexOf(zoomLevel);
    if (index >= 0) {
        this.currentZoomIndex = index;
        this.currentZoom = zoomLevel;
        this.updateZoomIndicator();
    }
};

MinimapSystem.prototype.updateZoomIndicator = function() {
    if (this.zoomIndicator && this.zoomIndicator.element) {
        this.zoomIndicator.element.text = this.currentZoom.toFixed(1) + 'x';
    }
};

MinimapSystem.prototype.addMarker = function(data) {
    const { position, type = 'waypoint', id, duration } = data;
    
    // Create marker entity
    const marker = new pc.Entity('MapMarker_' + (id || Date.now()));
    marker.setPosition(position);
    
    // Add to tracked entities
    this.trackedEntities.set(marker, { type: type });
    
    // Add to static markers
    this.staticMarkers.set(id || marker.getGuid(), {
        entity: marker,
        type: type,
        duration: duration
    });
    
    // Remove after duration if specified
    if (duration) {
        setTimeout(() => {
            this.removeMarker({ id: id || marker.getGuid() });
        }, duration);
    }
    
    console.log('Minimap marker added:', type, position.toString());
};

MinimapSystem.prototype.removeMarker = function(data) {
    const { id } = data;
    const marker = this.staticMarkers.get(id);
    
    if (marker) {
        this.trackedEntities.delete(marker.entity);
        this.removeBlip(marker.entity, 'tracked');
        marker.entity.destroy();
        this.staticMarkers.delete(id);
    }
};

MinimapSystem.prototype.trackEntity = function(data) {
    const { entity, type = 'item' } = data;
    this.trackedEntities.set(entity, { type: type });
};

MinimapSystem.prototype.untrackEntity = function(data) {
    const { entity } = data;
    this.trackedEntities.delete(entity);
    this.removeBlip(entity, 'tracked');
};

MinimapSystem.prototype.onPlayerSpawned = function(data) {
    // Track new player
    if (data.isLocal) {
        this.localPlayer = data.entity;
    }
};

MinimapSystem.prototype.onObjectiveCreated = function(data) {
    // Automatically track objectives
    this.trackEntity({ entity: data.entity, type: 'objective' });
};

MinimapSystem.prototype.onObjectiveCompleted = function(data) {
    // Stop tracking completed objectives
    this.untrackEntity({ entity: data.entity });
};

MinimapSystem.prototype.worldToMinimapCoords = function(worldPos) {
    if (!this.localPlayer) return new pc.Vec2(0, 0);
    
    const playerPos = this.localPlayer.getPosition();
    const relativePos = new pc.Vec2(
        worldPos.x - playerPos.x,
        worldPos.z - playerPos.z
    );
    
    // Apply rotation if needed
    if (this.rotateWithPlayer) {
        const cos = Math.cos(-this.mapRotation * pc.math.DEG_TO_RAD);
        const sin = Math.sin(-this.mapRotation * pc.math.DEG_TO_RAD);
        const rotatedX = relativePos.x * cos - relativePos.y * sin;
        const rotatedY = relativePos.x * sin + relativePos.y * cos;
        relativePos.set(rotatedX, rotatedY);
    }
    
    // Scale to minimap coordinates
    const scale = (this.minimapSize / 2) / (this.radarRange / this.currentZoom);
    return new pc.Vec2(
        relativePos.x * scale,
        -relativePos.y * scale
    );
};

MinimapSystem.prototype.minimapToWorldCoords = function(minimapPos) {
    if (!this.localPlayer) return new pc.Vec3(0, 0, 0);
    
    const playerPos = this.localPlayer.getPosition();
    
    // Scale from minimap coordinates
    const scale = (this.radarRange / this.currentZoom) / (this.minimapSize / 2);
    let relativePos = new pc.Vec2(
        minimapPos.x * scale,
        -minimapPos.y * scale
    );
    
    // Apply inverse rotation if needed
    if (this.rotateWithPlayer) {
        const cos = Math.cos(this.mapRotation * pc.math.DEG_TO_RAD);
        const sin = Math.sin(this.mapRotation * pc.math.DEG_TO_RAD);
        const rotatedX = relativePos.x * cos - relativePos.y * sin;
        const rotatedY = relativePos.x * sin + relativePos.y * cos;
        relativePos.set(rotatedX, rotatedY);
    }
    
    return new pc.Vec3(
        playerPos.x + relativePos.x,
        playerPos.y,
        playerPos.z + relativePos.y
    );
};

MinimapSystem.prototype.setSize = function(size) {
    this.minimapSize = size;
    this.minimapUI.element.width = size;
    this.minimapUI.element.height = size;
    this.minimapUI.setLocalPosition(-size/2 - 20, -size/2 - 20, 0);
};

MinimapSystem.prototype.setOpacity = function(opacity) {
    this.minimapUI.element.opacity = opacity;
};

MinimapSystem.prototype.getMinimapStats = function() {
    return {
        isEnabled: this.isEnabled,
        currentZoom: this.currentZoom,
        trackedEntities: this.trackedEntities.size,
        staticMarkers: this.staticMarkers.size,
        playerBlips: this.playerBlips.size,
        objectiveBlips: this.objectiveBlips.size,
        markerBlips: this.markerBlips.size
    };
};