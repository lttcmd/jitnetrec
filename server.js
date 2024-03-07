const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const net = require('net');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Setup Express for serving static files
const app = express();
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// Create an HTTP server for Express
const httpServer = http.createServer(app);

// Setup WebSocket server
const wss = new WebSocket.Server({ server: httpServer });

// Function to broadcast messages to all connected WebSocket clients
function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

// Ensure the output directory exists for the JPEG files
const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// TCP Server setup for handling incoming image data
const tcpServer = net.createServer((socket) => {
    console.log('Client connected to TCP server.');

    let dataBuffer = Buffer.alloc(0);

    socket.on('data', (chunk) => {
        dataBuffer = Buffer.concat([dataBuffer, chunk]); // Accumulate data

        // Constants for the protocol
        const HEADER_SIZE = 288; // Size of the matrix header, excluding the chunk header

        while (dataBuffer.length >= HEADER_SIZE + 8) { // Check for sufficient data
            const chunkId = dataBuffer.slice(0, 4).toString();
            if (chunkId === 'JMTX' && dataBuffer.length >= HEADER_SIZE + 8) {
                const matrixHeader = parseMatrixHeader(dataBuffer.slice(8, HEADER_SIZE + 8));
                console.log('Matrix Header:', matrixHeader);

                const totalSize = HEADER_SIZE + 8 + matrixHeader.datasize;
                if (dataBuffer.length >= totalSize) {
                    // Extract image dimensions from the matrix header
                    const width = matrixHeader.dim[0];
                    const height = matrixHeader.dim[1];

                    const imageData = dataBuffer.slice(HEADER_SIZE + 8, totalSize);
                    convertMatrixToJPEG(imageData, width, height)
                        .then(() => console.log('Image saved and broadcasted.'))
                        .catch(err => console.error('Error saving image:', err));

                    dataBuffer = dataBuffer.slice(totalSize);
                } else {
                    break; // Wait for more data
                }
            } else {
                console.log(`Unknown chunk ID: ${chunkId} or insufficient data for matrix header. Waiting for more data...`);
                break; // Wait for more data
            }
        }
    });

    socket.on('end', () => {
        console.log('Client disconnected from TCP server.');
    });
});

// Parse the matrix header from the incoming data buffer
function parseMatrixHeader(buffer) {
    return {
        id: buffer.slice(0, 4).toString(),
        size: buffer.readInt32BE(4),
        planecount: buffer.readInt32BE(8),
        type: buffer.readInt32BE(12),
        dimcount: buffer.readInt32BE(16),
        dim: Array.from({ length: 32 }, (_, i) => buffer.readInt32BE(20 + i * 4)),
        dimstride: Array.from({ length: 32 }, (_, i) => buffer.readInt32BE(148 + i * 4)),
        datasize: buffer.readInt32BE(276),
        time: buffer.readDoubleBE(280),
    };
}

// Convert the received matrix data to JPEG and broadcast it
async function convertMatrixToJPEG(data, width, height) {
    try {
        const buffer = await sharp(data, {
            raw: {
                width,
                height,
                channels: 4 // Assuming ARGB format
            }
        }).jpeg().toBuffer();

        // Broadcast the image buffer to all connected WebSocket clients
        broadcast(buffer);
    } catch (err) {
        console.error('Error processing image:', err);
    }
}

// Listen on ports for the HTTP/WebSocket server and the TCP server
const HTTP_PORT = 8080; // For Express and WebSocket
const TCP_PORT = 8081; // For the TCP server

httpServer.listen(HTTP_PORT, () => {
    console.log(`HTTP and WebSocket server listening on port ${HTTP_PORT}.`);
});

tcpServer.listen(TCP_PORT, () => {
    console.log(`TCP server listening on port ${TCP_PORT}.`);
});