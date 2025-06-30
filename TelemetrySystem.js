/**
 * TelemetrySystem.js
 * Real-time data collection, error reporting, and performance monitoring system
 * Handles user experience metrics and network quality analysis
 */

class TelemetrySystem extends pc.ScriptType {
    static get scriptName() { return 'TelemetrySystem'; }

    initialize() {
        this.gameManager = this.app.root.findByName('Game_Manager').script.gameManager;
        this.networkManager = this.app.root.findByName('Game_Manager').script.networkManager;
        this.performanceManager = this.app.root.findByName('Game_Manager').script.performanceManager;
        this.analyticsManager = this.app.root.findByName('Game_Manager').script.analyticsManager;
        
        // Telemetry configuration
        this.telemetryId = this.generateTelemetryId();
        this.deviceInfo = this.collectDeviceInfo();
        this.isEnabled = true;
        this.collectRealTime = true;
        
        // Data buffers
        this.realTimeData = [];
        this.errorLogs = [];
        this.performanceData = [];
        this.networkData = [];
        this.userExperienceData = [];
        this.crashReports = [];
        
        // Monitoring intervals
        this.highFrequencyInterval = 100; // 100ms for critical metrics
        this.mediumFrequencyInterval = 1000; // 1s for general metrics
        this.lowFrequencyInterval = 5000; // 5s for background metrics
        
        // Data limits
        this.maxRealTimeEntries = 1000;
        this.maxErrorEntries = 500;
        this.maxPerformanceEntries = 2000;
        this.maxNetworkEntries = 1000;
        
        // Quality thresholds
        this.performanceThresholds = {
            criticalFPS: 20,
            warningFPS: 40,
            goodFPS: 60,
            criticalMemory: 512 * 1024 * 1024, // 512MB
            criticalPing: 200,
            warningPing: 100,
            criticalPacketLoss: 0.05 // 5%
        };
        
        this.initializeTelemetry();
    }

    initializeTelemetry() {
        // Set up error handling
        this.setupErrorHandling();
        
        // Start monitoring loops
        this.startRealTimeMonitoring();
        this.startPerformanceMonitoring();
        this.startNetworkMonitoring();
        this.startUserExperienceMonitoring();
        
        // Register for app events
        this.setupEventListeners();
        
        // Send initialization telemetry
        this.sendInitializationData();
        
        console.log('Telemetry System initialized:', this.telemetryId);
    }

    generateTelemetryId() {
        return 'telemetry_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    collectDeviceInfo() {
        const canvas = this.app.graphicsDevice.canvas;
        const gl = this.app.graphicsDevice.gl;
        
        return {
            platform: navigator.platform,
            userAgent: navigator.userAgent,
            language: navigator.language,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            screen: {
                width: screen.width,
                height: screen.height,
                colorDepth: screen.colorDepth,
                pixelRatio: window.devicePixelRatio
            },
            canvas: {
                width: canvas.width,
                height: canvas.height
            },
            webgl: {
                vendor: gl.getParameter(gl.VENDOR),
                renderer: gl.getParameter(gl.RENDERER),
                version: gl.getParameter(gl.VERSION),
                maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
                maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS)
            },
            memory: this.getMemoryInfo(),
            connection: this.getConnectionInfo(),
            features: this.detectFeatures()
        };
    }

    getMemoryInfo() {
        if (performance.memory) {
            return {
                jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
                totalJSHeapSize: performance.memory.totalJSHeapSize,
                usedJSHeapSize: performance.memory.usedJSHeapSize
            };
        }
        return null;
    }

    getConnectionInfo() {
        if (navigator.connection) {
            return {
                effectiveType: navigator.connection.effectiveType,
                downlink: navigator.connection.downlink,
                rtt: navigator.connection.rtt,
                saveData: navigator.connection.saveData
            };
        }
        return null;
    }

    detectFeatures() {
        return {
            webgl2: !!this.app.graphicsDevice.isWebGL2,
            webxr: !!navigator.xr,
            gamepad: !!navigator.getGamepads,
            fullscreen: !!document.fullscreenEnabled,
            pointerLock: !!document.pointerLockElement !== undefined,
            audioContext: !!window.AudioContext || !!window.webkitAudioContext,
            webWorkers: !!window.Worker,
            localStorage: !!window.localStorage,
            indexedDB: !!window.indexedDB
        };
    }

    // Error Handling and Reporting
    setupErrorHandling() {
        // Global error handler
        window.addEventListener('error', (event) => {
            this.reportError('javascript_error', {
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                stack: event.error?.stack
            });
        });

        // Unhandled promise rejection handler
        window.addEventListener('unhandledrejection', (event) => {
            this.reportError('unhandled_promise_rejection', {
                reason: event.reason,
                stack: event.reason?.stack
            });
        });

        // PlayCanvas error handler
        this.app.on('error', (error) => {
            this.reportError('playcanvas_error', {
                message: error.message,
                stack: error.stack,
                type: 'engine_error'
            });
        });

        // WebGL context lost handler
        this.app.graphicsDevice.canvas.addEventListener('webglcontextlost', (event) => {
            this.reportError('webgl_context_lost', {
                reason: 'WebGL context was lost',
                event: event.type
            });
        });
    }

    reportError(type, errorData) {
        const errorReport = {
            id: this.generateErrorId(),
            type: type,
            timestamp: Date.now(),
            data: errorData,
            sessionInfo: {
                telemetryId: this.telemetryId,
                sessionDuration: Date.now() - this.sessionStartTime,
                gameState: this.getCurrentGameState()
            },
            deviceInfo: this.deviceInfo,
            performance: this.getCurrentPerformanceSnapshot(),
            userActions: this.getRecentUserActions()
        };

        this.errorLogs.push(errorReport);
        this.maintainErrorLogSize();

        // Send critical errors immediately
        if (this.isCriticalError(type)) {
            this.sendErrorReport(errorReport);
        }

        console.error('Telemetry Error Report:', errorReport);
    }

    generateErrorId() {
        return 'error_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    isCriticalError(type) {
        const criticalTypes = [
            'webgl_context_lost',
            'out_of_memory',
            'network_failure',
            'game_crash'
        ];
        return criticalTypes.includes(type);
    }

    // Real-time Monitoring
    startRealTimeMonitoring() {
        if (!this.collectRealTime) return;

        this.realTimeMonitoringLoop();
    }

    realTimeMonitoringLoop() {
        this.collectRealTimeMetrics();
        
        setTimeout(() => {
            if (this.isEnabled) {
                this.realTimeMonitoringLoop();
            }
        }, this.highFrequencyInterval);
    }

    collectRealTimeMetrics() {
        const metrics = {
            timestamp: Date.now(),
            fps: this.app.stats.frame.fps || 0,
            frameTime: this.app.stats.frame.ms || 0,
            drawCalls: this.app.stats.drawCalls || 0,
            triangles: this.app.stats.triangles || 0,
            shaders: this.app.stats.shaders || 0,
            materials: this.app.stats.materials || 0,
            cameras: this.app.stats.cameras || 0,
            lights: this.app.stats.lights || 0,
            memoryUsed: this.getMemoryUsage(),
            activeEntities: this.getActiveEntityCount(),
            activeParticles: this.getActiveParticleCount(),
            audioSources: this.getActiveAudioSourceCount()
        };

        this.realTimeData.push(metrics);
        this.maintainRealTimeDataSize();

        // Check for performance issues
        this.analyzeRealTimeMetrics(metrics);
    }

    analyzeRealTimeMetrics(metrics) {
        // FPS analysis
        if (metrics.fps < this.performanceThresholds.criticalFPS) {
            this.reportPerformanceIssue('critical_fps', {
                currentFPS: metrics.fps,
                threshold: this.performanceThresholds.criticalFPS,
                metrics: metrics
            });
        }

        // Memory analysis
        if (metrics.memoryUsed && metrics.memoryUsed.used > this.performanceThresholds.criticalMemory) {
            this.reportPerformanceIssue('high_memory_usage', {
                currentMemory: metrics.memoryUsed.used,
                threshold: this.performanceThresholds.criticalMemory,
                metrics: metrics
            });
        }

        // Draw call analysis
        if (metrics.drawCalls > 1000) {
            this.reportPerformanceIssue('high_draw_calls', {
                currentDrawCalls: metrics.drawCalls,
                metrics: metrics
            });
        }
    }

    // Performance Monitoring
    startPerformanceMonitoring() {
        this.performanceMonitoringLoop();
    }

    performanceMonitoringLoop() {
        this.collectPerformanceMetrics();
        
        setTimeout(() => {
            if (this.isEnabled) {
                this.performanceMonitoringLoop();
            }
        }, this.mediumFrequencyInterval);
    }

    collectPerformanceMetrics() {
        const metrics = {
            timestamp: Date.now(),
            performance: {
                fps: this.calculateAverageFPS(),
                frameTimeVariance: this.calculateFrameTimeVariance(),
                memoryTrend: this.calculateMemoryTrend(),
                loadingTimes: this.getLoadingTimes(),
                renderingStats: this.getRenderingStats()
            },
            quality: this.assessPerformanceQuality(),
            issues: this.detectPerformanceIssues(),
            recommendations: this.generatePerformanceRecommendations()
        };

        this.performanceData.push(metrics);
        this.maintainPerformanceDataSize();
    }

    calculateAverageFPS() {
        const recentData = this.realTimeData.slice(-60); // Last 60 samples
        if (recentData.length === 0) return 0;
        
        return recentData.reduce((sum, data) => sum + data.fps, 0) / recentData.length;
    }

    calculateFrameTimeVariance() {
        const recentData = this.realTimeData.slice(-60);
        if (recentData.length < 2) return 0;

        const frameTimes = recentData.map(data => data.frameTime);
        const average = frameTimes.reduce((sum, time) => sum + time, 0) / frameTimes.length;
        const variance = frameTimes.reduce((sum, time) => sum + Math.pow(time - average, 2), 0) / frameTimes.length;
        
        return Math.sqrt(variance);
    }

    calculateMemoryTrend() {
        const recentData = this.realTimeData.slice(-300); // Last 5 minutes
        if (recentData.length < 2) return 0;

        const memoryValues = recentData
            .filter(data => data.memoryUsed && data.memoryUsed.used)
            .map(data => data.memoryUsed.used);

        if (memoryValues.length < 2) return 0;

        // Simple linear regression to detect trend
        const n = memoryValues.length;
        const sumX = (n * (n - 1)) / 2;
        const sumY = memoryValues.reduce((sum, val) => sum + val, 0);
        const sumXY = memoryValues.reduce((sum, val, i) => sum + i * val, 0);
        const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        return slope; // Positive = memory increasing, negative = decreasing
    }

    // Network Quality Monitoring
    startNetworkMonitoring() {
        this.networkMonitoringLoop();
    }

    networkMonitoringLoop() {
        this.collectNetworkMetrics();
        
        setTimeout(() => {
            if (this.isEnabled) {
                this.networkMonitoringLoop();
            }
        }, this.mediumFrequencyInterval);
    }

    collectNetworkMetrics() {
        if (!this.networkManager) return;

        const metrics = {
            timestamp: Date.now(),
            ping: this.networkManager.getPing(),
            packetLoss: this.networkManager.getPacketLoss(),
            bandwidth: this.networkManager.getBandwidth(),
            jitter: this.networkManager.getJitter(),
            connectionQuality: this.assessNetworkQuality(),
            messageQueue: this.networkManager.getMessageQueueSize(),
            reconnections: this.networkManager.getReconnectionCount(),
            dataTransferred: this.networkManager.getDataTransferred()
        };

        this.networkData.push(metrics);
        this.maintainNetworkDataSize();

        // Analyze network quality
        this.analyzeNetworkMetrics(metrics);
    }

    analyzeNetworkMetrics(metrics) {
        // Ping analysis
        if (metrics.ping > this.performanceThresholds.criticalPing) {
            this.reportNetworkIssue('high_ping', {
                currentPing: metrics.ping,
                threshold: this.performanceThresholds.criticalPing,
                metrics: metrics
            });
        }

        // Packet loss analysis
        if (metrics.packetLoss > this.performanceThresholds.criticalPacketLoss) {
            this.reportNetworkIssue('high_packet_loss', {
                currentPacketLoss: metrics.packetLoss,
                threshold: this.performanceThresholds.criticalPacketLoss,
                metrics: metrics
            });
        }
    }

    assessNetworkQuality() {
        const recentMetrics = this.networkData.slice(-30); // Last 30 seconds
        if (recentMetrics.length === 0) return 'unknown';

        const avgPing = recentMetrics.reduce((sum, m) => sum + m.ping, 0) / recentMetrics.length;
        const avgPacketLoss = recentMetrics.reduce((sum, m) => sum + m.packetLoss, 0) / recentMetrics.length;

        if (avgPing < this.performanceThresholds.warningPing && avgPacketLoss < 0.01) {
            return 'excellent';
        } else if (avgPing < this.performanceThresholds.criticalPing && avgPacketLoss < 0.03) {
            return 'good';
        } else if (avgPing < this.performanceThresholds.criticalPing * 1.5 && avgPacketLoss < 0.05) {
            return 'fair';
        } else {
            return 'poor';
        }
    }

    // User Experience Monitoring
    startUserExperienceMonitoring() {
        this.setupUXEventListeners();
        this.userExperienceMonitoringLoop();
    }

    setupUXEventListeners() {
        // Input lag measurement
        document.addEventListener('mousedown', this.measureInputLag.bind(this));
        document.addEventListener('keydown', this.measureInputLag.bind(this));

        // Page visibility changes
        document.addEventListener('visibilitychange', () => {
            this.trackVisibilityChange(document.hidden);
        });

        // Window focus/blur
        window.addEventListener('focus', () => this.trackFocusChange(true));
        window.addEventListener('blur', () => this.trackFocusChange(false));
    }

    measureInputLag(event) {
        const inputTime = event.timeStamp;
        
        // Measure time until next frame
        requestAnimationFrame((frameTime) => {
            const lag = frameTime - inputTime;
            this.recordInputLag(lag, event.type);
        });
    }

    recordInputLag(lag, inputType) {
        const uxData = {
            timestamp: Date.now(),
            type: 'input_lag',
            data: {
                lag: lag,
                inputType: inputType,
                fps: this.app.stats.frame.fps
            }
        };

        this.userExperienceData.push(uxData);
        
        // Alert if input lag is high
        if (lag > 50) { // 50ms threshold
            this.reportUXIssue('high_input_lag', {
                lag: lag,
                inputType: inputType
            });
        }
    }

    userExperienceMonitoringLoop() {
        this.collectUXMetrics();
        
        setTimeout(() => {
            if (this.isEnabled) {
                this.userExperienceMonitoringLoop();
            }
        }, this.lowFrequencyInterval);
    }

    collectUXMetrics() {
        const metrics = {
            timestamp: Date.now(),
            type: 'ux_metrics',
            data: {
                smoothness: this.calculateSmoothness(),
                responsiveness: this.calculateResponsiveness(),
                stability: this.calculateStability(),
                loadingExperience: this.assessLoadingExperience(),
                visualQuality: this.assessVisualQuality(),
                audioQuality: this.assessAudioQuality()
            }
        };

        this.userExperienceData.push(metrics);
        this.maintainUXDataSize();
    }

    calculateSmoothness() {
        const recentFPS = this.realTimeData.slice(-60).map(d => d.fps);
        if (recentFPS.length === 0) return 0;

        const variance = this.calculateFrameTimeVariance();
        const avgFPS = recentFPS.reduce((sum, fps) => sum + fps, 0) / recentFPS.length;
        
        // Smoothness score (0-1) based on FPS consistency
        return Math.max(0, 1 - (variance / avgFPS));
    }

    calculateResponsiveness() {
        const recentInputLags = this.userExperienceData
            .filter(d => d.type === 'input_lag')
            .slice(-20)
            .map(d => d.data.lag);

        if (recentInputLags.length === 0) return 1;

        const avgLag = recentInputLags.reduce((sum, lag) => sum + lag, 0) / recentInputLags.length;
        
        // Responsiveness score (0-1) based on input lag
        return Math.max(0, 1 - (avgLag / 100)); // 100ms = 0 score
    }

    calculateStability() {
        const errorCount = this.errorLogs.filter(e => 
            Date.now() - e.timestamp < 60000 // Last minute
        ).length;
        
        // Stability score (0-1) based on error frequency
        return Math.max(0, 1 - (errorCount / 10)); // 10 errors = 0 score
    }

    // Event Listeners
    setupEventListeners() {
        this.app.on('game:loading_start', this.onLoadingStart, this);
        this.app.on('game:loading_complete', this.onLoadingComplete, this);
        this.app.on('player:spawn', this.onPlayerSpawn, this);
        this.app.on('player:death', this.onPlayerDeath, this);
        this.app.on('network:disconnect', this.onNetworkDisconnect, this);
        this.app.on('network:reconnect', this.onNetworkReconnect, this);
        this.app.on('performance:warning', this.onPerformanceWarning, this);
    }

    onLoadingStart(data) {
        this.recordUXEvent('loading_start', data);
    }

    onLoadingComplete(data) {
        this.recordUXEvent('loading_complete', data);
    }

    onPlayerSpawn(player) {
        this.recordUXEvent('player_spawn', {
            playerId: player.networkId,
            spawnTime: Date.now()
        });
    }

    onPlayerDeath(victim, killer) {
        this.recordUXEvent('player_death', {
            victimId: victim.networkId,
            killerId: killer?.networkId,
            deathTime: Date.now()
        });
    }

    onNetworkDisconnect(reason) {
        this.reportNetworkIssue('disconnect', { reason: reason });
    }

    onNetworkReconnect() {
        this.recordUXEvent('network_reconnect', {
            reconnectTime: Date.now()
        });
    }

    onPerformanceWarning(warning) {
        this.reportPerformanceIssue('performance_warning', warning);
    }

    // Utility Methods
    recordUXEvent(type, data) {
        this.userExperienceData.push({
            timestamp: Date.now(),
            type: type,
            data: data
        });
    }

    reportPerformanceIssue(type, data) {
        this.reportError('performance_issue', {
            issueType: type,
            data: data,
            timestamp: Date.now()
        });
    }

    reportNetworkIssue(type, data) {
        this.reportError('network_issue', {
            issueType: type,
            data: data,
            timestamp: Date.now()
        });
    }

    reportUXIssue(type, data) {
        this.reportError('ux_issue', {
            issueType: type,
            data: data,
            timestamp: Date.now()
        });
    }

    // Data Management
    maintainRealTimeDataSize() {
        if (this.realTimeData.length > this.maxRealTimeEntries) {
            this.realTimeData.splice(0, this.realTimeData.length - this.maxRealTimeEntries);
        }
    }

    maintainErrorLogSize() {
        if (this.errorLogs.length > this.maxErrorEntries) {
            this.errorLogs.splice(0, this.errorLogs.length - this.maxErrorEntries);
        }
    }

    maintainPerformanceDataSize() {
        if (this.performanceData.length > this.maxPerformanceEntries) {
            this.performanceData.splice(0, this.performanceData.length - this.maxPerformanceEntries);
        }
    }

    maintainNetworkDataSize() {
        if (this.networkData.length > this.maxNetworkEntries) {
            this.networkData.splice(0, this.networkData.length - this.maxNetworkEntries);
        }
    }

    maintainUXDataSize() {
        if (this.userExperienceData.length > 1000) {
            this.userExperienceData.splice(0, this.userExperienceData.length - 1000);
        }
    }

    // Helper Methods
    getMemoryUsage() {
        if (performance.memory) {
            return {
                used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize,
                limit: performance.memory.jsHeapSizeLimit
            };
        }
        return null;
    }

    getActiveEntityCount() {
        return this.app.root.children.length;
    }

    getActiveParticleCount() {
        const particleManager = this.app.root.findByName('Effects_Container')?.script?.particleManager;
        return particleManager?.getActiveParticleCount() || 0;
    }

    getActiveAudioSourceCount() {
        const audioManager = this.app.root.findByName('Game_Manager')?.script?.audioManager;
        return audioManager?.getActiveSourceCount() || 0;
    }

    getCurrentGameState() {
        return this.gameManager?.getGameState() || 'unknown';
    }

    getCurrentPerformanceSnapshot() {
        const recent = this.realTimeData.slice(-10);
        if (recent.length === 0) return null;

        return {
            avgFPS: recent.reduce((sum, d) => sum + d.fps, 0) / recent.length,
            avgFrameTime: recent.reduce((sum, d) => sum + d.frameTime, 0) / recent.length,
            drawCalls: recent[recent.length - 1].drawCalls,
            memory: recent[recent.length - 1].memoryUsed
        };
    }

    getRecentUserActions() {
        return this.userExperienceData
            .filter(d => Date.now() - d.timestamp < 10000) // Last 10 seconds
            .slice(-20); // Last 20 actions
    }

    // Data Export and Transmission
    sendInitializationData() {
        const initData = {
            type: 'telemetry_init',
            telemetryId: this.telemetryId,
            timestamp: Date.now(),
            deviceInfo: this.deviceInfo,
            gameVersion: this.app.version || 'unknown',
            buildId: this.app.buildId || 'unknown'
        };

        this.sendTelemetryData(initData);
    }

    sendErrorReport(errorReport) {
        this.sendTelemetryData({
            type: 'error_report',
            data: errorReport
        });
    }

    sendTelemetryData(data) {
        if (this.networkManager && this.networkManager.isConnected()) {
            this.networkManager.sendTelemetryData(data);
        }
        
        // Also store locally as backup
        this.storeTelemetryLocally(data);
    }

    storeTelemetryLocally(data) {
        try {
            const stored = JSON.parse(localStorage.getItem('telemetry_data') || '[]');
            stored.push(data);
            
            // Keep only last 50 entries locally
            if (stored.length > 50) {
                stored.shift();
            }
            
            localStorage.setItem('telemetry_data', JSON.stringify(stored));
        } catch (e) {
            console.warn('Failed to store telemetry data locally:', e);
        }
    }

    // Public API
    getTelemetryReport() {
        return {
            telemetryId: this.telemetryId,
            deviceInfo: this.deviceInfo,
            realTimeMetrics: this.getRealTimeMetricsSummary(),
            performanceMetrics: this.getPerformanceMetricsSummary(),
            networkMetrics: this.getNetworkMetricsSummary(),
            userExperience: this.getUserExperienceReport(),
            errorSummary: this.getErrorSummary(),
            dataVolume: {
                realTimeEntries: this.realTimeData.length,
                performanceEntries: this.performanceData.length,
                networkEntries: this.networkData.length,
                errorEntries: this.errorLogs.length,
                uxEntries: this.userExperienceData.length
            }
        };
    }

    getRealTimeMetricsSummary() {
        if (this.realTimeData.length === 0) return null;

        const recent = this.realTimeData.slice(-300); // Last 5 minutes
        return {
            avgFPS: recent.reduce((sum, d) => sum + d.fps, 0) / recent.length,
            minFPS: Math.min(...recent.map(d => d.fps)),
            maxFPS: Math.max(...recent.map(d => d.fps)),
            avgDrawCalls: recent.reduce((sum, d) => sum + d.drawCalls, 0) / recent.length,
            avgTriangles: recent.reduce((sum, d) => sum + d.triangles, 0) / recent.length
        };
    }

    getPerformanceMetricsSummary() {
        if (this.performanceData.length === 0) return null;

        const latest = this.performanceData[this.performanceData.length - 1];
        return {
            currentQuality: latest.quality,
            issues: latest.issues,
            recommendations: latest.recommendations,
            frameTimeVariance: latest.performance.frameTimeVariance,
            memoryTrend: latest.performance.memoryTrend
        };
    }

    getNetworkMetricsSummary() {
        if (this.networkData.length === 0) return null;

        const recent = this.networkData.slice(-60); // Last minute
        return {
            avgPing: recent.reduce((sum, d) => sum + d.ping, 0) / recent.length,
            avgPacketLoss: recent.reduce((sum, d) => sum + d.packetLoss, 0) / recent.length,
            connectionQuality: this.assessNetworkQuality(),
            reconnections: recent[recent.length - 1]?.reconnections || 0
        };
    }

    getUserExperienceReport() {
        const latest = this.userExperienceData.slice(-1)[0];
        if (!latest || latest.type !== 'ux_metrics') return null;

        return {
            smoothness: latest.data.smoothness,
            responsiveness: latest.data.responsiveness,
            stability: latest.data.stability,
            overallScore: (latest.data.smoothness + latest.data.responsiveness + latest.data.stability) / 3
        };
    }

    getErrorSummary() {
        const recentErrors = this.errorLogs.filter(e => 
            Date.now() - e.timestamp < 3600000 // Last hour
        );

        const errorTypes = {};
        recentErrors.forEach(error => {
            errorTypes[error.type] = (errorTypes[error.type] || 0) + 1;
        });

        return {
            totalErrors: recentErrors.length,
            errorTypes: errorTypes,
            criticalErrors: recentErrors.filter(e => this.isCriticalError(e.type)).length
        };
    }

    // Configuration
    setTelemetryEnabled(enabled) {
        this.isEnabled = enabled;
    }

    setRealTimeCollection(enabled) {
        this.collectRealTime = enabled;
    }

    setPerformanceThresholds(thresholds) {
        Object.assign(this.performanceThresholds, thresholds);
    }

    exportTelemetryData() {
        return {
            telemetryId: this.telemetryId,
            deviceInfo: this.deviceInfo,
            realTimeData: this.realTimeData,
            performanceData: this.performanceData,
            networkData: this.networkData,
            userExperienceData: this.userExperienceData,
            errorLogs: this.errorLogs
        };
    }

    // Assessment methods
    assessPerformanceQuality() {
        const avgFPS = this.calculateAverageFPS();
        const memoryTrend = this.calculateMemoryTrend();
        
        if (avgFPS >= this.performanceThresholds.goodFPS && memoryTrend <= 0) {
            return 'excellent';
        } else if (avgFPS >= this.performanceThresholds.warningFPS) {
            return 'good';
        } else if (avgFPS >= this.performanceThresholds.criticalFPS) {
            return 'fair';
        } else {
            return 'poor';
        }
    }

    detectPerformanceIssues() {
        const issues = [];
        const avgFPS = this.calculateAverageFPS();
        const variance = this.calculateFrameTimeVariance();
        const memoryTrend = this.calculateMemoryTrend();

        if (avgFPS < this.performanceThresholds.criticalFPS) {
            issues.push('low_fps');
        }
        
        if (variance > 10) { // High frame time variance
            issues.push('frame_stuttering');
        }
        
        if (memoryTrend > 1000) { // Memory increasing by 1KB/s
            issues.push('memory_leak');
        }

        return issues;
    }

    generatePerformanceRecommendations() {
        const issues = this.detectPerformanceIssues();
        const recommendations = [];

        if (issues.includes('low_fps')) {
            recommendations.push('reduce_graphics_quality');
        }
        
        if (issues.includes('frame_stuttering')) {
            recommendations.push('enable_vsync');
        }
        
        if (issues.includes('memory_leak')) {
            recommendations.push('restart_game');
        }

        return recommendations;
    }

    getLoadingTimes() {
        const loadEvents = this.userExperienceData.filter(d => 
            d.type === 'loading_start' || d.type === 'loading_complete'
        );

        const loadingTimes = [];
        for (let i = 0; i < loadEvents.length - 1; i += 2) {
            if (loadEvents[i].type === 'loading_start' && loadEvents[i + 1].type === 'loading_complete') {
                loadingTimes.push(loadEvents[i + 1].timestamp - loadEvents[i].timestamp);
            }
        }

        return loadingTimes;
    }

    getRenderingStats() {
        const recent = this.realTimeData.slice(-60);
        if (recent.length === 0) return {};

        return {
            avgDrawCalls: recent.reduce((sum, d) => sum + d.drawCalls, 0) / recent.length,
            avgTriangles: recent.reduce((sum, d) => sum + d.triangles, 0) / recent.length,
            avgShaders: recent.reduce((sum, d) => sum + d.shaders, 0) / recent.length,
            avgMaterials: recent.reduce((sum, d) => sum + d.materials, 0) / recent.length
        };
    }

    assessLoadingExperience() {
        const loadingTimes = this.getLoadingTimes();
        if (loadingTimes.length === 0) return 'unknown';

        const avgLoadTime = loadingTimes.reduce((sum, time) => sum + time, 0) / loadingTimes.length;
        
        if (avgLoadTime < 3000) return 'excellent';
        if (avgLoadTime < 5000) return 'good';
        if (avgLoadTime < 10000) return 'fair';
        return 'poor';
    }

    assessVisualQuality() {
        const avgFPS = this.calculateAverageFPS();
        const variance = this.calculateFrameTimeVariance();
        
        if (avgFPS >= 60 && variance < 5) return 'excellent';
        if (avgFPS >= 45 && variance < 10) return 'good';
        if (avgFPS >= 30) return 'fair';
        return 'poor';
    }

    assessAudioQuality() {
        // This would need integration with audio system
        // For now, return based on overall performance
        const avgFPS = this.calculateAverageFPS();
        return avgFPS > 30 ? 'good' : 'fair';
    }

    trackVisibilityChange(hidden) {
        this.recordUXEvent('visibility_change', { hidden: hidden });
    }

    trackFocusChange(focused) {
        this.recordUXEvent('focus_change', { focused: focused });
    }
}

pc.registerScript(TelemetrySystem, 'TelemetrySystem');
