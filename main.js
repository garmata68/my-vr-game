import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
import { VRButton } from 'https://unpkg.com/three@0.128.0/examples/jsm/webxr/VRButton.js';
import { OBJLoader } from 'https://unpkg.com/three@0.128.0/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'https://unpkg.com/three@0.128.0/examples/jsm/loaders/MTLLoader.js';

let scene, camera, renderer, clock, playerGroup;
let controllerRight, controllerLeft;
let gunGroup, playerBody;
let walls = [], particles = [];

// Параметры движения (Стик на левом контроллере)
let moveSpeed = 2.5;

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020202);
    scene.fog = new THREE.FogExp2(0x020202, 0.08);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 100);
    
    playerGroup = new THREE.Group();
    playerGroup.add(camera);
    scene.add(playerGroup);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    document.body.appendChild(renderer.domElement);
    document.body.appendChild(VRButton.createButton(renderer));

    const light = new THREE.AmbientLight(0xffffff, 0.05);
    scene.add(light);

    setupControllers();
    buildWorld();
    
    // ЗАГРУЗКА ТВОЕЙ МОДЕЛИ РОБЛОКС
    loadRobloxAsset();

    clock = new THREE.Clock();
    renderer.setAnimationLoop(update);
}

function setupControllers() {
    // Правая рука (для оружия)
    controllerRight = renderer.xr.getController(1);
    controllerRight.addEventListener('selectstart', shoot);
    playerGroup.add(controllerRight);

    // Левая рука (ходьба)
    controllerLeft = renderer.xr.getController(0);
    playerGroup.add(controllerLeft);
}

function loadRobloxAsset() {
    const mtlLoader = new MTLLoader();
    // Путь к твоей папке на GitHub
    mtlLoader.setPath('./Handle1_diff/'); 
    
    mtlLoader.load('roblox.mtl', (materials) => {
        materials.preload();
        const objLoader = new OBJLoader();
        objLoader.setMaterials(materials);
        objLoader.setPath('./Handle1_diff/');
        
        objLoader.load('roblox.obj', (object) => {
            // Масштабируем, так как в Роблоксе всё гигантское
            object.scale.set(0.02, 0.02, 0.02);
            
            // Клонируем модель: одну для руки (пушка), одну для тела (скин)
            
            // 1. Оружие в правую руку
            gunGroup = object.clone();
            gunGroup.rotation.y = Math.PI; // Разворот стволом вперед
            controllerRight.add(gunGroup);
            
            // Добавляем реалистичный фонарь на твою пушку
            const flashlight = new THREE.SpotLight(0xffffff, 10, 20, Math.PI/6, 0.5);
            flashlight.castShadow = true;
            gunGroup.add(flashlight);
            gunGroup.add(flashlight.target);
            flashlight.target.position.set(0, 0, -1);

            // 2. Скин персонажа
            playerBody = object.clone();
            scene.add(playerBody);
            
            console.log("Твой Роблокс скин и пушка загружены!");
        });
    });
}

function buildWorld() {
    // Пол
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    floor.rotation.x = -Math.PI/2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Стены
    const wallGeo = new THREE.BoxGeometry(4, 4, 0.5);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    for(let i=0; i<20; i++) {
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.set(Math.random()*40-20, 2, Math.random()*40-20);
        wall.castShadow = true;
        wall.receiveShadow = true;
        scene.add(wall);
    }
}

function shoot() {
    // Вспышка
    const flash = new THREE.PointLight(0xffaa44, 20, 3);
    controllerRight.add(flash);
    setTimeout(() => controllerRight.remove(flash), 50);

    // Raycast стрельбы
    const tempMatrix = new THREE.Matrix4();
    tempMatrix.extractRotation(controllerRight.matrixWorld);
    const raycaster = new THREE.Raycaster();
    raycaster.ray.origin.setFromMatrixPosition(controllerRight.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    const hits = raycaster.intersectObjects(scene.children);
    if(hits.length > 0) {
        createImpact(hits[0].point);
    }
}

function createImpact(pos) {
    const geo = new THREE.SphereGeometry(0.02, 4, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    for(let i=0; i<5; i++) {
        const p = new THREE.Mesh(geo, mat);
        p.position.copy(pos);
        scene.add(p);
        particles.push({ mesh: p, life: 1.0, vel: new THREE.Vector3((Math.random()-0.5)*0.1, 0.1, (Math.random()-0.5)*0.1) });
    }
}

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

            // Вперед/назад (ось 3), Влево/вправо (ось 2)
            playerGroup.position.addScaledVector(direction, -axes[3] * moveSpeed * delta);
            playerGroup.position.addScaledVector(side, -axes[2] * moveSpeed * delta);
        }
    }
}

function update() {
    const delta = clock.getDelta();
    handleMovement(delta);

    // Скин следует за камерой
    if(playerBody) {
        playerBody.position.copy(playerGroup.position);
        playerBody.position.y = 0;
        
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        playerBody.rotation.y = Math.atan2(dir.x, dir.z);
    }

    // Частицы
    for(let i=particles.length-1; i>=0; i--) {
        particles[i].mesh.position.add(particles[i].vel);
        particles[i].life -= 0.05;
        if(particles[i].life <= 0) {
            scene.remove(particles[i].mesh);
            particles.splice(i, 1);
        }
    }

    renderer.render(scene, camera);
}

init();
