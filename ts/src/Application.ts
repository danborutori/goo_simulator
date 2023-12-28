import {DoubleSide, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Quaternion, Scene, Vector3, WebGLRenderer} from "three"
import { GooSimulator } from "./GooSimulator.js"

const v1 = new Vector3
const q1 = new Quaternion

function createScene(){
    const scene = new Scene

    const camera = new PerspectiveCamera
    camera.position.set(0,2,-2)
    camera.lookAt(v1.set(0,0,0))
    scene.add(camera)

    const plane = new Mesh(
        new PlaneGeometry(1,1),
        new MeshBasicMaterial({color:0xffffff})
    ).rotateX(-Math.PI/2)
    scene.add(plane)

    return {
        scene: scene,
        camera: camera
    }
}

export class Application {

    private scene: Scene
    private camera: PerspectiveCamera
    private renderer!: WebGLRenderer

    private gooSimulator: GooSimulator

    constructor(){
        const s = createScene()
        this.scene = s.scene
        this.camera = s.camera

        this.gooSimulator = new GooSimulator(256,1024)
        this.gooSimulator.instancedMesh.position.set(0,0.02,0)
        this.scene.add(this.gooSimulator.instancedMesh)
    }

    init(mainCanvas: HTMLCanvasElement){

        // init canvas
        mainCanvas.width = window.innerWidth
        mainCanvas.height = window.innerHeight        

        this.renderer = new WebGLRenderer({
            canvas: mainCanvas,
            antialias: true
        })
        this.renderer.setClearColor(0x0000ff)

        this.camera.aspect = mainCanvas.width/mainCanvas.height
        this.camera.updateProjectionMatrix()

        window.addEventListener("resize", ()=>{ this.onResize() })
    }

    start(){
        let currentTime = performance.now()
        let frameRequested = false

        setInterval(()=>{
            const newTime = performance.now()
            const deltaTime = (newTime-currentTime)/1000
            this.update( deltaTime )
            currentTime = newTime

            if( !frameRequested ){
                frameRequested = true
                requestAnimationFrame( ()=>{
                    frameRequested = false
                    this.render()
                })
            }
    
            }, 10)
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