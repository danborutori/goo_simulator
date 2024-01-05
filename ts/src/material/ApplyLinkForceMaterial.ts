import { AdditiveBlending, ShaderMaterial } from "three";

export class ApplyLinkForceMaterial extends ShaderMaterial {
    constructor(){
        super({
            uniforms: {
                tPosition: { value: null },
                tLink: { value: null },
                formLinkDistance: { value: null },
                linkStrength: { value: null }
            },
            vertexShader: `
            varying vec2 vUv;

            void main(){
                vUv = uv;
                gl_Position = vec4(position,1);
            }
            `,
            fragmentShader: `
            uniform sampler2D tPosition;
            uniform sampler2D tLink;
            uniform float formLinkDistance;
            uniform float linkStrength;

            varying vec2 vUv;

            void main(){
                vec2 tPositionSize = vec2(textureSize(tPosition,0));

                vec3 force = vec3(0,0,0);

                vec3 positionA = texture2D( tPosition, vUv ).xyz;

                vec4 link = texture2D( tLink, vUv);

                for( int i=0; i<4; i++ ){
                    float id = link[i];
                    if( id>=0.0 ){
                        vec2 uv = (vec2(
                            mod(id,tPositionSize.x),
                            floor(id/tPositionSize.x)
                        )+0.5)/tPositionSize;

                        vec3 positionB = texture2D( tPosition, uv ).xyz;

                        vec3 v = positionA-positionB;
                        
                        float d = length( v );
                        if( d!=0.0 ){
                            v /= d;
                            float str = (formLinkDistance-d)*linkStrength;
                
                            force += v*str;
                        }
                    }
                }

                gl_FragColor = vec4(force,1);
            }
            `,
            transparent: true,
            blending: AdditiveBlending
        })
    }
}