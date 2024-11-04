// server/socketClient.js

import { io } from 'socket.io-client';
import dotenv from 'dotenv';
import logger from './Utils/logger.js';

dotenv.config();

const SOCKET_SERVER_URL = process.env.SOCKET_SERVER_URL || 'http://localhost:8000'; // Ensure this matches your server's Socket.io URL

const socket = io(SOCKET_SERVER_URL, {
  withCredentials: true,
});

socket.on('connect', () => {
  logger.info(`Socket.io client connected: ${socket.id}`);
});

socket.on('disconnect', () => {
  logger.info(`Socket.io client disconnected: ${socket.id}`);
});

export default socket;
