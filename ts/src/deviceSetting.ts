function detectDeviceType(){
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop';
}

const deviceType = detectDeviceType()

export const deviceSetting = (function(){
    switch(deviceType){
        case "Desktop":
            return {
                rayMarchingStep: 64,
                shadowRayMarchingStep: 16,
            }
        case "Mobile":
            return {
                rayMarchingStep: 32,
                shadowRayMarchingStep: 8,
            }
    }
    
})()