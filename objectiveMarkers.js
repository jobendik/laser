/**
 * ObjectiveMarkers.js
 * Manages 3D and UI markers for game objectives, waypoints, and points of interest
 */

class ObjectiveMarkers extends pc.ScriptType {
    static get scriptName() { return 'ObjectiveMarkers'; }

    initialize() {
        this.gameManager = this.app.root.findByName('Game_Manager').script.gameManager;
        this.camera = this.app.root.findByName('Player').findByName('Head').camera;
        this.hudManager = this.app.root.findByName('Game_Manager').script.hudManager;
        
        // Marker tracking
        this.activeMarkers = new Map();
        this.markerPool = [];
        this.compassMarkers = [];
        
        // Marker types
        this.markerTypes = {
            objective: {
                color: new pc.Color(1, 1, 0, 1),
                icon: '⭐',
                size: 1.5,
                priority: 10,
                showDistance: true,
                showOnCompass: true,
                blinking: true
            },
            waypoint: {
                color: new pc.Color(0, 1, 1, 1),
                icon: '📍',
                size: 1.0,
                priority: 5,
                showDistance: true,
                showOnCompass: true,
                blinking: false
            },
            enemy: {
                color: new pc.Color(1, 0, 0, 1),
                icon: '⚠️',
                size: 1.2,
                priority: 8,
                showDistance: true,
                showOnCompass: true,
                blinking: true,
                timeout: 10000
            },
            teammate: {
                color: new pc.Color(0, 1, 0, 1),
                icon: '👤',
                size: 0.8,
                priority: 3,
                showDistance: false,
                showOnCompass: true,
                blinking: false
            },
            item: {
                color: new pc.Color(1, 0.5, 0, 1),
                icon: '📦',
                size: 0.7,
                priority: 2,
                showDistance: false,
                showOnCompass: false,
                blinking: false
            },
            flag: {
                color: new pc.Color(0, 0.5, 1, 1),
                icon: '🚩',
                size: 1.3,
                priority: 9,
                showDistance: true,
                showOnCompass: true,
                blinking: true
            },
            capture_point: {
                color: new pc.Color(0.8, 0.8, 0.8, 1),
                icon: '🎯',
                size: 1.4,
                priority: 7,
                showDistance: true,
                showOnCompass: true,
                blinking: false
            }
        };
        
        // Settings
        this.maxRenderDistance = 200;
        this.fadeStartDistance = 150;
        this.maxMarkers = 50;
        this.updateInterval = 100; // ms
        this.lastUpdateTime = 0;
        
        this.initializeMarkerPool();
        this.createCompassContainer();
        this.setupEventListeners();
    }

    initializeMarkerPool() {
        for (let i = 0; i < this.maxMarkers; i++) {
            const marker = this.createMarkerEntity();
            this.markerPool.push(marker);
        }
    }

    createMarkerEntity() {
        const entity = new pc.Entity('ObjectiveMarker');
        
        // Add render component with billboard sprite
        entity.addComponent('render', {
            type: 'plane',
            material: this.createMarkerMaterial()
        });
        
        // Add script component for marker behavior
        entity.addComponent('script');
        
        // Marker data
        entity.markerData = {
            id: null,
            type: 'waypoint',
            worldPosition: new pc.Vec3(),
            screenPosition: new pc.Vec2(),
            distance: 0,
            isVisible: false,
            isOnScreen: false,
            createdTime: 0,
            timeout: 0,
            blinkPhase: 0
        };
        
        entity.enabled = false;
        this.app.root.addChild(entity);
        
        return entity;
    }

    createMarkerMaterial() {
        const material = new pc.StandardMaterial();
        material.emissive = new pc.Color(1, 1, 1);
        material.emissiveMap = this.createMarkerTexture();
        material.opacity = 1.0;
        material.blendType = pc.BLEND_ADDITIVE;
        material.cull = pc.CULLFACE_NONE;
        material.depthWrite = false;
        material.update();
        return material;
    }

    createMarkerTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        
        // Create a circular marker with border
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(32, 32, 30, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        const texture = new pc.Texture(this.app.graphicsDevice);
        texture.setSource(canvas);
        return texture;
    }

    createCompassContainer() {
        this.compassContainer = document.createElement('div');
        this.compassContainer.id = 'compass-markers';
        this.compassContainer.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            width: 400px;
            height: 60px;
            pointer-events: none;
            z-index: 100;
        `;
        
        document.body.appendChild(this.compassContainer);
    }

    setupEventListeners() {
        this.app.on('objective:add', this.addObjectiveMarker, this);
        this.app.on('objective:remove', this.removeObjectiveMarker, this);
        this.app.on('objective:update', this.updateObjectiveMarker, this);
        this.app.on('waypoint:set', this.setWaypoint, this);
        this.app.on('waypoint:clear', this.clearWaypoint, this);
        this.app.on('enemy:spotted', this.addEnemyMarker, this);
        this.app.on('teammate:update', this.updateTeammateMarker, this);
        this.app.on('flag:dropped', this.addFlagMarker, this);
        this.app.on('capture_point:contested', this.updateCapturePointMarker, this);
    }

    addMarker(id, type, position, data = {}) {
        // Remove existing marker with same ID
        this.removeMarker(id);
        
        const marker = this.getAvailableMarker();
        if (!marker) return null;
        
        const markerType = this.markerTypes[type] || this.markerTypes.waypoint;
        
        // Set up marker data
        marker.markerData.id = id;
        marker.markerData.type = type;
        marker.markerData.worldPosition.copy(position);
        marker.markerData.createdTime = Date.now();
        marker.markerData.timeout = data.timeout || markerType.timeout || 0;
        marker.markerData.customData = data;
        
        // Set marker appearance
        marker.setPosition(position);
        marker.setLocalScale(markerType.size, markerType.size, markerType.size);
        marker.render.material.emissive.copy(markerType.color);
        marker.render.material.update();
        
        // Enable marker
        marker.enabled = true;
        
        // Track marker
        this.activeMarkers.set(id, marker);
        
        // Add to compass if applicable
        if (markerType.showOnCompass) {
            this.addCompassMarker(id, type, position);
        }
        
        return marker;
    }

    removeMarker(id) {
        const marker = this.activeMarkers.get(id);
        if (marker) {
            marker.enabled = false;
            marker.markerData.id = null;
            this.activeMarkers.delete(id);
            this.removeCompassMarker(id);
        }
    }

    updateMarker(id, position, data = {}) {
        const marker = this.activeMarkers.get(id);
        if (marker) {
            marker.markerData.worldPosition.copy(position);
            marker.setPosition(position);
            
            if (data.color) {
                marker.render.material.emissive.copy(data.color);
                marker.render.material.update();
            }
            
            this.updateCompassMarker(id, position);
        }
    }

    addCompassMarker(id, type, position) {
        const compassMarker = document.createElement('div');
        compassMarker.id = `compass-marker-${id}`;
        compassMarker.className = 'compass-marker';
        compassMarker.style.cssText = `
            position: absolute;
            width: 20px;
            height: 20px;
            background: ${this.markerTypes[type].color.r * 255},${this.markerTypes[type].color.g * 255},${this.markerTypes[type].color.b * 255};
            border: 2px solid white;
            border-radius: 50%;
            transform: translate(-50%, -50%);
            font-size: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        compassMarker.textContent = this.markerTypes[type].icon;
        this.compassContainer.appendChild(compassMarker);
    }

    updateCompassMarker(id, position) {
        const compassMarker = document.getElementById(`compass-marker-${id}`);
        if (!compassMarker || !this.camera) return;
        
        const playerPos = this.camera.entity.getPosition();
        const direction = position.clone().sub(playerPos).normalize();
        
        // Calculate angle relative to player's forward direction
        const forward = this.camera.entity.forward;
        const angle = Math.atan2(direction.x, direction.z) - Math.atan2(forward.x, forward.z);
        
        // Position on compass
        const compassRadius = 180;
        const x = Math.sin(angle) * compassRadius + 200; // Center of compass container
        
        compassMarker.style.left = `${x}px`;
        compassMarker.style.top = '30px';
        
        // Hide if behind player or too far to sides
        const isVisible = Math.abs(angle) < Math.PI;
        compassMarker.style.display = isVisible ? 'flex' : 'none';
    }

    removeCompassMarker(id) {
        const compassMarker = document.getElementById(`compass-marker-${id}`);
        if (compassMarker) {
            compassMarker.remove();
        }
    }

    getAvailableMarker() {
        return this.markerPool.find(marker => !marker.enabled) || null;
    }

    // Event handlers
    addObjectiveMarker(data) {
        const { id, position, title, description } = data;
        this.addMarker(id, 'objective', position, { title, description });
    }

    removeObjectiveMarker(data) {
        this.removeMarker(data.id);
    }

    updateObjectiveMarker(data) {
        const { id, position } = data;
        this.updateMarker(id, position, data);
    }

    setWaypoint(data) {
        const { position, title } = data;
        this.addMarker('waypoint', 'waypoint', position, { title });
    }

    clearWaypoint() {
        this.removeMarker('waypoint');
    }

    addEnemyMarker(data) {
        const { id, position, timeout } = data;
        this.addMarker(`enemy_${id}`, 'enemy', position, { timeout: timeout || 10000 });
    }

    updateTeammateMarker(data) {
        const { playerId, position, name } = data;
        this.updateMarker(`teammate_${playerId}`, position, { name });
        
        // Add if doesn't exist
        if (!this.activeMarkers.has(`teammate_${playerId}`)) {
            this.addMarker(`teammate_${playerId}`, 'teammate', position, { name });
        }
    }

    addFlagMarker(data) {
        const { flagId, position, team } = data;
        const color = team === 'teamA' ? new pc.Color(0, 0.5, 1, 1) : new pc.Color(1, 0.2, 0.2, 1);
        this.addMarker(`flag_${flagId}`, 'flag', position, { team, color });
    }

    updateCapturePointMarker(data) {
        const { pointId, position, controllingTeam, contestProgress } = data;
        let color = new pc.Color(0.8, 0.8, 0.8, 1);
        
        if (controllingTeam === 'teamA') {
            color = new pc.Color(0, 0.5, 1, 1);
        } else if (controllingTeam === 'teamB') {
            color = new pc.Color(1, 0.2, 0.2, 1);
        }
        
        this.updateMarker(`capture_${pointId}`, position, { color, contestProgress });
    }

    updateMarkerVisibility() {
        if (!this.camera) return;
        
        const playerPos = this.camera.entity.getPosition();
        const cameraForward = this.camera.entity.forward;
        
        this.activeMarkers.forEach((marker, id) => {
            const markerData = marker.markerData;
            const markerType = this.markerTypes[markerData.type];
            
            // Calculate distance
            markerData.distance = playerPos.distance(markerData.worldPosition);
            
            // Check if within render distance
            if (markerData.distance > this.maxRenderDistance) {
                marker.enabled = false;
                return;
            }
            
            // Check timeout
            if (markerData.timeout > 0 && Date.now() - markerData.createdTime > markerData.timeout) {
                this.removeMarker(id);
                return;
            }
            
            // Calculate screen position
            const screenPos = new pc.Vec3();
            this.camera.worldToScreen(markerData.worldPosition, screenPos);
            
            markerData.screenPosition.set(screenPos.x, screenPos.y);
            markerData.isOnScreen = screenPos.x >= 0 && screenPos.x <= this.app.graphicsDevice.width &&
                                   screenPos.y >= 0 && screenPos.y <= this.app.graphicsDevice.height &&
                                   screenPos.z > 0;
            
            // Calculate visibility
            const directionToMarker = markerData.worldPosition.clone().sub(playerPos).normalize();
            const dotProduct = cameraForward.dot(directionToMarker);
            markerData.isVisible = dotProduct > -0.5; // Visible if not completely behind
            
            // Update marker visibility
            marker.enabled = markerData.isVisible && markerData.distance <= this.maxRenderDistance;
            
            if (marker.enabled) {
                // Update alpha based on distance
                let alpha = 1.0;
                if (markerData.distance > this.fadeStartDistance) {
                    alpha = 1.0 - (markerData.distance - this.fadeStartDistance) / 
                           (this.maxRenderDistance - this.fadeStartDistance);
                }
                
                // Apply blinking effect if applicable
                if (markerType.blinking) {
                    markerData.blinkPhase += 0.1;
                    alpha *= 0.5 + 0.5 * Math.sin(markerData.blinkPhase);
                }
                
                marker.render.material.opacity = alpha;
                marker.render.material.update();
                
                // Always face camera
                marker.lookAt(playerPos);
                marker.rotateLocal(0, 180, 0);
            }
        });
    }

    createScreenSpaceMarkers() {
        // Create off-screen indicators for important markers
        this.activeMarkers.forEach((marker, id) => {
            const markerData = marker.markerData;
            const markerType = this.markerTypes[markerData.type];
            
            if (!markerData.isOnScreen && markerData.isVisible && markerType.priority >= 5) {
                this.createOffScreenIndicator(markerData);
            }
        });
    }

    createOffScreenIndicator(markerData) {
        const screenCenter = new pc.Vec2(
            this.app.graphicsDevice.width / 2,
            this.app.graphicsDevice.height / 2
        );
        
        const directionToEdge = markerData.screenPosition.clone().sub(screenCenter).normalize();
        const edgePosition = screenCenter.clone().add(directionToEdge.scale(200));
        
        // Create or update off-screen indicator UI element
        let indicator = document.getElementById(`indicator_${markerData.id}`);
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = `indicator_${markerData.id}`;
            indicator.className = 'off-screen-indicator';
            indicator.style.cssText = `
                position: fixed;
                width: 20px;
                height: 20px;
                background: orange;
                border: 2px solid white;
                border-radius: 50%;
                pointer-events: none;
                z-index: 200;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
            `;
            document.body.appendChild(indicator);
        }
        
        const markerType = this.markerTypes[markerData.type];
        indicator.textContent = markerType.icon;
        indicator.style.left = `${edgePosition.x}px`;
        indicator.style.top = `${edgePosition.y}px`;
        indicator.style.transform = 'translate(-50%, -50%)';
        
        // Add distance text if applicable
        if (markerType.showDistance) {
            indicator.title = `${Math.floor(markerData.distance)}m`;
        }
    }

    update(dt) {
        const currentTime = Date.now();
        
        if (currentTime - this.lastUpdateTime > this.updateInterval) {
            this.updateMarkerVisibility();
            this.createScreenSpaceMarkers();
            this.updateCompassMarkers();
            this.lastUpdateTime = currentTime;
        }
    }

    updateCompassMarkers() {
        this.activeMarkers.forEach((marker, id) => {
            const markerType = this.markerTypes[marker.markerData.type];
            if (markerType.showOnCompass) {
                this.updateCompassMarker(id, marker.markerData.worldPosition);
            }
        });
    }

    destroy() {
        // Clean up event listeners
        this.app.off('objective:add', this.addObjectiveMarker, this);
        this.app.off('objective:remove', this.removeObjectiveMarker, this);
        this.app.off('objective:update', this.updateObjectiveMarker, this);
        this.app.off('waypoint:set', this.setWaypoint, this);
        this.app.off('waypoint:clear', this.clearWaypoint, this);
        this.app.off('enemy:spotted', this.addEnemyMarker, this);
        this.app.off('teammate:update', this.updateTeammateMarker, this);
        this.app.off('flag:dropped', this.addFlagMarker, this);
        this.app.off('capture_point:contested', this.updateCapturePointMarker, this);
        
        // Clean up UI elements
        if (this.compassContainer && this.compassContainer.parentNode) {
            this.compassContainer.parentNode.removeChild(this.compassContainer);
        }
        
        // Remove all off-screen indicators
        this.activeMarkers.forEach((marker, id) => {
            const indicator = document.getElementById(`indicator_${id}`);
            if (indicator && indicator.parentNode) {
                indicator.parentNode.removeChild(indicator);
            }
        });
        
        // Clean up marker entities
        this.markerPool.forEach(marker => marker.destroy());
    }
}

pc.registerScript(ObjectiveMarkers, 'ObjectiveMarkers');
