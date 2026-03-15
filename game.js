// ============================================================
// PIRATE SHIP BATTLE - Full 3D Local Multiplayer Game
// Built with Three.js
// ============================================================

// ---- GLOBALS ----
let scene, camera, renderer, clock;
let water, sky;
let gameState = 'loading';
let selectedMap = 'open_sea';
let players = [];
let projectiles = [];
let particles = [];
let hazards = [];
let mapObjects = [];
let boardingActive = false;
let boardingTimer = 0;
const WATER_SIZE = 500;
const keys = {};

// ---- LOADING ----
let loadProgress = 0;
function updateLoading(pct) {
    loadProgress = pct;
    document.getElementById('load-bar').style.width = pct + '%';
}

// ---- INPUT ----
document.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; keys[e.code] = true; });
document.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; keys[e.code] = false; });

// ---- MENU ----
document.querySelectorAll('.map-card').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.map-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedMap = card.dataset.map;
    });
});
document.getElementById('btn-controls').addEventListener('click', () => {
    const p = document.getElementById('controls-panel');
    p.style.display = p.style.display === 'none' ? 'block' : 'none';
});
document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-restart').addEventListener('click', () => {
    document.getElementById('game-over').style.display = 'none';
    startGame();
});
document.getElementById('btn-menu').addEventListener('click', () => {
    document.getElementById('game-over').style.display = 'none';
    document.getElementById('menu-screen').style.display = 'flex';
    gameState = 'menu';
});

// ---- INIT THREE.JS ----
function initThree() {
    scene = new THREE.Scene();
    clock = new THREE.Clock();

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 80, 120);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    document.body.appendChild(renderer.domElement);

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

// ---- SKY ----
function createSky() {
    const skyGeo = new THREE.SphereGeometry(800, 32, 32);
    const skyMat = new THREE.ShaderMaterial({
        uniforms: {
            topColor: { value: new THREE.Color(0x0055aa) },
            bottomColor: { value: new THREE.Color(0xff7733) },
            offset: { value: 20 },
            exponent: { value: 0.4 }
        },
        vertexShader: `
            varying vec3 vWorldPosition;
            void main() {
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 topColor;
            uniform vec3 bottomColor;
            uniform float offset;
            uniform float exponent;
            varying vec3 vWorldPosition;
            void main() {
                float h = normalize(vWorldPosition + offset).y;
                gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
            }
        `,
        side: THREE.BackSide
    });
    sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(sky);
}

// ---- LIGHTING ----
function createLighting() {
    const ambientLight = new THREE.AmbientLight(0x445566, 0.6);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffeedd, 1.5);
    sunLight.position.set(100, 150, 50);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 500;
    sunLight.shadow.camera.left = -200;
    sunLight.shadow.camera.right = 200;
    sunLight.shadow.camera.top = 200;
    sunLight.shadow.camera.bottom = -200;
    scene.add(sunLight);

    const hemiLight = new THREE.HemisphereLight(0x88aacc, 0x444422, 0.5);
    scene.add(hemiLight);

    // Sun visual
    const sunGeo = new THREE.SphereGeometry(15, 16, 16);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    sun.position.copy(sunLight.position);
    scene.add(sun);
}

// ---- WATER ----
function createWater() {
    const waterGeo = new THREE.PlaneGeometry(WATER_SIZE * 2, WATER_SIZE * 2, 128, 128);
    const waterMat = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            waterColor: { value: new THREE.Color(0x006688) },
            foamColor: { value: new THREE.Color(0x88ccee) }
        },
        vertexShader: `
            uniform float time;
            varying vec2 vUv;
            varying float vElevation;
            void main() {
                vUv = uv;
                vec3 pos = position;
                float wave1 = sin(pos.x * 0.05 + time * 0.8) * 2.0;
                float wave2 = sin(pos.y * 0.07 + time * 0.6) * 1.5;
                float wave3 = sin((pos.x + pos.y) * 0.03 + time * 1.2) * 1.0;
                float wave4 = sin(pos.x * 0.12 + pos.y * 0.08 + time * 1.5) * 0.5;
                pos.z = wave1 + wave2 + wave3 + wave4;
                vElevation = pos.z;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 waterColor;
            uniform vec3 foamColor;
            uniform float time;
            varying vec2 vUv;
            varying float vElevation;
            void main() {
                float foam = smoothstep(1.5, 3.0, vElevation);
                vec3 deepColor = waterColor * 0.6;
                vec3 color = mix(deepColor, waterColor, (vElevation + 3.0) / 6.0);
                color = mix(color, foamColor, foam * 0.5);
                float sparkle = pow(sin(vUv.x * 200.0 + time * 2.0) * sin(vUv.y * 200.0 + time * 1.5), 8.0);
                color += vec3(sparkle * 0.3);
                gl_FragColor = vec4(color, 0.92);
            }
        `,
        transparent: true,
        side: THREE.DoubleSide
    });
    water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.receiveShadow = true;
    scene.add(water);

    // Fog
    scene.fog = new THREE.FogExp2(0x88aabb, 0.0015);
}

// ---- 3D SHIP BUILDER ----
function buildShip(color, accentColor) {
    const ship = new THREE.Group();

    // Hull
    const hullShape = new THREE.Shape();
    hullShape.moveTo(-12, 0);
    hullShape.quadraticCurveTo(-14, 4, -10, 8);
    hullShape.lineTo(10, 8);
    hullShape.quadraticCurveTo(14, 4, 12, 0);
    hullShape.lineTo(-12, 0);

    const extrudeSettings = { depth: 5, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 3 };
    const hullGeo = new THREE.ExtrudeGeometry(hullShape, extrudeSettings);
    const hullMat = new THREE.MeshPhongMaterial({ color: 0x5C3A1E, specular: 0x222222, shininess: 30 });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.rotation.x = Math.PI / 2;
    hull.rotation.z = Math.PI / 2;
    hull.position.y = -1;
    hull.castShadow = true;
    ship.add(hull);

    // Deck
    const deckGeo = new THREE.BoxGeometry(22, 0.5, 8);
    const deckMat = new THREE.MeshPhongMaterial({ color: 0x8B6914 });
    const deck = new THREE.Mesh(deckGeo, deckMat);
    deck.position.y = 2.5;
    deck.castShadow = true;
    ship.add(deck);

    // Hull stripes (color band)
    const stripGeo = new THREE.BoxGeometry(23, 1.2, 6.5);
    const stripMat = new THREE.MeshPhongMaterial({ color: color });
    const strip = new THREE.Mesh(stripGeo, stripMat);
    strip.position.y = 1;
    ship.add(strip);

    // Cabin / Quarterdeck
    const cabinGeo = new THREE.BoxGeometry(6, 4, 6);
    const cabinMat = new THREE.MeshPhongMaterial({ color: 0x4a2a0a });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(-6, 4.5, 0);
    cabin.castShadow = true;
    ship.add(cabin);

    // Cabin windows
    for (let i = -1; i <= 1; i++) {
        const winGeo = new THREE.BoxGeometry(0.3, 1, 0.8);
        const winMat = new THREE.MeshPhongMaterial({ color: 0xffdd88, emissive: 0x664400 });
        const win = new THREE.Mesh(winGeo, winMat);
        win.position.set(-9.1, 4.5, i * 1.5);
        ship.add(win);
    }

    // Bowsprit
    const bowGeo = new THREE.CylinderGeometry(0.2, 0.3, 8, 8);
    const bowMat = new THREE.MeshPhongMaterial({ color: 0x6B4226 });
    const bowsprit = new THREE.Mesh(bowGeo, bowMat);
    bowsprit.rotation.z = Math.PI / 2 + 0.3;
    bowsprit.position.set(14, 3, 0);
    ship.add(bowsprit);

    // Main mast
    const mastGeo = new THREE.CylinderGeometry(0.3, 0.4, 20, 8);
    const mastMat = new THREE.MeshPhongMaterial({ color: 0x6B4226 });
    const mast = new THREE.Mesh(mastGeo, mastMat);
    mast.position.set(2, 12, 0);
    mast.castShadow = true;
    ship.add(mast);

    // Fore mast
    const foreMast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 15, 8), mastMat);
    foreMast.position.set(8, 10, 0);
    foreMast.castShadow = true;
    ship.add(foreMast);

    // Mizzen mast
    const mizzenMast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 12, 8), mastMat);
    mizzenMast.position.set(-4, 9, 0);
    mizzenMast.castShadow = true;
    ship.add(mizzenMast);

    // Sails (main)
    const sailGeo = new THREE.PlaneGeometry(8, 10);
    const sailMat = new THREE.MeshPhongMaterial({
        color: 0xfff8e8, side: THREE.DoubleSide, transparent: true, opacity: 0.9
    });
    const mainSail = new THREE.Mesh(sailGeo, sailMat);
    mainSail.position.set(2, 14, 0);
    mainSail.name = 'mainSail';
    ship.add(mainSail);

    // Fore sail
    const foreSail = new THREE.Mesh(new THREE.PlaneGeometry(6, 7), sailMat);
    foreSail.position.set(8, 11, 0);
    ship.add(foreSail);

    // Jolly Roger flag
    const flagGeo = new THREE.PlaneGeometry(3, 2);
    const flagMat = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide });
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(2, 22.5, 0);
    flag.name = 'flag';
    ship.add(flag);

    // Skull on flag (simple cross)
    const skullGeo = new THREE.SphereGeometry(0.4, 8, 8);
    const skullMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const skull = new THREE.Mesh(skullGeo, skullMat);
    skull.position.set(2, 22.5, 0.1);
    ship.add(skull);
    const bone1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.5, 4), skullMat);
    bone1.rotation.z = 0.7;
    bone1.position.set(2, 22, 0.1);
    ship.add(bone1);
    const bone2 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.5, 4), skullMat);
    bone2.rotation.z = -0.7;
    bone2.position.set(2, 22, 0.1);
    ship.add(bone2);

    // Cannons (3 per side)
    const cannonMat = new THREE.MeshPhongMaterial({ color: 0x222222, specular: 0x444444, shininess: 80 });
    ship.userData.cannonPositions = [];
    for (let i = 0; i < 3; i++) {
        const x = -3 + i * 5;
        for (let side = -1; side <= 1; side += 2) {
            const cannonGroup = new THREE.Group();
            // Barrel
            const barrelGeo = new THREE.CylinderGeometry(0.3, 0.4, 2.5, 8);
            const barrel = new THREE.Mesh(barrelGeo, cannonMat);
            barrel.rotation.x = Math.PI / 2;
            barrel.position.z = side * 1;
            cannonGroup.add(barrel);
            // Wheel mount
            const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 8);
            const wheel = new THREE.Mesh(wheelGeo, new THREE.MeshPhongMaterial({ color: 0x4a2a0a }));
            wheel.rotation.x = Math.PI / 2;
            cannonGroup.add(wheel);

            cannonGroup.position.set(x, 3, side * 4);
            ship.add(cannonGroup);
            ship.userData.cannonPositions.push({ x: x, side: side });
        }
    }

    // Railing
    const railMat = new THREE.MeshPhongMaterial({ color: 0x4a2a0a });
    for (let side = -1; side <= 1; side += 2) {
        for (let i = -10; i <= 10; i += 2) {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2, 4), railMat);
            post.position.set(i, 3.5, side * 4.2);
            ship.add(post);
        }
        const rail = new THREE.Mesh(new THREE.BoxGeometry(22, 0.15, 0.15), railMat);
        rail.position.set(0, 4.5, side * 4.2);
        ship.add(rail);
    }

    // Color accent on bow/stern
    const accentGeo = new THREE.BoxGeometry(2, 3, 7);
    const accentMat = new THREE.MeshPhongMaterial({ color: accentColor });
    const bowAccent = new THREE.Mesh(accentGeo, accentMat);
    bowAccent.position.set(11, 2, 0);
    ship.add(bowAccent);

    // Figurehead
    const figGeo = new THREE.ConeGeometry(0.5, 3, 6);
    const figMat = new THREE.MeshPhongMaterial({ color: 0xd4a056 });
    const figurehead = new THREE.Mesh(figGeo, figMat);
    figurehead.rotation.z = -Math.PI / 2 - 0.3;
    figurehead.position.set(14, 1.5, 0);
    ship.add(figurehead);

    // Lanterns
    const lanternMat = new THREE.MeshPhongMaterial({ color: 0xffaa00, emissive: 0xff6600, emissiveIntensity: 0.5 });
    const lantern1 = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), lanternMat);
    lantern1.position.set(-9, 6.5, 2);
    ship.add(lantern1);
    const lantern2 = lantern1.clone();
    lantern2.position.set(-9, 6.5, -2);
    ship.add(lantern2);

    // Point light for lanterns
    const lanternLight = new THREE.PointLight(0xff8800, 0.5, 15);
    lanternLight.position.set(-9, 6.5, 0);
    ship.add(lanternLight);

    ship.castShadow = true;
    return ship;
}

// ---- PLAYER ----
class Player {
    constructor(id, color, accentColor, startX, startZ, startRot) {
        this.id = id;
        this.mesh = buildShip(color, accentColor);
        this.mesh.position.set(startX, 0, startZ);
        this.mesh.rotation.y = startRot;
        scene.add(this.mesh);

        this.speed = 0;
        this.maxSpeed = 18;
        this.turnSpeed = 1.2;
        this.shipHP = 100;
        this.crewHP = 100;
        this.coins = 0;
        this.cannonCooldown = 0;
        this.flintlockCooldown = 0;
        this.musketCooldown = 0;
        this.swordCooldown = 0;
        this.boardCooldown = 0;
        this.isBoarding = false;
        this.color = color;
        this.boardingProgress = 0;
        this.hitFlash = 0;
        this.speedBoost = 0;
    }

    getForward() {
        return new THREE.Vector3(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y));
    }

    getPosition() { return this.mesh.position; }

    update(dt, inputMap) {
        // Cooldowns
        this.cannonCooldown = Math.max(0, this.cannonCooldown - dt);
        this.flintlockCooldown = Math.max(0, this.flintlockCooldown - dt);
        this.musketCooldown = Math.max(0, this.musketCooldown - dt);
        this.swordCooldown = Math.max(0, this.swordCooldown - dt);
        this.boardCooldown = Math.max(0, this.boardCooldown - dt);
        this.hitFlash = Math.max(0, this.hitFlash - dt);
        this.speedBoost = Math.max(0, this.speedBoost - dt);

        // Movement
        if (inputMap.forward) this.speed = Math.min(this.speed + 12 * dt, this.maxSpeed);
        else if (inputMap.backward) this.speed = Math.max(this.speed - 8 * dt, -this.maxSpeed * 0.3);
        else this.speed *= 0.98;

        if (this.speedBoost > 0) this.speed = Math.min(this.speed * 1.01, this.maxSpeed * 1.5);

        if (inputMap.left) this.mesh.rotation.y += this.turnSpeed * dt;
        if (inputMap.right) this.mesh.rotation.y -= this.turnSpeed * dt;

        const forward = this.getForward();
        this.mesh.position.x += forward.x * this.speed * dt;
        this.mesh.position.z += forward.z * this.speed * dt;

        // Boundary
        const bound = WATER_SIZE - 20;
        this.mesh.position.x = Math.max(-bound, Math.min(bound, this.mesh.position.x));
        this.mesh.position.z = Math.max(-bound, Math.min(bound, this.mesh.position.z));

        // Bobbing
        const time = clock.getElapsedTime();
        this.mesh.position.y = Math.sin(time * 0.8 + this.id) * 1.2;
        this.mesh.rotation.x = Math.sin(time * 0.6 + this.id * 3) * 0.03;
        this.mesh.rotation.z = Math.sin(time * 0.5 + this.id * 2) * 0.04;

        // Sail billowing
        const sail = this.mesh.getObjectByName('mainSail');
        if (sail) {
            sail.rotation.y = Math.sin(time * 1.5) * 0.15;
        }

        // Flag waving
        const flag = this.mesh.getObjectByName('flag');
        if (flag) {
            flag.rotation.y = Math.sin(time * 3) * 0.2;
        }

        // Hit flash effect
        if (this.hitFlash > 0) {
            this.mesh.traverse(child => {
                if (child.isMesh && child.material && child.material.emissive) {
                    child.material.emissive.setHex(0xff0000);
                    child.material.emissiveIntensity = this.hitFlash;
                }
            });
        } else {
            this.mesh.traverse(child => {
                if (child.isMesh && child.material && child.material.emissive) {
                    child.material.emissiveIntensity = 0;
                }
            });
        }
    }

    fireCannons(targetPlayer) {
        if (this.cannonCooldown > 0) return;
        this.cannonCooldown = 1.5;

        const pos = this.getPosition();
        const rot = this.mesh.rotation.y;

        // Fire from both sides
        for (let side = -1; side <= 1; side += 2) {
            for (let i = 0; i < 3; i++) {
                const offset = -3 + i * 5;
                const spawnX = pos.x + Math.sin(rot) * offset + Math.cos(rot) * side * 5;
                const spawnZ = pos.z + Math.cos(rot) * offset - Math.sin(rot) * side * 5;

                const ball = createCannonball(spawnX, 4, spawnZ);
                const dirX = Math.cos(rot) * side;
                const dirZ = -Math.sin(rot) * side;
                ball.velocity = new THREE.Vector3(dirX * 40 + this.speed * Math.sin(rot) * 0.3, 8, dirZ * 40 + this.speed * Math.cos(rot) * 0.3);
                ball.owner = this.id;
                ball.damage = 12;
                ball.type = 'cannon';
                projectiles.push(ball);
            }
        }

        // Muzzle flash
        for (let side = -1; side <= 1; side += 2) {
            for (let i = 0; i < 3; i++) {
                const offset = -3 + i * 5;
                const fx = pos.x + Math.sin(rot) * offset + Math.cos(rot) * side * 5.5;
                const fz = pos.z + Math.cos(rot) * offset - Math.sin(rot) * side * 5.5;
                spawnSmoke(fx, 4, fz, 8);
                spawnFlash(fx, 4, fz);
            }
        }
        showEvent('BROADSIDE!');
    }

    fireFlintlock(targetPlayer) {
        if (this.flintlockCooldown > 0) return;
        const dist = this.getPosition().distanceTo(targetPlayer.getPosition());
        if (dist > 40) { showEvent('Too far for flintlock!'); return; }
        this.flintlockCooldown = 0.8;

        const dir = new THREE.Vector3().subVectors(targetPlayer.getPosition(), this.getPosition()).normalize();
        const pos = this.getPosition();
        const ball = createBullet(pos.x, 5, pos.z, 0xffaa00);
        ball.velocity = dir.multiplyScalar(80);
        ball.owner = this.id;
        ball.damage = 8;
        ball.type = 'flintlock';
        projectiles.push(ball);
        spawnFlash(pos.x + dir.x * 3, 5, pos.z + dir.z * 3);
        showEvent('Flintlock!');
    }

    fireMusket(targetPlayer) {
        if (this.musketCooldown > 0) return;
        this.musketCooldown = 2.0;

        const dir = new THREE.Vector3().subVectors(targetPlayer.getPosition(), this.getPosition()).normalize();
        const pos = this.getPosition();
        const ball = createBullet(pos.x, 6, pos.z, 0xffffff);
        ball.velocity = dir.multiplyScalar(100);
        ball.owner = this.id;
        ball.damage = 18;
        ball.type = 'musket';
        projectiles.push(ball);
        spawnSmoke(pos.x + dir.x * 3, 6, pos.z + dir.z * 3, 4);
        spawnFlash(pos.x + dir.x * 3, 6, pos.z + dir.z * 3);
        showEvent('Musket shot!');
    }

    attemptBoard(targetPlayer) {
        if (this.boardCooldown > 0) return;
        const dist = this.getPosition().distanceTo(targetPlayer.getPosition());
        if (dist > 25) { showEvent('Get closer to board!'); return; }

        if (this.isBoarding) {
            // Sword attack during boarding
            if (this.swordCooldown > 0) return;
            this.swordCooldown = 0.5;
            targetPlayer.crewHP -= 10;
            targetPlayer.hitFlash = 0.3;
            spawnSwordSpark(
                (this.getPosition().x + targetPlayer.getPosition().x) / 2,
                6,
                (this.getPosition().z + targetPlayer.getPosition().z) / 2
            );
            showEvent('Sword clash!');

            if (targetPlayer.crewHP <= 30) {
                const raidCoins = 15 + Math.floor(Math.random() * 10);
                this.coins += raidCoins;
                targetPlayer.coins = Math.max(0, targetPlayer.coins - raidCoins);
                showEvent('Raided ' + raidCoins + ' coins!');
            }
            return;
        }

        this.isBoarding = true;
        this.boardCooldown = 0.5;
        this.speed *= 0.3;
        targetPlayer.speed *= 0.3;
        showEvent('BOARDING ACTION!');

        // Spawn grappling hooks visual
        spawnGrapplingHooks(this.getPosition(), targetPlayer.getPosition());
    }

    takeDamage(amount, type) {
        if (type === 'cannon') {
            this.shipHP -= amount;
        } else {
            this.crewHP -= amount;
        }
        this.hitFlash = 0.5;
        this.shipHP = Math.max(0, this.shipHP);
        this.crewHP = Math.max(0, this.crewHP);
    }
}

// ---- PROJECTILES ----
function createCannonball(x, y, z) {
    const geo = new THREE.SphereGeometry(0.5, 8, 8);
    const mat = new THREE.MeshPhongMaterial({ color: 0x222222, specular: 0x666666 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    scene.add(mesh);

    // Trail
    const trailGeo = new THREE.SphereGeometry(0.2, 4, 4);
    const trailMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.6 });
    const trail = new THREE.Mesh(trailGeo, trailMat);
    mesh.add(trail);

    return { mesh, velocity: new THREE.Vector3(), life: 4, owner: -1, damage: 10, type: 'cannon' };
}

function createBullet(x, y, z, color) {
    const geo = new THREE.SphereGeometry(0.15, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    scene.add(mesh);

    // Tracer line
    const lineGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 4);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffff88, transparent: true, opacity: 0.8 });
    const line = new THREE.Mesh(lineGeo, lineMat);
    mesh.add(line);

    return { mesh, velocity: new THREE.Vector3(), life: 2, owner: -1, damage: 8, type: 'bullet' };
}

function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.life -= dt;

        // Gravity for cannonballs
        if (p.type === 'cannon') {
            p.velocity.y -= 20 * dt;
        }

        p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));

        // Hit water
        if (p.mesh.position.y < 0) {
            spawnSplash(p.mesh.position.x, 0, p.mesh.position.z);
            scene.remove(p.mesh);
            projectiles.splice(i, 1);
            continue;
        }

        // Hit ships
        for (const player of players) {
            if (player.id === p.owner) continue;
            const dist = p.mesh.position.distanceTo(player.getPosition());
            if (dist < 12) {
                player.takeDamage(p.damage, p.type === 'cannon' ? 'cannon' : 'crew');
                spawnExplosion(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, p.type === 'cannon');
                scene.remove(p.mesh);
                projectiles.splice(i, 1);
                break;
            }
        }

        if (p.life <= 0) {
            scene.remove(p.mesh);
            projectiles.splice(i, 1);
        }
    }
}

// ---- PARTICLES / VFX ----
function spawnSmoke(x, y, z, count) {
    for (let i = 0; i < count; i++) {
        const geo = new THREE.SphereGeometry(0.5 + Math.random() * 1, 6, 6);
        const mat = new THREE.MeshBasicMaterial({ color: 0x999999, transparent: true, opacity: 0.7 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x + (Math.random() - 0.5) * 2, y, z + (Math.random() - 0.5) * 2);
        scene.add(mesh);
        particles.push({
            mesh, life: 1.5 + Math.random(),
            velocity: new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3),
            type: 'smoke'
        });
    }
}

function spawnFlash(x, y, z) {
    const geo = new THREE.SphereGeometry(1.5, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    particles.push({ mesh, life: 0.15, velocity: new THREE.Vector3(), type: 'flash' });
}

function spawnExplosion(x, y, z, big) {
    const count = big ? 20 : 8;
    for (let i = 0; i < count; i++) {
        const geo = new THREE.SphereGeometry(0.3 + Math.random() * 0.5, 6, 6);
        const colors = [0xff4400, 0xff8800, 0xffcc00, 0xff2200];
        const mat = new THREE.MeshBasicMaterial({ color: colors[Math.floor(Math.random() * colors.length)], transparent: true, opacity: 1 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        scene.add(mesh);
        const speed = big ? 15 : 8;
        particles.push({
            mesh, life: 0.5 + Math.random() * 0.5,
            velocity: new THREE.Vector3((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed),
            type: 'fire'
        });
    }
    // Debris
    if (big) {
        for (let i = 0; i < 8; i++) {
            const geo = new THREE.BoxGeometry(0.3, 0.3, 1);
            const mat = new THREE.MeshPhongMaterial({ color: 0x5C3A1E });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, y, z);
            mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            scene.add(mesh);
            particles.push({
                mesh, life: 2 + Math.random(),
                velocity: new THREE.Vector3((Math.random() - 0.5) * 20, 5 + Math.random() * 10, (Math.random() - 0.5) * 20),
                type: 'debris'
            });
        }
    }
}

function spawnSplash(x, y, z) {
    for (let i = 0; i < 8; i++) {
        const geo = new THREE.SphereGeometry(0.3, 4, 4);
        const mat = new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.8 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        scene.add(mesh);
        particles.push({
            mesh, life: 0.8 + Math.random() * 0.4,
            velocity: new THREE.Vector3((Math.random() - 0.5) * 8, 5 + Math.random() * 5, (Math.random() - 0.5) * 8),
            type: 'splash'
        });
    }
}

function spawnSwordSpark(x, y, z) {
    for (let i = 0; i < 12; i++) {
        const geo = new THREE.BoxGeometry(0.1, 0.1, 0.4);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffff88, transparent: true, opacity: 1 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        scene.add(mesh);
        particles.push({
            mesh, life: 0.3 + Math.random() * 0.2,
            velocity: new THREE.Vector3((Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15),
            type: 'spark'
        });
    }
}

function spawnGrapplingHooks(from, to) {
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    mid.y = 8;
    // Rope
    const points = [];
    for (let t = 0; t <= 1; t += 0.1) {
        const p = new THREE.Vector3().lerpVectors(from, to, t);
        p.y = 4 + Math.sin(t * Math.PI) * 6;
        points.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.1, 4, false);
    const tubeMat = new THREE.MeshPhongMaterial({ color: 0x8B7355 });
    const rope = new THREE.Mesh(tubeGeo, tubeMat);
    scene.add(rope);
    particles.push({ mesh: rope, life: 3, velocity: new THREE.Vector3(), type: 'rope' });
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
            scene.remove(p.mesh);
            particles.splice(i, 1);
            continue;
        }
        p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));

        if (p.type === 'debris' || p.type === 'splash') {
            p.velocity.y -= 15 * dt;
            if (p.mesh.position.y < 0) { p.life = 0; }
        }
        if (p.type === 'smoke') {
            p.mesh.material.opacity = p.life / 2;
            p.mesh.scale.multiplyScalar(1 + dt * 0.5);
        }
        if (p.type === 'flash') {
            p.mesh.scale.multiplyScalar(1 + dt * 10);
            p.mesh.material.opacity = p.life / 0.15;
        }
        if (p.type === 'fire') {
            p.mesh.material.opacity = p.life;
            p.velocity.y -= 5 * dt;
        }
        if (p.type === 'spark') {
            p.mesh.material.opacity = p.life / 0.5;
        }
    }
}

// ---- SEA MONSTERS & HAZARDS ----
function createKraken(x, z) {
    const kraken = new THREE.Group();
    kraken.position.set(x, -5, z);

    // Body
    const bodyGeo = new THREE.SphereGeometry(8, 16, 12);
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x2a4a2a, specular: 0x446644, shininess: 40 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.scale.y = 0.6;
    kraken.add(body);

    // Eyes
    for (let side = -1; side <= 1; side += 2) {
        const eyeGeo = new THREE.SphereGeometry(1.5, 8, 8);
        const eyeMat = new THREE.MeshPhongMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.8 });
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(5, 2, side * 4);
        kraken.add(eye);

        // Pupil
        const pupilGeo = new THREE.SphereGeometry(0.6, 6, 6);
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const pupil = new THREE.Mesh(pupilGeo, pupilMat);
        pupil.position.set(6.2, 2, side * 4);
        kraken.add(pupil);
    }

    // Tentacles
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const tentacle = new THREE.Group();

        for (let j = 0; j < 10; j++) {
            const radius = 1.5 - j * 0.12;
            const segGeo = new THREE.SphereGeometry(Math.max(radius, 0.3), 8, 6);
            const segMat = new THREE.MeshPhongMaterial({
                color: j % 3 === 0 ? 0x3a5a3a : 0x2a4a2a,
                specular: 0x446644
            });
            const seg = new THREE.Mesh(segGeo, segMat);
            seg.position.set(
                Math.cos(angle) * (8 + j * 2.5),
                -j * 0.3,
                Math.sin(angle) * (8 + j * 2.5)
            );
            seg.scale.y = 0.5;
            tentacle.add(seg);

            // Suckers
            if (j > 2 && j % 2 === 0) {
                const suckerGeo = new THREE.SphereGeometry(0.3, 6, 6);
                const suckerMat = new THREE.MeshPhongMaterial({ color: 0x557755 });
                const sucker = new THREE.Mesh(suckerGeo, suckerMat);
                sucker.position.copy(seg.position);
                sucker.position.y -= 0.5;
                tentacle.add(sucker);
            }
        }
        tentacle.userData.angle = angle;
        tentacle.userData.index = i;
        kraken.add(tentacle);
    }

    // Head crest
    for (let i = 0; i < 5; i++) {
        const crestGeo = new THREE.ConeGeometry(0.8, 3, 6);
        const crestMat = new THREE.MeshPhongMaterial({ color: 0x1a3a1a });
        const crest = new THREE.Mesh(crestGeo, crestMat);
        crest.position.set(-3 + i * 1.5, 5, 0);
        crest.rotation.z = 0.3;
        kraken.add(crest);
    }

    scene.add(kraken);
    return {
        mesh: kraken, type: 'kraken', x, z, radius: 30, cooldown: 0,
        active: false, surfaceTimer: 0, submerged: true
    };
}

function createLeviathan(x, z) {
    const leviathan = new THREE.Group();
    leviathan.position.set(x, -10, z);

    // Serpentine body segments
    const segCount = 15;
    for (let i = 0; i < segCount; i++) {
        const size = i < 3 ? 4 - i * 0.3 : (i < segCount - 3 ? 2.5 : 2.5 - (i - segCount + 4) * 0.5);
        const segGeo = new THREE.SphereGeometry(Math.max(size, 0.5), 10, 8);
        const segMat = new THREE.MeshPhongMaterial({
            color: i % 2 === 0 ? 0x1a2a5a : 0x2a3a6a,
            specular: 0x4466aa,
            shininess: 60
        });
        const seg = new THREE.Mesh(segGeo, segMat);
        seg.name = 'seg_' + i;
        seg.position.set(i * 5, 0, 0);
        seg.scale.set(1, 0.7, 1);
        leviathan.add(seg);

        // Dorsal spines
        if (i > 1 && i < segCount - 2 && i % 2 === 0) {
            const spineGeo = new THREE.ConeGeometry(0.4, 3, 4);
            const spineMat = new THREE.MeshPhongMaterial({ color: 0x3a4a7a });
            const spine = new THREE.Mesh(spineGeo, spineMat);
            spine.position.set(i * 5, size + 1, 0);
            leviathan.add(spine);
        }
    }

    // Head details
    const jawGeo = new THREE.BoxGeometry(5, 1.5, 4);
    const jawMat = new THREE.MeshPhongMaterial({ color: 0x1a2a5a });
    const jaw = new THREE.Mesh(jawGeo, jawMat);
    jaw.position.set(-2, -1.5, 0);
    leviathan.add(jaw);

    // Teeth
    for (let i = 0; i < 6; i++) {
        const toothGeo = new THREE.ConeGeometry(0.2, 1, 4);
        const toothMat = new THREE.MeshPhongMaterial({ color: 0xffffee });
        const tooth = new THREE.Mesh(toothGeo, toothMat);
        tooth.position.set(-4 + i * 0.8, -2, i % 2 === 0 ? 1.5 : -1.5);
        tooth.rotation.x = Math.PI;
        leviathan.add(tooth);
    }

    // Eyes
    for (let side = -1; side <= 1; side += 2) {
        const eyeGeo = new THREE.SphereGeometry(0.8, 8, 8);
        const eyeMat = new THREE.MeshPhongMaterial({ color: 0x00ffaa, emissive: 0x00ff88, emissiveIntensity: 1 });
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(-1, 1.5, side * 3);
        leviathan.add(eye);
    }

    // Tail fin
    const tailGeo = new THREE.PlaneGeometry(6, 4);
    const tailMat = new THREE.MeshPhongMaterial({ color: 0x2a3a6a, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    const tail = new THREE.Mesh(tailGeo, tailMat);
    tail.position.set(segCount * 5, 0, 0);
    tail.rotation.y = Math.PI / 2;
    leviathan.add(tail);

    scene.add(leviathan);
    return {
        mesh: leviathan, type: 'leviathan', x, z, radius: 35, cooldown: 0,
        active: false, pathAngle: 0, submerged: true
    };
}

function createWhirlpool(x, z) {
    const whirlpool = new THREE.Group();
    whirlpool.position.set(x, -0.5, z);

    // Concentric rings
    for (let i = 0; i < 6; i++) {
        const ringGeo = new THREE.RingGeometry(3 + i * 3, 4 + i * 3, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color().setHSL(0.55, 0.8, 0.2 + i * 0.05),
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.6 - i * 0.08
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = -i * 0.5;
        ring.name = 'ring_' + i;
        whirlpool.add(ring);
    }

    // Central vortex
    const vortexGeo = new THREE.ConeGeometry(3, 8, 16, 1, true);
    const vortexMat = new THREE.MeshBasicMaterial({
        color: 0x002244, side: THREE.DoubleSide, transparent: true, opacity: 0.5
    });
    const vortex = new THREE.Mesh(vortexGeo, vortexMat);
    vortex.position.y = -4;
    whirlpool.add(vortex);

    // Foam particles
    for (let i = 0; i < 20; i++) {
        const foamGeo = new THREE.SphereGeometry(0.3, 4, 4);
        const foamMat = new THREE.MeshBasicMaterial({ color: 0xaaddee, transparent: true, opacity: 0.6 });
        const foam = new THREE.Mesh(foamGeo, foamMat);
        const angle = (i / 20) * Math.PI * 2;
        const radius = 5 + Math.random() * 15;
        foam.position.set(Math.cos(angle) * radius, 0.5, Math.sin(angle) * radius);
        foam.name = 'foam_' + i;
        whirlpool.add(foam);
    }

    scene.add(whirlpool);
    return {
        mesh: whirlpool, type: 'whirlpool', x, z, radius: 25, active: true, pullStrength: 15
    };
}

function updateHazards(dt) {
    const time = clock.getElapsedTime();

    for (const h of hazards) {
        if (h.type === 'kraken') {
            // Periodically surface
            h.surfaceTimer += dt;
            if (h.submerged && h.surfaceTimer > 15) {
                h.submerged = false;
                h.surfaceTimer = 0;
                h.active = true;
                showEvent('THE KRAKEN RISES!');
            }
            if (!h.submerged && h.surfaceTimer > 10) {
                h.submerged = true;
                h.surfaceTimer = 0;
                h.active = false;
            }

            const targetY = h.submerged ? -15 : 0;
            h.mesh.position.y += (targetY - h.mesh.position.y) * dt * 2;

            // Animate tentacles
            h.mesh.children.forEach(child => {
                if (child.userData.index !== undefined) {
                    child.children.forEach((seg, j) => {
                        seg.position.y = Math.sin(time * 2 + child.userData.index + j * 0.5) * 2;
                    });
                }
            });

            // Damage nearby ships
            if (h.active) {
                h.cooldown -= dt;
                for (const player of players) {
                    const dist = new THREE.Vector2(
                        player.getPosition().x - h.x,
                        player.getPosition().z - h.z
                    ).length();
                    if (dist < h.radius && h.cooldown <= 0) {
                        player.takeDamage(5, 'cannon');
                        spawnSplash(player.getPosition().x, 2, player.getPosition().z);
                        showEvent('Kraken attacks!');
                        h.cooldown = 2;
                    }
                }
            }
        }

        if (h.type === 'leviathan') {
            // Circle around
            h.pathAngle += dt * 0.3;
            const pathRadius = 60;
            h.mesh.position.x = h.x + Math.cos(h.pathAngle) * pathRadius;
            h.mesh.position.z = h.z + Math.sin(h.pathAngle) * pathRadius;

            // Surface periodically
            h.surfaceTimer = (h.surfaceTimer || 0) + dt;
            if (h.submerged && h.surfaceTimer > 20) {
                h.submerged = false;
                h.surfaceTimer = 0;
                h.active = true;
                showEvent('LEVIATHAN SPOTTED!');
            }
            if (!h.submerged && h.surfaceTimer > 12) {
                h.submerged = true;
                h.surfaceTimer = 0;
                h.active = false;
            }

            const targetY = h.submerged ? -15 : -2;
            h.mesh.position.y += (targetY - h.mesh.position.y) * dt * 1.5;

            // Serpentine motion
            h.mesh.children.forEach(child => {
                if (child.name && child.name.startsWith('seg_')) {
                    const idx = parseInt(child.name.split('_')[1]);
                    child.position.y = Math.sin(time * 1.5 + idx * 0.8) * 3;
                    child.position.z = Math.sin(time * 1.2 + idx * 0.6) * 2;
                }
            });

            h.mesh.rotation.y = h.pathAngle + Math.PI / 2;

            // Damage
            if (h.active) {
                h.cooldown -= dt;
                for (const player of players) {
                    const dist = player.getPosition().distanceTo(h.mesh.position);
                    if (dist < h.radius && h.cooldown <= 0) {
                        player.takeDamage(8, 'cannon');
                        const pushDir = new THREE.Vector3().subVectors(player.getPosition(), h.mesh.position).normalize();
                        player.mesh.position.add(pushDir.multiplyScalar(10));
                        player.speedBoost = 1;
                        showEvent('Leviathan strikes!');
                        h.cooldown = 3;
                    }
                }
            }
        }

        if (h.type === 'whirlpool') {
            // Spin rings
            h.mesh.children.forEach(child => {
                if (child.name && child.name.startsWith('ring_')) {
                    const idx = parseInt(child.name.split('_')[1]);
                    child.rotation.z = time * (1 + idx * 0.3);
                }
                if (child.name && child.name.startsWith('foam_')) {
                    const idx = parseInt(child.name.split('_')[1]);
                    const angle = time * 1.5 + (idx / 20) * Math.PI * 2;
                    const radius = 5 + (idx % 5) * 3;
                    child.position.x = Math.cos(angle) * radius;
                    child.position.z = Math.sin(angle) * radius;
                }
            });

            // Pull ships
            for (const player of players) {
                const dx = h.x - player.getPosition().x;
                const dz = h.z - player.getPosition().z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist < h.radius && dist > 3) {
                    const pull = h.pullStrength / dist;
                    player.mesh.position.x += (dx / dist) * pull * dt;
                    player.mesh.position.z += (dz / dist) * pull * dt;
                    player.mesh.rotation.y += dt * 0.5;

                    if (dist < 8) {
                        player.takeDamage(15 * dt, 'cannon');
                    }
                }
            }
        }
    }
}

// ---- MAP OBJECTS ----
function createIsland(x, z, size) {
    const island = new THREE.Group();

    // Sandy base
    const baseGeo = new THREE.ConeGeometry(size, size * 0.4, 8);
    const baseMat = new THREE.MeshPhongMaterial({ color: 0xd4b87a });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = -size * 0.1;
    base.castShadow = true;
    island.add(base);

    // Green top
    const topGeo = new THREE.SphereGeometry(size * 0.7, 8, 6);
    const topMat = new THREE.MeshPhongMaterial({ color: 0x2d6b2d });
    const top = new THREE.Mesh(topGeo, topMat);
    top.position.y = size * 0.15;
    top.scale.y = 0.3;
    top.castShadow = true;
    island.add(top);

    // Palm trees
    for (let i = 0; i < 3; i++) {
        const px = (Math.random() - 0.5) * size;
        const pz = (Math.random() - 0.5) * size;
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.3, 0.5, size * 0.5, 6),
            new THREE.MeshPhongMaterial({ color: 0x6B4226 })
        );
        trunk.position.set(px, size * 0.3, pz);
        trunk.rotation.z = (Math.random() - 0.5) * 0.3;
        island.add(trunk);

        // Leaves
        for (let j = 0; j < 5; j++) {
            const leafGeo = new THREE.PlaneGeometry(size * 0.3, size * 0.08);
            const leafMat = new THREE.MeshPhongMaterial({ color: 0x228B22, side: THREE.DoubleSide });
            const leaf = new THREE.Mesh(leafGeo, leafMat);
            leaf.position.set(px, size * 0.55, pz);
            leaf.rotation.y = (j / 5) * Math.PI * 2;
            leaf.rotation.x = 0.5;
            island.add(leaf);
        }
    }

    island.position.set(x, 0, z);
    scene.add(island);
    return island;
}

function createDock(x, z, rotation) {
    const dock = new THREE.Group();

    // Main pier
    const pierGeo = new THREE.BoxGeometry(30, 1, 6);
    const pierMat = new THREE.MeshPhongMaterial({ color: 0x6B4226 });
    const pier = new THREE.Mesh(pierGeo, pierMat);
    pier.position.y = 2;
    pier.castShadow = true;
    dock.add(pier);

    // Posts
    for (let i = -12; i <= 12; i += 4) {
        for (let side = -1; side <= 1; side += 2) {
            const postGeo = new THREE.CylinderGeometry(0.3, 0.4, 5, 6);
            const post = new THREE.Mesh(postGeo, pierMat);
            post.position.set(i, 0, side * 2.5);
            dock.add(post);
        }
    }

    // Bollards
    for (let i = -10; i <= 10; i += 10) {
        const bollard = new THREE.Mesh(
            new THREE.CylinderGeometry(0.4, 0.5, 1.5, 8),
            new THREE.MeshPhongMaterial({ color: 0x333333 })
        );
        bollard.position.set(i, 3, 0);
        dock.add(bollard);
    }

    dock.position.set(x, 0, z);
    dock.rotation.y = rotation || 0;
    scene.add(dock);
    return dock;
}

function createFort(x, z) {
    const fort = new THREE.Group();

    // Stone base
    const baseGeo = new THREE.BoxGeometry(20, 8, 20);
    const baseMat = new THREE.MeshPhongMaterial({ color: 0x888877 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 4;
    base.castShadow = true;
    fort.add(base);

    // Towers
    for (let cx = -1; cx <= 1; cx += 2) {
        for (let cz = -1; cz <= 1; cz += 2) {
            const tower = new THREE.Mesh(
                new THREE.CylinderGeometry(3, 3.5, 14, 8),
                new THREE.MeshPhongMaterial({ color: 0x777766 })
            );
            tower.position.set(cx * 10, 7, cz * 10);
            tower.castShadow = true;
            fort.add(tower);

            // Battlements
            for (let b = 0; b < 8; b++) {
                const bAngle = (b / 8) * Math.PI * 2;
                const battlement = new THREE.Mesh(
                    new THREE.BoxGeometry(1.5, 2, 1),
                    baseMat
                );
                battlement.position.set(
                    cx * 10 + Math.cos(bAngle) * 3.5,
                    14.5,
                    cz * 10 + Math.sin(bAngle) * 3.5
                );
                fort.add(battlement);
            }
        }
    }

    // Flag
    const flagPole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 8, 4),
        new THREE.MeshPhongMaterial({ color: 0x444444 })
    );
    flagPole.position.set(0, 12, 0);
    fort.add(flagPole);

    const fortFlag = new THREE.Mesh(
        new THREE.PlaneGeometry(4, 2.5),
        new THREE.MeshBasicMaterial({ color: 0xcc0000, side: THREE.DoubleSide })
    );
    fortFlag.position.set(2, 15, 0);
    fort.add(fortFlag);

    fort.position.set(x, 0, z);
    scene.add(fort);
    return fort;
}

function createBarrels(x, z, count) {
    const group = new THREE.Group();
    for (let i = 0; i < count; i++) {
        const barrel = new THREE.Group();
        const bodyGeo = new THREE.CylinderGeometry(1, 1, 2.5, 12);
        const bodyMat = new THREE.MeshPhongMaterial({ color: 0x6B4226 });
        barrel.add(new THREE.Mesh(bodyGeo, bodyMat));

        // Metal bands
        for (let b = -0.8; b <= 0.8; b += 0.8) {
            const band = new THREE.Mesh(
                new THREE.TorusGeometry(1.01, 0.05, 4, 12),
                new THREE.MeshPhongMaterial({ color: 0x444444 })
            );
            band.position.y = b;
            barrel.add(band);
        }

        barrel.position.set(
            (Math.random() - 0.5) * 5,
            1.5 + Math.sin(clock ? clock.getElapsedTime() + i : i) * 0.5,
            (Math.random() - 0.5) * 5
        );
        barrel.rotation.x = (Math.random() - 0.5) * 0.3;
        group.add(barrel);
    }
    group.position.set(x, 0, z);
    scene.add(group);
    return group;
}

// ---- MAP SETUP ----
function setupMap(mapName) {
    // Clear old map objects
    mapObjects.forEach(obj => scene.remove(obj));
    mapObjects = [];
    hazards.forEach(h => scene.remove(h.mesh));
    hazards = [];

    if (mapName === 'open_sea') {
        // Islands scattered
        mapObjects.push(createIsland(80, 80, 15));
        mapObjects.push(createIsland(-90, 60, 10));
        mapObjects.push(createIsland(50, -100, 20));
        mapObjects.push(createIsland(-70, -80, 12));
        mapObjects.push(createIsland(0, 120, 8));

        // Floating barrels
        mapObjects.push(createBarrels(30, 30, 4));
        mapObjects.push(createBarrels(-40, -50, 3));

        // Hazards
        hazards.push(createKraken(60, -40));
        hazards.push(createLeviathan(-50, 50));
        hazards.push(createWhirlpool(-30, -30));
        hazards.push(createWhirlpool(70, 60));

        // Adjust sky for open sea
        if (sky) {
            sky.material.uniforms.topColor.value.setHex(0x0055aa);
            sky.material.uniforms.bottomColor.value.setHex(0xff7733);
        }

    } else if (mapName === 'port_battle') {
        // Fort
        mapObjects.push(createFort(0, -120));

        // Docks
        mapObjects.push(createDock(-60, -80, 0));
        mapObjects.push(createDock(60, -80, 0));
        mapObjects.push(createDock(-80, 0, Math.PI / 2));
        mapObjects.push(createDock(80, 0, Math.PI / 2));

        // Port islands (land masses)
        mapObjects.push(createIsland(-100, -100, 25));
        mapObjects.push(createIsland(100, -100, 25));
        mapObjects.push(createIsland(0, -140, 30));

        // Harbor barrels & crates
        mapObjects.push(createBarrels(-50, -60, 5));
        mapObjects.push(createBarrels(50, -60, 5));

        // Hazards (whirlpool in harbor mouth, kraken outside)
        hazards.push(createWhirlpool(0, 40));
        hazards.push(createKraken(0, 150));
        hazards.push(createLeviathan(100, 100));

        // Darker, stormier sky for port
        if (sky) {
            sky.material.uniforms.topColor.value.setHex(0x334455);
            sky.material.uniforms.bottomColor.value.setHex(0x664433);
        }
        if (scene.fog) scene.fog.density = 0.002;
    }
}

// ---- GAME STATE ----
function startGame() {
    document.getElementById('menu-screen').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    document.getElementById('game-over').style.display = 'none';

    // Clean up old game
    players.forEach(p => scene.remove(p.mesh));
    projectiles.forEach(p => scene.remove(p.mesh));
    particles.forEach(p => scene.remove(p.mesh));
    players = [];
    projectiles = [];
    particles = [];

    // Create players
    const p1 = new Player(0, 0xcc2222, 0xff4444, -50, 0, Math.PI / 2);
    const p2 = new Player(1, 0x2244cc, 0x4488ff, 50, 0, -Math.PI / 2);
    players = [p1, p2];

    setupMap(selectedMap);
    gameState = 'playing';

    showCenterMessage('BATTLE!', 2);
}

// ---- UI UPDATES ----
function updateHUD() {
    if (players.length < 2) return;
    const p1 = players[0], p2 = players[1];

    document.getElementById('p1-ship-hp').style.width = p1.shipHP + '%';
    document.getElementById('p1-crew-hp').style.width = p1.crewHP + '%';
    document.getElementById('p1-coins').textContent = p1.coins;

    document.getElementById('p2-ship-hp').style.width = p2.shipHP + '%';
    document.getElementById('p2-crew-hp').style.width = p2.crewHP + '%';
    document.getElementById('p2-coins').textContent = p2.coins;

    // Color HP bars
    document.getElementById('p1-ship-hp').style.background =
        `linear-gradient(90deg, ${p1.shipHP < 30 ? '#ff2222' : '#44aa44'}, ${p1.shipHP < 60 ? '#ffaa00' : '#44ff44'})`;
    document.getElementById('p2-ship-hp').style.background =
        `linear-gradient(90deg, ${p2.shipHP < 30 ? '#ff2222' : '#44aa44'}, ${p2.shipHP < 60 ? '#ffaa00' : '#44ff44'})`;
}

function showCenterMessage(text, duration) {
    const el = document.getElementById('center-message');
    el.textContent = text;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, duration * 1000);
}

function showEvent(text) {
    const el = document.getElementById('event-log');
    const msg = document.createElement('div');
    msg.className = 'event-msg';
    msg.textContent = text;
    el.appendChild(msg);
    setTimeout(() => { if (msg.parentNode) msg.parentNode.removeChild(msg); }, 3000);
}

// ---- INPUT MAPPING ----
function getPlayerInput(playerId) {
    if (playerId === 0) {
        return {
            forward: keys['w'],
            backward: keys['s'],
            left: keys['a'],
            right: keys['d'],
            cannon: keys['f'],
            flintlock: keys['g'],
            board: keys['r'],
            musket: keys['t']
        };
    } else {
        return {
            forward: keys['arrowup'],
            backward: keys['arrowdown'],
            left: keys['arrowleft'],
            right: keys['arrowright'],
            cannon: keys['/'],
            flintlock: keys['.'],
            board: keys[';'],
            musket: keys["'"]
        };
    }
}

// ---- CAMERA ----
function updateCamera() {
    if (players.length < 2) return;

    const p1 = players[0].getPosition();
    const p2 = players[1].getPosition();

    const center = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    const dist = p1.distanceTo(p2);
    const height = Math.max(50, dist * 0.6 + 30);
    const zoomOut = Math.max(80, dist * 0.5 + 40);

    camera.position.lerp(new THREE.Vector3(center.x, height, center.z + zoomOut), 0.03);
    camera.lookAt(center.x, 0, center.z);
}

// ---- COMPASS ----
function updateCompass() {
    if (players.length < 2) return;
    const dist = players[0].getPosition().distanceTo(players[1].getPosition()).toFixed(0);
    document.getElementById('compass').textContent = `Distance: ${dist}m | Map: ${selectedMap === 'open_sea' ? 'Open Sea' : 'Port Battle'}`;
}

// ---- CHECK WIN ----
function checkWinCondition() {
    for (let i = 0; i < players.length; i++) {
        if (players[i].shipHP <= 0 || players[i].crewHP <= 0) {
            const winner = i === 0 ? 1 : 0;
            endGame(winner);
            return;
        }
    }
}

function endGame(winnerIdx) {
    gameState = 'gameover';
    const winnerName = winnerIdx === 0 ? 'Player 1 - Red Corsair' : 'Player 2 - Blue Marauder';
    document.getElementById('winner-text').textContent = winnerName + ' Wins!';
    document.getElementById('final-scores').innerHTML =
        `P1 Coins: ${players[0].coins} | P2 Coins: ${players[1].coins}<br>` +
        `P1 Ship: ${Math.max(0,players[0].shipHP).toFixed(0)}% | P2 Ship: ${Math.max(0,players[1].shipHP).toFixed(0)}%`;
    document.getElementById('game-over').style.display = 'flex';
}

// ---- MAIN LOOP ----
function gameLoop() {
    requestAnimationFrame(gameLoop);

    const dt = Math.min(clock.getDelta(), 0.05);

    if (gameState === 'playing') {
        // Update players
        for (let i = 0; i < players.length; i++) {
            const input = getPlayerInput(i);
            players[i].update(dt, input);

            const other = players[1 - i];

            // Combat actions
            if (input.cannon) players[i].fireCannons(other);
            if (input.flintlock) players[i].fireFlintlock(other);
            if (input.musket) players[i].fireMusket(other);
            if (input.board) players[i].attemptBoard(other);
        }

        // Boarding state
        if (players[0].isBoarding || players[1].isBoarding) {
            const dist = players[0].getPosition().distanceTo(players[1].getPosition());
            if (dist > 35) {
                players[0].isBoarding = false;
                players[1].isBoarding = false;
                showEvent('Ships separated!');
            }
        }

        // Ship collision
        const shipDist = players[0].getPosition().distanceTo(players[1].getPosition());
        if (shipDist < 15) {
            const pushDir = new THREE.Vector3().subVectors(players[0].getPosition(), players[1].getPosition()).normalize();
            players[0].mesh.position.add(pushDir.clone().multiplyScalar(dt * 5));
            players[1].mesh.position.add(pushDir.clone().multiplyScalar(-dt * 5));
        }

        updateProjectiles(dt);
        updateParticles(dt);
        updateHazards(dt);
        updateCamera();
        updateHUD();
        updateCompass();
        checkWinCondition();
    }

    // Water animation
    if (water) {
        water.material.uniforms.time.value = clock.getElapsedTime();
    }

    renderer.render(scene, camera);
}

// ---- BOOT ----
function boot() {
    initThree();
    updateLoading(20);

    createSky();
    updateLoading(40);

    createLighting();
    updateLoading(60);

    createWater();
    updateLoading(80);

    updateLoading(100);

    setTimeout(() => {
        document.getElementById('loading-screen').style.opacity = '0';
        setTimeout(() => {
            document.getElementById('loading-screen').style.display = 'none';
            document.getElementById('menu-screen').style.display = 'flex';
            gameState = 'menu';
        }, 1000);
    }, 500);

    gameLoop();
}

boot();
