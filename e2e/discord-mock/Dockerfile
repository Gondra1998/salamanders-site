FROM oven/bun:1.4.4-alpine
WORKDIR /app
COPY server.js ./
# The Reliquarium's attachments (clip.mp4, clip.webm, art.png), served at /cdn/<name>.
COPY fixtures ./fixtures
EXPOSE 4400
CMD ["bun", "run", "server.js"]
