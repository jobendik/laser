/**
 * GunGame.js
 * 
 * Gun Game mode implementation where players progress through weapons
 * by getting kills. Each kill advances to the next weapon tier,
 * with the first to complete all weapons winning the match.
 */

var GunGame = pc.createScript('gunGame');

// Gun Game configuration
GunGame.attributes.add('weaponProgression', {
    type: 'json',
    schema: [{
        name: 'weapon',
        type: 'string'
    }],
    default: [
        { weapon: 'pistol' },
        { weapon: 'shotgun' },
        { weapon: 'assault_rifle' },
        { weapon: 'burst_rifle' },
        { weapon: 'smg' },
        { weapon: 'lmg' },
        { weapon: 'sniper_rifle' },
        { weapon: 'rocket_launcher' },
        { weapon: 'knife' }
    ],
    description: 'Weapon progression order'
});

GunGame.attributes.add('killsPerWeapon', {
    type: 'number',
    default: 1,
    description: 'Kills required to advance weapon'
});

GunGame.attributes.add('meleeSetback', {
    type: 'boolean',
    default: true,
    description: 'Melee kills set back opponent'
});

// Initialize Gun Game mode
GunGame.prototype.initialize = function() {
    // Game state
    this.gameState = {
        isActive: false,
        timeLimit: 600, // 10 minutes
        startTime: 0,
        endTime: 0,
        winner: null
    };
    
    // Player progression tracking
    this.playerProgress = new Map();
    
    // Weapon configuration
    this.weapons = this.weaponProgression.map((item, index) => ({
        id: item.weapon,
        tier: index + 1,
        displayName: this.getWeaponDisplayName(item.weapon),
        killsRequired: this.killsPerWeapon
    }));
    
    // Game statistics
    this.gameStats = {
        totalKills: 0,
        totalDeaths: 0,
        weaponKills: new Map(),
        progressionEvents: []
    };
    
    // Event tracking
    this.eventHistory = [];
    
    // UI elements
    this.uiElements = {
        progressionHUD: null,
        leaderboard: null,
        weaponDisplay: null
    };

    this.setupEventListeners();
    this.createUI();
    
    console.log('Gun Game mode initialized');
};

// Setup event listeners
GunGame.prototype.setupEventListeners = function() {
    // Game flow events
    this.app.on('gamemode:start', this.startGame, this);
    this.app.on('gamemode:end', this.endGame, this);
    this.app.on('gamemode:reset', this.resetGame, this);
    
    // Player events
    this.app.on('player:kill', this.onPlayerKill, this);
    this.app.on('player:death', this.onPlayerDeath, this);
    this.app.on('player:spawn', this.onPlayerSpawn, this);
    this.app.on('player:connect', this.onPlayerConnect, this);
    this.app.on('player:disconnect', this.onPlayerDisconnect, this);
    
    // Weapon events
    this.app.on('weapon:switch', this.onWeaponSwitch, this);
    
    // UI events
    this.app.on('ui:show_progression', this.showProgressionUI, this);
    this.app.on('ui:hide_progression', this.hideProgressionUI, this);
};

// Start Gun Game match
GunGame.prototype.startGame = function() {
    this.gameState.isActive = true;
    this.gameState.startTime = Date.now();
    this.gameState.endTime = this.gameState.startTime + (this.gameState.timeLimit * 1000);
    this.gameState.winner = null;
    
    // Reset all player progress
    this.resetPlayerProgress();
    
    // Initialize all players with first weapon
    this.initializePlayerWeapons();
    
    // Start game timer
    this.startGameTimer();
    
    // Update UI
    this.updateProgressionUI();
    
    console.log('Gun Game started');
    this.app.fire('gungame:started', {
        timeLimit: this.gameState.timeLimit,
        weaponCount: this.weapons.length
    });
};

// End Gun Game match
GunGame.prototype.endGame = function(reason) {
    if (!this.gameState.isActive) return;
    
    this.gameState.isActive = false;
    
    // Determine winner if not already set
    if (!this.gameState.winner && reason !== 'manual') {
        this.gameState.winner = this.determineWinner();
    }
    
    // Calculate final statistics
    var finalStats = this.calculateFinalStats();
    
    console.log('Gun Game ended:', reason);
    this.app.fire('gungame:ended', {
        winner: this.gameState.winner,
        reason: reason,
        duration: Date.now() - this.gameState.startTime,
        stats: finalStats
    });
    
    // Show end game UI
    this.showEndGameUI(finalStats);
};

// Reset game state
GunGame.prototype.resetGame = function() {
    this.gameState.isActive = false;
    this.gameState.winner = null;
    this.playerProgress.clear();
    this.gameStats.totalKills = 0;
    this.gameStats.totalDeaths = 0;
    this.gameStats.weaponKills.clear();
    this.gameStats.progressionEvents = [];
    this.eventHistory = [];
    
    this.updateProgressionUI();
    
    console.log('Gun Game reset');
};

// Handle player kill
GunGame.prototype.onPlayerKill = function(data) {
    if (!this.gameState.isActive) return;
    
    var killerId = data.killerId;
    var victimId = data.victimId;
    var weaponUsed = data.weapon;
    var isHeadshot = data.headshot || false;
    var isMelee = data.melee || false;
    
    // Update killer progression
    this.advancePlayerWeapon(killerId, weaponUsed, isHeadshot);
    
    // Handle melee setback
    if (isMelee && this.meleeSetback && victimId !== killerId) {
        this.setbackPlayer(victimId);
    }
    
    // Update statistics
    this.updateKillStatistics(killerId, victimId, weaponUsed);
    
    // Check for game end condition
    this.checkGameEndCondition(killerId);
    
    // Log event
    this.logProgressionEvent('kill', {
        killer: killerId,
        victim: victimId,
        weapon: weaponUsed,
        headshot: isHeadshot,
        melee: isMelee
    });
};

// Advance player weapon progression
GunGame.prototype.advancePlayerWeapon = function(playerId, weaponUsed, isHeadshot) {
    var progress = this.getPlayerProgress(playerId);
    var currentWeapon = this.weapons[progress.weaponTier - 1];
    
    // Verify they used the correct weapon
    if (weaponUsed !== currentWeapon.id) {
        console.warn(`Player ${playerId} got kill with wrong weapon: ${weaponUsed} (expected: ${currentWeapon.id})`);
        return;
    }
    
    // Increment kills for current weapon
    progress.killsWithCurrentWeapon++;
    
    // Check if they can advance
    if (progress.killsWithCurrentWeapon >= currentWeapon.killsRequired) {
        progress.weaponTier++;
        progress.killsWithCurrentWeapon = 0;
        progress.totalWeaponChanges++;
        
        // Check if they've completed all weapons
        if (progress.weaponTier > this.weapons.length) {
            this.playerWins(playerId);
            return;
        }
        
        // Give player new weapon
        this.givePlayerWeapon(playerId, progress.weaponTier);
        
        // Announce progression
        this.announceProgression(playerId, progress.weaponTier);
        
        console.log(`Player ${playerId} advanced to weapon tier ${progress.weaponTier}`);
    }
    
    // Update UI
    this.updatePlayerProgressionUI(playerId);
};

// Set back player weapon (from melee kill)
GunGame.prototype.setbackPlayer = function(playerId) {
    var progress = this.getPlayerProgress(playerId);
    
    // Only setback if not on first weapon and has made progress
    if (progress.weaponTier > 1) {
        progress.weaponTier--;
        progress.killsWithCurrentWeapon = 0;
        progress.totalSetbacks++;
        
        // Give player previous weapon
        this.givePlayerWeapon(playerId, progress.weaponTier);
        
        // Announce setback
        this.announceSetback(playerId, progress.weaponTier);
        
        console.log(`Player ${playerId} set back to weapon tier ${progress.weaponTier}`);
        
        // Update UI
        this.updatePlayerProgressionUI(playerId);
    }
};

// Player wins the game
GunGame.prototype.playerWins = function(playerId) {
    this.gameState.winner = playerId;
    this.endGame('completion');
    
    // Award winner
    this.app.fire('player:award', {
        playerId: playerId,
        award: 'gungame_winner',
        points: 1000
    });
    
    console.log(`Player ${playerId} wins Gun Game!`);
};

// Get or create player progress
GunGame.prototype.getPlayerProgress = function(playerId) {
    if (!this.playerProgress.has(playerId)) {
        this.playerProgress.set(playerId, {
            weaponTier: 1,
            killsWithCurrentWeapon: 0,
            totalKills: 0,
            totalDeaths: 0,
            totalWeaponChanges: 0,
            totalSetbacks: 0,
            joinTime: Date.now()
        });
    }
    return this.playerProgress.get(playerId);
};

// Give player specific weapon
GunGame.prototype.givePlayerWeapon = function(playerId, weaponTier) {
    var weapon = this.weapons[weaponTier - 1];
    if (!weapon) return;
    
    this.app.fire('player:setWeapon', {
        playerId: playerId,
        weaponId: weapon.id,
        weaponTier: weaponTier,
        removeOthers: true
    });
    
    // Give appropriate ammo
    this.app.fire('player:giveAmmo', {
        playerId: playerId,
        weaponId: weapon.id,
        amount: this.getWeaponAmmo(weapon.id)
    });
};

// Get weapon ammo amount
GunGame.prototype.getWeaponAmmo = function(weaponId) {
    var ammoConfig = {
        pistol: 60,
        shotgun: 24,
        assault_rifle: 120,
        burst_rifle: 90,
        smg: 150,
        lmg: 200,
        sniper_rifle: 20,
        rocket_launcher: 6,
        knife: 0
    };
    
    return ammoConfig[weaponId] || 60;
};

// Get weapon display name
GunGame.prototype.getWeaponDisplayName = function(weaponId) {
    var names = {
        pistol: 'Pistol',
        shotgun: 'Shotgun',
        assault_rifle: 'Assault Rifle',
        burst_rifle: 'Burst Rifle',
        smg: 'SMG',
        lmg: 'LMG',
        sniper_rifle: 'Sniper Rifle',
        rocket_launcher: 'Rocket Launcher',
        knife: 'Knife'
    };
    
    return names[weaponId] || weaponId;
};

// Check game end conditions
GunGame.prototype.checkGameEndCondition = function(playerId) {
    if (!this.gameState.isActive) return;
    
    // Check if time limit reached
    if (Date.now() >= this.gameState.endTime) {
        this.endGame('time_limit');
        return;
    }
    
    // Check if someone completed all weapons (handled in playerWins)
    var progress = this.getPlayerProgress(playerId);
    if (progress.weaponTier > this.weapons.length) {
        // This should be handled by playerWins, but double-check
        if (!this.gameState.winner) {
            this.playerWins(playerId);
        }
    }
};

// Determine winner based on progress
GunGame.prototype.determineWinner = function() {
    var bestProgress = { weaponTier: 0, killsWithCurrentWeapon: 0 };
    var winnerId = null;
    
    this.playerProgress.forEach((progress, playerId) => {
        if (progress.weaponTier > bestProgress.weaponTier ||
            (progress.weaponTier === bestProgress.weaponTier && 
             progress.killsWithCurrentWeapon > bestProgress.killsWithCurrentWeapon)) {
            bestProgress = progress;
            winnerId = playerId;
        }
    });
    
    return winnerId;
};

// Reset all player progress
GunGame.prototype.resetPlayerProgress = function() {
    this.playerProgress.clear();
};

// Initialize player weapons
GunGame.prototype.initializePlayerWeapons = function() {
    var players = this.app.root.findByTag('player');
    players.forEach(playerEntity => {
        var playerId = playerEntity.player ? playerEntity.player.id : playerEntity.getGuid();
        this.givePlayerWeapon(playerId, 1);
    });
};

// Start game timer
GunGame.prototype.startGameTimer = function() {
    this.gameTimer = setInterval(() => {
        if (!this.gameState.isActive) {
            clearInterval(this.gameTimer);
            return;
        }
        
        var remainingTime = this.gameState.endTime - Date.now();
        if (remainingTime <= 0) {
            this.endGame('time_limit');
        } else {
            this.app.fire('gungame:timeUpdate', {
                remainingTime: Math.max(0, Math.floor(remainingTime / 1000))
            });
        }
    }, 1000);
};

// Update kill statistics
GunGame.prototype.updateKillStatistics = function(killerId, victimId, weaponUsed) {
    this.gameStats.totalKills++;
    
    var killerProgress = this.getPlayerProgress(killerId);
    var victimProgress = this.getPlayerProgress(victimId);
    
    killerProgress.totalKills++;
    victimProgress.totalDeaths++;
    
    // Track weapon kills
    var weaponKills = this.gameStats.weaponKills.get(weaponUsed) || 0;
    this.gameStats.weaponKills.set(weaponUsed, weaponKills + 1);
};

// Log progression event
GunGame.prototype.logProgressionEvent = function(type, data) {
    var event = {
        type: type,
        timestamp: Date.now(),
        gameTime: Date.now() - this.gameState.startTime,
        data: data
    };
    
    this.gameStats.progressionEvents.push(event);
    this.eventHistory.push(event);
    
    // Broadcast event
    this.app.fire('gungame:event', event);
};

// Announce player progression
GunGame.prototype.announceProgression = function(playerId, newTier) {
    var weapon = this.weapons[newTier - 1];
    
    this.app.fire('announcement:show', {
        type: 'progression',
        title: 'Weapon Progression',
        message: `Player advanced to ${weapon.displayName}!`,
        duration: 3000,
        playerId: playerId
    });
};

// Announce player setback
GunGame.prototype.announceSetback = function(playerId, newTier) {
    var weapon = this.weapons[newTier - 1];
    
    this.app.fire('announcement:show', {
        type: 'setback',
        title: 'Setback',
        message: `Player set back to ${weapon.displayName}!`,
        duration: 2000,
        playerId: playerId
    });
};

// Event handlers
GunGame.prototype.onPlayerDeath = function(data) {
    if (!this.gameState.isActive) return;
    
    this.gameStats.totalDeaths++;
};

GunGame.prototype.onPlayerSpawn = function(data) {
    if (!this.gameState.isActive) return;
    
    var playerId = data.playerId;
    var progress = this.getPlayerProgress(playerId);
    
    // Give player their current weapon
    this.givePlayerWeapon(playerId, progress.weaponTier);
};

GunGame.prototype.onPlayerConnect = function(data) {
    var playerId = data.playerId;
    
    if (this.gameState.isActive) {
        // New player joins mid-game
        this.givePlayerWeapon(playerId, 1);
        this.updatePlayerProgressionUI(playerId);
    }
};

GunGame.prototype.onPlayerDisconnect = function(data) {
    var playerId = data.playerId;
    this.playerProgress.delete(playerId);
};

// UI Management
GunGame.prototype.createUI = function() {
    // Create progression HUD
    this.createProgressionHUD();
    
    // Create leaderboard
    this.createLeaderboard();
    
    // Create weapon display
    this.createWeaponDisplay();
};

GunGame.prototype.createProgressionHUD = function() {
    // Implementation would create UI elements
    console.log('Creating Gun Game progression HUD');
};

GunGame.prototype.updateProgressionUI = function() {
    // Update progression display for all players
    this.playerProgress.forEach((progress, playerId) => {
        this.updatePlayerProgressionUI(playerId);
    });
};

GunGame.prototype.updatePlayerProgressionUI = function(playerId) {
    var progress = this.getPlayerProgress(playerId);
    var weapon = this.weapons[progress.weaponTier - 1];
    
    this.app.fire('ui:updateProgression', {
        playerId: playerId,
        weaponTier: progress.weaponTier,
        weaponName: weapon ? weapon.displayName : 'Complete',
        killsNeeded: weapon ? weapon.killsRequired - progress.killsWithCurrentWeapon : 0,
        totalWeapons: this.weapons.length
    });
};

// Calculate final statistics
GunGame.prototype.calculateFinalStats = function() {
    var stats = {
        duration: Date.now() - this.gameState.startTime,
        totalKills: this.gameStats.totalKills,
        totalDeaths: this.gameStats.totalDeaths,
        playerStats: [],
        weaponStats: Array.from(this.gameStats.weaponKills.entries()),
        winner: this.gameState.winner
    };
    
    // Player statistics
    this.playerProgress.forEach((progress, playerId) => {
        stats.playerStats.push({
            playerId: playerId,
            finalTier: progress.weaponTier,
            totalKills: progress.totalKills,
            totalDeaths: progress.totalDeaths,
            weaponChanges: progress.totalWeaponChanges,
            setbacks: progress.totalSetbacks
        });
    });
    
    return stats;
};

// Show end game UI
GunGame.prototype.showEndGameUI = function(stats) {
    this.app.fire('ui:showEndGame', {
        gameMode: 'Gun Game',
        winner: stats.winner,
        duration: stats.duration,
        playerStats: stats.playerStats
    });
};

// Get current game state
GunGame.prototype.getGameState = function() {
    return {
        isActive: this.gameState.isActive,
        timeRemaining: Math.max(0, this.gameState.endTime - Date.now()),
        playerCount: this.playerProgress.size,
        weapons: this.weapons,
        playerProgress: Array.from(this.playerProgress.entries()),
        stats: this.gameStats
    };
};
