import { BufferAttribute, BufferGeometry, ClampToEdgeWrapping, FloatType, Group, InstancedMesh, LineBasicMaterial, LineSegments, MathUtils, Matrix4, Mesh, MeshStandardMaterial, NearestFilter, PlaneGeometry, RedFormat, SphereGeometry, Vector2, Vector3, WebGLRenderTarget, WebGLRenderer } from "three";
import { HitTriangleInfo, MeshBVH, getTriangleHitPointInfo } from "three-mesh-bvh";
import { SDFGenerator } from "./SDFGenerator.js";
import { MarchingMaterial } from "./MarchingMaterial.js";

const v1 = new Vector3
const v2 = new Vector3
const m1 = new Matrix4

const _v1 = new Vector3

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

const sdfGenerator = new SDFGenerator

export class GooSimulator extends Group {

    private particles: Particle[]
    private links: Map<number, ParticlePair> = new Map
    private surfaceLinks: Map<number, ParticleToSurfaceLink> = new Map
    private instancedMesh: InstancedMesh
    private linksLine: LineSegments
    private surfaceLinkLine: LineSegments
    private marchingMesh: Mesh
    private deltaTime = 0
    private grid: (Particle|null)[]
    private colliders: {
        mesh: Mesh
        bvh: MeshBVH
    }[]

    private sdfRendertarget: WebGLRenderTarget

    constructor(
        colliders: Mesh[],
        particleCount: number,
        readonly gridSize: number = 256
    ){
        super()
        this.particles = new Array(particleCount)
        this.grid = new Array(gridSize*gridSize*gridSize)
        this.colliders = colliders.map( m=>{
            return {
                mesh: m,
                bvh: new MeshBVH(m.geometry)
            }
        })
        const sdfRenderTargetWidth = MathUtils.ceilPowerOfTwo(Math.floor(Math.pow(gridSize,3/2)))
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
        group.visible = false
        this.add( group )

        this.instancedMesh = new InstancedMesh(
            new SphereGeometry(radius),
            new MeshStandardMaterial({
                color: 0xff0000
            }),
            particleCount
        )
        this.instancedMesh.frustumCulled = false
        this.instancedMesh.castShadow = true
        this.instancedMesh.receiveShadow = true
        group.add(this.instancedMesh)

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
        this.marchingMesh = new Mesh( new PlaneGeometry(2,2), marchingMaterial)
        this.marchingMesh.frustumCulled = false
        this.marchingMesh.onBeforeRender = (renderer,_,camera)=>{
            renderer.getDrawingBufferSize(marchingMaterial.uniforms.resolution.value)
            marchingMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(camera.projectionMatrixInverse)
            marchingMaterial.uniforms.cameraWorldMatrix.value.copy(camera.matrixWorld)
        }
        this.add(this.marchingMesh)
    }

    update( deltaTime: number, renderer: WebGLRenderer ){

        this.deltaTime += deltaTime
        let simulationRun = false

        if(this.deltaTime>fixedTimeStep)
            this.recycleParticle()

        while( this.deltaTime>fixedTimeStep ){
            this.simulate( fixedTimeStep )
            this.deltaTime -= fixedTimeStep
            simulationRun = true
        }

        if( simulationRun ){
            this.updateInstanceMatrix()
            this.updateLines()
            this.updateSurfaceLines()
            sdfGenerator.generate(
                renderer,
                this.sdfRendertarget,
                this.gridSize,
                gridCellSize,
                this.particles,
                radius
            )
        }
    }

    gridIndexFromPosition( v: Vector3 ){
        _v1.copy(v).divideScalar(gridCellSize).floor().addScalar(this.gridSize/2).clampScalar(0,this.gridSize-1)
        return _v1.x+_v1.y*this.gridSize+_v1.z*this.gridSize*this.gridSize
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

    private updateInstanceMatrix(){
        for( let p of this.particles ){
            this.instancedMesh.setMatrixAt(p.index,m1.makeTranslation(p.position))
        }
        this.instancedMesh.instanceMatrix.needsUpdate = true
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