/**
 * WeaponParticles.js
 * Manages particle effects for weapons including muzzle flash, shell ejection, and impact effects
 */

class WeaponParticles extends pc.ScriptType {
    static get scriptName() { return 'WeaponParticles'; }

    initialize() {
        this.particleManager = this.app.root.findByName('Game_Manager').script.particleManager;
        this.weaponManager = this.entity.script.weaponManager;
        
        // Particle effect pools
        this.muzzleFlashPool = [];
        this.shellEjectionPool = [];
        this.sparkPool = [];
        this.smokePool = [];
        
        // Effect settings
        this.muzzleFlashDuration = 0.05;
        this.shellEjectionForce = { min: 2, max: 5 };
        this.sparkCount = { min: 3, max: 8 };
        this.smokeLifetime = 2.0;
        
        // Cached references
        this.currentWeapon = null;
        this.muzzlePoint = null;
        this.ejectionPoint = null;
        
        this.initializeParticlePools();
        this.setupEventListeners();
    }

    initializeParticlePools() {
        // Create muzzle flash particle systems
        for (let i = 0; i < 10; i++) {
            const muzzleFlash = this.createMuzzleFlashParticle();
            this.muzzleFlashPool.push(muzzleFlash);
        }
        
        // Create shell ejection particle systems
        for (let i = 0; i < 20; i++) {
            const shell = this.createShellParticle();
            this.shellEjectionPool.push(shell);
        }
        
        // Create spark particle systems
        for (let i = 0; i < 15; i++) {
            const spark = this.createSparkParticle();
            this.sparkPool.push(spark);
        }
        
        // Create smoke particle systems
        for (let i = 0; i < 8; i++) {
            const smoke = this.createSmokeParticle();
            this.smokePool.push(smoke);
        }
    }

    createMuzzleFlashParticle() {
        const entity = new pc.Entity('MuzzleFlash');
        const particleSystem = entity.addComponent('particlesystem', {
            numParticles: 5,
            lifetime: this.muzzleFlashDuration,
            rate: 100,
            startAngle: 0,
            startAngle2: 360,
            emitterShape: pc.EMITTERSHAPE_SPHERE,
            emitterRadius: 0.1,
            startVelocity: 0.5,
            startVelocity2: 1.5,
            colorMap: this.createMuzzleFlashTexture(),
            blendType: pc.BLEND_ADDITIVE,
            billboard: true,
            alignToMotion: false,
            startSize: 0.2,
            startSize2: 0.4,
            endSize: 0.1,
            endSize2: 0.2,
            colorStart: new pc.Color(1, 0.8, 0.3, 1),
            colorEnd: new pc.Color(1, 0.2, 0, 0)
        });
        
        entity.enabled = false;
        this.app.root.addChild(entity);
        return entity;
    }

    createShellParticle() {
        const entity = new pc.Entity('ShellEjection');
        const particleSystem = entity.addComponent('particlesystem', {
            numParticles: 1,
            lifetime: 2.0,
            rate: 1,
            emitterShape: pc.EMITTERSHAPE_BOX,
            emitterExtents: new pc.Vec3(0.05, 0.05, 0.05),
            startVelocity: 2,
            startVelocity2: 4,
            gravity: new pc.Vec3(0, -9.8, 0),
            mesh: this.createShellMesh(),
            orientation: pc.PARTICLEORIENTATION_WORLD,
            startSize: 0.02,
            startSize2: 0.025,
            colorStart: new pc.Color(0.8, 0.7, 0.3, 1),
            colorEnd: new pc.Color(0.6, 0.5, 0.2, 1)
        });
        
        entity.enabled = false;
        this.app.root.addChild(entity);
        return entity;
    }

    createSparkParticle() {
        const entity = new pc.Entity('Spark');
        const particleSystem = entity.addComponent('particlesystem', {
            numParticles: 8,
            lifetime: 0.5,
            rate: 50,
            startAngle: 0,
            startAngle2: 360,
            emitterShape: pc.EMITTERSHAPE_SPHERE,
            emitterRadius: 0.05,
            startVelocity: 3,
            startVelocity2: 6,
            gravity: new pc.Vec3(0, -2, 0),
            billboard: true,
            startSize: 0.02,
            startSize2: 0.04,
            endSize: 0.005,
            endSize2: 0.01,
            colorStart: new pc.Color(1, 1, 0.8, 1),
            colorEnd: new pc.Color(1, 0.3, 0, 0),
            blendType: pc.BLEND_ADDITIVE
        });
        
        entity.enabled = false;
        this.app.root.addChild(entity);
        return entity;
    }

    createSmokeParticle() {
        const entity = new pc.Entity('Smoke');
        const particleSystem = entity.addComponent('particlesystem', {
            numParticles: 15,
            lifetime: this.smokeLifetime,
            rate: 20,
            startAngle: 0,
            startAngle2: 360,
            emitterShape: pc.EMITTERSHAPE_SPHERE,
            emitterRadius: 0.1,
            startVelocity: 0.5,
            startVelocity2: 1.5,
            billboard: true,
            startSize: 0.1,
            startSize2: 0.2,
            endSize: 0.5,
            endSize2: 0.8,
            colorStart: new pc.Color(0.3, 0.3, 0.3, 0.8),
            colorEnd: new pc.Color(0.1, 0.1, 0.1, 0),
            blendType: pc.BLEND_NORMAL
        });
        
        entity.enabled = false;
        this.app.root.addChild(entity);
        return entity;
    }

    setupEventListeners() {
        // Listen for weapon firing events
        this.app.on('weapon:fired', this.onWeaponFired, this);
        this.app.on('weapon:hit', this.onWeaponHit, this);
        this.app.on('weapon:reload', this.onWeaponReload, this);
        this.app.on('weapon:changed', this.onWeaponChanged, this);
    }

    onWeaponFired(data) {
        const { weapon, muzzlePosition, muzzleDirection } = data;
        
        // Play muzzle flash
        this.playMuzzleFlash(muzzlePosition, muzzleDirection, weapon);
        
        // Eject shell casing
        if (weapon.ejectsShells) {
            this.ejectShell(weapon);
        }
        
        // Add muzzle smoke for certain weapons
        if (weapon.producesSmoke) {
            this.playMuzzleSmoke(muzzlePosition, weapon);
        }
    }

    onWeaponHit(data) {
        const { hitPoint, hitNormal, material, weapon } = data;
        
        // Create impact sparks
        this.playImpactSparks(hitPoint, hitNormal, material);
        
        // Create material-specific effects
        this.playMaterialImpactEffect(hitPoint, hitNormal, material, weapon);
    }

    onWeaponReload(data) {
        const { weapon } = data;
        
        // Eject magazine or shells during reload
        if (weapon.type === 'shotgun') {
            this.ejectShells(weapon, weapon.shellsToEject || 1);
        } else if (weapon.ejectsMagazine) {
            this.ejectMagazine(weapon);
        }
    }

    onWeaponChanged(data) {
        this.currentWeapon = data.weapon;
        this.updateAttachmentPoints();
    }

    playMuzzleFlash(position, direction, weapon) {
        const muzzleFlash = this.getAvailableParticle(this.muzzleFlashPool);
        if (!muzzleFlash) return;
        
        // Position and orient the muzzle flash
        muzzleFlash.setPosition(position);
        muzzleFlash.lookAt(position.clone().add(direction));
        
        // Scale effect based on weapon type
        const scale = weapon.muzzleFlashScale || 1.0;
        muzzleFlash.setLocalScale(scale, scale, scale);
        
        // Customize for weapon type
        this.customizeMuzzleFlash(muzzleFlash, weapon);
        
        // Play the effect
        muzzleFlash.enabled = true;
        muzzleFlash.particlesystem.reset();
        muzzleFlash.particlesystem.play();
        
        // Disable after duration
        setTimeout(() => {
            muzzleFlash.enabled = false;
        }, this.muzzleFlashDuration * 1000);
    }

    customizeMuzzleFlash(muzzleFlash, weapon) {
        const particleSystem = muzzleFlash.particlesystem;
        
        switch (weapon.type) {
            case 'shotgun':
                particleSystem.numParticles = 8;
                particleSystem.startSize = 0.3;
                particleSystem.startSize2 = 0.6;
                break;
            case 'sniper':
                particleSystem.numParticles = 3;
                particleSystem.startSize = 0.4;
                particleSystem.startSize2 = 0.8;
                break;
            case 'pistol':
                particleSystem.numParticles = 3;
                particleSystem.startSize = 0.15;
                particleSystem.startSize2 = 0.25;
                break;
            default:
                particleSystem.numParticles = 5;
                particleSystem.startSize = 0.2;
                particleSystem.startSize2 = 0.4;
        }
    }

    ejectShell(weapon) {
        if (!weapon.ejectionPoint) return;
        
        const shell = this.getAvailableParticle(this.shellEjectionPool);
        if (!shell) return;
        
        // Position at ejection point
        shell.setPosition(weapon.ejectionPoint);
        
        // Add random ejection velocity
        const ejectionForce = pc.math.random(
            this.shellEjectionForce.min, 
            this.shellEjectionForce.max
        );
        
        const ejectionDirection = new pc.Vec3(
            pc.math.random(-0.5, 0.5),
            pc.math.random(0.5, 1.0),
            pc.math.random(-0.3, 0.3)
        ).normalize();
        
        shell.particlesystem.startVelocity = ejectionForce;
        shell.particlesystem.initialVelocity = ejectionDirection.clone().scale(ejectionForce);
        
        // Customize shell based on weapon
        this.customizeShell(shell, weapon);
        
        shell.enabled = true;
        shell.particlesystem.reset();
        shell.particlesystem.play();
        
        setTimeout(() => {
            shell.enabled = false;
        }, 2000);
    }

    playImpactSparks(hitPoint, hitNormal, material) {
        const spark = this.getAvailableParticle(this.sparkPool);
        if (!spark) return;
        
        spark.setPosition(hitPoint);
        
        // Orient sparks away from surface
        const sparkDirection = hitNormal.clone().add(
            new pc.Vec3(
                pc.math.random(-0.5, 0.5),
                pc.math.random(-0.5, 0.5),
                pc.math.random(-0.5, 0.5)
            )
        ).normalize();
        
        spark.lookAt(hitPoint.clone().add(sparkDirection));
        
        // Customize based on material
        this.customizeSparks(spark, material);
        
        spark.enabled = true;
        spark.particlesystem.reset();
        spark.particlesystem.play();
        
        setTimeout(() => {
            spark.enabled = false;
        }, 500);
    }

    playMaterialImpactEffect(hitPoint, hitNormal, material, weapon) {
        switch (material) {
            case 'concrete':
            case 'stone':
                this.playDustEffect(hitPoint, hitNormal);
                break;
            case 'metal':
                this.playMetalSparkEffect(hitPoint, hitNormal);
                break;
            case 'wood':
                this.playWoodChipEffect(hitPoint, hitNormal);
                break;
            case 'dirt':
                this.playDirtEffect(hitPoint, hitNormal);
                break;
            case 'water':
                this.playWaterSplashEffect(hitPoint, hitNormal);
                break;
        }
    }

    playMuzzleSmoke(position, weapon) {
        const smoke = this.getAvailableParticle(this.smokePool);
        if (!smoke) return;
        
        smoke.setPosition(position);
        
        // Customize smoke based on weapon
        const particleSystem = smoke.particlesystem;
        particleSystem.numParticles = weapon.smokeAmount || 10;
        
        smoke.enabled = true;
        particleSystem.reset();
        particleSystem.play();
        
        setTimeout(() => {
            smoke.enabled = false;
        }, this.smokeLifetime * 1000);
    }

    getAvailableParticle(pool) {
        return pool.find(particle => !particle.enabled) || null;
    }

    customizeShell(shell, weapon) {
        const particleSystem = shell.particlesystem;
        
        switch (weapon.caliber) {
            case '9mm':
                particleSystem.startSize = 0.015;
                break;
            case '.45':
                particleSystem.startSize = 0.02;
                break;
            case '5.56':
                particleSystem.startSize = 0.018;
                break;
            case '7.62':
                particleSystem.startSize = 0.025;
                break;
            case '12gauge':
                particleSystem.startSize = 0.035;
                particleSystem.colorStart = new pc.Color(1, 0.2, 0.2, 1);
                break;
        }
    }

    customizeSparks(spark, material) {
        const particleSystem = spark.particlesystem;
        
        switch (material) {
            case 'metal':
                particleSystem.numParticles = 12;
                particleSystem.colorStart = new pc.Color(1, 1, 0.8, 1);
                break;
            case 'concrete':
                particleSystem.numParticles = 6;
                particleSystem.colorStart = new pc.Color(0.8, 0.8, 0.8, 1);
                break;
            case 'wood':
                particleSystem.numParticles = 4;
                particleSystem.colorStart = new pc.Color(0.6, 0.4, 0.2, 1);
                break;
            default:
                particleSystem.numParticles = 8;
                particleSystem.colorStart = new pc.Color(1, 0.8, 0.4, 1);
        }
    }

    playDustEffect(hitPoint, hitNormal) {
        // Create dust cloud effect for concrete/stone impacts
        const dust = this.getAvailableParticle(this.smokePool);
        if (!dust) return;
        
        dust.setPosition(hitPoint);
        dust.particlesystem.colorStart = new pc.Color(0.7, 0.6, 0.5, 0.6);
        dust.particlesystem.colorEnd = new pc.Color(0.5, 0.4, 0.3, 0);
        dust.particlesystem.numParticles = 8;
        
        dust.enabled = true;
        dust.particlesystem.reset();
        dust.particlesystem.play();
        
        setTimeout(() => {
            dust.enabled = false;
        }, 1500);
    }

    createMuzzleFlashTexture() {
        // Create a simple muzzle flash texture programmatically
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        
        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.3, 'rgba(255, 200, 100, 0.8)');
        gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);
        
        const texture = new pc.Texture(this.app.graphicsDevice);
        texture.setSource(canvas);
        return texture;
    }

    createShellMesh() {
        // Create a simple cylindrical shell mesh
        return this.app.assets.find('shell_casing') || pc.createCylinder(this.app.graphicsDevice, {
            radius: 0.005,
            height: 0.02
        });
    }

    update(dt) {
        // Update any time-based particle effects
        this.updateAttachmentPoints();
    }

    updateAttachmentPoints() {
        if (!this.currentWeapon) return;
        
        // Update muzzle and ejection points based on current weapon
        this.muzzlePoint = this.currentWeapon.muzzlePoint;
        this.ejectionPoint = this.currentWeapon.ejectionPoint;
    }

    destroy() {
        // Clean up event listeners
        this.app.off('weapon:fired', this.onWeaponFired, this);
        this.app.off('weapon:hit', this.onWeaponHit, this);
        this.app.off('weapon:reload', this.onWeaponReload, this);
        this.app.off('weapon:changed', this.onWeaponChanged, this);
        
        // Clean up particle pools
        [...this.muzzleFlashPool, ...this.shellEjectionPool, ...this.sparkPool, ...this.smokePool]
            .forEach(particle => particle.destroy());
    }
}

pc.registerScript(WeaponParticles, 'WeaponParticles');
