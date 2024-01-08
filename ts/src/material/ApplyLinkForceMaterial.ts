import { AdditiveBlending, ShaderMaterial } from "three";

export class ApplyLinkForceMaterial extends ShaderMaterial {
    constructor(
        numBvh: number
    ){
        super({
            defines: {
                NUM_BVH: numBvh
            },
            uniforms: {
                tPosition: { value: null },
                tLink: { value: null },
                tLinks: { value: null },
                bvhMatrix: { value: new Array(numBvh)},
                formLinkDistance: { value: null },
                linkStrength: { value: null },
                stickyness: { value: null },
                radius: { value: null }
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
            uniform sampler2D tLinks[4];
            uniform mat4 bvhMatrix[NUM_BVH];
            uniform float formLinkDistance;
            uniform float linkStrength;
            uniform float stickyness;
            uniform float radius;

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

                vec4 surfaceLink;
                int index;
                vec3 wPos;
                vec3 v;
                float d;
                float str;
                #pragma unroll_loop_start 
                for ( int i = 0; i < 4; i ++ ) {
                    surfaceLink = texture2D( tLinks[ i ], vUv );
                    index = int(surfaceLink.w);
                    if( index>=0 ){
                        wPos = (bvhMatrix[index]*vec4(surfaceLink.xyz,1)).xyz;
                        v = positionA-wPos;
                        d = length( v );
                        v /= d;
                        str = (radius-d)*stickyness;
                        force += v*str;
                    }
                }
                #pragma unroll_loop_end

                gl_FragColor = vec4(force,1);
            }
            `,
            transparent: true,
            blending: AdditiveBlending
        })
    }
}