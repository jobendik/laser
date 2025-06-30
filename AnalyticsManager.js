/**
 * AnalyticsManager.js
 * Player behavior tracking, performance metrics, and engagement analysis system
 * Handles A/B testing framework and monetization tracking
 */

class AnalyticsManager extends pc.ScriptType {
    static get scriptName() { return 'AnalyticsManager'; }

    initialize() {
        this.gameManager = this.app.root.findByName('Game_Manager').script.gameManager;
        this.networkManager = this.app.root.findByName('Game_Manager').script.networkManager;
        this.performanceManager = this.app.root.findByName('Game_Manager').script.performanceManager;
        
        // Analytics configuration
        this.sessionId = this.generateSessionId();
        this.playerId = this.getUserId();
        this.sessionStartTime = Date.now();
        
        // Data storage
        this.playerBehaviorData = [];
        this.performanceMetrics = [];
        this.engagementEvents = [];
        this.gameplayStats = new Map();
        this.abTestGroups = new Map();
        this.monetizationEvents = [];
        
        // Event tracking flags
        this.trackMovement = true;
        this.trackCombat = true;
        this.trackSocial = true;
        this.trackPerformance = true;
        this.trackEngagement = true;
        
        // Batch processing settings
        this.maxBatchSize = 100;
        this.batchInterval = 30000; // 30 seconds
        this.lastBatchTime = Date.now();
        
        this.initializeAnalytics();
    }

    initializeAnalytics() {
        // Set up event listeners
        this.setupEventListeners();
        
        // Initialize A/B testing
        this.initializeABTesting();
        
        // Start data collection loops
        this.startAnalyticsLoop();
        
        // Track session start
        this.trackSessionStart();
        
        console.log('Analytics Manager initialized for session:', this.sessionId);
    }

    setupEventListeners() {
        // Listen for game events
        this.app.on('player:spawn', this.onPlayerSpawn, this);
        this.app.on('player:death', this.onPlayerDeath, this);
        this.app.on('player:kill', this.onPlayerKill, this);
        this.app.on('weapon:fire', this.onWeaponFire, this);
        this.app.on('weapon:reload', this.onWeaponReload, this);
        this.app.on('item:pickup', this.onItemPickup, this);
        this.app.on('game:start', this.onGameStart, this);
        this.app.on('game:end', this.onGameEnd, this);
        this.app.on('menu:navigate', this.onMenuNavigation, this);
        this.app.on('settings:change', this.onSettingsChange, this);
        this.app.on('purchase:complete', this.onPurchaseComplete, this);
        this.app.on('achievement:unlock', this.onAchievementUnlock, this);
    }

    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    getUserId() {
        // Get or generate user ID
        let userId = localStorage.getItem('user_id');
        if (!userId) {
            userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('user_id', userId);
        }
        return userId;
    }

    // A/B Testing Framework
    initializeABTesting() {
        this.abTests = [
            {
                name: 'weapon_balance_test',
                groups: ['control', 'increased_damage', 'decreased_recoil'],
                weights: [0.33, 0.33, 0.34]
            },
            {
                name: 'ui_layout_test',
                groups: ['classic', 'modern', 'minimal'],
                weights: [0.4, 0.3, 0.3]
            },
            {
                name: 'matchmaking_algorithm',
                groups: ['skill_based', 'connection_based', 'hybrid'],
                weights: [0.5, 0.25, 0.25]
            }
        ];

        // Assign user to test groups
        this.abTests.forEach(test => {
            const group = this.assignToABTestGroup(test);
            this.abTestGroups.set(test.name, group);
            this.trackABTestAssignment(test.name, group);
        });
    }

    assignToABTestGroup(test) {
        const hash = this.hashString(this.playerId + test.name);
        const normalized = (hash % 10000) / 10000; // 0-1 range
        
        let cumulative = 0;
        for (let i = 0; i < test.groups.length; i++) {
            cumulative += test.weights[i];
            if (normalized <= cumulative) {
                return test.groups[i];
            }
        }
        return test.groups[test.groups.length - 1];
    }

    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }

    getABTestGroup(testName) {
        return this.abTestGroups.get(testName) || 'control';
    }

    // Event Tracking Methods
    onPlayerSpawn(player) {
        this.trackEvent('player_spawn', {
            playerId: player.networkId,
            position: player.getPosition().clone(),
            loadout: this.getPlayerLoadout(player),
            spawnTime: Date.now() - this.sessionStartTime
        });
    }

    onPlayerDeath(victim, killer, weapon) {
        this.trackEvent('player_death', {
            victimId: victim.networkId,
            killerId: killer?.networkId,
            weapon: weapon,
            position: victim.getPosition().clone(),
            survivalTime: this.getPlayerSurvivalTime(victim),
            gameTime: Date.now() - this.sessionStartTime
        });

        this.updatePlayerStats(victim.networkId, 'deaths', 1);
    }

    onPlayerKill(killer, victim, weapon) {
        this.trackEvent('player_kill', {
            killerId: killer.networkId,
            victimId: victim.networkId,
            weapon: weapon,
            distance: killer.getPosition().distance(victim.getPosition()),
            headshot: this.wasHeadshot(killer, victim),
            gameTime: Date.now() - this.sessionStartTime
        });

        this.updatePlayerStats(killer.networkId, 'kills', 1);
        this.updatePlayerStats(killer.networkId, 'accuracy', this.calculateAccuracy(killer));
    }

    onWeaponFire(player, weapon) {
        if (this.trackCombat) {
            this.trackEvent('weapon_fire', {
                playerId: player.networkId,
                weapon: weapon.name,
                ammo: weapon.currentAmmo,
                accuracy: this.calculateRecentAccuracy(player),
                target: this.getTargetInfo(player)
            });

            this.updatePlayerStats(player.networkId, 'shots_fired', 1);
        }
    }

    onWeaponReload(player, weapon) {
        this.trackEvent('weapon_reload', {
            playerId: player.networkId,
            weapon: weapon.name,
            ammoWasted: weapon.magSize - weapon.currentAmmo,
            reloadTime: weapon.reloadTime
        });
    }

    onItemPickup(player, item) {
        this.trackEvent('item_pickup', {
            playerId: player.networkId,
            itemType: item.type,
            itemName: item.name,
            position: item.getPosition().clone(),
            playerHealth: player.script.healthSystem.getCurrentHealth()
        });
    }

    onGameStart(gameMode, mapName) {
        this.trackEvent('game_start', {
            gameMode: gameMode,
            mapName: mapName,
            playerCount: this.gameManager.getPlayerCount(),
            abTestGroups: Object.fromEntries(this.abTestGroups)
        });
    }

    onGameEnd(winner, gameStats) {
        const sessionDuration = Date.now() - this.sessionStartTime;
        
        this.trackEvent('game_end', {
            winner: winner,
            duration: sessionDuration,
            playerStats: this.getSessionPlayerStats(),
            gameStats: gameStats,
            performance: this.getSessionPerformanceStats()
        });

        this.trackEngagementMetrics(sessionDuration);
    }

    onMenuNavigation(fromMenu, toMenu, duration) {
        this.trackEvent('menu_navigation', {
            from: fromMenu,
            to: toMenu,
            duration: duration,
            timestamp: Date.now()
        });
    }

    onSettingsChange(setting, oldValue, newValue) {
        this.trackEvent('settings_change', {
            setting: setting,
            oldValue: oldValue,
            newValue: newValue,
            abTestGroup: this.getABTestGroup('ui_layout_test')
        });
    }

    onPurchaseComplete(item, price, currency) {
        this.trackMonetizationEvent('purchase_complete', {
            item: item,
            price: price,
            currency: currency,
            playerLevel: this.getPlayerLevel(),
            sessionTime: Date.now() - this.sessionStartTime
        });
    }

    onAchievementUnlock(achievement, player) {
        this.trackEvent('achievement_unlock', {
            achievement: achievement,
            playerId: player.networkId,
            playerLevel: this.getPlayerLevel(),
            sessionTime: Date.now() - this.sessionStartTime
        });

        this.trackEngagementEvent('achievement', achievement);
    }

    // Performance Analytics
    startAnalyticsLoop() {
        this.collectPerformanceMetrics();
        this.processBatchedData();
        
        setTimeout(() => this.startAnalyticsLoop(), 1000); // Every second
    }

    collectPerformanceMetrics() {
        if (!this.trackPerformance) return;

        const metrics = {
            timestamp: Date.now(),
            fps: this.performanceManager?.getFPS() || 0,
            memory: this.getMemoryUsage(),
            ping: this.networkManager?.getPing() || 0,
            packetLoss: this.networkManager?.getPacketLoss() || 0,
            playerCount: this.gameManager?.getPlayerCount() || 0,
            particleCount: this.getParticleCount(),
            drawCalls: this.getDrawCalls()
        };

        this.performanceMetrics.push(metrics);

        // Keep only last 1000 metrics (about 16 minutes)
        if (this.performanceMetrics.length > 1000) {
            this.performanceMetrics.shift();
        }
    }

    getMemoryUsage() {
        if (performance.memory) {
            return {
                used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize,
                limit: performance.memory.jsHeapSizeLimit
            };
        }
        return { used: 0, total: 0, limit: 0 };
    }

    getParticleCount() {
        const particleManager = this.app.root.findByName('Effects_Container')?.script?.particleManager;
        return particleManager?.getActiveParticleCount() || 0;
    }

    getDrawCalls() {
        return this.app.stats?.drawCalls || 0;
    }

    // Engagement Analytics
    trackEngagementEvent(type, data) {
        this.engagementEvents.push({
            type: type,
            data: data,
            timestamp: Date.now(),
            sessionTime: Date.now() - this.sessionStartTime
        });
    }

    trackEngagementMetrics(sessionDuration) {
        const engagement = {
            sessionDuration: sessionDuration,
            gameRounds: this.getSessionGameRounds(),
            menuTime: this.getSessionMenuTime(),
            gameplayTime: this.getSessionGameplayTime(),
            averageFPS: this.getAverageSessionFPS(),
            disconnections: this.getSessionDisconnections(),
            achievements: this.getSessionAchievements()
        };

        this.trackEvent('session_engagement', engagement);
    }

    // Monetization Analytics
    trackMonetizationEvent(type, data) {
        this.monetizationEvents.push({
            type: type,
            data: data,
            timestamp: Date.now(),
            sessionTime: Date.now() - this.sessionStartTime,
            abTestGroups: Object.fromEntries(this.abTestGroups)
        });
    }

    // Helper Methods
    trackEvent(eventType, data) {
        const event = {
            type: eventType,
            data: data,
            timestamp: Date.now(),
            sessionId: this.sessionId,
            playerId: this.playerId,
            abTestGroups: Object.fromEntries(this.abTestGroups)
        };

        this.playerBehaviorData.push(event);
    }

    trackABTestAssignment(testName, group) {
        this.trackEvent('ab_test_assignment', {
            testName: testName,
            group: group
        });
    }

    trackSessionStart() {
        this.trackEvent('session_start', {
            platform: navigator.platform,
            userAgent: navigator.userAgent,
            resolution: { width: screen.width, height: screen.height },
            language: navigator.language,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        });
    }

    processBatchedData() {
        if (Date.now() - this.lastBatchTime < this.batchInterval) return;

        if (this.playerBehaviorData.length >= this.maxBatchSize || 
            Date.now() - this.lastBatchTime >= this.batchInterval) {
            
            this.sendAnalyticsData();
            this.lastBatchTime = Date.now();
        }
    }

    sendAnalyticsData() {
        const batch = {
            sessionId: this.sessionId,
            playerId: this.playerId,
            timestamp: Date.now(),
            behaviorData: [...this.playerBehaviorData],
            performanceData: this.getPerformanceSummary(),
            engagementData: [...this.engagementEvents],
            monetizationData: [...this.monetizationEvents]
        };

        // Send to analytics service
        if (this.networkManager && this.networkManager.isConnected()) {
            this.networkManager.sendAnalyticsData(batch);
        }

        // Store locally as backup
        this.storeAnalyticsLocally(batch);

        // Clear sent data
        this.playerBehaviorData = [];
        this.engagementEvents = [];
        this.monetizationEvents = [];
    }

    storeAnalyticsLocally(batch) {
        try {
            const stored = JSON.parse(localStorage.getItem('analytics_data') || '[]');
            stored.push(batch);
            
            // Keep only last 10 batches locally
            if (stored.length > 10) {
                stored.shift();
            }
            
            localStorage.setItem('analytics_data', JSON.stringify(stored));
        } catch (e) {
            console.warn('Failed to store analytics data locally:', e);
        }
    }

    getPerformanceSummary() {
        if (this.performanceMetrics.length === 0) return {};

        const recent = this.performanceMetrics.slice(-60); // Last minute
        return {
            avgFPS: recent.reduce((sum, m) => sum + m.fps, 0) / recent.length,
            minFPS: Math.min(...recent.map(m => m.fps)),
            maxFPS: Math.max(...recent.map(m => m.fps)),
            avgPing: recent.reduce((sum, m) => sum + m.ping, 0) / recent.length,
            avgMemory: recent.reduce((sum, m) => sum + m.memory.used, 0) / recent.length
        };
    }

    // Public API
    getSessionStats() {
        return {
            sessionId: this.sessionId,
            duration: Date.now() - this.sessionStartTime,
            eventsTracked: this.playerBehaviorData.length,
            abTestGroups: Object.fromEntries(this.abTestGroups),
            performance: this.getPerformanceSummary()
        };
    }

    setTrackingFlags(flags) {
        Object.assign(this, flags);
    }

    exportAnalyticsData() {
        return {
            session: this.getSessionStats(),
            behavior: this.playerBehaviorData,
            performance: this.performanceMetrics,
            engagement: this.engagementEvents,
            monetization: this.monetizationEvents
        };
    }

    // Utility methods for stats calculation
    updatePlayerStats(playerId, stat, value) {
        if (!this.gameplayStats.has(playerId)) {
            this.gameplayStats.set(playerId, {});
        }
        const stats = this.gameplayStats.get(playerId);
        stats[stat] = (stats[stat] || 0) + value;
    }

    getPlayerLoadout(player) {
        const weaponManager = player.script.weaponManager;
        return weaponManager ? weaponManager.getCurrentLoadout() : {};
    }

    getPlayerSurvivalTime(player) {
        return player.lastSpawnTime ? Date.now() - player.lastSpawnTime : 0;
    }

    wasHeadshot(killer, victim) {
        // Implementation would check hit location
        return Math.random() < 0.15; // Placeholder
    }

    calculateAccuracy(player) {
        const stats = this.gameplayStats.get(player.networkId) || {};
        const hits = stats.hits || 0;
        const shots = stats.shots_fired || 0;
        return shots > 0 ? hits / shots : 0;
    }

    calculateRecentAccuracy(player) {
        // Calculate accuracy from recent events
        const recentEvents = this.playerBehaviorData
            .filter(e => e.data.playerId === player.networkId && 
                   (e.type === 'weapon_fire' || e.type === 'player_hit'))
            .slice(-20); // Last 20 events
        
        const shots = recentEvents.filter(e => e.type === 'weapon_fire').length;
        const hits = recentEvents.filter(e => e.type === 'player_hit').length;
        
        return shots > 0 ? hits / shots : 0;
    }

    getTargetInfo(player) {
        // Get information about what the player is aiming at
        const camera = player.script.playerCamera;
        if (!camera) return null;

        // Raycast to find target
        const from = camera.entity.getPosition();
        const to = from.clone().add(camera.entity.forward.clone().scale(100));
        
        const result = this.app.systems.rigidbody.raycastFirst(from, to);
        if (result && result.entity.script?.healthSystem) {
            return {
                type: 'player',
                distance: from.distance(result.point),
                entityId: result.entity.networkId
            };
        }
        
        return { type: 'environment', distance: result ? from.distance(result.point) : 100 };
    }

    getSessionPlayerStats() {
        return Object.fromEntries(this.gameplayStats);
    }

    getSessionPerformanceStats() {
        return this.getPerformanceSummary();
    }

    getSessionGameRounds() {
        return this.playerBehaviorData.filter(e => e.type === 'game_start').length;
    }

    getSessionMenuTime() {
        // Calculate time spent in menus
        return this.engagementEvents
            .filter(e => e.type === 'menu_navigation')
            .reduce((total, e) => total + (e.data.duration || 0), 0);
    }

    getSessionGameplayTime() {
        // Calculate time spent in actual gameplay
        const gameEvents = this.playerBehaviorData.filter(e => 
            ['game_start', 'game_end'].includes(e.type)
        );
        
        let totalGameTime = 0;
        for (let i = 0; i < gameEvents.length - 1; i += 2) {
            if (gameEvents[i].type === 'game_start' && gameEvents[i + 1].type === 'game_end') {
                totalGameTime += gameEvents[i + 1].timestamp - gameEvents[i].timestamp;
            }
        }
        return totalGameTime;
    }

    getAverageSessionFPS() {
        if (this.performanceMetrics.length === 0) return 0;
        return this.performanceMetrics.reduce((sum, m) => sum + m.fps, 0) / this.performanceMetrics.length;
    }

    getSessionDisconnections() {
        return this.playerBehaviorData.filter(e => e.type === 'disconnection').length;
    }

    getSessionAchievements() {
        return this.playerBehaviorData.filter(e => e.type === 'achievement_unlock').length;
    }

    getPlayerLevel() {
        // Implementation would get actual player level
        return parseInt(localStorage.getItem('player_level') || '1');
    }
}

pc.registerScript(AnalyticsManager, 'AnalyticsManager');
