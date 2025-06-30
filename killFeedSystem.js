/**
 * Kill Feed System - Real-time Combat Activity Display
 * Shows kills, deaths, weapon information, and combat events in the HUD
 */

class KillFeedSystem {
    constructor() {
        this.killFeedEntries = [];
        this.maxEntries = 6;
        this.entryLifetime = 5000; // 5 seconds
        this.animationDuration = 300;
        
        this.feedElement = null;
        this.isVisible = true;
        
        this.entryTypes = {
            kill: {
                icon: '💀',
                color: '#FF6B6B',
                priority: 1
            },
            headshot: {
                icon: '🎯',
                color: '#FFD93D',
                priority: 2
            },
            teamkill: {
                icon: '⚠️',
                color: '#FF9500',
                priority: 3
            },
            suicide: {
                icon: '💥',
                color: '#9B59B6',
                priority: 1
            },
            multikill: {
                icon: '🔥',
                color: '#E74C3C',
                priority: 3
            },
            firstblood: {
                icon: '🩸',
                color: '#C0392B',
                priority: 4
            }
        };
        
        this.weaponIcons = {
            rifle: '🔫',
            pistol: '🔫',
            sniper: '🎯',
            shotgun: '💥',
            grenade: '💣',
            knife: '🔪',
            explosion: '💥'
        };
        
        this.settings = {
            position: 'top-right',
            showWeaponIcons: true,
            showHeadshots: true,
            showDistance: false,
            compactMode: false,
            fadeAnimation: true
        };
        
        this.events = new EventTarget();
        
        this.init();
    }
    
    init() {
        this.createKillFeedElement();
        this.bindEvents();
        this.startCleanupLoop();
    }
    
    createKillFeedElement() {
        // Create main kill feed container
        this.feedElement = document.createElement('div');
        this.feedElement.id = 'kill-feed';
        this.feedElement.className = 'kill-feed';
        
        // Add to HUD
        if (window.hudManager) {
            window.hudManager.addElement('killFeed', this.feedElement);
        } else {
            document.body.appendChild(this.feedElement);
        }
        
        this.applyStyles();
        this.updatePosition();
    }
    
    applyStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .kill-feed {
                position: fixed;
                top: 60px;
                right: 20px;
                z-index: 1000;
                font-family: 'Roboto', sans-serif;
                font-size: 14px;
                min-width: 300px;
                max-width: 400px;
            }
            
            .kill-feed-entry {
                background: rgba(0, 0, 0, 0.8);
                border-left: 3px solid #FF6B6B;
                margin-bottom: 4px;
                padding: 8px 12px;
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                animation: slideIn 0.3s ease-out;
                transition: all 0.3s ease-out;
                backdrop-filter: blur(5px);
            }
            
            .kill-feed-entry.headshot {
                border-left-color: #FFD93D;
                background: rgba(255, 217, 61, 0.1);
            }
            
            .kill-feed-entry.teamkill {
                border-left-color: #FF9500;
                background: rgba(255, 149, 0, 0.1);
            }
            
            .kill-feed-entry.multikill {
                border-left-color: #E74C3C;
                background: rgba(231, 76, 60, 0.1);
                box-shadow: 0 0 10px rgba(231, 76, 60, 0.3);
            }
            
            .kill-feed-entry.firstblood {
                border-left-color: #C0392B;
                background: rgba(192, 57, 43, 0.15);
                box-shadow: 0 0 15px rgba(192, 57, 43, 0.4);
            }
            
            .kill-feed-main {
                display: flex;
                align-items: center;
                flex: 1;
                gap: 8px;
            }
            
            .kill-feed-killer {
                color: #FFFFFF;
                font-weight: bold;
                text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
            }
            
            .kill-feed-victim {
                color: #CCCCCC;
                font-weight: normal;
                text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
            }
            
            .kill-feed-weapon {
                font-size: 16px;
                margin: 0 4px;
                filter: drop-shadow(1px 1px 2px rgba(0, 0, 0, 0.8));
            }
            
            .kill-feed-icon {
                font-size: 14px;
                margin-left: 8px;
            }
            
            .kill-feed-distance {
                color: #999999;
                font-size: 11px;
                margin-left: 8px;
            }
            
            .kill-feed-entry.fading {
                opacity: 0;
                transform: translateX(100%);
            }
            
            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateX(100%);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }
            
            @keyframes pulseGlow {
                0%, 100% { box-shadow: 0 0 10px rgba(231, 76, 60, 0.3); }
                50% { box-shadow: 0 0 20px rgba(231, 76, 60, 0.6); }
            }
            
            .kill-feed-entry.multikill {
                animation: slideIn 0.3s ease-out, pulseGlow 2s infinite;
            }
            
            .compact-mode .kill-feed {
                min-width: 250px;
                font-size: 12px;
            }
            
            .compact-mode .kill-feed-entry {
                padding: 6px 10px;
                margin-bottom: 2px;
            }
            
            .compact-mode .kill-feed-weapon {
                font-size: 14px;
            }
            
            .kill-feed.position-top-left {
                top: 60px;
                left: 20px;
                right: auto;
            }
            
            .kill-feed.position-top-right {
                top: 60px;
                right: 20px;
                left: auto;
            }
            
            .kill-feed.position-bottom-left {
                bottom: 60px;
                left: 20px;
                top: auto;
                right: auto;
            }
            
            .kill-feed.position-bottom-right {
                bottom: 60px;
                right: 20px;
                top: auto;
                left: auto;
            }
        `;
        
        document.head.appendChild(style);
    }
    
    bindEvents() {
        // Listen for kill events
        if (window.gameManager) {
            window.gameManager.addEventListener('playerKilled', (event) => {
                this.addKillEntry(event.detail);
            });
            
            window.gameManager.addEventListener('playerSuicide', (event) => {
                this.addSuicideEntry(event.detail);
            });
        }
        
        // Listen for weapon events
        if (window.weaponManager) {
            window.weaponManager.addEventListener('playerKilled', (event) => {
                this.addKillEntry(event.detail);
            });
        }
        
        // Listen for settings changes
        if (window.settingsManager) {
            window.settingsManager.addEventListener('hudSettingsChanged', (event) => {
                if (event.detail.killFeed) {
                    this.updateSettings(event.detail.killFeed);
                }
            });
        }
    }
    
    addKillEntry(killData) {
        const entry = {
            id: this.generateEntryId(),
            timestamp: Date.now(),
            killer: killData.killer,
            victim: killData.victim,
            weapon: killData.weapon,
            headshot: killData.headshot || false,
            distance: killData.distance || 0,
            teamkill: killData.teamkill || false,
            multikill: killData.multikill || false,
            firstblood: killData.firstblood || false,
            type: this.determineEntryType(killData)
        };
        
        this.killFeedEntries.unshift(entry);
        
        // Limit entries
        if (this.killFeedEntries.length > this.maxEntries) {
            const removedEntry = this.killFeedEntries.pop();
            this.removeEntryElement(removedEntry.id);
        }
        
        this.createEntryElement(entry);
        
        this.events.dispatchEvent(new CustomEvent('killAdded', {
            detail: entry
        }));
        
        // Play sound effect
        this.playKillSound(entry);
    }
    
    addSuicideEntry(suicideData) {
        const entry = {
            id: this.generateEntryId(),
            timestamp: Date.now(),
            victim: suicideData.player,
            weapon: suicideData.cause || 'suicide',
            type: 'suicide'
        };
        
        this.killFeedEntries.unshift(entry);
        
        if (this.killFeedEntries.length > this.maxEntries) {
            const removedEntry = this.killFeedEntries.pop();
            this.removeEntryElement(removedEntry.id);
        }
        
        this.createEntryElement(entry);
    }
    
    determineEntryType(killData) {
        if (killData.firstblood) return 'firstblood';
        if (killData.multikill) return 'multikill';
        if (killData.teamkill) return 'teamkill';
        if (killData.headshot) return 'headshot';
        return 'kill';
    }
    
    createEntryElement(entry) {
        const entryElement = document.createElement('div');
        entryElement.className = `kill-feed-entry ${entry.type}`;
        entryElement.setAttribute('data-entry-id', entry.id);
        
        const mainContent = document.createElement('div');
        mainContent.className = 'kill-feed-main';
        
        if (entry.type === 'suicide') {
            // Suicide format: "Player killed themselves"
            const victimSpan = document.createElement('span');
            victimSpan.className = 'kill-feed-victim';
            victimSpan.textContent = entry.victim;
            
            const actionText = document.createElement('span');
            actionText.textContent = ' killed themselves';
            actionText.style.color = '#999999';
            
            mainContent.appendChild(victimSpan);
            mainContent.appendChild(actionText);
        } else {
            // Kill format: "Killer [weapon] Victim"
            const killerSpan = document.createElement('span');
            killerSpan.className = 'kill-feed-killer';
            killerSpan.textContent = entry.killer;
            
            const weaponSpan = document.createElement('span');
            weaponSpan.className = 'kill-feed-weapon';
            weaponSpan.textContent = this.getWeaponIcon(entry.weapon);
            
            const victimSpan = document.createElement('span');
            victimSpan.className = 'kill-feed-victim';
            victimSpan.textContent = entry.victim;
            
            mainContent.appendChild(killerSpan);
            if (this.settings.showWeaponIcons) {
                mainContent.appendChild(weaponSpan);
            }
            mainContent.appendChild(victimSpan);
        }
        
        entryElement.appendChild(mainContent);
        
        // Add additional icons and info
        const infoContainer = document.createElement('div');
        infoContainer.style.display = 'flex';
        infoContainer.style.alignItems = 'center';
        
        // Type icon
        const typeIcon = document.createElement('span');
        typeIcon.className = 'kill-feed-icon';
        typeIcon.textContent = this.entryTypes[entry.type].icon;
        infoContainer.appendChild(typeIcon);
        
        // Distance
        if (this.settings.showDistance && entry.distance > 0) {
            const distanceSpan = document.createElement('span');
            distanceSpan.className = 'kill-feed-distance';
            distanceSpan.textContent = `${Math.round(entry.distance)}m`;
            infoContainer.appendChild(distanceSpan);
        }
        
        entryElement.appendChild(infoContainer);
        
        // Insert at the top of the feed
        this.feedElement.insertBefore(entryElement, this.feedElement.firstChild);
        
        // Schedule removal
        setTimeout(() => {
            this.fadeOutEntry(entry.id);
        }, this.entryLifetime);
    }
    
    fadeOutEntry(entryId) {
        const entryElement = this.feedElement.querySelector(`[data-entry-id="${entryId}"]`);
        if (!entryElement) return;
        
        if (this.settings.fadeAnimation) {
            entryElement.classList.add('fading');
            
            setTimeout(() => {
                this.removeEntryElement(entryId);
            }, this.animationDuration);
        } else {
            this.removeEntryElement(entryId);
        }
        
        // Remove from data array
        this.killFeedEntries = this.killFeedEntries.filter(entry => entry.id !== entryId);
    }
    
    removeEntryElement(entryId) {
        const entryElement = this.feedElement.querySelector(`[data-entry-id="${entryId}"]`);
        if (entryElement) {
            entryElement.remove();
        }
    }
    
    getWeaponIcon(weapon) {
        return this.weaponIcons[weapon] || this.weaponIcons.rifle;
    }
    
    playKillSound(entry) {
        if (!window.audioManager) return;
        
        const soundMap = {
            kill: 'kill_notification',
            headshot: 'headshot_notification',
            teamkill: 'teamkill_warning',
            multikill: 'multikill_notification',
            firstblood: 'firstblood_notification',
            suicide: 'suicide_notification'
        };
        
        const sound = soundMap[entry.type] || soundMap.kill;
        window.audioManager.playSound(sound, 0.6);
    }
    
    startCleanupLoop() {
        setInterval(() => {
            this.cleanupExpiredEntries();
        }, 1000);
    }
    
    cleanupExpiredEntries() {
        const currentTime = Date.now();
        
        this.killFeedEntries.forEach(entry => {
            if (currentTime - entry.timestamp > this.entryLifetime) {
                this.fadeOutEntry(entry.id);
            }
        });
    }
    
    // Public API methods
    addCustomEntry(text, type = 'kill', duration = null) {
        const entry = {
            id: this.generateEntryId(),
            timestamp: Date.now(),
            customText: text,
            type: type,
            customDuration: duration
        };
        
        this.killFeedEntries.unshift(entry);
        this.createCustomEntryElement(entry);
        
        const entryDuration = duration || this.entryLifetime;
        setTimeout(() => {
            this.fadeOutEntry(entry.id);
        }, entryDuration);
    }
    
    createCustomEntryElement(entry) {
        const entryElement = document.createElement('div');
        entryElement.className = `kill-feed-entry ${entry.type}`;
        entryElement.setAttribute('data-entry-id', entry.id);
        
        const textSpan = document.createElement('span');
        textSpan.textContent = entry.customText;
        textSpan.style.color = this.entryTypes[entry.type]?.color || '#FFFFFF';
        
        entryElement.appendChild(textSpan);
        
        const iconSpan = document.createElement('span');
        iconSpan.className = 'kill-feed-icon';
        iconSpan.textContent = this.entryTypes[entry.type]?.icon || '📢';
        entryElement.appendChild(iconSpan);
        
        this.feedElement.insertBefore(entryElement, this.feedElement.firstChild);
    }
    
    clearFeed() {
        this.killFeedEntries.length = 0;
        this.feedElement.innerHTML = '';
    }
    
    setVisible(visible) {
        this.isVisible = visible;
        this.feedElement.style.display = visible ? 'block' : 'none';
    }
    
    updateSettings(settings) {
        Object.assign(this.settings, settings);
        
        // Apply compact mode
        this.feedElement.classList.toggle('compact-mode', this.settings.compactMode);
        
        // Update position
        this.updatePosition();
        
        // Refresh current entries to apply new settings
        this.refreshEntries();
    }
    
    updatePosition() {
        // Remove existing position classes
        this.feedElement.classList.remove(
            'position-top-left', 'position-top-right',
            'position-bottom-left', 'position-bottom-right'
        );
        
        // Add new position class
        this.feedElement.classList.add(`position-${this.settings.position}`);
    }
    
    refreshEntries() {
        // Clear current visual entries
        this.feedElement.innerHTML = '';
        
        // Recreate all entries with new settings
        this.killFeedEntries.forEach(entry => {
            if (entry.customText) {
                this.createCustomEntryElement(entry);
            } else {
                this.createEntryElement(entry);
            }
        });
    }
    
    generateEntryId() {
        return 'entry_' + Date.now() + '_' + Math.random().toString(36).substr(2);
    }
    
    // Event listeners
    addEventListener(event, callback) {
        this.events.addEventListener(event, callback);
    }
    
    removeEventListener(event, callback) {
        this.events.removeEventListener(event, callback);
    }
    
    // Debug methods
    getDebugInfo() {
        return {
            activeEntries: this.killFeedEntries.length,
            maxEntries: this.maxEntries,
            entryLifetime: this.entryLifetime,
            isVisible: this.isVisible,
            settings: this.settings
        };
    }
    
    simulateKill(killer = 'Player1', victim = 'Player2', weapon = 'rifle') {
        this.addKillEntry({
            killer: killer,
            victim: victim,
            weapon: weapon,
            headshot: Math.random() < 0.3,
            distance: Math.floor(Math.random() * 100) + 10,
            teamkill: Math.random() < 0.1
        });
    }
    
    getRecentKills(timeframe = 10000) {
        const cutoff = Date.now() - timeframe;
        return this.killFeedEntries.filter(entry => entry.timestamp > cutoff);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = KillFeedSystem;
} else {
    window.KillFeedSystem = KillFeedSystem;
}
