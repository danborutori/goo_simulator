import { Texture, FrontSide, Matrix4, Vector2, MeshStandardMaterial } from "three";

export class MarchingMaterial extends MeshStandardMaterial {
    readonly uniforms = {
        resolution: { value: new Vector2 },
        cameraProjectionMatrixInverse: { value: new Matrix4 },
        cameraWorldMatrix: { value: new Matrix4 },
        gridSize: { value: 0 },
        gridCellSize: { value: 0 }
    }

    constructor(
        sdfTexture: Texture
    ){
        super({
            roughness: 0,
            depthTest: true,
            depthWrite: true,
            side: FrontSide
        })

        const defines = this.defines || (this.defines = {})
        defines.MARCHING_STEP = 128

        this.onBeforeCompile = shader=>{

            Object.assign(shader.uniforms, this.uniforms)
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
                uniform mat4 cameraProjectionMatrixInverse;
                uniform mat4 cameraWorldMatrix;
                uniform mat4 projectionMatrix;


                float sampleDepth( vec3 wPos ){
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

                    for( int j=0; j<8; j++ ){
                        vec3 gridPosClamped = clamp(
                            gridPosAligned[j],
                            0.0,
                            gridSize-1.0
                        );
                        float gridId = gridPosClamped.x+(gridPosClamped.y+gridPosClamped.z*gridSize)*gridSize;
                        vec2 gridTextureSize = vec2(textureSize(tSDF,0));
                        vec2 uv = vec2(
                            mod( gridId, gridTextureSize.x ),
                            floor(gridId/gridTextureSize.y)
                        )/gridTextureSize;

                        distances[j] = texture2D(tSDF, uv).r;            
                    }
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

            `+shader.fragmentShader.replace(
                "void main() {",
                `
                void main() {

                vec4 vPos = cameraProjectionMatrixInverse*vec4( gl_FragCoord.xy/resolution*2.0-1.0,0,1 );
                vPos /= vPos.w;
                vec3 vDir = normalize(vPos.xyz);

                bool hit = false;
                float near = -projectionMatrix[3][2] / (projectionMatrix[2][2] - 1.0);
                vec3 curVPos = vec3(0,0,0)+vDir*(near/vDir.z);
                float curDistance;

                for( int i=0; i<MARCHING_STEP; i++ ){
                    vec4 wPos = cameraWorldMatrix*vec4(curVPos,1);
                    float distance = sampleDepth(wPos.xyz);
                    curDistance = distance;
                    curVPos += vDir*distance;

                    if( pow(distance,0.125)<=0.61323756351 ){
                        hit = true;
                        break;
                    }
                }

                vec4 finalSPos = projectionMatrix*vec4(curVPos,1);
                finalSPos /= finalSPos.w;

                if( !hit ) discard;
                
                gl_FragDepth = finalSPos.z*0.5+0.5;
                
                `
            ).replace(
                "#include <clearcoat_normal_fragment_maps>",
                `
                #include <clearcoat_normal_fragment_maps>

                vec3 curWPos = (cameraWorldMatrix*vec4(curVPos,1)).xyz;
                normal = vec3(0,0,0);
                for( int z=-1; z<=1; z++ ){
                    for( int y=-1; y<=1; y++ ){
                        for( int x=-1; x<=1; x++ ){
                            vec3 dir = vec3( x, y, z );
                            float distance = sampleDepth(curWPos+dir*gridCellSize);
                            normal += dir*(distance-curDistance);
                        }
                    }    
                }

                normal = normalize((viewMatrix*vec4(normal,0)).xyz);
                `
            )
        }
    }
}