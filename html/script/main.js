import { Application } from "./Application.js";
Application.create().then(app => {
    app.init(mainCanvas);
    app.start(hudRoot);
});
