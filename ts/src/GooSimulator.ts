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

const particleMass = 0.1
const gravity = new Vector3(0,-9.8,0)

const stiffness = 1000
const linkStrength = 10
const dampingFactor = 0.75
const subStep = 2
const radius = 0.02
const formLinkDistance = radius*2
const breakLinkDistance = formLinkDistance*5

const _deleteLinks: string[] = []

export class GooSimulator extends Group {

    private particles: Particle[]
    private links: Map<string, Link> = new Map
    private instancedMesh: InstancedMesh
    private linksMesh: Line

    constructor(
        readonly bvhMesh: MeshBVH,
        particleCount: number
    ){
        super()
        this.particles = new Array(particleCount)

        const width = Math.floor(Math.sqrt(particleCount))
        for( let i=0; i<particleCount; i++ ){
            const x = (i%width-width/2)*radius*2
            const z = (Math.floor(i/width)-width/2)*radius*2
            this.particles[i] = {
                index: i,
                position: new Vector3(x,2,z),
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

        this.linksMesh = new LineSegments( new BufferGeometry(), new LineBasicMaterial({
            color: 0x00ff00,
        }))
        this.linksMesh.frustumCulled = false
        this.linksMesh.castShadow = true
        this.linksMesh.receiveShadow = false
        this.add(this.linksMesh)
        this.linksMesh.onBeforeRender = ()=>{
            this.updateLines()
        }
    }

    update( deltaTime: number ){

        for( let i=0; i<subStep; i++ )
            this.simulate( deltaTime/subStep )

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

        for( let i=0; i<this.particles.length; i++ ){
            const p = this.particles[i]

            // collide bvh
            const info = this.bvhMesh.closestPointToPoint(p.position, hitPointInfo)
            if( info && info.distance<radius ){
                p.force.addScaledVector(
                    v1.subVectors( p.position, info.point ).normalize(),
                    (radius-info.distance)*stiffness
                )
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
                if( d<=formLinkDistance &&
                    !this.links.has(`${j},${i}`) &&
                    !this.links.has(`${i},${j}`)
                ){
                    this.links.set(`${i},${j}`, {
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
        const g = this.linksMesh.geometry

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
        if( !index || index.count!=this.links.size*2 ){
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
    }

}