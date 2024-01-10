import { Mesh, MeshPhysicalMaterial, RepeatWrapping, TextureLoader } from "three";
import { gooColor } from "../deviceSetting.js";

const loader = new TextureLoader()

function loadTexture( url: string ){
    const tex = loader.load(url)
    tex.wrapS = RepeatWrapping
    tex.wrapT = RepeatWrapping
    return tex
}

const texture = {
    vertical: {
        albedo: loadTexture( "./asset/wet_v/albedo.jpg" ),
        normal: loadTexture( "./asset/wet_v/normals.jpg" ),
        displacement: loadTexture( "./asset/wet_v/displacement.jpg" ),
    },
    horizontal: {
        albedo: loadTexture( "./asset/wet_h/albedo.jpg" ),
        normal: loadTexture( "./asset/wet_h/normals.jpg" ),
        displacement: loadTexture( "./asset/wet_h/displacement.jpg" ),
    }
}

class WetMaterial extends MeshPhysicalMaterial {

    constructor(){
        super({
            color: gooColor,
            roughness: 0.1,
            normalMap: texture.vertical.normal, // force use normal map
            transmission: 0.5,
            transparent: true,
            thickness: 0.02,
            polygonOffset: true,
            polygonOffsetFactor: -0.005,
            polygonOffsetUnits: 1
        })

        this.onBeforeCompile = shader => {

            shader.uniforms.tAlbedoV = { value: texture.vertical.albedo }
            shader.uniforms.tNormalV = { value: texture.vertical.normal }
            shader.uniforms.tDispV = { value: texture.vertical.displacement }
            shader.uniforms.tAlbedoH = { value: texture.horizontal.albedo }
            shader.uniforms.tNormalH = { value: texture.horizontal.normal }
            shader.uniforms.tDispH = { value: texture.horizontal.displacement }

            shader.vertexShader = `
                varying vec3 vObjPosition;
                varying vec3 vObjNormal;
            `+shader.vertexShader.replace(
                "#include <uv_vertex>",
                `
                #include <uv_vertex>

                vec3 vObjPositionScale = vec3(
                    length(modelMatrix[0].xyz),
                    length(modelMatrix[1].xyz),
                    length(modelMatrix[2].xyz)
                );
                vObjPosition = position*vObjPositionScale*2.0;
                vObjPosition.y *= 0.25;
                vObjNormal = normal;
                `
            )
            shader.fragmentShader = `
                uniform sampler2D tAlbedoV;
                uniform sampler2D tNormalV;
                uniform sampler2D tDispV;
                uniform sampler2D tAlbedoH;
                uniform sampler2D tNormalH;
                uniform sampler2D tDispH;

                varying vec3 vObjPosition;
                varying vec3 vObjNormal;
            `+shader.fragmentShader.replace(
                "#include <map_fragment>",
                `
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

                float wetiness = 0.8;
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

                diffuseColor.a *= saturate((gooThickness-0.2)/0.6);
                `
            ).replace(
                "#include <normal_fragment_maps>",
                `
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
                `
            )
        }
    }

}

const wetMaterial = new WetMaterial()

export function applyWetMaterial( mesh: Mesh ){
    
    mesh.material = [mesh.material as THREE.Material, wetMaterial]
    mesh.geometry.clearGroups()    
    mesh.geometry.addGroup(0,mesh.geometry.index!.count,0)
    mesh.geometry.addGroup(0,mesh.geometry.index!.count,1)
}