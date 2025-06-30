/**
 * AIDirector.js
 * Dynamic difficulty adjustment and AI coordination system
 * Manages encounter spawning, pacing control, player performance analysis, and adaptive challenge scaling
 */

class AIDirector extends pc.ScriptType {
    static get scriptName() { return 'AIDirector'; }

    initialize() {
        this.gameManager = this.app.root.findByName('Game_Manager').script.gameManager;
        this.networkManager = this.app.root.findByName('Game_Manager').script.networkManager;
        this.spawnManager = this.app.root.findByName('Game_Manager').script.spawnManager;
        this.audioManager = this.app.root.findByName('Game_Manager').script.audioManager;
        
        // Difficulty Management
        this.globalDifficulty = 'medium';
        this.adaptiveDifficulty = true;
        this.difficultyScaling = 1.0;
        this.difficultyHistory = [];
        
        // Player Performance Tracking
        this.playerMetrics = new Map();
        this.teamMetrics = new Map();
        this.performanceWindow = 60; // seconds
        this.analysisInterval = 10; // seconds
        
        // Encounter Management
        this.activeEncounters = new Map();
        this.encounterQueue = [];
        this.maxActiveEncounters = 3;
        this.encounterCooldown = 15; // seconds
        this.lastEncounterTime = 0;
        
        // Pacing Control
        this.pacingState = 'building';
        this.tensionLevel = 0.5;
        this.targetTension = 0.5;
        this.pacingTimer = 0;
        this.pacingPhases = ['rest', 'building', 'action', 'climax'];
        this.currentPhaseIndex = 1;
        
        // AI Coordination
        this.aiSquads = new Map();
        this.squadFormations = new Map();
        this.globalAIDirectives = [];
        this.squadCommunication = new Map();
        
        // Adaptive Systems
        this.adaptiveSettings = {
            reactionTimeMultiplier: 1.0,
            accuracyMultiplier: 1.0,
            aggressionMultiplier: 1.0,
            spawnRateMultiplier: 1.0,
            healthMultiplier: 1.0
        };
        
        this.initializeDirector();
        this.setupEventListeners();
    }

    initializeDirector() {
        this.loadDifficultyProfiles();
        this.setupPerformanceTracking();
        this.setupEncounterTypes();
        this.setupPacingSystem();
        this.startAnalysisLoop();
    }

    loadDifficultyProfiles() {
        this.difficultyProfiles = {
            easy: {
                reactionTime: 0.8,
                accuracy: 0.4,
                aggression: 0.3,
                spawnRate: 0.6,
                health: 0.8,
                description: 'Relaxed gameplay'
            },
            medium: {
                reactionTime: 0.3,
                accuracy: 0.7,
                aggression: 0.5,
                spawnRate: 1.0,
                health: 1.0,
                description: 'Balanced challenge'
            },
            hard: {
                reactionTime: 0.15,
                accuracy: 0.85,
                aggression: 0.8,
                spawnRate: 1.3,
                health: 1.2,
                description: 'Intense combat'
            },
            expert: {
                reactionTime: 0.1,
                accuracy: 0.95,
                aggression: 1.0,
                spawnRate: 1.5,
                health: 1.5,
                description: 'Maximum challenge'
            }
        };
    }

    setupPerformanceTracking() {
        this.performanceMetrics = {
            kills: 0,
            deaths: 0,
            accuracy: 0,
            survival_time: 0,
            objective_completion: 0,
            teamwork_score: 0,
            damage_taken: 0,
            damage_dealt: 0
        };
        
        this.teamPerformanceMetrics = {
            team_kills: 0,
            team_deaths: 0,
            team_accuracy: 0,
            objectives_completed: 0,
            match_duration: 0,
            coordination_score: 0
        };
    }

    setupEncounterTypes() {
        this.encounterTypes = {
            patrol: {
                aiCount: 2,
                difficulty: 'medium',
                duration: 30,
                description: 'Basic patrol encounter'
            },
            ambush: {
                aiCount: 3,
                difficulty: 'hard',
                duration: 20,
                description: 'Surprise attack'
            },
            reinforcement: {
                aiCount: 4,
                difficulty: 'medium',
                duration: 45,
                description: 'Enemy reinforcements'
            },
            elite_squad: {
                aiCount: 2,
                difficulty: 'expert',
                duration: 60,
                description: 'Elite enemy squad'
            },
            siege: {
                aiCount: 6,
                difficulty: 'hard',
                duration: 90,
                description: 'Large scale assault'
            }
        };
    }

    setupPacingSystem() {
        this.pacingCurve = {
            rest: { duration: 20, tension: 0.2 },
            building: { duration: 30, tension: 0.5 },
            action: { duration: 25, tension: 0.8 },
            climax: { duration: 15, tension: 1.0 }
        };
    }

    setupEventListeners() {
        // Player performance events
        this.app.on('player:kill', this.onPlayerKill.bind(this));
        this.app.on('player:death', this.onPlayerDeath.bind(this));
        this.app.on('player:damage_dealt', this.onPlayerDamageDealt.bind(this));
        this.app.on('player:damage_taken', this.onPlayerDamageTaken.bind(this));
        this.app.on('player:objective_completed', this.onObjectiveCompleted.bind(this));
        
        // Game state events
        this.app.on('game:round_start', this.onRoundStart.bind(this));
        this.app.on('game:round_end', this.onRoundEnd.bind(this));
        this.app.on('game:objective_changed', this.onObjectiveChanged.bind(this));
        
        // AI events
        this.app.on('ai:squad_eliminated', this.onSquadEliminated.bind(this));
        this.app.on('ai:request_reinforcements', this.onReinforcementsRequested.bind(this));
    }

    startAnalysisLoop() {
        this.analysisTimer = setInterval(() => {
            this.analyzePlayerPerformance();
            this.adjustDifficulty();
            this.updatePacing();
            this.manageEncounters();
        }, this.analysisInterval * 1000);
    }

    // Performance Analysis
    analyzePlayerPerformance() {
        const players = this.gameManager?.getActivePlayers() || [];
        
        players.forEach(player => {
            this.updatePlayerMetrics(player);
            this.calculatePlayerSkillLevel(player);
        });
        
        this.updateTeamMetrics();
        this.recordPerformanceSnapshot();
    }

    updatePlayerMetrics(player) {
        const playerId = player.networkId;
        const currentMetrics = this.playerMetrics.get(playerId) || { ...this.performanceMetrics };
        
        // Update metrics from player data
        const playerStats = player.script.playerController?.getStats() || {};
        currentMetrics.kills = playerStats.kills || 0;
        currentMetrics.deaths = playerStats.deaths || 0;
        currentMetrics.accuracy = playerStats.accuracy || 0;
        currentMetrics.survival_time = playerStats.survivalTime || 0;
        currentMetrics.damage_dealt = playerStats.damageDealt || 0;
        currentMetrics.damage_taken = playerStats.damageTaken || 0;
        
        this.playerMetrics.set(playerId, currentMetrics);
    }

    calculatePlayerSkillLevel(player) {
        const playerId = player.networkId;
        const metrics = this.playerMetrics.get(playerId);
        if (!metrics) return 'medium';
        
        let skillScore = 0;
        
        // K/D ratio component
        const kdRatio = metrics.deaths > 0 ? metrics.kills / metrics.deaths : metrics.kills;
        skillScore += Math.min(kdRatio * 25, 100);
        
        // Accuracy component
        skillScore += metrics.accuracy * 50;
        
        // Survival component
        const avgSurvivalTime = 30; // seconds
        const survivalScore = Math.min(metrics.survival_time / avgSurvivalTime, 2) * 25;
        skillScore += survivalScore;
        
        // Determine skill level
        if (skillScore < 50) return 'easy';
        else if (skillScore < 100) return 'medium';
        else if (skillScore < 150) return 'hard';
        else return 'expert';
    }

    updateTeamMetrics() {
        const teams = this.gameManager?.getTeams() || [];
        
        teams.forEach(team => {
            const teamId = team.id;
            const teamPlayers = team.players || [];
            
            let teamMetrics = {
                team_kills: 0,
                team_deaths: 0,
                team_accuracy: 0,
                objectives_completed: 0,
                coordination_score: 0
            };
            
            teamPlayers.forEach(player => {
                const playerMetrics = this.playerMetrics.get(player.networkId) || {};
                teamMetrics.team_kills += playerMetrics.kills || 0;
                teamMetrics.team_deaths += playerMetrics.deaths || 0;
                teamMetrics.team_accuracy += playerMetrics.accuracy || 0;
            });
            
            if (teamPlayers.length > 0) {
                teamMetrics.team_accuracy /= teamPlayers.length;
            }
            
            this.teamMetrics.set(teamId, teamMetrics);
        });
    }

    recordPerformanceSnapshot() {
        const snapshot = {
            timestamp: Date.now(),
            globalDifficulty: this.globalDifficulty,
            difficultyScaling: this.difficultyScaling,
            tensionLevel: this.tensionLevel,
            pacingState: this.pacingState,
            playerMetrics: new Map(this.playerMetrics),
            teamMetrics: new Map(this.teamMetrics)
        };
        
        this.difficultyHistory.push(snapshot);
        
        // Keep only recent history
        if (this.difficultyHistory.length > 100) {
            this.difficultyHistory.shift();
        }
    }

    // Difficulty Adjustment
    adjustDifficulty() {
        if (!this.adaptiveDifficulty) return;
        
        const averagePerformance = this.calculateAveragePerformance();
        const targetPerformance = 0.6; // Target 60% success rate
        const performanceDelta = averagePerformance - targetPerformance;
        
        // Adjust difficulty scaling
        const adjustmentRate = 0.05;
        if (Math.abs(performanceDelta) > 0.1) {
            if (performanceDelta > 0) {
                // Players performing too well, increase difficulty
                this.difficultyScaling = Math.min(2.0, this.difficultyScaling + adjustmentRate);
            } else {
                // Players struggling, decrease difficulty
                this.difficultyScaling = Math.max(0.5, this.difficultyScaling - adjustmentRate);
            }
            
            this.updateAdaptiveSettings();
            this.broadcastDifficultyChange();
        }
    }

    calculateAveragePerformance() {
        const players = Array.from(this.playerMetrics.values());
        if (players.length === 0) return 0.5;
        
        let totalPerformance = 0;
        
        players.forEach(metrics => {
            let performance = 0;
            
            // K/D contribution
            const kdRatio = metrics.deaths > 0 ? metrics.kills / metrics.deaths : metrics.kills;
            performance += Math.min(kdRatio / 2, 0.5); // Max 0.5 from K/D
            
            // Accuracy contribution
            performance += metrics.accuracy * 0.3; // Max 0.3 from accuracy
            
            // Objective contribution
            performance += metrics.objective_completion * 0.2; // Max 0.2 from objectives
            
            totalPerformance += Math.min(performance, 1.0);
        });
        
        return totalPerformance / players.length;
    }

    updateAdaptiveSettings() {
        const profile = this.difficultyProfiles[this.globalDifficulty];
        if (!profile) return;
        
        this.adaptiveSettings.reactionTimeMultiplier = this.difficultyScaling;
        this.adaptiveSettings.accuracyMultiplier = this.difficultyScaling;
        this.adaptiveSettings.aggressionMultiplier = this.difficultyScaling;
        this.adaptiveSettings.spawnRateMultiplier = this.difficultyScaling;
        this.adaptiveSettings.healthMultiplier = this.difficultyScaling;
    }

    broadcastDifficultyChange() {
        this.app.fire('ai_director:difficulty_changed', {
            globalDifficulty: this.globalDifficulty,
            difficultyScaling: this.difficultyScaling,
            adaptiveSettings: this.adaptiveSettings
        });
    }

    // Pacing Control
    updatePacing() {
        this.pacingTimer += this.analysisInterval;
        
        const currentPhase = this.pacingPhases[this.currentPhaseIndex];
        const phaseDuration = this.pacingCurve[currentPhase].duration;
        
        if (this.pacingTimer >= phaseDuration) {
            this.advancePacingPhase();
        }
        
        this.updateTensionLevel();
        this.adjustEncounterSpawning();
    }

    advancePacingPhase() {
        this.currentPhaseIndex = (this.currentPhaseIndex + 1) % this.pacingPhases.length;
        this.pacingState = this.pacingPhases[this.currentPhaseIndex];
        this.pacingTimer = 0;
        
        this.app.fire('ai_director:pacing_changed', {
            phase: this.pacingState,
            tensionLevel: this.targetTension
        });
    }

    updateTensionLevel() {
        const currentPhase = this.pacingPhases[this.currentPhaseIndex];
        this.targetTension = this.pacingCurve[currentPhase].tension;
        
        // Smooth tension transition
        const tensionDelta = this.targetTension - this.tensionLevel;
        this.tensionLevel += tensionDelta * 0.1;
    }

    adjustEncounterSpawning() {
        const encounterRate = this.calculateEncounterRate();
        const timeSinceLastEncounter = Date.now() - this.lastEncounterTime;
        
        if (timeSinceLastEncounter > this.encounterCooldown * 1000 / encounterRate) {
            this.spawnAppropriateEncounter();
        }
    }

    calculateEncounterRate() {
        let baseRate = 1.0;
        
        // Adjust based on pacing
        switch (this.pacingState) {
            case 'rest':
                baseRate = 0.3;
                break;
            case 'building':
                baseRate = 0.7;
                break;
            case 'action':
                baseRate = 1.2;
                break;
            case 'climax':
                baseRate = 1.8;
                break;
        }
        
        // Adjust based on difficulty
        baseRate *= this.difficultyScaling;
        
        // Adjust based on current performance
        const avgPerformance = this.calculateAveragePerformance();
        if (avgPerformance > 0.7) baseRate *= 1.3;
        else if (avgPerformance < 0.4) baseRate *= 0.7;
        
        return baseRate;
    }

    // Encounter Management
    spawnAppropriateEncounter() {
        if (this.activeEncounters.size >= this.maxActiveEncounters) return;
        
        const encounterType = this.selectEncounterType();
        const spawnPosition = this.selectSpawnPosition();
        const difficulty = this.calculateEncounterDifficulty();
        
        if (encounterType && spawnPosition) {
            this.spawnEncounter(encounterType, spawnPosition, difficulty);
        }
    }

    selectEncounterType() {
        const availableTypes = Object.keys(this.encounterTypes);
        const weights = this.calculateEncounterWeights();
        
        return this.weightedRandomSelect(availableTypes, weights);
    }

    calculateEncounterWeights() {
        const weights = {};
        
        Object.keys(this.encounterTypes).forEach(type => {
            let weight = 1.0;
            
            // Adjust based on pacing state
            switch (this.pacingState) {
                case 'rest':
                    if (type === 'patrol') weight = 2.0;
                    else weight = 0.3;
                    break;
                case 'building':
                    if (type === 'patrol' || type === 'reinforcement') weight = 1.5;
                    break;
                case 'action':
                    if (type === 'ambush' || type === 'reinforcement') weight = 1.8;
                    break;
                case 'climax':
                    if (type === 'elite_squad' || type === 'siege') weight = 2.0;
                    break;
            }
            
            weights[type] = weight;
        });
        
        return weights;
    }

    weightedRandomSelect(items, weights) {
        const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
        let random = Math.random() * totalWeight;
        
        for (const item of items) {
            random -= weights[item] || 0;
            if (random <= 0) return item;
        }
        
        return items[0];
    }

    selectSpawnPosition() {
        const spawnPoints = this.app.root.findByTag('ai_spawn');
        const players = this.gameManager?.getActivePlayers() || [];
        
        if (spawnPoints.length === 0 || players.length === 0) return null;
        
        // Find spawn point with appropriate distance from players
        const validSpawns = spawnPoints.filter(spawn => {
            const spawnPos = spawn.getPosition();
            return players.some(player => {
                const playerPos = player.getPosition();
                const distance = spawnPos.distance(playerPos);
                return distance > 30 && distance < 100; // Not too close, not too far
            });
        });
        
        return validSpawns.length > 0 ? 
            validSpawns[Math.floor(Math.random() * validSpawns.length)].getPosition() :
            spawnPoints[0].getPosition();
    }

    calculateEncounterDifficulty() {
        let difficulty = this.globalDifficulty;
        
        // Adjust based on player performance
        const avgPerformance = this.calculateAveragePerformance();
        if (avgPerformance > 0.8) difficulty = 'hard';
        else if (avgPerformance < 0.3) difficulty = 'easy';
        
        return difficulty;
    }

    spawnEncounter(encounterType, position, difficulty) {
        const encounterId = this.generateEncounterId();
        const encounterConfig = this.encounterTypes[encounterType];
        
        const encounter = {
            id: encounterId,
            type: encounterType,
            position: position,
            difficulty: difficulty,
            aiCount: encounterConfig.aiCount,
            spawnTime: Date.now(),
            duration: encounterConfig.duration * 1000,
            aiEntities: []
        };
        
        // Spawn AI entities
        for (let i = 0; i < encounterConfig.aiCount; i++) {
            const ai = this.spawnAI(position, difficulty, encounterId);
            if (ai) encounter.aiEntities.push(ai);
        }
        
        this.activeEncounters.set(encounterId, encounter);
        this.lastEncounterTime = Date.now();
        
        this.app.fire('ai_director:encounter_spawned', encounter);
    }

    spawnAI(position, difficulty, encounterId) {
        if (!this.spawnManager) return null;
        
        const aiConfig = {
            position: position,
            difficulty: difficulty,
            encounterId: encounterId,
            team: 'ai'
        };
        
        return this.spawnManager.spawnAI(aiConfig);
    }

    manageEncounters() {
        const currentTime = Date.now();
        const encountersToRemove = [];
        
        this.activeEncounters.forEach((encounter, encounterId) => {
            const elapsed = currentTime - encounter.spawnTime;
            const allAIDead = encounter.aiEntities.every(ai => 
                !ai || ai.script.healthSystem?.currentHealth <= 0
            );
            
            if (elapsed > encounter.duration || allAIDead) {
                encountersToRemove.push(encounterId);
            }
        });
        
        encountersToRemove.forEach(encounterId => {
            this.cleanupEncounter(encounterId);
        });
    }

    cleanupEncounter(encounterId) {
        const encounter = this.activeEncounters.get(encounterId);
        if (!encounter) return;
        
        // Clean up any remaining AI entities
        encounter.aiEntities.forEach(ai => {
            if (ai && ai.script.healthSystem?.currentHealth > 0) {
                ai.destroy();
            }
        });
        
        this.activeEncounters.delete(encounterId);
        
        this.app.fire('ai_director:encounter_ended', {
            encounterId: encounterId,
            type: encounter.type
        });
    }

    generateEncounterId() {
        return 'encounter_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Squad Coordination
    createAISquad(aiEntities, formation = 'line') {
        const squadId = this.generateSquadId();
        const squad = {
            id: squadId,
            members: aiEntities,
            formation: formation,
            leader: aiEntities[0],
            objective: null,
            communication: []
        };
        
        this.aiSquads.set(squadId, squad);
        
        // Set squad reference in AI entities
        aiEntities.forEach(ai => {
            if (ai.script.aiController) {
                ai.script.aiController.setSquad(aiEntities, 
                    ai === squad.leader ? 'leader' : 'soldier');
            }
        });
        
        return squadId;
    }

    generateSquadId() {
        return 'squad_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    // Event Handlers
    onPlayerKill(data) {
        const playerId = data.player.networkId;
        const metrics = this.playerMetrics.get(playerId) || { ...this.performanceMetrics };
        metrics.kills = (metrics.kills || 0) + 1;
        this.playerMetrics.set(playerId, metrics);
    }

    onPlayerDeath(data) {
        const playerId = data.player.networkId;
        const metrics = this.playerMetrics.get(playerId) || { ...this.performanceMetrics };
        metrics.deaths = (metrics.deaths || 0) + 1;
        this.playerMetrics.set(playerId, metrics);
    }

    onPlayerDamageDealt(data) {
        const playerId = data.player.networkId;
        const metrics = this.playerMetrics.get(playerId) || { ...this.performanceMetrics };
        metrics.damage_dealt = (metrics.damage_dealt || 0) + data.damage;
        this.playerMetrics.set(playerId, metrics);
    }

    onPlayerDamageTaken(data) {
        const playerId = data.player.networkId;
        const metrics = this.playerMetrics.get(playerId) || { ...this.performanceMetrics };
        metrics.damage_taken = (metrics.damage_taken || 0) + data.damage;
        this.playerMetrics.set(playerId, metrics);
    }

    onObjectiveCompleted(data) {
        const playerId = data.player.networkId;
        const metrics = this.playerMetrics.get(playerId) || { ...this.performanceMetrics };
        metrics.objective_completion = (metrics.objective_completion || 0) + 1;
        this.playerMetrics.set(playerId, metrics);
    }

    onRoundStart() {
        this.resetMetrics();
        this.pacingTimer = 0;
        this.currentPhaseIndex = 1; // Start with building phase
        this.tensionLevel = 0.3;
    }

    onRoundEnd() {
        this.cleanupAllEncounters();
        this.recordPerformanceSnapshot();
    }

    onObjectiveChanged(objective) {
        // Update AI squads with new objectives
        this.aiSquads.forEach(squad => {
            squad.objective = objective;
        });
    }

    onSquadEliminated(squad) {
        this.aiSquads.delete(squad.id);
    }

    onReinforcementsRequested(data) {
        // Spawn reinforcement encounter
        this.spawnEncounter('reinforcement', data.position, data.difficulty);
    }

    // Utility Methods
    resetMetrics() {
        this.playerMetrics.clear();
        this.teamMetrics.clear();
    }

    cleanupAllEncounters() {
        this.activeEncounters.forEach((encounter, encounterId) => {
            this.cleanupEncounter(encounterId);
        });
    }

    // Public API
    setGlobalDifficulty(difficulty) {
        if (this.difficultyProfiles[difficulty]) {
            this.globalDifficulty = difficulty;
            this.updateAdaptiveSettings();
            this.broadcastDifficultyChange();
        }
    }

    setAdaptiveDifficulty(enabled) {
        this.adaptiveDifficulty = enabled;
    }

    getDifficultySettings(difficulty = null) {
        const profile = this.difficultyProfiles[difficulty || this.globalDifficulty];
        if (!profile) return {};
        
        return {
            reactionTime: profile.reactionTime * this.adaptiveSettings.reactionTimeMultiplier,
            accuracy: profile.accuracy * this.adaptiveSettings.accuracyMultiplier,
            aggression: profile.aggression * this.adaptiveSettings.aggressionMultiplier,
            spawnRate: profile.spawnRate * this.adaptiveSettings.spawnRateMultiplier,
            health: profile.health * this.adaptiveSettings.healthMultiplier
        };
    }

    getCurrentTensionLevel() {
        return this.tensionLevel;
    }

    getPacingState() {
        return this.pacingState;
    }

    getPerformanceMetrics() {
        return {
            players: new Map(this.playerMetrics),
            teams: new Map(this.teamMetrics),
            global: this.calculateAveragePerformance()
        };
    }

    getActiveEncounters() {
        return new Map(this.activeEncounters);
    }

    update(dt) {
        // Update squad formations and coordination
        this.aiSquads.forEach(squad => {
            this.updateSquadFormation(squad);
            this.updateSquadCommunication(squad);
        });
    }

    updateSquadFormation(squad) {
        // Implement squad formation logic
        if (squad.members.length < 2) return;
        
        const leader = squad.leader;
        if (!leader) return;
        
        const leaderPos = leader.getPosition();
        squad.members.forEach((member, index) => {
            if (member === leader) return;
            
            // Simple line formation
            const offset = new pc.Vec3(index * 3, 0, -2);
            const targetPos = leaderPos.clone().add(offset);
            
            if (member.script.aiPathfinding) {
                member.script.aiPathfinding.setDestination(targetPos);
            }
        });
    }

    updateSquadCommunication(squad) {
        // Handle squad communication and coordination
        squad.members.forEach(member => {
            if (member.script.aiController?.getCurrentState() === 'combat') {
                // Alert other squad members
                squad.members.forEach(ally => {
                    if (ally !== member && ally.script.aiController) {
                        ally.script.aiController.onSquadMemberInCombat(member);
                    }
                });
            }
        });
    }
}

pc.registerScript(AIDirector, 'AIDirector');
