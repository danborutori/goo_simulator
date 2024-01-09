var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { AmbientLight, PCFShadowMap, Quaternion, Vector3, WebGLRenderer } from "three";
import { GooSimulator } from "./GooSimulator.js";
import { FpsCounter } from "./FpsCounter.js";
import ReactDOM from "react-dom";
import React from "react";
import { GLTFLoader, OrbitControls } from "three/examples/jsm/Addons";
const v1 = new Vector3;
const q1 = new Quaternion;
function createScene() {
    return __awaiter(this, void 0, void 0, function* () {
        const loader = new GLTFLoader();
        const gltf = yield loader.loadAsync("./asset/stage.gltf");
        const scene = gltf.scene;
        const camera = scene.getObjectByName("Camera");
        const dragon = scene.getObjectByName("dragon");
        scene.traverse(o => {
            o.castShadow = true;
            o.receiveShadow = true;
            const lit = o;
            if (lit.isSpotLight) {
                lit.shadow.mapSize.setScalar(512);
                lit.shadow.camera.near = 3.65;
                lit.shadow.camera.far = 8.51;
                lit.shadow.camera.updateProjectionMatrix();
            }
        });
        scene.add(new AmbientLight(0x404040));
        return {
            scene: scene,
            camera: camera,
            bunny: dragon
        };
    });
}
export class Application {
    constructor(scene, camera, bunny) {
        this.scene = scene;
        this.camera = camera;
        this.bunny = bunny;
        this.bunnyRotDir = 0;
    }
    static create() {
        return __awaiter(this, void 0, void 0, function* () {
            const s = yield createScene();
            return new Application(s.scene, s.camera, s.bunny);
        });
    }
    init(mainCanvas) {
        mainCanvas.width = window.innerWidth;
        mainCanvas.height = window.innerHeight;
        this.renderer = new WebGLRenderer({
            canvas: mainCanvas,
            antialias: true
        });
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = PCFShadowMap;
        this.renderer.debug.checkShaderErrors = false;
        this.renderer.setClearColor(0x6A81B4);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.camera.aspect = mainCanvas.width / mainCanvas.height;
        this.camera.updateProjectionMatrix();
        const controls = new OrbitControls(this.camera, mainCanvas);
        controls.enablePan = false;
        controls.enableZoom = false;
        controls.maxPolarAngle = Math.PI / 2;
        controls.target.set(0, 1, 0);
        controls.update();
        const meshes = [];
        this.scene.traverse(((m) => {
            if (m.isMesh) {
                meshes.push(m);
            }
        }));
        this.gooSimulator = new GooSimulator(this.renderer, meshes, 4096);
        this.scene.add(this.gooSimulator);
        window.addEventListener("resize", () => { this.onResize(); });
        window.addEventListener("keydown", event => {
            switch (event.key) {
                case "ArrowRight":
                    this.bunnyRotDir = -1;
                    break;
                case "ArrowLeft":
                    this.bunnyRotDir = 1;
                    break;
            }
        });
        window.addEventListener("keyup", event => {
            switch (event.key) {
                case "ArrowRight":
                case "ArrowLeft":
                    this.bunnyRotDir = 0;
                    break;
            }
        });
    }
    start(hudRoot) {
        let currentTime = performance.now();
        let frameRequested = false;
        let frameDrawn = 0;
        const fpsCounter = ReactDOM.render(React.createElement(FpsCounter, null), hudRoot);
        setInterval(() => {
            if (!frameRequested) {
                const newTime = performance.now();
                const deltaTime = Math.min(1 / 30, (newTime - currentTime) / 1000);
                this.update(deltaTime);
                currentTime = newTime;
                frameRequested = true;
                requestAnimationFrame(() => {
                    frameRequested = false;
                    this.render();
                    frameDrawn++;
                });
            }
        }, 10);
        setInterval(() => {
            fpsCounter.currentFps = frameDrawn;
            frameDrawn = 0;
        }, 1000);
    }
    update(deltaTime) {
        this.bunny.quaternion.multiply(q1.setFromAxisAngle(v1.set(0, 1, 0), Math.PI * deltaTime * this.bunnyRotDir));
        this.gooSimulator.update(deltaTime, this.renderer);
    }
    render() {
        this.renderer.render(this.scene, this.camera);
    }
    onResize() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.camera.aspect = this.renderer.domElement.width / this.renderer.domElement.height;
        this.camera.updateProjectionMatrix();
    }
}
