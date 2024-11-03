// backend/socket.js

import { Server } from 'socket.io';
import logger from './Utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

const io = new Server();

io.on('connection', (socket) => {
  logger.info(`New client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

export default io;
