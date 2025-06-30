/**
 * InventorySystem.js
 * Comprehensive inventory management system
 * Handles weapon/equipment management, attachments, ammunition, item pickup/drop, and loadout customization
 */

class InventorySystem extends pc.ScriptType {
    static get scriptName() { return 'InventorySystem'; }

    initialize() {
        this.gameManager = this.app.root.findByName('Game_Manager').script.gameManager;
        this.networkManager = this.app.root.findByName('Game_Manager').script.networkManager;
        this.audioManager = this.app.root.findByName('Game_Manager').script.audioManager;
        
        // Inventory slots
        this.primaryWeapon = null;
        this.secondaryWeapon = null;
        this.meleeWeapon = null;
        this.explosives = [];
        this.equipment = [];
        this.consumables = [];
        
        // Ammunition tracking
        this.ammunition = new Map(); // ammo type -> count
        this.maxAmmoCapacity = new Map(); // ammo type -> max capacity
        
        // Equipment slots
        this.armor = null;
        this.helmet = null;
        this.backpack = null;
        this.attachments = new Map(); // weapon -> attachments array
        
        // Inventory constraints
        this.maxWeight = 100.0;
        this.currentWeight = 0.0;
        this.maxEquipment = 3;
        this.maxConsumables = 5;
        this.maxExplosives = 4;
        
        // Current selections
        this.currentWeaponSlot = 'primary';
        this.selectedExplosive = 0;
        this.selectedConsumable = 0;
        
        // Events
        this.inventoryChanged = new pc.EventHandler();
        this.weaponChanged = new pc.EventHandler();
        this.ammoChanged = new pc.EventHandler();
        
        this.initializeDefaultLoadout();
        this.setupEventListeners();
    }

    initializeDefaultLoadout() {
        // Set default ammunition capacities
        this.maxAmmoCapacity.set('rifle', 300);
        this.maxAmmoCapacity.set('pistol', 150);
        this.maxAmmoCapacity.set('sniper', 50);
        this.maxAmmoCapacity.set('shotgun', 64);
        this.maxAmmoCapacity.set('explosive', 12);
        
        // Initialize with starting ammunition
        this.ammunition.set('rifle', 90);
        this.ammunition.set('pistol', 45);
        
        // Default melee weapon
        this.meleeWeapon = {
            name: 'Combat Knife',
            damage: 50,
            weight: 0.5,
            type: 'melee'
        };
    }

    setupEventListeners() {
        // Listen for pickup events
        this.app.on('item:pickup', this.onItemPickup, this);
        this.app.on('weapon:pickup', this.onWeaponPickup, this);
        this.app.on('ammo:pickup', this.onAmmoPickup, this);
        
        // Listen for weapon switching
        this.app.on('input:switchPrimary', () => this.switchToWeapon('primary'));
        this.app.on('input:switchSecondary', () => this.switchToWeapon('secondary'));
        this.app.on('input:switchMelee', () => this.switchToWeapon('melee'));
        this.app.on('input:nextWeapon', this.switchToNextWeapon.bind(this));
        this.app.on('input:previousWeapon', this.switchToPreviousWeapon.bind(this));
        
        // Listen for consumable/explosive usage
        this.app.on('input:useExplosive', this.useExplosive.bind(this));
        this.app.on('input:useConsumable', this.useConsumable.bind(this));
    }

    // Weapon Management
    addWeapon(weaponData, slot = null) {
        if (!weaponData) return false;
        
        // Determine slot if not specified
        if (!slot) {
            slot = this.determineWeaponSlot(weaponData);
        }
        
        // Check weight constraints
        if (this.currentWeight + weaponData.weight > this.maxWeight) {
            this.app.fire('inventory:weightExceeded');
            return false;
        }
        
        // Store previous weapon for dropping
        let previousWeapon = null;
        
        switch (slot) {
            case 'primary':
                previousWeapon = this.primaryWeapon;
                this.primaryWeapon = weaponData;
                break;
            case 'secondary':
                previousWeapon = this.secondaryWeapon;
                this.secondaryWeapon = weaponData;
                break;
            case 'melee':
                previousWeapon = this.meleeWeapon;
                this.meleeWeapon = weaponData;
                break;
            default:
                return false;
        }
        
        // Update weight
        if (previousWeapon) {
            this.currentWeight -= previousWeapon.weight;
        }
        this.currentWeight += weaponData.weight;
        
        // Drop previous weapon if it exists
        if (previousWeapon && previousWeapon.name !== 'Combat Knife') {
            this.dropWeapon(previousWeapon);
        }
        
        // Update UI and notify systems
        this.weaponChanged.fire(slot, weaponData, previousWeapon);
        this.inventoryChanged.fire();
        
        // Play pickup sound
        this.audioManager?.playSound('weapon_pickup', this.entity.getPosition());
        
        return true;
    }

    removeWeapon(slot) {
        let weapon = null;
        
        switch (slot) {
            case 'primary':
                weapon = this.primaryWeapon;
                this.primaryWeapon = null;
                break;
            case 'secondary':
                weapon = this.secondaryWeapon;
                this.secondaryWeapon = null;
                break;
            case 'melee':
                if (this.meleeWeapon.name !== 'Combat Knife') {
                    weapon = this.meleeWeapon;
                    this.meleeWeapon = {
                        name: 'Combat Knife',
                        damage: 50,
                        weight: 0.5,
                        type: 'melee'
                    };
                }
                break;
        }
        
        if (weapon) {
            this.currentWeight -= weapon.weight;
            this.weaponChanged.fire(slot, null, weapon);
            this.inventoryChanged.fire();
        }
        
        return weapon;
    }

    switchToWeapon(slot) {
        let weapon = null;
        
        switch (slot) {
            case 'primary':
                weapon = this.primaryWeapon;
                break;
            case 'secondary':
                weapon = this.secondaryWeapon;
                break;
            case 'melee':
                weapon = this.meleeWeapon;
                break;
        }
        
        if (weapon && this.currentWeaponSlot !== slot) {
            this.currentWeaponSlot = slot;
            this.app.fire('weapon:switch', weapon, slot);
            return true;
        }
        
        return false;
    }

    switchToNextWeapon() {
        const slots = ['primary', 'secondary', 'melee'];
        const currentIndex = slots.indexOf(this.currentWeaponSlot);
        
        for (let i = 1; i <= slots.length; i++) {
            const nextIndex = (currentIndex + i) % slots.length;
            const nextSlot = slots[nextIndex];
            
            if (this.hasWeaponInSlot(nextSlot)) {
                return this.switchToWeapon(nextSlot);
            }
        }
        
        return false;
    }

    switchToPreviousWeapon() {
        const slots = ['primary', 'secondary', 'melee'];
        const currentIndex = slots.indexOf(this.currentWeaponSlot);
        
        for (let i = 1; i <= slots.length; i++) {
            const prevIndex = (currentIndex - i + slots.length) % slots.length;
            const prevSlot = slots[prevIndex];
            
            if (this.hasWeaponInSlot(prevSlot)) {
                return this.switchToWeapon(prevSlot);
            }
        }
        
        return false;
    }

    hasWeaponInSlot(slot) {
        switch (slot) {
            case 'primary':
                return this.primaryWeapon !== null;
            case 'secondary':
                return this.secondaryWeapon !== null;
            case 'melee':
                return this.meleeWeapon !== null;
            default:
                return false;
        }
    }

    determineWeaponSlot(weaponData) {
        switch (weaponData.type) {
            case 'assault_rifle':
            case 'sniper_rifle':
            case 'shotgun':
            case 'lmg':
                return 'primary';
            case 'pistol':
            case 'smg':
                return 'secondary';
            case 'melee':
                return 'melee';
            default:
                return 'primary';
        }
    }

    // Ammunition Management
    addAmmunition(ammoType, amount) {
        const current = this.ammunition.get(ammoType) || 0;
        const maxCapacity = this.maxAmmoCapacity.get(ammoType) || 0;
        const actualAmount = Math.min(amount, maxCapacity - current);
        
        if (actualAmount > 0) {
            this.ammunition.set(ammoType, current + actualAmount);
            this.ammoChanged.fire(ammoType, current + actualAmount, maxCapacity);
            this.inventoryChanged.fire();
            return actualAmount;
        }
        
        return 0;
    }

    consumeAmmunition(ammoType, amount) {
        const current = this.ammunition.get(ammoType) || 0;
        const actualAmount = Math.min(amount, current);
        
        if (actualAmount > 0) {
            this.ammunition.set(ammoType, current - actualAmount);
            this.ammoChanged.fire(ammoType, current - actualAmount, this.maxAmmoCapacity.get(ammoType) || 0);
            this.inventoryChanged.fire();
            return actualAmount;
        }
        
        return 0;
    }

    getAmmunition(ammoType) {
        return this.ammunition.get(ammoType) || 0;
    }

    getMaxAmmunition(ammoType) {
        return this.maxAmmoCapacity.get(ammoType) || 0;
    }

    // Equipment Management
    addEquipment(equipmentData) {
        if (this.equipment.length >= this.maxEquipment) {
            this.app.fire('inventory:equipmentFull');
            return false;
        }
        
        if (this.currentWeight + equipmentData.weight > this.maxWeight) {
            this.app.fire('inventory:weightExceeded');
            return false;
        }
        
        this.equipment.push(equipmentData);
        this.currentWeight += equipmentData.weight;
        this.inventoryChanged.fire();
        
        return true;
    }

    removeEquipment(index) {
        if (index >= 0 && index < this.equipment.length) {
            const equipment = this.equipment.splice(index, 1)[0];
            this.currentWeight -= equipment.weight;
            this.inventoryChanged.fire();
            return equipment;
        }
        
        return null;
    }

    // Explosive Management
    addExplosive(explosiveData) {
        if (this.explosives.length >= this.maxExplosives) {
            this.app.fire('inventory:explosivesFull');
            return false;
        }
        
        this.explosives.push(explosiveData);
        this.inventoryChanged.fire();
        
        return true;
    }

    useExplosive() {
        if (this.explosives.length > this.selectedExplosive) {
            const explosive = this.explosives[this.selectedExplosive];
            
            if (explosive.quantity > 1) {
                explosive.quantity--;
            } else {
                this.explosives.splice(this.selectedExplosive, 1);
                if (this.selectedExplosive >= this.explosives.length) {
                    this.selectedExplosive = Math.max(0, this.explosives.length - 1);
                }
            }
            
            this.inventoryChanged.fire();
            this.app.fire('explosive:use', explosive);
            
            return explosive;
        }
        
        return null;
    }

    // Consumable Management
    addConsumable(consumableData) {
        if (this.consumables.length >= this.maxConsumables) {
            this.app.fire('inventory:consumablesFull');
            return false;
        }
        
        // Stack similar consumables
        const existing = this.consumables.find(c => c.name === consumableData.name);
        if (existing) {
            existing.quantity += consumableData.quantity || 1;
        } else {
            this.consumables.push({
                ...consumableData,
                quantity: consumableData.quantity || 1
            });
        }
        
        this.inventoryChanged.fire();
        return true;
    }

    useConsumable() {
        if (this.consumables.length > this.selectedConsumable) {
            const consumable = this.consumables[this.selectedConsumable];
            
            if (consumable.quantity > 1) {
                consumable.quantity--;
            } else {
                this.consumables.splice(this.selectedConsumable, 1);
                if (this.selectedConsumable >= this.consumables.length) {
                    this.selectedConsumable = Math.max(0, this.consumables.length - 1);
                }
            }
            
            this.inventoryChanged.fire();
            this.app.fire('consumable:use', consumable);
            
            return consumable;
        }
        
        return null;
    }

    // Attachment Management
    addAttachment(weaponSlot, attachmentData) {
        if (!attachmentData || !weaponSlot) return false;
        
        const weapon = this.getWeaponInSlot(weaponSlot);
        if (!weapon) return false;
        
        if (!this.attachments.has(weaponSlot)) {
            this.attachments.set(weaponSlot, []);
        }
        
        const weaponAttachments = this.attachments.get(weaponSlot);
        
        // Remove existing attachment of same type
        const existingIndex = weaponAttachments.findIndex(att => att.type === attachmentData.type);
        let removedAttachment = null;
        
        if (existingIndex !== -1) {
            removedAttachment = weaponAttachments.splice(existingIndex, 1)[0];
        }
        
        weaponAttachments.push(attachmentData);
        this.inventoryChanged.fire();
        
        // Apply attachment effects to weapon
        this.applyAttachmentEffects(weaponSlot);
        
        return { added: attachmentData, removed: removedAttachment };
    }

    removeAttachment(weaponSlot, attachmentType) {
        if (!this.attachments.has(weaponSlot)) return null;
        
        const weaponAttachments = this.attachments.get(weaponSlot);
        const index = weaponAttachments.findIndex(att => att.type === attachmentType);
        
        if (index !== -1) {
            const attachment = weaponAttachments.splice(index, 1)[0];
            this.inventoryChanged.fire();
            this.applyAttachmentEffects(weaponSlot);
            return attachment;
        }
        
        return null;
    }

    getAttachments(weaponSlot) {
        return this.attachments.get(weaponSlot) || [];
    }

    applyAttachmentEffects(weaponSlot) {
        const weapon = this.getWeaponInSlot(weaponSlot);
        const attachments = this.getAttachments(weaponSlot);
        
        if (!weapon) return;
        
        // Reset weapon stats to base values
        weapon.stats = { ...weapon.baseStats };
        
        // Apply each attachment's effects
        attachments.forEach(attachment => {
            if (attachment.effects) {
                Object.keys(attachment.effects).forEach(stat => {
                    weapon.stats[stat] = (weapon.stats[stat] || 0) + attachment.effects[stat];
                });
            }
        });
        
        this.app.fire('weapon:statsUpdated', weaponSlot, weapon);
    }

    // Item Pickup/Drop
    onItemPickup(item) {
        if (!item) return;
        
        switch (item.category) {
            case 'weapon':
                this.onWeaponPickup(item.data);
                break;
            case 'ammunition':
                this.onAmmoPickup(item.data);
                break;
            case 'equipment':
                this.addEquipment(item.data);
                break;
            case 'consumable':
                this.addConsumable(item.data);
                break;
            case 'explosive':
                this.addExplosive(item.data);
                break;
            case 'attachment':
                this.addAttachment(item.targetSlot || 'primary', item.data);
                break;
        }
    }

    onWeaponPickup(weaponData) {
        this.addWeapon(weaponData);
    }

    onAmmoPickup(ammoData) {
        this.addAmmunition(ammoData.type, ammoData.amount);
    }

    dropWeapon(weapon, position = null) {
        if (!weapon) return;
        
        const dropPosition = position || this.entity.getPosition().clone();
        dropPosition.y += 1; // Drop slightly above ground
        
        this.app.fire('item:drop', {
            type: 'weapon',
            data: weapon,
            position: dropPosition
        });
    }

    dropCurrentWeapon() {
        const currentWeapon = this.getCurrentWeapon();
        if (currentWeapon && currentWeapon.name !== 'Combat Knife') {
            this.removeWeapon(this.currentWeaponSlot);
            this.dropWeapon(currentWeapon);
        }
    }

    // Utility Methods
    getCurrentWeapon() {
        return this.getWeaponInSlot(this.currentWeaponSlot);
    }

    getWeaponInSlot(slot) {
        switch (slot) {
            case 'primary':
                return this.primaryWeapon;
            case 'secondary':
                return this.secondaryWeapon;
            case 'melee':
                return this.meleeWeapon;
            default:
                return null;
        }
    }

    getCurrentWeaponSlot() {
        return this.currentWeaponSlot;
    }

    getTotalWeight() {
        return this.currentWeight;
    }

    getMaxWeight() {
        return this.maxWeight;
    }

    getInventoryData() {
        return {
            weapons: {
                primary: this.primaryWeapon,
                secondary: this.secondaryWeapon,
                melee: this.meleeWeapon
            },
            ammunition: Object.fromEntries(this.ammunition),
            equipment: this.equipment,
            explosives: this.explosives,
            consumables: this.consumables,
            attachments: Object.fromEntries(this.attachments),
            currentWeaponSlot: this.currentWeaponSlot,
            weight: {
                current: this.currentWeight,
                max: this.maxWeight
            }
        };
    }

    loadInventoryData(data) {
        if (!data) return;
        
        // Load weapons
        this.primaryWeapon = data.weapons?.primary || null;
        this.secondaryWeapon = data.weapons?.secondary || null;
        this.meleeWeapon = data.weapons?.melee || this.meleeWeapon;
        
        // Load ammunition
        if (data.ammunition) {
            this.ammunition = new Map(Object.entries(data.ammunition));
        }
        
        // Load equipment and consumables
        this.equipment = data.equipment || [];
        this.explosives = data.explosives || [];
        this.consumables = data.consumables || [];
        
        // Load attachments
        if (data.attachments) {
            this.attachments = new Map(Object.entries(data.attachments));
        }
        
        // Load current state
        this.currentWeaponSlot = data.currentWeaponSlot || 'primary';
        this.currentWeight = data.weight?.current || this.calculateCurrentWeight();
        
        this.inventoryChanged.fire();
    }

    calculateCurrentWeight() {
        let weight = 0;
        
        // Add weapon weights
        if (this.primaryWeapon) weight += this.primaryWeapon.weight || 0;
        if (this.secondaryWeapon) weight += this.secondaryWeapon.weight || 0;
        if (this.meleeWeapon) weight += this.meleeWeapon.weight || 0;
        
        // Add equipment weights
        this.equipment.forEach(item => weight += item.weight || 0);
        
        return weight;
    }

    // Network synchronization
    getNetworkState() {
        return {
            currentWeaponSlot: this.currentWeaponSlot,
            weapons: {
                primary: this.primaryWeapon?.name,
                secondary: this.secondaryWeapon?.name,
                melee: this.meleeWeapon?.name
            },
            ammunition: Object.fromEntries(this.ammunition)
        };
    }

    applyNetworkState(state) {
        if (state.currentWeaponSlot !== this.currentWeaponSlot) {
            this.switchToWeapon(state.currentWeaponSlot);
        }
        
        // Update ammunition from network
        if (state.ammunition) {
            Object.entries(state.ammunition).forEach(([type, amount]) => {
                this.ammunition.set(type, amount);
            });
            this.inventoryChanged.fire();
        }
    }
}

pc.registerScript(InventorySystem, 'InventorySystem');
