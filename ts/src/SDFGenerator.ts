import { BufferAttribute, BufferGeometry, Color, CustomBlending, InstancedBufferAttribute, InstancedMesh, Mesh, MinEquation, OneFactor, PerspectiveCamera, Scene, ShaderMaterial, Texture, Vector2, WebGLRenderTarget, WebGLRenderer } from "three";

const v_2 = new Vector2
const c1 = new Color

const _c1 = new Color

class SphereSDFMaterial extends ShaderMaterial {
    constructor(){
        super({
            uniforms: {     
                tPosition: { value: null },       
                radius: { value: 1 },
                gridSize: { value: 1 },
                gridCellSize: { value: 1 },
                rendertargetSize: { value: 1 },
                maxDistance: { value: 1 }
            },
            vertexShader: `
            uniform sampler2D tPosition;
            uniform float radius;
            uniform float gridSize;
            uniform float gridCellSize;
            uniform float rendertargetSize;
            uniform float maxDistance;

            attribute vec2 instanceId;

            varying float vDistance;

            void main(){
                mat4 instanceMatrix = mat4(
                    gridCellSize,0,0,0,
                    0,gridCellSize,0,0,
                    0,0,gridCellSize,0,
                    texture2D(tPosition,instanceId).xyz,1                
                );

                vec4 origin = instanceMatrix*vec4(0,0,0,1);
                vec4 wPos = instanceMatrix*vec4(position,1);

                vec3 gridPos = clamp(
                    floor(wPos.xyz/gridCellSize+gridSize/2.0),
                    0.0,
                    gridSize-1.0
                );
                vec3 gridWPos = (gridPos-gridSize/2.0)*gridCellSize;
                vDistance = min(maxDistance,distance(gridWPos,origin.xyz)-radius);
                
                float gridId = gridPos.x+(gridPos.y+gridPos.z*gridSize)*gridSize;
                gl_Position = vec4(
                    (vec2(
                        mod(gridId,rendertargetSize),
                        floor(gridId/rendertargetSize)
                    )+0.5)/rendertargetSize*2.0-1.0,
                    0,1
                );
                gl_PointSize = 1.0;
            }
            `,
            fragmentShader: `
            varying float vDistance;

            void main(){
                gl_FragColor = vec4(vDistance,0,0,1);
            }
            `,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            blending: CustomBlending,
            blendSrc: OneFactor,
            blendDst: OneFactor,
            blendEquation: MinEquation
        })
    }
}

class LineSegmentSDFMaterial extends ShaderMaterial {
    constructor(
        numBvh: number
    ){
        super({
            defines: {
                NUM_BVH: numBvh
            },
            uniforms: {            
                tPosition: { value: null },
                tLink: { value: null },
                tSurfaceLink: { value: [] },
                bvhMatrix: { value: [] },
                radius: { value: 1 },
                gridSize: { value: 1 },
                gridCellSize: { value: 1 },
                rendertargetSize: { value: 1 },
                maxDistance: { value: 1 }
            },
            vertexShader: `
            uniform sampler2D tPosition;
            uniform sampler2D tLink;
            uniform sampler2D tSurfaceLink[4];
            uniform mat4 bvhMatrix[NUM_BVH];
            uniform float radius;
            uniform float gridSize;
            uniform float gridCellSize;
            uniform float rendertargetSize;
            uniform float maxDistance;
            
            attribute vec2 instanceId;

            varying float vDistance;

            float pointToLineDistance(vec3 p, vec3 a, vec3 b) {
                vec3 ap = p - a;
                vec3 ab = b - a;
                float t = dot(ap, ab) / dot(ab, ab);
                t = clamp(t, 0.0, 1.0);
                vec3 closestPoint = a + t * ab;
                return distance(p, closestPoint);
            }

            void main(){
                vDistance = maxDistance;
                vec2 tPositionSize = vec2(textureSize(tPosition,0));                
                vec3 segmentA = texture2D(tPosition, instanceId).xyz;
                vec4 linkIds = texture2D(tLink, instanceId);
                vec4 surfaceLinks[4] = vec4[4](
                    texture2D(tSurfaceLink[0],instanceId),
                    texture2D(tSurfaceLink[1],instanceId),
                    texture2D(tSurfaceLink[2],instanceId),
                    texture2D(tSurfaceLink[3],instanceId)
                );

                mat4 instanceMatrix = mat4(
                    gridCellSize, 0, 0, 0,
                    0, gridCellSize, 0, 0,
                    0, 0, gridCellSize, 0,
                    0, 0, 0, 1
                );

                vec4 segmentBs[8] = vec4[8](
                    vec4(0,0,0,0),
                    vec4(0,0,0,0),
                    vec4(0,0,0,0),
                    vec4(0,0,0,0),
                    vec4(0,0,0,0),
                    vec4(0,0,0,0),
                    vec4(0,0,0,0),
                    vec4(0,0,0,0)
                );

                float cnt = 0.0;
                float linkId;
                vec2 linkUv;
                vec3 segmentB;
                int bvhIndex;
                #pragma unroll_loop_start 
                for ( int i = 0; i < 4; i ++ ) {
                    linkId = linkIds[ i ];
                    if( linkId>=0.0 ){
                        linkUv = (vec2(
                            mod(linkId,tPositionSize.x),
                            floor(linkId/tPositionSize.x)
                        )+0.5)/tPositionSize;
                        segmentB = texture2D(tPosition, linkUv).xyz;
                        segmentBs[ i ] = vec4(segmentB,1);

                        instanceMatrix[3].xyz += segmentB;
                        cnt += 1.0;
                    }

                    bvhIndex = int(surfaceLinks[ i ].w);
                    if( bvhIndex>=0 ){
                        segmentB = (bvhMatrix[bvhIndex]*vec4(surfaceLinks[ i ].xyz,1)).xyz;
                        segmentBs[ UNROLLED_LOOP_INDEX+4 ] = vec4(segmentB,1);

                        instanceMatrix[3].xyz += segmentB;
                        cnt += 1.0;
                    }
                }
                #pragma unroll_loop_end
                instanceMatrix[3].xyz /= cnt;

                vec4 wPos = instanceMatrix*vec4(position,1);
                vec3 gridPos = clamp(
                    floor(wPos.xyz/gridCellSize+gridSize/2.0),
                    0.0,
                    gridSize-1.0
                );
                vec3 gridWPos = (gridPos-gridSize/2.0)*gridCellSize;    
                #pragma unroll_loop_start 
                for ( int i = 0; i < 8; i ++ ) {
                    if( segmentBs[ i ].w==1.0 ){
                        vec3 segmentB = segmentBs[ i ].xyz;

                        vDistance = min(vDistance,pointToLineDistance(gridWPos,segmentA,segmentB)-radius);
                    }
                }
                #pragma unroll_loop_end
                
                float gridId = gridPos.x+(gridPos.y+gridPos.z*gridSize)*gridSize;
                gl_Position = vec4(
                    (vec2(
                        mod(gridId,rendertargetSize),
                        floor(gridId/rendertargetSize)
                    )+0.5)/rendertargetSize*2.0-1.0,
                    0,1
                );
                gl_PointSize = 1.0;
            }
            `,
            fragmentShader: `
            varying float vDistance;

            void main(){
                gl_FragColor = vec4(vDistance,0,0,1);
            }
            `,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            blending: CustomBlending,
            blendSrc: OneFactor,
            blendDst: OneFactor,
            blendEquation: MinEquation
        })
    }
}

const scene = new Scene
const camera = new PerspectiveCamera()
const sphereSdfMaterial = new SphereSDFMaterial
const pointCubeSize = 4
const pointGeometry = (function(){
    const g = new BufferGeometry()
    const position = new BufferAttribute( new Float32Array(pointCubeSize*pointCubeSize*pointCubeSize*3), 3)
    for( let z=0; z<pointCubeSize; z++ ){
        for( let y=0; y<pointCubeSize; y++ ){
            for( let x=0; x<pointCubeSize; x++ ){
                const index = x+(y+z*pointCubeSize)*pointCubeSize
                position.setXYZ(
                    index,
                    x-pointCubeSize/2,
                    y-pointCubeSize/2,
                    z-pointCubeSize/2
                )
            }
        }
    }
    g.setAttribute("position",position)
    return g
})()
const points = new InstancedMesh(pointGeometry, sphereSdfMaterial, 1)
;(points as any).isMesh = false
;(points as any).isPoints = true
points.frustumCulled = false

const lineCubeSize = 8
const lineSegmentSdfMaterialCache: {[numBvh:number]: LineSegmentSDFMaterial} = {}
function getLineSegmentSdfMaterialCache( numBvh: number ){
    let m = lineSegmentSdfMaterialCache[numBvh]
    if( !m ){
        m = new LineSegmentSDFMaterial(numBvh)
        lineSegmentSdfMaterialCache[numBvh] = m
    }
    return m
}
const segmentsGeometry = (function(){
    const g = new BufferGeometry()
    const position = new BufferAttribute( new Float32Array(lineCubeSize*lineCubeSize*lineCubeSize*3), 3)
    for( let z=0; z<lineCubeSize; z++ ){
        for( let y=0; y<lineCubeSize; y++ ){
            for( let x=0; x<lineCubeSize; x++ ){
                const index = x+(y+z*lineCubeSize)*lineCubeSize
                position.setXYZ(
                    index,
                    x-lineCubeSize/2,
                    y-lineCubeSize/2,
                    z-lineCubeSize/2
                )
            }
        }
    }
    g.setAttribute("position",position)
    return g
})()
const segments = new InstancedMesh(segmentsGeometry, undefined, 1)
;(segments as any).isMesh = false
;(segments as any).isPoints = true
segments.frustumCulled = false

scene.add(camera)
scene.add(points)
scene.add(segments)

function setupScene(
    particleCount: number,
    positionTextureSize: number
){
    // update points
    let instanceId = pointGeometry.attributes.instanceId
    if( !instanceId || instanceId.count<particleCount ){
        instanceId = new InstancedBufferAttribute( new Float32Array(particleCount*2), 2 )
        for( let i=0; i<particleCount; i++ ){
            v_2.set(
                i%positionTextureSize,
                Math.floor(i/positionTextureSize)
            ).addScalar(0.5).divideScalar(positionTextureSize)
            v_2.toArray(instanceId.array,i*2)
        }
        instanceId.needsUpdate = true
        pointGeometry.setAttribute( "instanceId", instanceId )
    }
    if( points.instanceMatrix.count<particleCount ){
        points.instanceMatrix = new InstancedBufferAttribute( new Float32Array(16*particleCount), 16)
    }
    points.count = particleCount

    // update line segments
    if(segmentsGeometry.attributes.instanceId!==instanceId){
        segmentsGeometry.setAttribute("instanceId", instanceId )
    }
    if( segments.instanceMatrix.count<particleCount ){
        segments.instanceMatrix = new InstancedBufferAttribute( new Float32Array(16*particleCount), 16)
    }
    segments.count = particleCount
}

export class SDFGenerator {

    generate(
        renderer: WebGLRenderer,
        target: WebGLRenderTarget,
        gridSize: number,
        cellSize: number,
        particleCount: number,
        tPosition: Texture,
        tLink: Texture,
        tSurfaceLink: Texture[],
        colliders: {mesh:Mesh}[],
        radius: number
    ){
        const maxDistance = pointCubeSize*cellSize/2

        sphereSdfMaterial.uniforms.tPosition.value = tPosition
        sphereSdfMaterial.uniforms.radius.value = radius
        sphereSdfMaterial.uniforms.gridSize.value = gridSize
        sphereSdfMaterial.uniforms.gridCellSize.value = cellSize
        sphereSdfMaterial.uniforms.rendertargetSize.value = target.width
        sphereSdfMaterial.uniforms.maxDistance.value = maxDistance

        const lineSegmentSdfMaterial = getLineSegmentSdfMaterialCache( colliders.length )
        lineSegmentSdfMaterial.uniforms.tPosition.value = tPosition
        lineSegmentSdfMaterial.uniforms.tLink.value = tLink
        lineSegmentSdfMaterial.uniforms.tSurfaceLink.value = tSurfaceLink
        for( let i=0; i<colliders.length; i++ )lineSegmentSdfMaterial.uniforms.bvhMatrix.value[i] = colliders[i].mesh.matrixWorld
        lineSegmentSdfMaterial.uniforms.radius.value = radius*0.25
        lineSegmentSdfMaterial.uniforms.gridSize.value = gridSize
        lineSegmentSdfMaterial.uniforms.gridCellSize.value = cellSize
        lineSegmentSdfMaterial.uniforms.rendertargetSize.value = target.width
        lineSegmentSdfMaterial.uniforms.maxDistance.value = maxDistance
        segments.material = lineSegmentSdfMaterial
        setupScene( particleCount, tPosition.image.width )

        const restore = {
            clearColor: renderer.getClearColor(_c1),
            rendertarget: renderer.getRenderTarget(),
            activeCubeface: renderer.getActiveCubeFace(),
            activeMipLevel: renderer.getActiveMipmapLevel()
        }

        renderer.setClearColor(c1.set(maxDistance,0,0))

        renderer.setRenderTarget( target )
        renderer.render(scene,camera)

        renderer.setRenderTarget(restore.rendertarget, restore.activeCubeface, restore.activeMipLevel)
        renderer.setClearColor(restore.clearColor)
    }

}