import { NoBlending, ShaderMaterial, Vector3 } from "three";
import { shaderDistanceFunction, shaderIntersectFunction, shaderStructs } from "three-mesh-bvh";
export class UpdateMaterial extends ShaderMaterial {
    constructor(numBvh) {
        const uniforms = {
            deltaTime: { value: 0 },
            tInput: { value: [] },
            radius: { value: 0 },
            formLinkDistance: { value: 0 },
            breakLinkDistance: { value: 0 },
            linkStrength: { value: null },
            stickyness: { value: null },
            stiffness: { value: null },
            particleMass: { value: 1 },
            gravity: { value: new Vector3 },
            dampingFactor: { value: 0 },
            tGrid: { value: null },
            gridSize: { value: 0 },
            gridCellSize: { value: 0 },
            bvhMatrix: { value: new Array(numBvh) }
        };
        for (let i = 0; i < numBvh; i++) {
            uniforms[`bvh${i}`] = { value: null };
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

            layout(location = 1) out vec4 outVelocity;
            layout(location = 2) out vec4 outLink;
            layout(location = 3) out vec4 outLink0;
            layout(location = 4) out vec4 outLink1;
            layout(location = 5) out vec4 outLink2;
            layout(location = 6) out vec4 outLink3;

            ${shaderStructs}
            ${shaderIntersectFunction}
            ${shaderDistanceFunction}

            uniform float deltaTime;
            uniform sampler2D tInput[7];
            #define tPosition tInput[0]
            #define tVelocity tInput[1]
            #define tLink tInput[2]

            uniform float radius;
            uniform float formLinkDistance;
            uniform float breakLinkDistance;
            uniform float linkStrength;
            uniform float stickyness;
            uniform float stiffness;
            uniform float particleMass;
            uniform vec3 gravity;
            uniform float dampingFactor;
            uniform sampler2D tGrid;
            uniform float gridSize;
            uniform float gridCellSize;
            ${(function () {
                let s = "";
                for (let i = 0; i < numBvh; i++) {
                    s += `uniform BVH bvh${i};`;
                }
                return s;
            })()}
            uniform mat4 bvhMatrix[NUM_BVH];

            varying vec2 vUv;

            int imod( int a, int b ){
                return a-(a/b)*b;
            }

            void main() {

                vec3 force = vec3(0,0,0);
                vec3 velocity = texture2D( tVelocity, vUv ).xyz;

                // update link
                vec2 tPositionSize = vec2(textureSize(tPosition,0));
                vec2 tGridSize = vec2(textureSize(tGrid,0));
                vec3 positionA = texture2D( tPosition, vUv ).xyz;
                vec4 prevLinks = texture2D( tLink, vUv );
                vec4 links[4] = vec4[4](
                    texture2D( tInput[3], vUv ),
                    texture2D( tInput[4], vUv ),
                    texture2D( tInput[5], vUv ),
                    texture2D( tInput[6], vUv )
                );

                int curLinkId = 0;
                vec4 curLinks = vec4(-1,-1,-1,-1);
                vec4 outputLinks[4] = vec4[4](
                    vec4(0,0,0,-1),
                    vec4(0,0,0,-1),
                    vec4(0,0,0,-1),
                    vec4(0,0,0,-1)
                );

                // keep unbroken link
                float id;
                vec2 uv;
                vec3 positionB;
                float d;
                #pragma unroll_loop_start 
                for ( int i = 0; i < 4; i ++ ) {
                    id = prevLinks[ i ];
                    if( id>=0.0 ){
                        uv = (vec2(
                            mod(id,tPositionSize.x),
                            floor(id/tPositionSize.x)
                        )+0.5)/tPositionSize;
                        
                        positionB = texture2D( tPosition, uv ).xyz;

                        d = distance(positionA,positionB);

                        if( d!=0.0 && d<breakLinkDistance ){
                            curLinks[curLinkId++] = id;
                        }
                    }
                }
                #pragma unroll_loop_end

                // collide particle 
                int x, y, z;
                vec3 gridPos;
                float gridId;
                vec2 gridUv;
                vec4 gridValue;
                #pragma unroll_loop_start 
                for ( int i = 0; i < 27; i ++ ) {
                    x = imod(UNROLLED_LOOP_INDEX,3)-1;
                    y = imod(UNROLLED_LOOP_INDEX/3,3)-1;
                    z = UNROLLED_LOOP_INDEX/9-1;
                
                    gridPos = clamp(
                        floor(positionA/gridCellSize)+(gridSize/2.0)+vec3(x,y,z),
                        0.0,
                        gridSize-1.0
                    );
                    gridId = dot(gridPos,vec3(1,gridSize,gridSize*gridSize));
                    gridUv = (vec2(
                        mod(gridId,tGridSize.x),
                        floor(gridId/tGridSize.x)
                    )+0.5)/tGridSize;

                    gridValue = texture2D( tGrid, gridUv );

                    if( gridValue.w!=0.0 ){
                        vec3 positionB = texture2D( tPosition, gridValue.yz ).xyz;

                        vec3 v = positionA-positionB;
                        float d = length( v );
                        if( d>0.0 && d<=formLinkDistance && curLinkId<4 ){
                            // form new link
                            curLinks[curLinkId++] = gridValue.x;
                        }

                        if( d>0.0 && d<radius*2.0 ){
                            force += v*(0.005/(d*d));
                        }
                    }                            
                }
                #pragma unroll_loop_end

                // update surface link
                curLinkId = 0;

                // break link
                int index;
                #pragma unroll_loop_start 
                for ( int i = 0; i < 4; i ++ ) {
                    index = int(links[ i ].w);
                    if( index>=0 ){
                        vec3 wPos = (bvhMatrix[ index ] * vec4(links[ i ].xyz,1)).xyz;
                        float d = distance( positionA, wPos );
                        if( d <= breakLinkDistance ){
                            outputLinks[curLinkId++] = links[ i ];
                        }
                    }
                }
                #pragma unroll_loop_end

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
                    localPosition = (bvhMatrixInv*vec4(positionA,1)).xyz;
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

                    if( abs(distance)<localSpaceRadius && distance<localSpaceRadius ){
                        if( curLinkId<4 ){
                            outputLinks[curLinkId++] = vec4(
                                outPoint,
                                UNROLLED_LOOP_INDEX.0
                            );
                        }

                        // transform to world space
                        distance /= scale;
                        float d = radius-distance;
                        vec3 wPoint = (bvhMatrix[ i ]*vec4(outPoint,1)).xyz;
                        vec3 v = normalize(positionA-wPoint);
                        force += v*d*stiffness;
                    }
                }
                #pragma unroll_loop_end

                // apply link force
                vec3 v;
                float str;
                #pragma unroll_loop_start 
                for ( int i = 0; i < 4; i ++ ) {
                    id = curLinks[ i ];
                    if( id>=0.0 ){
                        uv = (vec2(
                            mod(id,tPositionSize.x),
                            floor(id/tPositionSize.x)
                        )+0.5)/tPositionSize;

                        positionB = texture2D( tPosition, uv ).xyz;

                        v = positionA-positionB;
                        
                        d = length( v );
                        if( d!=0.0 ){
                            v /= d;
                            str = (formLinkDistance-d)*linkStrength;
                
                            force += v*str;
                        }
                    }
                }
                #pragma unroll_loop_end

                vec4 surfaceLink;
                vec3 wPos;                
                #pragma unroll_loop_start 
                for ( int i = 0; i < 4; i ++ ) {
                    surfaceLink = outputLinks[ i ];
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

                // apply gravity and damping
                force += gravity*particleMass;
                force -= velocity*dampingFactor;

                // update velocity 
                velocity += force*deltaTime/particleMass;

                // update position
                positionA += velocity*deltaTime;

                // output
                gl_FragColor = vec4(positionA,1);
                outVelocity = vec4(velocity,1);
                outLink = curLinks;
                outLink0 = outputLinks[0];
                outLink1 = outputLinks[1];
                outLink2 = outputLinks[2];
                outLink3 = outputLinks[3];
            }
            `,
            transparent: false,
            blending: NoBlending
        });
    }
}