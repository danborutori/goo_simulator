import {BufferGeometry, Mesh, Object3D, PCFSoftShadowMap, PerspectiveCamera, Vector3, WebGLRenderer} from "three"
import { GooSimulator } from "./GooSimulator.js"
import { FpsCounter } from "./FpsCounter.js"
import ReactDOM from "react-dom"
import React from "react"
import {GLTFLoader, BufferGeometryUtils, OrbitControls} from "three/examples/jsm/Addons"
import { MeshBVH } from "three-mesh-bvh"

async function createScene(){
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync( "./asset/stage.gltf" )
    const scene = gltf.scene
    const camera = scene.getObjectByName("Camera") as PerspectiveCamera

    scene.traverse(o=>{
        o.castShadow = true
        o.receiveShadow = true
    })

    return {
        scene: scene,
        camera: camera
    }
}

function buildBvhMesh( scene: Object3D){
    scene.updateMatrixWorld()
    const geometries: BufferGeometry[] = []

    scene.traverse( ((m: Mesh)=>{
        if( m.isMesh ){
            const g = m.geometry.clone()
            g.applyMatrix4(m.matrixWorld)
            geometries.push(g)
        }
    }) as (o:Object3D)=>void)

    const merged = BufferGeometryUtils.mergeGeometries(geometries)

    return new MeshBVH(merged)
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
        const bvh = buildBvhMesh(scene)
        this.gooSimulator = new GooSimulator(bvh,500)
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

        window.addEventListener("resize", ()=>{ this.onResize() })

        const control = new OrbitControls(this.camera, mainCanvas)
        control.enablePan = false
        control.enableZoom = false
        control.maxPolarAngle = Math.PI/2        


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