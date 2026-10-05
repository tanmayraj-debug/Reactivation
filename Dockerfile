# Full Node image (not -slim) so better-sqlite3 can compile its native binding
FROM node:20-bookworm
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p /app/data /app/uploads
EXPOSE 3000
CMD ["node", "server.js"]
