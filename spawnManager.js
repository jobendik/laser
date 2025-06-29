var SpawnManager = pc.createScript('spawnManager');

SpawnManager.attributes.add('playerSpawnPoints', { type: 'entity', array: true });
SpawnManager.attributes.add('weaponSpawnPoints', { type: 'entity', array: true });
SpawnManager.attributes.add('itemSpawnPoints', { type: 'entity', array: true });
SpawnManager.attributes.add('spawnProtectionTime', { type: 'number', default: 3 });
SpawnManager.attributes.add('spawnCheckRadius', { type: 'number', default: 5 });
SpawnManager.attributes.add('maxSpawnAttempts', { type: 'number', default: 10 });
SpawnManager.attributes.add('weaponSpawnInterval', { type: 'number', default: 30 });
SpawnManager.attributes.add('itemSpawnInterval', { type: 'number', default: 20 });

SpawnManager.prototype.initialize = function() {
    // Spawn tracking
    this.playerSpawns = new Map();
    this.weaponSpawns = new Map();
    this.itemSpawns = new Map();
    
    // Team spawn management
    this.teamSpawnPoints = {
        blue: [],
        red: [],
        neutral: []
    };
    
    // Spawn timers
    this.weaponSpawnTimer = 0;
    this.itemSpawnTimer = 0;
    this.lastWeaponSpawn = 0;
    this.lastItemSpawn = 0;
    
    // Spawn queues for respawning players
    this.respawnQueue = [];
    this.spawnProtectionList = new Map();
    
    // Weapon spawn configuration
    this.weaponSpawnConfig = [
        { name: 'AK47', weight: 20, rarity: 'common' },
        { name: 'M4A1', weight: 20, rarity: 'common' },
        { name: 'AWP', weight: 5, rarity: 'rare' },
        { name: 'Shotgun', weight: 15, rarity: 'uncommon' },
        { name: 'SMG', weight: 25, rarity: 'common' },
        { name: 'LMG', weight: 10, rarity: 'uncommon' },
        { name: 'Sniper_Rifle', weight: 3, rarity: 'epic' },
        { name: 'Golden_AK', weight: 2, rarity: 'legendary' }
    ];
    
    // Item spawn configuration
    this.itemSpawnConfig = [
        { name: 'Health_Pack', weight: 30, type: 'health' },
        { name: 'Armor_Vest', weight: 20, type: 'armor' },
        { name: 'Ammo_Box', weight: 25, type: 'ammo' },
        { name: 'Shield_Booster', weight: 15, type: 'shield' },
        { name: 'Grenade', weight: 10, type: 'explosive' }
    ];
    
    // Initialize spawn points
    this.initializeSpawnPoints();
    
    // Bind events
    this.app.on('player:requestSpawn', this.spawnPlayer, this);
    this.app.on('player:died', this.onPlayerDied, this);
    this.app.on('player:respawn', this.respawnPlayer, this);
    this.app.on('spawn:forceWeaponSpawn', this.forceWeaponSpawn, this);
    this.app.on('spawn:forceItemSpawn', this.forceItemSpawn, this);
    this.app.on('match:start', this.onMatchStart, this);
    this.app.on('match:end', this.onMatchEnd, this);
    
    console.log('SpawnManager initialized with', this.playerSpawnPoints.length, 'player spawns');
};

SpawnManager.prototype.initializeSpawnPoints = function() {
    // Categorize player spawn points by team
    this.playerSpawnPoints.forEach(spawnPoint => {
        if (!spawnPoint) return;
        
        let team = 'neutral';
        if (spawnPoint.tags.has('blue_spawn')) team = 'blue';
        else if (spawnPoint.tags.has('red_spawn')) team = 'red';
        
        this.teamSpawnPoints[team].push({
            entity: spawnPoint,
            isOccupied: false,
            lastUsed: 0,
            safetyRating: 1.0
        });
        
        this.playerSpawns.set(spawnPoint, {
            team: team,
            isOccupied: false,
            lastUsed: 0,
            safetyRating: 1.0
        });
    });
    
    // Initialize weapon spawn points
    this.weaponSpawnPoints.forEach(spawnPoint => {
        if (!spawnPoint) return;
        
        this.weaponSpawns.set(spawnPoint, {
            isOccupied: false,
            lastSpawn: 0,
            currentWeapon: null,
            spawnWeight: this.calculateSpawnWeight(spawnPoint)
        });
    });
    
    // Initialize item spawn points
    this.itemSpawnPoints.forEach(spawnPoint => {
        if (!spawnPoint) return;
        
        this.itemSpawns.set(spawnPoint, {
            isOccupied: false,
            lastSpawn: 0,
            currentItem: null,
            spawnWeight: this.calculateSpawnWeight(spawnPoint)
        });
    });
    
    console.log('Spawn points initialized:', 
                'Player:', this.playerSpawnPoints.length,
                'Weapon:', this.weaponSpawnPoints.length,
                'Item:', this.itemSpawnPoints.length);
};

SpawnManager.prototype.calculateSpawnWeight = function(spawnPoint) {
    // Calculate spawn weight based on position and strategic value
    let weight = 1.0;
    
    // Higher weight for more central positions
    const center = new pc.Vec3(0, 0, 0); // Assuming map center is 0,0,0
    const distance = spawnPoint.getPosition().distance(center);
    weight = Math.max(0.1, 1.0 - (distance / 100)); // Normalize to map size
    
    // Adjust based on tags
    if (spawnPoint.tags.has('high_value')) weight *= 1.5;
    if (spawnPoint.tags.has('low_value')) weight *= 0.5;
    if (spawnPoint.tags.has('rare_spawn')) weight *= 0.3;
    
    return weight;
};

SpawnManager.prototype.update = function(dt) {
    this.updateSpawnTimers(dt);
    this.updateSpawnProtection(dt);
    this.updateSpawnSafety(dt);
    this.processRespawnQueue(dt);
    this.manageWeaponSpawns(dt);
    this.manageItemSpawns(dt);
};

SpawnManager.prototype.updateSpawnTimers = function(dt) {
    this.weaponSpawnTimer += dt;
    this.itemSpawnTimer += dt;
};

SpawnManager.prototype.updateSpawnProtection = function(dt) {
    const currentTime = Date.now();
    
    this.spawnProtectionList.forEach((protectionData, player) => {
        if (currentTime - protectionData.startTime >= this.spawnProtectionTime * 1000) {
            this.removeSpawnProtection(player);
        }
    });
};

SpawnManager.prototype.updateSpawnSafety = function(dt) {
    // Update safety ratings for spawn points based on recent activity
    this.playerSpawns.forEach((spawnData, spawnPoint) => {
        const position = spawnPoint.getPosition();
        let safetyRating = 1.0;
        
        // Check for nearby enemies
        const enemies = this.findNearbyEnemies(position, spawnData.team);
        if (enemies.length > 0) {
            safetyRating *= Math.max(0.1, 1.0 - (enemies.length * 0.3));
        }
        
        // Check for recent combat activity
        const recentCombat = this.checkRecentCombat(position);
        if (recentCombat) {
            safetyRating *= 0.5;
        }
        
        spawnData.safetyRating = safetyRating;
    });
};

SpawnManager.prototype.processRespawnQueue = function(dt) {
    const currentTime = Date.now();
    
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
        const respawnData = this.respawnQueue[i];
        
        if (currentTime >= respawnData.respawnTime) {
            this.spawnPlayer(respawnData);
            this.respawnQueue.splice(i, 1);
        }
    }
};

SpawnManager.prototype.manageWeaponSpawns = function(dt) {
    if (this.weaponSpawnTimer >= this.weaponSpawnInterval) {
        this.weaponSpawnTimer = 0;
        this.spawnWeapons();
    }
};

SpawnManager.prototype.manageItemSpawns = function(dt) {
    if (this.itemSpawnTimer >= this.itemSpawnInterval) {
        this.itemSpawnTimer = 0;
        this.spawnItems();
    }
};

SpawnManager.prototype.spawnPlayer = function(playerData) {
    const player = playerData.player || playerData.entity;
    const team = playerData.team || this.getPlayerTeam(player);
    
    // Find best spawn point
    const spawnPoint = this.findBestSpawnPoint(team);
    if (!spawnPoint) {
        console.error('No suitable spawn point found for team:', team);
        return false;
    }
    
    // Position player at spawn point
    const spawnPos = spawnPoint.getPosition();
    const spawnRot = spawnPoint.getRotation();
    
    player.setPosition(spawnPos);
    player.setRotation(spawnRot);
    
    // Enable player
    player.enabled = true;
    
    // Reset player state
    this.resetPlayerState(player);
    
    // Add spawn protection
    this.addSpawnProtection(player);
    
    // Mark spawn point as used
    const spawnData = this.playerSpawns.get(spawnPoint);
    if (spawnData) {
        spawnData.lastUsed = Date.now();
        spawnData.isOccupied = true;
        
        // Clear occupation after a delay
        setTimeout(() => {
            spawnData.isOccupied = false;
        }, 5000);
    }
    
    // Create spawn effect
    this.createSpawnEffect(spawnPos, team);
    
    // Fire spawn event
    this.app.fire('player:spawned', {
        player: player,
        team: team,
        position: spawnPos,
        spawnPoint: spawnPoint
    });
    
    console.log('Player spawned:', player.name, 'at', spawnPos.toString());
    return true;
};

SpawnManager.prototype.findBestSpawnPoint = function(team) {
    const availableSpawns = this.teamSpawnPoints[team] || this.teamSpawnPoints.neutral;
    
    if (availableSpawns.length === 0) {
        // Fallback to neutral spawns
        return this.findBestSpawnPoint('neutral');
    }
    
    // Filter out occupied spawns
    const freeSpawns = availableSpawns.filter(spawn => !spawn.isOccupied);
    
    if (freeSpawns.length === 0) {
        // All spawns occupied, use least recently used
        const sortedSpawns = availableSpawns.sort((a, b) => a.lastUsed - b.lastUsed);
        return sortedSpawns[0].entity;
    }
    
    // Find safest spawn point
    const safestSpawn = freeSpawns.reduce((best, current) => {
        const currentSafety = current.safetyRating;
        const bestSafety = best.safetyRating;
        
        // Also consider time since last use
        const timeSinceUse = Date.now() - current.lastUsed;
        const timeBonus = Math.min(1.0, timeSinceUse / 30000); // 30 second max bonus
        
        const currentScore = currentSafety + timeBonus;
        const bestScore = bestSafety + Math.min(1.0, (Date.now() - best.lastUsed) / 30000);
        
        return currentScore > bestScore ? current : best;
    });
    
    return safestSpawn.entity;
};

SpawnManager.prototype.findNearbyEnemies = function(position, team) {
    const players = this.app.root.findByTag('player');
    const enemies = [];
    
    players.forEach(player => {
        const playerTeam = this.getPlayerTeam(player);
        if (playerTeam !== team && playerTeam !== 'neutral') {
            const distance = player.getPosition().distance(position);
            if (distance <= this.spawnCheckRadius) {
                enemies.push(player);
            }
        }
    });
    
    return enemies;
};

SpawnManager.prototype.checkRecentCombat = function(position) {
    // Check for recent weapon fire or explosions near position
    // This would integrate with combat tracking systems
    const currentTime = Date.now();
    
    // Simplified check - in real implementation, this would check combat logs
    return false;
};

SpawnManager.prototype.getPlayerTeam = function(player) {
    if (player.tags.has('blue_team')) return 'blue';
    if (player.tags.has('red_team')) return 'red';
    return 'neutral';
};

SpawnManager.prototype.resetPlayerState = function(player) {
    // Reset health
    if (player.script && player.script.healthSystem) {
        player.script.healthSystem.reset();
    }
    
    // Reset physics
    if (player.rigidbody) {
        player.rigidbody.linearVelocity = pc.Vec3.ZERO;
        player.rigidbody.angularVelocity = pc.Vec3.ZERO;
    }
    
    // Reset weapon state
    if (player.script && player.script.weaponManager) {
        // Give default weapon if none equipped
        player.script.weaponManager.ensureDefaultWeapon();
    }
};

SpawnManager.prototype.addSpawnProtection = function(player) {
    this.spawnProtectionList.set(player, {
        startTime: Date.now(),
        originalTeam: this.getPlayerTeam(player)
    });
    
    // Apply spawn protection effects
    this.app.fire('player:spawnProtectionStart', {
        player: player,
        duration: this.spawnProtectionTime
    });
    
    // Make player semi-transparent
    if (player.model && player.model.material) {
        player.model.material.opacity = 0.7;
        player.model.material.blendType = pc.BLEND_NORMAL;
        player.model.material.update();
    }
};

SpawnManager.prototype.removeSpawnProtection = function(player) {
    this.spawnProtectionList.delete(player);
    
    // Remove spawn protection effects
    this.app.fire('player:spawnProtectionEnd', {
        player: player
    });
    
    // Restore player opacity
    if (player.model && player.model.material) {
        player.model.material.opacity = 1.0;
        player.model.material.blendType = pc.BLEND_NONE;
        player.model.material.update();
    }
};

SpawnManager.prototype.hasSpawnProtection = function(player) {
    return this.spawnProtectionList.has(player);
};

SpawnManager.prototype.onPlayerDied = function(data) {
    const player = data.entity;
    const respawnDelay = data.respawnDelay || 5000; // 5 seconds default
    
    // Add to respawn queue
    this.respawnQueue.push({
        player: player,
        team: this.getPlayerTeam(player),
        respawnTime: Date.now() + respawnDelay,
        deathPosition: player.getPosition().clone()
    });
    
    // Disable player
    player.enabled = false;
    
    console.log('Player queued for respawn:', player.name);
};

SpawnManager.prototype.respawnPlayer = function(data) {
    // Immediate respawn (skip queue)
    this.spawnPlayer(data);
};

SpawnManager.prototype.spawnWeapons = function() {
    // Find empty weapon spawn points
    const emptySpawns = [];
    this.weaponSpawns.forEach((spawnData, spawnPoint) => {
        if (!spawnData.isOccupied) {
            emptySpawns.push({ spawnPoint, spawnData });
        }
    });
    
    if (emptySpawns.length === 0) return;
    
    // Select spawn points based on weight
    const selectedSpawns = this.selectWeightedSpawns(emptySpawns, Math.min(3, emptySpawns.length));
    
    selectedSpawns.forEach(spawn => {
        this.spawnWeaponAt(spawn.spawnPoint);
    });
};

SpawnManager.prototype.selectWeightedSpawns = function(spawns, count) {
    const selected = [];
    const totalWeight = spawns.reduce((sum, spawn) => sum + spawn.spawnData.spawnWeight, 0);
    
    for (let i = 0; i < count; i++) {
        let random = Math.random() * totalWeight;
        
        for (let j = 0; j < spawns.length; j++) {
            random -= spawns[j].spawnData.spawnWeight;
            if (random <= 0) {
                selected.push(spawns[j]);
                spawns.splice(j, 1);
                break;
            }
        }
    }
    
    return selected;
};

SpawnManager.prototype.spawnWeaponAt = function(spawnPoint) {
    const weaponType = this.selectRandomWeapon();
    const weaponEntity = this.createWeaponPickup(weaponType, spawnPoint.getPosition());
    
    // Mark spawn as occupied
    const spawnData = this.weaponSpawns.get(spawnPoint);
    spawnData.isOccupied = true;
    spawnData.currentWeapon = weaponEntity;
    spawnData.lastSpawn = Date.now();
    
    // Create spawn effect
    this.createItemSpawnEffect(spawnPoint.getPosition(), 'weapon');
    
    console.log('Weapon spawned:', weaponType.name, 'at', spawnPoint.getPosition().toString());
};

SpawnManager.prototype.selectRandomWeapon = function() {
    const totalWeight = this.weaponSpawnConfig.reduce((sum, weapon) => sum + weapon.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const weapon of this.weaponSpawnConfig) {
        random -= weapon.weight;
        if (random <= 0) {
            return weapon;
        }
    }
    
    return this.weaponSpawnConfig[0]; // Fallback
};

SpawnManager.prototype.createWeaponPickup = function(weaponType, position) {
    const weaponEntity = new pc.Entity('WeaponPickup_' + weaponType.name);
    
    // Add weapon pickup script
    weaponEntity.addComponent('script');
    weaponEntity.script.create('weaponPickup', {
        weaponData: this.getWeaponData(weaponType),
        respawnTime: this.weaponSpawnInterval
    });
    
    weaponEntity.setPosition(position);
    
    // Add to weapons container
    const weaponsContainer = this.app.root.findByName('Weapons_Container');
    if (weaponsContainer) {
        weaponsContainer.addChild(weaponEntity);
    } else {
        this.app.root.addChild(weaponEntity);
    }
    
    return weaponEntity;
};

SpawnManager.prototype.getWeaponData = function(weaponType) {
    // Return weapon configuration data
    // This would typically load from a weapon database
    return {
        name: weaponType.name,
        type: this.getWeaponTypeFromName(weaponType.name),
        rarity: weaponType.rarity,
        damage: this.getWeaponDamage(weaponType.name),
        fireRate: this.getWeaponFireRate(weaponType.name),
        accuracy: this.getWeaponAccuracy(weaponType.name),
        range: this.getWeaponRange(weaponType.name),
        magazineSize: this.getWeaponMagazineSize(weaponType.name),
        maxAmmo: this.getWeaponMaxAmmo(weaponType.name),
        reloadTime: this.getWeaponReloadTime(weaponType.name)
    };
};

SpawnManager.prototype.getWeaponTypeFromName = function(name) {
    if (name.includes('Sniper') || name.includes('AWP')) return 'sniper';
    if (name.includes('Shotgun')) return 'shotgun';
    if (name.includes('SMG')) return 'smg';
    if (name.includes('LMG')) return 'lmg';
    if (name.includes('Pistol')) return 'pistol';
    return 'rifle'; // Default
};

SpawnManager.prototype.getWeaponDamage = function(name) {
    const damages = {
        'AK47': 35, 'M4A1': 30, 'AWP': 120, 'Shotgun': 80,
        'SMG': 22, 'LMG': 40, 'Sniper_Rifle': 150, 'Golden_AK': 50
    };
    return damages[name] || 30;
};

SpawnManager.prototype.getWeaponFireRate = function(name) {
    const rates = {
        'AK47': 600, 'M4A1': 650, 'AWP': 40, 'Shotgun': 120,
        'SMG': 800, 'LMG': 500, 'Sniper_Rifle': 30, 'Golden_AK': 700
    };
    return rates[name] || 600;
};

SpawnManager.prototype.getWeaponAccuracy = function(name) {
    const accuracies = {
        'AK47': 0.8, 'M4A1': 0.85, 'AWP': 0.99, 'Shotgun': 0.6,
        'SMG': 0.7, 'LMG': 0.75, 'Sniper_Rifle': 0.99, 'Golden_AK': 0.9
    };
    return accuracies[name] || 0.8;
};

SpawnManager.prototype.getWeaponRange = function(name) {
    const ranges = {
        'AK47': 80, 'M4A1': 85, 'AWP': 150, 'Shotgun': 20,
        'SMG': 60, 'LMG': 100, 'Sniper_Rifle': 200, 'Golden_AK': 90
    };
    return ranges[name] || 80;
};

SpawnManager.prototype.getWeaponMagazineSize = function(name) {
    const magazines = {
        'AK47': 30, 'M4A1': 30, 'AWP': 10, 'Shotgun': 8,
        'SMG': 25, 'LMG': 100, 'Sniper_Rifle': 5, 'Golden_AK': 35
    };
    return magazines[name] || 30;
};

SpawnManager.prototype.getWeaponMaxAmmo = function(name) {
    const maxAmmos = {
        'AK47': 180, 'M4A1': 180, 'AWP': 50, 'Shotgun': 48,
        'SMG': 150, 'LMG': 300, 'Sniper_Rifle': 25, 'Golden_AK': 210
    };
    return maxAmmos[name] || 180;
};

SpawnManager.prototype.getWeaponReloadTime = function(name) {
    const reloadTimes = {
        'AK47': 2.5, 'M4A1': 2.3, 'AWP': 3.7, 'Shotgun': 4.2,
        'SMG': 2.0, 'LMG': 5.5, 'Sniper_Rifle': 4.0, 'Golden_AK': 2.2
    };
    return reloadTimes[name] || 2.5;
};

SpawnManager.prototype.spawnItems = function() {
    // Similar to weapon spawning but for items
    const emptySpawns = [];
    this.itemSpawns.forEach((spawnData, spawnPoint) => {
        if (!spawnData.isOccupied) {
            emptySpawns.push({ spawnPoint, spawnData });
        }
    });
    
    if (emptySpawns.length === 0) return;
    
    const selectedSpawns = this.selectWeightedSpawns(emptySpawns, Math.min(2, emptySpawns.length));
    
    selectedSpawns.forEach(spawn => {
        this.spawnItemAt(spawn.spawnPoint);
    });
};

SpawnManager.prototype.spawnItemAt = function(spawnPoint) {
    const itemType = this.selectRandomItem();
    const itemEntity = this.createItemPickup(itemType, spawnPoint.getPosition());
    
    // Mark spawn as occupied
    const spawnData = this.itemSpawns.get(spawnPoint);
    spawnData.isOccupied = true;
    spawnData.currentItem = itemEntity;
    spawnData.lastSpawn = Date.now();
    
    // Create spawn effect
    this.createItemSpawnEffect(spawnPoint.getPosition(), 'item');
    
    console.log('Item spawned:', itemType.name, 'at', spawnPoint.getPosition().toString());
};

SpawnManager.prototype.selectRandomItem = function() {
    const totalWeight = this.itemSpawnConfig.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const item of this.itemSpawnConfig) {
        random -= item.weight;
        if (random <= 0) {
            return item;
        }
    }
    
    return this.itemSpawnConfig[0]; // Fallback
};

SpawnManager.prototype.createItemPickup = function(itemType, position) {
    const itemEntity = new pc.Entity('ItemPickup_' + itemType.name);
    
    // Add item pickup script
    itemEntity.addComponent('script');
    itemEntity.script.create('itemPickup', {
        itemData: itemType,
        respawnTime: this.itemSpawnInterval
    });
    
    itemEntity.setPosition(position);
    
    // Add to items container
    const itemsContainer = this.app.root.findByName('Items_Container');
    if (itemsContainer) {
        itemsContainer.addChild(itemEntity);
    } else {
        this.app.root.addChild(itemEntity);
    }
    
    return itemEntity;
};

SpawnManager.prototype.createSpawnEffect = function(position, team) {
    // Create player spawn effect
    this.app.fire('effect:playerSpawn', {
        position: position,
        team: team
    });
};

SpawnManager.prototype.createItemSpawnEffect = function(position, type) {
    // Create item/weapon spawn effect
    this.app.fire('effect:itemSpawn', {
        position: position,
        type: type
    });
};

SpawnManager.prototype.forceWeaponSpawn = function(data) {
    if (data.spawnPoint) {
        this.spawnWeaponAt(data.spawnPoint);
    } else {
        this.spawnWeapons();
    }
};

SpawnManager.prototype.forceItemSpawn = function(data) {
    if (data.spawnPoint) {
        this.spawnItemAt(data.spawnPoint);
    } else {
        this.spawnItems();
    }
};

SpawnManager.prototype.onMatchStart = function() {
    // Reset all spawn timers
    this.weaponSpawnTimer = 0;
    this.itemSpawnTimer = 0;
    
    // Clear respawn queue
    this.respawnQueue = [];
    
    // Clear spawn protection
    this.spawnProtectionList.clear();
    
    // Initial weapon and item spawns
    this.spawnWeapons();
    this.spawnItems();
};

SpawnManager.prototype.onMatchEnd = function() {
    // Clear respawn queue
    this.respawnQueue = [];
    
    // Remove all spawn protection
    this.spawnProtectionList.clear();
};

SpawnManager.prototype.getSpawnStats = function() {
    return {
        playerSpawns: this.playerSpawnPoints.length,
        weaponSpawns: this.weaponSpawnPoints.length,
        itemSpawns: this.itemSpawnPoints.length,
        respawnQueue: this.respawnQueue.length,
        spawnProtection: this.spawnProtectionList.size,
        weaponSpawnTimer: this.weaponSpawnTimer,
        itemSpawnTimer: this.itemSpawnTimer
    };
};