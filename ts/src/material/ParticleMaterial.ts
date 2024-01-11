import { IUniform, Texture } from "three";
import { ViewNormalPositionMaterial } from "./ViewNormalPositionMaterial.js";

export class ParticleMaterial extends ViewNormalPositionMaterial {
    readonly uniforms = {
        tPosition: { value: null } as IUniform<Texture | null>
    }

    constructor(){
        super()

        const defines = this.defines || (this.defines = {})
        defines.PARTICLE_MATERIAL = "1"

        const onBeforeCompile = this.onBeforeCompile
        this.onBeforeCompile = (shader,renderer)=>{
            onBeforeCompile(shader,renderer)
            Object.assign(shader.uniforms, this.uniforms)

            shader.vertexShader = `
                uniform sampler2D tPosition;
            `+shader.vertexShader.replace(
                "#include <begin_vertex>",
                `
                float instanceId = float(gl_InstanceID);
                vec2 tPositionSize = vec2(textureSize(tPosition,0));
                vec2 instanceUv = (vec2(
                    mod(instanceId,tPositionSize.x),
                    floor(instanceId/tPositionSize.x)
                )+0.5)/tPositionSize;
                vec3 instancePosition = texture2D( tPosition, instanceUv ).xyz;
                mat4 instanceMatrix = mat4(
                    vec4(1,0,0,0),
                    vec4(0,1,0,0),
                    vec4(0,0,1,0),
                    vec4(instancePosition,1)
                );
                
                #include <begin_vertex>
                `
            )
        }
    }
}