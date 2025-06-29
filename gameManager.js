var GameManager = pc.createScript('gameManager');

GameManager.attributes.add('gameMode', {
    type: 'string',
    enum: [
        { 'Team Deathmatch': 'tdm' },
        { 'Domination': 'dom' },
        { 'Capture The Flag': 'ctf' },
        { 'Battle Royale': 'br' }
    ],
    default: 'tdm'
});

GameManager.attributes.add('matchDuration', { type: 'number', default: 600 }); // 10 minutes
GameManager.attributes.add('maxPlayers', { type: 'number', default: 20 });
GameManager.attributes.add('respawnTime', { type: 'number', default: 5 });

// Game states
GameManager.STATE_LOBBY = 0;
GameManager.STATE_COUNTDOWN = 1;
GameManager.STATE_ACTIVE = 2;
GameManager.STATE_ENDED = 3;

GameManager.prototype.initialize = function() {
    this.gameState = GameManager.STATE_LOBBY;
    this.matchTime = 0;
    this.players = [];
    this.teams = { blue: [], red: [] };
    this.scores = { blue: 0, red: 0 };
    
    // Bind events
    this.app.on('player:joined', this.onPlayerJoined, this);
    this.app.on('player:left', this.onPlayerLeft, this);
    this.app.on('player:died', this.onPlayerDied, this);
    this.app.on('player:kill', this.onPlayerKill, this);
    this.app.on('match:start', this.startMatch, this);
    this.app.on('match:end', this.endMatch, this);
    
    console.log('GameManager initialized - Mode:', this.gameMode);
};

GameManager.prototype.update = function(dt) {
    if (this.gameState === GameManager.STATE_ACTIVE) {
        this.matchTime += dt;
        
        // Check win conditions
        this.checkWinConditions();
        
        // Update UI
        this.app.fire('ui:updateMatchTime', this.matchTime);
        this.app.fire('ui:updateScores', this.scores);
    }
};

GameManager.prototype.startMatch = function() {
    this.gameState = GameManager.STATE_ACTIVE;
    this.matchTime = 0;
    
    // Reset scores
    this.scores.blue = 0;
    this.scores.red = 0;
    
    // Spawn all players
    this.spawnAllPlayers();
    
    // Start game mode specific logic
    this.initializeGameMode();
    
    this.app.fire('ui:showGameHUD');
    console.log('Match started:', this.gameMode);
};

GameManager.prototype.endMatch = function(winningTeam) {
    this.gameState = GameManager.STATE_ENDED;
    
    this.app.fire('ui:showMatchResults', {
        winner: winningTeam,
        scores: this.scores,
        duration: this.matchTime
    });
    
    console.log('Match ended. Winner:', winningTeam);
};

GameManager.prototype.checkWinConditions = function() {
    // Time limit
    if (this.matchTime >= this.matchDuration) {
        const winner = this.scores.blue > this.scores.red ? 'blue' : 'red';
        this.endMatch(winner);
        return;
    }
    
    // Score limit (game mode specific)
    switch (this.gameMode) {
        case 'tdm':
            if (this.scores.blue >= 50 || this.scores.red >= 50) {
                const winner = this.scores.blue >= 50 ? 'blue' : 'red';
                this.endMatch(winner);
            }
            break;
    }
};

GameManager.prototype.onPlayerJoined = function(player) {
    this.players.push(player);
    this.assignTeam(player);
    console.log('Player joined:', player.name);
};

GameManager.prototype.onPlayerLeft = function(player) {
    const index = this.players.indexOf(player);
    if (index > -1) {
        this.players.splice(index, 1);
        this.removeFromTeam(player);
    }
};

GameManager.prototype.onPlayerDied = function(player, killer) {
    // Handle respawn
    if (this.gameState === GameManager.STATE_ACTIVE) {
        setTimeout(() => {
            this.respawnPlayer(player);
        }, this.respawnTime * 1000);
    }
};

GameManager.prototype.onPlayerKill = function(killer, victim) {
    if (killer.team) {
        this.scores[killer.team]++;
        this.app.fire('ui:updateKillFeed', { killer, victim });
    }
};

GameManager.prototype.assignTeam = function(player) {
    // Balance teams
    const team = this.teams.blue.length <= this.teams.red.length ? 'blue' : 'red';
    player.team = team;
    this.teams[team].push(player);
};

GameManager.prototype.removeFromTeam = function(player) {
    if (player.team && this.teams[player.team]) {
        const index = this.teams[player.team].indexOf(player);
        if (index > -1) {
            this.teams[player.team].splice(index, 1);
        }
    }
};

GameManager.prototype.spawnAllPlayers = function() {
    this.players.forEach(player => {
        this.spawnPlayer(player);
    });
};

GameManager.prototype.spawnPlayer = function(player) {
    const spawnPoint = this.getSpawnPoint(player.team);
    if (spawnPoint && player.entity) {
        player.entity.setPosition(spawnPoint.getPosition());
        player.entity.setRotation(spawnPoint.getRotation());
        
        // Reset player state
        if (player.entity.script.healthSystem) {
            player.entity.script.healthSystem.reset();
        }
    }
};

GameManager.prototype.respawnPlayer = function(player) {
    this.spawnPlayer(player);
    this.app.fire('player:respawned', player);
};

GameManager.prototype.getSpawnPoint = function(team) {
    const spawnPoints = this.app.root.findByName('Spawn_Points');
    if (!spawnPoints) return null;
    
    const teamSpawns = spawnPoints.children.filter(spawn => 
        spawn.tags.has(team + '_spawn')
    );
    
    if (teamSpawns.length === 0) return null;
    
    // Return random spawn point
    return teamSpawns[Math.floor(Math.random() * teamSpawns.length)];
};

GameManager.prototype.initializeGameMode = function() {
    switch (this.gameMode) {
        case 'tdm':
            // Team Deathmatch - no special initialization needed
            break;
        case 'dom':
            this.initializeDomination();
            break;
        case 'ctf':
            this.initializeCTF();
            break;
    }
};

GameManager.prototype.initializeDomination = function() {
    // Find control points and initialize them
    const controlPoints = this.app.root.findByTag('control_point');
    controlPoints.forEach(point => {
        if (point.script.controlPoint) {
            point.script.controlPoint.initialize();
        }
    });
};

GameManager.prototype.initializeCTF = function() {
    // Initialize flag systems
    const flags = this.app.root.findByTag('flag');
    flags.forEach(flag => {
        if (flag.script.flag) {
            flag.script.flag.initialize();
        }
    });
};