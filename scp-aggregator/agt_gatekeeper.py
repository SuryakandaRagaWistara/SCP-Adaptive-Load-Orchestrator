import time
import redis
import os
import threading
import json
import numpy as np
import math
from collections import Counter, defaultdict
from functools import lru_cache

# --- KONFIGURASI ---
LOG_FILE = "/var/log/nginx/access.log" 
REDIS_HOST = os.getenv('REDIS_HOST', 'redis')
QUEUE_NAME = "log_queue"

# Redis client
r = redis.Redis(host=REDIS_HOST, port=6379, decode_responses=True)

@lru_cache(maxsize=512)
def calculate_entropy(s):
    if not s: return 0.0
    counts = Counter(s)
    length = len(s)
    probs = [count / length for count in counts.values()]
    return float(-sum(p * math.log2(p) for p in probs))

# --- PRODUCER ---
def tail_producer():
    if not os.path.exists(LOG_FILE):
        print(f"[!] ERROR: File {LOG_FILE} tidak ditemukan.", flush=True)
        return
    
    print(f"[*] Producer started: Tailing {LOG_FILE}...", flush=True)
    
    with open(LOG_FILE, "r") as f:
        f.seek(0, os.SEEK_END)
        while True:
            line = f.readline()
            if not line:
                current_pos = f.tell()
                if os.path.getsize(LOG_FILE) < current_pos:
                    f.seek(0, os.SEEK_SET)
                time.sleep(0.1)
                continue
            
            raw_line = line.strip()
            if raw_line:
                r.rpush(QUEUE_NAME, raw_line)

# --- CONSUMER ---
def process_window():
    print("[*] Consumer started: 0.5s Window | Optimized Mode...", flush=True)

    while True:
        start_time = time.time()
        logs_in_window = []

        # Ambil log selama 0.5 detik
        while time.time() - start_time < 0.5:
            for _ in range(100):
                item = r.lpop(QUEUE_NAME)
                if not item:
                    break
                logs_in_window.append(item)
            if not logs_in_window:
                time.sleep(0.01)

        if not logs_in_window:
            r.setex("metrics:req_rate", 5, "0")
            continue

        r.setex("metrics:req_rate", 5, str(len(logs_in_window)))

        data_per_ip = defaultdict(list)

        # Parsing log
        for line in logs_in_window:
            try:
                parts = line.split()
                if len(parts) < 10:
                    continue
                
                ip = parts[0]
                status = int(parts[8])
                size = int(parts[9]) if parts[9] != '-' else 0
                ua = " ".join(parts[11:])
                
                data_per_ip[ip].append({
                    "size": size,
                    "status": status,
                    "ua": ua,
                    "arrival_time": time.time()
                })
            except:
                continue

        # Feature extraction
        for ip, logs in data_per_ip.items():
            sizes = [l['size'] for l in logs]
            statuses = [l['status'] for l in logs]
            arrival_times = [l['arrival_time'] for l in logs]

            intervals = np.diff(arrival_times) if len(arrival_times) > 1 else [0.0]

            req_rate = len(logs)
            p_mean = float(np.mean(sizes))
            p_var = float(np.var(sizes)) if len(sizes) > 1 else 0.0
            ua_ent = float(calculate_entropy(logs[0]['ua']))
            int_var = float(np.var(intervals)) if len(intervals) > 1 else 0.0
            stat_ratio = sum(1 for s in statuses if s >= 400) / len(logs)

            # --- LONG-TERM MEMORY (30s) ---
            history_key = f"gatekeeper:history:{ip}"
            total_accumulated = r.incrby(history_key, req_rate)
            r.expire(history_key, 30)

            # --- SHORT-TERM SPIKE MEMORY (2s) ---
            spike_key = f"gatekeeper:spike:{ip}"
            spike = r.incr(spike_key)
            r.expire(spike_key, 2)

            # --- COMBINED SIGNAL ---
            combined_total = total_accumulated + spike

            # --- SENSITIVITY ---
            sensitive_ratio_val = float(1 - math.exp(-combined_total / 2))

            # --- FINAL FEATURE VECTOR ---
            onnx_input = [
                float(req_rate),
                p_mean,
                p_var,
                ua_ent,
                int_var,
                stat_ratio,
                sensitive_ratio_val
            ]

            payload = {
                "ip": ip,
                "features": onnx_input
            }

            # Debug log (lebih informatif)
            print(
                f"[DEBUG OUT] IP: {ip} | Win: {req_rate} | Total: {total_accumulated} | Spike: {spike} | Sens: {sensitive_ratio_val:.4f}",
                flush=True
            )

            # Kirim ke Gatekeeper
            r.lpush("gatekeeper_queue", json.dumps(payload))


if __name__ == "__main__":
    t1 = threading.Thread(target=tail_producer, daemon=True)
    t1.start()

    try:
        process_window()
    except KeyboardInterrupt:
        print("\n[*] Stopped.")