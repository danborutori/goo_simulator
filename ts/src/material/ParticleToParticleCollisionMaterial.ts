import { AdditiveBlending, ShaderMaterial } from "three";

export class ParticleToParticleCollisionMaterial extends ShaderMaterial {

    constructor(){
        super({
            uniforms: {
                tPosition: { value: null },
                tGrid: { value: null },
                gridSize: { value: 0 },
                gridCellSize: { value: 0 },
                radius: { value: 0 }
            },
            vertexShader: `
            varying vec2 vUv;

            void main(){
                vUv = uv;
                gl_Position = vec4(position,1);
            }
            `,
            fragmentShader: `
            uniform sampler2D tPosition;
            uniform sampler2D tGrid;
            uniform float gridSize;
            uniform float gridCellSize;
            uniform float radius;

            varying vec2 vUv;

            void main(){
                vec3 positionA = texture2D( tPosition, vUv ).xyz;
                vec2 tGridSize = vec2(textureSize( tGrid, 0 ));
                vec3 force = vec3(0,0,0);

                for( int z=-1; z<=1; z++ ){
                    for( int y=-1; y<=1; y++ ){
                        for( int x=-1; x<=1; x++ ){
                            vec3 gridPos = clamp(
                                floor(positionA/gridCellSize)+(gridSize/2.0)+vec3(x,y,z),
                                0.0,
                                gridSize-1.0
                            );
                            float gridId = dot(gridPos,vec3(1,gridSize,gridSize*gridSize));
                            vec2 gridUv = (vec2(
                                mod(gridId,tGridSize.x),
                                floor(gridId/tGridSize.x)
                            )+0.5)/tGridSize;

                            vec4 gridValue = texture2D( tGrid, gridUv );

                            if( gridValue.w!=0.0 ){
                                vec3 positionB = texture2D( tPosition, gridValue.xy ).xyz;

                                vec3 v = positionA-positionB;
                                float d = length( v );
                                if( d>0.0 && d<radius*2.0 ){
                                    force += v*(0.005/(d*d));
                                }
                            }                            
                        }
                    }    
                }

                gl_FragColor = vec4(force,1);
            }
            `,
            transparent: true,
            blending: AdditiveBlending
        })
    }

}