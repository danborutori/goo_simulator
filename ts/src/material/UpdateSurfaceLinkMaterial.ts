import { IUniform, NoBlending, ShaderMaterial } from "three";
import { shaderDistanceFunction, shaderIntersectFunction, shaderStructs } from "three-mesh-bvh";

export class UpdateSurfaceLinkMaterial extends ShaderMaterial {
    constructor(
        numBvh: number
    ){
        const uniforms: {[key:string]: IUniform} = {
            tPosition: { value: null },
            tLinks: { value: new Array(numBvh) },
            breakLinkDistance: { value: 0 },
            radius: { value: 0 },
            bvhMatrix: { value: new Array(numBvh) }
        }

        for( let i=0; i<numBvh; i++ ){
            uniforms[`bvh${i}`] = { value: null }
        }

        super({
            defines: {
                NUM_BVH: numBvh
            },
            uniforms: uniforms,
            vertexShader: `
            varying vec2 vUv;

            void main(){
                vUv = uv;
                gl_Position = vec4(position,1);
            }
            `,
            fragmentShader: `
            precision highp isampler2D;
			precision highp usampler2D;
            ${shaderStructs}
            ${shaderIntersectFunction}
            ${shaderDistanceFunction}

            layout(location = 1) out vec4 outLink1;
            layout(location = 2) out vec4 outLink2;
            layout(location = 3) out vec4 outLink3;

            uniform sampler2D tPosition;
            uniform sampler2D tLinks[4];
            uniform float breakLinkDistance;
            uniform float radius;
            ${
                (function(){
                    let s = ""
                    for( let i=0; i<numBvh; i++ ){
                        s += `uniform BVH bvh${i};`
                    }
                    return s
                })()
            }
            uniform mat4 bvhMatrix[NUM_BVH];

            varying vec2 vUv;

            void main(){
                vec3 position = texture2D( tPosition, vUv ).xyz;
                vec4 links[4] = vec4[4](
                    texture2D( tLinks[0], vUv ),
                    texture2D( tLinks[1], vUv ),
                    texture2D( tLinks[2], vUv ),
                    texture2D( tLinks[3], vUv )
                );
                vec4 outputLinks[4] = vec4[4](
                    vec4(0,0,0,-1),
                    vec4(0,0,0,-1),
                    vec4(0,0,0,-1),
                    vec4(0,0,0,-1)
                );
                int curLinkId = 0;

                // break link
                for( int i=0; i<4; i++ ){
                    int index = int(links[ i ].w);
                    if( index<0 ) continue;

                    vec3 wPos = (bvhMatrix[ index ] * vec4(links[ i ].xyz,1)).xyz;
                    float d = distance( position, wPos );
                    if( d <= breakLinkDistance ){
                        outputLinks[curLinkId++] = links[ i ];
                    }
                }

                mat4 bvhMatrixInv;
                vec3 localPosition;
                float scale;
                float localSpaceRadius;
                uvec4 faceIndices;
                vec3 faceNormal;
                vec3 barycoord;
                float side = 1.0;
                vec3 outPoint;
                float distance;
                #pragma unroll_loop_start 
                for ( int i = 0; i < ${numBvh}; i ++ ) {                    
                    bvhMatrixInv = inverse(bvhMatrix[ i ]);
                    localPosition = (bvhMatrixInv*vec4(position,1)).xyz;
                    scale = max(
                        length(bvhMatrixInv[0].xyz),
                        max(
                            length(bvhMatrixInv[1].xyz),
                            length(bvhMatrixInv[2].xyz)
                        )
                    );
                    localSpaceRadius = radius*scale;

                    distance = bvhClosestPointToPoint(
                        bvhUNROLLED_LOOP_INDEX, localPosition,
                        faceIndices, 
                        faceNormal, 
                        barycoord,
                        side,
                        outPoint
                    );
                    distance *= side;

                    if( distance<localSpaceRadius ){
                        outputLinks[curLinkId++] = vec4(
                            outPoint,
                            UNROLLED_LOOP_INDEX.0
                        );
                    }
                }
                #pragma unroll_loop_end

                gl_FragColor = outputLinks[0];
                outLink1 = outputLinks[1];
                outLink2 = outputLinks[2];
                outLink3 = outputLinks[3];
            }
            `,
            transparent: false,
            blending: NoBlending
        })
    }
}