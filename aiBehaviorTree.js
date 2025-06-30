/**
 * AIBehaviorTree.js
 * Advanced AI behavior tree system for complex decision making
 * Handles behavior nodes, dynamic behavior switching, team coordination, and objective-based AI
 */

class AIBehaviorTree extends pc.ScriptType {
    static get scriptName() { return 'AIBehaviorTree'; }

    initialize() {
        this.aiController = this.entity.script.aiController;
        this.aiPerception = this.entity.script.aiPerception;
        this.gameManager = this.app.root.findByName('Game_Manager').script.gameManager;
        
        // Behavior tree structure
        this.rootNode = null;
        this.currentNode = null;
        this.nodeStack = [];
        this.blackboard = new Map(); // Shared data between nodes
        
        // Behavior tree state
        this.isRunning = false;
        this.updateRate = 30; // Updates per second
        this.lastUpdate = 0;
        
        // Node types and factories
        this.nodeTypes = new Map();
        this.compositeNodes = new Map();
        this.decoratorNodes = new Map();
        this.leafNodes = new Map();
        
        // Behavior presets
        this.behaviorPresets = new Map();
        this.currentPreset = 'default';
        
        // Team coordination
        this.teamId = null;
        this.squadId = null;
        this.role = 'soldier'; // soldier, leader, support, sniper
        this.teamData = new Map();
        
        // Objective system
        this.currentObjective = null;
        this.objectiveHistory = [];
        this.objectivePriority = 1.0;
        
        // Performance tracking
        this.executionTime = 0;
        this.nodeExecutions = new Map();
        
        this.initializeBehaviorTree();
        this.setupEventListeners();
    }

    initializeBehaviorTree() {
        this.registerNodeTypes();
        this.createBehaviorPresets();
        this.buildDefaultBehaviorTree();
        this.initializeBlackboard();
    }

    registerNodeTypes() {
        // Composite nodes (have multiple children)
        this.registerCompositeNode('Sequence', SequenceNode);
        this.registerCompositeNode('Selector', SelectorNode);
        this.registerCompositeNode('Parallel', ParallelNode);
        this.registerCompositeNode('RandomSelector', RandomSelectorNode);
        this.registerCompositeNode('WeightedSelector', WeightedSelectorNode);
        
        // Decorator nodes (have one child)
        this.registerDecoratorNode('Inverter', InverterNode);
        this.registerDecoratorNode('Repeater', RepeaterNode);
        this.registerDecoratorNode('RetryUntilFail', RetryUntilFailNode);
        this.registerDecoratorNode('Timer', TimerNode);
        this.registerDecoratorNode('Cooldown', CooldownNode);
        this.registerDecoratorNode('Condition', ConditionNode);
        
        // Leaf nodes (action nodes)
        this.registerLeafNode('Patrol', PatrolNode);
        this.registerLeafNode('Investigate', InvestigateNode);
        this.registerLeafNode('Hunt', HuntNode);
        this.registerLeafNode('Attack', AttackNode);
        this.registerLeafNode('TakeCover', TakeCoverNode);
        this.registerLeafNode('Reload', ReloadNode);
        this.registerLeafNode('Communicate', CommunicateNode);
        this.registerLeafNode('MoveTo', MoveToNode);
        this.registerLeafNode('Wait', WaitNode);
        this.registerLeafNode('UseAbility', UseAbilityNode);
        this.registerLeafNode('FlankTarget', FlankTargetNode);
        this.registerLeafNode('SuppressFire', SuppressFireNode);
        this.registerLeafNode('ThrowGrenade', ThrowGrenadeNode);
        this.registerLeafNode('CallForBackup', CallForBackupNode);
        this.registerLeafNode('ReviveAlly', ReviveAllyNode);
        this.registerLeafNode('DefendPosition', DefendPositionNode);
    }

    registerCompositeNode(name, nodeClass) {
        this.compositeNodes.set(name, nodeClass);
        this.nodeTypes.set(name, 'composite');
    }

    registerDecoratorNode(name, nodeClass) {
        this.decoratorNodes.set(name, nodeClass);
        this.nodeTypes.set(name, 'decorator');
    }

    registerLeafNode(name, nodeClass) {
        this.leafNodes.set(name, nodeClass);
        this.nodeTypes.set(name, 'leaf');
    }

    createBehaviorPresets() {
        // Default AI behavior
        this.behaviorPresets.set('default', {
            name: 'Default Soldier',
            description: 'Standard combat AI behavior',
            tree: this.createDefaultBehaviorTree()
        });

        // Aggressive behavior
        this.behaviorPresets.set('aggressive', {
            name: 'Aggressive Fighter',
            description: 'Aggressive AI that prioritizes combat',
            tree: this.createAggressiveBehaviorTree()
        });

        // Defensive behavior
        this.behaviorPresets.set('defensive', {
            name: 'Defensive Guard',
            description: 'Defensive AI that holds positions',
            tree: this.createDefensiveBehaviorTree()
        });

        // Support behavior
        this.behaviorPresets.set('support', {
            name: 'Support Unit',
            description: 'Support AI that assists teammates',
            tree: this.createSupportBehaviorTree()
        });

        // Sniper behavior
        this.behaviorPresets.set('sniper', {
            name: 'Sniper',
            description: 'Long-range combat specialist',
            tree: this.createSniperBehaviorTree()
        });

        // Leader behavior
        this.behaviorPresets.set('leader', {
            name: 'Squad Leader',
            description: 'AI that commands other units',
            tree: this.createLeaderBehaviorTree()
        });
    }

    createDefaultBehaviorTree() {
        // Root selector - chooses between combat and non-combat behaviors
        return {
            type: 'Selector',
            children: [
                {
                    type: 'Sequence', // Combat sequence
                    children: [
                        {
                            type: 'Condition',
                            condition: 'HasTarget',
                            child: {
                                type: 'Selector',
                                children: [
                                    {
                                        type: 'Sequence', // Attack sequence
                                        children: [
                                            {
                                                type: 'Condition',
                                                condition: 'CanSeeTarget',
                                                child: {
                                                    type: 'Parallel',
                                                    children: [
                                                        { type: 'Attack' },
                                                        { type: 'TakeCover' }
                                                    ]
                                                }
                                            }
                                        ]
                                    },
                                    {
                                        type: 'Hunt' // Hunt if can't see target
                                    }
                                ]
                            }
                        }
                    ]
                },
                {
                    type: 'Sequence', // Investigation sequence
                    children: [
                        {
                            type: 'Condition',
                            condition: 'HasInvestigationPoint',
                            child: {
                                type: 'Investigate'
                            }
                        }
                    ]
                },
                {
                    type: 'Patrol' // Default patrol behavior
                }
            ]
        };
    }

    createAggressiveBehaviorTree() {
        return {
            type: 'Selector',
            children: [
                {
                    type: 'Sequence',
                    children: [
                        {
                            type: 'Condition',
                            condition: 'HasTarget',
                            child: {
                                type: 'Selector',
                                children: [
                                    {
                                        type: 'Sequence',
                                        children: [
                                            {
                                                type: 'Condition',
                                                condition: 'CanSeeTarget',
                                                child: {
                                                    type: 'Selector',
                                                    children: [
                                                        { type: 'ThrowGrenade' },
                                                        { type: 'Attack' }
                                                    ]
                                                }
                                            }
                                        ]
                                    },
                                    { type: 'FlankTarget' },
                                    { type: 'Hunt' }
                                ]
                            }
                        }
                    ]
                },
                { type: 'Patrol' }
            ]
        };
    }

    createDefensiveBehaviorTree() {
        return {
            type: 'Selector',
            children: [
                {
                    type: 'Sequence',
                    children: [
                        {
                            type: 'Condition',
                            condition: 'HasTarget',
                            child: {
                                type: 'Sequence',
                                children: [
                                    { type: 'TakeCover' },
                                    { type: 'Attack' },
                                    { type: 'CallForBackup' }
                                ]
                            }
                        }
                    ]
                },
                { type: 'DefendPosition' }
            ]
        };
    }

    createSupportBehaviorTree() {
        return {
            type: 'Selector',
            children: [
                {
                    type: 'Sequence',
                    children: [
                        {
                            type: 'Condition',
                            condition: 'AllyNeedsRevive',
                            child: { type: 'ReviveAlly' }
                        }
                    ]
                },
                {
                    type: 'Sequence',
                    children: [
                        {
                            type: 'Condition',
                            condition: 'HasTarget',
                            child: {
                                type: 'Selector',
                                children: [
                                    { type: 'SuppressFire' },
                                    { type: 'TakeCover' }
                                ]
                            }
                        }
                    ]
                },
                { type: 'Patrol' }
            ]
        };
    }

    createSniperBehaviorTree() {
        return {
            type: 'Selector',
            children: [
                {
                    type: 'Sequence',
                    children: [
                        {
                            type: 'Condition',
                            condition: 'HasTarget',
                            child: {
                                type: 'Sequence',
                                children: [
                                    {
                                        type: 'Condition',
                                        condition: 'HasClearShot',
                                        child: { type: 'Attack' }
                                    }
                                ]
                            }
                        }
                    ]
                },
                {
                    type: 'Sequence',
                    children: [
                        {
                            type: 'Condition',
                            condition: 'NeedsRepositioning',
                            child: { type: 'MoveTo' }
                        }
                    ]
                },
                { type: 'Wait' }
            ]
        };
    }

    createLeaderBehaviorTree() {
        return {
            type: 'Parallel',
            children: [
                {
                    type: 'Selector',
                    children: [
                        {
                            type: 'Sequence',
                            children: [
                                {
                                    type: 'Condition',
                                    condition: 'HasTarget',
                                    child: {
                                        type: 'Sequence',
                                        children: [
                                            { type: 'Communicate' },
                                            { type: 'Attack' }
                                        ]
                                    }
                                }
                            ]
                        },
                        { type: 'Patrol' }
                    ]
                },
                {
                    type: 'Timer',
                    duration: 5000,
                    child: { type: 'Communicate' }
                }
            ]
        };
    }

    buildDefaultBehaviorTree() {
        const preset = this.behaviorPresets.get(this.currentPreset);
        this.rootNode = this.buildNodeFromDefinition(preset.tree);
    }

    buildNodeFromDefinition(definition) {
        const nodeType = this.nodeTypes.get(definition.type);
        let node = null;

        switch (nodeType) {
            case 'composite':
                node = new (this.compositeNodes.get(definition.type))(this);
                if (definition.children) {
                    definition.children.forEach(childDef => {
                        const childNode = this.buildNodeFromDefinition(childDef);
                        node.addChild(childNode);
                    });
                }
                break;

            case 'decorator':
                node = new (this.decoratorNodes.get(definition.type))(this);
                if (definition.child) {
                    const childNode = this.buildNodeFromDefinition(definition.child);
                    node.setChild(childNode);
                }
                // Apply decorator-specific properties
                if (definition.condition) {
                    node.condition = definition.condition;
                }
                if (definition.duration) {
                    node.duration = definition.duration;
                }
                break;

            case 'leaf':
                node = new (this.leafNodes.get(definition.type))(this);
                break;
        }

        // Apply common properties
        if (definition.name) {
            node.name = definition.name;
        }

        return node;
    }

    initializeBlackboard() {
        // Initialize shared data
        this.blackboard.set('alertLevel', 'unaware');
        this.blackboard.set('currentTarget', null);
        this.blackboard.set('lastTargetPosition', null);
        this.blackboard.set('patrolPoints', []);
        this.blackboard.set('currentPatrolIndex', 0);
        this.blackboard.set('homePosition', this.entity.getPosition().clone());
        this.blackboard.set('teamMembers', []);
        this.blackboard.set('ammunition', 100);
        this.blackboard.set('health', 100);
        this.blackboard.set('lastReloadTime', 0);
        this.blackboard.set('coverPosition', null);
        this.blackboard.set('investigationPoints', []);
        this.blackboard.set('communicationCooldown', 0);
    }

    setupEventListeners() {
        // AI perception events
        this.app.on('ai:targetFound', this.onTargetFound.bind(this));
        this.app.on('ai:targetLost', this.onTargetLost.bind(this));
        this.app.on('ai:alertLevelChanged', this.onAlertLevelChanged.bind(this));

        // Team coordination events
        this.app.on('team:orderReceived', this.onOrderReceived.bind(this));
        this.app.on('team:memberDown', this.onTeamMemberDown.bind(this));
        this.app.on('team:enemySpotted', this.onEnemySpotted.bind(this));

        // Combat events
        this.app.on('weapon:fired', this.onWeaponFired.bind(this));
        this.app.on('damage:taken', this.onDamageTaken.bind(this));
        this.app.on('ammunition:low', this.onAmmunitionLow.bind(this));

        // Objective events
        this.app.on('objective:assigned', this.onObjectiveAssigned.bind(this));
        this.app.on('objective:completed', this.onObjectiveCompleted.bind(this));
        this.app.on('objective:failed', this.onObjectiveFailed.bind(this));
    }

    update(dt) {
        if (!this.isRunning || !this.rootNode) return;

        const currentTime = Date.now();
        if (currentTime - this.lastUpdate < 1000 / this.updateRate) return;

        const startTime = performance.now();

        // Update blackboard with current state
        this.updateBlackboard();

        // Execute behavior tree
        const result = this.rootNode.execute();

        // Handle tree execution result
        this.handleExecutionResult(result);

        // Track execution time
        this.executionTime = performance.now() - startTime;
        this.lastUpdate = currentTime;
    }

    updateBlackboard() {
        // Update perception data
        if (this.aiPerception) {
            this.blackboard.set('alertLevel', this.aiPerception.getAlertLevel());
            this.blackboard.set('currentTarget', this.aiPerception.getCurrentTarget());
            this.blackboard.set('investigationPoints', this.aiPerception.getInvestigationPoints());
        }

        // Update health and ammunition
        if (this.entity.script.healthSystem) {
            this.blackboard.set('health', this.entity.script.healthSystem.getCurrentHealth());
        }

        if (this.entity.script.weaponManager) {
            const weapon = this.entity.script.weaponManager.getCurrentWeapon();
            if (weapon) {
                this.blackboard.set('ammunition', weapon.currentAmmo);
            }
        }

        // Update team data
        this.updateTeamData();

        // Update objective data
        this.updateObjectiveData();
    }

    updateTeamData() {
        if (this.teamId) {
            const teamMembers = this.gameManager?.getTeamMembers(this.teamId) || [];
            this.blackboard.set('teamMembers', teamMembers);

            // Find nearby team members
            const nearbyMembers = teamMembers.filter(member => 
                member !== this.entity &&
                this.entity.getPosition().distance(member.getPosition()) < 50
            );
            this.blackboard.set('nearbyTeamMembers', nearbyMembers);
        }
    }

    updateObjectiveData() {
        if (this.currentObjective) {
            const distance = this.entity.getPosition().distance(this.currentObjective.position);
            this.blackboard.set('objectiveDistance', distance);
            this.blackboard.set('objectiveDirection', 
                this.currentObjective.position.clone().sub(this.entity.getPosition()).normalize()
            );
        }
    }

    handleExecutionResult(result) {
        switch (result) {
            case NodeStatus.SUCCESS:
                // Tree completed successfully
                break;
            case NodeStatus.FAILURE:
                // Tree failed, might need to reset or switch behavior
                break;
            case NodeStatus.RUNNING:
                // Tree is still executing
                break;
        }
    }

    // Behavior tree control methods
    start() {
        this.isRunning = true;
        this.lastUpdate = Date.now();
    }

    stop() {
        this.isRunning = false;
        if (this.rootNode) {
            this.rootNode.abort();
        }
    }

    restart() {
        this.stop();
        this.start();
    }

    switchBehavior(presetName) {
        if (this.behaviorPresets.has(presetName)) {
            this.currentPreset = presetName;
            this.stop();
            this.buildDefaultBehaviorTree();
            this.start();
        }
    }

    // Blackboard access methods
    getBlackboardValue(key) {
        return this.blackboard.get(key);
    }

    setBlackboardValue(key, value) {
        this.blackboard.set(key, value);
    }

    hasBlackboardValue(key) {
        return this.blackboard.has(key);
    }

    // Condition evaluation methods
    evaluateCondition(conditionName) {
        switch (conditionName) {
            case 'HasTarget':
                return this.blackboard.get('currentTarget') !== null;

            case 'CanSeeTarget':
                const target = this.blackboard.get('currentTarget');
                return target && this.aiPerception?.hasLineOfSight(target);

            case 'HasInvestigationPoint':
                const points = this.blackboard.get('investigationPoints') || [];
                return points.length > 0;

            case 'IsHealthLow':
                const health = this.blackboard.get('health') || 100;
                return health < 30;

            case 'IsAmmoLow':
                const ammo = this.blackboard.get('ammunition') || 100;
                return ammo < 10;

            case 'AllyNeedsRevive':
                const teammates = this.blackboard.get('nearbyTeamMembers') || [];
                return teammates.some(member => 
                    member.script.healthSystem?.isDown?.()
                );

            case 'HasClearShot':
                return this.evaluateHasClearShot();

            case 'NeedsRepositioning':
                return this.evaluateNeedsRepositioning();

            case 'InCombat':
                return this.blackboard.get('alertLevel') === 'combat';

            case 'IsPatrolling':
                return this.blackboard.get('alertLevel') === 'unaware';

            default:
                return false;
        }
    }

    evaluateHasClearShot() {
        const target = this.blackboard.get('currentTarget');
        if (!target) return false;

        // Check if we have line of sight and are in range
        const distance = this.entity.getPosition().distance(target.getPosition());
        const weapon = this.entity.script.weaponManager?.getCurrentWeapon();
        
        if (!weapon) return false;

        const maxRange = weapon.maxRange || 100;
        return distance <= maxRange && this.aiPerception?.hasLineOfSight(target);
    }

    evaluateNeedsRepositioning() {
        // Simple repositioning logic - move if we've been in the same spot too long
        const lastMoveTime = this.blackboard.get('lastMoveTime') || 0;
        return Date.now() - lastMoveTime > 30000; // 30 seconds
    }

    // Event handlers
    onTargetFound(data) {
        if (data.ai === this.entity) {
            this.setBlackboardValue('currentTarget', data.target);
            this.setBlackboardValue('lastTargetPosition', data.position);
            
            // Communicate target to team
            this.communicateToTeam('ENEMY_SPOTTED', {
                position: data.position,
                target: data.target
            });
        }
    }

    onTargetLost(data) {
        if (data.ai === this.entity) {
            this.setBlackboardValue('currentTarget', null);
        }
    }

    onAlertLevelChanged(data) {
        if (data.ai === this.entity) {
            this.setBlackboardValue('alertLevel', data.newLevel);
            
            // Switch behavior based on alert level
            this.adaptBehaviorToAlertLevel(data.newLevel);
        }
    }

    onOrderReceived(data) {
        if (data.recipient === this.entity || data.recipient === this.squadId) {
            this.processTeamOrder(data.order);
        }
    }

    onTeamMemberDown(data) {
        if (data.teamId === this.teamId) {
            // React to team member being down
            this.setBlackboardValue('teamMemberDown', data.member);
        }
    }

    onEnemySpotted(data) {
        if (data.teamId === this.teamId && data.spotter !== this.entity) {
            // Add investigation point for reported enemy
            const points = this.getBlackboardValue('investigationPoints') || [];
            points.push({
                position: data.position,
                type: 'enemy_report',
                priority: 8,
                timestamp: Date.now()
            });
            this.setBlackboardValue('investigationPoints', points);
        }
    }

    onWeaponFired(data) {
        if (data.shooter === this.entity) {
            // Update ammunition count
            const weapon = this.entity.script.weaponManager?.getCurrentWeapon();
            if (weapon) {
                this.setBlackboardValue('ammunition', weapon.currentAmmo);
            }
        }
    }

    onDamageTaken(data) {
        if (data.target === this.entity) {
            // React to taking damage
            this.setBlackboardValue('health', data.newHealth);
            this.setBlackboardValue('lastDamageTime', Date.now());
            
            if (data.source) {
                // Try to identify attacker
                this.setBlackboardValue('lastAttacker', data.source);
                
                // Add attacker position as investigation point
                const points = this.getBlackboardValue('investigationPoints') || [];
                points.push({
                    position: data.source.getPosition(),
                    type: 'damage_source',
                    priority: 10,
                    timestamp: Date.now()
                });
                this.setBlackboardValue('investigationPoints', points);
            }
        }
    }

    onAmmunitionLow(data) {
        if (data.entity === this.entity) {
            this.setBlackboardValue('needsReload', true);
        }
    }

    onObjectiveAssigned(data) {
        if (data.assignee === this.entity || data.assignee === this.teamId) {
            this.currentObjective = data.objective;
            this.objectivePriority = data.priority || 1.0;
            
            // Adapt behavior for objective
            this.adaptBehaviorToObjective(data.objective);
        }
    }

    onObjectiveCompleted(data) {
        if (data.objective === this.currentObjective) {
            this.objectiveHistory.push(this.currentObjective);
            this.currentObjective = null;
        }
    }

    onObjectiveFailed(data) {
        if (data.objective === this.currentObjective) {
            this.currentObjective = null;
            // Maybe retry or get new objective
        }
    }

    // Behavior adaptation methods
    adaptBehaviorToAlertLevel(alertLevel) {
        switch (alertLevel) {
            case 'unaware':
                if (this.currentPreset !== 'default') {
                    this.switchBehavior('default');
                }
                break;
            case 'suspicious':
                // No behavior change, just more vigilant
                break;
            case 'alert':
                if (this.role === 'support') {
                    this.switchBehavior('support');
                } else {
                    this.switchBehavior('defensive');
                }
                break;
            case 'combat':
                if (this.role === 'aggressive') {
                    this.switchBehavior('aggressive');
                } else if (this.role === 'sniper') {
                    this.switchBehavior('sniper');
                }
                break;
        }
    }

    adaptBehaviorToObjective(objective) {
        switch (objective.type) {
            case 'attack':
                this.switchBehavior('aggressive');
                break;
            case 'defend':
                this.switchBehavior('defensive');
                break;
            case 'support':
                this.switchBehavior('support');
                break;
            case 'patrol':
                this.switchBehavior('default');
                break;
        }
    }

    processTeamOrder(order) {
        switch (order.type) {
            case 'MOVE_TO':
                this.setBlackboardValue('orderPosition', order.position);
                this.setBlackboardValue('orderType', 'move');
                break;
            case 'ATTACK_TARGET':
                this.setBlackboardValue('orderTarget', order.target);
                this.setBlackboardValue('orderType', 'attack');
                break;
            case 'DEFEND_POSITION':
                this.setBlackboardValue('defendPosition', order.position);
                this.setBlackboardValue('orderType', 'defend');
                break;
            case 'RETREAT':
                this.setBlackboardValue('retreatPosition', order.position);
                this.setBlackboardValue('orderType', 'retreat');
                break;
        }
    }

    communicateToTeam(messageType, data) {
        if (!this.teamId) return;

        const communicationCooldown = this.getBlackboardValue('communicationCooldown') || 0;
        if (Date.now() - communicationCooldown < 2000) return; // 2 second cooldown

        this.app.fire('team:communicate', {
            sender: this.entity,
            teamId: this.teamId,
            messageType: messageType,
            data: data
        });

        this.setBlackboardValue('communicationCooldown', Date.now());
    }

    // Performance and debugging methods
    getExecutionStats() {
        return {
            executionTime: this.executionTime,
            updateRate: this.updateRate,
            nodeExecutions: Object.fromEntries(this.nodeExecutions),
            blackboardSize: this.blackboard.size,
            currentPreset: this.currentPreset
        };
    }

    getDebugInfo() {
        return {
            isRunning: this.isRunning,
            currentNode: this.currentNode?.name || 'None',
            alertLevel: this.getBlackboardValue('alertLevel'),
            hasTarget: this.getBlackboardValue('currentTarget') !== null,
            health: this.getBlackboardValue('health'),
            ammunition: this.getBlackboardValue('ammunition'),
            teamId: this.teamId,
            role: this.role,
            currentObjective: this.currentObjective?.type || 'None'
        };
    }

    // Public API methods
    setTeamId(teamId) {
        this.teamId = teamId;
    }

    setSquadId(squadId) {
        this.squadId = squadId;
    }

    setRole(role) {
        this.role = role;
        
        // Switch to appropriate behavior for role
        switch (role) {
            case 'leader':
                this.switchBehavior('leader');
                break;
            case 'support':
                this.switchBehavior('support');
                break;
            case 'sniper':
                this.switchBehavior('sniper');
                break;
            case 'aggressive':
                this.switchBehavior('aggressive');
                break;
            default:
                this.switchBehavior('default');
        }
    }

    assignObjective(objective) {
        this.currentObjective = objective;
        this.adaptBehaviorToObjective(objective);
    }

    getCurrentBehavior() {
        return this.currentPreset;
    }

    isExecuting() {
        return this.isRunning;
    }

    forceNodeExecution(nodeName) {
        // For debugging - force execution of a specific node
        const nodeClass = this.leafNodes.get(nodeName);
        if (nodeClass) {
            const node = new nodeClass(this);
            return node.execute();
        }
        return NodeStatus.FAILURE;
    }
}

// Node status enumeration
const NodeStatus = {
    SUCCESS: 'success',
    FAILURE: 'failure',
    RUNNING: 'running'
};

// Base node class
class BehaviorNode {
    constructor(behaviorTree) {
        this.behaviorTree = behaviorTree;
        this.name = this.constructor.name;
        this.status = NodeStatus.FAILURE;
        this.isInitialized = false;
    }

    execute() {
        if (!this.isInitialized) {
            this.initialize();
            this.isInitialized = true;
        }

        const startTime = performance.now();
        this.status = this.tick();
        const executionTime = performance.now() - startTime;

        // Track execution stats
        const executions = this.behaviorTree.nodeExecutions.get(this.name) || { count: 0, totalTime: 0 };
        executions.count++;
        executions.totalTime += executionTime;
        this.behaviorTree.nodeExecutions.set(this.name, executions);

        return this.status;
    }

    initialize() {
        // Override in subclasses
    }

    tick() {
        // Override in subclasses
        return NodeStatus.FAILURE;
    }

    abort() {
        this.status = NodeStatus.FAILURE;
        this.isInitialized = false;
    }

    reset() {
        this.abort();
    }
}

// Composite nodes
class CompositeNode extends BehaviorNode {
    constructor(behaviorTree) {
        super(behaviorTree);
        this.children = [];
        this.currentChildIndex = 0;
    }

    addChild(child) {
        this.children.push(child);
    }

    abort() {
        super.abort();
        this.children.forEach(child => child.abort());
        this.currentChildIndex = 0;
    }
}

class SequenceNode extends CompositeNode {
    tick() {
        for (let i = this.currentChildIndex; i < this.children.length; i++) {
            const result = this.children[i].execute();
            
            if (result === NodeStatus.FAILURE) {
                this.currentChildIndex = 0;
                return NodeStatus.FAILURE;
            }
            
            if (result === NodeStatus.RUNNING) {
                this.currentChildIndex = i;
                return NodeStatus.RUNNING;
            }
        }
        
        this.currentChildIndex = 0;
        return NodeStatus.SUCCESS;
    }
}

class SelectorNode extends CompositeNode {
    tick() {
        for (let i = this.currentChildIndex; i < this.children.length; i++) {
            const result = this.children[i].execute();
            
            if (result === NodeStatus.SUCCESS) {
                this.currentChildIndex = 0;
                return NodeStatus.SUCCESS;
            }
            
            if (result === NodeStatus.RUNNING) {
                this.currentChildIndex = i;
                return NodeStatus.RUNNING;
            }
        }
        
        this.currentChildIndex = 0;
        return NodeStatus.FAILURE;
    }
}

class ParallelNode extends CompositeNode {
    tick() {
        let successCount = 0;
        let runningCount = 0;
        
        for (const child of this.children) {
            const result = child.execute();
            
            if (result === NodeStatus.SUCCESS) {
                successCount++;
            } else if (result === NodeStatus.RUNNING) {
                runningCount++;
            }
        }
        
        if (successCount === this.children.length) {
            return NodeStatus.SUCCESS;
        }
        
        if (runningCount > 0) {
            return NodeStatus.RUNNING;
        }
        
        return NodeStatus.FAILURE;
    }
}

class RandomSelectorNode extends CompositeNode {
    initialize() {
        // Shuffle children order
        this.shuffledIndices = Array.from({length: this.children.length}, (_, i) => i);
        for (let i = this.shuffledIndices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.shuffledIndices[i], this.shuffledIndices[j]] = [this.shuffledIndices[j], this.shuffledIndices[i]];
        }
    }

    tick() {
        for (let i = this.currentChildIndex; i < this.shuffledIndices.length; i++) {
            const childIndex = this.shuffledIndices[i];
            const result = this.children[childIndex].execute();
            
            if (result === NodeStatus.SUCCESS) {
                this.currentChildIndex = 0;
                return NodeStatus.SUCCESS;
            }
            
            if (result === NodeStatus.RUNNING) {
                this.currentChildIndex = i;
                return NodeStatus.RUNNING;
            }
        }
        
        this.currentChildIndex = 0;
        return NodeStatus.FAILURE;
    }
}

class WeightedSelectorNode extends CompositeNode {
    constructor(behaviorTree) {
        super(behaviorTree);
        this.weights = [];
    }

    addChild(child, weight = 1.0) {
        super.addChild(child);
        this.weights.push(weight);
    }

    tick() {
        // Select child based on weights
        const totalWeight = this.weights.reduce((sum, weight) => sum + weight, 0);
        let random = Math.random() * totalWeight;
        
        for (let i = 0; i < this.children.length; i++) {
            random -= this.weights[i];
            if (random <= 0) {
                return this.children[i].execute();
            }
        }
        
        return NodeStatus.FAILURE;
    }
}

// Decorator nodes
class DecoratorNode extends BehaviorNode {
    constructor(behaviorTree) {
        super(behaviorTree);
        this.child = null;
    }

    setChild(child) {
        this.child = child;
    }

    abort() {
        super.abort();
        if (this.child) {
            this.child.abort();
        }
    }
}

class InverterNode extends DecoratorNode {
    tick() {
        if (!this.child) return NodeStatus.FAILURE;
        
        const result = this.child.execute();
        
        if (result === NodeStatus.SUCCESS) {
            return NodeStatus.FAILURE;
        } else if (result === NodeStatus.FAILURE) {
            return NodeStatus.SUCCESS;
        } else {
            return NodeStatus.RUNNING;
        }
    }
}

class RepeaterNode extends DecoratorNode {
    constructor(behaviorTree) {
        super(behaviorTree);
        this.repeatCount = -1; // -1 = infinite
        this.currentCount = 0;
    }

    tick() {
        if (!this.child) return NodeStatus.FAILURE;
        
        if (this.repeatCount > 0 && this.currentCount >= this.repeatCount) {
            return NodeStatus.SUCCESS;
        }
        
        const result = this.child.execute();
        
        if (result === NodeStatus.SUCCESS || result === NodeStatus.FAILURE) {
            this.currentCount++;
            this.child.reset();
        }
        
        return NodeStatus.RUNNING;
    }
}

class RetryUntilFailNode extends DecoratorNode {
    tick() {
        if (!this.child) return NodeStatus.FAILURE;
        
        const result = this.child.execute();
        
        if (result === NodeStatus.FAILURE) {
            return NodeStatus.SUCCESS;
        }
        
        if (result === NodeStatus.SUCCESS) {
            this.child.reset();
        }
        
        return NodeStatus.RUNNING;
    }
}

class TimerNode extends DecoratorNode {
    constructor(behaviorTree) {
        super(behaviorTree);
        this.duration = 1000; // milliseconds
        this.startTime = 0;
    }

    initialize() {
        this.startTime = Date.now();
    }

    tick() {
        if (!this.child) return NodeStatus.FAILURE;
        
        const elapsed = Date.now() - this.startTime;
        
        if (elapsed >= this.duration) {
            return this.child.execute();
        }
        
        return NodeStatus.RUNNING;
    }
}

class CooldownNode extends DecoratorNode {
    constructor(behaviorTree) {
        super(behaviorTree);
        this.cooldownTime = 1000;
        this.lastExecutionTime = 0;
    }

    tick() {
        if (!this.child) return NodeStatus.FAILURE;
        
        const currentTime = Date.now();
        
        if (currentTime - this.lastExecutionTime < this.cooldownTime) {
            return NodeStatus.FAILURE;
        }
        
        const result = this.child.execute();
        
        if (result === NodeStatus.SUCCESS || result === NodeStatus.FAILURE) {
            this.lastExecutionTime = currentTime;
        }
        
        return result;
    }
}

class ConditionNode extends DecoratorNode {
    constructor(behaviorTree) {
        super(behaviorTree);
        this.condition = null;
    }

    tick() {
        if (!this.condition || !this.child) return NodeStatus.FAILURE;
        
        if (this.behaviorTree.evaluateCondition(this.condition)) {
            return this.child.execute();
        }
        
        return NodeStatus.FAILURE;
    }
}

// Leaf nodes (Actions)
class ActionNode extends BehaviorNode {
    constructor(behaviorTree) {
        super(behaviorTree);
        this.entity = behaviorTree.entity;
        this.blackboard = behaviorTree.blackboard;
    }
}

class PatrolNode extends ActionNode {
    tick() {
        // Simple patrol behavior
        const patrolPoints = this.blackboard.get('patrolPoints') || [];
        if (patrolPoints.length === 0) {
            // Create default patrol points around home position
            const homePos = this.blackboard.get('homePosition');
            const defaultPatrol = [
                homePos.clone().add(new pc.Vec3(10, 0, 0)),
                homePos.clone().add(new pc.Vec3(0, 0, 10)),
                homePos.clone().add(new pc.Vec3(-10, 0, 0)),
                homePos.clone().add(new pc.Vec3(0, 0, -10))
            ];
            this.blackboard.set('patrolPoints', defaultPatrol);
            return NodeStatus.RUNNING;
        }
        
        const currentIndex = this.blackboard.get('currentPatrolIndex') || 0;
        const targetPoint = patrolPoints[currentIndex];
        const currentPos = this.entity.getPosition();
        
        if (currentPos.distance(targetPoint) < 2.0) {
            // Reached patrol point, move to next
            const nextIndex = (currentIndex + 1) % patrolPoints.length;
            this.blackboard.set('currentPatrolIndex', nextIndex);
            return NodeStatus.SUCCESS;
        }
        
        // Move toward patrol point
        if (this.entity.script.aiController) {
            this.entity.script.aiController.moveTo(targetPoint);
        }
        
        return NodeStatus.RUNNING;
    }
}

class InvestigateNode extends ActionNode {
    tick() {
        const investigationPoints = this.blackboard.get('investigationPoints') || [];
        if (investigationPoints.length === 0) {
            return NodeStatus.FAILURE;
        }
        
        // Get highest priority investigation point
        const targetPoint = investigationPoints[0];
        const currentPos = this.entity.getPosition();
        
        if (currentPos.distance(targetPoint.position) < 2.0) {
            // Reached investigation point
            investigationPoints.shift(); // Remove investigated point
            this.blackboard.set('investigationPoints', investigationPoints);
            return NodeStatus.SUCCESS;
        }
        
        // Move toward investigation point
        if (this.entity.script.aiController) {
            this.entity.script.aiController.moveTo(targetPoint.position);
        }
        
        return NodeStatus.RUNNING;
    }
}

class HuntNode extends ActionNode {
    tick() {
        const lastTargetPosition = this.blackboard.get('lastTargetPosition');
        if (!lastTargetPosition) {
            return NodeStatus.FAILURE;
        }
        
        const currentPos = this.entity.getPosition();
        
        if (currentPos.distance(lastTargetPosition) < 3.0) {
            // Reached last known position, search area
            this.blackboard.set('lastTargetPosition', null);
            return NodeStatus.SUCCESS;
        }
        
        // Move toward last known position
        if (this.entity.script.aiController) {
            this.entity.script.aiController.moveTo(lastTargetPosition);
        }
        
        return NodeStatus.RUNNING;
    }
}

class AttackNode extends ActionNode {
    tick() {
        const target = this.blackboard.get('currentTarget');
        if (!target) {
            return NodeStatus.FAILURE;
        }
        
        // Attack the target
        if (this.entity.script.aiCombat) {
            const result = this.entity.script.aiCombat.attackTarget(target);
            return result ? NodeStatus.RUNNING : NodeStatus.FAILURE;
        }
        
        return NodeStatus.FAILURE;
    }
}

class TakeCoverNode extends ActionNode {
    tick() {
        // Find and move to cover
        if (this.entity.script.aiCombat) {
            const coverFound = this.entity.script.aiCombat.findCover();
            return coverFound ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
        }
        
        return NodeStatus.FAILURE;
    }
}

class ReloadNode extends ActionNode {
    tick() {
        const needsReload = this.blackboard.get('needsReload') || false;
        if (!needsReload) {
            return NodeStatus.SUCCESS;
        }
        
        if (this.entity.script.weaponManager) {
            const isReloading = this.entity.script.weaponManager.reload();
            if (isReloading) {
                this.blackboard.set('needsReload', false);
                return NodeStatus.SUCCESS;
            }
        }
        
        return NodeStatus.FAILURE;
    }
}

class CommunicateNode extends ActionNode {
    tick() {
        // Communicate with team
        this.behaviorTree.communicateToTeam('STATUS_UPDATE', {
            position: this.entity.getPosition(),
            health: this.blackboard.get('health'),
            alertLevel: this.blackboard.get('alertLevel')
        });
        
        return NodeStatus.SUCCESS;
    }
}

class MoveToNode extends ActionNode {
    tick() {
        const orderPosition = this.blackboard.get('orderPosition');
        if (!orderPosition) {
            return NodeStatus.FAILURE;
        }
        
        const currentPos = this.entity.getPosition();
        
        if (currentPos.distance(orderPosition) < 2.0) {
            this.blackboard.set('orderPosition', null);
            return NodeStatus.SUCCESS;
        }
        
        if (this.entity.script.aiController) {
            this.entity.script.aiController.moveTo(orderPosition);
        }
        
        return NodeStatus.RUNNING;
    }
}

class WaitNode extends ActionNode {
    constructor(behaviorTree) {
        super(behaviorTree);
        this.waitTime = 2000; // 2 seconds
        this.startTime = 0;
    }

    initialize() {
        this.startTime = Date.now();
    }

    tick() {
        if (Date.now() - this.startTime >= this.waitTime) {
            return NodeStatus.SUCCESS;
        }
        
        return NodeStatus.RUNNING;
    }
}

class UseAbilityNode extends ActionNode {
    tick() {
        // Use special ability if available
        if (this.entity.script.aiController) {
            const abilityUsed = this.entity.script.aiController.useSpecialAbility();
            return abilityUsed ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
        }
        
        return NodeStatus.FAILURE;
    }
}

class FlankTargetNode extends ActionNode {
    tick() {
        const target = this.blackboard.get('currentTarget');
        if (!target) {
            return NodeStatus.FAILURE;
        }
        
        if (this.entity.script.aiCombat) {
            const flanking = this.entity.script.aiCombat.flankTarget(target);
            return flanking ? NodeStatus.RUNNING : NodeStatus.FAILURE;
        }
        
        return NodeStatus.FAILURE;
    }
}

class SuppressFireNode extends ActionNode {
    tick() {
        const target = this.blackboard.get('currentTarget');
        if (!target) {
            return NodeStatus.FAILURE;
        }
        
        if (this.entity.script.aiCombat) {
            const suppressing = this.entity.script.aiCombat.suppressFire(target);
            return suppressing ? NodeStatus.RUNNING : NodeStatus.FAILURE;
        }
        
        return NodeStatus.FAILURE;
    }
}

class ThrowGrenadeNode extends ActionNode {
    tick() {
        const target = this.blackboard.get('currentTarget');
        if (!target) {
            return NodeStatus.FAILURE;
        }
        
        if (this.entity.script.grenadeController) {
            const grenadeThrown = this.entity.script.grenadeController.throwAt(target.getPosition());
            return grenadeThrown ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
        }
        
        return NodeStatus.FAILURE;
    }
}

class CallForBackupNode extends ActionNode {
    tick() {
        this.behaviorTree.communicateToTeam('REQUEST_BACKUP', {
            position: this.entity.getPosition(),
            urgency: 'high'
        });
        
        return NodeStatus.SUCCESS;
    }
}

class ReviveAllyNode extends ActionNode {
    tick() {
        const teammates = this.blackboard.get('nearbyTeamMembers') || [];
        const downedAlly = teammates.find(member => 
            member.script.healthSystem?.isDown?.()
        );
        
        if (!downedAlly) {
            return NodeStatus.FAILURE;
        }
        
        // Move to and revive ally
        const distance = this.entity.getPosition().distance(downedAlly.getPosition());
        
        if (distance > 2.0) {
            if (this.entity.script.aiController) {
                this.entity.script.aiController.moveTo(downedAlly.getPosition());
            }
            return NodeStatus.RUNNING;
        }
        
        // Attempt revive
        if (downedAlly.script.healthSystem) {
            downedAlly.script.healthSystem.revive();
            return NodeStatus.SUCCESS;
        }
        
        return NodeStatus.FAILURE;
    }
}

class DefendPositionNode extends ActionNode {
    tick() {
        const defendPosition = this.blackboard.get('defendPosition') || 
                             this.blackboard.get('homePosition');
        
        if (!defendPosition) {
            return NodeStatus.FAILURE;
        }
        
        const currentPos = this.entity.getPosition();
        const distance = currentPos.distance(defendPosition);
        
        if (distance > 5.0) {
            // Move to defend position
            if (this.entity.script.aiController) {
                this.entity.script.aiController.moveTo(defendPosition);
            }
            return NodeStatus.RUNNING;
        }
        
        // In position, watch for enemies
        if (this.entity.script.aiController) {
            this.entity.script.aiController.lookAround();
        }
        
        return NodeStatus.RUNNING;
    }
}

pc.registerScript(AIBehaviorTree, 'AIBehaviorTree');
