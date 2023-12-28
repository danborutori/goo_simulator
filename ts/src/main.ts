import { Application } from "./Application.js"

declare const mainCanvas: HTMLCanvasElement

const app = new Application()

app.init(mainCanvas)
app.start()