/**
 * AIPathfinding.js
 * Navigation mesh integration and pathfinding system for AI
 * Handles multi-level pathfinding, dynamic obstacle avoidance, group movement coordination, and performance optimization
 */

class AIPathfinding extends pc.ScriptType {
    static get scriptName() { return 'AIPathfinding'; }

    initialize() {
        this.gameManager = this.app.root.findByName('Game_Manager').script.gameManager;
        this.levelManager = this.app.root.findByName('Game_Manager').script.levelManager;
        this.aiController = this.entity.script.aiController;
        
        // Navigation State
        this.currentPath = [];
        this.currentWaypoint = 0;
        this.destination = null;
        this.isPathfinding = false;
        this.pathingComplete = false;
        this.stuckTimer = 0;
        this.maxStuckTime = 3.0;
        
        // Movement Parameters
        this.moveSpeed = 5.0;
        this.runSpeed = 8.0;
        this.crouchSpeed = 2.0;
        this.currentSpeed = this.moveSpeed;
        this.rotationSpeed = 180; // degrees per second
        this.arrivalDistance = 1.5;
        this.waypointDistance = 0.8;
        
        // Obstacle Avoidance
        this.avoidanceEnabled = true;
        this.avoidanceRadius = 2.0;
        this.avoidanceForce = 5.0;
        this.raycastDistance = 3.0;
        this.raycastDirections = [];
        this.lastObstacleTime = 0;
        
        // Group Movement
        this.groupLeader = null;
        this.followDistance = 3.0;
        this.formation = 'line';
        this.formationOffset = new pc.Vec3();
        this.separationDistance = 2.0;
        
        // Performance Optimization
        this.updateFrequency = 10; // Updates per second
        this.lastUpdateTime = 0;
        this.pathfindingLOD = 'high';
        this.maxPathLength = 50;
        this.pathSmoothingEnabled = true;
        
        // Navigation Mesh
        this.navMesh = null;
        this.navMeshEnabled = true;
        this.offMeshConnections = [];
        this.jumpPoints = [];
        
        // Movement History
        this.positionHistory = [];
        this.maxHistoryLength = 10;
        this.lastPosition = new pc.Vec3();
        
        this.initializePathfinding();
        this.setupEventListeners();
    }

    initializePathfinding() {
        this.setupRaycastDirections();
        this.loadNavigationMesh();
        this.setupMovementSystems();
    }

    setupRaycastDirections() {
        // Create raycast directions for obstacle detection
        const angleStep = 45; // degrees
        for (let angle = 0; angle < 360; angle += angleStep) {
            const radians = angle * Math.PI / 180;
            this.raycastDirections.push(new pc.Vec3(
                Math.cos(radians),
                0,
                Math.sin(radians)
            ));
        }
    }

    loadNavigationMesh() {
        // Load navigation mesh for current level
        const currentLevel = this.levelManager?.getCurrentLevel();
        if (currentLevel) {
            this.navMesh = currentLevel.navMesh;
        }
        
        // Fallback: generate simple grid-based navigation
        if (!this.navMesh) {
            this.generateSimpleNavMesh();
        }
    }

    generateSimpleNavMesh() {
        // Simple grid-based navigation mesh
        this.navMesh = {
            nodes: new Map(),
            connections: new Map(),
            gridSize: 2.0
        };
        
        // Generate navigation nodes
        const bounds = this.getLevelBounds();
        for (let x = bounds.min.x; x <= bounds.max.x; x += this.navMesh.gridSize) {
            for (let z = bounds.min.z; z <= bounds.max.z; z += this.navMesh.gridSize) {
                const position = new pc.Vec3(x, bounds.min.y, z);
                if (this.isPositionWalkable(position)) {
                    const nodeId = this.getNodeId(position);
                    this.navMesh.nodes.set(nodeId, {
                        position: position,
                        connections: []
                    });
                }
            }
        }
        
        // Connect adjacent nodes
        this.connectNavMeshNodes();
    }

    connectNavMeshNodes() {
        this.navMesh.nodes.forEach((node, nodeId) => {
            const adjacentPositions = this.getAdjacentPositions(node.position);
            adjacentPositions.forEach(pos => {
                const adjacentId = this.getNodeId(pos);
                if (this.navMesh.nodes.has(adjacentId)) {
                    node.connections.push(adjacentId);
                }
            });
        });
    }

    setupMovementSystems() {
        // Initialize movement components
        if (!this.entity.rigidbody) {
            this.entity.addComponent('rigidbody', {
                type: 'kinematic',
                mass: 70
            });
        }
        
        // Setup movement parameters based on AI type
        this.loadMovementProfile();
    }

    loadMovementProfile() {
        const aiType = this.entity.tags?.list[0] || 'soldier';
        const profiles = {
            soldier: {
                moveSpeed: 5.0,
                runSpeed: 8.0,
                rotationSpeed: 180
            },
            heavy: {
                moveSpeed: 3.5,
                runSpeed: 5.5,
                rotationSpeed: 120
            },
            scout: {
                moveSpeed: 6.0,
                runSpeed: 10.0,
                rotationSpeed: 220
            }
        };
        
        const profile = profiles[aiType] || profiles.soldier;
        this.moveSpeed = profile.moveSpeed;
        this.runSpeed = profile.runSpeed;
        this.rotationSpeed = profile.rotationSpeed;
        this.currentSpeed = this.moveSpeed;
    }

    setupEventListeners() {
        // Movement events
        this.app.on('ai:set_destination', this.setDestination.bind(this));
        this.app.on('ai:follow_target', this.followTarget.bind(this));
        this.app.on('ai:stop_movement', this.stop.bind(this));
        
        // Formation events
        this.app.on('ai:set_formation', this.setFormation.bind(this));
        this.app.on('ai:join_group', this.joinGroup.bind(this));
        this.app.on('ai:leave_group', this.leaveGroup.bind(this));
    }

    // Pathfinding Core
    setDestination(destination) {
        if (!destination) return false;
        
        this.destination = destination.clone();
        this.isPathfinding = true;
        this.pathingComplete = false;
        this.stuckTimer = 0;
        
        const path = this.findPath(this.entity.getPosition(), this.destination);
        if (path && path.length > 0) {
            this.currentPath = path;
            this.currentWaypoint = 0;
            return true;
        }
        
        return false;
    }

    findPath(start, end) {
        if (!this.navMeshEnabled || !this.navMesh) {
            return this.findDirectPath(start, end);
        }
        
        return this.findNavMeshPath(start, end);
    }

    findDirectPath(start, end) {
        // Simple direct path with basic obstacle avoidance
        const path = [start.clone(), end.clone()];
        
        // Check for obstacles along the path
        const obstacles = this.detectObstaclesAlongPath(start, end);
        if (obstacles.length > 0) {
            // Add waypoints to avoid obstacles
            obstacles.forEach(obstacle => {
                const avoidancePoint = this.calculateAvoidancePoint(start, end, obstacle);
                if (avoidancePoint) {
                    path.splice(-1, 0, avoidancePoint);
                }
            });
        }
        
        return path;
    }

    findNavMeshPath(start, end) {
        const startNode = this.findNearestNavNode(start);
        const endNode = this.findNearestNavNode(end);
        
        if (!startNode || !endNode) {
            return this.findDirectPath(start, end);
        }
        
        // A* pathfinding
        const path = this.aStarPathfinding(startNode, endNode);
        
        if (path && path.length > 0) {
            // Convert node path to world positions
            const worldPath = [start.clone()];
            path.forEach(nodeId => {
                const node = this.navMesh.nodes.get(nodeId);
                if (node) {
                    worldPath.push(node.position.clone());
                }
            });
            worldPath.push(end.clone());
            
            // Smooth the path
            if (this.pathSmoothingEnabled) {
                return this.smoothPath(worldPath);
            }
            
            return worldPath;
        }
        
        return this.findDirectPath(start, end);
    }

    aStarPathfinding(startNodeId, endNodeId) {
        const openSet = new Set([startNodeId]);
        const closedSet = new Set();
        const gScore = new Map();
        const fScore = new Map();
        const cameFrom = new Map();
        
        gScore.set(startNodeId, 0);
        fScore.set(startNodeId, this.heuristicDistance(startNodeId, endNodeId));
        
        while (openSet.size > 0) {
            // Find node with lowest fScore
            let current = null;
            let lowestF = Infinity;
            
            for (const nodeId of openSet) {
                const f = fScore.get(nodeId) || Infinity;
                if (f < lowestF) {
                    lowestF = f;
                    current = nodeId;
                }
            }
            
            if (current === endNodeId) {
                // Reconstruct path
                return this.reconstructPath(cameFrom, current);
            }
            
            openSet.delete(current);
            closedSet.add(current);
            
            const currentNode = this.navMesh.nodes.get(current);
            if (!currentNode) continue;
            
            // Check neighbors
            currentNode.connections.forEach(neighborId => {
                if (closedSet.has(neighborId)) return;
                
                const tentativeG = (gScore.get(current) || Infinity) + 
                                 this.getNodeDistance(current, neighborId);
                
                if (!openSet.has(neighborId)) {
                    openSet.add(neighborId);
                } else if (tentativeG >= (gScore.get(neighborId) || Infinity)) {
                    return;
                }
                
                cameFrom.set(neighborId, current);
                gScore.set(neighborId, tentativeG);
                fScore.set(neighborId, tentativeG + this.heuristicDistance(neighborId, endNodeId));
            });
        }
        
        return null; // No path found
    }

    reconstructPath(cameFrom, current) {
        const path = [current];
        
        while (cameFrom.has(current)) {
            current = cameFrom.get(current);
            path.unshift(current);
        }
        
        return path;
    }

    heuristicDistance(nodeId1, nodeId2) {
        const node1 = this.navMesh.nodes.get(nodeId1);
        const node2 = this.navMesh.nodes.get(nodeId2);
        
        if (!node1 || !node2) return Infinity;
        
        return node1.position.distance(node2.position);
    }

    getNodeDistance(nodeId1, nodeId2) {
        return this.heuristicDistance(nodeId1, nodeId2);
    }

    smoothPath(path) {
        if (path.length <= 2) return path;
        
        const smoothedPath = [path[0]];
        let currentIndex = 0;
        
        while (currentIndex < path.length - 1) {
            let furthestVisibleIndex = currentIndex + 1;
            
            // Find the furthest point we can see directly
            for (let i = currentIndex + 2; i < path.length; i++) {
                if (this.hasLineOfSight(path[currentIndex], path[i])) {
                    furthestVisibleIndex = i;
                } else {
                    break;
                }
            }
            
            smoothedPath.push(path[furthestVisibleIndex]);
            currentIndex = furthestVisibleIndex;
        }
        
        return smoothedPath;
    }

    // Movement Execution
    updateMovement(dt) {
        if (!this.isPathfinding || this.currentPath.length === 0) return;
        
        const currentPos = this.entity.getPosition();
        this.updatePositionHistory(currentPos);
        
        // Check if stuck
        if (this.isStuck()) {
            this.handleStuckSituation();
            return;
        }
        
        // Move towards current waypoint
        if (this.currentWaypoint < this.currentPath.length) {
            const targetWaypoint = this.currentPath[this.currentWaypoint];
            const distanceToWaypoint = currentPos.distance(targetWaypoint);
            
            if (distanceToWaypoint <= this.waypointDistance) {
                this.currentWaypoint++;
                
                if (this.currentWaypoint >= this.currentPath.length) {
                    this.onPathingComplete();
                    return;
                }
            } else {
                this.moveTowardsTarget(targetWaypoint, dt);
            }
        }
    }

    moveTowardsTarget(target, dt) {
        const currentPos = this.entity.getPosition();
        const direction = target.clone().sub(currentPos).normalize();
        
        // Apply obstacle avoidance
        if (this.avoidanceEnabled) {
            const avoidanceForce = this.calculateAvoidanceForce();
            direction.add(avoidanceForce);
            direction.normalize();
        }
        
        // Apply group separation
        if (this.groupLeader) {
            const separationForce = this.calculateSeparationForce();
            direction.add(separationForce);
            direction.normalize();
        }
        
        // Move the entity
        const moveDistance = this.currentSpeed * dt;
        const newPosition = currentPos.clone().add(direction.scale(moveDistance));
        
        // Check if new position is valid
        if (this.isPositionWalkable(newPosition)) {
            this.entity.setPosition(newPosition);
            
            // Rotate to face movement direction
            this.rotateTowardsDirection(direction, dt);
        } else {
            // Handle collision
            this.handleCollision(direction);
        }
    }

    rotateTowardsDirection(direction, dt) {
        const currentRotation = this.entity.getRotation();
        const targetRotation = new pc.Quat().setFromAxisAngle(pc.Vec3.UP, 
            Math.atan2(direction.x, direction.z) * pc.math.RAD_TO_DEG);
        
        const maxRotation = this.rotationSpeed * dt * pc.math.DEG_TO_RAD;
        const rotationDelta = targetRotation.clone().sub(currentRotation);
        
        if (rotationDelta.length() > maxRotation) {
            rotationDelta.normalize().scale(maxRotation);
        }
        
        const newRotation = currentRotation.clone().add(rotationDelta);
        this.entity.setRotation(newRotation);
    }

    // Obstacle Avoidance
    calculateAvoidanceForce() {
        const avoidanceForce = new pc.Vec3();
        const currentPos = this.entity.getPosition();
        
        this.raycastDirections.forEach(direction => {
            const rayStart = currentPos.clone();
            rayStart.y += 1; // Chest height
            const rayEnd = rayStart.clone().add(direction.clone().scale(this.raycastDistance));
            
            const result = this.app.systems.rigidbody.raycastFirst(rayStart, rayEnd);
            if (result && result.entity !== this.entity) {
                const distance = result.point.distance(rayStart);
                const force = this.avoidanceForce * (1 - distance / this.raycastDistance);
                
                // Apply force away from obstacle
                const awayFromObstacle = rayStart.clone().sub(result.point).normalize();
                avoidanceForce.add(awayFromObstacle.scale(force));
            }
        });
        
        return avoidanceForce.normalize();
    }

    detectObstaclesAlongPath(start, end) {
        const obstacles = [];
        const direction = end.clone().sub(start).normalize();
        const distance = start.distance(end);
        const stepSize = 2.0;
        
        for (let i = stepSize; i < distance; i += stepSize) {
            const checkPoint = start.clone().add(direction.clone().scale(i));
            if (!this.isPositionWalkable(checkPoint)) {
                obstacles.push(checkPoint);
            }
        }
        
        return obstacles;
    }

    calculateAvoidancePoint(start, end, obstacle) {
        const toObstacle = obstacle.clone().sub(start).normalize();
        const perpendicular = new pc.Vec3(-toObstacle.z, 0, toObstacle.x);
        
        // Try both sides of the obstacle
        const leftAvoidance = obstacle.clone().add(perpendicular.scale(this.avoidanceRadius));
        const rightAvoidance = obstacle.clone().sub(perpendicular.scale(this.avoidanceRadius));
        
        // Choose the side that's closer to the destination
        const leftDistance = leftAvoidance.distance(end);
        const rightDistance = rightAvoidance.distance(end);
        
        const avoidancePoint = leftDistance < rightDistance ? leftAvoidance : rightAvoidance;
        
        return this.isPositionWalkable(avoidancePoint) ? avoidancePoint : null;
    }

    // Group Movement
    joinGroup(leader, formation = 'line') {
        this.groupLeader = leader;
        this.formation = formation;
        this.calculateFormationOffset();
    }

    leaveGroup() {
        this.groupLeader = null;
        this.formationOffset = new pc.Vec3();
    }

    calculateFormationOffset() {
        if (!this.groupLeader) return;
        
        const groupMembers = this.getGroupMembers();
        const myIndex = groupMembers.indexOf(this.entity);
        
        switch (this.formation) {
            case 'line':
                this.formationOffset = new pc.Vec3(myIndex * 3, 0, -2);
                break;
            case 'wedge':
                const row = Math.floor(myIndex / 2);
                const side = myIndex % 2 === 0 ? -1 : 1;
                this.formationOffset = new pc.Vec3(side * (row + 1) * 2, 0, -row * 3);
                break;
            case 'column':
                this.formationOffset = new pc.Vec3(0, 0, -myIndex * 3);
                break;
        }
    }

    calculateSeparationForce() {
        const separationForce = new pc.Vec3();
        const currentPos = this.entity.getPosition();
        const groupMembers = this.getGroupMembers();
        
        groupMembers.forEach(member => {
            if (member === this.entity) return;
            
            const memberPos = member.getPosition();
            const distance = currentPos.distance(memberPos);
            
            if (distance < this.separationDistance) {
                const awayFromMember = currentPos.clone().sub(memberPos).normalize();
                const force = (this.separationDistance - distance) / this.separationDistance;
                separationForce.add(awayFromMember.scale(force));
            }
        });
        
        return separationForce.normalize();
    }

    followTarget(target) {
        if (!target) return;
        
        const targetPos = target.getPosition();
        const followPos = targetPos.clone().add(this.formationOffset);
        
        this.setDestination(followPos);
    }

    // Utility Methods
    hasLineOfSight(start, end) {
        const result = this.app.systems.rigidbody.raycastFirst(start, end);
        return !result || result.distance >= start.distance(end) - 0.1;
    }

    isPositionWalkable(position) {
        // Check if position is on solid ground and not inside obstacles
        const groundCheck = position.clone();
        groundCheck.y -= 0.5;
        const groundResult = this.app.systems.rigidbody.raycastFirst(position, groundCheck);
        
        if (!groundResult) return false; // No ground
        
        // Check for obstacles at this position
        const obstacleCheck = position.clone();
        obstacleCheck.y += 1;
        const obstacleResult = this.app.systems.rigidbody.raycastFirst(position, obstacleCheck);
        
        return !obstacleResult; // No obstacles
    }

    findNearestNavNode(position) {
        if (!this.navMesh || this.navMesh.nodes.size === 0) return null;
        
        let nearestNode = null;
        let nearestDistance = Infinity;
        
        this.navMesh.nodes.forEach((node, nodeId) => {
            const distance = position.distance(node.position);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestNode = nodeId;
            }
        });
        
        return nearestNode;
    }

    getNodeId(position) {
        const gridSize = this.navMesh?.gridSize || 2.0;
        const x = Math.floor(position.x / gridSize);
        const z = Math.floor(position.z / gridSize);
        return `${x}_${z}`;
    }

    getAdjacentPositions(position) {
        const gridSize = this.navMesh?.gridSize || 2.0;
        const adjacent = [];
        
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                if (dx === 0 && dz === 0) continue;
                
                adjacent.push(new pc.Vec3(
                    position.x + dx * gridSize,
                    position.y,
                    position.z + dz * gridSize
                ));
            }
        }
        
        return adjacent;
    }

    getLevelBounds() {
        // Get level boundaries - this would typically come from level manager
        return {
            min: new pc.Vec3(-100, 0, -100),
            max: new pc.Vec3(100, 0, 100)
        };
    }

    updatePositionHistory(position) {
        this.positionHistory.push(position.clone());
        
        if (this.positionHistory.length > this.maxHistoryLength) {
            this.positionHistory.shift();
        }
    }

    isStuck() {
        if (this.positionHistory.length < this.maxHistoryLength) return false;
        
        const recentPositions = this.positionHistory.slice(-5);
        const avgPosition = new pc.Vec3();
        
        recentPositions.forEach(pos => avgPosition.add(pos));
        avgPosition.scale(1 / recentPositions.length);
        
        // Check if we've been in roughly the same area
        const variance = recentPositions.reduce((sum, pos) => {
            return sum + pos.distance(avgPosition);
        }, 0) / recentPositions.length;
        
        return variance < 0.5; // Very small movement
    }

    handleStuckSituation() {
        this.stuckTimer += 1/60; // Assuming 60 FPS
        
        if (this.stuckTimer > this.maxStuckTime) {
            // Try alternative pathfinding or request new path
            this.findAlternativePath();
            this.stuckTimer = 0;
        }
    }

    findAlternativePath() {
        if (!this.destination) return;
        
        // Try pathfinding with larger avoidance radius
        const oldRadius = this.avoidanceRadius;
        this.avoidanceRadius *= 2;
        
        const newPath = this.findPath(this.entity.getPosition(), this.destination);
        if (newPath && newPath.length > 0) {
            this.currentPath = newPath;
            this.currentWaypoint = 0;
        }
        
        this.avoidanceRadius = oldRadius;
    }

    handleCollision(attemptedDirection) {
        // Try moving in a different direction
        const alternatives = [
            new pc.Vec3(-attemptedDirection.z, 0, attemptedDirection.x), // Perpendicular left
            new pc.Vec3(attemptedDirection.z, 0, -attemptedDirection.x), // Perpendicular right
            attemptedDirection.clone().scale(-1) // Backwards
        ];
        
        for (const alt of alternatives) {
            const testPos = this.entity.getPosition().clone().add(alt.scale(0.5));
            if (this.isPositionWalkable(testPos)) {
                this.entity.setPosition(testPos);
                break;
            }
        }
    }

    getGroupMembers() {
        if (!this.groupLeader) return [this.entity];
        
        const squad = this.aiController?.squad || [];
        return squad.filter(member => 
            member.script.aiPathfinding?.groupLeader === this.groupLeader
        );
    }

    onPathingComplete() {
        this.isPathfinding = false;
        this.pathingComplete = true;
        this.currentPath = [];
        this.currentWaypoint = 0;
        
        this.app.fire('ai:pathfinding_complete', {
            entity: this.entity,
            destination: this.destination
        });
    }

    // Public API
    hasReachedDestination() {
        if (!this.destination) return false;
        
        const distance = this.entity.getPosition().distance(this.destination);
        return distance <= this.arrivalDistance;
    }

    stop() {
        this.isPathfinding = false;
        this.currentPath = [];
        this.currentWaypoint = 0;
        this.destination = null;
    }

    setSpeed(speed) {
        this.currentSpeed = speed;
    }

    setFormation(formation) {
        this.formation = formation;
        this.calculateFormationOffset();
    }

    isMoving() {
        return this.isPathfinding && this.currentPath.length > 0;
    }

    getCurrentPath() {
        return [...this.currentPath];
    }

    getDestination() {
        return this.destination?.clone();
    }

    update(dt) {
        // Only update at specified frequency for performance
        const currentTime = Date.now();
        if (currentTime - this.lastUpdateTime < 1000 / this.updateFrequency) {
            return;
        }
        this.lastUpdateTime = currentTime;
        
        this.updateMovement(dt);
        
        // Update last position for stuck detection
        this.lastPosition = this.entity.getPosition().clone();
    }
}

pc.registerScript(AIPathfinding, 'AIPathfinding');
