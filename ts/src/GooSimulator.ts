import { BufferAttribute, BufferGeometry, Group, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, MeshStandardMaterial, SphereGeometry, Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";

const v1 = new Vector3
const m1 = new Matrix4

const _v1 = new Vector3

interface Particle {
    index: number
    position: Vector3
    velocity: Vector3
    force: Vector3
    displacement: Vector3
    gridIndex: number
}

interface ParticlePair {
    a: Particle
    b: Particle
}

interface ParticleToSurfaceLink {
    point: Vector3
    particle: Particle
}

const particleMass = 0.1
const gravity = new Vector3(0,-9.8,0)

const stiffness = 1000
const linkStrength = 10
const stickyness = 1.5
const dampingFactor = 0.99
const radius = 0.02
const formLinkDistance = radius*2
const breakLinkDistance = formLinkDistance*5
const fixedTimeStep = 1/70

const gridCellSize = radius*2

const _deleteLinks: number[] = []
const _hitPointInfo = {
    point: new Vector3(),
    distance: 0,
    faceIndex: 0
}
const _pairCache: ParticlePair[] = []
const _surfaceLinkCache: ParticleToSurfaceLink[] = []
const _collidePair: Map<number, ParticlePair> = new Map

export class GooSimulator extends Group {

    private particles: Particle[]
    private links: Map<number, ParticlePair> = new Map
    private surfaceLinks: Map<number, ParticleToSurfaceLink> = new Map
    private instancedMesh: InstancedMesh
    private linksLine: LineSegments
    private surfaceLinkLine: LineSegments
    private deltaTime = 0
    private grid: (Particle|null)[]

    constructor(
        readonly bvhMesh: MeshBVH,
        particleCount: number,
        readonly gridSize: number = 400
    ){
        super()
        this.particles = new Array(particleCount)
        this.grid = new Array(gridSize*gridSize*gridSize)

        const width = Math.floor(Math.sqrt(particleCount))
        for( let i=0; i<particleCount; i++ ){
            const position = new Vector3(Math.random(),0,Math.random()).subScalar(0.5).normalize().multiplyScalar(Math.random()*radius*40)
            position.y = 2+i*radius*0.25 
            this.particles[i] = {
                index: i,
                position: position,
                velocity: new Vector3(0,0,0),
                force: new Vector3(0,0,0),
                displacement: new Vector3(0,0,0),
                gridIndex: 0
            }
        }

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
        this.add(this.instancedMesh)

        this.linksLine = new LineSegments( new BufferGeometry(), new LineBasicMaterial({
            color: 0x00ff00,
        }))
        this.linksLine.frustumCulled = false
        this.linksLine.castShadow = true
        this.linksLine.receiveShadow = false
        this.add(this.linksLine)

        this.surfaceLinkLine = new LineSegments( new BufferGeometry(), new LineBasicMaterial({
            color: 0x0000ff
        }))
        this.surfaceLinkLine.frustumCulled = false
        this.surfaceLinkLine.castShadow = true
        this.surfaceLinkLine.receiveShadow = false
        this.add(this.surfaceLinkLine)
    }

    update( deltaTime: number ){

        this.deltaTime += deltaTime
        let geometryNeedUpdate = false

        while( this.deltaTime>fixedTimeStep ){
            this.simulate( fixedTimeStep )
            this.deltaTime -= fixedTimeStep
            geometryNeedUpdate = true
        }

        if( geometryNeedUpdate ){
            this.updateInstanceMatrix()
            this.updateLines()
            this.updateSurfaceLines()
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
            this.particles[i].displacement.setScalar(0)
        }

        this.updateGrid()
        this.updateLinksAndParticleCollision()

        // compute force

        // links force
        for( let e of this.links ){
            const link = e[1]
            v1.subVectors(
                link.a.position,
                link.b.position
            )
            
            const d = v1.length()
            v1.divideScalar(d)
            const str = (formLinkDistance-d)*linkStrength

            link.a.force.addScaledVector(v1,str)
            link.b.force.addScaledVector(v1,-str)
        }
        _deleteLinks.length = 0
        for( let e of this.surfaceLinks ){
            const link = e[1]
            v1.subVectors(link.particle.position, link.point)
            const d = v1.length()
            v1.divideScalar(d)
            const str = (radius-d)*stickyness
            link.particle.force.addScaledVector(v1,str)

            if( d>breakLinkDistance ){
                _deleteLinks.push(e[0])
            }
        }
        for( let s of _deleteLinks ){
            _surfaceLinkCache.push( this.surfaceLinks.get(s)! )
            this.surfaceLinks.delete(s)
        }

        for( let p of this.particles ){
            
            // collide bvh
            const info = this.bvhMesh.closestPointToPoint(p.position, _hitPointInfo, 0, radius)
            if( info && info.distance<radius ){
                const d = radius-info.distance
                v1.subVectors( p.position, info.point ).divideScalar(info.distance),
                p.force.addScaledVector(v1,d*stiffness)
                p.displacement.addScaledVector(v1,d)

                // for link
                const key = p.index+info.faceIndex*this.particles.length
                if( !this.surfaceLinks.has(key) ){
                    const newLink = _surfaceLinkCache.pop() || {
                        point: new Vector3,
                        particle: p
                    }
                    newLink.point.copy(info.point)
                    newLink.particle = p
                    this.surfaceLinks.set(key,newLink)
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
            p.position.add(p.displacement)
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
                !this.links.has(key)
            ){
                const newLink = _pairCache.pop() || {
                    a: p1,
                    b: p2
                }
                newLink.a = p1
                newLink.b = p2
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


        // break link
        _deleteLinks.length = 0
        for( let e of this.links ){
            const l = e[1]
            if( l.a.position.distanceTo(l.b.position)>breakLinkDistance ){
                _deleteLinks.push(e[0])
            }
        }
        for(let l of _deleteLinks){
            _pairCache.push(this.links.get(l)!)
            this.links.delete(l)
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
            l.point.toArray( position.array, i*6 )
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