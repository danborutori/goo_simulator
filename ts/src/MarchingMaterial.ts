import { Texture, FrontSide, Matrix4, ShaderMaterial, Vector2 } from "three";

export class MarchingMaterial extends ShaderMaterial {
    constructor(
        sdfTexture: Texture
    ){
        super({
            defines: {
                MARCHING_STEP: 64
            },
            uniforms: {
                resolution: { value: new Vector2 },
                screenToWorldMatrix: { value: new Matrix4 },
                gridSize: { value: 0 },
                gridCellSize: { value: 0 },
                tSDF: { value: sdfTexture }
            },
            vertexShader: `
                void main(){
                    gl_Position = vec4(position,1);
                }
            `,
            fragmentShader: `            
                #include <common>

                uniform vec2 resolution;
                uniform mat4 screenToWorldMatrix;
                uniform sampler2D tSDF;
                uniform float gridSize;
                uniform float gridCellSize;

                void main(){

                    float d = 100.0;

                    for( int i=0; i<MARCHING_STEP; i++ ){
                        vec4 sPos = vec4( gl_FragCoord.xy/resolution*2.0-1.0,-1.0+float(i)/float(MARCHING_STEP)*2.0,1 );
                        vec4 wPos = screenToWorldMatrix*sPos;
                        wPos /= wPos.w;
                        vec3 gridPos = wPos.xyz/gridCellSize+gridSize/2.0;

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

                        d = min(d,distance);
                    }

                    d *= 5.0;
                    
                    gl_FragColor = vec4(1,1,1,d);

                }
            `,
            transparent: true,
            side: FrontSide,
            depthTest: false,
            depthWrite: false
        })
    }
}