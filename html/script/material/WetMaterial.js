import { AdditiveBlending, BufferAttribute, BufferGeometry, HalfFloatType, MathUtils, MeshPhysicalMaterial, NearestFilter, OrthographicCamera, Points, RedFormat, RepeatWrapping, ShaderMaterial, TextureLoader, Vector2, WebGLRenderTarget } from "three";
import { gooColor } from "../deviceSetting.js";
const v_2 = new Vector2;
const loader = new TextureLoader();
function loadTexture(url) {
    const tex = loader.load(url);
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    return tex;
}
const texture = {
    vertical: {
        albedo: loadTexture("./asset/wet_v/albedo.jpg"),
        normal: loadTexture("./asset/wet_v/normals.jpg"),
        displacement: loadTexture("./asset/wet_v/displacement.jpg"),
    },
    horizontal: {
        albedo: loadTexture("./asset/wet_h/albedo.jpg"),
        normal: loadTexture("./asset/wet_h/normals.jpg"),
        displacement: loadTexture("./asset/wet_h/displacement.jpg"),
    }
};
class WetMaterial extends MeshPhysicalMaterial {
    constructor(tWetiness) {
        super({
            color: gooColor,
            roughness: 0.1,
            normalMap: texture.vertical.normal,
            transmission: 0.5,
            transparent: true,
            thickness: 0.02,
            polygonOffset: true,
            polygonOffsetFactor: -0.005,
            polygonOffsetUnits: 1
        });
        this.onBeforeCompile = shader => {
            shader.uniforms.tAlbedoV = { value: texture.vertical.albedo };
            shader.uniforms.tNormalV = { value: texture.vertical.normal };
            shader.uniforms.tDispV = { value: texture.vertical.displacement };
            shader.uniforms.tAlbedoH = { value: texture.horizontal.albedo };
            shader.uniforms.tNormalH = { value: texture.horizontal.normal };
            shader.uniforms.tDispH = { value: texture.horizontal.displacement };
            shader.uniforms.tWetiness = { value: tWetiness };
            shader.vertexShader = `
                uniform sampler2D tWetiness;

                attribute vec2 wetinessUv;

                varying vec3 vObjPosition;
                varying vec3 vObjNormal;                
                varying float vWetiness;
            ` + shader.vertexShader.replace("#include <uv_vertex>", `
                #include <uv_vertex>

                vec3 vObjPositionScale = vec3(
                    length(modelMatrix[0].xyz),
                    length(modelMatrix[1].xyz),
                    length(modelMatrix[2].xyz)
                );
                vObjPosition = position*vObjPositionScale*2.0;
                vObjPosition.y *= 0.25;
                vObjNormal = normal;
                vWetiness = saturate(texture2D(tWetiness,wetinessUv).r);
                `);
            shader.fragmentShader = `
                uniform sampler2D tAlbedoV;
                uniform sampler2D tNormalV;
                uniform sampler2D tDispV;
                uniform sampler2D tAlbedoH;
                uniform sampler2D tNormalH;
                uniform sampler2D tDispH;

                varying vec3 vObjPosition;
                varying vec3 vObjNormal;
                varying float vWetiness;
            ` + shader.fragmentShader.replace("#include <map_fragment>", `
                vec4 albedoX = texture2D( tAlbedoV, vObjPosition.zy );
                vec4 albedoY = texture2D( tAlbedoH, vObjPosition.xz );
                vec4 albedoZ = texture2D( tAlbedoV, vObjPosition.xy );
                float mixZ = saturate((abs(vObjNormal.x)-0.3)/0.4);
                float mixY = saturate((abs(vObjNormal.y)-0.3)/0.4);

                diffuseColor *= mix(
                    mix(
                        albedoX,
                        albedoZ,
                        mixZ
                    ),
                    albedoY,
                    mixY
                );

                float dispX = texture2D( tDispV, vObjPosition.zy ).r;
                float dispY = texture2D( tDispH, vObjPosition.xz ).r;
                float dispZ = texture2D( tDispV, vObjPosition.xy ).r;

                float wetiness = vWetiness;
                float gooThickness = mix(
                    mix(
                        dispX,
                        dispZ,
                        mixZ
                    ),
                    dispY,
                    mixY
                );
                gooThickness -= 1.0-wetiness;
                gooThickness = sign(gooThickness)*pow(abs(gooThickness),0.5);

                diffuseColor.a *= saturate((gooThickness-0.2)/0.6)*0.5;
                `).replace("#include <normal_fragment_maps>", `
                vec3 norX = texture2D( tNormalV, vObjPosition.zy ).xyz*2.0-1.0;
                vec3 norY = texture2D( tNormalH, vObjPosition.xz ).xyz*2.0-1.0;
                vec3 norZ = texture2D( tNormalV, vObjPosition.xy ).xyz*2.0-1.0;

                vec3 mapN = normalize(mix(
                    mix(
                        norX,
                        norZ,
                        mixZ
                    ),
                    norY,
                    mixY
                ));
	            mapN.xy *= normalScale;

                normal = normalize( tbn * mapN );
                `);
        };
    }
}
function applyWetMaterial(mesh, wetinessUv, tWetiness) {
    const g = mesh.geometry;
    g.setAttribute("wetinessUv", wetinessUv);
    g.clearGroups();
    g.addGroup(0, mesh.geometry.index.count, 0);
    g.addGroup(0, mesh.geometry.index.count, 1);
    const wetMaterial = new WetMaterial(tWetiness);
    mesh.material = [mesh.material, wetMaterial];
}
const dummyCamera = new OrthographicCamera();
export class WetinessContext extends Points {
    constructor(mesh, sdfTexture, gridSize, gridCellSize, colliderMatrix) {
        const g = mesh.geometry;
        const position = g.attributes.position;
        const wetTextureSize = MathUtils.ceilPowerOfTwo(Math.sqrt(position.count));
        const wetinessUv = new BufferAttribute(new Float32Array(position.count * 2), 2);
        for (let i = 0; i < position.count; i++) {
            v_2.set(i % wetTextureSize, Math.floor(i / wetTextureSize)).addScalar(0.5).divideScalar(wetTextureSize);
            v_2.toArray(wetinessUv.array, i * 2);
        }
        wetinessUv.needsUpdate = true;
        const g2 = new BufferGeometry();
        g2.setAttribute("position", position);
        g2.setAttribute("wetinessUv", wetinessUv);
        const mat = new ShaderMaterial({
            uniforms: {
                tSDF: { value: sdfTexture },
                gridSize: { value: gridSize },
                gridCellSize: { value: gridCellSize },
                colliderMatrix: { value: colliderMatrix }
            },
            vertexShader: `
            #include <common>

            uniform sampler2D tSDF;
            uniform float gridSize;
            uniform float gridCellSize;
            uniform mat4 colliderMatrix;

            attribute vec2 wetinessUv;

            varying float vWetiness;

            float sampleDistance( vec3 wPos ){
                vec3 gridPos = wPos/gridCellSize+gridSize/2.0;

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

                vec3 gridPosClamped;
                float gridId;
                vec2 gridTextureSize = vec2(textureSize(tSDF,0));
                vec2 uv;
                #pragma unroll_loop_start 
                for ( int i = 0; i < 8; i ++ ) {
                    gridPosClamped = clamp(
                        gridPosAligned[ i ],
                        0.0,
                        gridSize-1.0
                    );
                    gridId = gridPosClamped.x+(gridPosClamped.y+gridPosClamped.z*gridSize)*gridSize;
                    uv = vec2(
                        mod( gridId, gridTextureSize.x ),
                        floor(gridId/gridTextureSize.y)
                    )/gridTextureSize;

                    distances[ i ] = texture2D(tSDF, uv).r;            
                }
                #pragma unroll_loop_end
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

                return distance;
            }

            void main(){
                vec4 wPos = colliderMatrix*vec4(position,1);
                float distance = sampleDistance(wPos.xyz);

                vWetiness = saturate(1.0-distance/0.001);

                gl_Position = vec4( wetinessUv*2.0-1.0, 0, 1 );
                gl_PointSize = 1.0;
            }
            `,
            fragmentShader: `
            varying float vWetiness;

            void main(){
                gl_FragColor = vec4(vWetiness,0,0,1);
            }
            `,
            transparent: true,
            blending: AdditiveBlending
        });
        super(g2, mat);
        this.wetinessRenderTarget = new WebGLRenderTarget(wetTextureSize, wetTextureSize, {
            format: RedFormat,
            type: HalfFloatType,
            minFilter: NearestFilter,
            magFilter: NearestFilter,
            generateMipmaps: false
        });
        applyWetMaterial(mesh, wetinessUv, this.wetinessRenderTarget.texture);
    }
    update(renderer) {
        const restore = {
            renderTarget: renderer.getRenderTarget(),
            autoClear: renderer.autoClear
        };
        renderer.autoClear = false;
        renderer.setRenderTarget(this.wetinessRenderTarget);
        renderer.render(this, dummyCamera);
        renderer.setRenderTarget(restore.renderTarget);
        renderer.autoClear = restore.autoClear;
    }
}
