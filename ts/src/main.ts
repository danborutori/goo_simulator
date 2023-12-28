import { Application } from "./Application.js"

declare const mainCanvas: HTMLCanvasElement
declare const hudRoot: HTMLDivElement

const app = new Application()

app.init(mainCanvas, hudRoot)
app.start()