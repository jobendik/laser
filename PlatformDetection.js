/**
 * PlatformDetection.js
 * 
 * Platform-specific detection and optimization system.
 * Automatically detects device capabilities, applies appropriate settings,
 * and provides platform-specific optimizations for different devices.
 */

var PlatformDetection = pc.createScript('platformDetection');

// Platform detection configuration
PlatformDetection.attributes.add('autoOptimize', {
    type: 'boolean',
    default: true,
    description: 'Automatically apply platform optimizations'
});

PlatformDetection.attributes.add('enableLogging', {
    type: 'boolean',
    default: true,
    description: 'Enable platform detection logging'
});

// Initialize platform detection system
PlatformDetection.prototype.initialize = function() {
    // Platform information
    this.platformInfo = {
        type: 'unknown',
        isMobile: false,
        isTablet: false,
        isDesktop: false,
        isVR: false,
        isTV: false,
        browser: 'unknown',
        engine: 'unknown',
        os: 'unknown'
    };
    
    // Hardware capabilities
    this.hardwareCapabilities = {
        cpu: {
            cores: 1,
            architecture: 'unknown',
            estimatedSpeed: 'medium'
        },
        gpu: {
            renderer: 'unknown',
            vendor: 'unknown',
            maxTextureSize: 2048,
            maxRenderbufferSize: 2048,
            webglVersion: 1
        },
        memory: {
            deviceMemory: 0,
            maxHeapSize: 0,
            estimatedRAM: 'unknown'
        },
        display: {
            width: 1920,
            height: 1080,
            pixelRatio: 1,
            colorDepth: 24,
            refreshRate: 60
        },
        input: {
            touchSupport: false,
            mouseSupport: true,
            keyboardSupport: true,
            gamepadSupport: false,
            vrSupport: false
        },
        network: {
            connectionType: 'unknown',
            effectiveType: '4g',
            downlink: 10,
            rtt: 100
        }
    };
    
    // Performance classification
    this.performanceClass = {
        tier: 'medium',
        score: 50,
        classification: 'mid-range',
        recommendedSettings: null
    };
    
    // Feature support
    this.featureSupport = {
        webgl2: false,
        webassembly: false,
        serviceWorker: false,
        webrtc: false,
        fullscreen: false,
        pointerLock: false,
        gamepadAPI: false,
        deviceOrientation: false,
        geolocation: false,
        audioContext: false,
        mediaDevices: false
    };
    
    // Platform-specific optimizations
    this.optimizations = {
        graphics: null,
        audio: null,
        input: null,
        network: null,
        memory: null
    };

    this.detectPlatform();
    this.detectHardware();
    this.detectFeatureSupport();
    this.classifyPerformance();
    
    if (this.autoOptimize) {
        this.applyOptimizations();
    }
    
    if (this.enableLogging) {
        this.logPlatformInfo();
    }
    
    console.log('Platform Detection system initialized');
};

// Detect platform type and browser
PlatformDetection.prototype.detectPlatform = function() {
    var userAgent = navigator.userAgent.toLowerCase();
    var platform = navigator.platform.toLowerCase();
    
    // Detect mobile devices
    var mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
    this.platformInfo.isMobile = mobileRegex.test(userAgent);
    
    // Detect tablets
    var tabletRegex = /ipad|android(?!.*mobile)|tablet/i;
    this.platformInfo.isTablet = tabletRegex.test(userAgent);
    
    // Detect VR devices
    var vrRegex = /oculus|vive|quest|cardboard|daydream/i;
    this.platformInfo.isVR = vrRegex.test(userAgent);
    
    // Detect smart TV
    var tvRegex = /smart-tv|smarttv|googletv|appletv|hbbtv|pov_tv|netcast/i;
    this.platformInfo.isTV = tvRegex.test(userAgent);
    
    // Set desktop flag
    this.platformInfo.isDesktop = !this.platformInfo.isMobile && !this.platformInfo.isTablet && !this.platformInfo.isVR && !this.platformInfo.isTV;
    
    // Determine primary type
    if (this.platformInfo.isMobile) {
        this.platformInfo.type = 'mobile';
    } else if (this.platformInfo.isTablet) {
        this.platformInfo.type = 'tablet';
    } else if (this.platformInfo.isVR) {
        this.platformInfo.type = 'vr';
    } else if (this.platformInfo.isTV) {
        this.platformInfo.type = 'tv';
    } else {
        this.platformInfo.type = 'desktop';
    }
    
    // Detect browser
    if (userAgent.includes('chrome')) {
        this.platformInfo.browser = 'chrome';
    } else if (userAgent.includes('firefox')) {
        this.platformInfo.browser = 'firefox';
    } else if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
        this.platformInfo.browser = 'safari';
    } else if (userAgent.includes('edge')) {
        this.platformInfo.browser = 'edge';
    } else if (userAgent.includes('opera')) {
        this.platformInfo.browser = 'opera';
    }
    
    // Detect engine
    if (userAgent.includes('webkit')) {
        this.platformInfo.engine = 'webkit';
    } else if (userAgent.includes('gecko')) {
        this.platformInfo.engine = 'gecko';
    } else if (userAgent.includes('blink')) {
        this.platformInfo.engine = 'blink';
    }
    
    // Detect OS
    if (userAgent.includes('windows')) {
        this.platformInfo.os = 'windows';
    } else if (userAgent.includes('mac')) {
        this.platformInfo.os = 'macos';
    } else if (userAgent.includes('linux')) {
        this.platformInfo.os = 'linux';
    } else if (userAgent.includes('android')) {
        this.platformInfo.os = 'android';
    } else if (userAgent.includes('ios') || userAgent.includes('iphone') || userAgent.includes('ipad')) {
        this.platformInfo.os = 'ios';
    }
};

// Detect hardware capabilities
PlatformDetection.prototype.detectHardware = function() {
    // CPU detection
    this.hardwareCapabilities.cpu.cores = navigator.hardwareConcurrency || 1;
    
    // Estimate CPU speed based on cores and platform
    if (this.platformInfo.isMobile) {
        this.hardwareCapabilities.cpu.estimatedSpeed = this.hardwareCapabilities.cpu.cores >= 8 ? 'high' : 
                                                        this.hardwareCapabilities.cpu.cores >= 4 ? 'medium' : 'low';
    } else {
        this.hardwareCapabilities.cpu.estimatedSpeed = this.hardwareCapabilities.cpu.cores >= 8 ? 'high' : 
                                                        this.hardwareCapabilities.cpu.cores >= 4 ? 'medium' : 'low';
    }
    
    // GPU detection
    if (this.app.graphicsDevice) {
        var gl = this.app.graphicsDevice.gl;
        if (gl) {
            var debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                this.hardwareCapabilities.gpu.renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                this.hardwareCapabilities.gpu.vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
            }
            
            this.hardwareCapabilities.gpu.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
            this.hardwareCapabilities.gpu.maxRenderbufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
            this.hardwareCapabilities.gpu.webglVersion = gl instanceof WebGL2RenderingContext ? 2 : 1;
        }
    }
    
    // Memory detection
    if (navigator.deviceMemory) {
        this.hardwareCapabilities.memory.deviceMemory = navigator.deviceMemory;
        this.hardwareCapabilities.memory.estimatedRAM = this.classifyMemorySize(navigator.deviceMemory);
    }
    
    // Estimate heap size
    if (performance.memory) {
        this.hardwareCapabilities.memory.maxHeapSize = performance.memory.jsHeapSizeLimit;
    }
    
    // Display detection
    this.hardwareCapabilities.display.width = screen.width;
    this.hardwareCapabilities.display.height = screen.height;
    this.hardwareCapabilities.display.pixelRatio = window.devicePixelRatio || 1;
    this.hardwareCapabilities.display.colorDepth = screen.colorDepth || 24;
    
    // Estimate refresh rate
    this.estimateRefreshRate();
    
    // Input capabilities
    this.hardwareCapabilities.input.touchSupport = 'ontouchstart' in window;
    this.hardwareCapabilities.input.mouseSupport = !this.platformInfo.isMobile;
    this.hardwareCapabilities.input.keyboardSupport = !this.platformInfo.isMobile || this.platformInfo.isTablet;
    this.hardwareCapabilities.input.gamepadSupport = 'getGamepads' in navigator;
    
    // Network detection
    if (navigator.connection) {
        var connection = navigator.connection;
        this.hardwareCapabilities.network.connectionType = connection.type || 'unknown';
        this.hardwareCapabilities.network.effectiveType = connection.effectiveType || '4g';
        this.hardwareCapabilities.network.downlink = connection.downlink || 10;
        this.hardwareCapabilities.network.rtt = connection.rtt || 100;
    }
};

// Classify memory size
PlatformDetection.prototype.classifyMemorySize = function(memoryGB) {
    if (memoryGB >= 8) return 'high';
    if (memoryGB >= 4) return 'medium';
    if (memoryGB >= 2) return 'low';
    return 'very_low';
};

// Estimate refresh rate
PlatformDetection.prototype.estimateRefreshRate = function() {
    var lastTime = 0;
    var frameCount = 0;
    var totalTime = 0;
    
    var measureFrameRate = (timestamp) => {
        if (lastTime !== 0) {
            var deltaTime = timestamp - lastTime;
            totalTime += deltaTime;
            frameCount++;
            
            if (frameCount >= 60) {
                var averageFrameTime = totalTime / frameCount;
                this.hardwareCapabilities.display.refreshRate = Math.round(1000 / averageFrameTime);
                return;
            }
        }
        lastTime = timestamp;
        
        if (frameCount < 60) {
            requestAnimationFrame(measureFrameRate);
        }
    };
    
    requestAnimationFrame(measureFrameRate);
};

// Detect feature support
PlatformDetection.prototype.detectFeatureSupport = function() {
    // WebGL 2.0 support
    try {
        var canvas = document.createElement('canvas');
        this.featureSupport.webgl2 = !!canvas.getContext('webgl2');
    } catch (e) {
        this.featureSupport.webgl2 = false;
    }
    
    // WebAssembly support
    this.featureSupport.webassembly = typeof WebAssembly === 'object';
    
    // Service Worker support
    this.featureSupport.serviceWorker = 'serviceWorker' in navigator;
    
    // WebRTC support
    this.featureSupport.webrtc = !!(window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection);
    
    // Fullscreen API support
    this.featureSupport.fullscreen = !!(document.fullscreenEnabled || document.mozFullScreenEnabled || document.webkitFullscreenEnabled);
    
    // Pointer Lock API support
    this.featureSupport.pointerLock = 'pointerLockElement' in document || 'mozPointerLockElement' in document || 'webkitPointerLockElement' in document;
    
    // Gamepad API support
    this.featureSupport.gamepadAPI = 'getGamepads' in navigator;
    
    // Device Orientation support
    this.featureSupport.deviceOrientation = 'DeviceOrientationEvent' in window;
    
    // Geolocation support
    this.featureSupport.geolocation = 'geolocation' in navigator;
    
    // Audio Context support
    this.featureSupport.audioContext = !!(window.AudioContext || window.webkitAudioContext);
    
    // Media Devices support
    this.featureSupport.mediaDevices = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
};

// Classify overall performance
PlatformDetection.prototype.classifyPerformance = function() {
    var score = 0;
    
    // CPU score (0-30 points)
    var cpuScore = Math.min(30, this.hardwareCapabilities.cpu.cores * 3);
    if (this.hardwareCapabilities.cpu.estimatedSpeed === 'high') cpuScore *= 1.2;
    else if (this.hardwareCapabilities.cpu.estimatedSpeed === 'low') cpuScore *= 0.8;
    score += cpuScore;
    
    // GPU score (0-25 points)
    var gpuScore = Math.min(25, this.hardwareCapabilities.gpu.maxTextureSize / 160); // 4096 = 25.6 points
    if (this.hardwareCapabilities.gpu.webglVersion === 2) gpuScore += 5;
    score += gpuScore;
    
    // Memory score (0-20 points)
    var memoryScore = 0;
    if (this.hardwareCapabilities.memory.deviceMemory >= 8) memoryScore = 20;
    else if (this.hardwareCapabilities.memory.deviceMemory >= 4) memoryScore = 15;
    else if (this.hardwareCapabilities.memory.deviceMemory >= 2) memoryScore = 10;
    else memoryScore = 5;
    score += memoryScore;
    
    // Display score (0-15 points)
    var displayScore = 0;
    var resolution = this.hardwareCapabilities.display.width * this.hardwareCapabilities.display.height;
    if (resolution >= 3840 * 2160) displayScore = 15; // 4K
    else if (resolution >= 2560 * 1440) displayScore = 12; // 1440p
    else if (resolution >= 1920 * 1080) displayScore = 10; // 1080p
    else if (resolution >= 1280 * 720) displayScore = 7; // 720p
    else displayScore = 3;
    score += displayScore;
    
    // Platform penalty
    if (this.platformInfo.isMobile) score *= 0.6;
    else if (this.platformInfo.isTablet) score *= 0.8;
    
    // Network score (0-10 points)
    var networkScore = 5; // Default
    if (this.hardwareCapabilities.network.effectiveType === '4g') networkScore = 8;
    else if (this.hardwareCapabilities.network.effectiveType === '3g') networkScore = 5;
    else if (this.hardwareCapabilities.network.effectiveType === '2g') networkScore = 2;
    score += networkScore;
    
    this.performanceClass.score = Math.round(score);
    
    // Classify tier
    if (score >= 80) {
        this.performanceClass.tier = 'high';
        this.performanceClass.classification = 'high-end';
    } else if (score >= 60) {
        this.performanceClass.tier = 'medium-high';
        this.performanceClass.classification = 'upper-mid-range';
    } else if (score >= 40) {
        this.performanceClass.tier = 'medium';
        this.performanceClass.classification = 'mid-range';
    } else if (score >= 25) {
        this.performanceClass.tier = 'low-medium';
        this.performanceClass.classification = 'lower-mid-range';
    } else {
        this.performanceClass.tier = 'low';
        this.performanceClass.classification = 'low-end';
    }
    
    // Generate recommended settings
    this.generateRecommendedSettings();
};

// Generate recommended settings based on performance class
PlatformDetection.prototype.generateRecommendedSettings = function() {
    var settings = {
        graphics: {},
        audio: {},
        input: {},
        network: {},
        memory: {}
    };
    
    // Graphics settings based on performance tier
    switch (this.performanceClass.tier) {
        case 'high':
            settings.graphics = {
                resolution: 1.0,
                shadows: 'high',
                particles: 'high',
                postProcessing: true,
                antiAliasing: 'msaa',
                textureQuality: 'high',
                lodBias: 1.0,
                maxDrawCalls: 1000
            };
            break;
            
        case 'medium-high':
            settings.graphics = {
                resolution: 0.9,
                shadows: 'medium',
                particles: 'medium',
                postProcessing: true,
                antiAliasing: 'fxaa',
                textureQuality: 'medium',
                lodBias: 0.8,
                maxDrawCalls: 750
            };
            break;
            
        case 'medium':
            settings.graphics = {
                resolution: 0.8,
                shadows: 'low',
                particles: 'medium',
                postProcessing: false,
                antiAliasing: 'none',
                textureQuality: 'medium',
                lodBias: 0.6,
                maxDrawCalls: 500
            };
            break;
            
        case 'low-medium':
            settings.graphics = {
                resolution: 0.7,
                shadows: 'off',
                particles: 'low',
                postProcessing: false,
                antiAliasing: 'none',
                textureQuality: 'low',
                lodBias: 0.4,
                maxDrawCalls: 300
            };
            break;
            
        case 'low':
            settings.graphics = {
                resolution: 0.5,
                shadows: 'off',
                particles: 'off',
                postProcessing: false,
                antiAliasing: 'none',
                textureQuality: 'low',
                lodBias: 0.2,
                maxDrawCalls: 200
            };
            break;
    }
    
    // Audio settings
    settings.audio = {
        quality: this.performanceClass.tier === 'low' ? 'low' : 'medium',
        maxSources: this.platformInfo.isMobile ? 16 : 32,
        compression: this.platformInfo.isMobile,
        spatialAudio: this.performanceClass.tier !== 'low'
    };
    
    // Input settings
    settings.input = {
        mouseSmoothing: !this.platformInfo.isMobile,
        touchControls: this.platformInfo.isMobile,
        gamepadSupport: this.featureSupport.gamepadAPI,
        pointerLock: this.featureSupport.pointerLock
    };
    
    // Network settings
    settings.network = {
        updateRate: this.hardwareCapabilities.network.effectiveType === '2g' ? 30 : 60,
        compression: this.hardwareCapabilities.network.effectiveType !== '4g',
        prioritization: true
    };
    
    // Memory settings
    settings.memory = {
        assetStreaming: this.hardwareCapabilities.memory.estimatedRAM !== 'high',
        cacheSize: this.platformInfo.isMobile ? 128 : 256,
        garbageCollection: this.platformInfo.isMobile ? 'aggressive' : 'normal'
    };
    
    this.performanceClass.recommendedSettings = settings;
};

// Apply platform-specific optimizations
PlatformDetection.prototype.applyOptimizations = function() {
    var settings = this.performanceClass.recommendedSettings;
    if (!settings) return;
    
    // Apply graphics optimizations
    this.app.fire('settings:graphics:apply', settings.graphics);
    
    // Apply audio optimizations
    this.app.fire('settings:audio:apply', settings.audio);
    
    // Apply input optimizations
    this.app.fire('settings:input:apply', settings.input);
    
    // Apply network optimizations
    this.app.fire('settings:network:apply', settings.network);
    
    // Apply memory optimizations
    this.app.fire('settings:memory:apply', settings.memory);
    
    console.log(`Applied ${this.performanceClass.tier} performance optimizations`);
};

// Log platform information
PlatformDetection.prototype.logPlatformInfo = function() {
    console.group('Platform Detection Results');
    
    console.log('Platform:', this.platformInfo);
    console.log('Hardware:', this.hardwareCapabilities);
    console.log('Features:', this.featureSupport);
    console.log('Performance:', this.performanceClass);
    console.log('Recommended Settings:', this.performanceClass.recommendedSettings);
    
    console.groupEnd();
};

// Get platform information
PlatformDetection.prototype.getPlatformInfo = function() {
    return {
        platform: this.platformInfo,
        hardware: this.hardwareCapabilities,
        features: this.featureSupport,
        performance: this.performanceClass
    };
};

// Check if feature is supported
PlatformDetection.prototype.isFeatureSupported = function(feature) {
    return this.featureSupport[feature] || false;
};

// Get recommended setting for category
PlatformDetection.prototype.getRecommendedSetting = function(category, setting) {
    var settings = this.performanceClass.recommendedSettings;
    if (!settings || !settings[category]) return null;
    
    return settings[category][setting];
};

// Check if platform is mobile
PlatformDetection.prototype.isMobile = function() {
    return this.platformInfo.isMobile;
};

// Check if platform is desktop
PlatformDetection.prototype.isDesktop = function() {
    return this.platformInfo.isDesktop;
};

// Check if platform is VR
PlatformDetection.prototype.isVR = function() {
    return this.platformInfo.isVR;
};

// Get performance tier
PlatformDetection.prototype.getPerformanceTier = function() {
    return this.performanceClass.tier;
};
