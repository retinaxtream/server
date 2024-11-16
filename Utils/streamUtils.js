// Utils/streamUtils.js

/**
 * Convert a readable stream to a buffer
 * @param {ReadableStream} stream 
 * @returns {Promise<Buffer>}
 */
export const streamToBuffer = (stream) => {
    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  };
   