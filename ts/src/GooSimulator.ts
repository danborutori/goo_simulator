import { InstancedMesh, Matrix4, MeshBasicMaterial, SphereGeometry, Vector3 } from "three";

const v1 = new Vector3
const m1 = new Matrix4

interface Particle {
    position: Vector3
    velocity: Vector3
    force: Vector3
    links: Particle[]
}

const particleMass = 1
const gravity = new Vector3(0,-9.8,0)

const stiffness = 1000
const dampingFactor = 0.5

export class GooSimulator {

    private particles: Particle[]
    readonly instancedMesh: InstancedMesh

    constructor(
        volume: number,
        particleCount: number
    ){
        this.particles = new Array(particleCount)

        const radius = 0.01

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

        this.simulate( deltaTime )

    }

    private simulate( deltaTime: number ){

        // reset force
        for( let i=0; i<this.particles.length; i++ ){
            this.particles[i].force.setScalar(0)
        }

        // compute force

        for( let i=0; i<this.particles.length; i++ ){
            const p = this.particles[i]

            // collide bottom plane
            if( p.position.y<=0 ){
                p.force.add( v1.set(0,-p.position.y*stiffness,0) )
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