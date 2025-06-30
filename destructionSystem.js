/**
 * DestructionSystem.js
 * Destructible environment handling system
 * Manages debris physics simulation, structural integrity calculation, repair/reconstruction mechanics, and performance optimization
 */

class DestructionSystem extends pc.ScriptType {
    static get scriptName() { return 'DestructionSystem'; }

    initialize() {
        this.gameManager = this.app.root.findByName('Game_Manager').script.gameManager;
        this.networkManager = this.app.root.findByName('Game_Manager').script.networkManager;
        this.audioManager = this.app.root.findByName('Game_Manager').script.audioManager;
        this.effectsManager = this.app.root.findByName('Game_Manager').script.effectsManager;
        
        // Destructible Objects Tracking
        this.destructibleObjects = new Map();
        this.debrisObjects = new Map();
        this.structuralGroups = new Map();
        this.damageHistory = [];
        
        // Physics Settings
        this.gravityScale = 1.0;
        this.debrisLifetime = 30; // seconds
        this.maxDebrisObjects = 50;
        this.destructionForceMultiplier = 1.0;
        
        // Performance Settings
        this.lodSystem = true;
        this.debrisCullingDistance = 100;
        this.updateFrequency = 10; // updates per second
        this.lastUpdateTime = 0;
        
        // Material Properties
        this.materialProperties = new Map();
        this.damageThresholds = new Map();
        this.repairSettings = new Map();
        
        // Network Synchronization
        this.networkSync = true;
        this.pendingDestruction = [];
        this.destructionQueue = [];
        
        this.initializeDestructionSystem();
        this.setupEventListeners();
    }

    initializeDestructionSystem() {
        this.loadMaterialProperties();
        this.setupDamageThresholds();
        this.scanForDestructibleObjects();
        this.initializeStructuralGroups();
    }

    loadMaterialProperties() {
        // Define material properties for different destructible materials
        this.materialProperties.set('concrete', {
            density: 2400, // kg/m³
            tensileStrength: 3.5, // MPa
            compressiveStrength: 30, // MPa
            hardness: 0.8,
            fragmentationPattern: 'chunks',
            debrisCount: { min: 5, max: 15 },
            destructionSound: 'concrete_break',
            particleEffect: 'concrete_dust'
        });

        this.materialProperties.set('wood', {
            density: 600,
            tensileStrength: 40,
            compressiveStrength: 40,
            hardness: 0.4,
            fragmentationPattern: 'splinters',
            debrisCount: { min: 3, max: 8 },
            destructionSound: 'wood_break',
            particleEffect: 'wood_chips'
        });

        this.materialProperties.set('glass', {
            density: 2500,
            tensileStrength: 50,
            compressiveStrength: 200,
            hardness: 0.2,
            fragmentationPattern: 'shards',
            debrisCount: { min: 10, max: 25 },
            destructionSound: 'glass_shatter',
            particleEffect: 'glass_sparkle'
        });

        this.materialProperties.set('metal', {
            density: 7800,
            tensileStrength: 400,
            compressiveStrength: 400,
            hardness: 0.9,
            fragmentationPattern: 'sheets',
            debrisCount: { min: 2, max: 6 },
            destructionSound: 'metal_break',
            particleEffect: 'metal_sparks'
        });

        this.materialProperties.set('plastic', {
            density: 950,
            tensileStrength: 30,
            compressiveStrength: 50,
            hardness: 0.3,
            fragmentationPattern: 'pieces',
            debrisCount: { min: 4, max: 10 },
            destructionSound: 'plastic_crack',
            particleEffect: 'plastic_debris'
        });
    }

    setupDamageThresholds() {
        // Set damage thresholds for different object types
        this.damageThresholds.set('wall', 100);
        this.damageThresholds.set('window', 25);
        this.damageThresholds.set('door', 75);
        this.damageThresholds.set('furniture', 50);
        this.damageThresholds.set('vehicle', 200);
        this.damageThresholds.set('barrel', 60);
        this.damageThresholds.set('crate', 40);
    }

    scanForDestructibleObjects() {
        // Find all destructible objects in the scene
        const destructibleEntities = this.app.root.findByTag('destructible');
        
        destructibleEntities.forEach(entity => {
            this.registerDestructibleObject(entity);
        });
    }

    registerDestructibleObject(entity) {
        if (!entity) return;
        
        const objectId = entity.getGuid();
        const material = entity.tags?.list.find(tag => 
            this.materialProperties.has(tag)) || 'concrete';
        const objectType = entity.tags?.list.find(tag => 
            this.damageThresholds.has(tag)) || 'wall';
        
        const destructibleData = {
            entity: entity,
            objectId: objectId,
            material: material,
            objectType: objectType,
            maxHealth: this.damageThresholds.get(objectType) || 100,
            currentHealth: this.damageThresholds.get(objectType) || 100,
            damageAccumulation: 0,
            isDestroyed: false,
            structuralDependencies: [],
            repairProgress: 0,
            lastDamageTime: 0,
            weakPoints: this.generateWeakPoints(entity),
            debrisGenerated: false
        };
        
        this.destructibleObjects.set(objectId, destructibleData);
        this.setupDestructiblePhysics(entity, destructibleData);
    }

    generateWeakPoints(entity) {
        const weakPoints = [];
        const bounds = entity.aabb;
        
        // Generate weak points based on object size
        const pointCount = Math.min(5, Math.max(2, Math.floor(bounds.halfExtents.length())));
        
        for (let i = 0; i < pointCount; i++) {
            weakPoints.push({
                position: new pc.Vec3(
                    (Math.random() - 0.5) * bounds.halfExtents.x * 2,
                    (Math.random() - 0.5) * bounds.halfExtents.y * 2,
                    (Math.random() - 0.5) * bounds.halfExtents.z * 2
                ),
                damageMultiplier: 1.5 + Math.random() * 0.5,
                radius: 0.5 + Math.random() * 0.5
            });
        }
        
        return weakPoints;
    }

    setupDestructiblePhysics(entity, destructibleData) {
        // Add physics components if not present
        if (!entity.rigidbody) {
            const material = this.materialProperties.get(destructibleData.material);
            entity.addComponent('rigidbody', {
                type: 'static',
                mass: material.density * this.calculateVolume(entity),
                restitution: 0.3,
                friction: 0.7
            });
        }
        
        if (!entity.collision) {
            entity.addComponent('collision', {
                type: 'mesh'
            });
        }
    }

    initializeStructuralGroups() {
        // Group related destructible objects for structural integrity calculations
        const buildings = this.app.root.findByTag('building');
        
        buildings.forEach(building => {
            const groupId = building.getGuid();
            const structuralElements = building.findByTag('structural');
            
            this.structuralGroups.set(groupId, {
                building: building,
                elements: structuralElements,
                integrityThreshold: 0.3, // 30% of elements must remain
                isCollapsed: false,
                collapseProgress: 0
            });
        });
    }

    setupEventListeners() {
        // Damage events
        this.app.on('damage:apply', this.onDamageApplied.bind(this));
        this.app.on('explosion:impact', this.onExplosionImpact.bind(this));
        this.app.on('projectile:impact', this.onProjectileImpact.bind(this));
        
        // Network events
        this.app.on('network:destruction_sync', this.onDestructionSync.bind(this));
        this.app.on('network:repair_sync', this.onRepairSync.bind(this));
        
        // System events
        this.app.on('game:round_start', this.onRoundStart.bind(this));
        this.app.on('game:round_end', this.onRoundEnd.bind(this));
    }

    // Damage Processing
    applyDamage(entity, damage, impactPoint, damageSource = null) {
        const objectId = entity.getGuid();
        const destructibleData = this.destructibleObjects.get(objectId);
        
        if (!destructibleData || destructibleData.isDestroyed) return false;
        
        // Calculate actual damage
        const actualDamage = this.calculateActualDamage(destructibleData, damage, impactPoint, damageSource);
        
        // Apply damage
        destructibleData.currentHealth -= actualDamage;
        destructibleData.damageAccumulation += actualDamage;
        destructibleData.lastDamageTime = Date.now();
        
        // Visual damage effects
        this.applyVisualDamage(destructibleData, actualDamage, impactPoint);
        
        // Check for destruction
        if (destructibleData.currentHealth <= 0) {
            this.destroyObject(destructibleData, impactPoint, damageSource);
            return true;
        }
        
        // Network synchronization
        if (this.networkSync) {
            this.syncDamage(objectId, actualDamage, impactPoint);
        }
        
        return false;
    }

    calculateActualDamage(destructibleData, damage, impactPoint, damageSource) {
        let actualDamage = damage;
        
        // Material resistance
        const material = this.materialProperties.get(destructibleData.material);
        if (material) {
            actualDamage *= (1 / material.hardness);
        }
        
        // Weak point multiplier
        if (impactPoint) {
            const weakPointMultiplier = this.getWeakPointMultiplier(destructibleData, impactPoint);
            actualDamage *= weakPointMultiplier;
        }
        
        // Damage source modifiers
        if (damageSource) {
            switch (damageSource.type) {
                case 'explosion':
                    actualDamage *= 1.5; // Explosions are more effective
                    break;
                case 'bullet':
                    actualDamage *= 0.8; // Bullets less effective against structures
                    break;
                case 'melee':
                    actualDamage *= 0.6; // Melee least effective
                    break;
            }
        }
        
        return actualDamage;
    }

    getWeakPointMultiplier(destructibleData, impactPoint) {
        const entityPos = destructibleData.entity.getPosition();
        let maxMultiplier = 1.0;
        
        destructibleData.weakPoints.forEach(weakPoint => {
            const worldWeakPoint = entityPos.clone().add(weakPoint.position);
            const distance = impactPoint.distance(worldWeakPoint);
            
            if (distance <= weakPoint.radius) {
                maxMultiplier = Math.max(maxMultiplier, weakPoint.damageMultiplier);
            }
        });
        
        return maxMultiplier;
    }

    applyVisualDamage(destructibleData, damage, impactPoint) {
        const damageRatio = 1 - (destructibleData.currentHealth / destructibleData.maxHealth);
        
        // Apply damage decals
        if (impactPoint) {
            this.createDamageDecal(destructibleData.entity, impactPoint, damage);
        }
        
        // Apply progressive destruction materials
        if (damageRatio > 0.3) {
            this.applyDamagedMaterial(destructibleData.entity, damageRatio);
        }
        
        // Crack generation
        if (damageRatio > 0.5) {
            this.generateCracks(destructibleData.entity, impactPoint);
        }
    }

    createDamageDecal(entity, impactPoint, damage) {
        // Create bullet holes, scorch marks, etc.
        const decal = new pc.Entity('DamageDecal');
        decal.addComponent('element', {
            type: 'image',
            width: Math.min(damage * 0.1, 2),
            height: Math.min(damage * 0.1, 2)
        });
        
        decal.setPosition(impactPoint);
        entity.addChild(decal);
        
        // Remove decal after some time
        setTimeout(() => {
            if (decal && decal.parent) {
                decal.destroy();
            }
        }, 60000); // 1 minute
    }

    applyDamagedMaterial(entity, damageRatio) {
        // Apply increasingly damaged materials
        const renderer = entity.render;
        if (!renderer) return;
        
        const materialName = damageRatio > 0.8 ? 'heavily_damaged' :
                            damageRatio > 0.5 ? 'damaged' : 'lightly_damaged';
        
        // In a real implementation, you would load these materials from assets
        // renderer.material = this.app.assets.find(materialName);
    }

    generateCracks(entity, impactPoint) {
        // Generate procedural cracks emanating from impact point
        const crackEntity = new pc.Entity('Crack');
        crackEntity.addComponent('render', {
            type: 'asset'
            // asset: this.app.assets.find('crack_texture')
        });
        
        crackEntity.setPosition(impactPoint);
        entity.addChild(crackEntity);
    }

    // Object Destruction
    destroyObject(destructibleData, impactPoint, damageSource) {
        if (destructibleData.isDestroyed) return;
        
        destructibleData.isDestroyed = true;
        const entity = destructibleData.entity;
        
        // Generate debris
        this.generateDebris(destructibleData, impactPoint, damageSource);
        
        // Play destruction effects
        this.playDestructionEffects(destructibleData, impactPoint);
        
        // Check structural integrity
        this.updateStructuralIntegrity(destructibleData);
        
        // Hide/remove original object
        this.hideDestroyedObject(entity);
        
        // Network sync
        if (this.networkSync) {
            this.syncDestruction(destructibleData.objectId, impactPoint, damageSource);
        }
        
        this.app.fire('destruction:object_destroyed', {
            objectId: destructibleData.objectId,
            material: destructibleData.material,
            impactPoint: impactPoint
        });
    }

    generateDebris(destructibleData, impactPoint, damageSource) {
        if (destructibleData.debrisGenerated) return;
        
        const material = this.materialProperties.get(destructibleData.material);
        const entity = destructibleData.entity;
        const debrisCount = Math.floor(
            material.debrisCount.min + 
            Math.random() * (material.debrisCount.max - material.debrisCount.min)
        );
        
        for (let i = 0; i < debrisCount; i++) {
            this.createDebrisPiece(entity, impactPoint, material, damageSource, i);
        }
        
        destructibleData.debrisGenerated = true;
    }

    createDebrisPiece(originalEntity, impactPoint, material, damageSource, index) {
        const debris = new pc.Entity(`Debris_${originalEntity.name}_${index}`);
        
        // Add visual component
        debris.addComponent('render', {
            type: 'box', // In real implementation, use actual debris meshes
            material: this.createDebrisMaterial(material)
        });
        
        // Add physics
        const mass = (material.density * this.calculateVolume(originalEntity)) / material.debrisCount.max;
        debris.addComponent('rigidbody', {
            type: 'dynamic',
            mass: mass,
            restitution: 0.4,
            friction: 0.8
        });
        
        debris.addComponent('collision', {
            type: 'box',
            halfExtents: this.calculateDebrisSize(originalEntity, index)
        });
        
        // Position debris
        const debrisPosition = this.calculateDebrisPosition(originalEntity, impactPoint, index);
        debris.setPosition(debrisPosition);
        
        // Apply initial force
        const force = this.calculateDebrisForce(impactPoint, debrisPosition, damageSource);
        debris.rigidbody.applyImpulse(force);
        
        // Add to scene and tracking
        this.app.root.addChild(debris);
        this.debrisObjects.set(debris.getGuid(), {
            entity: debris,
            spawnTime: Date.now(),
            material: material.fragmentationPattern
        });
        
        // Schedule cleanup
        this.scheduleDebrisCleanup(debris);
    }

    calculateDebrisSize(originalEntity, index) {
        const originalSize = originalEntity.aabb.halfExtents;
        const scale = 0.3 + Math.random() * 0.4; // 30-70% of original size
        
        return new pc.Vec3(
            originalSize.x * scale,
            originalSize.y * scale,
            originalSize.z * scale
        );
    }

    calculateDebrisPosition(originalEntity, impactPoint, index) {
        const entityPos = originalEntity.getPosition();
        const bounds = originalEntity.aabb.halfExtents;
        
        // Scatter debris around the object
        const angle = (index / 5) * Math.PI * 2 + (Math.random() - 0.5) * Math.PI;
        const distance = Math.random() * bounds.length();
        
        return new pc.Vec3(
            entityPos.x + Math.cos(angle) * distance,
            entityPos.y + bounds.y + Math.random() * 2,
            entityPos.z + Math.sin(angle) * distance
        );
    }

    calculateDebrisForce(impactPoint, debrisPosition, damageSource) {
        const direction = debrisPosition.clone().sub(impactPoint).normalize();
        let forceMagnitude = 10 + Math.random() * 20;
        
        // Adjust force based on damage source
        if (damageSource) {
            switch (damageSource.type) {
                case 'explosion':
                    forceMagnitude *= 3;
                    break;
                case 'bullet':
                    forceMagnitude *= 0.5;
                    break;
            }
        }
        
        return direction.scale(forceMagnitude * this.destructionForceMultiplier);
    }

    createDebrisMaterial(materialProperties) {
        // Create appropriate material for debris
        const material = new pc.StandardMaterial();
        
        switch (materialProperties.fragmentationPattern) {
            case 'chunks':
                material.diffuse = new pc.Color(0.7, 0.7, 0.7);
                material.roughness = 0.8;
                break;
            case 'shards':
                material.diffuse = new pc.Color(0.9, 0.9, 1.0);
                material.metalness = 0.1;
                material.opacity = 0.8;
                break;
            case 'splinters':
                material.diffuse = new pc.Color(0.6, 0.4, 0.2);
                material.roughness = 0.9;
                break;
            case 'sheets':
                material.diffuse = new pc.Color(0.8, 0.8, 0.8);
                material.metalness = 0.7;
                break;
        }
        
        material.update();
        return material;
    }

    scheduleDebrisCleanup(debris) {
        setTimeout(() => {
            this.cleanupDebris(debris);
        }, this.debrisLifetime * 1000);
    }

    cleanupDebris(debris) {
        if (!debris || !debris.parent) return;
        
        const debrisId = debris.getGuid();
        this.debrisObjects.delete(debrisId);
        
        // Fade out debris
        const fadeTime = 2000; // 2 seconds
        const startOpacity = 1.0;
        const fadeStart = Date.now();
        
        const fadeInterval = setInterval(() => {
            const elapsed = Date.now() - fadeStart;
            const progress = elapsed / fadeTime;
            
            if (progress >= 1.0) {
                clearInterval(fadeInterval);
                if (debris.parent) {
                    debris.destroy();
                }
                return;
            }
            
            const opacity = startOpacity * (1 - progress);
            if (debris.render && debris.render.material) {
                debris.render.material.opacity = opacity;
                debris.render.material.update();
            }
        }, 50);
    }

    playDestructionEffects(destructibleData, impactPoint) {
        const material = this.materialProperties.get(destructibleData.material);
        
        // Play destruction sound
        if (this.audioManager && material.destructionSound) {
            this.audioManager.play3D(material.destructionSound, impactPoint, {
                volume: 0.8,
                pitch: 0.9 + Math.random() * 0.2
            });
        }
        
        // Play particle effects
        if (this.effectsManager && material.particleEffect) {
            this.effectsManager.playEffect(material.particleEffect, impactPoint, {
                duration: 3.0,
                intensity: 1.0
            });
        }
    }

    hideDestroyedObject(entity) {
        // Hide the original object
        if (entity.render) {
            entity.render.enabled = false;
        }
        
        // Disable collision
        if (entity.collision) {
            entity.collision.enabled = false;
        }
        
        // Keep entity for potential repair, but make it non-interactive
        entity.tags.add('destroyed');
    }

    // Structural Integrity
    updateStructuralIntegrity(destroyedObjectData) {
        // Find which structural groups this object belongs to
        this.structuralGroups.forEach((group, groupId) => {
            if (group.elements.includes(destroyedObjectData.entity)) {
                this.checkStructuralCollapse(group);
            }
        });
    }

    checkStructuralCollapse(structuralGroup) {
        const totalElements = structuralGroup.elements.length;
        const destroyedElements = structuralGroup.elements.filter(element => 
            element.tags.has('destroyed')).length;
        
        const integrityRatio = 1 - (destroyedElements / totalElements);
        
        if (integrityRatio < structuralGroup.integrityThreshold && !structuralGroup.isCollapsed) {
            this.triggerStructuralCollapse(structuralGroup);
        }
    }

    triggerStructuralCollapse(structuralGroup) {
        structuralGroup.isCollapsed = true;
        
        // Destroy remaining structural elements with cascading effect
        const remainingElements = structuralGroup.elements.filter(element => 
            !element.tags.has('destroyed'));
        
        remainingElements.forEach((element, index) => {
            setTimeout(() => {
                const destructibleData = this.destructibleObjects.get(element.getGuid());
                if (destructibleData && !destructibleData.isDestroyed) {
                    this.destroyObject(destructibleData, element.getPosition(), {
                        type: 'structural_collapse'
                    });
                }
            }, index * 500); // Stagger the collapse
        });
        
        this.app.fire('destruction:structural_collapse', {
            building: structuralGroup.building,
            groupId: structuralGroup.building.getGuid()
        });
    }

    // Repair System
    repairObject(objectId, repairAmount = null) {
        const destructibleData = this.destructibleObjects.get(objectId);
        if (!destructibleData) return false;
        
        if (destructibleData.isDestroyed) {
            return this.reconstructObject(destructibleData);
        }
        
        const maxRepair = repairAmount || (destructibleData.maxHealth * 0.3);
        const actualRepair = Math.min(maxRepair, 
            destructibleData.maxHealth - destructibleData.currentHealth);
        
        destructibleData.currentHealth += actualRepair;
        destructibleData.repairProgress += actualRepair;
        
        // Visual repair effects
        this.applyRepairEffects(destructibleData, actualRepair);
        
        // Network sync
        if (this.networkSync) {
            this.syncRepair(objectId, actualRepair);
        }
        
        return true;
    }

    reconstructObject(destructibleData) {
        if (!destructibleData.isDestroyed) return false;
        
        // Remove existing debris
        this.cleanupObjectDebris(destructibleData.objectId);
        
        // Restore object
        destructibleData.isDestroyed = false;
        destructibleData.currentHealth = destructibleData.maxHealth * 0.5; // 50% health on reconstruction
        destructibleData.debrisGenerated = false;
        
        const entity = destructibleData.entity;
        entity.tags.remove('destroyed');
        
        // Re-enable components
        if (entity.render) entity.render.enabled = true;
        if (entity.collision) entity.collision.enabled = true;
        
        // Restoration effects
        this.playRestorationEffects(entity);
        
        return true;
    }

    cleanupObjectDebris(objectId) {
        const debrisToRemove = [];
        
        this.debrisObjects.forEach((debris, debrisId) => {
            if (debris.entity.name.includes(objectId)) {
                debrisToRemove.push(debrisId);
            }
        });
        
        debrisToRemove.forEach(debrisId => {
            const debris = this.debrisObjects.get(debrisId);
            if (debris && debris.entity.parent) {
                debris.entity.destroy();
            }
            this.debrisObjects.delete(debrisId);
        });
    }

    applyRepairEffects(destructibleData, repairAmount) {
        // Visual repair feedback
        const entity = destructibleData.entity;
        
        // Sparking effects for repairs
        if (this.effectsManager) {
            this.effectsManager.playEffect('repair_sparks', entity.getPosition(), {
                duration: 1.0,
                intensity: repairAmount / 50
            });
        }
        
        // Repair sounds
        if (this.audioManager) {
            this.audioManager.play3D('repair_sound', entity.getPosition(), {
                volume: 0.5
            });
        }
    }

    playRestorationEffects(entity) {
        const position = entity.getPosition();
        
        // Magical restoration effect
        if (this.effectsManager) {
            this.effectsManager.playEffect('restoration_glow', position, {
                duration: 3.0,
                intensity: 1.0
            });
        }
        
        // Restoration sound
        if (this.audioManager) {
            this.audioManager.play3D('restoration_sound', position, {
                volume: 0.7
            });
        }
    }

    // Utility Methods
    calculateVolume(entity) {
        const bounds = entity.aabb.halfExtents;
        return bounds.x * bounds.y * bounds.z * 8; // halfExtents to full extents
    }

    optimizeDebris() {
        const currentTime = Date.now();
        const playerPositions = this.gameManager?.getPlayerPositions() || [];
        
        // Remove debris that's too far from players
        const debrisToRemove = [];
        
        this.debrisObjects.forEach((debris, debrisId) => {
            const debrisPos = debris.entity.getPosition();
            let tooFar = true;
            
            playerPositions.forEach(playerPos => {
                if (debrisPos.distance(playerPos) < this.debrisCullingDistance) {
                    tooFar = false;
                }
            });
            
            if (tooFar || currentTime - debris.spawnTime > this.debrisLifetime * 1000) {
                debrisToRemove.push(debrisId);
            }
        });
        
        debrisToRemove.forEach(debrisId => {
            const debris = this.debrisObjects.get(debrisId);
            this.cleanupDebris(debris.entity);
        });
        
        // Limit total debris count
        if (this.debrisObjects.size > this.maxDebrisObjects) {
            const oldestDebris = Array.from(this.debrisObjects.values())
                .sort((a, b) => a.spawnTime - b.spawnTime)
                .slice(0, this.debrisObjects.size - this.maxDebrisObjects);
            
            oldestDebris.forEach(debris => {
                this.cleanupDebris(debris.entity);
            });
        }
    }

    // Event Handlers
    onDamageApplied(data) {
        if (data.target && this.destructibleObjects.has(data.target.getGuid())) {
            this.applyDamage(data.target, data.damage, data.impactPoint, data.source);
        }
    }

    onExplosionImpact(data) {
        const affectedObjects = this.findObjectsInRadius(data.position, data.radius);
        
        affectedObjects.forEach(objectData => {
            const distance = data.position.distance(objectData.entity.getPosition());
            const damageFalloff = 1 - (distance / data.radius);
            const adjustedDamage = data.damage * damageFalloff;
            
            this.applyDamage(objectData.entity, adjustedDamage, data.position, {
                type: 'explosion',
                force: data.force
            });
        });
    }

    onProjectileImpact(data) {
        if (data.target && this.destructibleObjects.has(data.target.getGuid())) {
            this.applyDamage(data.target, data.damage, data.impactPoint, {
                type: 'bullet',
                caliber: data.caliber
            });
        }
    }

    onRoundStart() {
        // Reset all destructible objects
        this.destructibleObjects.forEach(destructibleData => {
            if (destructibleData.isDestroyed) {
                this.reconstructObject(destructibleData);
            } else {
                destructibleData.currentHealth = destructibleData.maxHealth;
                destructibleData.damageAccumulation = 0;
            }
        });
        
        // Clear all debris
        this.debrisObjects.forEach(debris => {
            this.cleanupDebris(debris.entity);
        });
    }

    onRoundEnd() {
        // Cleanup and optimization
        this.optimizeDebris();
    }

    onDestructionSync(data) {
        // Handle networked destruction
        const destructibleData = this.destructibleObjects.get(data.objectId);
        if (destructibleData && !destructibleData.isDestroyed) {
            this.destroyObject(destructibleData, data.impactPoint, data.damageSource);
        }
    }

    onRepairSync(data) {
        // Handle networked repairs
        this.repairObject(data.objectId, data.repairAmount);
    }

    findObjectsInRadius(position, radius) {
        const objectsInRadius = [];
        
        this.destructibleObjects.forEach(objectData => {
            const distance = position.distance(objectData.entity.getPosition());
            if (distance <= radius) {
                objectsInRadius.push(objectData);
            }
        });
        
        return objectsInRadius;
    }

    // Network Synchronization
    syncDamage(objectId, damage, impactPoint) {
        this.networkManager?.sendMessage('destruction:damage', {
            objectId: objectId,
            damage: damage,
            impactPoint: impactPoint,
            timestamp: Date.now()
        });
    }

    syncDestruction(objectId, impactPoint, damageSource) {
        this.networkManager?.sendMessage('destruction:destroy', {
            objectId: objectId,
            impactPoint: impactPoint,
            damageSource: damageSource,
            timestamp: Date.now()
        });
    }

    syncRepair(objectId, repairAmount) {
        this.networkManager?.sendMessage('destruction:repair', {
            objectId: objectId,
            repairAmount: repairAmount,
            timestamp: Date.now()
        });
    }

    // Public API
    getDestructibleObjects() {
        return new Map(this.destructibleObjects);
    }

    getObjectHealth(objectId) {
        const data = this.destructibleObjects.get(objectId);
        return data ? data.currentHealth : 0;
    }

    isObjectDestroyed(objectId) {
        const data = this.destructibleObjects.get(objectId);
        return data ? data.isDestroyed : false;
    }

    getDebrisCount() {
        return this.debrisObjects.size;
    }

    setDestructionForceMultiplier(multiplier) {
        this.destructionForceMultiplier = multiplier;
    }

    update(dt) {
        const currentTime = Date.now();
        
        // Update only at specified frequency
        if (currentTime - this.lastUpdateTime < 1000 / this.updateFrequency) {
            return;
        }
        this.lastUpdateTime = currentTime;
        
        // Optimize debris
        this.optimizeDebris();
        
        // Update structural integrity checks
        this.structuralGroups.forEach(group => {
            if (!group.isCollapsed) {
                this.checkStructuralCollapse(group);
            }
        });
    }
}

pc.registerScript(DestructionSystem, 'DestructionSystem');
