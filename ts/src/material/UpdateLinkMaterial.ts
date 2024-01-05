import { NoBlending, ShaderMaterial } from "three";

export class UpdateLinkMaterial extends ShaderMaterial {

    constructor(){

        super({
            uniforms: {
                tLink: { value: null },
                tPosition: { value: null },
                formLinkDistance: { value: 0 },
                breakLinkDistance: { value: 0 },
                tGrid: { value: null },
                gridSize: { value: 0 },
                gridCellSize: { value: 0 },
            },
            vertexShader: `
            varying vec2 vUv;

            void main(){
                vUv = uv;
                gl_Position = vec4(position,1);
            }
            `,
            fragmentShader: `
            uniform sampler2D tLink;
            uniform sampler2D tPosition;
            uniform float formLinkDistance;
            uniform float breakLinkDistance;
            uniform sampler2D tGrid;
            uniform float gridSize;
            uniform float gridCellSize;

            varying vec2 vUv;

            void main() {
                vec2 tPositionSize = vec2(textureSize(tPosition,0));
                vec2 tGridSize = vec2(textureSize(tGrid,0));
                vec3 positionA = texture2D( tPosition, vUv ).xyz;
                vec4 prevLinks = texture2D( tLink, vUv );

                int curLinkId = 0;
                vec4 curLinks = vec4(-1,-1,-1,-1);

                // keep unbroken link
                for( int i=0; i<4; i++ ){
                    float id = prevLinks[i];
                    if( id<0.0 ) continue;
                    vec2 uv = (vec2(
                        mod(id,tPositionSize.x),
                        floor(id/tPositionSize.x)
                    )+0.5)/tPositionSize;
                    
                    vec3 positionB = texture2D( tPosition, uv ).xyz;

                    float d = distance(positionA,positionB);

                    if( d!=0.0 && d<breakLinkDistance ){
                        curLinks[curLinkId++] = id;
                    }
                }

                // form new link
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
                                vec3 positionB = texture2D( tPosition, gridValue.yz ).xyz;

                                float d = distance(positionA,positionB);
                                if( d<=formLinkDistance && curLinkId<4 ){
                                    curLinks[curLinkId++] = gridValue.x;
                                }
                            }                            
                        }
                    }    
                }

                gl_FragColor = curLinks;
            }
            `,
            transparent: false,
            blending: NoBlending
        })

    }

}