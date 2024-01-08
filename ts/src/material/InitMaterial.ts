import { NoBlending, ShaderMaterial } from "three";

export class InitMaterial extends ShaderMaterial {

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

            layout(location = 1) out vec4 outVelocity;
            layout(location = 2) out vec4 outForce;
            layout(location = 3) out vec4 outLink;
            layout(location = 4) out vec4 outLink0;
            layout(location = 5) out vec4 outLink1;
            layout(location = 6) out vec4 outLink2;
            layout(location = 7) out vec4 outLink3;

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
                outVelocity = vec4(0,0,0,0);
                outForce = vec4(0,0,0,0);
                outLink = vec4(-1,-1,-1,-1);
                outLink0 = vec4(-1,-1,-1,-1);
                outLink1 = vec4(-1,-1,-1,-1);
                outLink2 = vec4(-1,-1,-1,-1);
                outLink3 = vec4(-1,-1,-1,-1);
            }
            `,
            transparent: false,
            blending: NoBlending
        })
    }

}