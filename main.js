import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
let scene, camera, renderer, clock, playerGroup;
let controllerLeft, controllerRight;
let gun, flashlight, muzzleFlash;
let playerSkin;
let walls = [], particles = [], targets = [];

const loader = new GLTFLoader();

// --- ИНИЦИАЛИЗАЦИЯ ---
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x010101);
    scene.fog = new THREE.FogExp2(0x010101, 0.06);

    camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.01, 100);
    
    playerGroup = new THREE.Group();
    playerGroup.add(camera);
    scene.add(playerGroup);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    
    document.body.appendChild(renderer.domElement);
    document.getElementById('vr-button-container').appendChild(VRButton.createButton(renderer));

    clock = new THREE.Clock();

    setupLights();
    setupVRControllers();
    createEnvironment();
    loadRobloxAssets();

    renderer.setAnimationLoop(update);
}

// --- СВЕТ ---
function setupLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.01);
    scene.add(ambient);
}

// --- VR КОНТРОЛЛЕРЫ ---
function setupVRControllers() {
    // Правая рука (Оружие)
    controllerRight = renderer.xr.getController(1);
    controllerRight.addEventListener('selectstart', shoot);
    playerGroup.add(controllerRight);

    // Левая рука
    controllerLeft = renderer.xr.getController(0);
    playerGroup.add(controllerLeft);
}

// --- ЗАГРУЗКА МОДЕЛЕЙ ROBLOX ---
function loadRobloxAssets() {
    // 1. Загрузка пистолета
    loader.load('./models/gun.glb', (gltf) => {
        gun = gltf.scene;
        gun.scale.set(0.15, 0.15, 0.15);
        gun.rotation.y = Math.PI; 
        
        // Добавляем фонарь к пистолету
        flashlight = new THREE.SpotLight(0xffffff, 12, 25, Math.PI/6, 0.5, 1);
        flashlight.castShadow = true;
        flashlight.position.set(0, 0, 0);
        flashlight.target.position.set(0, 0, -1);
        
        muzzleFlash = new THREE.PointLight(0xffaa44, 0, 3);
        
        gun.add(flashlight, flashlight.target, muzzleFlash);
        controllerRight.add(gun);
    }, undefined, (e) => console.log("Ожидание gun.glb..."));

    // 2. Загрузка скина персонажа
    loader.load('./models/skin.glb', (gltf) => {
        playerSkin = gltf.scene;
        playerSkin.scale.set(0.9, 0.9, 0.9);
        scene.add(playerSkin);
        
        // Прячем голову игрока, чтобы она не мешала камере
        playerSkin.traverse(obj => {
            if(obj.name.toLowerCase().includes('head')) obj.visible = false;
        });
    });
}

// --- СТРЕЛЬБА И VFX ---
function shoot() {
    if(!gun) return;

    // Отдача
    gun.position.z = 0.05;
    muzzleFlash.intensity = 20;
    setTimeout(() => { muzzleFlash.intensity = 0; }, 40);

    const tempMatrix = new THREE.Matrix4();
    tempMatrix.extractRotation(controllerRight.matrixWorld);
    
    const raycaster = new THREE.Raycaster();
    raycaster.ray.origin.setFromMatrixPosition(controllerRight.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    const hits = raycaster.intersectObjects(scene.children, true);
    if(hits.length > 0) {
        spawnImpact(hits[0].point, hits[0].face.normal);
    }
}

function spawnImpact(pos, normal) {
    for(let i=0; i<15; i++) {
        const p = new THREE.Mesh(
            new THREE.BoxGeometry(0.01, 0.01, 0.01),
            new THREE.MeshBasicMaterial({ color: 0xffcc00 })
        );
        p.position.copy(pos);
        scene.add(p);
        particles.push({
            mesh: p,
            vel: new THREE.Vector3(
                (Math.random()-0.5)*0.1 + normal.x*0.1,
                Math.random()*0.1,
                (Math.random()-0.5)*0.1 + normal.z*0.1
            ),
            life: 1.0
        });
    }
}

// --- ХОДЬБА (ЛОГИКА СТИКА) ---
function handleMovement(delta) {
    const session = renderer.xr.getSession();
    if (!session) return;

    for (const source of session.inputSources) {
        if (source.gamepad && source.handedness === 'left') {
            const axes = source.gamepad.axes; // Стик
            
            const direction = new THREE.Vector3();
            camera.getWorldDirection(direction);
            direction.y = 0;
            direction.normalize();

            const side = new THREE.Vector3().crossVectors(THREE.Object3D.DefaultUp, direction).normalize();

            const forwardSpeed = -axes[3] * 2.5 * delta;
            const sideSpeed = -axes[2] * 2.0 * delta;

            playerGroup.position.addScaledVector(direction, forwardSpeed);
            playerGroup.position.addScaledVector(side, sideSpeed);
        }
    }
}

// --- ГЕНЕРАЦИЯ КАРТЫ ---
function createEnvironment() {
    // Пол
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 })
    );
    floor.rotation.x = -Math.PI/2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Стены (CQB Лабиринт)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    for(let i=0; i<30; i++) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.5), wallMat);
        wall.position.set(Math.random()*40-20, 2, Math.random()*40-20);
        wall.rotation.y = Math.random() > 0.5 ? 0 : Math.PI/2;
        wall.castShadow = true;
        wall.receiveShadow = true;
        scene.add(wall);
    }
}

// --- ЦИКЛ ОБНОВЛЕНИЯ ---
function update() {
    const delta = clock.getDelta();

    handleMovement(delta);

    // Анимация возврата оружия после отдачи
    if(gun) gun.position.z = THREE.MathUtils.lerp(gun.position.z, 0, 0.2);

    // Привязка скина к игроку
    if(playerSkin) {
        playerSkin.position.copy(playerGroup.position);
        playerSkin.position.y = 0;
        // Поворот скина за камерой (но плавно)
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        const angle = Math.atan2(camDir.x, camDir.z);
        playerSkin.rotation.y = angle;
    }

    // Обновление частиц
    for(let i=particles.length-1; i>=0; i--) {
        let p = particles[i];
        p.mesh.position.add(p.vel);
        p.life -= 0.02;
        if(p.life <= 0) {
            scene.remove(p.mesh);
            particles.splice(i, 1);
        }
    }

    renderer.render(scene, camera);
}

init();
