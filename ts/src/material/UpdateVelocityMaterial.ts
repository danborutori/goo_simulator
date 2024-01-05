import { AdditiveBlending, ShaderMaterial } from "three";

export class UpdateVelocityMaterial extends ShaderMaterial {

    constructor(){
        super({
            uniforms: {
                deltaTime: { value: 0 },
                particleMass: { value: 1 },
                tForce: { value: null }
            },
            vertexShader: `
            varying vec2 vUv;

            void main(){
                vUv = uv;
                gl_Position = vec4(position, 1);
            }
            `,
            fragmentShader: `

            uniform float deltaTime;
            uniform  float particleMass;
            uniform sampler2D tForce;

            varying vec2 vUv;

            void main(){
                gl_FragColor = vec4( texture2D(tForce, vUv).xyz*deltaTime/particleMass, 1 );
            }
            `,
            transparent: true,
            blending: AdditiveBlending
        })
    }
}