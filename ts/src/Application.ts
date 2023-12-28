import {WebGLRenderer} from "three"

export class Application {

    init(mainCanvas: HTMLCanvasElement){

        const renderer = new WebGLRenderer({
            canvas: mainCanvas
        })
        
        console.log("Hello")
    }
}