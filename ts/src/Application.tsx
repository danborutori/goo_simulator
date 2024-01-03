import {AmbientLight, Mesh, Object3D, PCFShadowMap, PerspectiveCamera, Quaternion, SpotLight, Vector3, WebGLRenderer} from "three"
import { GooSimulator } from "./GooSimulator.js"
import { FpsCounter } from "./FpsCounter.js"
import ReactDOM from "react-dom"
import React from "react"
import {GLTFLoader, OrbitControls} from "three/examples/jsm/Addons"

const v1 = new Vector3
const q1 = new Quaternion

async function createScene(){
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync( "./asset/stage.gltf" )
    const scene = gltf.scene
    const camera = scene.getObjectByName("Camera") as PerspectiveCamera
    const dragon = scene.getObjectByName("dragon")!

    scene.traverse(o=>{
        o.castShadow = true
        o.receiveShadow = true
        const lit = o as SpotLight
        if( lit.isSpotLight ){
            lit.shadow.mapSize.setScalar(1024)
            lit.shadow.camera.near = 3.65
            lit.shadow.camera.far = 8.51
            lit.shadow.camera.updateProjectionMatrix()
        }
    })

    scene.add(new AmbientLight(0x404040))

    return {
        scene: scene,
        camera: camera,
        bunny: dragon
    }
}

export class Application {

    private renderer!: WebGLRenderer


    private gooSimulator: GooSimulator
    private bunnyRotDir = 0

    static async create(){
        const s = await createScene()

        return new Application( s.scene, s.camera, s.bunny )
    }
    

    private constructor(
        private scene: Object3D,
        private camera: PerspectiveCamera,
        private bunny: Object3D
    ){
        const meshes: Mesh[] = []
        scene.traverse(((m: Mesh)=>{
            if( m.isMesh ){
                meshes.push(m)
            }
        }) as (o:Object3D)=>void)
        this.gooSimulator = new GooSimulator(meshes,4096)
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
        this.renderer.shadowMap.type = PCFShadowMap
        this.renderer.setClearColor(0x6A81B4)
        this.renderer.setPixelRatio(window.devicePixelRatio)

        this.camera.aspect = mainCanvas.width/mainCanvas.height
        this.camera.updateProjectionMatrix()

        const controls = new OrbitControls(this.camera, mainCanvas)
        controls.enablePan = false
        controls.enableZoom = false
        controls.maxPolarAngle = Math.PI/2
        controls.target.set(0,1,0)
        controls.update()

        window.addEventListener("resize", ()=>{ this.onResize() })
        window.addEventListener("keydown", event=>{
            switch(event.key){
            case "ArrowRight":
                this.bunnyRotDir = -1
                break
            case "ArrowLeft":
                this.bunnyRotDir = 1
                break
            }
        })
        window.addEventListener("keyup", event=>{
            switch(event.key){
            case "ArrowRight":
            case "ArrowLeft":
                this.bunnyRotDir = 0
                break
            }
        })

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

        this.bunny.quaternion.multiply(q1.setFromAxisAngle(v1.set(0,1,0), Math.PI*deltaTime*this.bunnyRotDir))
        this.gooSimulator.update(deltaTime,this.renderer)

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