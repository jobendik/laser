/**
 * Domination.js
 * Domination game mode implementation
 * Control points, team scoring, and tactical gameplay
 */

class Domination extends pc.ScriptType {
    static get scriptName() { return 'Domination'; }

    initialize() {
        this.gameManager = this.app.root.findByName('Game_Manager').script.gameManager;
        this.hudManager = this.app.root.findByName('HUD_Manager').script.hudManager;
        this.audioManager = this.app.root.findByName('AudioManager').script.audioManager;
        
        // Game mode settings
        this.gameMode = 'domination';
        this.maxScore = 500; // Points to win
        this.captureTime = 10000; // Time to capture a point (ms)
        this.pointTickRate = 1000; // How often points are awarded (ms)
        this.pointsPerTick = 1; // Points awarded per controlled point per tick
        
        // Control points
        this.controlPoints = new Map();
        this.controlPointEntities = [];
        this.controlPointCount = 3; // A, B, C points
        
        // Team scores
        this.teamScores = new Map();
        this.teamScores.set('team1', 0);
        this.teamScores.set('team2', 0);
        
        // Game state
        this.gameStarted = false;
        this.gameEnded = false;
        this.matchDuration = 0;
        this.lastTickTime = 0;
        
        // Player tracking
        this.playersOnPoints = new Map(); // pointId -> Set of players
        this.captureProgress = new Map(); // pointId -> capture progress
        
        this.initializeGameMode();
    }

    initializeGameMode() {
        this.createControlPoints();
        this.setupEventListeners();
        this.setupGameUI();
        this.startGameLoop();
    }

    createControlPoints() {
        const pointPositions = [
            { name: 'A', position: new pc.Vec3(-50, 0, 0), color: '#ff4444' },
            { name: 'B', position: new pc.Vec3(0, 0, 50), color: '#44ff44' },
            { name: 'C', position: new pc.Vec3(50, 0, 0), color: '#4444ff' }
        ];
        
        pointPositions.forEach((pointData, index) => {
            const controlPoint = this.createControlPoint(
                `point_${pointData.name.toLowerCase()}`,
                pointData.name,
                pointData.position,
                pointData.color
            );
            
            this.controlPoints.set(controlPoint.id, controlPoint);
            this.playersOnPoints.set(controlPoint.id, new Set());
            this.captureProgress.set(controlPoint.id, 0);
        });
    }

    createControlPoint(id, name, position, color) {
        // Create control point entity
        const entity = new pc.Entity(`controlPoint_${id}`);
        entity.addComponent('model', {
            type: 'cylinder'
        });
        
        // Position and scale
        entity.setPosition(position);
        entity.setLocalScale(8, 1, 8);
        
        // Add trigger for detection
        entity.addComponent('rigidbody', {
            type: 'kinematic'
        });
        
        entity.addComponent('collision', {
            type: 'cylinder',
            radius: 8,
            height: 1
        });
        
        // Visual indicator
        const indicator = new pc.Entity(`indicator_${id}`);
        indicator.addComponent('model', {
            type: 'cylinder'
        });
        indicator.setPosition(position.x, position.y + 5, position.z);
        indicator.setLocalScale(2, 8, 2);
        
        // Add to scene
        this.app.root.addChild(entity);
        this.app.root.addChild(indicator);
        this.controlPointEntities.push(entity);
        this.controlPointEntities.push(indicator);
        
        const controlPoint = {
            id: id,
            name: name,
            entity: entity,
            indicator: indicator,
            position: position.clone(),
            controllingTeam: null,
            captureRadius: 8.0,
            contested: false,
            locked: false,
            captureStartTime: 0,
            lastCaptureTeam: null,
            color: color
        };
        
        // Setup collision detection
        this.setupPointCollision(controlPoint);
        
        return controlPoint;
    }

    setupPointCollision(controlPoint) {
        controlPoint.entity.collision.on('triggerenter', (other) => {
            const player = other.entity;
            if (player.script && player.script.playerController) {
                this.playerEnteredPoint(player, controlPoint.id);
            }
        });
        
        controlPoint.entity.collision.on('triggerleave', (other) => {
            const player = other.entity;
            if (player.script && player.script.playerController) {
                this.playerLeftPoint(player, controlPoint.id);
            }
        });
    }

    setupEventListeners() {
        // Player events
        this.app.on('player:spawned', (player) => {
            this.onPlayerSpawned(player);
        });
        
        this.app.on('player:died', (data) => {
            this.onPlayerDied(data.player, data.killer);
        });
        
        // Game events
        this.app.on('game:start', () => {
            this.startGame();
        });
        
        this.app.on('game:end', () => {
            this.endGame();
        });
        
        // Team events
        this.app.on('team:scoreChanged', (data) => {
            this.updateTeamScore(data.team, data.score);
        });
    }

    setupGameUI() {
        // Control point indicators on HUD
        this.controlPoints.forEach((point, pointId) => {
            this.createPointIndicator(point);
        });
        
        // Score display
        this.updateScoreDisplay();
    }

    createPointIndicator(point) {
        if (!this.hudManager) return;
        
        const indicator = {
            id: point.id,
            name: point.name,
            position: point.position,
            status: 'neutral',
            captureProgress: 0
        };
        
        this.hudManager.addControlPointIndicator(indicator);
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
        
        // Update control points
        this.updateControlPoints(currentTime);
        
        // Award points
        if (currentTime - this.lastTickTime >= this.pointTickRate) {
            this.awardPoints();
            this.lastTickTime = currentTime;
        }
        
        // Check win conditions
        this.checkWinConditions();
        
        // Update UI
        this.updateGameUI();
        
        // Continue loop
        setTimeout(() => this.gameLoop(), 100);
    }

    playerEnteredPoint(player, pointId) {
        const playersOnPoint = this.playersOnPoints.get(pointId);
        if (playersOnPoint) {
            playersOnPoint.add(player.networkId);
            
            // Fire event
            this.app.fire('domination:playerEnteredPoint', {
                player: player,
                pointId: pointId
            });
        }
    }

    playerLeftPoint(player, pointId) {
        const playersOnPoint = this.playersOnPoints.get(pointId);
        if (playersOnPoint) {
            playersOnPoint.delete(player.networkId);
            
            // Fire event
            this.app.fire('domination:playerLeftPoint', {
                player: player,
                pointId: pointId
            });
        }
    }

    updateControlPoints(currentTime) {
        this.controlPoints.forEach((point, pointId) => {
            this.updateControlPoint(point, currentTime);
        });
    }

    updateControlPoint(point, currentTime) {
        const playersOnPoint = this.playersOnPoints.get(point.id);
        if (!playersOnPoint || playersOnPoint.size === 0) {
            // No players on point - stop capture progress
            this.captureProgress.set(point.id, 0);
            point.contested = false;
            return;
        }
        
        // Count players by team
        const teamCounts = this.countPlayersByTeam(playersOnPoint);
        const team1Count = teamCounts.team1 || 0;
        const team2Count = teamCounts.team2 || 0;
        
        // Determine point status
        if (team1Count > 0 && team2Count > 0) {
            // Contested - no progress
            point.contested = true;
            this.captureProgress.set(point.id, 0);
            point.captureStartTime = 0;
            
            this.playContestedSound(point);
        } else if (team1Count > 0) {
            // Team 1 capturing
            this.handleTeamCapture(point, 'team1', team1Count, currentTime);
        } else if (team2Count > 0) {
            // Team 2 capturing
            this.handleTeamCapture(point, 'team2', team2Count, currentTime);
        }
        
        // Update visual state
        this.updatePointVisuals(point);
    }

    countPlayersByTeam(playerIds) {
        const counts = {};
        
        playerIds.forEach(playerId => {
            const player = this.gameManager.getPlayerById(playerId);
            if (player && player.team) {
                counts[player.team] = (counts[player.team] || 0) + 1;
            }
        });
        
        return counts;
    }

    handleTeamCapture(point, capturingTeam, playerCount, currentTime) {
        point.contested = false;
        
        // If different team is capturing, reset progress
        if (point.lastCaptureTeam !== capturingTeam) {
            this.captureProgress.set(point.id, 0);
            point.captureStartTime = currentTime;
            point.lastCaptureTeam = capturingTeam;
        }
        
        // Start capture if not started
        if (point.captureStartTime === 0) {
            point.captureStartTime = currentTime;
        }
        
        // Calculate capture progress (more players = faster capture)
        const captureMultiplier = Math.min(playerCount, 3); // Max 3x speed
        const elapsedTime = currentTime - point.captureStartTime;
        const adjustedCaptureTime = this.captureTime / captureMultiplier;
        const progress = Math.min(elapsedTime / adjustedCaptureTime, 1.0);
        
        this.captureProgress.set(point.id, progress);
        
        // Check if captured
        if (progress >= 1.0 && point.controllingTeam !== capturingTeam) {
            this.capturePoint(point, capturingTeam);
        }
    }

    capturePoint(point, capturingTeam) {
        const previousTeam = point.controllingTeam;
        point.controllingTeam = capturingTeam;
        point.captureStartTime = 0;
        this.captureProgress.set(point.id, 1.0);
        
        // Play capture sound
        this.playPointCapturedSound(point, capturingTeam);
        
        // Award capture bonus points
        this.awardCaptureBonus(capturingTeam);
        
        // Fire events
        this.app.fire('domination:pointCaptured', {
            point: point,
            capturingTeam: capturingTeam,
            previousTeam: previousTeam
        });
        
        // Update UI
        this.updatePointCaptureUI(point);
        
        console.log(`Point ${point.name} captured by ${capturingTeam}`);
    }

    awardPoints() {
        let team1Points = 0;
        let team2Points = 0;
        
        this.controlPoints.forEach((point) => {
            if (point.controllingTeam === 'team1') {
                team1Points += this.pointsPerTick;
            } else if (point.controllingTeam === 'team2') {
                team2Points += this.pointsPerTick;
            }
        });
        
        // Award points to teams
        if (team1Points > 0) {
            this.addTeamScore('team1', team1Points);
        }
        if (team2Points > 0) {
            this.addTeamScore('team2', team2Points);
        }
    }

    awardCaptureBonus(team) {
        const bonusPoints = 25; // Bonus for capturing a point
        this.addTeamScore(team, bonusPoints);
        
        // Notify players
        this.app.fire('domination:captureBonus', {
            team: team,
            points: bonusPoints
        });
    }

    addTeamScore(team, points) {
        const currentScore = this.teamScores.get(team) || 0;
        const newScore = currentScore + points;
        this.teamScores.set(team, newScore);
        
        this.app.fire('domination:scoreUpdated', {
            team: team,
            score: newScore,
            points: points
        });
        
        this.updateScoreDisplay();
    }

    checkWinConditions() {
        this.teamScores.forEach((score, team) => {
            if (score >= this.maxScore) {
                this.endGame(team);
            }
        });
    }

    updatePointVisuals(point) {
        if (!point.indicator) return;
        
        // Update color based on controlling team and contest status
        let color = new pc.Color(0.5, 0.5, 0.5); // Neutral gray
        
        if (point.contested) {
            color = new pc.Color(1, 1, 0); // Yellow for contested
        } else if (point.controllingTeam === 'team1') {
            color = new pc.Color(0, 0, 1); // Blue for team 1
        } else if (point.controllingTeam === 'team2') {
            color = new pc.Color(1, 0, 0); // Red for team 2
        }
        
        // Apply capture progress as intensity
        const progress = this.captureProgress.get(point.id) || 0;
        if (progress > 0 && progress < 1) {
            const intensity = 0.3 + (progress * 0.7);
            color.r *= intensity;
            color.g *= intensity;
            color.b *= intensity;
        }
        
        // Update material color
        if (point.indicator.model && point.indicator.model.material) {
            point.indicator.model.material.diffuse = color;
            point.indicator.model.material.update();
        }
    }

    updateGameUI() {
        // Update control point indicators
        this.controlPoints.forEach((point) => {
            if (this.hudManager) {
                this.hudManager.updateControlPointIndicator(point.id, {
                    status: point.controllingTeam || 'neutral',
                    contested: point.contested,
                    captureProgress: this.captureProgress.get(point.id) || 0
                });
            }
        });
    }

    updateScoreDisplay() {
        if (this.hudManager) {
            this.hudManager.updateTeamScores({
                team1: this.teamScores.get('team1'),
                team2: this.teamScores.get('team2'),
                maxScore: this.maxScore
            });
        }
    }

    updatePointCaptureUI(point) {
        if (this.hudManager) {
            this.hudManager.showCaptureNotification({
                pointName: point.name,
                capturingTeam: point.controllingTeam
            });
        }
    }

    playPointCapturedSound(point, team) {
        if (this.audioManager) {
            this.audioManager.playSound('point_captured.wav', {
                volume: 0.8,
                category: 'game'
            });
            
            // Play team-specific announcement
            const teamSound = team === 'team1' ? 'friendly_captured.wav' : 'enemy_captured.wav';
            this.audioManager.playSound(teamSound, {
                volume: 0.6,
                category: 'announcer'
            });
        }
    }

    playContestedSound(point) {
        if (this.audioManager && !point.contestedSoundPlaying) {
            point.contestedSoundPlaying = true;
            this.audioManager.playSound('point_contested.wav', {
                volume: 0.6,
                category: 'game'
            });
            
            // Reset flag after sound duration
            setTimeout(() => {
                point.contestedSoundPlaying = false;
            }, 2000);
        }
    }

    startGame() {
        this.gameStarted = true;
        this.gameEnded = false;
        this.matchDuration = 0;
        this.lastTickTime = Date.now();
        
        // Reset all points to neutral
        this.controlPoints.forEach((point) => {
            point.controllingTeam = null;
            point.contested = false;
            this.captureProgress.set(point.id, 0);
        });
        
        // Reset scores
        this.teamScores.set('team1', 0);
        this.teamScores.set('team2', 0);
        
        this.app.fire('domination:gameStarted');
        console.log('Domination game started');
    }

    endGame(winningTeam = null) {
        if (this.gameEnded) return;
        
        this.gameEnded = true;
        this.gameStarted = false;
        
        // Determine winner if not specified
        if (!winningTeam) {
            const team1Score = this.teamScores.get('team1');
            const team2Score = this.teamScores.get('team2');
            
            if (team1Score > team2Score) {
                winningTeam = 'team1';
            } else if (team2Score > team1Score) {
                winningTeam = 'team2';
            } else {
                winningTeam = 'draw';
            }
        }
        
        // Fire game end event
        this.app.fire('domination:gameEnded', {
            winner: winningTeam,
            finalScores: {
                team1: this.teamScores.get('team1'),
                team2: this.teamScores.get('team2')
            },
            duration: this.matchDuration
        });
        
        console.log(`Domination game ended. Winner: ${winningTeam}`);
    }

    onPlayerSpawned(player) {
        // Update player count for UI
        this.updateGameUI();
    }

    onPlayerDied(player, killer) {
        // Remove player from all control points
        this.playersOnPoints.forEach((playersSet, pointId) => {
            playersSet.delete(player.networkId);
        });
    }

    // Public API
    getGameState() {
        return {
            gameMode: this.gameMode,
            started: this.gameStarted,
            ended: this.gameEnded,
            scores: Object.fromEntries(this.teamScores),
            maxScore: this.maxScore,
            controlPoints: Array.from(this.controlPoints.values()).map(point => ({
                id: point.id,
                name: point.name,
                controllingTeam: point.controllingTeam,
                contested: point.contested,
                captureProgress: this.captureProgress.get(point.id)
            }))
        };
    }

    getControlledPoints(team) {
        return Array.from(this.controlPoints.values())
            .filter(point => point.controllingTeam === team);
    }

    getTeamScore(team) {
        return this.teamScores.get(team) || 0;
    }

    getWinningTeam() {
        const team1Score = this.teamScores.get('team1');
        const team2Score = this.teamScores.get('team2');
        
        if (team1Score > team2Score) return 'team1';
        if (team2Score > team1Score) return 'team2';
        return 'tied';
    }

    // Settings
    setMaxScore(score) {
        this.maxScore = score;
    }

    setCaptureTime(time) {
        this.captureTime = time;
    }

    setPointTickRate(rate) {
        this.pointTickRate = rate;
    }

    destroy() {
        // Clean up control point entities
        this.controlPointEntities.forEach(entity => {
            if (entity.parent) {
                entity.parent.removeChild(entity);
            }
            entity.destroy();
        });
    }
}

pc.registerScript(Domination, 'Domination');
