import { Texture, FrontSide, Vector2, Material, MeshDepthMaterial, MeshPhysicalMaterial } from "three";

function modify( material: Material, uniforms: {
        resolution: { value: Vector2 }
        gridSize: { value: number }
        gridCellSize: { value: number }
    },
    sdfTexture: Texture
){
    const defines = material.defines || (material.defines = {})
    defines.MARCHING_MATERIAL = "1"
    defines.MARCHING_STEP = 100

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

            const float ditherMatrix16x16[256] = float[](
                0.0,128.0,32.0,160.0,8.0,136.0,40.0,168.0,2.0,130.0,34.0,162.0,10.0,138.0,42.0,170.0,
                192.0,64.0,224.0,96.0,200.0,72.0,232.0,104.0,194.0,66.0,226.0,98.0,202.0,74.0,234.0,106.0,
                48.0,176.0,16.0,144.0,56.0,184.0,24.0,152.0,50.0,178.0,18.0,146.0,58.0,186.0,26.0,154.0,
                240.0,112.0,208.0,80.0,232.0,120.0,216.0,88.0,242.0,114.0,210.0,82.0,234.0,122.0,218.0,90.0,
                12.0,140.0,44.0,172.0,4.0,132.0,36.0,164.0,14.0,142.0,46.0,174.0,6.0,134.0,38.0,166.0,
                204.0,76.0,236.0,108.0,196.0,68.0,228.0,100.0,206.0,78.0,238.0,110.0,198.0,70.0,230.0,102.0,
                60.0,188.0,28.0,156.0,52.0,180.0,20.0,148.0,62.0,190.0,30.0,158.0,54.0,182.0,22.0,150.0,
                252.0,124.0,220.0,92.0,248.0,116.0,214.0,86.0,254.0,126.0,222.0,94.0,250.0,118.0,216.0,88.0,
                3.0,131.0,35.0,163.0,11.0,139.0,43.0,171.0,1.0,129.0,33.0,161.0,9.0,137.0,41.0,169.0,
                195.0,67.0,227.0,99.0,203.0,75.0,235.0,107.0,193.0,65.0,225.0,97.0,201.0,73.0,233.0,105.0,
                51.0,179.0,19.0,147.0,59.0,187.0,27.0,155.0,49.0,177.0,17.0,145.0,57.0,185.0,25.0,153.0,
                243.0,115.0,211.0,83.0,235.0,123.0,219.0,91.0,241.0,113.0,209.0,81.0,233.0,121.0,217.0,89.0,
                15.0,143.0,47.0,175.0,7.0,135.0,39.0,167.0,13.0,141.0,45.0,173.0,5.0,133.0,37.0,165.0,
                207.0,79.0,239.0,111.0,199.0,71.0,231.0,103.0,205.0,77.0,237.0,109.0,197.0,69.0,229.0,101.0,
                63.0,191.0,31.0,159.0,55.0,183.0,23.0,151.0,61.0,189.0,29.0,157.0,53.0,181.0,21.0,149.0,
                255.0,127.0,223.0,95.0,251.0,119.0,215.0,87.0,253.0,125.0,221.0,93.0,249.0,117.0,213.0,85.0
            );
            float getDither(){
                vec2 v = mod(floor(gl_FragCoord.xy),16.0);
                return ditherMatrix16x16[int(v.x+v.y*16.0)]/255.0;
            }

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

                vec3 gridPosClamped;
                float gridId;
                vec2 gridTextureSize;
                vec2 uv;
                #pragma unroll_loop_start 
                for ( int i = 0; i < 8; i ++ ) {
                    gridPosClamped = clamp(
                        gridPosAligned[ i ],
                        0.0,
                        gridSize-1.0
                    );
                    gridId = gridPosClamped.x+(gridPosClamped.y+gridPosClamped.z*gridSize)*gridSize;
                    gridTextureSize = vec2(textureSize(tSDF,0));
                    uv = vec2(
                        mod( gridId, gridTextureSize.x ),
                        floor(gridId/gridTextureSize.y)
                    )/gridTextureSize;

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
            for( int i=0; i<MARCHING_STEP; i++ ){
                wPos = cameraWorldMatrix*vec4(curVPos,1);
                float distance = sampleDepth(wPos.xyz);
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
            float distance;
            #pragma unroll_loop_start 
            for ( int i = 0; i < 27; i ++ ) {
                x = imod(UNROLLED_LOOP_INDEX,3)-1;
                y = imod(UNROLLED_LOOP_INDEX/3,3)-1;
                z = UNROLLED_LOOP_INDEX/9-1;
            
                dir = vec3( x, y, z );
                distance = sampleDepth(curWPos+dir*gridCellSize);
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
            color: 0x00FF00,
            roughness: 0.1,
            transmission: 0.5,
            depthTest: true,
            depthWrite: true,
            side: FrontSide,
            shadowSide: FrontSide
        })

        modify( this, this.uniforms, sdfTexture )
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

        modify( this, this.uniforms, sdfTexture )
    }
}