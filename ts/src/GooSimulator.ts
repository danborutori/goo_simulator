import { BufferAttribute, BufferGeometry, ClampToEdgeWrapping, Color, FloatType, Group, IUniform, InstancedBufferAttribute, InstancedMesh, LineBasicMaterial, LineSegments, MathUtils, Matrix4, Mesh, NearestFilter, OrthographicCamera, PlaneGeometry, RGBADepthPacking, RGBAFormat, RedFormat, SphereGeometry, Texture, Vector2, Vector3, WebGLMultipleRenderTargets, WebGLRenderTarget, WebGLRenderer } from "three";
import { MeshBVH, MeshBVHUniformStruct } from "three-mesh-bvh";
import { SDFGenerator } from "./SDFGenerator.js";
import { MarchingDepthMaterial, MarchingMaterial } from "./MarchingMaterial.js";
import { InitPositionMaterial } from "./material/InitPositionMaterial.js";
import { FullScreenQuad } from "three/examples/jsm/Addons";
import { UpdateForceMaterial } from "./material/UpdateForceMaterial.js";
import { UpdateVelocityMaterial } from "./material/UpdateVelocityMaterial.js";
import { UpdatePositionMaterial } from "./material/UpdatePositionMaterial.js";
import { ParticleMaterial } from "./material/ParticleMaterial.js";
import { BvhCollisionMaterial } from "./material/BvhCollisionMaterial.js";
import { UpdateGridMaterial } from "./material/UpdateGridMaterial.js";
import { ParticleToParticleCollisionMaterial } from "./material/ParticleToParticleCollisionMaterial.js";
import { UpdateLinkMaterial } from "./material/UpdateLinkMaterial.js";
import { ApplyLinkForceMaterial } from "./material/ApplyLinkForceMaterial.js";
import { UpdateSurfaceLinkMaterial } from "./material/UpdateSurfaceLinkMaterial.js";

const v2_1 = new Vector2

const _v1 = new Vector3
const _c1 = new Color

const particleMass = 0.1
const gravity = new Vector3(0,-9.8,0)

const stiffness = 250
const linkStrength = 2
const stickyness = 3
const dampingFactor = 0.99
const radius = 0.02
const formLinkDistance = radius*2
const breakLinkDistance = formLinkDistance*5
const fixedTimeStep = 1/60

const gridCellSize = radius*2

const sdfGenerator = new SDFGenerator

function createInstancedMesh(
    particleCount: number,
    positionTextureSize: number
){
    const g = new BufferGeometry()
    g.setAttribute("position", new BufferAttribute(new Float32Array([0,0,0]), 3))
    const instanceId = new InstancedBufferAttribute( new Float32Array(particleCount*3), 3)
    for( let i=0; i<particleCount; i++ ){

        v2_1.set(
            i%positionTextureSize,
            Math.floor(i/positionTextureSize)
        ).addScalar(0.5).divideScalar(positionTextureSize)

        instanceId.setXYZ(
            i,
            i,
            v2_1.x,
            v2_1.y
        )
    }
    g.setAttribute("instanceId", instanceId)
    const m = new InstancedMesh(g,undefined,particleCount)
    ;(m as any).isMesh = false
    ;(m as any).isPoints = true
    m.frustumCulled = false
    return m
}

function createLinkMesh(
    particleCount: number,
    particleRendertargetWidth: number,
    tPosition: IUniform,
    tLink: IUniform
){
    const g = new BufferGeometry()

    const position = new BufferAttribute( new Float32Array(particleCount*3*8), 3)
    const uv = new BufferAttribute( new Float32Array(particleCount*2*8), 2)
    const linkIndex = new BufferAttribute( new Int32Array(particleCount*8), 1)

    for( let i=0; i<particleCount; i++ ){
        v2_1.set(
            i%particleRendertargetWidth,
            Math.floor(i/particleRendertargetWidth)
        ).addScalar(0.5).divideScalar(particleRendertargetWidth)
        for( let j=0; j<8; j++ )
            uv.setXY(i*8+j,v2_1.x,v2_1.y)
        linkIndex.setX(i*8,-1)
        linkIndex.setX(i*8+1,0)
        linkIndex.setX(i*8+2,-1)
        linkIndex.setX(i*8+3,1)
        linkIndex.setX(i*8+4,-1)
        linkIndex.setX(i*8+5,2)
        linkIndex.setX(i*8+6,-1)
        linkIndex.setX(i*8+7,3)
    }

    g.setAttribute("position", position)
    g.setAttribute("uv", uv)
    g.setAttribute("linkIndex", linkIndex)

    const material = new LineBasicMaterial({
        color: 0x00ff00
    })

    material.onBeforeCompile = shader=>{
        shader.uniforms.tPosition = tPosition
        shader.uniforms.tLink = tLink

        shader.vertexShader = `
        uniform sampler2D tPosition;
        uniform sampler2D tLink;

        attribute int linkIndex;
        `+shader.vertexShader.replace(
            "void main() {",
            `
            void main() {
                vec2 pointUv = uv;

                if( linkIndex>=0 ){
                    float id = texture2D( tLink, uv )[linkIndex];
                    if( id>=0.0 ){
                        vec2 tPositionSize = vec2(textureSize( tPosition, 0 ));
                        pointUv = (vec2(
                            mod( id, tPositionSize.x ),
                            floor( id/tPositionSize.x )
                        )+0.5)/tPositionSize;
                    }
                }

                vec3 position = texture2D( tPosition, pointUv ).xyz;
            `
        )
    }

    const mesh = new LineSegments(g, material)

    return mesh
}

function createSurfaceLinkMesh(
    particleCount: number,
    particleRendertargetWidth: number,
    tPosition: IUniform,
    tSurfaceLink: IUniform,
    collders: Mesh[]
){
    const g = new BufferGeometry()

    const position = new BufferAttribute( new Float32Array(particleCount*3*8), 3)
    const uv = new BufferAttribute( new Float32Array(particleCount*2*8), 2)
    const linkIndex = new BufferAttribute( new Int32Array(particleCount*8), 1)

    for( let i=0; i<particleCount; i++ ){
        v2_1.set(
            i%particleRendertargetWidth,
            Math.floor(i/particleRendertargetWidth)
        ).addScalar(0.5).divideScalar(particleRendertargetWidth)
        for( let j=0; j<8; j++ )
            uv.setXY(i*8+j,v2_1.x,v2_1.y)
        linkIndex.setX(i*8,-1)
        linkIndex.setX(i*8+1,0)
        linkIndex.setX(i*8+2,-1)
        linkIndex.setX(i*8+3,1)
        linkIndex.setX(i*8+4,-1)
        linkIndex.setX(i*8+5,2)
        linkIndex.setX(i*8+6,-1)
        linkIndex.setX(i*8+7,3)
    }

    g.setAttribute("position", position)
    g.setAttribute("uv", uv)
    g.setAttribute("linkIndex", linkIndex)

    const material = new LineBasicMaterial({
        color: 0xffff00
    })

    const defines = material.defines || (material.defines = {})
    defines.NUM_BVH = collders.length

    material.onBeforeCompile = shader=>{
        shader.uniforms.tPosition = tPosition
        shader.uniforms.tSurfaceLink = tSurfaceLink
        shader.uniforms.bvhMatrix = { value: collders.map(m=>m.matrixWorld) }

        shader.vertexShader = `
        uniform sampler2D tPosition;
        uniform sampler2D tSurfaceLink[4];
        uniform mat4 bvhMatrix[NUM_BVH];

        attribute int linkIndex;
        `+shader.vertexShader.replace(
            "void main() {",
            `
            void main() {
                vec3 position = texture2D( tPosition, uv ).xyz;                
                if( linkIndex>=0 ){
                    vec4 surfaceLinks[4] = vec4[4](
                        texture2D( tSurfaceLink[ 0 ], uv ),
                        texture2D( tSurfaceLink[ 1 ], uv ),
                        texture2D( tSurfaceLink[ 2 ], uv ),
                        texture2D( tSurfaceLink[ 3 ], uv )
                    );
                    vec4 surfaceLink = surfaceLinks[ linkIndex ];
                    int id = int( surfaceLink.w );
                    if( id>=0 ){
                        position = (bvhMatrix[id]*vec4(surfaceLink.xyz,1)).xyz;
                    }
                }

            `
        )
    }

    const mesh = new LineSegments(g, material)

    return mesh
}

const fsquad = new FullScreenQuad()
const initPositionMaterial = new InitPositionMaterial()
const updateForceMaterial = new UpdateForceMaterial()
const updateVelocityMaterial = new UpdateVelocityMaterial()
const updatePositionMaterial = new UpdatePositionMaterial()
const updateGridMaterial = new UpdateGridMaterial()
const particleToParticleCollisionMaterial = new ParticleToParticleCollisionMaterial()
const updateLinkMaterial = new UpdateLinkMaterial()
const dummyCamera = new OrthographicCamera()

export class GooSimulator extends Group {

    private particleRendertargets: {
        position: WebGLRenderTarget
        velocity: WebGLRenderTarget
        force: WebGLRenderTarget
        read: {
            link: WebGLRenderTarget
            surfaceLink: WebGLMultipleRenderTargets
        },
        write: {
            link: WebGLRenderTarget
            surfaceLink: WebGLMultipleRenderTargets
        }
    }
    private particleInstancedMesh: InstancedMesh
    private gridRenderTarget: WebGLRenderTarget

    private marchingMesh: Mesh
    private deltaTime = 0
    private colliders: {
        mesh: Mesh
        bvh: MeshBVH
        bvhUniform: MeshBVHUniformStruct
    }[]

    private sdfRendertarget: WebGLRenderTarget
    private uniforms = {
        tLink: { value: null } as IUniform<Texture | null>,
        tSurfaceLink: { value: null } as IUniform<Texture[] | null>
    }
    private bvhCollisionMaterial: BvhCollisionMaterial
    private applyLinkForceMaterial: ApplyLinkForceMaterial
    private updateSurfaceLinkMaterial: UpdateSurfaceLinkMaterial

    constructor(
        renderer: WebGLRenderer,
        colliders: Mesh[],
        readonly particleCount: number,
        readonly gridSize: number = 256
    ){
        super()

        this.bvhCollisionMaterial = new BvhCollisionMaterial(colliders.length)
        this.applyLinkForceMaterial = new ApplyLinkForceMaterial(colliders.length)
        this.updateSurfaceLinkMaterial = new UpdateSurfaceLinkMaterial(colliders.length)

        const particleRendertargetWidth = MathUtils.ceilPowerOfTwo(Math.sqrt(particleCount))
        this.particleInstancedMesh = createInstancedMesh(particleCount,particleRendertargetWidth)
        this.particleRendertargets = {
            position: new WebGLRenderTarget(particleRendertargetWidth,particleRendertargetWidth,{
                format: RGBAFormat,
                type: FloatType,
                minFilter: NearestFilter,
                magFilter: NearestFilter,
                generateMipmaps: false,
                wrapS: ClampToEdgeWrapping,
                wrapT: ClampToEdgeWrapping
            }),
            velocity: new WebGLRenderTarget(particleRendertargetWidth,particleRendertargetWidth,{
                format: RGBAFormat,
                type: FloatType,
                minFilter: NearestFilter,
                magFilter: NearestFilter,
                generateMipmaps: false,
                wrapS: ClampToEdgeWrapping,
                wrapT: ClampToEdgeWrapping
            }),
            force: new WebGLRenderTarget(particleRendertargetWidth,particleRendertargetWidth,{
                format: RGBAFormat,
                type: FloatType,
                minFilter: NearestFilter,
                magFilter: NearestFilter,
                generateMipmaps: false,
                wrapS: ClampToEdgeWrapping,
                wrapT: ClampToEdgeWrapping
            }),
            read: {
                link: new WebGLRenderTarget(particleRendertargetWidth,particleRendertargetWidth,{
                    format: RGBAFormat,
                    type: FloatType,
                    minFilter: NearestFilter,
                    magFilter: NearestFilter,
                    generateMipmaps: false,
                    wrapS: ClampToEdgeWrapping,
                    wrapT: ClampToEdgeWrapping
                }),
                surfaceLink: new WebGLMultipleRenderTargets( particleRendertargetWidth, particleRendertargetWidth, 4, {
                    format: RGBAFormat,
                    type: FloatType,
                    minFilter: NearestFilter,
                    magFilter: NearestFilter,
                    generateMipmaps: false,
                    wrapS: ClampToEdgeWrapping,
                    wrapT: ClampToEdgeWrapping
                })
            },
            write: {
                link: new WebGLRenderTarget(particleRendertargetWidth,particleRendertargetWidth,{
                    format: RGBAFormat,
                    type: FloatType,
                    minFilter: NearestFilter,
                    magFilter: NearestFilter,
                    generateMipmaps: false,
                    wrapS: ClampToEdgeWrapping,
                    wrapT: ClampToEdgeWrapping
                }),
                surfaceLink: new WebGLMultipleRenderTargets( particleRendertargetWidth, particleRendertargetWidth, 4, {
                    format: RGBAFormat,
                    type: FloatType,
                    minFilter: NearestFilter,
                    magFilter: NearestFilter,
                    generateMipmaps: false,
                    wrapS: ClampToEdgeWrapping,
                    wrapT: ClampToEdgeWrapping
                })
            }
        }
        this.initParticle(renderer)
        const gridRenderTargetWidth = MathUtils.ceilPowerOfTwo(Math.sqrt(gridSize*gridSize*gridSize))
        this.gridRenderTarget = new WebGLRenderTarget(gridRenderTargetWidth,gridRenderTargetWidth,{
            format: RGBAFormat,
            type: FloatType,
            minFilter: NearestFilter,
            magFilter: NearestFilter,
            generateMipmaps: false,
            wrapS: ClampToEdgeWrapping,
            wrapT: ClampToEdgeWrapping
        })

        this.colliders = colliders.map( m=>{
            const bvh = new MeshBVH(m.geometry)
            const bvhUniform = new MeshBVHUniformStruct()
            bvhUniform.updateFrom(bvh)
            return {
                mesh: m,
                bvh: bvh,
                bvhUniform: bvhUniform
            }
        })

        const sdfRenderTargetWidth = MathUtils.ceilPowerOfTwo(Math.pow(gridSize,3/2))
        this.sdfRendertarget = new WebGLRenderTarget(sdfRenderTargetWidth,sdfRenderTargetWidth, {
            format: RedFormat,
            type: FloatType,
            minFilter: NearestFilter,
            magFilter: NearestFilter,
            generateMipmaps: false,
            wrapS: ClampToEdgeWrapping,
            wrapT: ClampToEdgeWrapping
        })

        const group = new Group()
        // group.visible = false
        this.add( group )

        const particleMaterial = new ParticleMaterial()
        particleMaterial.uniforms.tPosition.value = this.particleRendertargets.position.texture
        const instancedMesh = new InstancedMesh(
            new SphereGeometry(radius,8,4),
            particleMaterial,
            particleCount
        )
        instancedMesh.frustumCulled = false
        instancedMesh.castShadow = false
        instancedMesh.receiveShadow = true
        group.add(instancedMesh)

        const linksLine = createLinkMesh(
            particleCount,
            particleRendertargetWidth,
            {value: this.particleRendertargets.position.texture},
            this.uniforms.tLink
        )
        linksLine.frustumCulled = false
        linksLine.castShadow = false
        linksLine.receiveShadow = false
        group.add(linksLine)

        const surfaceLinkLine = createSurfaceLinkMesh(
            particleCount,
            particleRendertargetWidth,
            { value: this.particleRendertargets.position.texture },
            this.uniforms.tSurfaceLink,
            colliders
        )
        surfaceLinkLine.frustumCulled = false
        surfaceLinkLine.castShadow = true
        surfaceLinkLine.receiveShadow = false
        group.add(surfaceLinkLine)

        const marchingMaterial = new MarchingMaterial(this.sdfRendertarget.texture)
        marchingMaterial.uniforms.gridSize.value = gridSize
        marchingMaterial.uniforms.gridCellSize.value = gridCellSize
        const marchingDepthMaterial = new MarchingDepthMaterial(this.sdfRendertarget.texture)
        marchingDepthMaterial.depthPacking = RGBADepthPacking
        marchingDepthMaterial.uniforms.gridSize.value = gridSize
        marchingDepthMaterial.uniforms.gridCellSize.value = gridCellSize
        this.marchingMesh = new Mesh( new PlaneGeometry(2,2), marchingMaterial)        
        this.marchingMesh.customDepthMaterial = this.marchingMesh.customDistanceMaterial = marchingDepthMaterial
        this.marchingMesh.castShadow = true
        this.marchingMesh.receiveShadow = true
        this.marchingMesh.frustumCulled = false
        this.marchingMesh.onBeforeRender = renderer=>{
            renderer.getDrawingBufferSize(marchingMaterial.uniforms.resolution.value)
        }
        this.marchingMesh.onBeforeShadow = renderer=>{            
            marchingDepthMaterial.uniforms.resolution.value.setScalar(renderer.getRenderTarget()!.width)
        }
        this.add(this.marchingMesh)
    }

    private initParticle( renderer: WebGLRenderer ){

        const restore = {
            rendertarget: renderer.getRenderTarget(),
            activeCubeFace: renderer.getActiveCubeFace(),
            activeMipmapLevel: renderer.getActiveMipmapLevel()
        }

        initPositionMaterial.uniforms.radius.value = radius
        initPositionMaterial.uniforms.particleCount.value = this.particleCount
        initPositionMaterial.uniforms.rendertargetWidth.value = this.particleRendertargets.position.width
        fsquad.material = initPositionMaterial
        renderer.setRenderTarget( this.particleRendertargets.position )
        fsquad.render(renderer)

        renderer.setRenderTarget(restore.rendertarget,restore.activeCubeFace,restore.activeMipmapLevel)
    }

    update( deltaTime: number, renderer: WebGLRenderer ){

        this.deltaTime += deltaTime
        let simulationRun = false

        if(this.deltaTime>fixedTimeStep)
            this.recycleParticle()

        const restore = {
            rendertarget: renderer.getRenderTarget(),
            activeCubeFace: renderer.getActiveCubeFace(),
            activeMipmapLevel: renderer.getActiveMipmapLevel(),
            autoClear: renderer.autoClear,
            clearColor: renderer.getClearColor(_c1),
            clearAlpha: renderer.getClearAlpha()
        }

        while( this.deltaTime>fixedTimeStep ){
            this.simulate( fixedTimeStep, renderer )
            this.deltaTime -= fixedTimeStep
            simulationRun = true
        }

        renderer.setRenderTarget(restore.rendertarget,restore.activeCubeFace,restore.activeMipmapLevel)
        renderer.setClearColor(restore.clearColor,restore.clearAlpha)
        renderer.autoClear = restore.autoClear

        if( simulationRun ){            
            sdfGenerator.generate(
                renderer,
                this.sdfRendertarget,
                this.gridSize,
                gridCellSize,
                this.particleCount,
                this.particleRendertargets.position.texture,
                this.particleRendertargets.read.link.texture,
                this.particleRendertargets.read.surfaceLink.texture,
                radius
            )
        }
    }

    gridIndexFromPosition( v: Vector3 ){
        _v1.copy(v).divideScalar(gridCellSize).floor().addScalar(this.gridSize/2).clampScalar(0,this.gridSize-1)
        return _v1.x+_v1.y*this.gridSize+_v1.z*this.gridSize*this.gridSize
    }

    private simulate( deltaTime: number, renderer: WebGLRenderer ){

        // update force
        renderer.autoClear = true
        renderer.setClearColor(0,0)
        renderer.setRenderTarget( this.particleRendertargets.force )

        this.applyLinkForceMaterial.uniforms.tPosition.value = this.particleRendertargets.position.texture
        this.applyLinkForceMaterial.uniforms.tLink.value = this.particleRendertargets.read.link.texture
        this.applyLinkForceMaterial.uniforms.tLinks.value = this.particleRendertargets.read.surfaceLink.texture
        for( let i=0; i<this.colliders.length; i++ ) this.applyLinkForceMaterial.uniforms.bvhMatrix.value[i] = this.colliders[i].mesh.matrixWorld
        this.applyLinkForceMaterial.uniforms.formLinkDistance.value = formLinkDistance
        this.applyLinkForceMaterial.uniforms.linkStrength.value = linkStrength
        this.applyLinkForceMaterial.uniforms.stickyness.value = stickyness
        this.applyLinkForceMaterial.uniforms.radius.value = radius
        fsquad.material = this.applyLinkForceMaterial
        fsquad.render(renderer)

        renderer.autoClear = false

        particleToParticleCollisionMaterial.uniforms.tPosition.value = this.particleRendertargets.position.texture
        particleToParticleCollisionMaterial.uniforms.tGrid.value = this.gridRenderTarget.texture
        particleToParticleCollisionMaterial.uniforms.gridSize.value = this.gridSize
        particleToParticleCollisionMaterial.uniforms.gridCellSize.value = gridCellSize
        particleToParticleCollisionMaterial.uniforms.radius.value = radius
        fsquad.material = particleToParticleCollisionMaterial
        fsquad.render(renderer)

        this.bvhCollisionMaterial.uniforms.tPosition.value = this.particleRendertargets.position.texture
        this.bvhCollisionMaterial.uniforms.radius.value = radius
        this.bvhCollisionMaterial.uniforms.stiffness.value = stiffness        
        for( let i=0; i<this.colliders.length; i++ ){
            const collider = this.colliders[i]
            this.bvhCollisionMaterial.uniforms[`bvh${i}`].value = collider.bvhUniform
            this.bvhCollisionMaterial.uniforms.bvhMatrix.value[ i ] = collider.mesh.matrixWorld
        }
        fsquad.material = this.bvhCollisionMaterial
        fsquad.render(renderer)

        updateForceMaterial.uniforms.tVel.value = this.particleRendertargets.velocity.texture
        updateForceMaterial.uniforms.particleMass.value = particleMass
        updateForceMaterial.uniforms.gravity.value.copy( gravity )
        updateForceMaterial.uniforms.dampingFactor.value = dampingFactor        
        fsquad.material = updateForceMaterial
        fsquad.render(renderer)

        // update velocity
        renderer.autoClear = false

        updateVelocityMaterial.uniforms.deltaTime.value = deltaTime
        updateVelocityMaterial.uniforms.tForce.value = this.particleRendertargets.force.texture
        updateVelocityMaterial.uniforms.particleMass.value = particleMass
        fsquad.material = updateVelocityMaterial
        renderer.setRenderTarget( this.particleRendertargets.velocity )
        fsquad.render(renderer)

        // update position
        updatePositionMaterial.uniforms.deltaTime.value = deltaTime
        updatePositionMaterial.uniforms.tVel.value = this.particleRendertargets.velocity.texture
        fsquad.material = updatePositionMaterial
        renderer.setRenderTarget( this.particleRendertargets.position )
        fsquad.render(renderer)

        // update grid
        updateGridMaterial.uniforms.tPosition.value = this.particleRendertargets.position.texture
        updateGridMaterial.uniforms.gridSize.value = this.gridSize
        updateGridMaterial.uniforms.gridCellSize.value = gridCellSize
        updateGridMaterial.uniforms.gridTextureSize.value = this.gridRenderTarget.width
        this.particleInstancedMesh.material = updateGridMaterial
        renderer.autoClear = true
        renderer.setClearColor(0,0)
        renderer.setRenderTarget( this.gridRenderTarget )
        renderer.render( this.particleInstancedMesh, dummyCamera )

        // update link
        renderer.autoClear = true
        renderer.setClearColor(-1,-1)
        updateLinkMaterial.uniforms.tLink.value = this.particleRendertargets.read.link.texture
        updateLinkMaterial.uniforms.tPosition.value = this.particleRendertargets.position.texture
        updateLinkMaterial.uniforms.formLinkDistance.value = formLinkDistance
        updateLinkMaterial.uniforms.breakLinkDistance.value = breakLinkDistance
        updateLinkMaterial.uniforms.tGrid.value = this.gridRenderTarget.texture
        updateLinkMaterial.uniforms.gridSize.value = this.gridSize
        updateLinkMaterial.uniforms.gridCellSize.value = gridCellSize
        fsquad.material = updateLinkMaterial
        renderer.setRenderTarget( this.particleRendertargets.write.link )
        fsquad.render( renderer )

        this.updateSurfaceLinkMaterial.uniforms.tPosition.value = this.particleRendertargets.position.texture
        this.updateSurfaceLinkMaterial.uniforms.tLinks.value = this.particleRendertargets.read.surfaceLink.texture
        this.updateSurfaceLinkMaterial.uniforms.breakLinkDistance.value = breakLinkDistance
        this.updateSurfaceLinkMaterial.uniforms.radius.value = radius
        for( let i=0; i<this.colliders.length; i++ ){
            const collider = this.colliders[i]
            this.updateSurfaceLinkMaterial.uniforms.bvhMatrix.value[i] = collider.mesh.matrixWorld
            this.updateSurfaceLinkMaterial.uniforms[`bvh${i}`].value = collider.bvhUniform
        }
        fsquad.material = this.updateSurfaceLinkMaterial
        renderer.setRenderTarget(this.particleRendertargets.write.surfaceLink)
        fsquad.render(renderer)

        const tmp = this.particleRendertargets.write
        this.particleRendertargets.write = this.particleRendertargets.read
        this.particleRendertargets.read = tmp
        this.uniforms.tLink.value = this.particleRendertargets.read.link.texture
        this.uniforms.tSurfaceLink.value = this.particleRendertargets.read.surfaceLink.texture
        
    }

    private recycleParticle(){
        // let i = 0
        // for( let p of this.particles ){
        //     if(p.position.y<-2){
        //         p.position.set(Math.random(),0,Math.random()).subScalar(0.5).normalize().multiplyScalar(Math.random()*radius*32)
        //         p.position.y = 4+(i++)*radius
        //     }
        // }
    }
}