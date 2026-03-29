import docker 
import redis
import time 
import json
import pandas as pd
import numpy as np
from datetime import datetime
import threading
import os

REDIS_HOST = os.getenv('REDIS_HOST', 'redis')
r = redis.Redis(
    host = REDIS_HOST,
    port = 6379,
    decode_responses = True
)

docker_client = docker.from_env()
NODES = {
    'ecommerce-apotek-api_server-1': 'A',
    'ecommerce-apotek-api_server-2': 'B',
    'ecommerce-apotek-api_server-3': 'C'
}

# konfigurasi format redis

NS_SYS = "aggregator:pid-ctr"
NS_FORE = "aggregator:forecaster:input"

# Metric Collector (PID-Controller)
def sensor_pid_thread():
    print(f"[*] Sensor PID aktif. Namespace: {NS_SYS}")
    while True:
        try:
            for container_name, node_label in NODES.items():
                container = docker_client.containers.get(container_name)
                s1 = container.stats(stream=False)
                time.sleep(0.1)
                s2 = container.stats(stream=False)

                cpu_delta = s2['cpu_stats']['cpu_usage']['total_usage'] - s1['cpu_stats']['cpu_usage']['total_usage']
                system_delta = s2['cpu_stats']['system_cpu_usage'] - s1['cpu_stats']['system_cpu_usage']

                if system_delta > 0 and cpu_delta > 0:
                    online_cpus = s2['cpu_stats'].get('online_cpus', 1)
                    cpu_usage = (cpu_delta / system_delta) * online_cpus * 100.0
                else:
                    cpu_usage = 0.0
                
                # aggregator:system:cpu:A
                r.set(f"{NS_SYS}:cpu:{node_label}", str(round(cpu_usage, 4)))
                print(f"[*] NODE {node_label} CPU: {round(cpu_usage, 2)}%")
            
            time.sleep(1)
        except Exception as e:
            print(f"[!] Error Sensor PID: {e}")
            time.sleep(2)

# Features (the forecaster)
def get_time_fetaures():
    now = datetime.now()
    return{
        "hour_of_day": now.hour,
        "day_of_week": now.weekday(),
        "is_weekend": 1 if now.weekday() >= 5 else 0,
        "holiday_flag": 0,
        "unique_id": time.time()
    }
def aggregate_forecaster():
    INTERVAL = 5
    print(f"[*] Forecaster Aktif. Namespace: {NS_FORE}")
    while True:
        try:
            features = get_time_fetaures()

            # Mengambil metrics 
            features["clean_request_rate"] = float(r.get("metrics:req_rate") or 0)
            features["active_sessions"] = int(r.get("metrics:sessions") or 0)
            features["avg_response_time"] = float(r.get("metrics:resp_time") or 0.0)

            # History 
            history_key = f"{NS_SYS}:history:req_rate"
            history = r.lrange(history_key, 0, 15)
            
            features["request_rate_t-1"] = float(history[0]) if len(history) > 0 else 0
            features["request_rate_t-5"] = float(history[4]) if len(history) > 4 else 0
            features["request_rate_t-15"] = float(history[14]) if len(history) > 14 else 0

            # Kapasitas server (Weights dari Load Balancer)
            features["server_A_capacity"] = float(r.get("weight:A") or 0.33)
            features["server_B_capacity"] = float(r.get("weight:B") or 0.33)
            features["server_C_capacity"] = float(r.get("weight:C") or 0.33)

            #Aggregator:forecaster:input
            r.set(NS_FORE, json.dumps(features))

            # Update history 
            r.lpush(history_key, features["clean_request_rate"])
            r.ltrim(history_key, 0, 60)

            print(f"[*] Forecaster Data Sent to {NS_FORE}")
            time.sleep(INTERVAL)

        except Exception as e:
            print(f"[!] Error Forecaster: {e}")
            time.sleep(5)

if __name__ == "__main__":
    threading.Thread(target=sensor_pid_thread, daemon=True).start()
    aggregate_forecaster()
