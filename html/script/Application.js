import { WebGLRenderer } from "three";
export class Application {
    init(mainCanvas) {
        const renderer = new WebGLRenderer({
            canvas: mainCanvas
        });
        console.log("Hello");
    }
}
