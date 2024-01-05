import { AdditiveBlending, ShaderMaterial } from "three";

export class UpdateVelocityMaterial extends ShaderMaterial {

    constructor(){
        super({
            uniforms: {
                deltaTime: { value: 0 },
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
            uniform sampler2D tForce;

            varying vec2 vUv;

            void main(){
                gl_FragColor = vec4( texture2D(tForce, vUv).xyz*deltaTime, 1 );
            }
            `,
            transparent: true,
            blending: AdditiveBlending
        })
    }
}