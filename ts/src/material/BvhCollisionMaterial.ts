import { AdditiveBlending, ShaderMaterial } from "three";
import { shaderDistanceFunction, shaderIntersectFunction, shaderStructs } from "three-mesh-bvh";

export class BvhCollisionMaterial extends ShaderMaterial {

    constructor(){
        super({
            uniforms: {
                tPosition: { value: null },
                radius: { value: 0 },
                stiffness: { value: 0 },
                bvh: { value: null },
                bvhMatrix: { value: null }
            },
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
            uniform BVH bvh;
            uniform mat4 bvhMatrix;

            varying vec2 vUv;

            void main(){
                vec3 position = texture2D( tPosition, vUv ).xyz;
                vec3 force = vec3(0,0,0);
                
                mat4 bvhMatrixInv = inverse(bvhMatrix);
                vec3 localPosition = (bvhMatrixInv*vec4(position,1)).xyz;
                float scale = max(
                    length(bvhMatrixInv[0].xyz),
                    max(
                        length(bvhMatrixInv[1].xyz),
                        length(bvhMatrixInv[2].xyz)
                    )
                );
                float localSpaceRadius = radius*scale;

                uvec4 faceIndices;
                vec3 faceNormal;
                vec3 barycoord;
                float side = 1.0;
                vec3 outPoint;
                float distance = bvhClosestPointToPoint(
                    bvh, localPosition,
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
                    vec3 wPoint = (bvhMatrix*vec4(outPoint,1)).xyz;
                    vec3 v = normalize(position-wPoint);
                    force += v*d*stiffness*10.0;
                }

                gl_FragColor = vec4(force,1);
            }
            `,
            transparent: true,
            blending: AdditiveBlending
        })
    }

}