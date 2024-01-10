import { Mesh, PlaneGeometry, ShaderMaterial } from "three";
const planeGeometry = new PlaneGeometry(2, 2);
export class ShadowMapDebugger extends Mesh {
    constructor(shadow) {
        super(planeGeometry, new ShaderMaterial({
            uniforms: {
                tShadow: { value: null }
            },
            vertexShader: `
                varying vec2 vUv;

                void main(){
                    vUv = uv;
                    gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1);
                }
                `,
            fragmentShader: `
                #include <packing>

                uniform sampler2D tShadow;

                varying vec2 vUv;                

                void main(){
                    gl_FragColor = vec4(vec3(unpackRGBAToDepth(texture2D( tShadow, vUv ))), 1);
                }
                `
        }));
        this.onBeforeRender = () => {
            var _a;
            this.material.uniforms.tShadow.value = (_a = shadow.map) === null || _a === void 0 ? void 0 : _a.texture;
        };
    }
}