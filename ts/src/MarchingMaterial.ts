import { Texture, FrontSide, Matrix4, ShaderMaterial, Vector2 } from "three";

export class MarchingMaterial extends ShaderMaterial {
    constructor(
        sdfTexture: Texture
    ){
        super({
            defines: {
                MARCHING_STEP: 32
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

                    float d = -100.0;

                    for( int i=0; i<MARCHING_STEP; i++ ){
                        vec4 sPos = vec4( gl_FragCoord.xy/resolution*2.0-1.0,-1.0+float(i)/float(MARCHING_STEP)*2.0,1 );
                        vec4 wPos = screenToWorldMatrix*sPos;
                        wPos /= wPos.w;
                        vec3 gridPos = clamp(
                            floor(wPos.xyz/gridCellSize+gridSize/2.0),
                            0.0,
                            gridSize-1.0
                        );
                        float gridId = gridPos.x+(gridPos.y+gridPos.z*gridSize)*gridSize;
                        vec2 gridTextureSize = vec2(textureSize(tSDF,0));
                        vec2 uv = vec2(
                            mod( gridId, gridTextureSize.x ),
                            floor(gridId/gridTextureSize.y)
                        )/gridTextureSize;
        
                        d = max( d, texture2D(tSDF, uv).r );
                    }

                    
                    gl_FragColor = vec4(1,1,1,d);

                }
            `,
            transparent: true,
            side: FrontSide
        })
    }
}