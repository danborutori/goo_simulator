import React from "react"

interface FPSProvider {
    currentFps: number
}

interface Props {
    fpsProvider: FPSProvider
}

export class FpsCounter extends React.Component<Props, FPSProvider> {

    private interval?: number

    componentDidMount(): void {
        this.interval = setInterval(()=>{
            this.setState(this.props.fpsProvider)
        })
    }

    componentWillUnmount(): void {
        if(this.interval !== undefined){
            clearInterval(this.interval)
            this.interval = undefined
        }
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
        }}>FPS:&nbsp;{this.state && this.state.currentFps}</div>
    }
}