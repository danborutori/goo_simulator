import { BufferAttribute, BufferGeometry, Color, CustomBlending, InstancedBufferAttribute, InstancedMesh, Matrix4, MinEquation, OneFactor, PerspectiveCamera, Scene, ShaderMaterial, Texture, Vector2, Vector3, WebGLRenderTarget, WebGLRenderer } from "three";

const v1 = new Vector3
const v_2 = new Vector2
const c1 = new Color
const m1 = new Matrix4
const m2 = new Matrix4

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
    constructor(){
        super({
            uniforms: {            
                radius: { value: 1 },
                gridSize: { value: 1 },
                gridCellSize: { value: 1 },
                rendertargetSize: { value: 1 },
                maxDistance: { value: 1 }
            },
            vertexShader: `
            uniform float radius;
            uniform float gridSize;
            uniform float gridCellSize;
            uniform float rendertargetSize;
            uniform float maxDistance;
            
            attribute vec3 segmentA;
            attribute vec3 segmentB;

            float pointToLineDistance(vec3 p, vec3 a, vec3 b) {
                vec3 ap = p - a;
                vec3 ab = b - a;
                float t = dot(ap, ab) / dot(ab, ab);
                t = clamp(t, 0.0, 1.0);
                vec3 closestPoint = a + t * ab;
                return distance(p, closestPoint);
            }

            varying float vDistance;

            void main(){
                vec4 wPos = instanceMatrix*vec4(position,1);

                vec3 gridPos = clamp(
                    floor(wPos.xyz/gridCellSize+gridSize/2.0),
                    0.0,
                    gridSize-1.0
                );
                vec3 gridWPos = (gridPos-gridSize/2.0)*gridCellSize;
                vDistance = min(maxDistance,pointToLineDistance(gridWPos,segmentA,segmentB)-radius);
                
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
const linesegmentSdfMaterial = new LineSegmentSDFMaterial()
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
const segments = new InstancedMesh(segmentsGeometry, linesegmentSdfMaterial, 1)
;(segments as any).isMesh = false
;(segments as any).isPoints = true
segments.frustumCulled = false

scene.add(camera)
scene.add(points)
// scene.add(segments)

function setupScene(
    particleCount: number,
    positionTextureSize: number,
    lineSegments: {a: Vector3, b: Vector3}[],
    cellSize: number
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
        m1.identity()
        for( let i=0; i<particleCount; i++ )points.setMatrixAt(i, m1)
        points.instanceMatrix.needsUpdate = true
    }
    points.count = particleCount

    // update line segments
    if( segments.instanceMatrix.count<lineSegments.length ){
        segments.instanceMatrix = new InstancedBufferAttribute( new Float32Array(16*lineSegments.length), 16)
    }
    let segmentA = segments.geometry.attributes.segmentA
    let segmentB = segments.geometry.attributes.segmentB
    if( !segmentA || segmentA.count<lineSegments.length ){
        segmentA = new InstancedBufferAttribute(new Float32Array(lineSegments.length*3), 3)
        segments.geometry.setAttribute("segmentA", segmentA)
    }
    if( !segmentB || segmentB.count<lineSegments.length ){
        segmentB = new InstancedBufferAttribute(new Float32Array(lineSegments.length*3), 3)
        segments.geometry.setAttribute("segmentB", segmentB)
    }
    for( let i=0; i<lineSegments.length; i++ ){
        const s = lineSegments[i]
        v1.addVectors( s.a, s.b ).multiplyScalar(0.5)
        m1.makeTranslation(v1)
        .multiply(
            m2.makeScale(cellSize,cellSize,cellSize)
        )
        segments.setMatrixAt(i,m1)
        s.a.toArray(segmentA.array,i*3)
        s.b.toArray(segmentB.array,i*3)
    }
    segments.instanceMatrix.needsUpdate = true
    segmentA.needsUpdate = true
    segmentB.needsUpdate = true
    segments.count = lineSegments.length
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
        radius: number
    ){
        const maxDistance = pointCubeSize*cellSize/2

        sphereSdfMaterial.uniforms.tPosition.value = tPosition
        sphereSdfMaterial.uniforms.radius.value = radius
        sphereSdfMaterial.uniforms.gridSize.value = gridSize
        sphereSdfMaterial.uniforms.gridCellSize.value = cellSize
        sphereSdfMaterial.uniforms.rendertargetSize.value = target.width
        sphereSdfMaterial.uniforms.maxDistance.value = maxDistance        
        linesegmentSdfMaterial.uniforms.radius.value = radius*0.25
        linesegmentSdfMaterial.uniforms.gridSize.value = gridSize
        linesegmentSdfMaterial.uniforms.gridCellSize.value = cellSize
        linesegmentSdfMaterial.uniforms.rendertargetSize.value = target.width
        linesegmentSdfMaterial.uniforms.maxDistance.value = maxDistance
        setupScene( particleCount, tPosition.image.width, [], cellSize )

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