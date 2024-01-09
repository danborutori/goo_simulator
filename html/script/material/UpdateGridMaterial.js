import { NoBlending, ShaderMaterial } from "three";
export class UpdateGridMaterial extends ShaderMaterial {
    constructor() {
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

            attribute vec3 instanceId;

            varying vec3 vInstanceId;
            varying float vDiscard;

            void main(){
                vInstanceId = instanceId;

                vec3 pos = texture2D( tPosition, vInstanceId.yz ).xyz;

                vec3 gridPos = floor(pos/gridCellSize)+gridSize/2.0;
                float gridId = dot(gridPos,vec3(1,gridSize,gridSize*gridSize));                                
                vDiscard = (any(lessThan(gridPos,vec3(0,0,0))) || any(greaterThanEqual(gridPos,vec3(gridSize,gridSize,gridSize))))?1.0:0.0;

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
            varying vec3 vInstanceId;
            varying float vDiscard;

            void main(){
                if( vDiscard==1.0 ) discard;

                gl_FragColor = vec4(vInstanceId,1);
            }
            `,
            transparent: false,
            blending: NoBlending
        });
    }
}
