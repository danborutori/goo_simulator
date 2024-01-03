import { BufferAttribute, BufferGeometry, Color, CustomBlending, DoubleSide, DstAlphaFactor, DstColorFactor, InstancedBufferAttribute, InstancedMesh, Matrix4, MaxEquation, MinEquation, OneFactor, PerspectiveCamera, Scene, ShaderMaterial, SrcAlphaFactor, SrcColorFactor, Vector3, WebGLRenderTarget, WebGLRenderer } from "three";

const c1 = new Color
const m1 = new Matrix4
const m2 = new Matrix4

const _c1 = new Color

class SDFMaterial extends ShaderMaterial {
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

            varying float vDistance;

            void main(){
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


const scene = new Scene
const camera = new PerspectiveCamera()
const sdfMaterial = new SDFMaterial
const pointCubeSize = 8
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
const points = new InstancedMesh(pointGeometry, sdfMaterial, 1)
;(points as any).isMesh = false
;(points as any).isPoints = true
points.frustumCulled = false

scene.add(camera)
scene.add(points)

function setupScene(
    spherePositions: {position: Vector3}[],
    cellSize: number
){
    if( points.instanceMatrix.count<spherePositions.length ){
        points.instanceMatrix = new InstancedBufferAttribute( new Float32Array(16*spherePositions.length), 16)
    }
    for( let i=0; i<spherePositions.length; i++ ){
        m1.makeTranslation(spherePositions[i].position)
        .multiply(
            m2.makeScale(cellSize,cellSize,cellSize)
        )
        points.setMatrixAt(i,m1)
    }
    points.instanceMatrix.needsUpdate = true
    points.count = spherePositions.length
}

export class SDFGenerator {

    generate(
        renderer: WebGLRenderer,
        target: WebGLRenderTarget,
        gridSize: number,
        cellSize: number,
        spherePositions: {position: Vector3}[],
        radius: number
    ){
        const maxDistance = pointCubeSize*cellSize/2

        sdfMaterial.uniforms.radius.value = radius
        sdfMaterial.uniforms.gridSize.value = gridSize
        sdfMaterial.uniforms.gridCellSize.value = cellSize
        sdfMaterial.uniforms.rendertargetSize.value = target.width
        sdfMaterial.uniforms.maxDistance.value = maxDistance
        setupScene( spherePositions, cellSize )

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