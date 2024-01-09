import { NoBlending, ShaderMaterial } from "three";

export class RecycleParticleMaterial extends ShaderMaterial {

    constructor(){
        super({
            uniforms: {
                tInput: { value: [] },
                radius: { value: 0 }
            },
            vertexShader: `
            varying vec2 vUv;

            void main(){
                vUv = uv;
                gl_Position = vec4(position,1);
            }
            `,
            fragmentShader: `
            layout(location = 1) out vec4 outVelocity;
            layout(location = 2) out vec4 outLink;
            layout(location = 3) out vec4 outLink0;
            layout(location = 4) out vec4 outLink1;
            layout(location = 5) out vec4 outLink2;
            layout(location = 6) out vec4 outLink3;

            uniform sampler2D tInput[7];
            uniform float radius;

            varying vec2 vUv;

            vec3 hash3(vec3 p) {
                p = fract(p * 0.3183099 + vec3(0.1, 0.1, 0.1));
                p += dot(p, p + 47.0);
                return fract(vec3(p.x * p.y, p.y * p.z, p.z * p.x));
            }
            
            vec3 noise3(vec3 x) {
                vec3 p = floor(x);
                vec3 f = fract(x);
            
                f = f * f * (3.0 - 2.0 * f);
            
                vec3 aaa = hash3(p + vec3(0.0, 0.0, 0.0));
                vec3 aba = hash3(p + vec3(1.0, 0.0, 0.0));
                vec3 aab = hash3(p + vec3(0.0, 1.0, 0.0));
                vec3 abb = hash3(p + vec3(1.0, 1.0, 0.0));
                vec3 baa = hash3(p + vec3(0.0, 0.0, 1.0));
                vec3 bba = hash3(p + vec3(1.0, 0.0, 1.0));
                vec3 bab = hash3(p + vec3(0.0, 1.0, 1.0));
                vec3 bbb = hash3(p + vec3(1.0, 1.0, 1.0));
            
                vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
            
                return mix(mix(mix(aaa, aba, u.x), mix(aab, abb, u.x), u.y), mix(mix(baa, bba, u.x), mix(bab, bbb, u.x), u.y), u.z);
            }

            void main(){
                vec3 position = texture2D( tInput[0], vUv ).xyz;
                vec3 velocity = texture2D( tInput[1], vUv ).xyz;
                vec4 links = texture2D( tInput[2], vUv );
                vec4 surfaceLinks[4] = vec4[4](
                    texture2D( tInput[3], vUv ),
                    texture2D( tInput[4], vUv ),
                    texture2D( tInput[5], vUv ),
                    texture2D( tInput[6], vUv )
                );

                if(position.y<-2.0){
                    position = (noise3(position)*2.0-1.0)*radius*32.0;
                    position.y = abs(position.y)*20.0+4.0;
                    velocity = vec3(0,0,0);
                    links = vec4(-1,-1,-1,-1);
                    surfaceLinks[0] = vec4(0,0,0,-1);
                    surfaceLinks[1] = vec4(0,0,0,-1);
                    surfaceLinks[2] = vec4(0,0,0,-1);
                    surfaceLinks[3] = vec4(0,0,0,-1);
                }

                gl_FragColor = vec4(position,1);
                outVelocity = vec4(velocity,1);
                outLink = links;
                outLink0 = surfaceLinks[0];
                outLink1 = surfaceLinks[1];
                outLink2 = surfaceLinks[2];
                outLink3 = surfaceLinks[3];
            }
            `,
            transparent: false,
            blending: NoBlending
        })
    }

}