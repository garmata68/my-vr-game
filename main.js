import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

let scene, camera, renderer, controls, raycaster;
let playerSkin = null;
let clock = new THREE.Clock();
let heldItem = null;
const interactables = [];

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const moveState = { forward: false, backward: false, left: false, right: false };

init();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa0d8ef);
    scene.fog = new THREE.Fog(0xa0d8ef, 20, 100);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    scene.add(camera);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);
    document.body.appendChild(VRButton.createButton(renderer));

    controls = new PointerLockControls(camera, document.body);
    raycaster = new THREE.Raycaster();

    const inst = document.getElementById('instructions');
    inst.addEventListener('click', () => controls.lock());
    controls.addEventListener('lock', () => { inst.style.display = 'none'; document.getElementById('hud').style.display = 'block'; });
    controls.addEventListener('unlock', () => { inst.style.display = 'flex'; });

    setupLights();
    createMap();
    loadRobloxSkin();
    setupInput();
    
    // Привязка кнопок меню
    document.getElementById('spawn-box').onclick = () => spawnObject('box');
    document.getElementById('spawn-sphere').onclick = () => spawnObject('sphere');
    document.getElementById('spawn-cyl').onclick = () => spawnObject('cylinder');

    renderer.setAnimationLoop(animate);
}

function setupLights() {
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(20, 40, 20);
    sun.castShadow = true;
    scene.add(sun);
}

function createMap() {
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(1000, 1000),
        new THREE.MeshStandardMaterial({ color: 0x6ab04c })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
}

function loadRobloxSkin() {
    const mtlLoader = new MTLLoader();
    mtlLoader.load('skin.mtl', (materials) => {
        materials.preload();
        new OBJLoader().setMaterials(materials).load('skin.obj', (obj) => {
            playerSkin = obj;
            playerSkin.scale.set(0.045, 0.045, 0.045);
            playerSkin.position.set(0, -1.45, -0.2); // Настройка положения рук
            playerSkin.rotation.y = Math.PI;
            camera.add(playerSkin);
        });
    }, undefined, () => {
        new OBJLoader().load('skin.obj', (obj) => {
            playerSkin = obj;
            playerSkin.scale.set(0.045, 0.045, 0.045);
            playerSkin.position.set(0, -1.45, -0.2);
            camera.add(playerSkin);
        });
    });
}

function spawnObject(type) {
    let geo = type === 'box' ? new THREE.BoxGeometry(1,1,1) : new THREE.SphereGeometry(0.6);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff }));
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    mesh.position.addVectors(camera.position, dir.multiplyScalar(4));
    mesh.position.y = 0.5;
    mesh.castShadow = true;
    mesh.userData.interactable = true;
    scene.add(mesh);
    interactables.push(mesh);
}

function setupInput() {
    document.addEventListener('keydown', (e) => {
        if (e.code === 'KeyW') moveState.forward = true;
        if (e.code === 'KeyS') moveState.backward = true;
        if (e.code === 'KeyA') moveState.left = true;
        if (e.code === 'KeyD') moveState.right = true;
        if (e.code === 'KeyE') {
            if (heldItem) { scene.attach(heldItem); heldItem = null; }
            else {
                raycaster.setFromCamera({x:0, y:0}, camera);
                const hits = raycaster.intersectObjects(interactables);
                if (hits.length > 0 && hits[0].distance < 4) {
                    heldItem = hits[0].object;
                    camera.add(heldItem);
                    heldItem.position.set(0.6, -0.4, -1.2);
                }
            }
        }
        if (e.code === 'KeyQ') {
            const m = document.getElementById('sandbox-menu');
            m.style.display = m.style.display === 'block' ? 'none' : 'block';
            if (m.style.display === 'block') controls.unlock(); else controls.lock();
        }
    });
    document.addEventListener('keyup', (e) => {
        if (e.code === 'KeyW') moveState.forward = false;
        if (e.code === 'KeyS') moveState.backward = false;
        if (e.code === 'KeyA') moveState.left = false;
        if (e.code === 'KeyD') moveState.right = false;
    });
}

function animate() {
    const delta = clock.getDelta();
    if (controls.isLocked || renderer.xr.isPresenting) {
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;
        direction.z = Number(moveState.forward) - Number(moveState.backward);
        direction.x = Number(moveState.right) - Number(moveState.left);
        direction.normalize();
        if (moveState.forward || moveState.backward) velocity.z -= direction.z * 100 * delta;
        if (moveState.left || moveState.right) velocity.x -= direction.x * 100 * delta;
        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);
        
        if (playerSkin && direction.length() > 0) {
            playerSkin.position.y = -1.45 + Math.sin(performance.now()*0.008) * 0.02;
        }
    }
    renderer.render(scene, camera);
}
