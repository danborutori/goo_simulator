import { Application } from "./Application.js"

declare const mainCanvas: HTMLCanvasElement
declare const hudRoot: HTMLDivElement

Application.create().then(app=>{
    app.init(mainCanvas)
    app.start(hudRoot)}
)

