import React from "react"

export class FpsCounter extends React.Component<{}, {fps: number}> {

    state = {
        fps: 0
    }

    get currentFps() { return this.state.fps }
    set currentFps( n: number ){
        this.setState({
            fps: n
        })
    }

    render(): React.ReactNode {
        return <div style={{
            position: "absolute",
            left: 0,
            top: 0,
            color: "white",
            backgroundColor: "black",
            display: "inline-block",
            width: "auto"
        }}>FPS:&nbsp;{this.state.fps}</div>
    }
}