import { MeshStandardMaterial } from "three";

export class ViewNormalPositionMaterial extends MeshStandardMaterial {

    constructor(){
        super()

        const defines = this.defines || (this.defines = {} )
        defines.VIEW_MORMAL_POSITION_MATERIAL = "1"

        this.onBeforeCompile = shader=>{
            shader.fragmentShader = `
            layout(location = 1) out vec4 outPosition;
            `+shader.fragmentShader.replace(
                "#include <dithering_fragment>",
                `
                #include <dithering_fragment>

                gl_FragColor = vec4(vNormal,1);
                outPosition = vec4(-vViewPosition,1);
                `
            )
        }
    }

}