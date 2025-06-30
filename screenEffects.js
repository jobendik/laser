/**
 * ScreenEffects.js
 * Screen-space visual effects system
 * Handles damage flashes, motion blur, screen shake, and post-processing effects
 */

class ScreenEffects extends pc.ScriptType {
    static get scriptName() { return 'ScreenEffects'; }

    initialize() {
        this.camera = this.entity.camera;
        this.healthSystem = this.app.root.findByName('Player').script.healthSystem;
        this.weaponController = this.app.root.findByName('Player').script.weaponController;
        
        // Effect parameters
        this.damageFlashIntensity = 0.0;
        this.damageFlashColor = new pc.Color(1, 0, 0, 1);
        this.damageFlashDuration = 0.3;
        
        this.screenShakeIntensity = 0.0;
        this.screenShakeDecay = 8.0;
        this.maxShakeDistance = 2.0;
        
        this.motionBlurStrength = 0.0;
        this.chromaticAberrationStrength = 0.0;
        this.vignetteStrength = 0.0;
        
        // Effect states
        this.damageFlashTimer = 0.0;
        this.shakeOffset = new pc.Vec3();
        this.basePosition = new pc.Vec3();
        this.lastVelocity = new pc.Vec3();
        
        // Post-processing setup
        this.setupPostProcessing();
        this.setupEventListeners();
    }

    setupPostProcessing() {
        // Create render targets for effects
        this.createRenderTargets();
        
        // Initialize effect materials
        this.createEffectMaterials();
        
        // Setup post-processing chain
        this.setupPostProcessingChain();
    }

    createRenderTargets() {
        const device = this.app.graphicsDevice;
        const width = device.width;
        const height = device.height;
        
        this.mainRT = new pc.RenderTarget({
            colorBuffer: new pc.Texture(device, {
                width: width,
                height: height,
                format: pc.PIXELFORMAT_R8_G8_B8_A8,
                minFilter: pc.FILTER_LINEAR,
                magFilter: pc.FILTER_LINEAR
            }),
            depth: true
        });
        
        this.blurRT = new pc.RenderTarget({
            colorBuffer: new pc.Texture(device, {
                width: width / 2,
                height: height / 2,
                format: pc.PIXELFORMAT_R8_G8_B8_A8,
                minFilter: pc.FILTER_LINEAR,
                magFilter: pc.FILTER_LINEAR
            })
        });
    }

    createEffectMaterials() {
        // Damage flash material
        this.damageFlashMaterial = new pc.Material();
        this.damageFlashMaterial.shader = this.createDamageFlashShader();
        
        // Motion blur material
        this.motionBlurMaterial = new pc.Material();
        this.motionBlurMaterial.shader = this.createMotionBlurShader();
        
        // Composite material
        this.compositeMaterial = new pc.Material();
        this.compositeMaterial.shader = this.createCompositeShader();
    }

    createDamageFlashShader() {
        const vertexShader = `
            attribute vec3 vertex_position;
            attribute vec2 vertex_texCoord0;
            
            varying vec2 vUv0;
            
            void main(void) {
                gl_Position = vec4(vertex_position, 1.0);
                vUv0 = vertex_texCoord0;
            }
        `;
        
        const fragmentShader = `
            precision mediump float;
            
            uniform sampler2D uDiffuseMap;
            uniform vec3 uFlashColor;
            uniform float uFlashIntensity;
            uniform float uVignetteStrength;
            
            varying vec2 vUv0;
            
            void main(void) {
                vec4 color = texture2D(uDiffuseMap, vUv0);
                
                // Damage flash
                vec3 flashedColor = mix(color.rgb, uFlashColor, uFlashIntensity);
                
                // Vignette effect
                vec2 center = vUv0 - 0.5;
                float vignette = 1.0 - dot(center, center) * uVignetteStrength;
                vignette = clamp(vignette, 0.0, 1.0);
                
                gl_FragColor = vec4(flashedColor * vignette, color.a);
            }
        `;
        
        return pc.createShaderFromCode(this.app.graphicsDevice, vertexShader, fragmentShader, 'damageFlashShader');
    }

    createMotionBlurShader() {
        const vertexShader = `
            attribute vec3 vertex_position;
            attribute vec2 vertex_texCoord0;
            
            varying vec2 vUv0;
            
            void main(void) {
                gl_Position = vec4(vertex_position, 1.0);
                vUv0 = vertex_texCoord0;
            }
        `;
        
        const fragmentShader = `
            precision mediump float;
            
            uniform sampler2D uDiffuseMap;
            uniform vec2 uVelocity;
            uniform float uBlurStrength;
            
            varying vec2 vUv0;
            
            void main(void) {
                vec4 color = texture2D(uDiffuseMap, vUv0);
                
                if (uBlurStrength > 0.0) {
                    vec2 blurVector = uVelocity * uBlurStrength * 0.01;
                    
                    for (int i = 1; i <= 8; i++) {
                        float t = float(i) / 8.0;
                        vec2 offset = blurVector * t;
                        color += texture2D(uDiffuseMap, vUv0 + offset);
                        color += texture2D(uDiffuseMap, vUv0 - offset);
                    }
                    
                    color /= 17.0; // 1 + 8*2 samples
                }
                
                gl_FragColor = color;
            }
        `;
        
        return pc.createShaderFromCode(this.app.graphicsDevice, vertexShader, fragmentShader, 'motionBlurShader');
    }

    createCompositeShader() {
        const vertexShader = `
            attribute vec3 vertex_position;
            attribute vec2 vertex_texCoord0;
            
            varying vec2 vUv0;
            
            void main(void) {
                gl_Position = vec4(vertex_position, 1.0);
                vUv0 = vertex_texCoord0;
            }
        `;
        
        const fragmentShader = `
            precision mediump float;
            
            uniform sampler2D uDiffuseMap;
            uniform float uChromaticAberration;
            uniform float uContrast;
            uniform float uSaturation;
            
            varying vec2 vUv0;
            
            vec3 adjustContrast(vec3 color, float contrast) {
                return (color - 0.5) * contrast + 0.5;
            }
            
            vec3 adjustSaturation(vec3 color, float saturation) {
                float gray = dot(color, vec3(0.299, 0.587, 0.114));
                return mix(vec3(gray), color, saturation);
            }
            
            void main(void) {
                vec2 uv = vUv0;
                vec4 color;
                
                if (uChromaticAberration > 0.0) {
                    vec2 offset = (uv - 0.5) * uChromaticAberration * 0.01;
                    float r = texture2D(uDiffuseMap, uv + offset).r;
                    float g = texture2D(uDiffuseMap, uv).g;
                    float b = texture2D(uDiffuseMap, uv - offset).b;
                    color = vec4(r, g, b, 1.0);
                } else {
                    color = texture2D(uDiffuseMap, uv);
                }
                
                // Apply color adjustments
                color.rgb = adjustContrast(color.rgb, uContrast);
                color.rgb = adjustSaturation(color.rgb, uSaturation);
                
                gl_FragColor = color;
            }
        `;
        
        return pc.createShaderFromCode(this.app.graphicsDevice, vertexShader, fragmentShader, 'compositeShader');
    }

    setupPostProcessingChain() {
        // Create full-screen quad for rendering effects
        this.createFullScreenQuad();
        
        // Setup rendering order
        this.camera.renderTarget = this.mainRT;
    }

    createFullScreenQuad() {
        const device = this.app.graphicsDevice;
        
        // Create geometry for full-screen quad
        const positions = new Float32Array([
            -1, -1, 0,
             1, -1, 0,
             1,  1, 0,
            -1,  1, 0
        ]);
        
        const uvs = new Float32Array([
            0, 0,
            1, 0,
            1, 1,
            0, 1
        ]);
        
        const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
        
        this.quadVertexBuffer = new pc.VertexBuffer(device, new pc.VertexFormat(device, [
            { semantic: pc.SEMANTIC_POSITION, components: 3, type: pc.TYPE_FLOAT32 },
            { semantic: pc.SEMANTIC_TEXCOORD0, components: 2, type: pc.TYPE_FLOAT32 }
        ]), 4);
        
        this.quadIndexBuffer = new pc.IndexBuffer(device, pc.INDEXFORMAT_UINT16, 6);
        
        // Upload data
        const iterator = new pc.VertexIterator(this.quadVertexBuffer);
        for (let i = 0; i < 4; i++) {
            iterator.element[pc.SEMANTIC_POSITION].set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
            iterator.element[pc.SEMANTIC_TEXCOORD0].set(uvs[i * 2], uvs[i * 2 + 1]);
            iterator.next();
        }
        iterator.end();
        
        this.quadIndexBuffer.setData(indices);
    }

    setupEventListeners() {
        // Listen for damage events
        this.app.on('player:damage', (data) => {
            this.triggerDamageFlash(data.damage);
        });
        
        // Listen for explosion events
        this.app.on('explosion:occurred', (data) => {
            this.triggerExplosionEffects(data);
        });
        
        // Listen for weapon fire events
        this.app.on('weapon:fired', (data) => {
            this.triggerWeaponEffects(data);
        });
    }

    triggerDamageFlash(damageAmount) {
        const intensity = Math.min(damageAmount / 100.0, 1.0);
        this.damageFlashIntensity = intensity;
        this.damageFlashTimer = this.damageFlashDuration;
        
        // Add screen shake
        this.addScreenShake(intensity * 5.0);
        
        // Adjust other effects based on health
        if (this.healthSystem) {
            const healthPercent = this.healthSystem.getCurrentHealth() / this.healthSystem.getMaxHealth();
            this.vignetteStrength = (1.0 - healthPercent) * 2.0;
            this.chromaticAberrationStrength = (1.0 - healthPercent) * 3.0;
        }
    }

    triggerExplosionEffects(explosionData) {
        const distance = explosionData.distance || 10.0;
        const maxDistance = 50.0;
        const intensity = Math.max(0, 1.0 - distance / maxDistance);
        
        // Screen shake based on distance
        this.addScreenShake(intensity * 15.0);
        
        // Flash effect
        this.damageFlashIntensity = intensity * 0.5;
        this.damageFlashTimer = this.damageFlashDuration * 0.5;
        this.damageFlashColor.set(1, 0.8, 0.3, 1); // Orange flash for explosions
        
        // Motion blur
        this.motionBlurStrength = intensity * 10.0;
    }

    triggerWeaponEffects(weaponData) {
        const weapon = weaponData.weapon;
        
        // Different effects for different weapons
        if (weapon.type === 'sniper') {
            this.addScreenShake(3.0);
        } else if (weapon.type === 'shotgun') {
            this.addScreenShake(2.0);
        } else if (weapon.type === 'assault') {
            this.addScreenShake(0.5);
        }
        
        // Muzzle flash effect
        this.triggerMuzzleFlash();
    }

    triggerMuzzleFlash() {
        this.damageFlashIntensity = 0.1;
        this.damageFlashTimer = 0.05;
        this.damageFlashColor.set(1, 1, 0.8, 1); // Bright white-yellow
    }

    addScreenShake(intensity) {
        this.screenShakeIntensity += intensity;
        this.screenShakeIntensity = Math.min(this.screenShakeIntensity, this.maxShakeDistance);
    }

    update(dt) {
        this.updateDamageFlash(dt);
        this.updateScreenShake(dt);
        this.updateMotionBlur(dt);
        this.updateEffectDecay(dt);
        this.renderEffects();
    }

    updateDamageFlash(dt) {
        if (this.damageFlashTimer > 0) {
            this.damageFlashTimer -= dt;
            const progress = 1.0 - (this.damageFlashTimer / this.damageFlashDuration);
            this.damageFlashIntensity = Math.max(0, this.damageFlashIntensity * (1.0 - progress));
        } else {
            this.damageFlashIntensity = 0;
        }
    }

    updateScreenShake(dt) {
        if (this.screenShakeIntensity > 0) {
            // Generate random shake offset
            const angle = Math.random() * Math.PI * 2;
            const distance = this.screenShakeIntensity;
            
            this.shakeOffset.set(
                Math.cos(angle) * distance,
                Math.sin(angle) * distance,
                0
            );
            
            // Apply shake to camera
            this.entity.setLocalPosition(this.basePosition.clone().add(this.shakeOffset));
            
            // Decay shake
            this.screenShakeIntensity = Math.max(0, this.screenShakeIntensity - this.screenShakeDecay * dt);
        } else {
            // Reset camera position
            this.entity.setLocalPosition(this.basePosition);
        }
    }

    updateMotionBlur(dt) {
        // Calculate camera velocity for motion blur
        const currentPosition = this.entity.getPosition();
        const velocity = currentPosition.clone().sub(this.lastVelocity).scale(1 / dt);
        this.lastVelocity.copy(currentPosition);
        
        // Update motion blur strength based on movement
        const speed = velocity.length();
        this.motionBlurStrength = Math.min(speed * 0.1, 5.0);
    }

    updateEffectDecay(dt) {
        // Decay various effects over time
        this.vignetteStrength = Math.max(0, this.vignetteStrength - dt * 0.5);
        this.chromaticAberrationStrength = Math.max(0, this.chromaticAberrationStrength - dt * 2.0);
        this.motionBlurStrength = Math.max(0, this.motionBlurStrength - dt * 8.0);
    }

    renderEffects() {
        const device = this.app.graphicsDevice;
        
        // Render main scene to render target
        // (This is handled by the camera's render target)
        
        // Apply post-processing effects
        this.applyDamageFlash();
        this.applyMotionBlur();
        this.applyComposite();
    }

    applyDamageFlash() {
        if (this.damageFlashIntensity <= 0) return;
        
        const device = this.app.graphicsDevice;
        
        // Set material parameters
        this.damageFlashMaterial.setParameter('uDiffuseMap', this.mainRT.colorBuffer);
        this.damageFlashMaterial.setParameter('uFlashColor', [
            this.damageFlashColor.r,
            this.damageFlashColor.g,
            this.damageFlashColor.b
        ]);
        this.damageFlashMaterial.setParameter('uFlashIntensity', this.damageFlashIntensity);
        this.damageFlashMaterial.setParameter('uVignetteStrength', this.vignetteStrength);
        
        // Render to back buffer
        this.renderFullScreenQuad(this.damageFlashMaterial);
    }

    applyMotionBlur() {
        if (this.motionBlurStrength <= 0) return;
        
        // Calculate screen-space velocity
        const velocity = new pc.Vec2(
            this.shakeOffset.x * 0.1,
            this.shakeOffset.y * 0.1
        );
        
        this.motionBlurMaterial.setParameter('uDiffuseMap', this.mainRT.colorBuffer);
        this.motionBlurMaterial.setParameter('uVelocity', [velocity.x, velocity.y]);
        this.motionBlurMaterial.setParameter('uBlurStrength', this.motionBlurStrength);
        
        this.renderFullScreenQuad(this.motionBlurMaterial);
    }

    applyComposite() {
        this.compositeMaterial.setParameter('uDiffuseMap', this.mainRT.colorBuffer);
        this.compositeMaterial.setParameter('uChromaticAberration', this.chromaticAberrationStrength);
        this.compositeMaterial.setParameter('uContrast', 1.1);
        this.compositeMaterial.setParameter('uSaturation', 1.0);
        
        this.renderFullScreenQuad(this.compositeMaterial);
    }

    renderFullScreenQuad(material) {
        const device = this.app.graphicsDevice;
        
        device.setVertexBuffer(this.quadVertexBuffer, 0);
        device.setIndexBuffer(this.quadIndexBuffer);
        device.draw({
            type: pc.PRIMITIVE_TRIANGLES,
            base: 0,
            count: 6,
            indexed: true
        });
    }

    // Public API
    setDamageFlashColor(color) {
        this.damageFlashColor.copy(color);
    }

    setVignetteStrength(strength) {
        this.vignetteStrength = strength;
    }

    setChromaticAberration(strength) {
        this.chromaticAberrationStrength = strength;
    }

    triggerCustomEffect(type, intensity, duration) {
        switch (type) {
            case 'flash':
                this.damageFlashIntensity = intensity;
                this.damageFlashTimer = duration;
                break;
            case 'shake':
                this.addScreenShake(intensity);
                break;
            case 'blur':
                this.motionBlurStrength = intensity;
                break;
        }
    }
}

pc.registerScript(ScreenEffects, 'ScreenEffects');
