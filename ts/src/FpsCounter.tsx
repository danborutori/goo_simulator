import React from "react"

export class FpsCounter extends React.Component<{getFps: ()=>number}, {fps: number}> {

    private interval?: number

    constructor(props: {getFps: ()=>number}){
        super(props)
        this.setState({
            fps: 0
        })
    }

    componentDidMount(): void {
        this.interval = setInterval(()=>{
            this.setState({ 
                fps: this.props.getFps()
            })
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
        }}>FPS:&nbsp;{this.state && this.state.fps}</div>
    }
}