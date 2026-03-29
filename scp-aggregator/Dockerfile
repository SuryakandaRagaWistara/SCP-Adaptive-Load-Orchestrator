FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir redis numpy pandas docker

COPY . .

CMD ["python", "-u", "gatekeeper.py"]