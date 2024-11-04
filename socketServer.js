// server/socketServer.js

import { Server } from 'socket.io';
import http from 'http';
import dotenv from 'dotenv';
import logger from './Utils/logger.js';

dotenv.config();

// Initialize HTTP server
const httpServer = http.createServer();

// Initialize Socket.io server
const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:3000', // Replace with your frontend's URL
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });

  // Listen for uploadProgress from workers
  socket.on('uploadProgress', (data) => {
    const { socketId, progress } = data;
    // Relay progress to the specific client
    io.to(socketId).emit('uploadProgress', { progress });
  });

  // Listen for uploadComplete from workers
  socket.on('uploadComplete', (data) => {
    const { socketId, message } = data;
    // Relay completion to the specific client
    io.to(socketId).emit('uploadComplete', { message });
  });

  // Listen for uploadError from workers
  socket.on('uploadError', (data) => {
    const { socketId, message } = data;
    // Relay error to the specific client
    io.to(socketId).emit('uploadError', { message });
  });
});

// Start the Socket.io server
const PORT = process.env.SOCKET_PORT || 4000;
httpServer.listen(PORT, () => {
  logger.info(`Socket.io server listening on port ${PORT}`);
});

export default io;
