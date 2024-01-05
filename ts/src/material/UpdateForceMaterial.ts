import { AdditiveBlending, ShaderMaterial, Vector3 } from "three";

export class UpdateForceMaterial extends ShaderMaterial {

    constructor(){
        super({
            uniforms: {
                tVel: { value: null },
                particleMass: { value: 1 },
                gravity: { value: new Vector3 },
                dampingFactor: { value: 0 }
            },
            vertexShader: `
                varying vec2 vUv;

                void main(){
                    vUv = uv;
                    gl_Position = vec4(position,1);
                }
            `,
            fragmentShader: `
                uniform sampler2D tVel;
                uniform float particleMass;
                uniform vec3 gravity;
                uniform float dampingFactor;

                varying vec2 vUv;

                void main(){
                    
                    vec3 force = gravity*particleMass;

                    vec3 velocity = texture2D( tVel, vUv ).xyz;
                    force -= velocity*dampingFactor;

                    gl_FragColor = vec4(force,1);
                }
            `,
            transparent: true,
            blending: AdditiveBlending
        })
    }
}