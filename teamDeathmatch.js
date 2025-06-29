var TeamDeathmatch = pc.createScript('teamDeathmatch');

TeamDeathmatch.attributes.add('scoreLimit', { type: 'number', default: 50 });
TeamDeathmatch.attributes.add('timeLimit', { type: 'number', default: 600 }); // 10 minutes
TeamDeathmatch.attributes.add('respawnTime', { type: 'number', default: 5 });
TeamDeathmatch.attributes.add('killReward', { type: 'number', default: 100 });
TeamDeathmatch.attributes.add('assistReward', { type: 'number', default: 50 });
TeamDeathmatch.attributes.add('headShotMultiplier', { type: 'number', default: 2.0 });
TeamDeathmatch.attributes.add('teamKillPenalty', { type: 'number', default: -200 });

TeamDeathmatch.prototype.initialize = function() {
    // Game state
    this.isActive = false;
    this.isPaused = false;
    this.gameStartTime = 0;
    this.gameEndTime = 0;
    this.timeRemaining = this.timeLimit;
    
    // Team scores
    this.teamScores = {
        blue: 0,
        red: 0
    };
    
    // Player tracking
    this.players = new Map();
    this.teams = {
        blue: new Set(),
        red: new Set()
    };
    
    // Kill tracking
    this.killLog = [];
    this.killStreaks = new Map();
    this.assists = new Map();
    this.damageTracking = new Map();
    
    // Statistics
    this.matchStats = {
        totalKills: 0,
        totalDeaths: 0,
        longestKillStreak: 0,
        mostKillsPlayer: null,
        firstBlood: null,
        teamKills: 0
    };
    
    // Rewards and bonuses
    this.killStreakRewards = {
        3: { name: 'Killing Spree', points: 50 },
        5: { name: 'Rampage', points: 100 },
        7: { name: 'Dominating', points: 150 },
        10: { name: 'Unstoppable', points: 200 },
        15: { name: 'Godlike', points: 300 }
    };
    
    // End game conditions
    this.gameEndReasons = {
        SCORE_LIMIT: 'Score limit reached',
        TIME_LIMIT: 'Time limit reached',
        FORFEIT: 'Team forfeit',
        ADMIN_END: 'Admin ended game'
    };
    
    // Bind events
    this.app.on('player:kill', this.onPlayerKill, this);
    this.app.on('player:died', this.onPlayerDied, this);
    this.app.on('player:joined', this.onPlayerJoined, this);
    this.app.on('player:left', this.onPlayerLeft, this);
    this.app.on('player:teamChanged', this.onPlayerTeamChanged, this);
    this.app.on('match:start', this.startMatch, this);
    this.app.on('match:end', this.endMatch, this);
    this.app.on('match:pause', this.pauseMatch, this);
    this.app.on('match:resume', this.resumeMatch, this);
    this.app.on('tdm:forceEnd', this.forceEndMatch, this);
    
    console.log('TeamDeathmatch game mode initialized');
};

TeamDeathmatch.prototype.update = function(dt) {
    if (!this.isActive || this.isPaused) return;
    
    this.updateTimer(dt);
    this.checkWinConditions();
    this.updateKillStreaks(dt);
    this.updateAssistTracking(dt);
    this.updatePlayerStats(dt);
};

TeamDeathmatch.prototype.updateTimer = function(dt) {
    this.timeRemaining -= dt;
    
    // Fire time update events
    this.app.fire('tdm:timeUpdate', {
        timeRemaining: this.timeRemaining,
        timeElapsed: this.timeLimit - this.timeRemaining
    });
    
    // Time warnings
    if (this.timeRemaining <= 60 && Math.floor(this.timeRemaining) % 10 === 0) {
        this.app.fire('tdm:timeWarning', {
            timeRemaining: Math.floor(this.timeRemaining)
        });
    }
    
    // Check time limit
    if (this.timeRemaining <= 0) {
        this.endMatch(this.gameEndReasons.TIME_LIMIT);
    }
};

TeamDeathmatch.prototype.checkWinConditions = function() {
    // Check score limit
    if (this.teamScores.blue >= this.scoreLimit) {
        this.endMatch(this.gameEndReasons.SCORE_LIMIT, 'blue');
    } else if (this.teamScores.red >= this.scoreLimit) {
        this.endMatch(this.gameEndReasons.SCORE_LIMIT, 'red');
    }
    
    // Check if one team has no players
    if (this.teams.blue.size === 0 && this.teams.red.size > 0) {
        this.endMatch(this.gameEndReasons.FORFEIT, 'red');
    } else if (this.teams.red.size === 0 && this.teams.blue.size > 0) {
        this.endMatch(this.gameEndReasons.FORFEIT, 'blue');
    }
};

TeamDeathmatch.prototype.onPlayerKill = function(data) {
    const killer = data.killer;
    const victim = data.victim;
    const weapon = data.weapon;
    const isHeadshot = data.isHeadshot || false;
    
    // Get player data
    const killerData = this.getPlayerData(killer);
    const victimData = this.getPlayerData(victim);
    
    if (!killerData || !victimData) return;
    
    // Check for team kill
    if (killerData.team === victimData.team) {
        this.handleTeamKill(killer, victim);
        return;
    }
    
    // Award points
    const basePoints = this.killReward;
    const headshotBonus = isHeadshot ? (basePoints * (this.headShotMultiplier - 1)) : 0;
    const totalPoints = basePoints + headshotBonus;
    
    // Update scores
    this.teamScores[killerData.team] += 1;
    killerData.score += totalPoints;
    killerData.kills += 1;
    victimData.deaths += 1;
    
    // Update kill streak
    this.updateKillStreak(killer, killerData);
    this.resetKillStreak(victim);
    
    // Check for first blood
    if (!this.matchStats.firstBlood) {
        this.matchStats.firstBlood = {
            killer: killer,
            victim: victim,
            time: this.timeLimit - this.timeRemaining
        };
        
        this.app.fire('tdm:firstBlood', this.matchStats.firstBlood);
    }
    
    // Handle assists
    this.processAssists(victim, killer, killerData.team);
    
    // Log the kill
    this.logKill(killer, victim, weapon, isHeadshot, totalPoints);
    
    // Update match statistics
    this.updateMatchStats(killer, victim);
    
    // Fire events
    this.app.fire('tdm:kill', {
        killer: killer,
        victim: victim,
        weapon: weapon,
        isHeadshot: isHeadshot,
        points: totalPoints,
        killerTeam: killerData.team,
        victimTeam: victimData.team
    });
    
    this.app.fire('tdm:scoreUpdate', {
        blueScore: this.teamScores.blue,
        redScore: this.teamScores.red
    });
    
    console.log(`Kill: ${killer.name} killed ${victim.name} (+${totalPoints} points)`);
};

TeamDeathmatch.prototype.handleTeamKill = function(killer, victim) {
    const killerData = this.getPlayerData(killer);
    
    // Apply penalty
    killerData.score += this.teamKillPenalty;
    killerData.teamKills += 1;
    
    // Reset kill streak
    this.resetKillStreak(killer);
    
    // Update match stats
    this.matchStats.teamKills += 1;
    
    // Log team kill
    this.logKill(killer, victim, null, false, this.teamKillPenalty, true);
    
    // Fire event
    this.app.fire('tdm:teamKill', {
        killer: killer,
        victim: victim,
        penalty: this.teamKillPenalty
    });
    
    console.log(`Team Kill: ${killer.name} team killed ${victim.name} (${this.teamKillPenalty} points)`);
};

TeamDeathmatch.prototype.onPlayerDied = function(data) {
    const player = data.entity;
    const killer = data.killer;
    
    // Schedule respawn
    setTimeout(() => {
        this.respawnPlayer(player);
    }, this.respawnTime * 1000);
    
    // Clear damage tracking for this player
    this.clearDamageTracking(player);
};

TeamDeathmatch.prototype.updateKillStreak = function(player, playerData) {
    const currentStreak = this.killStreaks.get(player) || 0;
    const newStreak = currentStreak + 1;
    
    this.killStreaks.set(player, newStreak);
    playerData.killStreak = newStreak;
    playerData.bestKillStreak = Math.max(playerData.bestKillStreak, newStreak);
    
    // Check for kill streak rewards
    if (this.killStreakRewards[newStreak]) {
        const reward = this.killStreakRewards[newStreak];
        playerData.score += reward.points;
        
        this.app.fire('tdm:killStreak', {
            player: player,
            streak: newStreak,
            name: reward.name,
            points: reward.points
        });
        
        console.log(`Kill Streak: ${player.name} - ${reward.name} (${newStreak} kills)`);
    }
    
    // Update longest kill streak
    this.matchStats.longestKillStreak = Math.max(this.matchStats.longestKillStreak, newStreak);
};

TeamDeathmatch.prototype.resetKillStreak = function(player) {
    this.killStreaks.set(player, 0);
    
    const playerData = this.getPlayerData(player);
    if (playerData) {
        playerData.killStreak = 0;
    }
};

TeamDeathmatch.prototype.processAssists = function(victim, killer, killerTeam) {
    const damageList = this.damageTracking.get(victim);
    if (!damageList) return;
    
    const currentTime = Date.now();
    const assistTimeWindow = 5000; // 5 seconds
    
    // Find players who damaged the victim recently (excluding killer)
    const assistPlayers = [];
    damageList.forEach(damageData => {
        if (damageData.attacker !== killer && 
            damageData.team === killerTeam &&
            currentTime - damageData.timestamp < assistTimeWindow) {
            assistPlayers.push(damageData.attacker);
        }
    });
    
    // Award assists
    assistPlayers.forEach(assistPlayer => {
        const assistData = this.getPlayerData(assistPlayer);
        if (assistData) {
            assistData.assists += 1;
            assistData.score += this.assistReward;
            
            this.app.fire('tdm:assist', {
                player: assistPlayer,
                victim: victim,
                points: this.assistReward
            });
        }
    });
};

TeamDeathmatch.prototype.trackDamage = function(attacker, victim, damage) {
    if (!this.damageTracking.has(victim)) {
        this.damageTracking.set(victim, []);
    }
    
    const attackerData = this.getPlayerData(attacker);
    const damageList = this.damageTracking.get(victim);
    
    damageList.push({
        attacker: attacker,
        damage: damage,
        timestamp: Date.now(),
        team: attackerData ? attackerData.team : 'unknown'
    });
    
    // Limit damage tracking to prevent memory issues
    if (damageList.length > 10) {
        damageList.shift();
    }
};

TeamDeathmatch.prototype.clearDamageTracking = function(player) {
    this.damageTracking.delete(player);
};

TeamDeathmatch.prototype.updateAssistTracking = function(dt) {
    const currentTime = Date.now();
    const expireTime = 10000; // 10 seconds
    
    // Clean up old damage tracking
    this.damageTracking.forEach((damageList, victim) => {
        const filteredList = damageList.filter(damageData => 
            currentTime - damageData.timestamp < expireTime
        );
        
        if (filteredList.length === 0) {
            this.damageTracking.delete(victim);
        } else {
            this.damageTracking.set(victim, filteredList);
        }
    });
};

TeamDeathmatch.prototype.logKill = function(killer, victim, weapon, isHeadshot, points, isTeamKill = false) {
    const killData = {
        killer: killer,
        victim: victim,
        weapon: weapon,
        isHeadshot: isHeadshot,
        isTeamKill: isTeamKill,
        points: points,
        timestamp: Date.now(),
        gameTime: this.timeLimit - this.timeRemaining
    };
    
    this.killLog.push(killData);
    
    // Limit kill log size
    if (this.killLog.length > 100) {
        this.killLog.shift();
    }
};

TeamDeathmatch.prototype.updateMatchStats = function(killer, victim) {
    this.matchStats.totalKills += 1;
    this.matchStats.totalDeaths += 1;
    
    const killerData = this.getPlayerData(killer);
    if (killerData) {
        if (!this.matchStats.mostKillsPlayer || 
            killerData.kills > this.getPlayerData(this.matchStats.mostKillsPlayer).kills) {
            this.matchStats.mostKillsPlayer = killer;
        }
    }
};

TeamDeathmatch.prototype.onPlayerJoined = function(data) {
    const player = data.player || data.entity;
    const team = this.assignTeam(player);
    
    // Initialize player data
    this.players.set(player, {
        team: team,
        kills: 0,
        deaths: 0,
        assists: 0,
        score: 0,
        killStreak: 0,
        bestKillStreak: 0,
        teamKills: 0,
        joinTime: Date.now(),
        playtime: 0
    });
    
    // Add to team
    this.teams[team].add(player);
    
    // Apply team tag
    player.tags.add(team + '_team');
    
    this.app.fire('tdm:playerJoined', {
        player: player,
        team: team,
        teamCounts: this.getTeamCounts()
    });
    
    console.log(`Player ${player.name} joined team ${team}`);
};

TeamDeathmatch.prototype.onPlayerLeft = function(data) {
    const player = data.player || data.entity;
    const playerData = this.getPlayerData(player);
    
    if (playerData) {
        // Update playtime
        playerData.playtime = Date.now() - playerData.joinTime;
        
        // Remove from team
        this.teams[playerData.team].delete(player);
        
        // Remove team tag
        player.tags.remove(playerData.team + '_team');
    }
    
    // Clean up tracking
    this.players.delete(player);
    this.killStreaks.delete(player);
    this.clearDamageTracking(player);
    
    this.app.fire('tdm:playerLeft', {
        player: player,
        teamCounts: this.getTeamCounts()
    });
};

TeamDeathmatch.prototype.assignTeam = function(player) {
    // Balance teams by assigning to smaller team
    const bluCount = this.teams.blue.size;
    const redCount = this.teams.red.size;
    
    return bluCount <= redCount ? 'blue' : 'red';
};

TeamDeathmatch.prototype.switchPlayerTeam = function(player, newTeam) {
    const playerData = this.getPlayerData(player);
    if (!playerData || playerData.team === newTeam) return false;
    
    // Remove from old team
    this.teams[playerData.team].delete(player);
    player.tags.remove(playerData.team + '_team');
    
    // Add to new team
    this.teams[newTeam].add(player);
    player.tags.add(newTeam + '_team');
    
    // Update player data
    playerData.team = newTeam;
    
    // Reset kill streak on team switch
    this.resetKillStreak(player);
    
    this.app.fire('tdm:teamSwitch', {
        player: player,
        oldTeam: playerData.team,
        newTeam: newTeam,
        teamCounts: this.getTeamCounts()
    });
    
    return true;
};

TeamDeathmatch.prototype.startMatch = function() {
    this.isActive = true;
    this.gameStartTime = Date.now();
    this.timeRemaining = this.timeLimit;
    
    // Reset scores
    this.teamScores.blue = 0;
    this.teamScores.red = 0;
    
    // Reset all player stats
    this.players.forEach(playerData => {
        playerData.kills = 0;
        playerData.deaths = 0;
        playerData.assists = 0;
        playerData.score = 0;
        playerData.killStreak = 0;
        playerData.teamKills = 0;
    });
    
    // Reset match stats
    this.matchStats = {
        totalKills: 0,
        totalDeaths: 0,
        longestKillStreak: 0,
        mostKillsPlayer: null,
        firstBlood: null,
        teamKills: 0
    };
    
    // Clear tracking
    this.killLog = [];
    this.killStreaks.clear();
    this.damageTracking.clear();
    
    this.app.fire('tdm:matchStart', {
        scoreLimit: this.scoreLimit,
        timeLimit: this.timeLimit,
        teamCounts: this.getTeamCounts()
    });
    
    console.log('Team Deathmatch started');
};

TeamDeathmatch.prototype.endMatch = function(reason, winningTeam = null) {
    if (!this.isActive) return;
    
    this.isActive = false;
    this.gameEndTime = Date.now();
    
    // Determine winner if not specified
    if (!winningTeam) {
        if (this.teamScores.blue > this.teamScores.red) {
            winningTeam = 'blue';
        } else if (this.teamScores.red > this.teamScores.blue) {
            winningTeam = 'red';
        } else {
            winningTeam = 'tie';
        }
    }
    
    // Calculate final stats
    const matchDuration = this.gameEndTime - this.gameStartTime;
    const finalStats = this.calculateFinalStats();
    
    this.app.fire('tdm:matchEnd', {
        winner: winningTeam,
        reason: reason,
        duration: matchDuration,
        finalScores: { ...this.teamScores },
        stats: finalStats,
        killLog: this.killLog.slice()
    });
    
    console.log(`Team Deathmatch ended - Winner: ${winningTeam}, Reason: ${reason}`);
};

TeamDeathmatch.prototype.pauseMatch = function() {
    this.isPaused = true;
    this.app.fire('tdm:matchPaused');
};

TeamDeathmatch.prototype.resumeMatch = function() {
    this.isPaused = false;
    this.app.fire('tdm:matchResumed');
};

TeamDeathmatch.prototype.forceEndMatch = function(data) {
    this.endMatch(this.gameEndReasons.ADMIN_END, data.winner);
};

TeamDeathmatch.prototype.calculateFinalStats = function() {
    const playerStats = [];
    
    this.players.forEach((playerData, player) => {
        const kdr = playerData.deaths > 0 ? playerData.kills / playerData.deaths : playerData.kills;
        
        playerStats.push({
            player: player,
            team: playerData.team,
            kills: playerData.kills,
            deaths: playerData.deaths,
            assists: playerData.assists,
            score: playerData.score,
            kdr: Math.round(kdr * 100) / 100,
            bestKillStreak: playerData.bestKillStreak,
            teamKills: playerData.teamKills,
            playtime: Date.now() - playerData.joinTime
        });
    });
    
    // Sort by score
    playerStats.sort((a, b) => b.score - a.score);
    
    return {
        players: playerStats,
        match: { ...this.matchStats },
        teamScores: { ...this.teamScores }
    };
};

TeamDeathmatch.prototype.respawnPlayer = function(player) {
    this.app.fire('player:respawn', {
        player: player,
        team: this.getPlayerData(player)?.team
    });
};

TeamDeathmatch.prototype.getPlayerData = function(player) {
    return this.players.get(player) || null;
};

TeamDeathmatch.prototype.getTeamCounts = function() {
    return {
        blue: this.teams.blue.size,
        red: this.teams.red.size
    };
};

TeamDeathmatch.prototype.updatePlayerStats = function(dt) {
    // Update playtime for all active players
    this.players.forEach(playerData => {
        playerData.playtime = Date.now() - playerData.joinTime;
    });
};

TeamDeathmatch.prototype.updateKillStreaks = function(dt) {
    // Kill streak announcements and special effects could be handled here
    this.killStreaks.forEach((streak, player) => {
        if (streak > 0 && streak % 5 === 0) {
            // Major kill streak milestone
            this.app.fire('tdm:majorKillStreak', {
                player: player,
                streak: streak
            });
        }
    });
};

TeamDeathmatch.prototype.getLeaderboard = function() {
    const leaderboard = [];
    
    this.players.forEach((playerData, player) => {
        leaderboard.push({
            player: player,
            ...playerData
        });
    });
    
    return leaderboard.sort((a, b) => b.score - a.score);
};

TeamDeathmatch.prototype.getMatchStatus = function() {
    return {
        isActive: this.isActive,
        isPaused: this.isPaused,
        timeRemaining: this.timeRemaining,
        scores: { ...this.teamScores },
        teamCounts: this.getTeamCounts(),
        totalPlayers: this.players.size
    };
};

TeamDeathmatch.prototype.getCurrentStats = function() {
    return {
        scores: { ...this.teamScores },
        timeRemaining: this.timeRemaining,
        totalKills: this.matchStats.totalKills,
        longestKillStreak: this.matchStats.longestKillStreak,
        teamKills: this.matchStats.teamKills,
        leaderboard: this.getLeaderboard().slice(0, 5) // Top 5
    };
};