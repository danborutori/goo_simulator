import { Camera, Color, FrontSide, HalfFloatType, LinearFilter, Matrix4, Mesh, MeshPhysicalMaterial, NoBlending, Object3D, PlaneGeometry, RGBAFormat, ShaderMaterial, Vector2, WebGLMultipleRenderTargets, WebGLRenderer } from "three";
import { gooColor } from "./deviceSetting.js";
import { FullScreenQuad } from "three/examples/jsm/Addons";

const v_2 = new Vector2
const _c1 = new Color

const geometry = new PlaneGeometry(2,2)

const fsquad = new FullScreenQuad()

const blurRadius = 3

const blurMaterial = new ShaderMaterial({
    defines: {
        BLUR_RADIUS: blurRadius
    },
    uniforms: {
        tPosition: { value: null },
        tNormal: { value: null }
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
    uniform sampler2D tNormal;

    layout(location = 1) out vec4 outPosition;

    varying vec2 vUv;

    void main(){

        vec2 texSize = vec2(textureSize( tPosition, 0 ));

        vec4 normal = vec4(0,0,0,0);
        vec4 position = vec4(0,0,0,0);

        vec2 uv;
        float x, y;
        #pragma unroll_loop_start 
        for ( int i = 0; i < ${blurRadius*blurRadius}; i ++ ) {
            x = mod(UNROLLED_LOOP_INDEX.0,float(BLUR_RADIUS))-float(BLUR_RADIUS)/2.0;
            y = floor(UNROLLED_LOOP_INDEX.0/float(BLUR_RADIUS))-float(BLUR_RADIUS)/2.0;

            uv = vUv+vec2(x,y)/texSize;

            normal += texture2D(tNormal, uv );
            position += texture2D(tPosition, uv );
        }
        #pragma unroll_loop_end

        normal /= float(BLUR_RADIUS*BLUR_RADIUS);
        position /= float(BLUR_RADIUS*BLUR_RADIUS);
        
        gl_FragColor = normal;
        outPosition = position;
    }
    `,
    transparent: false,
    blending: NoBlending
})

class BlurHelper {
    blur( 
        renderer: WebGLRenderer,
        rendertarget: WebGLMultipleRenderTargets,
        backbuffer: WebGLMultipleRenderTargets
    ){
        let readBuffer = rendertarget
        let writeBuffer = backbuffer

        for( let i=0; i<16; i++ ){

            blurMaterial.uniforms.tNormal.value = readBuffer.texture[0]
            blurMaterial.uniforms.tPosition.value = readBuffer.texture[1]
            fsquad.material = blurMaterial
            renderer.setRenderTarget( writeBuffer )
            fsquad.render( renderer )

            const tmp = readBuffer
            readBuffer = writeBuffer
            writeBuffer = tmp
        }
    }
}
const blurHelper = new BlurHelper()

export class GooPlane extends Mesh {

    private rendertarget = new WebGLMultipleRenderTargets(1,1,2,{
        format: RGBAFormat,
        type: HalfFloatType,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        generateMipmaps: false,
        depthBuffer: true
    })
    private backBuffer = this.rendertarget.clone()

    constructor(
        readonly objectRoot: Object3D
    ){
        super(geometry)

        const cameraWorldMatrix = { value: new Matrix4 }
        const mat = new MeshPhysicalMaterial({
            color: gooColor,
            roughness: 0.1,
            transmission: 0.5,
            depthTest: true,
            depthWrite: true,
            side: FrontSide,
            alphaTest: 0.5
        })
        mat.onBeforeCompile = shader=>{
            shader.uniforms.tNormal = { value: this.rendertarget.texture[0] }
            shader.uniforms.tPosition = { value: this.rendertarget.texture[1] }
            shader.uniforms.cameraWorldMatrix = cameraWorldMatrix

            shader.vertexShader = `
                varying vec2 vUv;
            `+shader.vertexShader.replace(
                "#include <project_vertex>",
                `
                #include <project_vertex>
    
                gl_Position = vec4(position,1);

                vUv = uv;
                `
            )

            shader.fragmentShader = `
                uniform sampler2D tNormal;
                uniform sampler2D tPosition;
                uniform mat4 cameraWorldMatrix;

                varying vec2 vUv;

                #if NUM_SPOT_LIGHT_COORDS > 0

                    uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];

                #endif
            `+shader.fragmentShader.replace(
                "void main() {",
                `
                void main() {
                    vec4 viewPos = texture2D(tPosition, vUv);
                    vec4 screenPos = projectionMatrix*viewPos;
                    screenPos /= screenPos.w;

                    gl_FragDepth = screenPos.z*0.5+0.5;
                    vec3 vViewPosition = -viewPos.xyz;
                    vec3 vWorldPosition = (cameraWorldMatrix*vec4(viewPos.xyz,1)).xyz;
                `
            ).replace(
                "#include <map_fragment>",
                `
                #include <map_fragment>
                diffuseColor.a *= viewPos.a;
                `
            ).replace(
                "#include <clearcoat_normal_fragment_maps>",
                `
                #include <clearcoat_normal_fragment_maps>

                normal = normalize(texture2D(tNormal, vUv).xyz);
                `
            ).replace(
                "#include <lights_fragment_begin>",
                `
                #ifdef USE_SHADOWMAP
                #if NUM_SPOT_LIGHT_COORDS > 0
                vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
    
                for( int i=0; i<NUM_SPOT_LIGHT_COORDS; i++ ){
                    vSpotLightCoord[ i ] = spotLightMatrix[ i ]*vec4(vWorldPosition,1);
                }
                #endif
                #endif
    
                #include <lights_fragment_begin>
                `
            )
        }
        this.material = mat

        this.onBeforeRender = (_, __, camera)=>{
            cameraWorldMatrix.value.copy(camera.matrixWorld)
        }
    }

    update( renderer: WebGLRenderer, camera: Camera ){
        renderer.getDrawingBufferSize(v_2).divideScalar(2).floor()
        if( this.rendertarget.width!=v_2.width || this.rendertarget.height!=v_2.height ){
            this.rendertarget.setSize(v_2.x, v_2.y)
            this.backBuffer.setSize(v_2.x, v_2.y)
        }

        const restore = {
            renderTarget: renderer.getRenderTarget(),
            clearColor: renderer.getClearColor(_c1),
            clearAlpha: renderer.getClearAlpha()
        }

        renderer.setClearColor(0,0)
        renderer.setRenderTarget(this.rendertarget)
        renderer.render(this.objectRoot,camera)

        blurHelper.blur( renderer, this.rendertarget, this.backBuffer )

        renderer.setClearColor(restore.clearColor,restore.clearAlpha)
        renderer.setRenderTarget(restore.renderTarget)
    }

}

