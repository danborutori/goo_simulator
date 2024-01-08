import { AdditiveBlending, IUniform, ShaderMaterial } from "three";
import { shaderDistanceFunction, shaderIntersectFunction, shaderStructs } from "three-mesh-bvh";

export class BvhCollisionMaterial extends ShaderMaterial {

    constructor(
        numBvh: number
    ){

        const uniforms: {[key:string]: IUniform} = {
            tPosition: { value: null },
            radius: { value: 0 },
            stiffness: { value: 0 },
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

            uniform sampler2D tPosition;
            uniform float radius;   
            uniform float stiffness;
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
                vec3 force = vec3(0,0,0);

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
                        // transform to world space
                        distance /= scale;
                        float d = radius-distance;
                        vec3 wPoint = (bvhMatrix[ i ]*vec4(outPoint,1)).xyz;
                        vec3 v = normalize(position-wPoint);
                        force += v*d*stiffness;
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