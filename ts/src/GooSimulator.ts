import { InstancedMesh, Matrix4, MeshBasicMaterial, SphereGeometry, Vector3 } from "three";
import { MeshBVH, HitPointInfo } from "three-mesh-bvh";

const v1 = new Vector3
const m1 = new Matrix4

interface Particle {
    position: Vector3
    velocity: Vector3
    force: Vector3
    links: Particle[]
}

const particleMass = 0.1
const gravity = new Vector3(0,-9.8,0)

const stiffness = 1000
const dampingFactor = 0.75
const subStep = 2
const radius = 0.02

export class GooSimulator {

    private particles: Particle[]
    readonly instancedMesh: InstancedMesh

    constructor(
        readonly bvhMesh: MeshBVH,
        particleCount: number
    ){
        this.particles = new Array(particleCount)

        const width = Math.floor(Math.sqrt(particleCount))
        for( let i=0; i<particleCount; i++ ){
            const x = (i%width-width/2)*radius*2
            const z = (Math.floor(i/width)-width/2)*radius*2
            this.particles[i] = {
                position: new Vector3(x,2,z),
                velocity: new Vector3(0,0,0),
                force: new Vector3(0,0,0),
                links: []
            }
        }

        this.instancedMesh = new InstancedMesh(
            new SphereGeometry(radius),
            new MeshBasicMaterial({
                color: 0xff0000
            }),
            particleCount
        )
        this.instancedMesh.frustumCulled = false
    }

    update( deltaTime: number ){

        for( let i=0; i<subStep; i++ )
            this.simulate( deltaTime/subStep )

    }

    private simulate( deltaTime: number ){

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

            this.instancedMesh.setMatrixAt(i,m1.makeTranslation(p.position))
            this.instancedMesh.instanceMatrix.needsUpdate = true
        }

    }

}