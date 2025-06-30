/**
 * BattleRoyale.js
 * Battle Royale game mode implementation
 * Shrinking play zone, loot system, last player/team standing
 */

class BattleRoyale extends pc.ScriptType {
    static get scriptName() { return 'BattleRoyale'; }

    initialize() {
        this.gameManager = this.app.root.findByName('Game_Manager').script.gameManager;
        this.hudManager = this.app.root.findByName('HUD_Manager').script.hudManager;
        this.audioManager = this.app.root.findByName('AudioManager').script.audioManager;
        this.weatherSystem = this.app.root.findByName('WeatherSystem')?.script?.weatherSystem;
        
        // Game mode settings
        this.gameMode = 'battleroyale';
        this.maxPlayers = 100;
        this.teamSize = 1; // Solo by default, can be 2-4 for squads
        
        // Zone settings
        this.playZone = {
            center: new pc.Vec3(0, 0, 0),
            radius: 1000, // Starting radius
            targetRadius: 1000,
            shrinkRate: 10, // Units per second
            damagePerSecond: 5,
            nextShrinkTime: 0,
            shrinkDuration: 120000, // 2 minutes
            waitDuration: 60000, // 1 minute between shrinks
            currentPhase: 0,
            maxPhases: 9
        };
        
        // Zone phases with different shrink rates and damage
        this.zonePhases = [
            { waitTime: 300000, shrinkTime: 240000, damage: 1, endRadius: 800 }, // Phase 1
            { waitTime: 180000, shrinkTime: 180000, damage: 2, endRadius: 600 }, // Phase 2
            { waitTime: 150000, shrinkTime: 150000, damage: 5, endRadius: 400 }, // Phase 3
            { waitTime: 120000, shrinkTime: 120000, damage: 8, endRadius: 250 }, // Phase 4
            { waitTime: 90000, shrinkTime: 90000, damage: 12, endRadius: 150 },   // Phase 5
            { waitTime: 60000, shrinkTime: 60000, damage: 15, endRadius: 80 },    // Phase 6
            { waitTime: 45000, shrinkTime: 45000, damage: 20, endRadius: 40 },    // Phase 7
            { waitTime: 30000, shrinkTime: 30000, damage: 25, endRadius: 20 },    // Phase 8
            { waitTime: 15000, shrinkTime: 15000, damage: 30, endRadius: 5 }      // Phase 9
        ];
        
        // Game state
        this.gameStarted = false;
        this.gameEnded = false;
        this.playersAlive = 0;
        this.teamsAlive = 0;
        this.gameStartTime = 0;
        this.zoneStartTime = 0;
        
        // Player tracking
        this.alivePlayers = new Set();
        this.aliveTeams = new Set();
        this.playerPositions = new Map();
        this.playersInZone = new Set();
        
        // Loot system
        this.lootSpawns = [];
        this.supplyDrops = [];
        this.lootTiers = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
        
        // Visual elements
        this.zoneWall = null;
        this.zoneDamageArea = null;
        this.supplyDropEntities = [];
        
        this.initializeGameMode();
    }

    initializeGameMode() {
        this.createPlayZone();
        this.setupLootSystem();
        this.setupEventListeners();
        this.setupGameUI();
        this.startGameLoop();
    }

    createPlayZone() {
        // Create visual zone boundary
        this.createZoneWall();
        this.createZoneDamageArea();
        
        // Initialize zone state
        this.playZone.targetRadius = this.playZone.radius;
        this.updateZoneVisuals();
    }

    createZoneWall() {
        this.zoneWall = new pc.Entity('zone-wall');
        this.zoneWall.addComponent('model', {
            type: 'cylinder'
        });
        
        // Create material for zone wall
        const material = new pc.Material();
        material.diffuse = new pc.Color(0, 0.5, 1, 0.3); // Semi-transparent blue
        material.blendType = pc.BLEND_NORMAL;
        material.transparent = true;
        
        this.zoneWall.model.material = material;
        this.zoneWall.setPosition(this.playZone.center);
        this.zoneWall.setLocalScale(
            this.playZone.radius * 2,
            200, // Height
            this.playZone.radius * 2
        );
        
        this.app.root.addChild(this.zoneWall);
    }

    createZoneDamageArea() {
        // Create area outside the zone that damages players
        this.zoneDamageArea = new pc.Entity('zone-damage-area');
        this.zoneDamageArea.addComponent('rigidbody', {
            type: 'kinematic'
        });
        
        this.zoneDamageArea.addComponent('collision', {
            type: 'cylinder',
            radius: this.playZone.radius + 50,
            height: 200
        });
        
        this.zoneDamageArea.setPosition(this.playZone.center);
        this.app.root.addChild(this.zoneDamageArea);
        
        // Setup collision detection
        this.zoneDamageArea.collision.on('triggerenter', (other) => {
            this.playerEnteredDamageZone(other.entity);
        });
        
        this.zoneDamageArea.collision.on('triggerleave', (other) => {
            this.playerLeftDamageZone(other.entity);
        });
    }

    setupLootSystem() {
        this.generateLootSpawns();
        this.spawnInitialLoot();
    }

    generateLootSpawns() {
        // Generate random loot spawn points across the map
        const spawnCount = 500;
        const mapSize = this.playZone.radius * 0.9;
        
        for (let i = 0; i < spawnCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * mapSize;
            
            const position = new pc.Vec3(
                Math.cos(angle) * distance,
                0,
                Math.sin(angle) * distance
            );
            
            // Determine loot tier based on distance from center
            const distanceRatio = distance / mapSize;
            let tier = 'common';
            
            if (distanceRatio > 0.8) tier = 'legendary';
            else if (distanceRatio > 0.6) tier = 'epic';
            else if (distanceRatio > 0.4) tier = 'rare';
            else if (distanceRatio > 0.2) tier = 'uncommon';
            
            this.lootSpawns.push({
                position: position,
                tier: tier,
                spawned: false
            });
        }
    }

    spawnInitialLoot() {
        this.lootSpawns.forEach(spawn => {
            if (Math.random() < 0.3) { // 30% chance to spawn loot
                this.spawnLootAtLocation(spawn);
            }
        });
    }

    spawnLootAtLocation(spawn) {
        const lootItems = this.generateLootForTier(spawn.tier);
        
        lootItems.forEach(item => {
            this.app.fire('loot:spawn', {
                position: spawn.position.clone(),
                item: item
            });
        });
        
        spawn.spawned = true;
    }

    generateLootForTier(tier) {
        const lootTables = {
            common: ['pistol', 'ammo_pistol', 'bandage'],
            uncommon: ['smg', 'ammo_rifle', 'medkit', 'armor_light'],
            rare: ['assault_rifle', 'ammo_sniper', 'scope_2x', 'armor_medium'],
            epic: ['sniper_rifle', 'grenade', 'scope_4x', 'armor_heavy'],
            legendary: ['lmg', 'rocket_launcher', 'scope_8x', 'armor_legendary']
        };
        
        const items = lootTables[tier] || lootTables.common;
        const lootCount = Math.floor(Math.random() * 3) + 1;
        const selectedItems = [];
        
        for (let i = 0; i < lootCount; i++) {
            const randomItem = items[Math.floor(Math.random() * items.length)];
            selectedItems.push({
                type: randomItem,
                tier: tier,
                quantity: this.getItemQuantity(randomItem)
            });
        }
        
        return selectedItems;
    }

    getItemQuantity(itemType) {
        const quantities = {
            'ammo_pistol': 30,
            'ammo_rifle': 60,
            'ammo_sniper': 20,
            'bandage': 5,
            'medkit': 1,
            'grenade': 2
        };
        
        return quantities[itemType] || 1;
    }

    setupEventListeners() {
        // Player events
        this.app.on('player:spawned', (player) => {
            this.onPlayerSpawned(player);
        });
        
        this.app.on('player:died', (data) => {
            this.onPlayerDied(data.player, data.killer);
        });
        
        this.app.on('player:eliminated', (player) => {
            this.onPlayerEliminated(player);
        });
        
        // Game events
        this.app.on('game:start', () => {
            this.startGame();
        });
        
        // Zone events
        this.app.on('zone:playerDamaged', (data) => {
            this.onZoneDamage(data.player, data.damage);
        });
        
        // Supply drop events
        this.app.on('supplydrop:request', () => {
            this.spawnSupplyDrop();
        });
    }

    setupGameUI() {
        this.updatePlayerCount();
        this.updateZoneTimer();
    }

    startGameLoop() {
        this.gameLoop();
    }

    gameLoop() {
        if (!this.gameStarted || this.gameEnded) {
            setTimeout(() => this.gameLoop(), 100);
            return;
        }
        
        const currentTime = Date.now();
        
        // Update zone
        this.updateZone(currentTime);
        
        // Check zone damage
        this.checkZoneDamage();
        
        // Update supply drops
        this.updateSupplyDrops(currentTime);
        
        // Check win conditions
        this.checkWinConditions();
        
        // Update UI
        this.updateGameUI();
        
        // Continue loop
        setTimeout(() => this.gameLoop(), 100);
    }

    updateZone(currentTime) {
        const phase = this.zonePhases[this.playZone.currentPhase];
        if (!phase) return;
        
        const gameTime = currentTime - this.gameStartTime;
        const phaseStartTime = this.getPhaseStartTime();
        const phaseTime = gameTime - phaseStartTime;
        
        if (phaseTime < phase.waitTime) {
            // Waiting phase - zone is stable
            this.playZone.nextShrinkTime = this.gameStartTime + phaseStartTime + phase.waitTime;
        } else if (phaseTime < phase.waitTime + phase.shrinkTime) {
            // Shrinking phase
            const shrinkProgress = (phaseTime - phase.waitTime) / phase.shrinkTime;
            const startRadius = this.playZone.currentPhase === 0 ? 1000 : 
                this.zonePhases[this.playZone.currentPhase - 1].endRadius;
            
            this.playZone.radius = pc.math.lerp(startRadius, phase.endRadius, shrinkProgress);
            this.playZone.damagePerSecond = phase.damage;
            
            this.updateZoneVisuals();
            this.playZoneWarningSound();
        } else {
            // Phase complete - move to next phase
            this.playZone.currentPhase++;
            this.playZone.radius = phase.endRadius;
            
            if (this.playZone.currentPhase >= this.playZone.maxPhases) {
                // Final zone reached
                this.handleFinalZone();
            }
        }
    }

    getPhaseStartTime() {
        let totalTime = 0;
        for (let i = 0; i < this.playZone.currentPhase; i++) {
            const phase = this.zonePhases[i];
            totalTime += phase.waitTime + phase.shrinkTime;
        }
        return totalTime;
    }

    updateZoneVisuals() {
        if (this.zoneWall) {
            this.zoneWall.setLocalScale(
                this.playZone.radius * 2,
                200,
                this.playZone.radius * 2
            );
        }
        
        if (this.zoneDamageArea) {
            this.zoneDamageArea.collision.radius = this.playZone.radius;
        }
    }

    checkZoneDamage() {
        this.alivePlayers.forEach(playerId => {
            const player = this.gameManager.getPlayerById(playerId);
            if (!player) return;
            
            const playerPos = player.getPosition();
            const distanceFromCenter = playerPos.distance(this.playZone.center);
            
            if (distanceFromCenter > this.playZone.radius) {
                // Player is outside safe zone
                this.damagePlayerInZone(player);
            }
        });
    }

    damagePlayerInZone(player) {
        const damage = this.playZone.damagePerSecond / 10; // Per 100ms
        
        if (player.script.healthSystem) {
            player.script.healthSystem.takeDamage(damage, 'zone');
            
            // Visual effect for zone damage
            this.app.fire('player:zoneDamage', {
                player: player,
                damage: damage
            });
        }
    }

    playerEnteredDamageZone(player) {
        if (player.script && player.script.playerController) {
            this.playersInZone.delete(player.networkId);
            
            // Show zone warning to player
            this.app.fire('zone:playerExited', { player: player });
        }
    }

    playerLeftDamageZone(player) {
        if (player.script && player.script.playerController) {
            this.playersInZone.add(player.networkId);
            
            // Hide zone warning
            this.app.fire('zone:playerEntered', { player: player });
        }
    }

    spawnSupplyDrop() {
        // Choose random location within safe zone
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * this.playZone.radius * 0.8;
        
        const dropPosition = new pc.Vec3(
            this.playZone.center.x + Math.cos(angle) * distance,
            100, // High altitude
            this.playZone.center.z + Math.sin(angle) * distance
        );
        
        const supplyDrop = {
            id: Date.now().toString(),
            position: dropPosition.clone(),
            targetPosition: new pc.Vec3(dropPosition.x, 0, dropPosition.z),
            fallSpeed: 20,
            landed: false,
            lootSpawned: false
        };
        
        this.supplyDrops.push(supplyDrop);
        this.createSupplyDropEntity(supplyDrop);
        
        // Announce supply drop
        this.announceSupplyDrop(supplyDrop);
    }

    createSupplyDropEntity(supplyDrop) {
        const entity = new pc.Entity(`supply-drop-${supplyDrop.id}`);
        entity.addComponent('model', {
            type: 'box'
        });
        
        entity.setPosition(supplyDrop.position);
        entity.setLocalScale(2, 2, 2);
        
        // Add smoke trail effect
        this.addSupplyDropEffects(entity);
        
        this.app.root.addChild(entity);
        this.supplyDropEntities.push(entity);
        
        supplyDrop.entity = entity;
    }

    addSupplyDropEffects(entity) {
        // Add particle effects for smoke trail
        // This would typically involve particle system components
        this.app.fire('effects:supplyDropTrail', {
            entity: entity
        });
    }

    updateSupplyDrops(currentTime) {
        this.supplyDrops.forEach(drop => {
            if (!drop.landed) {
                // Update falling position
                drop.position.y -= drop.fallSpeed * 0.1;
                drop.entity.setPosition(drop.position);
                
                // Check if landed
                if (drop.position.y <= drop.targetPosition.y) {
                    this.landSupplyDrop(drop);
                }
            }
        });
    }

    landSupplyDrop(drop) {
        drop.landed = true;
        drop.position.copy(drop.targetPosition);
        drop.entity.setPosition(drop.position);
        
        // Spawn high-tier loot
        this.spawnSupplyDropLoot(drop);
        
        // Play landing effects
        this.app.fire('effects:supplyDropLanding', {
            position: drop.position
        });
        
        // Announce on map
        this.app.fire('map:supplyDropLanded', {
            position: drop.position
        });
    }

    spawnSupplyDropLoot(drop) {
        const lootItems = [
            { type: 'armor_legendary', tier: 'legendary', quantity: 1 },
            { type: 'sniper_rifle', tier: 'legendary', quantity: 1 },
            { type: 'scope_8x', tier: 'epic', quantity: 1 },
            { type: 'medkit', tier: 'rare', quantity: 3 },
            { type: 'ammo_sniper', tier: 'uncommon', quantity: 40 }
        ];
        
        lootItems.forEach(item => {
            this.app.fire('loot:spawn', {
                position: drop.position.clone(),
                item: item
            });
        });
        
        drop.lootSpawned = true;
    }

    checkWinConditions() {
        if (this.playersAlive <= 1 || this.teamsAlive <= 1) {
            this.endGame();
        }
    }

    onPlayerSpawned(player) {
        this.alivePlayers.add(player.networkId);
        if (player.team) {
            this.aliveTeams.add(player.team);
        }
        
        this.updatePlayerCount();
    }

    onPlayerDied(player, killer) {
        // Player can still be revived in team modes
        if (this.teamSize > 1) {
            this.app.fire('player:downed', { player: player, killer: killer });
        } else {
            this.onPlayerEliminated(player);
        }
    }

    onPlayerEliminated(player) {
        this.alivePlayers.delete(player.networkId);
        
        // Check if team is eliminated
        if (player.team && this.teamSize > 1) {
            const teamMembersAlive = Array.from(this.alivePlayers).some(playerId => {
                const teammate = this.gameManager.getPlayerById(playerId);
                return teammate && teammate.team === player.team;
            });
            
            if (!teamMembersAlive) {
                this.aliveTeams.delete(player.team);
            }
        }
        
        this.updatePlayerCount();
        this.announceElimination(player);
    }

    announceElimination(player) {
        this.app.fire('battleroyale:playerEliminated', {
            player: player,
            playersRemaining: this.alivePlayers.size
        });
    }

    announceSupplyDrop(drop) {
        this.app.fire('battleroyale:supplyDropIncoming', {
            position: drop.targetPosition
        });
        
        if (this.audioManager) {
            this.audioManager.playSound('supply_drop_incoming.wav', {
                volume: 0.8,
                category: 'announcer'
            });
        }
    }

    playZoneWarningSound() {
        if (this.audioManager && !this.zoneWarningSoundPlaying) {
            this.zoneWarningSoundPlaying = true;
            this.audioManager.playSound('zone_warning.wav', {
                volume: 0.6,
                category: 'game'
            });
            
            setTimeout(() => {
                this.zoneWarningSoundPlaying = false;
            }, 5000);
        }
    }

    handleFinalZone() {
        // Extreme damage in final zone
        this.playZone.damagePerSecond = 50;
        
        this.app.fire('battleroyale:finalZone');
        
        if (this.audioManager) {
            this.audioManager.playSound('final_zone.wav', {
                volume: 1.0,
                category: 'announcer'
            });
        }
    }

    updatePlayerCount() {
        this.playersAlive = this.alivePlayers.size;
        this.teamsAlive = this.aliveTeams.size;
        
        if (this.hudManager) {
            this.hudManager.updateBattleRoyaleUI({
                playersAlive: this.playersAlive,
                teamsAlive: this.teamsAlive
            });
        }
    }

    updateZoneTimer() {
        const phase = this.zonePhases[this.playZone.currentPhase];
        if (!phase) return;
        
        const currentTime = Date.now();
        const gameTime = currentTime - this.gameStartTime;
        const phaseStartTime = this.getPhaseStartTime();
        const phaseTime = gameTime - phaseStartTime;
        
        let timeRemaining = 0;
        let zoneStatus = '';
        
        if (phaseTime < phase.waitTime) {
            timeRemaining = phase.waitTime - phaseTime;
            zoneStatus = 'waiting';
        } else {
            timeRemaining = phase.shrinkTime - (phaseTime - phase.waitTime);
            zoneStatus = 'shrinking';
        }
        
        if (this.hudManager) {
            this.hudManager.updateZoneTimer({
                timeRemaining: Math.max(0, timeRemaining),
                status: zoneStatus,
                phase: this.playZone.currentPhase + 1,
                damage: phase.damage
            });
        }
    }

    updateGameUI() {
        this.updateZoneTimer();
    }

    startGame() {
        this.gameStarted = true;
        this.gameEnded = false;
        this.gameStartTime = Date.now();
        this.zoneStartTime = Date.now();
        
        // Initialize player tracking
        const allPlayers = this.gameManager.getAllPlayers();
        allPlayers.forEach(player => {
            this.alivePlayers.add(player.networkId);
            if (player.team) {
                this.aliveTeams.add(player.team);
            }
        });
        
        this.updatePlayerCount();
        
        this.app.fire('battleroyale:gameStarted');
        console.log('Battle Royale game started');
    }

    endGame() {
        if (this.gameEnded) return;
        
        this.gameEnded = true;
        this.gameStarted = false;
        
        // Determine winner
        let winner = null;
        if (this.alivePlayers.size === 1) {
            winner = this.gameManager.getPlayerById(Array.from(this.alivePlayers)[0]);
        } else if (this.aliveTeams.size === 1) {
            winner = Array.from(this.aliveTeams)[0];
        }
        
        this.app.fire('battleroyale:gameEnded', {
            winner: winner,
            survivors: this.alivePlayers.size
        });
        
        console.log(`Battle Royale ended. Winner: ${winner ? winner.name || winner : 'None'}`);
    }

    // Public API
    getGameState() {
        return {
            gameMode: this.gameMode,
            started: this.gameStarted,
            ended: this.gameEnded,
            playersAlive: this.playersAlive,
            teamsAlive: this.teamsAlive,
            zone: {
                center: this.playZone.center,
                radius: this.playZone.radius,
                damage: this.playZone.damagePerSecond,
                phase: this.playZone.currentPhase
            }
        };
    }

    getPlayersInZone() {
        return Array.from(this.playersInZone);
    }

    getSupplyDrops() {
        return this.supplyDrops.filter(drop => drop.landed);
    }

    isPlayerInSafeZone(player) {
        const position = player.getPosition();
        const distance = position.distance(this.playZone.center);
        return distance <= this.playZone.radius;
    }

    // Settings
    setMaxPlayers(count) {
        this.maxPlayers = count;
    }

    setTeamSize(size) {
        this.teamSize = size;
    }

    destroy() {
        // Clean up zone entities
        if (this.zoneWall) {
            this.zoneWall.destroy();
        }
        
        if (this.zoneDamageArea) {
            this.zoneDamageArea.destroy();
        }
        
        // Clean up supply drops
        this.supplyDropEntities.forEach(entity => {
            entity.destroy();
        });
    }
}

pc.registerScript(BattleRoyale, 'BattleRoyale');
