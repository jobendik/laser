var ChatSystem = pc.createScript('chatSystem');

ChatSystem.attributes.add('maxMessages', { type: 'number', default: 100 });
ChatSystem.attributes.add('maxMessageLength', { type: 'number', default: 200 });
ChatSystem.attributes.add('messageFadeTime', { type: 'number', default: 10 }); // seconds
ChatSystem.attributes.add('chatHeight', { type: 'number', default: 300 });
ChatSystem.attributes.add('chatWidth', { type: 'number', default: 400 });
ChatSystem.attributes.add('enableProfanityFilter', { type: 'boolean', default: true });
ChatSystem.attributes.add('enableSpamProtection', { type: 'boolean', default: true });
ChatSystem.attributes.add('allowEmojis', { type: 'boolean', default: true });

ChatSystem.prototype.initialize = function() {
    // Chat state
    this.isVisible = false;
    this.isInputActive = false;
    this.currentChannel = 'all'; // all, team, squad, whisper
    this.messages = [];
    
    // UI Elements
    this.chatContainer = null;
    this.messageContainer = null;
    this.inputContainer = null;
    this.inputField = null;
    this.channelSelector = null;
    
    // Message management
    this.messageElements = [];
    this.fadeTimers = new Map();
    
    // Spam protection
    this.lastMessageTime = 0;
    this.messageCount = 0;
    this.spamThreshold = 5; // messages per minute
    this.spamWindow = 60000; // 1 minute
    this.messageHistory = [];
    
    // Player data
    this.localPlayer = null;
    this.playerTeam = 'none';
    
    // Chat channels
    this.channels = {
        'all': { name: 'All', color: '#FFFFFF', key: 'T' },
        'team': { name: 'Team', color: '#00AAFF', key: 'Y' },
        'squad': { name: 'Squad', color: '#00FF00', key: 'U' },
        'system': { name: 'System', color: '#FFFF00', key: null }
    };
    
    // Profanity filter
    this.profanityWords = [
        // Basic filter - would be more comprehensive in production
        'badword1', 'badword2' // placeholder
    ];
    
    // Emoji mappings
    this.emojiMap = {
        ':)': '😊', ':(': '😢', ':D': '😄', ':P': '😛',
        ':o': '😮', ';)': '😉', ':heart:': '❤️', ':thumbs:': '👍',
        ':fire:': '🔥', ':skull:': '💀', ':ok:': '👌', ':gg:': '🎮'
    };
    
    // Quick commands
    this.quickCommands = {
        '/help': this.showHelp,
        '/clear': this.clearChat,
        '/mute': this.mutePlayer,
        '/unmute': this.unmutePlayer,
        '/players': this.listPlayers,
        '/time': this.showGameTime,
        '/score': this.showScore
    };
    
    // Muted players
    this.mutedPlayers = new Set();
    
    // Auto-complete
    this.autoCompleteList = [];
    this.autoCompleteIndex = -1;
    
    // Setup chat UI
    this.createChatUI();
    
    // Bind events
    this.app.on('chat:sendMessage', this.sendMessage, this);
    this.app.on('chat:receiveMessage', this.receiveMessage, this);
    this.app.on('chat:toggle', this.toggleChat, this);
    this.app.on('chat:setChannel', this.setChannel, this);
    this.app.on('chat:systemMessage', this.addSystemMessage, this);
    this.app.on('player:joined', this.onPlayerJoined, this);
    this.app.on('player:left', this.onPlayerLeft, this);
    this.app.on('match:start', this.onMatchStart, this);
    this.app.on('match:end', this.onMatchEnd, this);
    
    // Keyboard events
    this.app.keyboard.on(pc.EVENT_KEYDOWN, this.onKeyDown, this);
    this.app.keyboard.on(pc.EVENT_KEYUP, this.onKeyUp, this);
    
    // Find local player
    this.findLocalPlayer();
    
    console.log('ChatSystem initialized');
};

ChatSystem.prototype.createChatUI = function() {
    // Main chat container
    this.chatContainer = new pc.Entity('ChatContainer');
    this.chatContainer.addComponent('element', {
        type: pc.ELEMENTTYPE_GROUP,
        anchor: [0, 0, 0, 1],
        pivot: [0, 1],
        width: this.chatWidth,
        height: this.chatHeight,
        useInput: true
    });
    
    this.chatContainer.setLocalPosition(10, -10, 0);
    
    // Background
    this.createChatBackground();
    
    // Message container
    this.createMessageContainer();
    
    // Input container
    this.createInputContainer();
    
    // Channel selector
    this.createChannelSelector();
    
    // Initially hidden
    this.chatContainer.enabled = false;
    
    // Add to UI
    const uiContainer = this.app.root.findByName('UI_Container');
    if (uiContainer) {
        uiContainer.addChild(this.chatContainer);
    } else {
        this.app.root.addChild(this.chatContainer);
    }
};

ChatSystem.prototype.createChatBackground = function() {
    const background = new pc.Entity('ChatBackground');
    background.addComponent('element', {
        type: pc.ELEMENTTYPE_IMAGE,
        color: new pc.Color(0, 0, 0, 0.7),
        anchor: [0, 0, 1, 1],
        pivot: [0.5, 0.5]
    });
    
    this.chatContainer.addChild(background);
};

ChatSystem.prototype.createMessageContainer = function() {
    this.messageContainer = new pc.Entity('MessageContainer');
    this.messageContainer.addComponent('element', {
        type: pc.ELEMENTTYPE_GROUP,
        anchor: [0, 0.15, 1, 1],
        pivot: [0, 1],
        useInput: false
    });
    
    // Add scrolling capability
    this.messageContainer.addComponent('scrollview', {
        horizontal: false,
        vertical: true,
        scrollMode: pc.SCROLL_MODE_CLAMP,
        bounce: false
    });
    
    this.chatContainer.addChild(this.messageContainer);
    
    // Message content (scrollable area)
    this.messageContent = new pc.Entity('MessageContent');
    this.messageContent.addComponent('element', {
        type: pc.ELEMENTTYPE_GROUP,
        anchor: [0, 1, 1, 1],
        pivot: [0, 1]
    });
    
    this.messageContainer.addChild(this.messageContent);
};

ChatSystem.prototype.createInputContainer = function() {
    this.inputContainer = new pc.Entity('InputContainer');
    this.inputContainer.addComponent('element', {
        type: pc.ELEMENTTYPE_GROUP,
        anchor: [0, 0, 1, 0.15],
        pivot: [0, 0],
        margin: new pc.Vec4(5, 5, 5, 5)
    });
    
    // Input field background
    const inputBg = new pc.Entity('InputBackground');
    inputBg.addComponent('element', {
        type: pc.ELEMENTTYPE_IMAGE,
        color: new pc.Color(0.2, 0.2, 0.2, 0.9),
        anchor: [0, 0, 1, 1],
        pivot: [0.5, 0.5]
    });
    this.inputContainer.addChild(inputBg);
    
    // Input field
    this.inputField = new pc.Entity('InputField');
    this.inputField.addComponent('element', {
        type: pc.ELEMENTTYPE_TEXT,
        text: '',
        fontSize: 14,
        color: new pc.Color(1, 1, 1),
        anchor: [0.05, 0, 0.95, 1],
        pivot: [0, 0.5],
        wrapLines: false,
        autoWidth: false,
        autoHeight: false
    });
    
    this.inputContainer.addChild(this.inputField);
    this.chatContainer.addChild(this.inputContainer);
    
    // Setup input handling
    this.setupInputField();
};

ChatSystem.prototype.createChannelSelector = function() {
    this.channelSelector = new pc.Entity('ChannelSelector');
    this.channelSelector.addComponent('element', {
        type: pc.ELEMENTTYPE_TEXT,
        text: '[ALL]',
        fontSize: 12,
        color: new pc.Color(1, 1, 1),
        anchor: [0, 1, 0, 1],
        pivot: [0, 1]
    });
    
    this.channelSelector.setLocalPosition(5, -5, 0);
    this.chatContainer.addChild(this.channelSelector);
};

ChatSystem.prototype.setupInputField = function() {
    // This would be more sophisticated in a real implementation
    // For now, we'll handle basic text input through keyboard events
    this.inputText = '';
    this.cursorPosition = 0;
};

ChatSystem.prototype.update = function(dt) {
    this.updateMessageFading(dt);
    this.updateAutoComplete();
    this.updateInputField();
};

ChatSystem.prototype.updateMessageFading = function(dt) {
    if (this.isVisible) return; // Don't fade when chat is open
    
    const currentTime = Date.now();
    
    this.fadeTimers.forEach((startTime, messageElement) => {
        const elapsed = (currentTime - startTime) / 1000;
        
        if (elapsed >= this.messageFadeTime) {
            // Fully faded
            messageElement.enabled = false;
        } else if (elapsed >= this.messageFadeTime * 0.7) {
            // Start fading
            const fadeProgress = (elapsed - this.messageFadeTime * 0.7) / (this.messageFadeTime * 0.3);
            messageElement.element.opacity = 1 - fadeProgress;
        }
    });
};

ChatSystem.prototype.updateAutoComplete = function() {
    // Update auto-complete suggestions based on current input
    if (this.isInputActive && this.inputText.length > 0) {
        this.generateAutoCompleteList();
    }
};

ChatSystem.prototype.updateInputField = function() {
    if (this.inputField && this.inputField.element) {
        // Update input field display
        let displayText = this.inputText;
        
        // Add cursor indicator
        if (this.isInputActive) {
            displayText = displayText.substring(0, this.cursorPosition) + 
                         '|' + 
                         displayText.substring(this.cursorPosition);
        }
        
        this.inputField.element.text = displayText;
    }
};

ChatSystem.prototype.onKeyDown = function(event) {
    // Chat toggle keys
    if (!this.isInputActive) {
        switch (event.key) {
            case pc.KEY_T:
                this.openChat('all');
                break;
            case pc.KEY_Y:
                this.openChat('team');
                break;
            case pc.KEY_U:
                this.openChat('squad');
                break;
            case pc.KEY_ENTER:
                if (this.isVisible) {
                    this.openChat('all');
                }
                break;
        }
        return;
    }
    
    // Input handling when chat is active
    switch (event.key) {
        case pc.KEY_ENTER:
            this.submitMessage();
            break;
        case pc.KEY_ESCAPE:
            this.closeChat();
            break;
        case pc.KEY_BACKSPACE:
            this.handleBackspace();
            break;
        case pc.KEY_DELETE:
            this.handleDelete();
            break;
        case pc.KEY_LEFT:
            this.moveCursor(-1);
            break;
        case pc.KEY_RIGHT:
            this.moveCursor(1);
            break;
        case pc.KEY_HOME:
            this.cursorPosition = 0;
            break;
        case pc.KEY_END:
            this.cursorPosition = this.inputText.length;
            break;
        case pc.KEY_TAB:
            this.handleAutoComplete();
            break;
        case pc.KEY_UP:
            this.historyUp();
            break;
        case pc.KEY_DOWN:
            this.historyDown();
            break;
        default:
            this.handleTextInput(event);
    }
};

ChatSystem.prototype.onKeyUp = function(event) {
    // Handle key releases if needed
};

ChatSystem.prototype.handleTextInput = function(event) {
    // Convert key code to character
    const char = this.keyCodeToChar(event.key, event.shift);
    if (char && this.inputText.length < this.maxMessageLength) {
        this.inputText = this.inputText.substring(0, this.cursorPosition) + 
                        char + 
                        this.inputText.substring(this.cursorPosition);
        this.cursorPosition++;
    }
};

ChatSystem.prototype.keyCodeToChar = function(keyCode, shift) {
    // Basic key to character conversion
    if (keyCode >= pc.KEY_A && keyCode <= pc.KEY_Z) {
        const char = String.fromCharCode(keyCode);
        return shift ? char : char.toLowerCase();
    }
    
    if (keyCode >= pc.KEY_0 && keyCode <= pc.KEY_9) {
        if (shift) {
            const shiftChars = ')!@#$%^&*(';
            return shiftChars[keyCode - pc.KEY_0];
        }
        return String.fromCharCode(keyCode);
    }
    
    // Special characters
    const specialKeys = {
        [pc.KEY_SPACE]: ' ',
        [pc.KEY_COMMA]: shift ? '<' : ',',
        [pc.KEY_PERIOD]: shift ? '>' : '.',
        [pc.KEY_SLASH]: shift ? '?' : '/',
        [pc.KEY_SEMICOLON]: shift ? ':' : ';',
        [pc.KEY_APOSTROPHE]: shift ? '"' : "'",
        [pc.KEY_OPEN_BRACKET]: shift ? '{' : '[',
        [pc.KEY_CLOSE_BRACKET]: shift ? '}' : ']',
        [pc.KEY_BACK_SLASH]: shift ? '|' : '\\',
        [pc.KEY_MINUS]: shift ? '_' : '-',
        [pc.KEY_EQUAL]: shift ? '+' : '='
    };
    
    return specialKeys[keyCode] || null;
};

ChatSystem.prototype.handleBackspace = function() {
    if (this.cursorPosition > 0) {
        this.inputText = this.inputText.substring(0, this.cursorPosition - 1) + 
                        this.inputText.substring(this.cursorPosition);
        this.cursorPosition--;
    }
};

ChatSystem.prototype.handleDelete = function() {
    if (this.cursorPosition < this.inputText.length) {
        this.inputText = this.inputText.substring(0, this.cursorPosition) + 
                        this.inputText.substring(this.cursorPosition + 1);
    }
};

ChatSystem.prototype.moveCursor = function(direction) {
    this.cursorPosition = Math.max(0, Math.min(this.inputText.length, this.cursorPosition + direction));
};

ChatSystem.prototype.handleAutoComplete = function() {
    if (this.autoCompleteList.length === 0) return;
    
    this.autoCompleteIndex = (this.autoCompleteIndex + 1) % this.autoCompleteList.length;
    const suggestion = this.autoCompleteList[this.autoCompleteIndex];
    
    // Replace current word with suggestion
    this.replaceCurrentWord(suggestion);
};

ChatSystem.prototype.generateAutoCompleteList = function() {
    this.autoCompleteList = [];
    
    const currentWord = this.getCurrentWord();
    if (currentWord.length < 2) return;
    
    // Get player names for auto-complete
    const players = this.app.root.findByTag('player');
    players.forEach(player => {
        if (player.name && player.name.toLowerCase().startsWith(currentWord.toLowerCase())) {
            this.autoCompleteList.push(player.name);
        }
    });
    
    // Add command auto-complete
    Object.keys(this.quickCommands).forEach(command => {
        if (command.startsWith(currentWord)) {
            this.autoCompleteList.push(command);
        }
    });
};

ChatSystem.prototype.getCurrentWord = function() {
    const words = this.inputText.split(' ');
    const wordIndex = this.inputText.substring(0, this.cursorPosition).split(' ').length - 1;
    return words[wordIndex] || '';
};

ChatSystem.prototype.replaceCurrentWord = function(replacement) {
    const words = this.inputText.split(' ');
    const beforeCursor = this.inputText.substring(0, this.cursorPosition);
    const wordIndex = beforeCursor.split(' ').length - 1;
    
    words[wordIndex] = replacement;
    this.inputText = words.join(' ');
    
    // Update cursor position
    const newPosition = words.slice(0, wordIndex + 1).join(' ').length;
    this.cursorPosition = newPosition;
};

ChatSystem.prototype.historyUp = function() {
    // Navigate through message history
    // Implementation would depend on history storage
};

ChatSystem.prototype.historyDown = function() {
    // Navigate through message history
    // Implementation would depend on history storage
};

ChatSystem.prototype.openChat = function(channel) {
    this.isVisible = true;
    this.isInputActive = true;
    this.currentChannel = channel;
    this.chatContainer.enabled = true;
    
    // Update channel display
    this.updateChannelSelector();
    
    // Clear input
    this.inputText = '';
    this.cursorPosition = 0;
    
    // Show all messages when opening chat
    this.showAllMessages();
    
    // Disable game input
    this.app.fire('input:disableGameInput');
};

ChatSystem.prototype.closeChat = function() {
    this.isVisible = false;
    this.isInputActive = false;
    this.chatContainer.enabled = false;
    
    // Re-enable game input
    this.app.fire('input:enableGameInput');
    
    // Start fade timers for messages
    this.startMessageFading();
};

ChatSystem.prototype.toggleChat = function() {
    if (this.isVisible) {
        this.closeChat();
    } else {
        this.openChat(this.currentChannel);
    }
};

ChatSystem.prototype.submitMessage = function() {
    if (this.inputText.trim().length === 0) {
        this.closeChat();
        return;
    }
    
    // Check for spam
    if (this.enableSpamProtection && this.isSpamming()) {
        this.addSystemMessage('You are sending messages too quickly. Please wait.');
        return;
    }
    
    // Check for commands
    if (this.inputText.startsWith('/')) {
        this.handleCommand(this.inputText);
    } else {
        // Send regular message
        this.sendMessage({
            text: this.inputText,
            channel: this.currentChannel
        });
    }
    
    // Add to message history
    this.messageHistory.push({
        text: this.inputText,
        timestamp: Date.now()
    });
    
    this.closeChat();
};

ChatSystem.prototype.sendMessage = function(data) {
    const { text, channel = this.currentChannel, targetPlayer = null } = data;
    
    // Filter profanity
    const filteredText = this.filterProfanity(text);
    
    // Process emojis
    const processedText = this.processEmojis(filteredText);
    
    // Create message object
    const message = {
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        text: processedText,
        channel: channel,
        sender: this.getLocalPlayerName(),
        senderTeam: this.playerTeam,
        timestamp: Date.now(),
        targetPlayer: targetPlayer
    };
    
    // Add to local messages
    this.receiveMessage(message);
    
    // Send to network (would be handled by NetworkManager)
    this.app.fire('network:sendChatMessage', message);
    
    console.log('Message sent:', message);
};

ChatSystem.prototype.receiveMessage = function(message) {
    // Check if sender is muted
    if (this.mutedPlayers.has(message.sender)) {
        return;
    }
    
    // Check if message is for current player's team/channel
    if (!this.shouldDisplayMessage(message)) {
        return;
    }
    
    // Add to messages array
    this.messages.push(message);
    
    // Limit message count
    if (this.messages.length > this.maxMessages) {
        const removedMessage = this.messages.shift();
        this.removeMessageElement(removedMessage.id);
    }
    
    // Create UI element for message
    this.createMessageElement(message);
    
    // Scroll to bottom
    this.scrollToBottom();
};

ChatSystem.prototype.shouldDisplayMessage = function(message) {
    switch (message.channel) {
        case 'all':
            return true;
        case 'team':
            return message.senderTeam === this.playerTeam;
        case 'squad':
            // Would need squad system implementation
            return message.senderTeam === this.playerTeam;
        case 'whisper':
            return message.targetPlayer === this.getLocalPlayerName() || 
                   message.sender === this.getLocalPlayerName();
        case 'system':
            return true;
        default:
            return false;
    }
};

ChatSystem.prototype.createMessageElement = function(message) {
    const messageElement = new pc.Entity('Message_' + message.id);
    messageElement.addComponent('element', {
        type: pc.ELEMENTTYPE_GROUP,
        anchor: [0, 1, 1, 1],
        pivot: [0, 1],
        height: 20
    });
    
    // Calculate vertical position
    const yPos = -this.messageElements.length * 22;
    messageElement.setLocalPosition(0, yPos, 0);
    
    // Create message text
    this.createMessageText(messageElement, message);
    
    // Add to container
    this.messageContent.addChild(messageElement);
    this.messageElements.push(messageElement);
    
    // Start fade timer if chat is closed
    if (!this.isVisible) {
        this.fadeTimers.set(messageElement, Date.now());
    }
    
    // Update content height
    this.updateContentHeight();
};

ChatSystem.prototype.createMessageText = function(parent, message) {
    const channel = this.channels[message.channel];
    const channelColor = channel ? channel.color : '#FFFFFF';
    const timestamp = new Date(message.timestamp).toLocaleTimeString();
    
    // Format message text
    let displayText = '';
    
    if (message.channel === 'system') {
        displayText = `[${timestamp}] ${message.text}`;
    } else {
        const channelPrefix = message.channel !== 'all' ? `[${channel.name.toUpperCase()}] ` : '';
        displayText = `[${timestamp}] ${channelPrefix}${message.sender}: ${message.text}`;
    }
    
    const textElement = new pc.Entity('MessageText');
    textElement.addComponent('element', {
        type: pc.ELEMENTTYPE_TEXT,
        text: displayText,
        fontSize: 12,
        color: pc.Color.fromString(channelColor),
        anchor: [0, 0, 1, 1],
        pivot: [0, 0.5],
        wrapLines: true,
        autoWidth: false,
        autoHeight: true
    });
    
    parent.addChild(textElement);
};

ChatSystem.prototype.removeMessageElement = function(messageId) {
    for (let i = 0; i < this.messageElements.length; i++) {
        const element = this.messageElements[i];
        if (element.name === 'Message_' + messageId) {
            element.destroy();
            this.messageElements.splice(i, 1);
            this.fadeTimers.delete(element);
            break;
        }
    }
    
    this.updateContentHeight();
};

ChatSystem.prototype.updateContentHeight = function() {
    const contentHeight = this.messageElements.length * 22;
    this.messageContent.element.height = Math.max(contentHeight, this.chatHeight - 50);
};

ChatSystem.prototype.scrollToBottom = function() {
    // Scroll message container to bottom
    if (this.messageContainer.scrollview) {
        this.messageContainer.scrollview.verticalScrollValue = 1;
    }
};

ChatSystem.prototype.showAllMessages = function() {
    // Show all message elements and reset opacity
    this.messageElements.forEach(element => {
        element.enabled = true;
        element.element.opacity = 1;
    });
    
    // Clear fade timers
    this.fadeTimers.clear();
};

ChatSystem.prototype.startMessageFading = function() {
    const currentTime = Date.now();
    
    this.messageElements.forEach(element => {
        this.fadeTimers.set(element, currentTime);
    });
};

ChatSystem.prototype.updateChannelSelector = function() {
    if (this.channelSelector && this.channelSelector.element) {
        const channel = this.channels[this.currentChannel];
        this.channelSelector.element.text = `[${channel.name.toUpperCase()}]`;
        this.channelSelector.element.color = pc.Color.fromString(channel.color);
    }
};

ChatSystem.prototype.setChannel = function(data) {
    const { channel } = data;
    if (this.channels[channel]) {
        this.currentChannel = channel;
        this.updateChannelSelector();
    }
};

ChatSystem.prototype.filterProfanity = function(text) {
    if (!this.enableProfanityFilter) return text;
    
    let filteredText = text;
    this.profanityWords.forEach(word => {
        const regex = new RegExp(word, 'gi');
        filteredText = filteredText.replace(regex, '*'.repeat(word.length));
    });
    
    return filteredText;
};

ChatSystem.prototype.processEmojis = function(text) {
    if (!this.allowEmojis) return text;
    
    let processedText = text;
    Object.keys(this.emojiMap).forEach(emoji => {
        const regex = new RegExp(this.escapeRegex(emoji), 'g');
        processedText = processedText.replace(regex, this.emojiMap[emoji]);
    });
    
    return processedText;
};

ChatSystem.prototype.escapeRegex = function(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

ChatSystem.prototype.isSpamming = function() {
    const currentTime = Date.now();
    const recentMessages = this.messageHistory.filter(msg => 
        currentTime - msg.timestamp < this.spamWindow
    );
    
    return recentMessages.length >= this.spamThreshold;
};

ChatSystem.prototype.handleCommand = function(command) {
    const parts = command.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    if (this.quickCommands[cmd]) {
        this.quickCommands[cmd].call(this, args);
    } else {
        this.addSystemMessage(`Unknown command: ${cmd}`);
    }
};

ChatSystem.prototype.showHelp = function() {
    const helpText = [
        'Chat Commands:',
        '/help - Show this help',
        '/clear - Clear chat',
        '/mute <player> - Mute a player',
        '/unmute <player> - Unmute a player',
        '/players - List all players',
        '/time - Show game time',
        '/score - Show current score',
        '',
        'Channels:',
        'T - All chat',
        'Y - Team chat',
        'U - Squad chat',
        '',
        'Controls:',
        'Tab - Auto-complete',
        'Up/Down - Message history',
        'Esc - Close chat'
    ];
    
    helpText.forEach(line => this.addSystemMessage(line));
};

ChatSystem.prototype.clearChat = function() {
    this.messages = [];
    this.messageElements.forEach(element => element.destroy());
    this.messageElements = [];
    this.fadeTimers.clear();
    this.updateContentHeight();
};

ChatSystem.prototype.mutePlayer = function(args) {
    if (args.length === 0) {
        this.addSystemMessage('Usage: /mute <player_name>');
        return;
    }
    
    const playerName = args.join(' ');
    this.mutedPlayers.add(playerName);
    this.addSystemMessage(`Muted player: ${playerName}`);
};

ChatSystem.prototype.unmutePlayer = function(args) {
    if (args.length === 0) {
        this.addSystemMessage('Usage: /unmute <player_name>');
        return;
    }
    
    const playerName = args.join(' ');
    this.mutedPlayers.delete(playerName);
    this.addSystemMessage(`Unmuted player: ${playerName}`);
};

ChatSystem.prototype.listPlayers = function() {
    const players = this.app.root.findByTag('player');
    const playerNames = players.map(player => player.name || 'Unknown').join(', ');
    this.addSystemMessage(`Players online: ${playerNames}`);
};

ChatSystem.prototype.showGameTime = function() {
    // Would get actual game time from GameManager
    this.addSystemMessage('Game time: 5:23 remaining');
};

ChatSystem.prototype.showScore = function() {
    // Would get actual scores from GameManager
    this.addSystemMessage('Score - Blue: 15, Red: 12');
};

ChatSystem.prototype.addSystemMessage = function(text) {
    const message = {
        id: Date.now() + '_system',
        text: text,
        channel: 'system',
        sender: 'System',
        senderTeam: 'none',
        timestamp: Date.now()
    };
    
    this.receiveMessage(message);
};

ChatSystem.prototype.findLocalPlayer = function() {
    this.localPlayer = this.app.root.findByName('Local_Player');
    if (this.localPlayer) {
        if (this.localPlayer.tags.has('blue_team')) {
            this.playerTeam = 'blue';
        } else if (this.localPlayer.tags.has('red_team')) {
            this.playerTeam = 'red';
        }
    }
};

ChatSystem.prototype.getLocalPlayerName = function() {
    return this.localPlayer ? (this.localPlayer.name || 'Player') : 'Unknown';
};

ChatSystem.prototype.onPlayerJoined = function(data) {
    this.addSystemMessage(`${data.player.name || 'Player'} joined the game`);
};

ChatSystem.prototype.onPlayerLeft = function(data) {
    this.addSystemMessage(`${data.player.name || 'Player'} left the game`);
};

ChatSystem.prototype.onMatchStart = function() {
    this.addSystemMessage('Match started! Good luck!');
};

ChatSystem.prototype.onMatchEnd = function(data) {
    this.addSystemMessage(`Match ended! Winner: ${data.winner}`);
};

ChatSystem.prototype.getChatStats = function() {
    return {
        isVisible: this.isVisible,
        isInputActive: this.isInputActive,
        currentChannel: this.currentChannel,
        messageCount: this.messages.length,
        mutedPlayers: this.mutedPlayers.size
    };
};