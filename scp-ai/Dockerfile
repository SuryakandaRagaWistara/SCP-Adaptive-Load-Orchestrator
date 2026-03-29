FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./


RUN npm install --omit=dev
COPY . .

ENV NODE_ENV=production
CMD ["node", "index.js"]