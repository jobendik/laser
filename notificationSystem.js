/**
 * NotificationSystem.js
 * In-game notification and alert system
 * Handles achievement notifications, system messages, warnings, and contextual alerts
 */

class NotificationSystem extends pc.ScriptType {
    static get scriptName() { return 'NotificationSystem'; }

    initialize() {
        this.hudManager = this.app.root.findByName('HUDManager')?.script?.hudManager;
        this.audioManager = this.app.root.findByName('AudioManager')?.script?.audioManager;
        
        // Notification queue and display
        this.notifications = [];
        this.activeNotifications = [];
        this.maxActiveNotifications = 5;
        this.notificationContainer = null;
        
        // Notification types and settings
        this.notificationTypes = {
            achievement: {
                duration: 4000,
                sound: 'achievement.wav',
                icon: '🏆',
                color: '#FFD700',
                priority: 3
            },
            warning: {
                duration: 3000,
                sound: 'warning.wav',
                icon: '⚠️',
                color: '#FF6B35',
                priority: 5
            },
            info: {
                duration: 2500,
                sound: 'notification.wav',
                icon: 'ℹ️',
                color: '#4A90E2',
                priority: 2
            },
            success: {
                duration: 2000,
                sound: 'success.wav',
                icon: '✅',
                color: '#7ED321',
                priority: 3
            },
            error: {
                duration: 3500,
                sound: 'error.wav',
                icon: '❌',
                color: '#D0021B',
                priority: 4
            },
            system: {
                duration: 3000,
                sound: 'system.wav',
                icon: '⚙️',
                color: '#9013FE',
                priority: 4
            },
            combat: {
                duration: 1500,
                sound: 'combat.wav',
                icon: '⚔️',
                color: '#FF5722',
                priority: 1
            },
            objective: {
                duration: 4000,
                sound: 'objective.wav',
                icon: '🎯',
                color: '#00BCD4',
                priority: 3
            }
        };
        
        // Position settings
        this.position = { x: 0.95, y: 0.8 }; // Screen percentage (top-right)
        this.spacing = 10;
        this.maxWidth = 350;
        
        this.setupNotificationUI();
        this.setupEventListeners();
        this.setupCSS();
    }

    setupNotificationUI() {
        // Create notification container
        this.notificationContainer = document.createElement('div');
        this.notificationContainer.id = 'notification-container';
        this.notificationContainer.style.cssText = `
            position: fixed;
            top: ${this.position.y * 100}%;
            right: ${(1 - this.position.x) * 100}%;
            width: ${this.maxWidth}px;
            z-index: 10000;
            pointer-events: none;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            transform: translateY(-100%);
        `;
        
        document.body.appendChild(this.notificationContainer);
    }

    setupCSS() {
        const style = document.createElement('style');
        style.textContent = `
            .notification {
                background: linear-gradient(135deg, rgba(0,0,0,0.9), rgba(0,0,0,0.7));
                border-left: 4px solid;
                border-radius: 8px;
                padding: 12px 16px;
                margin-bottom: ${this.spacing}px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                backdrop-filter: blur(10px);
                transform: translateX(120%);
                transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
                position: relative;
                overflow: hidden;
            }
            
            .notification.show {
                transform: translateX(0%);
            }
            
            .notification.hide {
                transform: translateX(120%);
                opacity: 0;
            }
            
            .notification::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 2px;
                background: currentColor;
                opacity: 0.3;
            }
            
            .notification-header {
                display: flex;
                align-items: center;
                margin-bottom: 4px;
            }
            
            .notification-icon {
                font-size: 20px;
                margin-right: 8px;
                filter: drop-shadow(0 0 4px currentColor);
            }
            
            .notification-title {
                font-weight: 600;
                font-size: 14px;
                color: currentColor;
                text-shadow: 0 0 4px rgba(0,0,0,0.7);
            }
            
            .notification-message {
                font-size: 12px;
                color: rgba(255,255,255,0.9);
                line-height: 1.4;
                text-shadow: 0 0 2px rgba(0,0,0,0.8);
            }
            
            .notification-progress {
                position: absolute;
                bottom: 0;
                left: 0;
                height: 2px;
                background: currentColor;
                transition: width linear;
                opacity: 0.6;
            }
            
            .notification-close {
                position: absolute;
                top: 8px;
                right: 8px;
                width: 16px;
                height: 16px;
                cursor: pointer;
                opacity: 0.5;
                transition: opacity 0.2s;
                color: rgba(255,255,255,0.7);
                font-size: 12px;
                line-height: 16px;
                text-align: center;
                pointer-events: auto;
            }
            
            .notification-close:hover {
                opacity: 1;
            }
            
            @keyframes notificationSlideIn {
                from {
                    transform: translateX(120%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0%);
                    opacity: 1;
                }
            }
            
            @keyframes notificationSlideOut {
                from {
                    transform: translateX(0%);
                    opacity: 1;
                }
                to {
                    transform: translateX(120%);
                    opacity: 0;
                }
            }
            
            @keyframes notificationPulse {
                0%, 100% { 
                    transform: scale(1); 
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                }
                50% { 
                    transform: scale(1.02); 
                    box-shadow: 0 6px 20px rgba(0,0,0,0.4);
                }
            }
            
            .notification.critical {
                animation: notificationPulse 2s infinite;
                border-width: 6px;
            }
            
            .notification.achievement {
                background: linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(255, 165, 0, 0.1));
            }
            
            .notification.success {
                background: linear-gradient(135deg, rgba(126, 211, 33, 0.2), rgba(46, 125, 50, 0.1));
            }
            
            .notification.warning {
                background: linear-gradient(135deg, rgba(255, 107, 53, 0.2), rgba(255, 87, 34, 0.1));
            }
            
            .notification.error {
                background: linear-gradient(135deg, rgba(208, 2, 27, 0.2), rgba(183, 28, 28, 0.1));
            }
        `;
        
        document.head.appendChild(style);
    }

    setupEventListeners() {
        // Achievement events
        this.app.on('achievement:unlocked', (achievement) => {
            this.showAchievement(achievement);
        });
        
        // System events
        this.app.on('system:message', (message) => {
            this.show(message.text, 'system', message.title);
        });
        
        // Combat events
        this.app.on('player:kill', (killData) => {
            this.showKillNotification(killData);
        });
        
        this.app.on('player:death', () => {
            this.show('You have been eliminated', 'error', 'KIA');
        });
        
        // Objective events
        this.app.on('objective:completed', (objective) => {
            this.show(`Objective completed: ${objective.name}`, 'objective', 'Mission Update');
        });
        
        this.app.on('objective:failed', (objective) => {
            this.show(`Objective failed: ${objective.name}`, 'warning', 'Mission Update');
        });
        
        // Weapon events
        this.app.on('weapon:lowAmmo', (weapon) => {
            this.show(`Low ammunition: ${weapon.name}`, 'warning', 'Ammunition');
        });
        
        // Team events
        this.app.on('teammate:down', (teammate) => {
            this.show(`${teammate.name} is down!`, 'warning', 'Team Status');
        });
        
        this.app.on('teammate:revived', (teammate) => {
            this.show(`${teammate.name} has been revived`, 'success', 'Team Status');
        });
        
        // Network events
        this.app.on('network:connectionLost', () => {
            this.show('Connection to server lost', 'error', 'Network Error');
        });
        
        this.app.on('network:reconnected', () => {
            this.show('Connection restored', 'success', 'Network Status');
        });
        
        // Settings events
        this.app.on('settings:saved', () => {
            this.show('Settings saved successfully', 'success', 'Settings');
        });
    }

    show(message, type = 'info', title = null, options = {}) {
        const notificationData = {
            id: Date.now() + Math.random(),
            message: message,
            title: title,
            type: type,
            timestamp: Date.now(),
            ...options
        };
        
        // Add to queue
        this.notifications.push(notificationData);
        
        // Process queue
        this.processQueue();
    }

    processQueue() {
        // Remove old notifications that exceed max display count
        while (this.activeNotifications.length >= this.maxActiveNotifications) {
            this.hideNotification(this.activeNotifications[0]);
        }
        
        // Show next notification if available
        if (this.notifications.length > 0) {
            const notification = this.notifications.shift();
            this.displayNotification(notification);
        }
    }

    displayNotification(notificationData) {
        const typeConfig = this.notificationTypes[notificationData.type] || this.notificationTypes.info;
        const duration = notificationData.duration || typeConfig.duration;
        
        // Create notification element
        const notificationElement = document.createElement('div');
        notificationElement.className = `notification ${notificationData.type}`;
        notificationElement.style.borderLeftColor = typeConfig.color;
        notificationElement.style.color = typeConfig.color;
        
        // Add critical class for high priority notifications
        if (typeConfig.priority >= 4) {
            notificationElement.classList.add('critical');
        }
        
        // Create header
        const header = document.createElement('div');
        header.className = 'notification-header';
        
        const icon = document.createElement('span');
        icon.className = 'notification-icon';
        icon.textContent = notificationData.icon || typeConfig.icon;
        
        const title = document.createElement('span');
        title.className = 'notification-title';
        title.textContent = notificationData.title || this.getDefaultTitle(notificationData.type);
        
        header.appendChild(icon);
        header.appendChild(title);
        
        // Create message
        const message = document.createElement('div');
        message.className = 'notification-message';
        message.textContent = notificationData.message;
        
        // Create progress bar
        const progress = document.createElement('div');
        progress.className = 'notification-progress';
        progress.style.width = '100%';
        
        // Create close button
        const closeBtn = document.createElement('div');
        closeBtn.className = 'notification-close';
        closeBtn.textContent = '×';
        closeBtn.onclick = () => this.hideNotification(notificationData);
        
        // Assemble notification
        notificationElement.appendChild(header);
        notificationElement.appendChild(message);
        notificationElement.appendChild(progress);
        notificationElement.appendChild(closeBtn);
        
        // Add to container
        this.notificationContainer.appendChild(notificationElement);
        
        // Store reference
        notificationData.element = notificationElement;
        notificationData.progressElement = progress;
        this.activeNotifications.push(notificationData);
        
        // Play sound
        this.playNotificationSound(typeConfig.sound);
        
        // Animate in
        setTimeout(() => {
            notificationElement.classList.add('show');
        }, 50);
        
        // Start progress animation
        setTimeout(() => {
            progress.style.transition = `width ${duration}ms linear`;
            progress.style.width = '0%';
        }, 100);
        
        // Auto-hide after duration
        notificationData.hideTimer = setTimeout(() => {
            this.hideNotification(notificationData);
        }, duration);
    }

    hideNotification(notificationData) {
        if (!notificationData.element) return;
        
        // Clear timer
        if (notificationData.hideTimer) {
            clearTimeout(notificationData.hideTimer);
        }
        
        // Animate out
        notificationData.element.classList.add('hide');
        
        // Remove from DOM and active list
        setTimeout(() => {
            if (notificationData.element && notificationData.element.parentNode) {
                notificationData.element.parentNode.removeChild(notificationData.element);
            }
            
            const index = this.activeNotifications.indexOf(notificationData);
            if (index > -1) {
                this.activeNotifications.splice(index, 1);
            }
            
            // Process next in queue
            this.processQueue();
        }, 300);
    }

    showAchievement(achievement) {
        const message = achievement.description || `You unlocked: ${achievement.name}`;
        
        this.show(message, 'achievement', achievement.name, {
            duration: 5000,
            icon: achievement.icon || '🏆'
        });
        
        // Fire achievement display event for other systems
        this.app.fire('achievement:displayed', achievement);
    }

    showKillNotification(killData) {
        let message = '';
        
        if (killData.isHeadshot) {
            message = `Headshot! Eliminated ${killData.victim}`;
        } else if (killData.isMultikill) {
            message = `${killData.killType} kill! Eliminated ${killData.victim}`;
        } else {
            message = `Eliminated ${killData.victim}`;
        }
        
        if (killData.weapon) {
            message += ` with ${killData.weapon}`;
        }
        
        this.show(message, 'combat', 'Elimination', {
            duration: 2000
        });
    }

    showCustomNotification(config) {
        this.show(config.message, config.type || 'info', config.title, {
            duration: config.duration,
            icon: config.icon,
            sound: config.sound
        });
    }

    getDefaultTitle(type) {
        const titles = {
            achievement: 'Achievement Unlocked',
            warning: 'Warning',
            info: 'Information',
            success: 'Success',
            error: 'Error',
            system: 'System',
            combat: 'Combat',
            objective: 'Objective'
        };
        
        return titles[type] || 'Notification';
    }

    playNotificationSound(soundFile) {
        if (this.audioManager && soundFile) {
            this.audioManager.playSound(soundFile, {
                volume: 0.5,
                category: 'ui'
            });
        }
    }

    // Queue management
    clearQueue() {
        this.notifications = [];
    }

    clearAll() {
        // Hide all active notifications
        [...this.activeNotifications].forEach(notification => {
            this.hideNotification(notification);
        });
        
        // Clear queue
        this.clearQueue();
    }

    clearType(type) {
        // Remove from queue
        this.notifications = this.notifications.filter(n => n.type !== type);
        
        // Hide active notifications of this type
        this.activeNotifications.filter(n => n.type === type).forEach(notification => {
            this.hideNotification(notification);
        });
    }

    // Settings
    setPosition(x, y) {
        this.position = { x, y };
        this.notificationContainer.style.top = `${y * 100}%`;
        this.notificationContainer.style.right = `${(1 - x) * 100}%`;
    }

    setMaxActiveNotifications(max) {
        this.maxActiveNotifications = max;
    }

    setNotificationDuration(type, duration) {
        if (this.notificationTypes[type]) {
            this.notificationTypes[type].duration = duration;
        }
    }

    // Public API shortcuts
    showInfo(message, title = null) {
        this.show(message, 'info', title);
    }

    showWarning(message, title = null) {
        this.show(message, 'warning', title);
    }

    showError(message, title = null) {
        this.show(message, 'error', title);
    }

    showSuccess(message, title = null) {
        this.show(message, 'success', title);
    }

    showSystem(message, title = null) {
        this.show(message, 'system', title);
    }

    // Utility methods
    isActive() {
        return this.activeNotifications.length > 0;
    }

    getActiveCount() {
        return this.activeNotifications.length;
    }

    getQueueCount() {
        return this.notifications.length;
    }

    // Bulk operations
    showMultiple(notifications) {
        notifications.forEach(notification => {
            this.show(notification.message, notification.type, notification.title, notification);
        });
    }

    destroy() {
        // Clear all notifications
        this.clearAll();
        
        // Remove container
        if (this.notificationContainer && this.notificationContainer.parentNode) {
            this.notificationContainer.parentNode.removeChild(this.notificationContainer);
        }
    }
}

pc.registerScript(NotificationSystem, 'NotificationSystem');
