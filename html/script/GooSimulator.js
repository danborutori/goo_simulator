import { InstancedMesh, Matrix4, MeshBasicMaterial, SphereGeometry, Vector3 } from "three";
const v1 = new Vector3;
const m1 = new Matrix4;
const particleMass = 1;
const gravity = new Vector3(0, -9.8, 0);
const stiffness = 1000;
const dampingFactor = 0.5;
export class GooSimulator {
    constructor(volume, particleCount) {
        this.particles = new Array(particleCount);
        const radius = 0.01;
        const width = Math.floor(Math.sqrt(particleCount));
        for (let i = 0; i < particleCount; i++) {
            const x = (i % width - width / 2) * radius * 2;
            const z = (Math.floor(i / width) - width / 2) * radius * 2;
            this.particles[i] = {
                position: new Vector3(x, 2, z),
                velocity: new Vector3(0, 0, 0),
                force: new Vector3(0, 0, 0),
                links: []
            };
        }
        this.instancedMesh = new InstancedMesh(new SphereGeometry(radius), new MeshBasicMaterial({
            color: 0xff0000
        }), particleCount);
        this.instancedMesh.frustumCulled = false;
    }
    update(deltaTime) {
        this.simulate(deltaTime);
    }
    simulate(deltaTime) {
        for (let i = 0; i < this.particles.length; i++) {
            this.particles[i].force.setScalar(0);
        }
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            if (p.position.y <= 0) {
                p.force.add(v1.set(0, -p.position.y * stiffness, 0));
            }
            p.force.addScaledVector(gravity, particleMass);
            p.force.addScaledVector(p.velocity, -dampingFactor);
        }
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            p.velocity.addScaledVector(p.force, deltaTime / particleMass);
            p.position.addScaledVector(p.velocity, deltaTime);
            this.instancedMesh.setMatrixAt(i, m1.makeTranslation(p.position));
            this.instancedMesh.instanceMatrix.needsUpdate = true;
        }
    }
}
