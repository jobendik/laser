/**
 * SearchAndDestroy.js
 * 
 * Search and Destroy game mode implementation.
 * Round-based tactical gameplay with bomb planting/defusing mechanics,
 * no respawns during rounds, and equipment economy system.
 */

var SearchAndDestroy = pc.createScript('searchAndDestroy');

// Search and Destroy configuration
SearchAndDestroy.attributes.add('roundTime', {
    type: 'number',
    default: 120,
    description: 'Round time in seconds'
});

SearchAndDestroy.attributes.add('bombTime', {
    type: 'number',
    default: 40,
    description: 'Bomb timer in seconds'
});

SearchAndDestroy.attributes.add('defuseTime', {
    type: 'number',
    default: 10,
    description: 'Defuse time in seconds'
});

SearchAndDestroy.attributes.add('roundsToWin', {
    type: 'number',
    default: 13,
    description: 'Rounds needed to win match'
});

SearchAndDestroy.attributes.add('buyTime', {
    type: 'number',
    default: 30,
    description: 'Buy phase time in seconds'
});

// Initialize Search and Destroy mode
SearchAndDestroy.prototype.initialize = function() {
    // Game state
    this.gameState = {
        isActive: false,
        currentRound: 0,
        roundPhase: 'waiting', // waiting, buy, live, post_round
        roundStartTime: 0,
        roundEndTime: 0,
        bombPlanted: false,
        bombPlantTime: 0,
        bombSite: null,
        defuseStartTime: 0,
        defusingPlayer: null
    };
    
    // Team scores
    this.teamScores = {
        attackers: 0,
        defenders: 0
    };
    
    // Round history
    this.roundHistory = [];
    
    // Player states
    this.playerStates = new Map();
    
    // Economy system
    this.economy = {
        startingMoney: 800,
        maxMoney: 16000,
        killReward: 300,
        loseReward: {
            1: 1400,
            2: 1900,
            3: 2400,
            4: 2900,
            5: 3400
        },
        winReward: 3250,
        bombPlantReward: 800,
        bombDefuseReward: 300
    };
    
    // Equipment prices
    this.equipmentPrices = {
        // Weapons
        pistol: 500,
        rifle: 2700,
        smg: 1200,
        sniper: 4750,
        shotgun: 1800,
        
        // Equipment
        armor: 1000,
        helmet: 350,
        grenades: 300,
        smoke: 300,
        flash: 200,
        defuse_kit: 400
    };
    
    // Bomb sites
    this.bombSites = [
        {
            id: 'A',
            position: new pc.Vec3(50, 0, 50),
            radius: 5,
            planted: false
        },
        {
            id: 'B',
            position: new pc.Vec3(-50, 0, 50),
            radius: 5,
            planted: false
        }
    ];
    
    // Statistics
    this.matchStats = {
        totalRounds: 0,
        bombPlants: 0,
        bombDefuses: 0,
        bombExplosions: 0,
        roundWinsByType: {
            elimination: 0,
            bomb_explosion: 0,
            bomb_defuse: 0,
            time_expired: 0
        }
    };

    this.setupEventListeners();
    this.createUI();
    this.initializeBombSites();
    
    console.log('Search and Destroy mode initialized');
};

// Setup event listeners
SearchAndDestroy.prototype.setupEventListeners = function() {
    // Game flow events
    this.app.on('gamemode:start', this.startMatch, this);
    this.app.on('gamemode:end', this.endMatch, this);
    this.app.on('gamemode:reset', this.resetMatch, this);
    
    // Round events
    this.app.on('round:start', this.startRound, this);
    this.app.on('round:end', this.endRound, this);
    
    // Player events
    this.app.on('player:kill', this.onPlayerKill, this);
    this.app.on('player:death', this.onPlayerDeath, this);
    this.app.on('player:spawn', this.onPlayerSpawn, this);
    this.app.on('player:connect', this.onPlayerConnect, this);
    this.app.on('player:disconnect', this.onPlayerDisconnect, this);
    
    // Bomb events
    this.app.on('bomb:plant_start', this.onBombPlantStart, this);
    this.app.on('bomb:plant_complete', this.onBombPlantComplete, this);
    this.app.on('bomb:defuse_start', this.onBombDefuseStart, this);
    this.app.on('bomb:defuse_complete', this.onBombDefuseComplete, this);
    this.app.on('bomb:explode', this.onBombExplode, this);
    
    // Economy events
    this.app.on('player:buy', this.onPlayerBuy, this);
    this.app.on('buy:validate', this.validatePurchase, this);
};

// Start match
SearchAndDestroy.prototype.startMatch = function() {
    this.gameState.isActive = true;
    this.gameState.currentRound = 0;
    this.teamScores.attackers = 0;
    this.teamScores.defenders = 0;
    this.roundHistory = [];
    
    // Initialize player economies
    this.initializePlayerEconomies();
    
    // Start first round
    this.startNewRound();
    
    console.log('Search and Destroy match started');
    this.app.fire('searchanddestroy:match_started');
};

// End match
SearchAndDestroy.prototype.endMatch = function(reason) {
    if (!this.gameState.isActive) return;
    
    this.gameState.isActive = false;
    
    // Determine winner
    var winner = this.teamScores.attackers >= this.roundsToWin ? 'attackers' : 'defenders';
    
    // Calculate final statistics
    var finalStats = this.calculateMatchStats();
    
    console.log('Search and Destroy match ended:', reason);
    this.app.fire('searchanddestroy:match_ended', {
        winner: winner,
        scores: this.teamScores,
        reason: reason,
        stats: finalStats
    });
    
    this.showEndMatchUI(winner, finalStats);
};

// Start new round
SearchAndDestroy.prototype.startNewRound = function() {
    this.gameState.currentRound++;
    this.gameState.roundPhase = 'buy';
    this.gameState.roundStartTime = Date.now();
    this.gameState.roundEndTime = this.gameState.roundStartTime + (this.roundTime * 1000);
    
    // Reset bomb state
    this.resetBombState();
    
    // Reset player states
    this.resetPlayerStates();
    
    // Award round start money
    this.awardRoundStartMoney();
    
    // Start buy phase
    this.startBuyPhase();
    
    console.log(`Round ${this.gameState.currentRound} started`);
    this.app.fire('searchanddestroy:round_started', {
        round: this.gameState.currentRound,
        attackers: this.teamScores.attackers,
        defenders: this.teamScores.defenders
    });
};

// Start buy phase
SearchAndDestroy.prototype.startBuyPhase = function() {
    this.gameState.roundPhase = 'buy';
    
    // Enable buy menus for all players
    this.playerStates.forEach((playerState, playerId) => {
        this.app.fire('ui:show_buy_menu', {
            playerId: playerId,
            money: playerState.money,
            timeRemaining: this.buyTime
        });
    });
    
    // Start buy phase timer
    setTimeout(() => {
        this.endBuyPhase();
    }, this.buyTime * 1000);
    
    console.log('Buy phase started');
};

// End buy phase and start live round
SearchAndDestroy.prototype.endBuyPhase = function() {
    if (this.gameState.roundPhase !== 'buy') return;
    
    this.gameState.roundPhase = 'live';
    
    // Close buy menus
    this.app.fire('ui:hide_buy_menu');
    
    // Spawn all players
    this.spawnAllPlayers();
    
    // Start round timer
    this.startRoundTimer();
    
    console.log('Live round started');
    this.app.fire('searchanddestroy:live_round_started');
};

// Start round timer
SearchAndDestroy.prototype.startRoundTimer = function() {
    this.roundTimer = setInterval(() => {
        if (this.gameState.roundPhase !== 'live') {
            clearInterval(this.roundTimer);
            return;
        }
        
        var remainingTime = this.gameState.roundEndTime - Date.now();
        
        if (remainingTime <= 0) {
            this.endRound('time_expired', 'defenders');
        } else {
            this.app.fire('searchanddestroy:time_update', {
                remainingTime: Math.max(0, Math.floor(remainingTime / 1000)),
                bombPlanted: this.gameState.bombPlanted
            });
        }
    }, 1000);
};

// End round
SearchAndDestroy.prototype.endRound = function(reason, winner) {
    if (this.gameState.roundPhase === 'post_round') return;
    
    clearInterval(this.roundTimer);
    clearInterval(this.bombTimer);
    
    this.gameState.roundPhase = 'post_round';
    
    // Update team scores
    if (winner === 'attackers') {
        this.teamScores.attackers++;
    } else if (winner === 'defenders') {
        this.teamScores.defenders++;
    }
    
    // Award money for round result
    this.awardRoundEndMoney(reason, winner);
    
    // Record round in history
    this.recordRound(reason, winner);
    
    // Update statistics
    this.updateRoundStatistics(reason);
    
    console.log(`Round ${this.gameState.currentRound} ended: ${reason} (${winner} win)`);
    this.app.fire('searchanddestroy:round_ended', {
        round: this.gameState.currentRound,
        reason: reason,
        winner: winner,
        scores: this.teamScores
    });
    
    // Check for match end
    if (this.checkMatchEndCondition()) {
        setTimeout(() => {
            this.endMatch('score_reached');
        }, 5000);
    } else {
        // Start next round after delay
        setTimeout(() => {
            this.startNewRound();
        }, 10000);
    }
};

// Check if match should end
SearchAndDestroy.prototype.checkMatchEndCondition = function() {
    return this.teamScores.attackers >= this.roundsToWin || 
           this.teamScores.defenders >= this.roundsToWin;
};

// Initialize player economies
SearchAndDestroy.prototype.initializePlayerEconomies = function() {
    this.playerStates.clear();
    
    var players = this.app.root.findByTag('player');
    players.forEach(playerEntity => {
        var playerId = playerEntity.player ? playerEntity.player.id : playerEntity.getGuid();
        this.playerStates.set(playerId, {
            money: this.economy.startingMoney,
            isAlive: true,
            team: this.getPlayerTeam(playerId),
            equipment: [],
            consecutiveLosses: 0,
            roundKills: 0,
            bombInteractions: 0
        });
    });
};

// Get player team
SearchAndDestroy.prototype.getPlayerTeam = function(playerId) {
    // Implementation would determine player team
    // For now, alternate between teams
    var playerIndex = Array.from(this.playerStates.keys()).indexOf(playerId);
    return playerIndex % 2 === 0 ? 'attackers' : 'defenders';
};

// Award round start money
SearchAndDestroy.prototype.awardRoundStartMoney = function() {
    this.playerStates.forEach((playerState, playerId) => {
        // Base round money (for equipment lost)
        var baseMoney = 0;
        
        // Add to player money
        playerState.money = Math.min(this.economy.maxMoney, playerState.money + baseMoney);
    });
};

// Award money at round end
SearchAndDestroy.prototype.awardRoundEndMoney = function(reason, winner) {
    this.playerStates.forEach((playerState, playerId) => {
        var moneyToAward = 0;
        
        if (playerState.team === winner) {
            // Win reward
            moneyToAward += this.economy.winReward;
            playerState.consecutiveLosses = 0;
        } else {
            // Loss reward based on consecutive losses
            var lossStreak = Math.min(5, playerState.consecutiveLosses + 1);
            moneyToAward += this.economy.loseReward[lossStreak];
            playerState.consecutiveLosses = lossStreak;
        }
        
        // Kill rewards
        moneyToAward += playerState.roundKills * this.economy.killReward;
        
        // Bomb interaction rewards
        if (reason === 'bomb_explosion' && playerState.team === 'attackers') {
            moneyToAward += this.economy.bombPlantReward;
        } else if (reason === 'bomb_defuse' && playerState.team === 'defenders') {
            moneyToAward += this.economy.bombDefuseReward;
        }
        
        // Award money
        playerState.money = Math.min(this.economy.maxMoney, playerState.money + moneyToAward);
        
        // Reset round stats
        playerState.roundKills = 0;
        playerState.bombInteractions = 0;
    });
};

// Reset bomb state
SearchAndDestroy.prototype.resetBombState = function() {
    this.gameState.bombPlanted = false;
    this.gameState.bombPlantTime = 0;
    this.gameState.bombSite = null;
    this.gameState.defuseStartTime = 0;
    this.gameState.defusingPlayer = null;
    
    // Reset bomb sites
    this.bombSites.forEach(site => {
        site.planted = false;
    });
};

// Reset player states for new round
SearchAndDestroy.prototype.resetPlayerStates = function() {
    this.playerStates.forEach((playerState, playerId) => {
        playerState.isAlive = true;
        playerState.roundKills = 0;
        playerState.bombInteractions = 0;
        playerState.equipment = [];
    });
};

// Spawn all players
SearchAndDestroy.prototype.spawnAllPlayers = function() {
    this.playerStates.forEach((playerState, playerId) => {
        if (playerState.isAlive) {
            this.spawnPlayer(playerId, playerState.team);
        }
    });
};

// Spawn individual player
SearchAndDestroy.prototype.spawnPlayer = function(playerId, team) {
    var spawnPoint = this.getTeamSpawnPoint(team);
    
    this.app.fire('player:spawn', {
        playerId: playerId,
        position: spawnPoint.position,
        rotation: spawnPoint.rotation,
        team: team
    });
};

// Get team spawn point
SearchAndDestroy.prototype.getTeamSpawnPoint = function(team) {
    // Implementation would return appropriate spawn point for team
    var attackerSpawn = { position: new pc.Vec3(-100, 0, 0), rotation: new pc.Vec3(0, 90, 0) };
    var defenderSpawn = { position: new pc.Vec3(100, 0, 0), rotation: new pc.Vec3(0, -90, 0) };
    
    return team === 'attackers' ? attackerSpawn : defenderSpawn;
};

// Event handlers
SearchAndDestroy.prototype.onPlayerKill = function(data) {
    if (this.gameState.roundPhase !== 'live') return;
    
    var killerId = data.killerId;
    var victimId = data.victimId;
    
    // Update killer stats
    var killerState = this.playerStates.get(killerId);
    if (killerState) {
        killerState.roundKills++;
    }
    
    // Mark victim as dead
    var victimState = this.playerStates.get(victimId);
    if (victimState) {
        victimState.isAlive = false;
    }
    
    // Check for round end by elimination
    this.checkEliminationWin();
};

SearchAndDestroy.prototype.onPlayerDeath = function(data) {
    // Handled in onPlayerKill
};

SearchAndDestroy.prototype.onBombPlantStart = function(data) {
    if (this.gameState.roundPhase !== 'live') return;
    
    var playerId = data.playerId;
    var siteId = data.siteId;
    
    console.log(`Player ${playerId} started planting bomb at site ${siteId}`);
    
    this.app.fire('announcement:show', {
        type: 'bomb_plant',
        message: `Bomb being planted at site ${siteId}!`,
        duration: 3000
    });
};

SearchAndDestroy.prototype.onBombPlantComplete = function(data) {
    if (this.gameState.roundPhase !== 'live') return;
    
    var playerId = data.playerId;
    var siteId = data.siteId;
    
    this.gameState.bombPlanted = true;
    this.gameState.bombPlantTime = Date.now();
    this.gameState.bombSite = siteId;
    
    // Find and mark bomb site
    var site = this.bombSites.find(s => s.id === siteId);
    if (site) {
        site.planted = true;
    }
    
    // Update player stats
    var playerState = this.playerStates.get(playerId);
    if (playerState) {
        playerState.bombInteractions++;
    }
    
    // Start bomb timer
    this.startBombTimer();
    
    console.log(`Bomb planted at site ${siteId}`);
    this.app.fire('announcement:show', {
        type: 'bomb_planted',
        message: `Bomb planted at site ${siteId}!`,
        duration: 5000
    });
    
    this.matchStats.bombPlants++;
};

SearchAndDestroy.prototype.onBombDefuseStart = function(data) {
    if (!this.gameState.bombPlanted) return;
    
    var playerId = data.playerId;
    
    this.gameState.defuseStartTime = Date.now();
    this.gameState.defusingPlayer = playerId;
    
    console.log(`Player ${playerId} started defusing bomb`);
    
    this.app.fire('announcement:show', {
        type: 'bomb_defuse',
        message: 'Bomb being defused!',
        duration: 3000
    });
};

SearchAndDestroy.prototype.onBombDefuseComplete = function(data) {
    if (!this.gameState.bombPlanted || this.gameState.defusingPlayer !== data.playerId) return;
    
    var playerId = data.playerId;
    
    // Update player stats
    var playerState = this.playerStates.get(playerId);
    if (playerState) {
        playerState.bombInteractions++;
    }
    
    console.log(`Player ${playerId} defused the bomb`);
    this.matchStats.bombDefuses++;
    
    // Defenders win
    this.endRound('bomb_defuse', 'defenders');
};

SearchAndDestroy.prototype.onBombExplode = function() {
    if (!this.gameState.bombPlanted) return;
    
    console.log('Bomb exploded');
    this.matchStats.bombExplosions++;
    
    // Attackers win
    this.endRound('bomb_explosion', 'attackers');
};

// Start bomb timer
SearchAndDestroy.prototype.startBombTimer = function() {
    this.bombTimer = setTimeout(() => {
        this.app.fire('bomb:explode');
    }, this.bombTime * 1000);
};

// Check for elimination win
SearchAndDestroy.prototype.checkEliminationWin = function() {
    var aliveAttackers = 0;
    var aliveDefenders = 0;
    
    this.playerStates.forEach((playerState, playerId) => {
        if (playerState.isAlive) {
            if (playerState.team === 'attackers') {
                aliveAttackers++;
            } else {
                aliveDefenders++;
            }
        }
    });
    
    if (aliveAttackers === 0) {
        this.endRound('elimination', 'defenders');
    } else if (aliveDefenders === 0) {
        this.endRound('elimination', 'attackers');
    }
};

// Handle player purchases
SearchAndDestroy.prototype.onPlayerBuy = function(data) {
    if (this.gameState.roundPhase !== 'buy') return;
    
    var playerId = data.playerId;
    var itemId = data.itemId;
    var price = this.equipmentPrices[itemId];
    
    if (!price) return;
    
    var playerState = this.playerStates.get(playerId);
    if (!playerState || playerState.money < price) return;
    
    // Deduct money
    playerState.money -= price;
    
    // Add equipment
    playerState.equipment.push(itemId);
    
    // Give item to player
    this.app.fire('player:giveItem', {
        playerId: playerId,
        itemId: itemId
    });
    
    console.log(`Player ${playerId} bought ${itemId} for $${price}`);
};

// Validate purchase
SearchAndDestroy.prototype.validatePurchase = function(data) {
    var playerId = data.playerId;
    var itemId = data.itemId;
    var price = this.equipmentPrices[itemId];
    
    var playerState = this.playerStates.get(playerId);
    var canAfford = playerState && playerState.money >= price;
    var inBuyPhase = this.gameState.roundPhase === 'buy';
    
    this.app.fire('buy:validation_result', {
        playerId: playerId,
        itemId: itemId,
        valid: canAfford && inBuyPhase,
        reason: !canAfford ? 'insufficient_funds' : !inBuyPhase ? 'buy_phase_ended' : 'valid'
    });
};

// Initialize bomb sites
SearchAndDestroy.prototype.initializeBombSites = function() {
    this.bombSites.forEach(site => {
        this.app.fire('bombsite:create', {
            id: site.id,
            position: site.position,
            radius: site.radius
        });
    });
};

// Record round in history
SearchAndDestroy.prototype.recordRound = function(reason, winner) {
    this.roundHistory.push({
        round: this.gameState.currentRound,
        reason: reason,
        winner: winner,
        duration: Date.now() - this.gameState.roundStartTime,
        bombPlanted: this.gameState.bombPlanted,
        playerStates: new Map(this.playerStates)
    });
};

// Update statistics
SearchAndDestroy.prototype.updateRoundStatistics = function(reason) {
    this.matchStats.totalRounds++;
    this.matchStats.roundWinsByType[reason]++;
};

// Calculate match statistics
SearchAndDestroy.prototype.calculateMatchStats = function() {
    return {
        totalRounds: this.matchStats.totalRounds,
        attackerWins: this.teamScores.attackers,
        defenderWins: this.teamScores.defenders,
        bombPlants: this.matchStats.bombPlants,
        bombDefuses: this.matchStats.bombDefuses,
        bombExplosions: this.matchStats.bombExplosions,
        roundWinsByType: this.matchStats.roundWinsByType,
        roundHistory: this.roundHistory
    };
};

// UI Management
SearchAndDestroy.prototype.createUI = function() {
    // Create S&D specific UI elements
    console.log('Creating Search and Destroy UI');
};

SearchAndDestroy.prototype.showEndMatchUI = function(winner, stats) {
    this.app.fire('ui:showEndMatch', {
        gameMode: 'Search and Destroy',
        winner: winner,
        scores: this.teamScores,
        stats: stats
    });
};

// Get current game state
SearchAndDestroy.prototype.getGameState = function() {
    return {
        isActive: this.gameState.isActive,
        currentRound: this.gameState.currentRound,
        roundPhase: this.gameState.roundPhase,
        timeRemaining: Math.max(0, this.gameState.roundEndTime - Date.now()),
        bombPlanted: this.gameState.bombPlanted,
        bombTimeRemaining: this.gameState.bombPlanted ? 
            Math.max(0, (this.gameState.bombPlantTime + this.bombTime * 1000) - Date.now()) : 0,
        scores: this.teamScores,
        playerStates: Array.from(this.playerStates.entries())
    };
};
