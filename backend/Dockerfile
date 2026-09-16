FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts
COPY database ./database

# multer's diskStorage destination callback does not create the directory.
# The volume mounts over this path, but it must exist and be writable.
RUN mkdir -p uploads/observations && chown -R node:node /app

USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
