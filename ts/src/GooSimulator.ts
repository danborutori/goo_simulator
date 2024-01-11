import { BufferAttribute, BufferGeometry, Camera, CapsuleGeometry, ClampToEdgeWrapping, Color, FloatType, Group, IUniform, InstancedBufferAttribute, InstancedMesh, MathUtils, Mesh, NearestFilter, OrthographicCamera, RGBAFormat, RedFormat, SphereGeometry, Texture, Vector2, Vector3, WebGLMultipleRenderTargets, WebGLRenderTarget, WebGLRenderer } from "three";
import { MeshBVH, MeshBVHUniformStruct } from "three-mesh-bvh";
import { SDFGenerator } from "./SDFGenerator.js";
import { InitMaterial } from "./material/InitMaterial.js";
import { FullScreenQuad } from "three/examples/jsm/Addons";
import { ParticleMaterial } from "./material/ParticleMaterial.js";
import { UpdateGridMaterial } from "./material/UpdateGridMaterial.js";
import { UpdateMaterial } from "./material/UpdateMaterial.js";
import { RecycleParticleMaterial } from "./material/RecycleParticleMaterial.js";
import { WetinessContext } from "./material/WetMaterial.js";
import { GooPlane } from "./GooPlane.js";
import { ViewNormalPositionMaterial } from "./material/ViewNormalPositionMaterial.js";

const v2_1 = new Vector2

const _c1 = new Color

const particleMass = 0.1
const gravity = new Vector3(0,-9.8,0)

const stiffness = 250
const linkStrength = 2
const stickyness = 3
const dampingFactor = 0.99
const radius = 0.02
const formLinkDistance = radius*2
const breakLinkDistance = formLinkDistance*8
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
    const g = new CapsuleGeometry(radius*0.25+radius,1)

    const instanceId = new InstancedBufferAttribute( new Float32Array(particleCount*2*4), 2)
    const linkIndex = new InstancedBufferAttribute( new Int32Array(particleCount*4), 1)

    for( let i=0; i<particleCount; i++ ){
        v2_1.set(
            i%particleRendertargetWidth,
            Math.floor(i/particleRendertargetWidth)
        ).addScalar(0.5).divideScalar(particleRendertargetWidth)
        for( let j=0; j<4; j++ )
            instanceId.setXY(i*4+j,v2_1.x,v2_1.y)
        linkIndex.setX(i*4,0)
        linkIndex.setX(i*4+1,1)
        linkIndex.setX(i*4+2,2)
        linkIndex.setX(i*4+3,3)
    }
    instanceId.needsUpdate = true
    linkIndex.needsUpdate = true

    g.setAttribute("instanceId", instanceId)
    g.setAttribute("linkIndex", linkIndex)

    const material = new ViewNormalPositionMaterial()

    const defines = material.defines || (material.defines = {} )
    defines.LINK_MESH_MATERIAL = "1"

    const onBeforeCompile = material.onBeforeCompile
    material.onBeforeCompile = (shader,renderer)=>{
        onBeforeCompile(shader,renderer)
        shader.uniforms.tPosition = tPosition
        shader.uniforms.tLink = tLink

        shader.vertexShader = `
        uniform sampler2D tPosition;
        uniform sampler2D tLink;

        attribute vec2 instanceId;
        attribute int linkIndex;

        mat4 rotateAndTransformToOffset(vec3 axisY, vec3 offset) {
            // Calculate the axis of rotation
            vec3 axisX = normalize( cross(vec3(0.0, 1.0, 0.0), axisY) );
            vec3 axisZ = cross( axisX, axisY );
            
            mat4 rotationMatrix = mat4(
                axisX, 0.0,
                axisY, 0.0,
                axisZ, 0.0,
                offset, 1.0
            );
            
            return rotationMatrix;
        }
        `+shader.vertexShader.replace(
            "void main() {",
            `
            void main() {
                vec3 _position = position;
                vec3 positionA = texture2D( tPosition, instanceId ).xyz;
                vec3 dir = vec3(0,1,0);
                {
                    vec3 positionB = positionA;

                    float id = texture2D( tLink, instanceId )[linkIndex];
                    if( id>=0.0 ){
                        vec2 tPositionSize = vec2(textureSize( tPosition, 0 ));
                        vec2 pointUv = (vec2(
                            mod( id, tPositionSize.x ),
                            floor( id/tPositionSize.x )
                        )+0.5)/tPositionSize;

                        positionB = texture2D( tPosition, pointUv ).xyz;;
                    }

                    vec3 v = positionB-positionA;
                    float len = length(v);

                    if( _position.y>0.0 ){
                        _position.y -= 0.5-len;
                    }else{
                        _position.y += 0.5;
                    }

                    if( len!=0.0 )
                        dir = normalize(v);
                }

                vec3 position = _position;
                mat4 instanceMatrix = rotateAndTransformToOffset(dir, positionA);
            `
        )
    }

    const mesh = new InstancedMesh(g, material, particleCount*4)

    return mesh
}

function createSurfaceLinkMesh(
    particleCount: number,
    particleRendertargetWidth: number,
    tPosition: IUniform,
    tSurfaceLink: IUniform,
    collders: Mesh[]
){
    const g = new CapsuleGeometry(radius*0.25+radius,1)

    const instanceId = new InstancedBufferAttribute( new Float32Array(particleCount*2*4), 2)
    const linkIndex = new InstancedBufferAttribute( new Int32Array(particleCount*4), 1)

    for( let i=0; i<particleCount; i++ ){
        v2_1.set(
            i%particleRendertargetWidth,
            Math.floor(i/particleRendertargetWidth)
        ).addScalar(0.5).divideScalar(particleRendertargetWidth)
        for( let j=0; j<4; j++ )
            instanceId.setXY(i*4+j,v2_1.x,v2_1.y)
        linkIndex.setX(i*4,0)
        linkIndex.setX(i*4+1,1)
        linkIndex.setX(i*4+2,2)
        linkIndex.setX(i*4+3,3)
    }
    instanceId.needsUpdate = true
    linkIndex.needsUpdate = true

    g.setAttribute("instanceId", instanceId)
    g.setAttribute("linkIndex", linkIndex)

    const material = new ViewNormalPositionMaterial()

    const defines = material.defines || (material.defines = {})
    defines.SUERFACE_LINK_MATERIAL = "1"
    defines.NUM_BVH = collders.length

    const onBeforeCompile = material.onBeforeCompile
    material.onBeforeCompile = (shader,renderer)=>{
        onBeforeCompile(shader,renderer)
        shader.uniforms.tPosition = tPosition
        shader.uniforms.tSurfaceLink = tSurfaceLink
        shader.uniforms.bvhMatrix = { value: collders.map(m=>m.matrixWorld) }

        shader.vertexShader = `
        uniform sampler2D tPosition;
        uniform sampler2D tSurfaceLink[4];
        uniform mat4 bvhMatrix[NUM_BVH];

        attribute vec2 instanceId;
        attribute int linkIndex;

        mat4 rotateAndTransformToOffset(vec3 axisY, vec3 offset) {
            // Calculate the axis of rotation
            vec3 axisX = normalize( cross(vec3(0.0, 1.0, 0.0), axisY) );
            vec3 axisZ = cross( axisX, axisY );
            
            mat4 rotationMatrix = mat4(
                axisX, 0.0,
                axisY, 0.0,
                axisZ, 0.0,
                offset, 1.0
            );
            
            return rotationMatrix;
        }
        `+shader.vertexShader.replace(
            "void main() {",
            `
            void main() {                
                vec3 _position = position;
                vec3 positionA = texture2D( tPosition, instanceId ).xyz;
                vec3 dir = vec3(0,1,0);
                {
                    vec3 positionB = positionA;

                    vec4 surfaceLinks[4] = vec4[4](
                        texture2D( tSurfaceLink[ 0 ], instanceId ),
                        texture2D( tSurfaceLink[ 1 ], instanceId ),
                        texture2D( tSurfaceLink[ 2 ], instanceId ),
                        texture2D( tSurfaceLink[ 3 ], instanceId )
                    );
                    vec4 surfaceLink = surfaceLinks[ linkIndex ];
                    int id = int( surfaceLink.w );
                    if( id>=0 ){
                        positionB = (bvhMatrix[id]*vec4(surfaceLink.xyz,1)).xyz;
                    }

                    vec3 v = positionB-positionA;
                    float len = length(v);

                    if( _position.y>0.0 ){
                        _position.y -= 0.5-len;
                    }else{
                        _position.y += 0.5;
                    }

                    if( len!=0.0 )
                        dir = normalize(v);
                }

                vec3 position = _position;
                mat4 instanceMatrix = rotateAndTransformToOffset(dir, positionA);
            `
        )
    }

    const mesh = new InstancedMesh(g, material, particleCount*4)

    return mesh
}

const fsquad = new FullScreenQuad()
const initMaterial = new InitMaterial()
const recycleParticleMaterial = new RecycleParticleMaterial()
const updateGridMaterial = new UpdateGridMaterial()
const dummyCamera = new OrthographicCamera()

export class GooSimulator extends Group {

    /*
        0: position
        1: velocity
        2: link
        3: surface link0
        4: surface link1
        5: surface link2
        6: surface link3
    */
    private particleRendertargets: {
        read: WebGLMultipleRenderTargets
        write: WebGLMultipleRenderTargets
    }
    private particleInstancedMesh: InstancedMesh
    private gridRenderTarget: WebGLRenderTarget

    private deltaTime = 0
    private colliders: {
        mesh: Mesh
        bvhUniform: MeshBVHUniformStruct
        wetinessCtx: WetinessContext
    }[]

    private sdfRendertarget: WebGLRenderTarget
    private uniforms = {
        tPosition: { value: null } as IUniform<Texture | null>,
        tLink: { value: null } as IUniform<Texture | null>,
        tSurfaceLink: { value: [] } as IUniform<Texture[] | null>
    }
    private updateMaterial: UpdateMaterial

    private gooPlane: GooPlane

    constructor(
        renderer: WebGLRenderer,
        colliders: Mesh[],
        readonly particleCount: number,
        readonly gridSize: number = 256
    ){
        super()

        this.updateMaterial = new UpdateMaterial(colliders.length)

        const particleRendertargetWidth = MathUtils.ceilPowerOfTwo(Math.sqrt(particleCount))
        this.particleInstancedMesh = createInstancedMesh(particleCount,particleRendertargetWidth)
        this.particleRendertargets = {
            read: new WebGLMultipleRenderTargets( particleRendertargetWidth, particleRendertargetWidth, 7, {
                    format: RGBAFormat,
                    type: FloatType,
                    minFilter: NearestFilter,
                    magFilter: NearestFilter,
                    generateMipmaps: false,
                    wrapS: ClampToEdgeWrapping,
                    wrapT: ClampToEdgeWrapping
                }),
            write: new WebGLMultipleRenderTargets( particleRendertargetWidth, particleRendertargetWidth, 7, {
                    format: RGBAFormat,
                    type: FloatType,
                    minFilter: NearestFilter,
                    magFilter: NearestFilter,
                    generateMipmaps: false,
                    wrapS: ClampToEdgeWrapping,
                    wrapT: ClampToEdgeWrapping
                })
        }
        this.swapRendertarget()
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

        this.colliders = colliders.map( m=>{
            const bvh = new MeshBVH(m.geometry)
            const bvhUniform = new MeshBVHUniformStruct()
            bvhUniform.updateFrom(bvh)
            return {
                mesh: m,
                bvhUniform: bvhUniform,
                wetinessCtx: new WetinessContext(m,this.sdfRendertarget.texture,gridSize,gridCellSize,m.matrixWorld)
            }
        })

        const group = new Group()
        // group.visible = false
        // this.add( group )

        const particleMaterial = new ParticleMaterial()
        particleMaterial.uniforms.tPosition = this.uniforms.tPosition
        const instancedMesh = new InstancedMesh(
            new SphereGeometry(radius*2,8,4),
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
            this.uniforms.tPosition,
            this.uniforms.tLink
        )
        linksLine.frustumCulled = false
        linksLine.castShadow = false
        linksLine.receiveShadow = false
        group.add(linksLine)

        const surfaceLinkLine = createSurfaceLinkMesh(
            particleCount,
            particleRendertargetWidth,
            this.uniforms.tPosition,
            this.uniforms.tSurfaceLink,
            colliders
        )
        surfaceLinkLine.frustumCulled = false
        surfaceLinkLine.castShadow = true
        surfaceLinkLine.receiveShadow = false
        group.add(surfaceLinkLine)

        const gooPlane = new GooPlane(group)
        gooPlane.frustumCulled = false
        gooPlane.castShadow = false
        gooPlane.receiveShadow = true
        this.add(gooPlane)
        this.gooPlane = gooPlane
    }

    private initParticle( renderer: WebGLRenderer ){

        const restore = {
            rendertarget: renderer.getRenderTarget(),
            activeCubeFace: renderer.getActiveCubeFace(),
            activeMipmapLevel: renderer.getActiveMipmapLevel()
        }

        initMaterial.uniforms.radius.value = radius
        initMaterial.uniforms.particleCount.value = this.particleCount
        initMaterial.uniforms.rendertargetWidth.value = this.particleRendertargets.read.width
        fsquad.material = initMaterial
        renderer.setRenderTarget( this.particleRendertargets.read )
        fsquad.render(renderer)

        renderer.setRenderTarget(restore.rendertarget,restore.activeCubeFace,restore.activeMipmapLevel)
    }

    update( deltaTime: number, renderer: WebGLRenderer, camera: Camera ){

        this.deltaTime += deltaTime
        let simulationRun = false

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
                this.uniforms.tPosition.value!,
                this.uniforms.tLink.value!,
                this.uniforms.tSurfaceLink.value!,
                this.colliders,
                radius
            )
            for( let collider of this.colliders ){
                collider.wetinessCtx.update( renderer )
            }
        }
        camera.updateMatrixWorld()
        this.gooPlane.update(renderer,camera)
    }

    private swapRendertarget(){
        const tmp = this.particleRendertargets.write
        this.particleRendertargets.write = this.particleRendertargets.read
        this.particleRendertargets.read = tmp
        this.uniforms.tPosition.value = this.particleRendertargets.read.texture[0]
        this.uniforms.tLink.value = this.particleRendertargets.read.texture[2]
        this.uniforms.tSurfaceLink.value = this.particleRendertargets.read.texture.slice(3,7)
    }

    private simulate( deltaTime: number, renderer: WebGLRenderer ){
        //recycle material
        recycleParticleMaterial.uniforms.tInput.value = this.particleRendertargets.read.texture
        recycleParticleMaterial.uniforms.radius.value = radius
        fsquad.material = recycleParticleMaterial
        renderer.setRenderTarget(this.particleRendertargets.write)
        fsquad.render(renderer)
        this.swapRendertarget()

        // update force
        this.updateMaterial.uniforms.deltaTime.value = deltaTime
        this.updateMaterial.uniforms.tInput.value = this.particleRendertargets.read.texture
        this.updateMaterial.uniforms.radius.value = radius
        this.updateMaterial.uniforms.formLinkDistance.value = formLinkDistance
        this.updateMaterial.uniforms.breakLinkDistance.value = breakLinkDistance
        this.updateMaterial.uniforms.linkStrength.value = linkStrength
        this.updateMaterial.uniforms.stickyness.value = stickyness
        this.updateMaterial.uniforms.stiffness.value = stiffness        
        this.updateMaterial.uniforms.particleMass.value = particleMass
        this.updateMaterial.uniforms.gravity.value.copy(gravity)
        this.updateMaterial.uniforms.dampingFactor.value = dampingFactor
        this.updateMaterial.uniforms.tGrid.value = this.gridRenderTarget.texture
        this.updateMaterial.uniforms.gridSize.value = this.gridSize
        this.updateMaterial.uniforms.gridCellSize.value = gridCellSize
        for( let i=0; i<this.colliders.length; i++ ){
            this.updateMaterial.uniforms[`bvh${i}`].value = this.colliders[i].bvhUniform
            this.updateMaterial.uniforms.bvhMatrix.value[i] = this.colliders[i].mesh.matrixWorld
        } 
        fsquad.material = this.updateMaterial        
        renderer.setRenderTarget( this.particleRendertargets.write )
        fsquad.render(renderer)
        this.swapRendertarget()

        // update grid
        updateGridMaterial.uniforms.tPosition.value = this.uniforms.tPosition.value
        updateGridMaterial.uniforms.gridSize.value = this.gridSize
        updateGridMaterial.uniforms.gridCellSize.value = gridCellSize
        updateGridMaterial.uniforms.gridTextureSize.value = this.gridRenderTarget.width
        this.particleInstancedMesh.material = updateGridMaterial
        renderer.autoClear = true
        renderer.setClearColor(0,0)
        renderer.setRenderTarget( this.gridRenderTarget )
        renderer.render( this.particleInstancedMesh, dummyCamera )

    }
}