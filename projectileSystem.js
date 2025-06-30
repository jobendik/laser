/**
 * ProjectileSystem.js
 * Advanced ballistics and projectile physics system
 * Handles bullet physics simulation, ballistics calculation, wind effects, ricochet mechanics, and penetration
 */

class ProjectileSystem extends pc.ScriptType {
    static get scriptName() { return 'ProjectileSystem'; }

    initialize() {
        this.gameManager = this.app.root.findByName('Game_Manager').script.gameManager;
        this.audioManager = this.app.root.findByName('Game_Manager').script.audioManager;
        this.effectsManager = this.app.root.findByName('Game_Manager').script.effectsManager;
        this.networkManager = this.app.root.findByName('Game_Manager').script.networkManager;
        
        // Active projectiles tracking
        this.activeProjectiles = new Map();
        this.projectilePool = [];
        this.maxActiveProjectiles = 500;
        this.poolSize = 100;
        
        // Physics settings
        this.gravity = -9.81;
        this.airResistance = 0.01;
        this.windEnabled = true;
        this.windVector = new pc.Vec3(0, 0, 0);
        this.windStrength = 2.0;
        
        // Ballistics data
        this.ballisticsData = new Map();
        this.materialPenetration = new Map();
        this.riccochetData = new Map();
        
        // Performance settings
        this.maxSimulationDistance = 1000;
        this.minProjectileSpeed = 10;
        this.simulationTimeStep = 1/120; // 120Hz simulation
        this.maxSimulationTime = 10.0; // Max flight time
        
        // Debug settings
        this.debugTrajectories = false;
        this.debugHitboxes = false;
        
        this.initializeBallisticsData();
        this.initializeMaterialData();
        this.createProjectilePool();
        this.setupEventListeners();
    }

    initializeBallisticsData() {
        // Real-world ballistics data for different ammunition types
        this.ballisticsData.set('rifle', {
            velocity: 900, // m/s
            mass: 0.008, // kg (8g)
            diameter: 0.0056, // meters (5.56mm)
            ballisticCoefficient: 0.3,
            damage: 35,
            penetration: 25,
            maxRange: 800,
            dropoff: {
                start: 100,
                end: 400,
                minDamage: 15
            }
        });

        this.ballisticsData.set('pistol', {
            velocity: 350,
            mass: 0.012, // kg (12g)
            diameter: 0.009, // meters (9mm)
            ballisticCoefficient: 0.15,
            damage: 25,
            penetration: 10,
            maxRange: 200,
            dropoff: {
                start: 50,
                end: 150,
                minDamage: 10
            }
        });

        this.ballisticsData.set('sniper', {
            velocity: 1200,
            mass: 0.015, // kg (15g)
            diameter: 0.0086, // meters (8.6mm)
            ballisticCoefficient: 0.6,
            damage: 100,
            penetration: 50,
            maxRange: 1500,
            dropoff: {
                start: 200,
                end: 800,
                minDamage: 60
            }
        });

        this.ballisticsData.set('shotgun', {
            velocity: 400,
            mass: 0.003, // kg per pellet
            diameter: 0.003, // meters
            ballisticCoefficient: 0.05,
            damage: 15, // per pellet
            penetration: 5,
            maxRange: 50,
            pelletCount: 8,
            spread: 0.1,
            dropoff: {
                start: 10,
                end: 30,
                minDamage: 5
            }
        });
    }

    initializeMaterialData() {
        // Material penetration and ricochet data
        this.materialPenetration.set('flesh', {
            resistance: 1.0,
            ricochetChance: 0.05,
            penetrationLoss: 0.3,
            bloodEffect: true
        });

        this.materialPenetration.set('wood', {
            resistance: 3.0,
            ricochetChance: 0.15,
            penetrationLoss: 0.5,
            splintersEffect: true
        });

        this.materialPenetration.set('concrete', {
            resistance: 8.0,
            ricochetChance: 0.6,
            penetrationLoss: 0.8,
            sparkEffect: true
        });

        this.materialPenetration.set('metal', {
            resistance: 12.0,
            ricochetChance: 0.8,
            penetrationLoss: 0.9,
            sparkEffect: true,
            soundType: 'metal'
        });

        this.materialPenetration.set('glass', {
            resistance: 0.5,
            ricochetChance: 0.1,
            penetrationLoss: 0.1,
            shatterEffect: true
        });

        this.materialPenetration.set('water', {
            resistance: 15.0,
            ricochetChance: 0.9,
            penetrationLoss: 0.95,
            splashEffect: true
        });
    }

    createProjectilePool() {
        // Create a pool of projectile entities for performance
        for (let i = 0; i < this.poolSize; i++) {
            const projectile = this.createProjectileEntity();
            projectile.enabled = false;
            this.projectilePool.push(projectile);
        }
    }

    createProjectileEntity() {
        const projectile = new pc.Entity('Projectile');
        
        // Add render component for tracer
        projectile.addComponent('render', {
            type: 'cylinder'
        });
        
        // Add collision component
        projectile.addComponent('collision', {
            type: 'sphere',
            radius: 0.005
        });
        
        // Add rigidbody for physics
        projectile.addComponent('rigidbody', {
            type: 'kinematic',
            mass: 0.001
        });
        
        this.app.root.addChild(projectile);
        return projectile;
    }

    setupEventListeners() {
        this.app.on('weapon:fire', this.onWeaponFire.bind(this));
        this.app.on('projectile:hit', this.onProjectileHit.bind(this));
        this.app.on('projectile:destroy', this.destroyProjectile.bind(this));
        
        // Environmental events
        this.app.on('weather:windChange', this.updateWind.bind(this));
    }

    // Main projectile firing method
    fireProjectile(fireData) {
        const {
            origin,
            direction,
            ammoType,
            weaponData,
            shooter,
            spread = 0
        } = fireData;

        const ballisticsData = this.ballisticsData.get(ammoType);
        if (!ballisticsData) return null;

        // Handle shotgun pellets
        if (ammoType === 'shotgun') {
            const projectiles = [];
            for (let i = 0; i < ballisticsData.pelletCount; i++) {
                const pelletDirection = this.calculateSpread(direction, ballisticsData.spread + spread);
                const pellet = this.createProjectile({
                    origin: origin.clone(),
                    direction: pelletDirection,
                    ammoType: ammoType,
                    weaponData: weaponData,
                    shooter: shooter,
                    isPellet: true,
                    pelletIndex: i
                });
                if (pellet) projectiles.push(pellet);
            }
            return projectiles;
        } else {
            // Single projectile
            const finalDirection = this.calculateSpread(direction, spread);
            return this.createProjectile({
                origin: origin.clone(),
                direction: finalDirection,
                ammoType: ammoType,
                weaponData: weaponData,
                shooter: shooter
            });
        }
    }

    createProjectile(projectileData) {
        if (this.activeProjectiles.size >= this.maxActiveProjectiles) {
            this.cleanupOldestProjectiles(10);
        }

        const projectile = this.getProjectileFromPool();
        if (!projectile) return null;

        const ballistics = this.ballisticsData.get(projectileData.ammoType);
        const id = this.generateProjectileId();

        // Initialize projectile data
        const data = {
            id: id,
            entity: projectile,
            startTime: Date.now(),
            
            // Position and movement
            position: projectileData.origin.clone(),
            velocity: projectileData.direction.clone().scale(ballistics.velocity),
            lastPosition: projectileData.origin.clone(),
            
            // Ballistics
            mass: ballistics.mass,
            diameter: ballistics.diameter,
            ballisticCoefficient: ballistics.ballisticCoefficient,
            
            // Damage and effects
            baseDamage: ballistics.damage,
            currentDamage: ballistics.damage,
            penetration: ballistics.penetration,
            
            // Travel data
            distanceTraveled: 0,
            maxRange: ballistics.maxRange,
            
            // Source data
            shooter: projectileData.shooter,
            weaponData: projectileData.weaponData,
            ammoType: projectileData.ammoType,
            
            // Special flags
            isPellet: projectileData.isPellet || false,
            pelletIndex: projectileData.pelletIndex || 0,
            
            // Physics state
            hasRicocheted: false,
            penetrationCount: 0,
            maxPenetrations: 3
        };

        // Position the projectile entity
        projectile.setPosition(data.position);
        projectile.enabled = true;

        // Store in active projectiles
        this.activeProjectiles.set(id, data);

        // Create tracer effect if needed
        this.createTracerEffect(data);

        // Network synchronization for multiplayer
        if (this.networkManager) {
            this.networkManager.sendProjectileCreate(data);
        }

        return data;
    }

    update(dt) {
        // Simulate all active projectiles
        this.activeProjectiles.forEach(projectile => {
            this.simulateProjectile(projectile, dt);
        });

        // Update wind
        if (this.windEnabled) {
            this.updateWindEffect(dt);
        }
    }

    simulateProjectile(projectile, dt) {
        const startTime = Date.now();
        const elapsedTime = (startTime - projectile.startTime) / 1000;
        
        // Check if projectile has exceeded max simulation time
        if (elapsedTime > this.maxSimulationTime) {
            this.destroyProjectile(projectile.id);
            return;
        }

        // Store last position for collision detection
        projectile.lastPosition.copy(projectile.position);

        // Apply gravity
        projectile.velocity.y += this.gravity * dt;

        // Apply air resistance
        const speed = projectile.velocity.length();
        if (speed > 0) {
            const dragCoefficient = this.calculateDragCoefficient(projectile);
            const dragForce = dragCoefficient * speed * speed;
            const dragDirection = projectile.velocity.clone().normalize().scale(-1);
            
            projectile.velocity.add(dragDirection.scale(dragForce * dt / projectile.mass));
        }

        // Apply wind effect
        if (this.windEnabled) {
            const windEffect = this.calculateWindEffect(projectile);
            projectile.velocity.add(windEffect.scale(dt));
        }

        // Update position
        const deltaPosition = projectile.velocity.clone().scale(dt);
        projectile.position.add(deltaPosition);
        
        // Update distance traveled
        projectile.distanceTraveled += deltaPosition.length();

        // Check if projectile is out of range
        if (projectile.distanceTraveled > projectile.maxRange || 
            projectile.position.distance(projectile.lastPosition) > this.maxSimulationDistance) {
            this.destroyProjectile(projectile.id);
            return;
        }

        // Check if speed is too low
        if (speed < this.minProjectileSpeed) {
            this.destroyProjectile(projectile.id);
            return;
        }

        // Update entity position
        projectile.entity.setPosition(projectile.position);

        // Perform collision detection
        this.checkCollisions(projectile);

        // Update damage based on distance
        this.updateDamageDropoff(projectile);
    }

    checkCollisions(projectile) {
        // Raycast from last position to current position
        const from = projectile.lastPosition;
        const to = projectile.position;
        
        const rayDirection = to.clone().sub(from);
        const rayDistance = rayDirection.length();
        
        if (rayDistance === 0) return;
        
        rayDirection.normalize();

        // Perform raycast
        const result = this.app.systems.rigidbody.raycastFirst(from, to);
        
        if (result) {
            this.handleCollision(projectile, result);
        }
    }

    handleCollision(projectile, collision) {
        const hitPoint = collision.point;
        const hitNormal = collision.normal;
        const hitEntity = collision.entity;
        
        // Determine material type
        const material = this.getMaterialType(hitEntity);
        const materialData = this.materialPenetration.get(material);
        
        if (!materialData) {
            this.destroyProjectile(projectile.id);
            return;
        }

        // Calculate impact data
        const impactData = {
            projectile: projectile,
            hitPoint: hitPoint,
            hitNormal: hitNormal,
            hitEntity: hitEntity,
            material: material,
            materialData: materialData,
            impactAngle: this.calculateImpactAngle(projectile.velocity, hitNormal),
            impactVelocity: projectile.velocity.length()
        };

        // Check for ricochet
        if (this.shouldRicochet(impactData)) {
            this.handleRicochet(impactData);
            return;
        }

        // Check for penetration
        if (this.canPenetrate(impactData)) {
            this.handlePenetration(impactData);
            return;
        }

        // Regular hit
        this.handleHit(impactData);
        this.destroyProjectile(projectile.id);
    }

    shouldRicochet(impactData) {
        const { projectile, materialData, impactAngle } = impactData;
        
        // Shallow angle increases ricochet chance
        const angleModifier = Math.cos(impactAngle);
        const ricochetChance = materialData.ricochetChance * angleModifier;
        
        // Low damage projectiles are more likely to ricochet
        const damageModifier = Math.max(0.1, projectile.currentDamage / projectile.baseDamage);
        
        return Math.random() < ricochetChance / damageModifier && !projectile.hasRicocheted;
    }

    handleRicochet(impactData) {
        const { projectile, hitNormal, hitPoint } = impactData;
        
        // Calculate reflection direction
        const incomingDirection = projectile.velocity.clone().normalize();
        const reflectedDirection = this.calculateReflection(incomingDirection, hitNormal);
        
        // Reduce velocity and damage
        const velocityLoss = 0.3 + Math.random() * 0.3; // 30-60% velocity loss
        projectile.velocity = reflectedDirection.scale(projectile.velocity.length() * (1 - velocityLoss));
        projectile.currentDamage *= 0.7; // 30% damage loss
        
        // Update position to hit point
        projectile.position.copy(hitPoint);
        projectile.hasRicocheted = true;
        
        // Create ricochet effect
        this.createRicochetEffect(impactData);
        
        // Play ricochet sound
        this.audioManager?.playSound('ricochet', hitPoint);
    }

    canPenetrate(impactData) {
        const { projectile, materialData } = impactData;
        
        return projectile.penetration > materialData.resistance && 
               projectile.penetrationCount < projectile.maxPenetrations;
    }

    handlePenetration(impactData) {
        const { projectile, materialData, hitPoint, hitEntity } = impactData;
        
        // Calculate thickness of object (simplified)
        const thickness = this.calculateObjectThickness(hitEntity, projectile.velocity);
        
        // Reduce projectile energy
        const energyLoss = materialData.penetrationLoss * thickness;
        projectile.currentDamage *= (1 - energyLoss);
        projectile.penetration *= (1 - energyLoss);
        projectile.penetrationCount++;
        
        // Slightly deflect trajectory
        const deflection = (Math.random() - 0.5) * 0.1; // Small random deflection
        projectile.velocity.y += deflection;
        
        // Update position past the object
        const exitPoint = this.calculateExitPoint(hitPoint, projectile.velocity, thickness);
        projectile.position.copy(exitPoint);
        
        // Create penetration effect
        this.createPenetrationEffect(impactData);
        
        // Damage the hit entity if it's a player/AI
        this.applyDamage(impactData);
    }

    handleHit(impactData) {
        const { projectile, hitPoint, materialData } = impactData;
        
        // Apply damage
        this.applyDamage(impactData);
        
        // Create impact effects
        this.createImpactEffect(impactData);
        
        // Play impact sound
        const soundType = materialData.soundType || 'default';
        this.audioManager?.playSound(`impact_${soundType}`, hitPoint);
        
        // Create decal
        this.createDecal(impactData);
    }

    applyDamage(impactData) {
        const { projectile, hitEntity, hitPoint } = impactData;
        
        if (!hitEntity || !hitEntity.script) return;
        
        // Check if entity can take damage
        const healthSystem = hitEntity.script.healthSystem;
        if (!healthSystem) return;
        
        // Calculate final damage
        const damage = this.calculateFinalDamage(impactData);
        
        // Apply damage
        const damageInfo = {
            amount: damage,
            type: 'ballistic',
            source: projectile.shooter,
            weapon: projectile.weaponData,
            hitPoint: hitPoint,
            projectile: projectile
        };
        
        healthSystem.takeDamage(damageInfo);
        
        // Fire damage event
        this.app.fire('projectile:hit', damageInfo);
    }

    calculateFinalDamage(impactData) {
        const { projectile, hitEntity } = impactData;
        
        let damage = projectile.currentDamage;
        
        // Apply armor reduction if target has armor
        if (hitEntity.script.healthSystem) {
            const armor = hitEntity.script.healthSystem.getArmor();
            damage = Math.max(damage * 0.1, damage - armor * 0.5);
        }
        
        // Apply headshot multiplier
        if (this.isHeadshot(impactData)) {
            damage *= 2.0;
        }
        
        return Math.round(damage);
    }

    // Utility methods
    calculateSpread(direction, spreadAngle) {
        if (spreadAngle === 0) return direction.clone();
        
        const spread = new pc.Vec3(
            (Math.random() - 0.5) * spreadAngle,
            (Math.random() - 0.5) * spreadAngle,
            0
        );
        
        return direction.clone().add(spread).normalize();
    }

    calculateDragCoefficient(projectile) {
        // Simplified drag calculation based on ballistic coefficient
        const airDensity = 1.225; // kg/m³ at sea level
        const crossSectionalArea = Math.PI * (projectile.diameter / 2) ** 2;
        
        return (0.5 * airDensity * crossSectionalArea) / projectile.ballisticCoefficient;
    }

    calculateWindEffect(projectile) {
        // Wind affects projectiles more at longer ranges
        const windInfluence = Math.min(projectile.distanceTraveled / 100, 1.0);
        return this.windVector.clone().scale(this.windStrength * windInfluence / projectile.mass);
    }

    calculateImpactAngle(velocity, normal) {
        const velocityNorm = velocity.clone().normalize();
        const normalNorm = normal.clone().normalize();
        return Math.acos(Math.abs(velocityNorm.dot(normalNorm)));
    }

    calculateReflection(incoming, normal) {
        // Reflect vector: R = I - 2(I·N)N
        const dot = incoming.dot(normal);
        return incoming.clone().sub(normal.clone().scale(2 * dot));
    }

    calculateObjectThickness(entity, velocity) {
        // Simplified thickness calculation
        if (entity.collision) {
            const bounds = entity.collision.aabb;
            const size = bounds.halfExtents.length();
            return Math.min(size * 2, 0.5); // Max 0.5m thickness
        }
        return 0.1; // Default thickness
    }

    calculateExitPoint(entryPoint, velocity, thickness) {
        const direction = velocity.clone().normalize();
        return entryPoint.clone().add(direction.scale(thickness));
    }

    getMaterialType(entity) {
        // Determine material type from entity tags or name
        if (entity.tags) {
            if (entity.tags.has('metal')) return 'metal';
            if (entity.tags.has('concrete')) return 'concrete';
            if (entity.tags.has('wood')) return 'wood';
            if (entity.tags.has('glass')) return 'glass';
            if (entity.tags.has('water')) return 'water';
        }
        
        // Check if it's a player/AI
        if (entity.script && (entity.script.playerController || entity.script.aiController)) {
            return 'flesh';
        }
        
        return 'concrete'; // Default material
    }

    isHeadshot(impactData) {
        const { hitEntity, hitPoint } = impactData;
        
        if (!hitEntity.script || !hitEntity.script.healthSystem) return false;
        
        // Check if hit point is in head region
        const headBone = hitEntity.findByName('Head');
        if (headBone) {
            const distance = hitPoint.distance(headBone.getPosition());
            return distance < 0.2; // 20cm radius for headshot
        }
        
        return false;
    }

    updateDamageDropoff(projectile) {
        const ballistics = this.ballisticsData.get(projectile.ammoType);
        const dropoff = ballistics.dropoff;
        
        if (projectile.distanceTraveled > dropoff.start) {
            const dropoffRange = dropoff.end - dropoff.start;
            const dropoffProgress = Math.min(
                (projectile.distanceTraveled - dropoff.start) / dropoffRange, 
                1.0
            );
            
            const damageRange = projectile.baseDamage - dropoff.minDamage;
            projectile.currentDamage = projectile.baseDamage - (damageRange * dropoffProgress);
        }
    }

    // Effect creation methods
    createTracerEffect(projectile) {
        if (this.effectsManager) {
            this.effectsManager.createTracer({
                start: projectile.position.clone(),
                projectileId: projectile.id,
                ammoType: projectile.ammoType
            });
        }
    }

    createImpactEffect(impactData) {
        const { hitPoint, materialData, material } = impactData;
        
        if (this.effectsManager) {
            this.effectsManager.createImpactEffect({
                position: hitPoint,
                material: material,
                normal: impactData.hitNormal
            });
        }
        
        // Create material-specific effects
        if (materialData.sparkEffect) {
            this.effectsManager?.createSparks(hitPoint);
        }
        
        if (materialData.bloodEffect) {
            this.effectsManager?.createBloodEffect(hitPoint);
        }
        
        if (materialData.splintersEffect) {
            this.effectsManager?.createSplinters(hitPoint);
        }
    }

    createRicochetEffect(impactData) {
        if (this.effectsManager) {
            this.effectsManager.createRicochetEffect({
                position: impactData.hitPoint,
                direction: impactData.projectile.velocity.clone().normalize()
            });
        }
    }

    createPenetrationEffect(impactData) {
        if (this.effectsManager) {
            this.effectsManager.createPenetrationEffect({
                position: impactData.hitPoint,
                material: impactData.material
            });
        }
    }

    createDecal(impactData) {
        const { hitPoint, hitNormal, material } = impactData;
        
        if (this.effectsManager) {
            this.effectsManager.createDecal({
                position: hitPoint,
                normal: hitNormal,
                type: `bullet_hole_${material}`
            });
        }
    }

    // Cleanup and pool management
    getProjectileFromPool() {
        for (let i = 0; i < this.projectilePool.length; i++) {
            const projectile = this.projectilePool[i];
            if (!projectile.enabled) {
                return projectile;
            }
        }
        
        // Create new projectile if pool is exhausted
        return this.createProjectileEntity();
    }

    destroyProjectile(projectileId) {
        const projectile = this.activeProjectiles.get(projectileId);
        if (!projectile) return;
        
        // Disable entity and return to pool
        projectile.entity.enabled = false;
        
        // Remove from active tracking
        this.activeProjectiles.delete(projectileId);
        
        // Fire destruction event
        this.app.fire('projectile:destroy', projectile);
    }

    cleanupOldestProjectiles(count) {
        const projectileArray = Array.from(this.activeProjectiles.values());
        projectileArray.sort((a, b) => a.startTime - b.startTime);
        
        for (let i = 0; i < Math.min(count, projectileArray.length); i++) {
            this.destroyProjectile(projectileArray[i].id);
        }
    }

    // Event handlers
    onWeaponFire(fireData) {
        this.fireProjectile(fireData);
    }

    onProjectileHit(damageInfo) {
        // Handle hit feedback and statistics
        if (this.gameManager) {
            this.gameManager.recordHit(damageInfo);
        }
    }

    updateWind(windData) {
        this.windVector.copy(windData.direction);
        this.windStrength = windData.strength;
    }

    updateWindEffect(dt) {
        // Gradually change wind direction and strength
        const windChangeRate = 0.1 * dt;
        const targetWind = new pc.Vec3(
            Math.sin(Date.now() * 0.0001) * 2,
            0,
            Math.cos(Date.now() * 0.0001) * 2
        );
        
        this.windVector.lerp(this.windVector, targetWind, windChangeRate);
    }

    // Utility methods
    generateProjectileId() {
        return `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Debug methods
    enableDebugMode(enabled) {
        this.debugTrajectories = enabled;
        this.debugHitboxes = enabled;
    }

    getActiveProjectileCount() {
        return this.activeProjectiles.size;
    }

    getProjectilePoolStatus() {
        const availableCount = this.projectilePool.filter(p => !p.enabled).length;
        return {
            total: this.projectilePool.length,
            available: availableCount,
            active: this.activeProjectiles.size
        };
    }

    // Network synchronization
    getProjectileState() {
        const projectileStates = [];
        
        this.activeProjectiles.forEach(projectile => {
            projectileStates.push({
                id: projectile.id,
                position: projectile.position.clone(),
                velocity: projectile.velocity.clone(),
                ammoType: projectile.ammoType,
                damage: projectile.currentDamage
            });
        });
        
        return projectileStates;
    }

    applyNetworkProjectileState(states) {
        // Apply projectile states from network for multiplayer sync
        states.forEach(state => {
            const projectile = this.activeProjectiles.get(state.id);
            if (projectile) {
                projectile.position.copy(state.position);
                projectile.velocity.copy(state.velocity);
                projectile.currentDamage = state.damage;
            }
        });
    }
}

pc.registerScript(ProjectileSystem, 'ProjectileSystem');
