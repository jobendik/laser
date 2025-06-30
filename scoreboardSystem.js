/**
 * ScoreboardSystem.js
 * Manages the in-game scoreboard display for multiplayer matches
 */

class ScoreboardSystem extends pc.ScriptType {
    static get scriptName() { return 'ScoreboardSystem'; }

    initialize() {
        this.gameManager = this.app.root.findByName('Game_Manager').script.gameManager;
        this.networkManager = this.app.root.findByName('Game_Manager').script.networkManager;
        this.inputManager = this.app.root.findByName('Game_Manager').script.inputManager;
        
        // UI elements
        this.scoreboardElement = null;
        this.isVisible = false;
        this.toggleKey = 'Tab';
        
        // Player data tracking
        this.playerStats = new Map();
        this.sortedPlayers = [];
        this.lastUpdateTime = 0;
        this.updateInterval = 1000; // Update every second
        
        // Column configurations for different game modes
        this.columnConfigs = {
            teamDeathmatch: [
                { key: 'name', label: 'Player', width: '25%', align: 'left' },
                { key: 'kills', label: 'Kills', width: '15%', align: 'center' },
                { key: 'deaths', label: 'Deaths', width: '15%', align: 'center' },
                { key: 'kdr', label: 'K/D', width: '15%', align: 'center' },
                { key: 'score', label: 'Score', width: '15%', align: 'center' },
                { key: 'ping', label: 'Ping', width: '15%', align: 'center' }
            ],
            captureTheFlag: [
                { key: 'name', label: 'Player', width: '20%', align: 'left' },
                { key: 'kills', label: 'Kills', width: '12%', align: 'center' },
                { key: 'deaths', label: 'Deaths', width: '12%', align: 'center' },
                { key: 'captures', label: 'Captures', width: '12%', align: 'center' },
                { key: 'returns', label: 'Returns', width: '12%', align: 'center' },
                { key: 'score', label: 'Score', width: '17%', align: 'center' },
                { key: 'ping', label: 'Ping', width: '15%', align: 'center' }
            ],
            domination: [
                { key: 'name', label: 'Player', width: '20%', align: 'left' },
                { key: 'kills', label: 'Kills', width: '12%', align: 'center' },
                { key: 'deaths', label: 'Deaths', width: '12%', align: 'center' },
                { key: 'captures', label: 'Captures', width: '12%', align: 'center' },
                { key: 'defends', label: 'Defends', width: '12%', align: 'center' },
                { key: 'score', label: 'Score', width: '17%', align: 'center' },
                { key: 'ping', label: 'Ping', width: '15%', align: 'center' }
            ],
            battleRoyale: [
                { key: 'name', label: 'Player', width: '25%', align: 'left' },
                { key: 'kills', label: 'Kills', width: '15%', align: 'center' },
                { key: 'damage', label: 'Damage', width: '15%', align: 'center' },
                { key: 'placement', label: 'Placement', width: '15%', align: 'center' },
                { key: 'survivalTime', label: 'Time', width: '15%', align: 'center' },
                { key: 'ping', label: 'Ping', width: '15%', align: 'center' }
            ]
        };
        
        this.createScoreboardUI();
        this.setupEventListeners();
    }

    createScoreboardUI() {
        // Create main scoreboard container
        this.scoreboardElement = document.createElement('div');
        this.scoreboardElement.id = 'scoreboard';
        this.scoreboardElement.style.cssText = `
            position: fixed;
            top: 10%;
            left: 50%;
            transform: translateX(-50%);
            width: 80%;
            max-width: 1200px;
            background: rgba(0, 0, 0, 0.85);
            border: 2px solid #444;
            border-radius: 8px;
            color: white;
            font-family: Arial, sans-serif;
            font-size: 14px;
            z-index: 1000;
            display: none;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;
        
        document.body.appendChild(this.scoreboardElement);
        
        this.createScoreboardHeader();
        this.createScoreboardContent();
    }

    createScoreboardHeader() {
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 15px 20px;
            background: rgba(0, 0, 0, 0.3);
            border-bottom: 1px solid #666;
            text-align: center;
        `;
        
        // Game mode and map info
        const gameInfo = document.createElement('div');
        gameInfo.style.cssText = `
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 5px;
        `;
        
        // Timer and score info
        const matchInfo = document.createElement('div');
        matchInfo.id = 'match-info';
        matchInfo.style.cssText = `
            font-size: 14px;
            color: #ccc;
        `;
        
        header.appendChild(gameInfo);
        header.appendChild(matchInfo);
        this.scoreboardElement.appendChild(header);
        
        this.gameInfoElement = gameInfo;
        this.matchInfoElement = matchInfo;
    }

    createScoreboardContent() {
        const content = document.createElement('div');
        content.id = 'scoreboard-content';
        content.style.cssText = `
            padding: 20px;
            max-height: 60vh;
            overflow-y: auto;
        `;
        
        this.scoreboardElement.appendChild(content);
        this.contentElement = content;
    }

    setupEventListeners() {
        // Input handling
        this.app.on('input:keydown', this.onKeyDown, this);
        this.app.on('input:keyup', this.onKeyUp, this);
        
        // Game events
        this.app.on('player:kill', this.onPlayerKill, this);
        this.app.on('player:death', this.onPlayerDeath, this);
        this.app.on('player:score', this.onPlayerScore, this);
        this.app.on('player:connected', this.onPlayerConnected, this);
        this.app.on('player:disconnected', this.onPlayerDisconnected, this);
        this.app.on('game:stateChanged', this.onGameStateChanged, this);
        
        // Network events
        this.app.on('network:playerStats', this.onPlayerStatsReceived, this);
        this.app.on('network:scoreboardUpdate', this.onScoreboardUpdate, this);
    }

    onKeyDown(data) {
        if (data.key === this.toggleKey) {
            this.showScoreboard();
        }
    }

    onKeyUp(data) {
        if (data.key === this.toggleKey) {
            this.hideScoreboard();
        }
    }

    showScoreboard() {
        if (!this.isVisible) {
            this.isVisible = true;
            this.scoreboardElement.style.display = 'block';
            this.updateScoreboard();
            
            // Request latest stats from server
            if (this.networkManager) {
                this.networkManager.requestPlayerStats();
            }
        }
    }

    hideScoreboard() {
        if (this.isVisible) {
            this.isVisible = false;
            this.scoreboardElement.style.display = 'none';
        }
    }

    updateScoreboard() {
        if (!this.isVisible) return;
        
        const currentTime = Date.now();
        if (currentTime - this.lastUpdateTime < this.updateInterval) return;
        
        this.lastUpdateTime = currentTime;
        
        this.updateHeader();
        this.updatePlayerList();
    }

    updateHeader() {
        if (!this.gameManager) return;
        
        const gameMode = this.gameManager.currentGameMode || 'Unknown';
        const mapName = this.gameManager.currentMap || 'Unknown';
        
        this.gameInfoElement.textContent = `${gameMode} - ${mapName}`;
        
        // Update match info based on game mode
        let matchInfo = '';
        
        if (this.gameManager.isTeamBased) {
            const teamAScore = this.gameManager.teamScores?.teamA || 0;
            const teamBScore = this.gameManager.teamScores?.teamB || 0;
            matchInfo = `Team A: ${teamAScore} - Team B: ${teamBScore}`;
        }
        
        if (this.gameManager.timeRemaining) {
            const minutes = Math.floor(this.gameManager.timeRemaining / 60);
            const seconds = this.gameManager.timeRemaining % 60;
            const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            matchInfo += matchInfo ? ` | Time: ${timeStr}` : `Time: ${timeStr}`;
        }
        
        this.matchInfoElement.textContent = matchInfo;
    }

    updatePlayerList() {
        this.sortedPlayers = this.getSortedPlayers();
        
        const gameMode = this.gameManager?.currentGameMode || 'teamDeathmatch';
        const columns = this.columnConfigs[gameMode] || this.columnConfigs.teamDeathmatch;
        
        // Clear existing content
        this.contentElement.innerHTML = '';
        
        if (this.gameManager?.isTeamBased) {
            this.createTeamBasedScoreboard(columns);
        } else {
            this.createFFAScoreboard(columns);
        }
    }

    createTeamBasedScoreboard(columns) {
        const teamA = this.sortedPlayers.filter(p => p.team === 'teamA');
        const teamB = this.sortedPlayers.filter(p => p.team === 'teamB');
        
        // Team A section
        if (teamA.length > 0) {
            this.createTeamSection('Team A', teamA, columns, '#4a90e2');
        }
        
        // Team B section
        if (teamB.length > 0) {
            this.createTeamSection('Team B', teamB, columns, '#e24a4a');
        }
    }

    createTeamSection(teamName, players, columns, teamColor) {
        const teamHeader = document.createElement('div');
        teamHeader.style.cssText = `
            background: ${teamColor};
            padding: 10px 15px;
            margin-bottom: 5px;
            font-weight: bold;
            border-radius: 4px;
        `;
        teamHeader.textContent = teamName;
        this.contentElement.appendChild(teamHeader);
        
        const table = this.createPlayerTable(players, columns);
        this.contentElement.appendChild(table);
        
        // Add spacing between teams
        const spacer = document.createElement('div');
        spacer.style.height = '20px';
        this.contentElement.appendChild(spacer);
    }

    createFFAScoreboard(columns) {
        const table = this.createPlayerTable(this.sortedPlayers, columns);
        this.contentElement.appendChild(table);
    }

    createPlayerTable(players, columns) {
        const table = document.createElement('table');
        table.style.cssText = `
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 10px;
        `;
        
        // Create header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headerRow.style.cssText = `
            background: rgba(255, 255, 255, 0.1);
            border-bottom: 1px solid #666;
        `;
        
        columns.forEach(column => {
            const th = document.createElement('th');
            th.style.cssText = `
                padding: 8px 10px;
                text-align: ${column.align};
                width: ${column.width};
                font-weight: bold;
                border-right: 1px solid #444;
            `;
            th.textContent = column.label;
            headerRow.appendChild(th);
        });
        
        thead.appendChild(headerRow);
        table.appendChild(thead);
        
        // Create body
        const tbody = document.createElement('tbody');
        
        players.forEach((player, index) => {
            const row = this.createPlayerRow(player, columns, index);
            tbody.appendChild(row);
        });
        
        table.appendChild(tbody);
        return table;
    }

    createPlayerRow(player, columns, index) {
        const row = document.createElement('tr');
        row.style.cssText = `
            background: ${index % 2 === 0 ? 'rgba(255, 255, 255, 0.05)' : 'transparent'};
            border-bottom: 1px solid #333;
        `;
        
        // Highlight local player
        if (player.isLocalPlayer) {
            row.style.background = 'rgba(74, 144, 226, 0.2)';
        }
        
        columns.forEach(column => {
            const td = document.createElement('td');
            td.style.cssText = `
                padding: 8px 10px;
                text-align: ${column.align};
                border-right: 1px solid #444;
            `;
            
            td.textContent = this.formatCellValue(player, column.key);
            row.appendChild(td);
        });
        
        return row;
    }

    formatCellValue(player, key) {
        switch (key) {
            case 'name':
                return player.name || 'Unknown';
            case 'kills':
                return player.kills || 0;
            case 'deaths':
                return player.deaths || 0;
            case 'kdr':
                const kills = player.kills || 0;
                const deaths = player.deaths || 0;
                return deaths > 0 ? (kills / deaths).toFixed(2) : kills.toFixed(2);
            case 'score':
                return player.score || 0;
            case 'ping':
                return `${player.ping || 0}ms`;
            case 'captures':
                return player.captures || 0;
            case 'returns':
                return player.returns || 0;
            case 'defends':
                return player.defends || 0;
            case 'damage':
                return player.damage || 0;
            case 'placement':
                return player.placement || '-';
            case 'survivalTime':
                const time = player.survivalTime || 0;
                const minutes = Math.floor(time / 60);
                const seconds = time % 60;
                return `${minutes}:${seconds.toString().padStart(2, '0')}`;
            default:
                return player[key] || 0;
        }
    }

    getSortedPlayers() {
        const players = Array.from(this.playerStats.values());
        
        // Sort by score (descending), then by kills (descending), then by deaths (ascending)
        return players.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (b.kills !== a.kills) return b.kills - a.kills;
            return a.deaths - b.deaths;
        });
    }

    onPlayerKill(data) {
        const { killerId, victimId } = data;
        
        // Update killer stats
        if (this.playerStats.has(killerId)) {
            const killer = this.playerStats.get(killerId);
            killer.kills = (killer.kills || 0) + 1;
            killer.score = (killer.score || 0) + 100; // Base kill score
        }
        
        // Update victim stats
        if (this.playerStats.has(victimId)) {
            const victim = this.playerStats.get(victimId);
            victim.deaths = (victim.deaths || 0) + 1;
        }
        
        this.updateScoreboard();
    }

    onPlayerDeath(data) {
        // Death handling is covered in onPlayerKill
    }

    onPlayerScore(data) {
        const { playerId, points, reason } = data;
        
        if (this.playerStats.has(playerId)) {
            const player = this.playerStats.get(playerId);
            player.score = (player.score || 0) + points;
            
            // Update specific stats based on reason
            switch (reason) {
                case 'capture':
                    player.captures = (player.captures || 0) + 1;
                    break;
                case 'return':
                    player.returns = (player.returns || 0) + 1;
                    break;
                case 'defend':
                    player.defends = (player.defends || 0) + 1;
                    break;
            }
        }
        
        this.updateScoreboard();
    }

    onPlayerConnected(data) {
        const { playerId, playerData } = data;
        
        this.playerStats.set(playerId, {
            id: playerId,
            name: playerData.name,
            team: playerData.team,
            kills: 0,
            deaths: 0,
            score: 0,
            ping: 0,
            isLocalPlayer: playerId === this.networkManager?.localPlayerId
        });
        
        this.updateScoreboard();
    }

    onPlayerDisconnected(data) {
        const { playerId } = data;
        this.playerStats.delete(playerId);
        this.updateScoreboard();
    }

    onGameStateChanged(data) {
        // Refresh scoreboard when game state changes
        this.updateScoreboard();
    }

    onPlayerStatsReceived(data) {
        // Update all player stats from server
        data.players.forEach(playerData => {
            this.playerStats.set(playerData.id, {
                ...playerData,
                isLocalPlayer: playerData.id === this.networkManager?.localPlayerId
            });
        });
        
        this.updateScoreboard();
    }

    onScoreboardUpdate(data) {
        // Handle incremental scoreboard updates
        Object.entries(data.updates).forEach(([playerId, updates]) => {
            if (this.playerStats.has(playerId)) {
                const player = this.playerStats.get(playerId);
                Object.assign(player, updates);
            }
        });
        
        this.updateScoreboard();
    }

    update(dt) {
        if (this.isVisible) {
            this.updateScoreboard();
        }
    }

    destroy() {
        // Clean up event listeners
        this.app.off('input:keydown', this.onKeyDown, this);
        this.app.off('input:keyup', this.onKeyUp, this);
        this.app.off('player:kill', this.onPlayerKill, this);
        this.app.off('player:death', this.onPlayerDeath, this);
        this.app.off('player:score', this.onPlayerScore, this);
        this.app.off('player:connected', this.onPlayerConnected, this);
        this.app.off('player:disconnected', this.onPlayerDisconnected, this);
        this.app.off('game:stateChanged', this.onGameStateChanged, this);
        this.app.off('network:playerStats', this.onPlayerStatsReceived, this);
        this.app.off('network:scoreboardUpdate', this.onScoreboardUpdate, this);
        
        // Remove UI
        if (this.scoreboardElement && this.scoreboardElement.parentNode) {
            this.scoreboardElement.parentNode.removeChild(this.scoreboardElement);
        }
    }
}

pc.registerScript(ScoreboardSystem, 'ScoreboardSystem');
