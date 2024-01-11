import { Texture, FrontSide, Vector2, Material, MeshDepthMaterial, MeshPhysicalMaterial } from "three";
import { deviceSetting, gooColor } from "../deviceSetting.js";
import { ditherShaderFunction } from "./dither.js";

function modify( material: Material, uniforms: {
        resolution: { value: Vector2 }
        gridSize: { value: number }
        gridCellSize: { value: number }
    },
    sdfTexture: Texture,
    marchingStep: number
){
    const defines = material.defines || (material.defines = {})
    defines.MARCHING_MATERIAL = "1"
    defines.MARCHING_STEP = marchingStep

    material.onBeforeCompile = shader=>{

        Object.assign(shader.uniforms, uniforms)
        shader.uniforms.tSDF = { value: sdfTexture }

        shader.vertexShader = shader.vertexShader.replace(
            "#include <project_vertex>",
            `
            #include <project_vertex>

            gl_Position = vec4(position,1);
            `
        )
        shader.fragmentShader = `
            uniform vec2 resolution;
            uniform sampler2D tSDF;
            uniform float gridSize;
            uniform float gridCellSize;
            #ifndef USE_TRANSMISSION
            uniform mat4 projectionMatrix;
            #endif

            ${ditherShaderFunction}

            float sampleDistance( vec3 wPos ){
                vec3 gridPos = wPos/gridCellSize+gridSize/2.0;

                vec3 gridPosAligned[8] = vec3[](
                    vec3(ceil(gridPos.x),ceil(gridPos.y),ceil(gridPos.z)),
                    vec3(ceil(gridPos.x),ceil(gridPos.y),floor(gridPos.z)),
                    vec3(ceil(gridPos.x),floor(gridPos.y),ceil(gridPos.z)),
                    vec3(ceil(gridPos.x),floor(gridPos.y),floor(gridPos.z)),
                    vec3(floor(gridPos.x),ceil(gridPos.y),ceil(gridPos.z)),
                    vec3(floor(gridPos.x),ceil(gridPos.y),floor(gridPos.z)),
                    vec3(floor(gridPos.x),floor(gridPos.y),ceil(gridPos.z)),
                    vec3(floor(gridPos.x),floor(gridPos.y),floor(gridPos.z))
                );
                float distances[8];

                vec3 gridPosClamped;
                float gridId;
                vec2 gridTextureSize = vec2(textureSize(tSDF,0));
                vec2 uv;
                #pragma unroll_loop_start 
                for ( int i = 0; i < 8; i ++ ) {
                    gridPosClamped = clamp(
                        gridPosAligned[ i ],
                        0.0,
                        gridSize-1.0
                    );
                    gridId = gridPosClamped.x+(gridPosClamped.y+gridPosClamped.z*gridSize)*gridSize;
                    uv = (vec2(
                        mod( gridId, gridTextureSize.x ),
                        floor(gridId/gridTextureSize.x)
                    )+0.5)/gridTextureSize;

                    distances[ i ] = texture2D(tSDF, uv).r;            
                }
                #pragma unroll_loop_end
                vec3 blend = 1.0-(gridPos-gridPosAligned[7]);
                float distance = mix(
                    mix(
                        mix(
                            distances[0],
                            distances[4],
                            blend.x
                        ),
                        mix(
                            distances[2],
                            distances[6],
                            blend.x
                        ),
                        blend.y
                    ),
                    mix(
                        mix(
                            distances[1],
                            distances[5],
                            blend.x
                        ),
                        mix(
                            distances[3],
                            distances[7],
                            blend.x
                        ),
                        blend.y
                    ),
                    blend.z
                );

                return distance;
            }

            int imod( int a, int b ){
                return a-(a/b)*b;
            }

            #if NUM_SPOT_LIGHT_COORDS > 0

                uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];

            #endif

        `+shader.fragmentShader.replace(
            "void main() {",
            `
            void main() {

            mat4 cameraProjectionMatrixInverse = inverse(projectionMatrix);
            mat4 cameraWorldMatrix = inverse(viewMatrix);
            vec4 vPos = cameraProjectionMatrixInverse*vec4( gl_FragCoord.xy/resolution*2.0-1.0,0,1 );
            vPos /= vPos.w;
            vec3 vDir = normalize(vPos.xyz);

            bool hit = false;
            float near = -projectionMatrix[3][2] / (projectionMatrix[2][2] - 1.0);
            float far = -projectionMatrix[3][2] / (projectionMatrix[2][2] + 1.0);
            vec3 step = vDir*(far-near)/vDir.z/float(MARCHING_STEP);
            vec3 startVPos = vec3(0,0,0)+vDir*(near/vDir.z)+step*getDither();
            vec3 endVPos = vec3(0,0,0)+vDir*(far/vDir.z);
            vec3 curVPos = startVPos;
            float curDistance;

            vec4 wPos;
            float distance;
            #pragma unroll_loop_start
            for( int i=0; i<${marchingStep}; i++ ){
                wPos = cameraWorldMatrix*vec4(curVPos,1);
                distance = sampleDistance(wPos.xyz);
                curDistance = distance;

                if( sign(distance)*pow(abs(distance),0.125)<=0.613237564 ){
                    endVPos = curVPos;
                    curVPos = (startVPos+endVPos)*0.5;
                    hit = true;
                }else{
                    startVPos = curVPos;
                    if( !hit ){
                        curVPos += step;
                    }else{
                        curVPos = (startVPos+endVPos)*0.5;
                    }
                }
            }
            #pragma unroll_loop_end

            vec4 finalSPos = projectionMatrix*vec4(curVPos,1);
            finalSPos /= finalSPos.w;

            if( !hit ) discard;
            
            gl_FragDepth = finalSPos.z*0.5+0.5;
            vec3 vViewPosition = -curVPos;
            vec3 vWorldPosition = wPos.xyz;
            
            `
        ).replace(
            "#include <clearcoat_normal_fragment_maps>",
            `
            #include <clearcoat_normal_fragment_maps>

            vec3 curWPos = (cameraWorldMatrix*vec4(curVPos,1)).xyz;
            normal = vec3(0,0,0);
            int x, y, z;
            vec3 dir;
            #pragma unroll_loop_start 
            for ( int i = 0; i < 27; i ++ ) {
                x = imod(UNROLLED_LOOP_INDEX,3)-1;
                y = imod(UNROLLED_LOOP_INDEX/3,3)-1;
                z = UNROLLED_LOOP_INDEX/9-1;
            
                dir = vec3( x, y, z );
                distance = sampleDistance(curWPos+dir*gridCellSize);
                normal += dir*(distance-curDistance);            
            }
            #pragma unroll_loop_end

            normal = normalize((viewMatrix*vec4(normal,0)).xyz);
            `
        ).replace(
            "float fragCoordZ = 0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5;",
            `
            float shadowBias = 0.01;
            float fragCoordZ = (finalSPos.z+shadowBias)*0.5+0.5;
            `
        ).replace(
            "#include <lights_fragment_begin>",
            `
            #ifdef USE_SHADOWMAP
            #if NUM_SPOT_LIGHT_COORDS > 0
            vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];

            for( int i=0; i<NUM_SPOT_LIGHT_COORDS; i++ ){
                vSpotLightCoord[ i ] = spotLightMatrix[ i ]*vec4(curWPos,1);
            }
            #endif
            #endif

            #include <lights_fragment_begin>
            `
        )
    }
}

export class MarchingMaterial extends MeshPhysicalMaterial {
    readonly uniforms = {
        resolution: { value: new Vector2 },
        gridSize: { value: 0 },
        gridCellSize: { value: 0 }
    }

    constructor(
        sdfTexture: Texture
    ){
        super({
            color: gooColor,
            roughness: 0.1,
            transmission: 0.5,
            depthTest: true,
            depthWrite: true,
            side: FrontSide,
            shadowSide: FrontSide
        })

        modify( this, this.uniforms, sdfTexture, deviceSetting.rayMarchingStep )
    }
}

export class MarchingDepthMaterial extends MeshDepthMaterial {
    readonly uniforms = {
        resolution: { value: new Vector2 },
        gridSize: { value: 0 },
        gridCellSize: { value: 0 }
    }

    constructor(
        sdfTexture: Texture
    ){
        super({
            depthTest: true,
            depthWrite: true
        })

        modify( this, this.uniforms, sdfTexture, deviceSetting.shadowRayMarchingStep )
    }
}