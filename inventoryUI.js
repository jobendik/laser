/**
 * InventoryUI.js
 * Manages the player inventory interface for weapons, equipment, and items
 */

class InventoryUI extends pc.ScriptType {
    static get scriptName() { return 'InventoryUI'; }

    initialize() {
        this.inventorySystem = this.entity.script.inventorySystem;
        this.inputManager = this.app.root.findByName('Game_Manager').script.inputManager;
        this.weaponManager = this.entity.script.weaponManager;
        
        // UI state
        this.isVisible = false;
        this.selectedSlot = 0;
        this.draggedItem = null;
        this.toggleKey = 'I';
        
        // Inventory layout
        this.slotSize = 64;
        this.slotSpacing = 8;
        this.slotsPerRow = 8;
        
        // Categories
        this.categories = {
            weapons: { name: 'Weapons', icon: '🔫', slots: 4 },
            equipment: { name: 'Equipment', icon: '🎒', slots: 6 },
            consumables: { name: 'Consumables', icon: '💊', slots: 8 },
            ammunition: { name: 'Ammunition', icon: '📦', slots: 12 },
            attachments: { name: 'Attachments', icon: '🔧', slots: 16 }
        };
        
        this.createInventoryUI();
        this.setupEventListeners();
    }

    createInventoryUI() {
        // Main inventory container
        this.inventoryElement = document.createElement('div');
        this.inventoryElement.id = 'inventory-ui';
        this.inventoryElement.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 800px;
            height: 600px;
            background: rgba(0, 0, 0, 0.9);
            border: 2px solid #444;
            border-radius: 8px;
            color: white;
            font-family: Arial, sans-serif;
            z-index: 1000;
            display: none;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;
        
        document.body.appendChild(this.inventoryElement);
        
        this.createInventoryHeader();
        this.createInventoryContent();
        this.createItemTooltip();
    }

    createInventoryHeader() {
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 15px 20px;
            background: rgba(0, 0, 0, 0.3);
            border-bottom: 1px solid #666;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        
        const title = document.createElement('h2');
        title.textContent = 'Inventory';
        title.style.cssText = `
            margin: 0;
            font-size: 24px;
            color: #fff;
        `;
        
        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.style.cssText = `
            background: none;
            border: none;
            color: #fff;
            font-size: 24px;
            cursor: pointer;
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        closeButton.onclick = () => this.hideInventory();
        
        header.appendChild(title);
        header.appendChild(closeButton);
        this.inventoryElement.appendChild(header);
    }

    createInventoryContent() {
        const content = document.createElement('div');
        content.style.cssText = `
            display: flex;
            height: calc(100% - 70px);
        `;
        
        // Category tabs
        const sidebar = document.createElement('div');
        sidebar.style.cssText = `
            width: 200px;
            background: rgba(0, 0, 0, 0.2);
            border-right: 1px solid #666;
            overflow-y: auto;
        `;
        
        // Main inventory area
        const mainArea = document.createElement('div');
        mainArea.style.cssText = `
            flex: 1;
            padding: 20px;
            overflow-y: auto;
        `;
        
        content.appendChild(sidebar);
        content.appendChild(mainArea);
        this.inventoryElement.appendChild(content);
        
        this.sidebarElement = sidebar;
        this.mainAreaElement = mainArea;
        
        this.createCategoryTabs();
        this.createInventoryGrid();
        this.createItemDetails();
    }

    createCategoryTabs() {
        this.categoryTabs = {};
        
        Object.entries(this.categories).forEach(([key, category], index) => {
            const tab = document.createElement('div');
            tab.className = 'category-tab';
            tab.dataset.category = key;
            tab.style.cssText = `
                padding: 15px 20px;
                border-bottom: 1px solid #444;
                cursor: pointer;
                transition: background-color 0.2s;
                ${index === 0 ? 'background: rgba(255, 255, 255, 0.1);' : ''}
            `;
            
            tab.innerHTML = `
                <div style="font-size: 20px; margin-bottom: 5px;">${category.icon}</div>
                <div style="font-size: 14px;">${category.name}</div>
            `;
            
            tab.addEventListener('click', () => this.selectCategory(key));
            tab.addEventListener('mouseenter', () => {
                if (!tab.classList.contains('active')) {
                    tab.style.background = 'rgba(255, 255, 255, 0.05)';
                }
            });
            tab.addEventListener('mouseleave', () => {
                if (!tab.classList.contains('active')) {
                    tab.style.background = 'transparent';
                }
            });
            
            this.sidebarElement.appendChild(tab);
            this.categoryTabs[key] = tab;
        });
        
        // Set first category as active
        this.selectCategory(Object.keys(this.categories)[0]);
    }

    createInventoryGrid() {
        this.inventoryGrid = document.createElement('div');
        this.inventoryGrid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(${this.slotsPerRow}, ${this.slotSize}px);
            gap: ${this.slotSpacing}px;
            margin-bottom: 20px;
        `;
        
        this.mainAreaElement.appendChild(this.inventoryGrid);
        this.inventorySlots = [];
    }

    createItemDetails() {
        this.itemDetailsElement = document.createElement('div');
        this.itemDetailsElement.style.cssText = `
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid #666;
            border-radius: 4px;
            padding: 15px;
            min-height: 150px;
        `;
        
        this.mainAreaElement.appendChild(this.itemDetailsElement);
        this.updateItemDetails(null);
    }

    createItemTooltip() {
        this.tooltip = document.createElement('div');
        this.tooltip.style.cssText = `
            position: fixed;
            background: rgba(0, 0, 0, 0.9);
            border: 1px solid #666;
            border-radius: 4px;
            padding: 10px;
            color: white;
            font-size: 12px;
            max-width: 250px;
            z-index: 1001;
            display: none;
            pointer-events: none;
        `;
        
        document.body.appendChild(this.tooltip);
    }

    selectCategory(categoryKey) {
        // Update tab appearance
        Object.entries(this.categoryTabs).forEach(([key, tab]) => {
            if (key === categoryKey) {
                tab.classList.add('active');
                tab.style.background = 'rgba(255, 255, 255, 0.1)';
            } else {
                tab.classList.remove('active');
                tab.style.background = 'transparent';
            }
        });
        
        this.currentCategory = categoryKey;
        this.updateInventoryGrid();
    }

    updateInventoryGrid() {
        // Clear existing slots
        this.inventoryGrid.innerHTML = '';
        this.inventorySlots = [];
        
        const category = this.categories[this.currentCategory];
        const items = this.getItemsByCategory(this.currentCategory);
        
        // Create slots for this category
        for (let i = 0; i < category.slots; i++) {
            const slot = this.createInventorySlot(i, items[i] || null);
            this.inventoryGrid.appendChild(slot);
            this.inventorySlots.push(slot);
        }
    }

    createInventorySlot(index, item) {
        const slot = document.createElement('div');
        slot.className = 'inventory-slot';
        slot.dataset.index = index;
        slot.style.cssText = `
            width: ${this.slotSize}px;
            height: ${this.slotSize}px;
            background: rgba(255, 255, 255, 0.1);
            border: 2px solid #666;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            position: relative;
            transition: border-color 0.2s;
        `;
        
        if (item) {
            this.populateSlot(slot, item);
        }
        
        // Add event listeners
        slot.addEventListener('click', () => this.selectSlot(index));
        slot.addEventListener('dblclick', () => this.useItem(item));
        slot.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showItemContextMenu(item, e);
        });
        slot.addEventListener('mouseenter', (e) => this.showTooltip(item, e));
        slot.addEventListener('mouseleave', () => this.hideTooltip());
        
        // Drag and drop
        slot.addEventListener('dragstart', (e) => this.onDragStart(e, item));
        slot.addEventListener('dragover', (e) => this.onDragOver(e));
        slot.addEventListener('drop', (e) => this.onDrop(e, index));
        
        return slot;
    }

    populateSlot(slot, item) {
        slot.innerHTML = '';
        
        // Item icon
        const icon = document.createElement('div');
        icon.style.cssText = `
            font-size: 24px;
            margin-bottom: 4px;
        `;
        icon.textContent = this.getItemIcon(item);
        
        // Item quantity (if applicable)
        if (item.quantity > 1) {
            const quantity = document.createElement('div');
            quantity.style.cssText = `
                position: absolute;
                bottom: 2px;
                right: 2px;
                background: rgba(0, 0, 0, 0.7);
                border-radius: 2px;
                padding: 1px 4px;
                font-size: 10px;
                font-weight: bold;
            `;
            quantity.textContent = item.quantity;
            slot.appendChild(quantity);
        }
        
        // Quality indicator
        if (item.quality) {
            slot.style.borderColor = this.getQualityColor(item.quality);
        }
        
        slot.appendChild(icon);
        slot.draggable = true;
    }

    getItemsByCategory(category) {
        if (!this.inventorySystem) return [];
        
        return this.inventorySystem.items.filter(item => {
            switch (category) {
                case 'weapons':
                    return item.type === 'weapon';
                case 'equipment':
                    return ['equipment', 'gear', 'armor'].includes(item.type);
                case 'consumables':
                    return ['consumable', 'food', 'medical'].includes(item.type);
                case 'ammunition':
                    return item.type === 'ammunition';
                case 'attachments':
                    return item.type === 'attachment';
                default:
                    return false;
            }
        });
    }

    getItemIcon(item) {
        if (!item) return '';
        
        switch (item.type) {
            case 'weapon':
                return item.subtype === 'pistol' ? '🔫' : 
                       item.subtype === 'rifle' ? '🔫' :
                       item.subtype === 'sniper' ? '🎯' :
                       item.subtype === 'shotgun' ? '💥' : '🔫';
            case 'equipment':
                return item.subtype === 'helmet' ? '⛑️' :
                       item.subtype === 'vest' ? '🦺' :
                       item.subtype === 'boots' ? '👢' : '🎒';
            case 'consumable':
                return item.subtype === 'health' ? '💊' :
                       item.subtype === 'energy' ? '⚡' : '🍎';
            case 'ammunition':
                return '📦';
            case 'attachment':
                return item.subtype === 'scope' ? '🔭' :
                       item.subtype === 'grip' ? '✋' :
                       item.subtype === 'barrel' ? '🔧' : '⚙️';
            default:
                return '📦';
        }
    }

    getQualityColor(quality) {
        switch (quality) {
            case 'common': return '#9d9d9d';
            case 'uncommon': return '#1eff00';
            case 'rare': return '#0070dd';
            case 'epic': return '#a335ee';
            case 'legendary': return '#ff8000';
            default: return '#666';
        }
    }

    selectSlot(index) {
        // Remove previous selection
        this.inventorySlots.forEach(slot => {
            slot.style.boxShadow = 'none';
        });
        
        // Highlight selected slot
        if (this.inventorySlots[index]) {
            this.inventorySlots[index].style.boxShadow = '0 0 10px rgba(255, 255, 255, 0.5)';
            this.selectedSlot = index;
            
            const items = this.getItemsByCategory(this.currentCategory);
            this.updateItemDetails(items[index] || null);
        }
    }

    updateItemDetails(item) {
        if (!item) {
            this.itemDetailsElement.innerHTML = `
                <div style="text-align: center; color: #666; padding: 40px;">
                    Select an item to view details
                </div>
            `;
            return;
        }
        
        this.itemDetailsElement.innerHTML = `
            <div style="display: flex; align-items: center; margin-bottom: 15px;">
                <div style="font-size: 32px; margin-right: 15px;">${this.getItemIcon(item)}</div>
                <div>
                    <h3 style="margin: 0; color: ${this.getQualityColor(item.quality)};">${item.name}</h3>
                    <div style="color: #999; font-size: 14px;">${item.type} - ${item.subtype}</div>
                </div>
            </div>
            <div style="margin-bottom: 15px;">
                <p style="margin: 0; color: #ccc; font-size: 14px; line-height: 1.4;">
                    ${item.description || 'No description available.'}
                </p>
            </div>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 12px;">
                ${this.getItemStats(item)}
            </div>
            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #666;">
                <div style="display: flex; gap: 10px;">
                    ${this.getItemActions(item)}
                </div>
            </div>
        `;
    }

    getItemStats(item) {
        let stats = '';
        
        if (item.stats) {
            Object.entries(item.stats).forEach(([key, value]) => {
                stats += `
                    <div>
                        <span style="color: #999;">${key}:</span>
                        <span style="color: #fff; float: right;">${value}</span>
                    </div>
                `;
            });
        }
        
        if (item.quantity) {
            stats += `
                <div>
                    <span style="color: #999;">Quantity:</span>
                    <span style="color: #fff; float: right;">${item.quantity}</span>
                </div>
            `;
        }
        
        return stats;
    }

    getItemActions(item) {
        let actions = '';
        
        switch (item.type) {
            case 'weapon':
                actions += `<button onclick="inventoryUI.equipWeapon('${item.id}')" class="action-button">Equip</button>`;
                break;
            case 'consumable':
                actions += `<button onclick="inventoryUI.useItem('${item.id}')" class="action-button">Use</button>`;
                break;
            case 'equipment':
                actions += `<button onclick="inventoryUI.equipItem('${item.id}')" class="action-button">Equip</button>`;
                break;
        }
        
        actions += `<button onclick="inventoryUI.dropItem('${item.id}')" class="action-button secondary">Drop</button>`;
        
        return actions;
    }

    setupEventListeners() {
        this.app.on('input:keydown', this.onKeyDown, this);
        this.app.on('inventory:updated', this.onInventoryUpdated, this);
        this.app.on('item:added', this.onItemAdded, this);
        this.app.on('item:removed', this.onItemRemoved, this);
        
        // Add CSS for action buttons
        const style = document.createElement('style');
        style.textContent = `
            .action-button {
                background: #4a90e2;
                border: none;
                color: white;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                transition: background 0.2s;
            }
            .action-button:hover {
                background: #357abd;
            }
            .action-button.secondary {
                background: #666;
            }
            .action-button.secondary:hover {
                background: #555;
            }
        `;
        document.head.appendChild(style);
    }

    onKeyDown(data) {
        if (data.key === this.toggleKey) {
            this.toggleInventory();
        } else if (data.key === 'Escape' && this.isVisible) {
            this.hideInventory();
        }
    }

    toggleInventory() {
        if (this.isVisible) {
            this.hideInventory();
        } else {
            this.showInventory();
        }
    }

    showInventory() {
        this.isVisible = true;
        this.inventoryElement.style.display = 'block';
        this.updateInventoryGrid();
        
        // Pause game or show cursor
        this.app.fire('game:pause', true);
    }

    hideInventory() {
        this.isVisible = false;
        this.inventoryElement.style.display = 'none';
        this.hideTooltip();
        
        // Resume game
        this.app.fire('game:pause', false);
    }

    showTooltip(item, event) {
        if (!item) return;
        
        this.tooltip.innerHTML = `
            <div style="font-weight: bold; color: ${this.getQualityColor(item.quality)};">${item.name}</div>
            <div style="color: #999; font-size: 11px; margin-bottom: 5px;">${item.type} - ${item.subtype}</div>
            <div style="font-size: 11px;">${item.description}</div>
        `;
        
        this.tooltip.style.display = 'block';
        this.tooltip.style.left = (event.pageX + 10) + 'px';
        this.tooltip.style.top = (event.pageY + 10) + 'px';
    }

    hideTooltip() {
        this.tooltip.style.display = 'none';
    }

    onInventoryUpdated() {
        if (this.isVisible) {
            this.updateInventoryGrid();
        }
    }

    onItemAdded(data) {
        // Show notification or highlight new item
        console.log(`Item added: ${data.item.name}`);
    }

    onItemRemoved(data) {
        // Update display if current item was removed
        console.log(`Item removed: ${data.item.name}`);
    }

    // Item action methods (to be called from UI buttons)
    equipWeapon(itemId) {
        if (this.weaponManager) {
            this.weaponManager.equipWeapon(itemId);
        }
    }

    equipItem(itemId) {
        if (this.inventorySystem) {
            this.inventorySystem.equipItem(itemId);
        }
    }

    useItem(itemId) {
        if (this.inventorySystem) {
            this.inventorySystem.useItem(itemId);
        }
    }

    dropItem(itemId) {
        if (this.inventorySystem) {
            this.inventorySystem.dropItem(itemId);
        }
    }

    destroy() {
        // Clean up event listeners
        this.app.off('input:keydown', this.onKeyDown, this);
        this.app.off('inventory:updated', this.onInventoryUpdated, this);
        this.app.off('item:added', this.onItemAdded, this);
        this.app.off('item:removed', this.onItemRemoved, this);
        
        // Remove UI elements
        if (this.inventoryElement && this.inventoryElement.parentNode) {
            this.inventoryElement.parentNode.removeChild(this.inventoryElement);
        }
        
        if (this.tooltip && this.tooltip.parentNode) {
            this.tooltip.parentNode.removeChild(this.tooltip);
        }
    }
}

pc.registerScript(InventoryUI, 'InventoryUI');
