FROM python:3.11-slim

WORKDIR /app

# Instal dependency dulu (Layer ini akan di-cache)
RUN pip install --no-cache-dir redis numpy pandas docker

# Baru copy kode program
COPY . .

# Gunakan flag -u agar log muncul secara REAL-TIME (Unbuffered)
CMD ["python", "-u", "gatekeeper.py"]