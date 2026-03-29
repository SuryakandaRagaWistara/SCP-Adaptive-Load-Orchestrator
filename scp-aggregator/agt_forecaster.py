import docker
import redis
import time 
import json
from datetime import datetime
import threading
import os

# konfurasi
REDIS_HOST = os.getenv('REDIS_HOST', 'redis')
r = redis.Redis(
    host=REDIS_HOST,
    port=6379,
    decode_responses=True
)

docker_client = docker.from_env()
NODES = {
    'ecommerce-apotek-api_server-1': 'A',
    'ecommerce-apotek-api_server-2': 'B',
    'ecommerce-apotek-api_server-3': 'C'
}

NS_SYS = "aggregator:pid-ctr"
NS_FORE = "aggregator:forecaster:input"

# SENSOR PID 
def sensor_pid_thread():
    print(f"[*] Sensor PID aktif. Monitoring: {list(NODES.keys())}", flush=True)
    while True:
        try:
            for container_name, node_label in NODES.items():
                container = docker_client.containers.get(container_name)
                s1 = container.stats(stream=False)
                time.sleep(0.05) # Jeda singkat untuk delta
                s2 = container.stats(stream=False)

                cpu_delta = s2['cpu_stats']['cpu_usage']['total_usage'] - s1['cpu_stats']['cpu_usage']['total_usage']
                system_delta = s2['cpu_stats']['system_cpu_usage'] - s1['cpu_stats']['system_cpu_usage']

                if system_delta > 0 and cpu_delta > 0:
                    online_cpus = s2['cpu_stats'].get('online_cpus', 1)
                    cpu_usage = (cpu_delta / system_delta) * online_cpus * 100.0
                else:
                    cpu_usage = 0.0
                
                r.set(f"{NS_SYS}:cpu:{node_label}", str(round(cpu_usage, 4)))
            
            time.sleep(1) 
        except Exception as e:
            print(f"[!] Error Sensor PID: {e}", flush=True)
            time.sleep(2)

# get time
def get_time_features():
    now = datetime.now()
    return {
        "hour_of_day": now.hour,
        "day_of_week": now.weekday(),
        "is_weekend": 1 if now.weekday() >= 5 else 0,
        "holiday_flag": 0
    }

# aggregator forecaster
def aggregate_forecaster():
    INTERVAL = 5
    print(f"[*] Forecaster Aktif. Namespace: {NS_FORE}", flush=True)
    history_key = f"{NS_SYS}:history:req_rate"

    while True:
        try:
            now = datetime.now()
            raw_req_rate = float(r.get("metrics:req_rate") or 0)
            history = r.lrange(history_key, 0, 15)

            feature_array = [
                float(now.hour),                             # 1
                float(now.weekday()),                        # 2
                float(1 if now.weekday() >= 5 else 0),       # 3
                0.0,                                         # 4 (holiday_flag)
                raw_req_rate,                                # 5
                float(r.get("metrics:sessions") or 0),       # 6
                float(r.get("metrics:resp_time") or 0.0),    # 7
                float(history[0]) if len(history) > 0 else 0.0,  # 8 (t-1)
                float(history[4]) if len(history) > 4 else 0.0,  # 9 (t-5)
                float(history[14]) if len(history) > 14 else 0.0, # 10 (t-15)
                float(r.get("weight:A") or 0.33),            # 11
                float(r.get("weight:B") or 0.33),            # 12
                float(r.get("weight:C") or 0.33)             # 13
            ]

            if len(feature_array) == 13:
                r.set(NS_FORE, json.dumps(feature_array))
                
                r.lpush(history_key, raw_req_rate)
                r.ltrim(history_key, 0, 60)
                
                print(f"[*] Forecaster: 13 Features array sent. RPS: {raw_req_rate}", flush=True)
            else:
                print(f"[!] Error: Fitur berjumlah {len(feature_array)}, harusnya 13!", flush=True)

            time.sleep(INTERVAL)

        except Exception as e:
            print(f"[!] Error Forecaster: {e}", flush=True)
            time.sleep(INTERVAL)

if __name__ == "__main__":
    # Jalankan monitor CPU di thread background
    threading.Thread(target=sensor_pid_thread, daemon=True).start()
    
    # Jalankan aggregator utama
    aggregate_forecaster()