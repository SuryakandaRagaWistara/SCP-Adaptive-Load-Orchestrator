FROM python:3.11-slim

WORKDIR /app

# Instal library sistem untuk PostgreSQL & Pandas
RUN apt-get update && apt-get install -y --no-install-recommends     libpq-dev     gcc     python3-dev     && rm -rf /var/lib/apt/lists/*

# Langsung instal library yang dibutuhkan (Tanpa Typo)
RUN pip install --no-cache-dir flask pandas redis psycopg2-binary

COPY . .

CMD ["python", "main.py"]
