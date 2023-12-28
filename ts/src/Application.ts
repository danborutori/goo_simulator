import {BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Quaternion, Scene, Vector3, WebGLRenderer} from "three"

const v1 = new Vector3
const q1 = new Quaternion

function createScene(){
    const scene = new Scene

    const camera = new PerspectiveCamera
    camera.position.set(0,5,0)
    camera.lookAt(v1.set(0,0,0))

    const box = new Mesh(
        new BoxGeometry(1,1,1),
        new MeshBasicMaterial({
            color: 0xff0000
        })
    )

    scene.add(camera)
    scene.add(box)

    return {
        scene: scene,
        camera: camera,
        box: box
    }
}

export class Application {

    private scene: Scene
    private camera: PerspectiveCamera
    private box: Mesh
    private renderer!: WebGLRenderer

    constructor(){
        const s = createScene()
        this.scene = s.scene
        this.camera = s.camera
        this.box = s.box
    }

    init(mainCanvas: HTMLCanvasElement){

        // init canvas
        mainCanvas.width = window.innerWidth
        mainCanvas.height = window.innerHeight        

        this.renderer = new WebGLRenderer({
            canvas: mainCanvas
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

        this.box.quaternion.multiply( q1.setFromAxisAngle(v1.set(0,1,0), Math.PI*deltaTime))

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