import { BufferAttribute, BufferGeometry, Group, InstancedMesh, Line, LineBasicMaterial, LineSegments, Matrix4, MeshStandardMaterial, SphereGeometry, Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";

const v1 = new Vector3
const m1 = new Matrix4

interface Particle {
    index: number
    position: Vector3
    velocity: Vector3
    force: Vector3
}

interface Link {
    a: Particle
    b: Particle
}

interface ParticleToSurfaceLink {
    point: Vector3
    faceIndex: number
    particle: Particle
}

const particleMass = 0.1
const gravity = new Vector3(0,-9.8,0)

const stiffness = 1000
const linkStrength = 10
const stickyness = 1.5
const dampingFactor = 0.99
const subStep = 3
const radius = 0.02
const formLinkDistance = radius*2
const breakLinkDistance = formLinkDistance*5

const _deleteLinks: string[] = []

export class GooSimulator extends Group {

    private particles: Particle[]
    private links: Map<string, Link> = new Map
    private surfaceLinks: Map<string, ParticleToSurfaceLink> = new Map
    private instancedMesh: InstancedMesh
    private linksLine: LineSegments
    private surfaceLinkLine: LineSegments

    constructor(
        readonly bvhMesh: MeshBVH,
        particleCount: number
    ){
        super()
        this.particles = new Array(particleCount)

        const width = Math.floor(Math.sqrt(particleCount))
        for( let i=0; i<particleCount; i++ ){
            const position = new Vector3(Math.random(),0,Math.random()).subScalar(0.5).normalize().multiplyScalar(Math.random()*radius*16)
            position.y = 2+i*radius*0.25 
            this.particles[i] = {
                index: i,
                position: position,
                velocity: new Vector3(0,0,0),
                force: new Vector3(0,0,0)
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
        this.instancedMesh.onBeforeRender = ()=>{
            this.updateInstanceMatrix()
        }

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

        for( let i=0; i<subStep; i++ )
            this.simulate( deltaTime/subStep )

        this.updateLines()
        this.updateSurfaceLines()
    }

    private simulate( deltaTime: number ){
        this.updateLinksAndParticleCollision()

        // reset force
        for( let i=0; i<this.particles.length; i++ ){
            this.particles[i].force.setScalar(0)
        }

        // compute force
        const hitPointInfo = {
            point: new Vector3(),
            distance: 0,
            faceIndex: 0
        }

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
            this.surfaceLinks.delete(s)
        }

        for( let p of this.particles ){
            
            // collide bvh
            const info = this.bvhMesh.closestPointToPoint(p.position, hitPointInfo)
            if( info && info.distance<radius ){
                p.force.addScaledVector(
                    v1.subVectors( p.position, info.point ).normalize(),
                    (radius-info.distance)*stiffness
                )

                // for link
                const key = `${p.index},${info.faceIndex}`
                if( !this.surfaceLinks.has(key) ){
                    this.surfaceLinks.set(key,{
                        faceIndex: info.faceIndex,
                        point: info.point.clone(),
                        particle: p
                    })
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

    private updateLinksAndParticleCollision(){

        // form link
        for( let i=0; i<this.particles.length; i++ ){
            const p1 = this.particles[i]
            for( let j=i+1; j<this.particles.length; j++ ){
                const p2 = this.particles[j]

                v1.subVectors(
                    p1.position,
                    p2.position
                )
                const d = v1.length()
                const key = `${i},${j}`
                if( d<=formLinkDistance &&
                    !this.links.has(key)
                ){
                    this.links.set(key, {
                        a: p1,
                        b: p2
                    })
                }
                if( d<radius*2 ){
                    const str = (radius*2-d)*stiffness
                    v1.subScalar(d)
                    p1.force.addScaledVector(v1,str)
                    p2.force.addScaledVector(v1,-str)
                }
            }
        }

        // break link
        _deleteLinks.length = 0
        for( let e of this.links ){
            const l = e[1]
            if( l.a.position.distanceTo(l.b.position)>breakLinkDistance ){
                _deleteLinks.push(e[0])
            }
        }
        for(let l of _deleteLinks){
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