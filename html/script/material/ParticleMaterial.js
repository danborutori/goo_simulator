import { MeshStandardMaterial } from "three";
export class ParticleMaterial extends MeshStandardMaterial {
    constructor() {
        super({
            color: 0xff0000,
            roughness: 0
        });
        this.uniforms = {
            tPosition: { value: null }
        };
        const defines = this.defines || (this.defines = {});
        defines.PARTICLE_MATERIAL = "1";
        this.onBeforeCompile = shader => {
            Object.assign(shader.uniforms, this.uniforms);
            shader.vertexShader = `
                uniform sampler2D tPosition;
            ` + shader.vertexShader.replace("#include <begin_vertex>", `
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
                `);
        };
    }
}
