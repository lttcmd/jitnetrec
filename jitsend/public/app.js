const ws = new WebSocket('ws://localhost:8080'); // Connect to WebSocket server
const videoFrame = document.getElementById('videoFrame'); // Get the image element

ws.onmessage = function(event) {
    const url = URL.createObjectURL(event.data);

    requestAnimationFrame(() => {
        const previousSrc = videoFrame.src;
        videoFrame.onload = () => {
            if (previousSrc) {
                URL.revokeObjectURL(previousSrc);
            }
            videoFrame.onload = null;
        };

        videoFrame.src = url;
    });
};


// Ensure that the WebSocket connection is closed when the window is unloaded
window.addEventListener('beforeunload', () => {
    if (ws) {
        ws.close();
    }
});
