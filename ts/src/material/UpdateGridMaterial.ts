import { NoBlending, ShaderMaterial } from "three";

export class UpdateGridMaterial extends ShaderMaterial {

    constructor(){
        super({
            uniforms: {
                tPosition: { value: null },
                gridSize: { value: 0 },
                gridCellSize: { value: 0 },
                gridTextureSize: { value: 0 }
            },
            vertexShader: `

            uniform sampler2D tPosition;
            uniform float gridSize;
            uniform float gridCellSize;
            uniform float gridTextureSize;

            varying vec2 vParticleUv;

            void main(){
                vec2 tPositionSize = vec2(textureSize(tPosition,0));
                float instanceId = float(gl_InstanceID);
                vParticleUv = (vec2(
                    mod(instanceId,tPositionSize.x),
                    floor(instanceId/tPositionSize.x)
                )+0.5)/tPositionSize;

                vec3 position = texture2D( tPosition, uv ).xyz;

                vec3 gridPos = clamp(
                    (floor(position/gridCellSize))+floor(gridSize/2.0),
                    0.0,
                    gridSize-1.0
                );
                float gridId = gridPos.x+(gridPos.y+gridPos.z*gridSize)*gridSize;
                                
                gl_Position = vec4(
                    (vec2(
                        mod(gridId,gridTextureSize),
                        floor(gridId/gridTextureSize)
                    )+0.5)/gridTextureSize*2.0-1.0,
                    0,1
                );
                gl_PointSize = 1.0;
            }
            `,
            fragmentShader: `
            varying vec2 vParticleUv;

            void main(){
                gl_FragColor = vec4(vParticleUv,0,1);
            }
            `,
            transparent: false,
            blending: NoBlending
        })
    }
}