import { BufferAttribute, BufferGeometry, ClampToEdgeWrapping, Color, FloatType, Group, InstancedMesh, LineBasicMaterial, LineSegments, MathUtils, Matrix4, Mesh, NearestFilter, OrthographicCamera, PlaneGeometry, RGBADepthPacking, RGBAFormat, RedFormat, SphereGeometry, Vector2, Vector3, WebGLRenderTarget, WebGLRenderer } from "three";
import { HitTriangleInfo, MeshBVH, MeshBVHUniformStruct, getTriangleHitPointInfo } from "three-mesh-bvh";
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

const v1 = new Vector3
const v2 = new Vector3
const v2_1 = new Vector2
const m1 = new Matrix4

const _v1 = new Vector3
const _c1 = new Color

interface Particle {
    index: number
    position: Vector3
    velocity: Vector3
    force: Vector3
    gridIndex: number
    linkCount: number
    surfaceLinkCount: number
}

interface ParticlePair {
    a: Particle
    b: Particle
}

interface ParticleToSurfaceLink {
    point: Vector3
    mesh: Mesh
    particle: Particle
}

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
const maxLink = 4

const gridCellSize = radius*2

const _deleteLinks: number[] = []
const _hitPointInfo = {
    point: new Vector3(),
    distance: 0,
    faceIndex: 0
}
const _hitTriangleInfo: HitTriangleInfo = {
    face: {
        a: 0,
        b: 0,
        c: 0,
        materialIndex: 0,
        normal: new Vector3
    },
    uv: new Vector2
}
const _pairCache: ParticlePair[] = []
const _surfaceLinkCache: ParticleToSurfaceLink[] = []
const _collidePair: Map<number, ParticlePair> = new Map
const _lineSegments: { a: Vector3, b: Vector3 }[] = []
const _vectorPairCache: { a: Vector3, b: Vector3 }[] = []

const sdfGenerator = new SDFGenerator

function createInstancedMesh(
    particleCount: number,
    positionTextureSize: number
){
    const g = new BufferGeometry()
    const position = new BufferAttribute( new Float32Array(particleCount*3), 3)
    for( let i=0; i<particleCount; i++ ){

        v2_1.set(
            i%positionTextureSize,
            Math.floor(i/positionTextureSize)
        ).addScalar(0.5).divideScalar(positionTextureSize)

        position.setXYZ(
            i,
            i,
            v2_1.x,
            v2_1.y
        )
    }
    g.setAttribute("position", position)
    const m = new InstancedMesh(g,undefined,particleCount)
    ;(m as any).isMesh = false
    ;(m as any).isPoints = true
    m.frustumCulled = false
    return m
}

const fsquad = new FullScreenQuad()
const initPositionMaterial = new InitPositionMaterial()
const updateForceMaterial = new UpdateForceMaterial()
const updateVelocityMaterial = new UpdateVelocityMaterial()
const updatePositionMaterial = new UpdatePositionMaterial()
const bvhCollisionMaterial = new BvhCollisionMaterial()
const updateGridMaterial = new UpdateGridMaterial()
const particleToParticleCollisionMaterial = new ParticleToParticleCollisionMaterial()
const dummyCamera = new OrthographicCamera()

export class GooSimulator extends Group {

    private particleRendertargets: {
        position: WebGLRenderTarget
        velocity: WebGLRenderTarget
        force: WebGLRenderTarget
    }
    private particleInstancedMesh: InstancedMesh
    private gridRenderTarget: WebGLRenderTarget

    private particles: Particle[]
    private links: Map<number, ParticlePair> = new Map
    private surfaceLinks: Map<number, ParticleToSurfaceLink> = new Map
    private linksLine: LineSegments
    private surfaceLinkLine: LineSegments
    private marchingMesh: Mesh
    private deltaTime = 0
    private grid: (Particle|null)[]
    private colliders: {
        mesh: Mesh
        bvh: MeshBVH
        bvhUniform: MeshBVHUniformStruct
    }[]

    private sdfRendertarget: WebGLRenderTarget

    constructor(
        renderer: WebGLRenderer,
        colliders: Mesh[],
        readonly particleCount: number,
        readonly gridSize: number = 256
    ){
        super()

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
            })
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

        this.particles = new Array(particleCount)
        this.grid = new Array(gridSize*gridSize*gridSize)
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

        const width = Math.floor(Math.sqrt(particleCount))
        for( let i=0; i<particleCount; i++ ){
            const x = (i%width-width/2)*radius*2
            const y = (Math.floor(i/width)-width/2)*radius*2
            this.particles[i] = {
                index: i,
                position: new Vector3(x,4,y),
                velocity: new Vector3(0,0,0),
                force: new Vector3(0,0,0),
                gridIndex: 0,
                linkCount: 0,
                surfaceLinkCount: 0
            }
        }

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

        this.linksLine = new LineSegments( new BufferGeometry(), new LineBasicMaterial({
            color: 0x00ff00,
        }))
        this.linksLine.frustumCulled = false
        this.linksLine.castShadow = true
        this.linksLine.receiveShadow = false
        group.add(this.linksLine)

        this.surfaceLinkLine = new LineSegments( new BufferGeometry(), new LineBasicMaterial({
            color: 0xffff00
        }))
        this.surfaceLinkLine.frustumCulled = false
        this.surfaceLinkLine.castShadow = true
        this.surfaceLinkLine.receiveShadow = false
        group.add(this.surfaceLinkLine)

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
        // this.add(this.marchingMesh)
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
            this.simulateGPU( fixedTimeStep, renderer )
            // this.simulate( fixedTimeStep )
            this.deltaTime -= fixedTimeStep
            simulationRun = true
        }

        renderer.setRenderTarget(restore.rendertarget,restore.activeCubeFace,restore.activeMipmapLevel)
        renderer.setClearColor(restore.clearColor,restore.clearAlpha)
        renderer.autoClear = restore.autoClear

        if( simulationRun ){
            this.updateLines()
            this.updateSurfaceLines()
            for( let l of this.links ){
                const pair = _vectorPairCache.pop() || {a: new Vector3, b: new Vector3}
                pair.a.copy(l[1].a.position)
                pair.b.copy(l[1].b.position)
                _lineSegments.push( pair )
            }
            for( let l of this.surfaceLinks ){
                const pair = _vectorPairCache.pop() || {a: new Vector3, b: new Vector3}
                pair.a.copy( l[1].particle.position )
                pair.b.copy(l[1].point).applyMatrix4(l[1].mesh.matrixWorld)
                _lineSegments.push( pair )
            }
            sdfGenerator.generate(
                renderer,
                this.sdfRendertarget,

                this.gridSize,
                gridCellSize,
                this.particles,
                _lineSegments,
                radius
            )
            for( let p of _lineSegments )
                _vectorPairCache.push(p)
            _lineSegments.length = 0
        }
    }

    gridIndexFromPosition( v: Vector3 ){
        _v1.copy(v).divideScalar(gridCellSize).floor().addScalar(this.gridSize/2).clampScalar(0,this.gridSize-1)
        return _v1.x+_v1.y*this.gridSize+_v1.z*this.gridSize*this.gridSize
    }

    private simulateGPU( deltaTime: number, renderer: WebGLRenderer ){

        // update force
        renderer.autoClear = true
        renderer.setClearColor(0,0)
        renderer.setRenderTarget( this.particleRendertargets.force )

        particleToParticleCollisionMaterial.uniforms.tPosition.value = this.particleRendertargets.position.texture
        particleToParticleCollisionMaterial.uniforms.tGrid.value = this.gridRenderTarget.texture
        particleToParticleCollisionMaterial.uniforms.gridSize.value = this.gridSize
        particleToParticleCollisionMaterial.uniforms.gridCellSize.value = gridCellSize
        particleToParticleCollisionMaterial.uniforms.radius.value = radius
        fsquad.material = particleToParticleCollisionMaterial
        fsquad.render(renderer)

        renderer.autoClear = false

        bvhCollisionMaterial.uniforms.tPosition.value = this.particleRendertargets.position.texture
        bvhCollisionMaterial.uniforms.radius.value = radius
        bvhCollisionMaterial.uniforms.stiffness.value = stiffness        
        fsquad.material = bvhCollisionMaterial
        for( let i=0; i<this.colliders.length; i++ ){
            const collider = this.colliders[i]
            bvhCollisionMaterial.uniforms.bvh.value = collider.bvhUniform
            bvhCollisionMaterial.uniforms.bvhMatrix.value = collider.mesh.matrixWorld
            fsquad.render(renderer)
        }

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
    }

    private simulate( deltaTime: number ){
        // reset force
        for( let i=0; i<this.particles.length; i++ ){
            this.particles[i].force.setScalar(0)
        }

        this.updateGrid()
        this.updateLinksAndParticleCollision()

        // compute force

        // links force
        _deleteLinks.length = 0
        for( let e of this.links ){
            const link = e[1]
            v1.subVectors(
                link.a.position,
                link.b.position
            )
            
            const d = v1.length()
            if( d<breakLinkDistance ){
                v1.divideScalar(d)
                const str = (formLinkDistance-d)*linkStrength

                link.a.force.addScaledVector(v1,str)
                link.b.force.addScaledVector(v1,-str)
            }else{
                _deleteLinks.push(e[0])
            }
        }
        for(let l of _deleteLinks){
            const lnk = this.links.get(l)!
            lnk.a.linkCount--
            lnk.b.linkCount--
            _pairCache.push(lnk)
            this.links.delete(l)
        }
        _deleteLinks.length = 0
        for( let e of this.surfaceLinks ){
            const link = e[1]
            v2.copy(link.point).applyMatrix4(link.mesh.matrixWorld)
            v1.subVectors(link.particle.position, v2)
            const d = v1.length()

            if( d>breakLinkDistance ){
                _deleteLinks.push(e[0])
            }else{
                v1.divideScalar(d)
                const str = (radius-d)*stickyness
                link.particle.force.addScaledVector(v1,str)
            }
        }
        for( let s of _deleteLinks ){
            const l = this.surfaceLinks.get(s)!
            l.particle.surfaceLinkCount--
            _surfaceLinkCache.push( l )
            this.surfaceLinks.delete(s)
        }

        for( let p of this.particles ){
            
            // collide bvh
            for( let i=0; i<this.colliders.length; i++ ){
                let collider = this.colliders[i]
                m1.copy(collider.mesh.matrixWorld).invert()
                const scale = m1.getMaxScaleOnAxis()
                v1.copy(p.position).applyMatrix4(m1)

                const localSpaceRadius = radius*scale                
                const info = collider.bvh.closestPointToPoint(v1, _hitPointInfo, 0, localSpaceRadius)
                if( info ){
                    getTriangleHitPointInfo(
                        info.point,
                        collider.bvh.geometry,
                        info.faceIndex,
                        _hitTriangleInfo
                    )
                    info.distance *= Math.sign(v2.subVectors(v1,info.point).dot(_hitTriangleInfo.face.normal))
                }
                if( info && info.distance<localSpaceRadius ){
                    // transform to world space
                    info.distance /= scale
                    v2.copy(info.point).applyMatrix4(collider.mesh.matrixWorld)
                    const d = radius-info.distance
                    v1.subVectors( p.position, v2 ).divideScalar(Math.abs(info.distance)),
                    p.force.addScaledVector(v1,d*stiffness)

                    // for link
                    const key = p.index+(i+info.faceIndex*this.colliders.length)*this.particles.length
                    if( p.surfaceLinkCount<maxLink && !this.surfaceLinks.has(key) ){
                        const newLink = _surfaceLinkCache.pop() || {
                            point: new Vector3,
                            mesh: collider.mesh,
                            particle: p
                        }
                        newLink.point.copy(info.point)
                        newLink.mesh = collider.mesh
                        newLink.particle = p
                        p.surfaceLinkCount++
                        this.surfaceLinks.set(key,newLink)
                    }
                }
            }

            // apply gravity
            p.force.addScaledVector(gravity,particleMass)

            //damping force
            p.force.addScaledVector( p.velocity, -dampingFactor )
        }


        // apply force
        for( let i=0; i<this.particles.length; i++ ){
            const p = this.particles[i]
            p.velocity.addScaledVector(p.force,deltaTime/particleMass)
            p.position.addScaledVector(p.velocity,deltaTime)
        }

    }

    private updateGrid(){
        for( let p of this.particles ){
            this.grid[p.gridIndex] = null
        }

        for( let p of this.particles ){
            const index = this.gridIndexFromPosition(p.position)
            this.grid[index] = p
            p.gridIndex = index
        }
    }

    private updateLinksAndParticleCollision(){

        // form link
        for( let i=0; i<this.particles.length; i++ ){
            const p1 = this.particles[i]

            for( let x=0; x<=1; x++ ){
                for( let y=0; y<=1; y++ ){
                    for( let z=0; z<=1; z++ ){
                        v1.copy(p1.position)
                        v1.x += x*gridCellSize
                        v1.y += y*gridCellSize
                        v1.z += z*gridCellSize
                        const index = this.gridIndexFromPosition(v1)
                        const p2 = this.grid[index]
                        if( p2 && p2!==p1 ){
                            const key = Math.min(p1.index,p2.index)+Math.max(p1.index,p2.index)*this.particles.length
                            if( !_collidePair.has(key) ){
                                const pair = _pairCache.pop() || {
                                    a: p1,
                                    b: p2
                                }
                                pair.a = p1
                                pair.b = p2
                                _collidePair.set(key,pair)
                            }
                        }
                    }    
                }    
            }
        }
        for( let e of _collidePair ){
            const p1 = e[1].a
            const p2 = e[1].b
            v1.subVectors(
                p1.position,
                p2.position
            )
            let d = v1.length()
            const key = Math.min(p1.index,p2.index)+Math.max(p1.index,p2.index)*this.particles.length
            if( d<=formLinkDistance &&
                p1.linkCount<maxLink &&
                p2.linkCount<maxLink &&
                !this.links.has(key)
            ){
                const newLink = _pairCache.pop() || {
                    a: p1,
                    b: p2
                }
                newLink.a = p1
                newLink.b = p2
                newLink.a.linkCount++
                newLink.b.linkCount++
                this.links.set(key, newLink)
            }
            if( d<radius*2 ){
                v1.multiplyScalar(0.005/(d*d))
                p1.force.add(v1)
                p2.force.sub(v1)
            }
        }
        for( let e of _collidePair ){
            _pairCache.push(e[1])
        }
        _collidePair.clear()

    }

    private recycleParticle(){
        let i = 0
        for( let p of this.particles ){
            if(p.position.y<-2){
                p.position.set(Math.random(),0,Math.random()).subScalar(0.5).normalize().multiplyScalar(Math.random()*radius*32)
                p.position.y = 4+(i++)*radius
            }
        }
    }

    private updateLines(){
        const g = this.linksLine.geometry

        let position = g.attributes.position
        if( !position || position.count<this.particles.length ){
            position = new BufferAttribute(new Float32Array(this.particles.length*3), 3)
            g.setAttribute("position",position)
        }
        for( let i=0; i<this.particles.length; i++ ){
            this.particles[i].position.toArray( position.array, i*3 )
        }
        position.needsUpdate = true

        let index = g.index
        if( !index || index.array.length<this.links.size*2 ){
            index = new BufferAttribute( new Uint16Array(this.links.size*2), 1 )
            g.setIndex(index)
        }
        let i = 0
        for( let e of this.links ){
            index.setX(i*2,e[1].a.index)
            index.setX(i*2+1,e[1].b.index)
            i++
        }
        index.needsUpdate = true
        ;(index as any).count = this.links.size*2
    }

    private updateSurfaceLines(){
        const g = this.surfaceLinkLine.geometry

        let position = g.attributes.position
        if( !position || position.count<this.surfaceLinks.size*2 ){
            position = new BufferAttribute(new Float32Array(this.surfaceLinks.size*6), 3)
            g.setAttribute("position",position)
        }
        let i = 0
        for( let e of this.surfaceLinks ){
            const l = e[1]
            v1.copy(l.point)
            .applyMatrix4(l.mesh.matrixWorld)
            .toArray( position.array, i*6 )
            l.particle.position.toArray( position.array, i*6+3 )
            i++
        }
        position.needsUpdate = true

        let index = g.index
        if( !index || index.array.length<this.surfaceLinks.size*2 ){
            index = new BufferAttribute( new Uint16Array(this.surfaceLinks.size*2), 1 )
            for( let i=0; i<index.count; i++ ){
                index.setX(i,i)
            }
            index.needsUpdate = true
            g.setIndex(index)
        }
        (index as any).count = this.surfaceLinks.size*2
    }
}