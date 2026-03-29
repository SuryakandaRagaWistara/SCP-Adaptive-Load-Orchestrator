FROM node:20-slim

# 1. Instal library sistem (tetap di awal karena jarang berubah)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 2. HANYA copy file package untuk instalasi library
# Ini agar Docker bisa me-cache 'node_modules'
COPY package*.json ./

# 3. Jalankan instalasi
# Jika package.json tidak ada di host, build ini akan gagal (lebih baik daripada npm init otomatis)
RUN npm install --omit=dev
# 4. Baru copy seluruh sisa kode aplikasi
COPY . .

ENV NODE_ENV=production
CMD ["node", "index.js"]