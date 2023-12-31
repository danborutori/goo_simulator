import {AmbientLight, Mesh, Object3D, PCFSoftShadowMap, PerspectiveCamera, WebGLRenderer} from "three"
import { GooSimulator } from "./GooSimulator.js"
import { FpsCounter } from "./FpsCounter.js"
import ReactDOM from "react-dom"
import React from "react"
import {GLTFLoader, OrbitControls} from "three/examples/jsm/Addons"

async function createScene(){
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync( "./asset/stage.gltf" )
    const scene = gltf.scene
    const camera = scene.getObjectByName("Camera") as PerspectiveCamera

    scene.traverse(o=>{
        o.castShadow = true
        o.receiveShadow = true
    })

    scene.add(new AmbientLight(0x404040))

    return {
        scene: scene,
        camera: camera
    }
}

export class Application {

    private renderer!: WebGLRenderer

    private gooSimulator: GooSimulator

    static async create(){
        const s = await createScene()

        return new Application( s.scene, s.camera )
    }

    private constructor(
        private scene: Object3D,
        private camera: PerspectiveCamera
    ){
        this.gooSimulator = new GooSimulator([
            scene.getObjectByName("bunny") as Mesh,
            scene.getObjectByName("Plane") as Mesh,
        ],2000)
        this.scene.add(this.gooSimulator)
    }

    init(mainCanvas: HTMLCanvasElement){

        // init canvas
        mainCanvas.width = window.innerWidth
        mainCanvas.height = window.innerHeight        

        this.renderer = new WebGLRenderer({
            canvas: mainCanvas,            
            antialias: true
        })
        this.renderer.shadowMap.enabled = true
        this.renderer.shadowMap.type = PCFSoftShadowMap
        this.renderer.setClearColor(0x0000ff)

        this.camera.aspect = mainCanvas.width/mainCanvas.height
        this.camera.updateProjectionMatrix()

        const controls = new OrbitControls(this.camera, mainCanvas)
        controls.enablePan = false
        controls.enableZoom = false
        controls.maxPolarAngle = Math.PI/2
        controls.target.set(0,1,0)
        controls.update()

        window.addEventListener("resize", ()=>{ this.onResize() })

    }

    start(hudRoot: HTMLDivElement){
        let currentTime = performance.now()
        let frameRequested = false
        let frameDrawn = 0

        const fpsCounter = ReactDOM.render<{}, FpsCounter>(<FpsCounter/>, hudRoot)

        setInterval(()=>{
            if( !frameRequested ){
                const newTime = performance.now()
                const deltaTime = Math.min(1/30,(newTime-currentTime)/1000)
                this.update( deltaTime )
                currentTime = newTime

                frameRequested = true
                requestAnimationFrame( ()=>{
                    frameRequested = false
                    this.render()
                    frameDrawn++
                })
            }
    
        }, 10)

        setInterval(()=>{
            fpsCounter.currentFps = frameDrawn
            frameDrawn = 0
        }, 1000)
    }

    private update( deltaTime: number ){

        this.gooSimulator.update(deltaTime)

    }

    private render(){
        this.renderer.render( this.scene, this.camera )
    }

    private onResize(){
        this.renderer.setSize(
            window.innerWidth,
            window.innerHeight
        )

        this.camera.aspect = this.renderer.domElement.width/this.renderer.domElement.height
        this.camera.updateProjectionMatrix()
    }
}