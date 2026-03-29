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
REDIS_HOST = "redis"
QUEUE_NAME = "log_queue"

r = redis.Redis(host=REDIS_HOST, port=6379, decode_responses=True)


NS_GATE = "aggregator:gatekeeper:input"

@lru_cache(maxsize=512)
def calculate_entropy(s):
    if not s: return 0.0
    counts = Counter(s)
    length = len(s)
    probs = [count / length for count in counts.values()]
    return float(-sum(p * math.log2(p) for p in probs))

# --- FUNGSI 1: PRODUCER (DEBUG) ---
def tail_producer():
    if not os.path.exists(LOG_FILE):
        print(f"[!] ERROR: File {LOG_FILE} tidak ditemukan!")
        return
    print(f"[*] Producer started: Tailing {LOG_FILE}...", flush=True)
    with open(LOG_FILE, "r") as f:
        f.seek(0, os.SEEK_END)
        while True:
            line = f.readline()
            if not line:
                time.sleep(0.1)
                continue
            
            # DEBUG: Lihat data mentah yang baru masuk ke file log
            raw_line = line.strip()
            print(f"[DEBUG IN] Raw Log: {raw_line[:80]}...", flush=True)
            r.rpush(QUEUE_NAME, raw_line)

# --- FUNGSI 2: CONSUMER (DEBUG) ---
def process_window_1s():
    print("[*] Consumer started: 1s Window | 7 Features | Ready for ONNX...", flush=True)
    while True:
        start_time = time.time()
        logs_in_window = []

        while time.time() - start_time < 1.0:
            items = r.lpop(QUEUE_NAME, 100)
            if items:
                if isinstance(items, str): items = [items]
                logs_in_window.extend(items)
            else:
                time.sleep(0.01)

        if not logs_in_window:
            continue

        # DEBUG: Jumlah log yang ditarik dari Redis dalam 1 detik
        print(f"[DEBUG PROCESS] Processing {len(logs_in_window)} logs from queue", flush=True)

        data_per_ip = defaultdict(list)
        parsed_count = 0

        for line in logs_in_window:
            try:
                parts = line.split()
                # DEBUG: Jika log dibuang karena format tidak sesuai
                if len(parts) < 10: 
                    print(f"[DEBUG SKIP] Log terlalu pendek ({len(parts)} parts): {line[:50]}", flush=True)
                    continue
                
                # Nginx default: IP di index 0, Status di 8, Size di 9
                ip = parts[0]
                status = int(parts[8])
                size = int(parts[9]) if parts[9] != '-' else 0
                ua = " ".join(parts[11:])
                
                current_count = len(data_per_ip[ip])
                simulated_arrival = time.time() + (current_count * 0.001) 

                data_per_ip[ip].append({
                    "size": size, "status": status, "ua": ua, "arrival_time": simulated_arrival
                })
                parsed_count += 1
            except Exception as e:
                print(f"[DEBUG ERROR] Parsing failed: {e} | Line: {line[:50]}", flush=True)
                continue

        print(f"[DEBUG PROCESS] Successfully parsed {parsed_count}/{len(logs_in_window)} logs", flush=True)

        for ip, logs in data_per_ip.items():
            sizes = [l['size'] for l in logs]
            statuses = [l['status'] for l in logs]
            arrival_times = [l['arrival_time'] for l in logs]

            intervals = np.diff(arrival_times) if len(arrival_times) > 1 else [0.0]
            ua_entropy_val = calculate_entropy(logs[0]['ua'])

            req_rate = len(logs)
            p_mean = float(np.mean(sizes))
            p_var = float(np.var(sizes)) if len(sizes) > 1 else 0.0
            ua_ent = float(ua_entropy_val)
            int_var = float(np.var(intervals)) if len(intervals) > 1 else 0.0
            stat_ratio = sum(1 for s in statuses if s >= 400) / len(logs)
            sens_ratio = 0.0 

            onnx_input = [req_rate, p_mean, p_var, ua_ent, int_var, stat_ratio, sens_ratio]

            # DEBUG: Hasil akhir fitur per IP
            print(f"[DEBUG OUT] IP: {ip} | Features: {onnx_input}", flush=True)

            output_payload = {
                "ip": ip,
                "features": onnx_input,
                "metadata": {"req_rate": req_rate, "p_mean": p_mean, "int_var": int_var, "stat_ratio": stat_ratio}
            }

            r.setex(f"{NS_GATE}:{ip}", 10, json.dumps(output_payload))

# --- EXECUTION ---
if __name__ == "__main__":
    # Menjalankan thread background (forecaster dkk)
    try:
        from the_forecaster import sensor_pid_thread, aggregate_forecaster
        threading.Thread(target=sensor_pid_thread, daemon=True).start()
        threading.Thread(target=aggregate_forecaster, daemon=True).start()
        print(f"[*] Forecaster threads diaktifkan")
    except ImportError:
        print(f"[*] Forecaster module not found, skipping...")

    t1 = threading.Thread(target=tail_producer, daemon=True)
    t1.start()

    try:
        process_window_1s()
    except KeyboardInterrupt:
        print("\n[*] Stopped.")