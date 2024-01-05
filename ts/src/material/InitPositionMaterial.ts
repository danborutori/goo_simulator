import { NoBlending, ShaderMaterial } from "three";

export class InitPositionMaterial extends ShaderMaterial {

    constructor(){
        super({
            uniforms: {
                radius: { value: 1 },
                particleCount: { value: 1 },
                rendertargetWidth: { value: 1 }
            },
            vertexShader: `

            void main(){
                gl_Position = vec4(position,1);
            }

            
            `,
            fragmentShader: `
            uniform float radius;
            uniform float particleCount;
            uniform float rendertargetWidth;

            void main(){
                float particleId = floor(gl_FragCoord.x)+floor(gl_FragCoord.y)*rendertargetWidth;

                float width = floor(sqrt(particleCount));
                gl_FragColor = vec4( 
                    (mod(particleId,width)-width/2.0)*radius*2.0,
                    4,
                    (floor(particleId/width)-width/2.0)*radius*2.0,
                    1
                );
            }
            `,
            transparent: false,
            blending: NoBlending
        })
    }

}