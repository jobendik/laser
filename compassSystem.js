/**
 * CompassSystem.js
 * Compass and navigation UI system
 * Displays direction, objectives, waypoints, and mini-compass
 */

class CompassSystem extends pc.ScriptType {
    static get scriptName() { return 'CompassSystem'; }

    initialize() {
        this.playerEntity = this.app.root.findByName('Player');
        this.cameraEntity = this.app.root.findByName('Camera');
        this.hudManager = this.app.root.findByName('HUDManager')?.script?.hudManager;
        
        // Compass settings
        this.compassSize = 200;
        this.compassPosition = { x: 0.5, y: 0.05 }; // Screen percentage
        this.showDistance = true;
        this.maxDisplayDistance = 500; // meters
        this.fadeDistance = 400; // meters
        
        // Navigation data
        this.objectives = new Map();
        this.waypoints = new Map();
        this.teammates = new Map();
        this.enemies = new Map();
        this.pointsOfInterest = new Map();
        
        // Visual elements
        this.compassElement = null;
        this.compassNeedle = null;
        this.directionMarkers = [];
        this.objectiveMarkers = [];
        
        // Compass state
        this.currentHeading = 0; // Player's current facing direction
        this.northDirection = new pc.Vec3(0, 0, 1); // World north
        this.enabled = true;
        
        this.setupCompassUI();
        this.setupEventListeners();
        this.startCompassUpdate();
    }

    setupCompassUI() {
        this.createCompassBase();
        this.createDirectionMarkers();
        this.createCompassNeedle();
        this.setupMarkerStyles();
    }

    createCompassBase() {
        // Create main compass container
        this.compassElement = document.createElement('div');
        this.compassElement.id = 'compass-container';
        this.compassElement.style.cssText = `
            position: fixed;
            top: ${this.compassPosition.y * 100}%;
            left: 50%;
            transform: translateX(-50%);
            width: ${this.compassSize}px;
            height: 60px;
            background: linear-gradient(to bottom, rgba(0,0,0,0.7), rgba(0,0,0,0.5));
            border: 2px solid rgba(255,255,255,0.3);
            border-radius: 8px;
            overflow: hidden;
            font-family: 'Courier New', monospace;
            color: white;
            z-index: 1000;
            pointer-events: none;
        `;
        
        // Compass strip (scrolling background)
        this.compassStrip = document.createElement('div');
        this.compassStrip.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 720px; // 360 degrees * 2px per degree
            height: 100%;
            background: repeating-linear-gradient(
                to right,
                transparent 0px,
                transparent 18px,
                rgba(255,255,255,0.3) 18px,
                rgba(255,255,255,0.3) 20px
            );
        `;
        
        // Center line indicator
        this.centerLine = document.createElement('div');
        this.centerLine.style.cssText = `
            position: absolute;
            top: 0;
            left: 50%;
            width: 2px;
            height: 100%;
            background: rgba(255,255,0,0.8);
            transform: translateX(-50%);
            z-index: 10;
        `;
        
        this.compassElement.appendChild(this.compassStrip);
        this.compassElement.appendChild(this.centerLine);
        document.body.appendChild(this.compassElement);
    }

    createDirectionMarkers() {
        const directions = [
            { angle: 0, label: 'N', color: '#ff4444' },
            { angle: 45, label: 'NE', color: '#ffffff' },
            { angle: 90, label: 'E', color: '#ffffff' },
            { angle: 135, label: 'SE', color: '#ffffff' },
            { angle: 180, label: 'S', color: '#ffffff' },
            { angle: 225, label: 'SW', color: '#ffffff' },
            { angle: 270, label: 'W', color: '#ffffff' },
            { angle: 315, label: 'NW', color: '#ffffff' }
        ];
        
        directions.forEach(dir => {
            const marker = document.createElement('div');
            marker.style.cssText = `
                position: absolute;
                top: 10px;
                width: 20px;
                height: 20px;
                font-size: 12px;
                font-weight: bold;
                color: ${dir.color};
                text-align: center;
                line-height: 20px;
                z-index: 5;
            `;
            marker.textContent = dir.label;
            
            this.compassStrip.appendChild(marker);
            this.directionMarkers.push({
                element: marker,
                angle: dir.angle,
                label: dir.label
            });
        });
    }

    createCompassNeedle() {
        this.compassNeedle = document.createElement('div');
        this.compassNeedle.style.cssText = `
            position: absolute;
            top: -5px;
            left: 50%;
            width: 0;
            height: 0;
            border-left: 8px solid transparent;
            border-right: 8px solid transparent;
            border-bottom: 15px solid rgba(255,255,0,0.9);
            transform: translateX(-50%);
            z-index: 15;
        `;
        
        this.compassElement.appendChild(this.compassNeedle);
    }

    setupMarkerStyles() {
        // Inject CSS for different marker types
        const style = document.createElement('style');
        style.textContent = `
            .compass-objective {
                position: absolute;
                width: 16px;
                height: 16px;
                background: #00ff00;
                border: 2px solid #ffffff;
                border-radius: 50%;
                top: 35px;
                transform: translateX(-50%);
                z-index: 8;
                animation: pulse 2s infinite;
            }
            
            .compass-waypoint {
                position: absolute;
                width: 12px;
                height: 12px;
                background: #00aaff;
                border: 1px solid #ffffff;
                border-radius: 2px;
                top: 37px;
                transform: translateX(-50%);
                z-index: 7;
            }
            
            .compass-teammate {
                position: absolute;
                width: 14px;
                height: 14px;
                background: #44ff44;
                border: 1px solid #ffffff;
                top: 36px;
                transform: translateX(-50%) rotate(45deg);
                z-index: 6;
            }
            
            .compass-enemy {
                position: absolute;
                width: 14px;
                height: 14px;
                background: #ff4444;
                border: 1px solid #ffffff;
                top: 36px;
                transform: translateX(-50%) rotate(45deg);
                z-index: 6;
            }
            
            .compass-poi {
                position: absolute;
                width: 10px;
                height: 10px;
                background: #ffaa00;
                border: 1px solid #ffffff;
                border-radius: 50%;
                top: 38px;
                transform: translateX(-50%);
                z-index: 5;
            }
            
            .compass-distance {
                position: absolute;
                font-size: 8px;
                color: rgba(255,255,255,0.8);
                top: 50px;
                transform: translateX(-50%);
                text-align: center;
                white-space: nowrap;
                z-index: 9;
            }
            
            @keyframes pulse {
                0%, 100% { opacity: 1; transform: translateX(-50%) scale(1); }
                50% { opacity: 0.7; transform: translateX(-50%) scale(1.2); }
            }
        `;
        document.head.appendChild(style);
    }

    setupEventListeners() {
        // Objective events
        this.app.on('objective:added', (objective) => {
            this.addObjective(objective);
        });
        
        this.app.on('objective:removed', (objectiveId) => {
            this.removeObjective(objectiveId);
        });
        
        this.app.on('objective:updated', (objective) => {
            this.updateObjective(objective);
        });
        
        // Waypoint events
        this.app.on('waypoint:set', (waypoint) => {
            this.addWaypoint(waypoint);
        });
        
        this.app.on('waypoint:clear', (waypointId) => {
            this.removeWaypoint(waypointId);
        });
        
        // Team events
        this.app.on('teammate:position', (teammate) => {
            this.updateTeammate(teammate);
        });
        
        this.app.on('enemy:spotted', (enemy) => {
            this.addEnemy(enemy);
        });
        
        this.app.on('enemy:lost', (enemyId) => {
            this.removeEnemy(enemyId);
        });
        
        // POI events
        this.app.on('poi:discovered', (poi) => {
            this.addPointOfInterest(poi);
        });
        
        // Settings events
        this.app.on('compass:toggle', () => {
            this.toggleCompass();
        });
        
        this.app.on('compass:settings', (settings) => {
            this.updateSettings(settings);
        });
    }

    startCompassUpdate() {
        // Update compass every frame
        this.app.on('update', () => {
            if (this.enabled && this.playerEntity) {
                this.updateCompass();
            }
        });
    }

    updateCompass() {
        this.updatePlayerHeading();
        this.updateCompassStrip();
        this.updateDirectionMarkers();
        this.updateObjectiveMarkers();
        this.updateDistanceDisplays();
    }

    updatePlayerHeading() {
        if (!this.cameraEntity) return;
        
        // Get camera's forward direction
        const forward = this.cameraEntity.forward;
        
        // Calculate angle relative to north (0 degrees = north)
        this.currentHeading = Math.atan2(forward.x, forward.z) * (180 / Math.PI);
        if (this.currentHeading < 0) {
            this.currentHeading += 360;
        }
    }

    updateCompassStrip() {
        // Move the compass strip based on current heading
        const offset = -(this.currentHeading / 360) * 720; // 720px = full rotation
        this.compassStrip.style.transform = `translateX(${offset}px)`;
    }

    updateDirectionMarkers() {
        this.directionMarkers.forEach(marker => {
            // Calculate position relative to current heading
            let relativeAngle = marker.angle - this.currentHeading;
            
            // Normalize to -180 to 180 range
            while (relativeAngle > 180) relativeAngle -= 360;
            while (relativeAngle < -180) relativeAngle += 360;
            
            // Calculate pixel position
            const pixelPosition = (relativeAngle / 180) * (this.compassSize / 2);
            
            // Show/hide based on visibility
            if (Math.abs(pixelPosition) <= this.compassSize / 2) {
                marker.element.style.display = 'block';
                marker.element.style.left = `${this.compassSize / 2 + pixelPosition}px`;
            } else {
                marker.element.style.display = 'none';
            }
        });
    }

    updateObjectiveMarkers() {
        // Clear existing markers
        this.objectiveMarkers.forEach(marker => {
            if (marker.element && marker.element.parentNode) {
                marker.element.parentNode.removeChild(marker.element);
            }
        });
        this.objectiveMarkers = [];
        
        // Add objective markers
        this.objectives.forEach((objective, id) => {
            this.createMarker(objective, 'objective');
        });
        
        // Add waypoint markers
        this.waypoints.forEach((waypoint, id) => {
            this.createMarker(waypoint, 'waypoint');
        });
        
        // Add teammate markers
        this.teammates.forEach((teammate, id) => {
            this.createMarker(teammate, 'teammate');
        });
        
        // Add enemy markers
        this.enemies.forEach((enemy, id) => {
            this.createMarker(enemy, 'enemy');
        });
        
        // Add POI markers
        this.pointsOfInterest.forEach((poi, id) => {
            this.createMarker(poi, 'poi');
        });
    }

    createMarker(target, type) {
        if (!this.playerEntity || !target.position) return;
        
        const playerPos = this.playerEntity.getPosition();
        const targetPos = target.position;
        
        // Calculate distance
        const distance = playerPos.distance(targetPos);
        
        // Skip if too far away
        if (distance > this.maxDisplayDistance) return;
        
        // Calculate bearing to target
        const direction = new pc.Vec3().sub2(targetPos, playerPos);
        const bearing = Math.atan2(direction.x, direction.z) * (180 / Math.PI);
        
        // Calculate relative angle to current heading
        let relativeAngle = bearing - this.currentHeading;
        while (relativeAngle > 180) relativeAngle -= 360;
        while (relativeAngle < -180) relativeAngle += 360;
        
        // Calculate pixel position
        const pixelPosition = (relativeAngle / 180) * (this.compassSize / 2);
        
        // Show marker if within compass view
        if (Math.abs(pixelPosition) <= this.compassSize / 2) {
            const marker = document.createElement('div');
            marker.className = `compass-${type}`;
            marker.style.left = `${this.compassSize / 2 + pixelPosition}px`;
            
            // Apply fade based on distance
            if (distance > this.fadeDistance) {
                const fadeRatio = 1.0 - (distance - this.fadeDistance) / (this.maxDisplayDistance - this.fadeDistance);
                marker.style.opacity = fadeRatio.toString();
            }
            
            // Add distance display if enabled
            if (this.showDistance && distance > 10) {
                const distanceElement = document.createElement('div');
                distanceElement.className = 'compass-distance';
                distanceElement.textContent = `${Math.round(distance)}m`;
                distanceElement.style.left = `${this.compassSize / 2 + pixelPosition}px`;
                
                this.compassElement.appendChild(distanceElement);
                
                this.objectiveMarkers.push({
                    element: distanceElement,
                    type: 'distance',
                    target: target
                });
            }
            
            this.compassElement.appendChild(marker);
            
            this.objectiveMarkers.push({
                element: marker,
                type: type,
                target: target
            });
        }
    }

    updateDistanceDisplays() {
        // Update distance text for all visible markers
        this.objectiveMarkers.forEach(marker => {
            if (marker.type === 'distance' && marker.target && this.playerEntity) {
                const playerPos = this.playerEntity.getPosition();
                const distance = playerPos.distance(marker.target.position);
                marker.element.textContent = `${Math.round(distance)}m`;
            }
        });
    }

    // Public API methods
    addObjective(objective) {
        this.objectives.set(objective.id, {
            id: objective.id,
            position: objective.position,
            type: objective.type || 'primary',
            priority: objective.priority || 1,
            name: objective.name || 'Objective'
        });
    }

    removeObjective(objectiveId) {
        this.objectives.delete(objectiveId);
    }

    updateObjective(objective) {
        if (this.objectives.has(objective.id)) {
            const existing = this.objectives.get(objective.id);
            Object.assign(existing, objective);
        }
    }

    addWaypoint(waypoint) {
        this.waypoints.set(waypoint.id, {
            id: waypoint.id,
            position: waypoint.position,
            name: waypoint.name || 'Waypoint',
            temporary: waypoint.temporary || false
        });
        
        // Auto-remove temporary waypoints after a time
        if (waypoint.temporary) {
            setTimeout(() => {
                this.removeWaypoint(waypoint.id);
            }, waypoint.duration || 30000);
        }
    }

    removeWaypoint(waypointId) {
        this.waypoints.delete(waypointId);
    }

    updateTeammate(teammate) {
        this.teammates.set(teammate.id, {
            id: teammate.id,
            position: teammate.position,
            name: teammate.name || 'Teammate',
            status: teammate.status || 'alive'
        });
    }

    addEnemy(enemy) {
        this.enemies.set(enemy.id, {
            id: enemy.id,
            position: enemy.position,
            lastSeen: Date.now(),
            confidence: enemy.confidence || 1.0
        });
        
        // Auto-remove enemy markers after a time
        setTimeout(() => {
            this.removeEnemy(enemy.id);
        }, 15000); // 15 seconds
    }

    removeEnemy(enemyId) {
        this.enemies.delete(enemyId);
    }

    addPointOfInterest(poi) {
        this.pointsOfInterest.set(poi.id, {
            id: poi.id,
            position: poi.position,
            type: poi.type || 'generic',
            name: poi.name || 'Point of Interest'
        });
    }

    setPlayerWaypoint(position, name = 'Player Waypoint') {
        const waypoint = {
            id: 'player_waypoint',
            position: position,
            name: name,
            temporary: true,
            duration: 60000 // 1 minute
        };
        
        this.addWaypoint(waypoint);
        
        // Fire event for other systems
        this.app.fire('waypoint:player_set', waypoint);
    }

    clearAllWaypoints() {
        this.waypoints.clear();
    }

    toggleCompass() {
        this.enabled = !this.enabled;
        this.compassElement.style.display = this.enabled ? 'block' : 'none';
    }

    updateSettings(settings) {
        if (settings.size !== undefined) {
            this.compassSize = settings.size;
            this.compassElement.style.width = `${this.compassSize}px`;
        }
        
        if (settings.position !== undefined) {
            this.compassPosition = settings.position;
            this.compassElement.style.top = `${this.compassPosition.y * 100}%`;
        }
        
        if (settings.showDistance !== undefined) {
            this.showDistance = settings.showDistance;
        }
        
        if (settings.maxDistance !== undefined) {
            this.maxDisplayDistance = settings.maxDistance;
        }
    }

    getHeading() {
        return this.currentHeading;
    }

    getCardinalDirection() {
        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const index = Math.round(this.currentHeading / 45) % 8;
        return directions[index];
    }

    getBearingToTarget(targetPosition) {
        if (!this.playerEntity) return null;
        
        const playerPos = this.playerEntity.getPosition();
        const direction = new pc.Vec3().sub2(targetPosition, playerPos);
        const bearing = Math.atan2(direction.x, direction.z) * (180 / Math.PI);
        
        return bearing < 0 ? bearing + 360 : bearing;
    }

    destroy() {
        if (this.compassElement && this.compassElement.parentNode) {
            this.compassElement.parentNode.removeChild(this.compassElement);
        }
    }
}

pc.registerScript(CompassSystem, 'CompassSystem');
