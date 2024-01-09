import React from "react";
export class FpsCounter extends React.Component {
    constructor() {
        super(...arguments);
        this.state = {
            fps: 0
        };
    }
    get currentFps() { return this.state.fps; }
    set currentFps(n) {
        this.setState({
            fps: n
        });
    }
    render() {
        return React.createElement("div", { style: {
                position: "absolute",
                left: 0,
                top: 0,
                color: "white",
                backgroundColor: "black",
                display: "inline-block",
                width: "auto"
            } },
            "FPS:\u00A0",
            this.state.fps);
    }
}
