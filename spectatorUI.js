/**
 * SpectatorUI.js
 * Manages the spectator mode interface and camera controls
 */

class SpectatorUI extends pc.ScriptType {
    static get scriptName() { return 'SpectatorUI'; }

    initialize() {
        this.gameManager = this.app.root.findByName('Game_Manager').script.gameManager;
        this.networkManager = this.app.root.findByName('Game_Manager').script.networkManager;
        this.inputManager = this.app.root.findByName('Game_Manager').script.inputManager;
        
        // Spectator state
        this.isSpectating = false;
        this.spectatorCamera = null;
        this.currentTarget = null;
        this.targetIndex = 0;
        this.availableTargets = [];
        
        // Camera modes
        this.cameraMode = 'follow'; // follow, free, overhead
        this.cameraModes = ['follow', 'free', 'overhead'];
        this.currentModeIndex = 0;
        
        // Free camera settings
        this.freeCamSpeed = 10;
        this.freeCamSensitivity = 2;
        this.freeCamPosition = new pc.Vec3();
        this.freeCamRotation = new pc.Vec3();
        
        // UI elements
        this.spectatorUI = null;
        this.targetInfo = null;
        this.controls = null;
        
        // Input bindings
        this.keyBindings = {
            nextTarget: 'ArrowRight',
            prevTarget: 'ArrowLeft',
            toggleMode: 'C',
            respawn: 'R',
            exitSpectator: 'Escape'
        };
        
        this.createSpectatorUI();
        this.setupEventListeners();
    }

    createSpectatorUI() {
        // Main spectator container
        this.spectatorUI = document.createElement('div');
        this.spectatorUI.id = 'spectator-ui';
        this.spectatorUI.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 500;
            display: none;
            font-family: Arial, sans-serif;
            color: white;
        `;
        
        document.body.appendChild(this.spectatorUI);
        
        this.createTargetInfo();
        this.createControls();
        this.createModeIndicator();
        this.createPlayerList();
    }

    createTargetInfo() {
        this.targetInfo = document.createElement('div');
        this.targetInfo.style.cssText = `
            position: absolute;
            top: 20px;
            left: 20px;
            background: rgba(0, 0, 0, 0.7);
            padding: 15px 20px;
            border-radius: 8px;
            border: 2px solid #444;
        `;
        
        this.spectatorUI.appendChild(this.targetInfo);
    }

    createControls() {
        this.controls = document.createElement('div');
        this.controls.style.cssText = `
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            padding: 15px 25px;
            border-radius: 8px;
            border: 2px solid #444;
            text-align: center;
        `;
        
        this.controls.innerHTML = `
            <div style="margin-bottom: 10px; font-size: 16px; font-weight: bold;">Spectator Controls</div>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 14px;">
                <div><span style="color: #ffa500;">← →</span> Switch Target</div>
                <div><span style="color: #ffa500;">C</span> Camera Mode</div>
                <div><span style="color: #ffa500;">R</span> Respawn</div>
                <div><span style="color: #ffa500;">ESC</span> Exit Spectator</div>
                <div><span style="color: #ffa500;">WASD</span> Free Camera Move</div>
                <div><span style="color: #ffa500;">Mouse</span> Free Camera Look</div>
            </div>
        `;
        
        this.spectatorUI.appendChild(this.controls);
    }

    createModeIndicator() {
        this.modeIndicator = document.createElement('div');
        this.modeIndicator.style.cssText = `
            position: absolute;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.7);
            padding: 10px 15px;
            border-radius: 8px;
            border: 2px solid #444;
            font-size: 14px;
        `;
        
        this.spectatorUI.appendChild(this.modeIndicator);
    }

    createPlayerList() {
        this.playerList = document.createElement('div');
        this.playerList.style.cssText = `
            position: absolute;
            top: 50%;
            right: 20px;
            transform: translateY(-50%);
            background: rgba(0, 0, 0, 0.7);
            padding: 15px;
            border-radius: 8px;
            border: 2px solid #444;
            min-width: 200px;
            max-height: 400px;
            overflow-y: auto;
        `;
        
        const title = document.createElement('div');
        title.style.cssText = `
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 10px;
            text-align: center;
            border-bottom: 1px solid #666;
            padding-bottom: 5px;
        `;
        title.textContent = 'Players';
        
        this.playerListContent = document.createElement('div');
        
        this.playerList.appendChild(title);
        this.playerList.appendChild(this.playerListContent);
        this.spectatorUI.appendChild(this.playerList);
    }

    setupEventListeners() {
        this.app.on('input:keydown', this.onKeyDown, this);
        this.app.on('input:mousemove', this.onMouseMove, this);
        this.app.on('player:died', this.onPlayerDied, this);
        this.app.on('player:respawned', this.onPlayerRespawned, this);
        this.app.on('game:ended', this.onGameEnded, this);
        this.app.on('spectator:enter', this.enterSpectatorMode, this);
        this.app.on('spectator:exit', this.exitSpectatorMode, this);
    }

    onKeyDown(data) {
        if (!this.isSpectating) return;
        
        switch (data.key) {
            case this.keyBindings.nextTarget:
                this.switchToNextTarget();
                break;
            case this.keyBindings.prevTarget:
                this.switchToPreviousTarget();
                break;
            case this.keyBindings.toggleMode:
                this.switchCameraMode();
                break;
            case this.keyBindings.respawn:
                this.attemptRespawn();
                break;
            case this.keyBindings.exitSpectator:
                this.exitSpectatorMode();
                break;
        }
    }

    onMouseMove(data) {
        if (!this.isSpectating || this.cameraMode !== 'free') return;
        
        // Update free camera rotation
        this.freeCamRotation.y -= data.dx * this.freeCamSensitivity * 0.1;
        this.freeCamRotation.x -= data.dy * this.freeCamSensitivity * 0.1;
        
        // Clamp pitch
        this.freeCamRotation.x = pc.math.clamp(this.freeCamRotation.x, -90, 90);
        
        if (this.spectatorCamera) {
            this.spectatorCamera.setEulerAngles(this.freeCamRotation);
        }
    }

    onPlayerDied(data) {
        const { playerId } = data;
        
        // If local player died, enter spectator mode
        if (playerId === this.networkManager?.localPlayerId) {
            this.enterSpectatorMode();
        }
        
        // Update available targets
        this.updateAvailableTargets();
    }

    onPlayerRespawned(data) {
        const { playerId } = data;
        
        // If local player respawned, exit spectator mode
        if (playerId === this.networkManager?.localPlayerId) {
            this.exitSpectatorMode();
        }
        
        // Update available targets
        this.updateAvailableTargets();
    }

    onGameEnded(data) {
        // Force spectator mode during end game
        this.enterSpectatorMode();
    }

    enterSpectatorMode() {
        if (this.isSpectating) return;
        
        this.isSpectating = true;
        this.spectatorUI.style.display = 'block';
        
        // Create or get spectator camera
        this.createSpectatorCamera();
        
        // Update available targets
        this.updateAvailableTargets();
        
        // Set initial target
        if (this.availableTargets.length > 0) {
            this.setCurrentTarget(this.availableTargets[0]);
        } else {
            this.switchCameraMode('free');
        }
        
        // Update UI
        this.updateUI();
        
        // Lock cursor for free camera
        if (this.cameraMode === 'free') {
            this.app.mouse.enablePointerLock();
        }
        
        console.log('Entered spectator mode');
    }

    exitSpectatorMode() {
        if (!this.isSpectating) return;
        
        this.isSpectating = false;
        this.spectatorUI.style.display = 'none';
        
        // Disable spectator camera
        if (this.spectatorCamera) {
            this.spectatorCamera.enabled = false;
        }
        
        // Release cursor
        this.app.mouse.disablePointerLock();
        
        console.log('Exited spectator mode');
    }

    createSpectatorCamera() {
        if (this.spectatorCamera) {
            this.spectatorCamera.enabled = true;
            return;
        }
        
        const cameraEntity = new pc.Entity('SpectatorCamera');
        cameraEntity.addComponent('camera', {
            clearColor: new pc.Color(0.1, 0.1, 0.1),
            fov: 75,
            nearClip: 0.1,
            farClip: 1000
        });
        
        this.app.root.addChild(cameraEntity);
        this.spectatorCamera = cameraEntity;
        
        // Position at a default location
        this.spectatorCamera.setPosition(0, 10, 0);
        this.spectatorCamera.setEulerAngles(-20, 0, 0);
    }

    updateAvailableTargets() {
        this.availableTargets = [];
        
        if (this.gameManager) {
            const players = this.gameManager.getAllPlayers();
            
            players.forEach(player => {
                // Only add alive players (except local player in death spectator mode)
                if (player.script.healthSystem?.isAlive() || player.networkId === this.networkManager?.localPlayerId) {
                    this.availableTargets.push(player);
                }
            });
        }
        
        // Update target index if current target is no longer available
        if (this.currentTarget && !this.availableTargets.includes(this.currentTarget)) {
            this.targetIndex = 0;
            this.setCurrentTarget(this.availableTargets[0] || null);
        }
        
        this.updatePlayerList();
    }

    switchToNextTarget() {
        if (this.availableTargets.length === 0) return;
        
        this.targetIndex = (this.targetIndex + 1) % this.availableTargets.length;
        this.setCurrentTarget(this.availableTargets[this.targetIndex]);
    }

    switchToPreviousTarget() {
        if (this.availableTargets.length === 0) return;
        
        this.targetIndex = this.targetIndex === 0 ? this.availableTargets.length - 1 : this.targetIndex - 1;
        this.setCurrentTarget(this.availableTargets[this.targetIndex]);
    }

    setCurrentTarget(target) {
        this.currentTarget = target;
        
        if (this.cameraMode === 'follow' && target) {
            this.followTarget(target);
        }
        
        this.updateTargetInfo();
    }

    switchCameraMode(mode = null) {
        if (mode) {
            this.cameraMode = mode;
            this.currentModeIndex = this.cameraModes.indexOf(mode);
        } else {
            this.currentModeIndex = (this.currentModeIndex + 1) % this.cameraModes.length;
            this.cameraMode = this.cameraModes[this.currentModeIndex];
        }
        
        switch (this.cameraMode) {
            case 'follow':
                if (this.currentTarget) {
                    this.followTarget(this.currentTarget);
                }
                this.app.mouse.disablePointerLock();
                break;
            case 'free':
                this.enterFreeCameraMode();
                this.app.mouse.enablePointerLock();
                break;
            case 'overhead':
                this.enterOverheadMode();
                this.app.mouse.disablePointerLock();
                break;
        }
        
        this.updateModeIndicator();
    }

    followTarget(target) {
        if (!target || !this.spectatorCamera) return;
        
        // Position camera behind and above target
        const targetPos = target.getPosition();
        const targetRotation = target.getEulerAngles();
        
        const offset = new pc.Vec3(0, 2, -5);
        offset.scale(1);
        
        // Rotate offset by target's rotation
        const rotatedOffset = new pc.Vec3();
        rotatedOffset.copy(offset);
        
        const rotation = new pc.Quat();
        rotation.setFromEulerAngles(0, targetRotation.y, 0);
        rotation.transformVector(rotatedOffset, rotatedOffset);
        
        const cameraPos = targetPos.clone().add(rotatedOffset);
        
        this.spectatorCamera.setPosition(cameraPos);
        this.spectatorCamera.lookAt(targetPos);
    }

    enterFreeCameraMode() {
        if (!this.spectatorCamera) return;
        
        // Save current camera position as starting point for free cam
        this.freeCamPosition.copy(this.spectatorCamera.getPosition());
        this.freeCamRotation.copy(this.spectatorCamera.getEulerAngles());
    }

    enterOverheadMode() {
        if (!this.spectatorCamera) return;
        
        // Position camera high above the map center
        const mapCenter = this.gameManager?.getMapCenter() || new pc.Vec3(0, 0, 0);
        this.spectatorCamera.setPosition(mapCenter.x, mapCenter.y + 50, mapCenter.z);
        this.spectatorCamera.setEulerAngles(-90, 0, 0);
    }

    updateTargetInfo() {
        if (!this.targetInfo) return;
        
        if (this.currentTarget && this.cameraMode === 'follow') {
            const player = this.currentTarget;
            const health = player.script.healthSystem?.getCurrentHealth() || 0;
            const maxHealth = player.script.healthSystem?.getMaxHealth() || 100;
            const weapon = player.script.weaponManager?.getCurrentWeapon()?.name || 'None';
            const kills = player.kills || 0;
            const deaths = player.deaths || 0;
            
            this.targetInfo.innerHTML = `
                <div style="font-size: 18px; font-weight: bold; margin-bottom: 8px;">
                    ${player.name || 'Unknown Player'}
                </div>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 5px; font-size: 14px;">
                    <div>Health: <span style="color: #ff6666;">${health}/${maxHealth}</span></div>
                    <div>Weapon: <span style="color: #ffa500;">${weapon}</span></div>
                    <div>Kills: <span style="color: #66ff66;">${kills}</span></div>
                    <div>Deaths: <span style="color: #ff6666;">${deaths}</span></div>
                </div>
                <div style="margin-top: 8px; font-size: 12px; color: #ccc;">
                    Target ${this.targetIndex + 1} of ${this.availableTargets.length}
                </div>
            `;
        } else {
            this.targetInfo.innerHTML = `
                <div style="font-size: 18px; font-weight: bold;">
                    Free Camera Mode
                </div>
                <div style="font-size: 14px; color: #ccc; margin-top: 5px;">
                    Use WASD to move, mouse to look
                </div>
            `;
        }
    }

    updateModeIndicator() {
        if (!this.modeIndicator) return;
        
        const modeNames = {
            follow: 'Follow Mode',
            free: 'Free Camera',
            overhead: 'Overhead View'
        };
        
        this.modeIndicator.innerHTML = `
            <div style="font-weight: bold;">${modeNames[this.cameraMode]}</div>
            <div style="font-size: 12px; color: #ccc; margin-top: 3px;">
                Press C to switch
            </div>
        `;
    }

    updatePlayerList() {
        if (!this.playerListContent) return;
        
        this.playerListContent.innerHTML = '';
        
        this.availableTargets.forEach((player, index) => {
            const playerItem = document.createElement('div');
            playerItem.style.cssText = `
                padding: 8px 10px;
                margin-bottom: 5px;
                background: ${index === this.targetIndex ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)'};
                border-radius: 4px;
                cursor: pointer;
                transition: background 0.2s;
                font-size: 14px;
            `;
            
            const health = player.script.healthSystem?.getCurrentHealth() || 0;
            const healthPercent = (health / (player.script.healthSystem?.getMaxHealth() || 100)) * 100;
            
            playerItem.innerHTML = `
                <div style="font-weight: bold;">${player.name || 'Player'}</div>
                <div style="font-size: 12px; color: #ccc;">
                    Health: ${Math.floor(healthPercent)}% | K/D: ${player.kills || 0}/${player.deaths || 0}
                </div>
            `;
            
            // Click to spectate
            playerItem.addEventListener('click', () => {
                this.targetIndex = index;
                this.setCurrentTarget(player);
                if (this.cameraMode !== 'follow') {
                    this.switchCameraMode('follow');
                }
            });
            
            playerItem.addEventListener('mouseenter', () => {
                playerItem.style.background = 'rgba(255, 255, 255, 0.3)';
            });
            
            playerItem.addEventListener('mouseleave', () => {
                playerItem.style.background = index === this.targetIndex ? 
                    'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)';
            });
            
            this.playerListContent.appendChild(playerItem);
        });
    }

    updateFreeCameraMovement(dt) {
        if (this.cameraMode !== 'free' || !this.spectatorCamera) return;
        
        const input = this.inputManager;
        if (!input) return;
        
        const forward = this.spectatorCamera.forward.clone().scale(this.freeCamSpeed * dt);
        const right = this.spectatorCamera.right.clone().scale(this.freeCamSpeed * dt);
        const up = new pc.Vec3(0, 1, 0).scale(this.freeCamSpeed * dt);
        
        if (input.isPressed('KeyW')) {
            this.freeCamPosition.add(forward);
        }
        if (input.isPressed('KeyS')) {
            this.freeCamPosition.sub(forward);
        }
        if (input.isPressed('KeyA')) {
            this.freeCamPosition.sub(right);
        }
        if (input.isPressed('KeyD')) {
            this.freeCamPosition.add(right);
        }
        if (input.isPressed('KeyQ')) {
            this.freeCamPosition.sub(up);
        }
        if (input.isPressed('KeyE')) {
            this.freeCamPosition.add(up);
        }
        
        this.spectatorCamera.setPosition(this.freeCamPosition);
    }

    attemptRespawn() {
        // Try to respawn the player
        this.app.fire('player:requestRespawn');
    }

    updateUI() {
        this.updateTargetInfo();
        this.updateModeIndicator();
        this.updatePlayerList();
    }

    update(dt) {
        if (!this.isSpectating) return;
        
        // Update camera based on mode
        switch (this.cameraMode) {
            case 'follow':
                if (this.currentTarget) {
                    this.followTarget(this.currentTarget);
                }
                break;
            case 'free':
                this.updateFreeCameraMovement(dt);
                break;
        }
        
        // Update UI periodically
        this.updateTargetInfo();
    }

    destroy() {
        // Clean up event listeners
        this.app.off('input:keydown', this.onKeyDown, this);
        this.app.off('input:mousemove', this.onMouseMove, this);
        this.app.off('player:died', this.onPlayerDied, this);
        this.app.off('player:respawned', this.onPlayerRespawned, this);
        this.app.off('game:ended', this.onGameEnded, this);
        this.app.off('spectator:enter', this.enterSpectatorMode, this);
        this.app.off('spectator:exit', this.exitSpectatorMode, this);
        
        // Remove UI
        if (this.spectatorUI && this.spectatorUI.parentNode) {
            this.spectatorUI.parentNode.removeChild(this.spectatorUI);
        }
        
        // Clean up camera
        if (this.spectatorCamera) {
            this.spectatorCamera.destroy();
        }
    }
}

pc.registerScript(SpectatorUI, 'SpectatorUI');
