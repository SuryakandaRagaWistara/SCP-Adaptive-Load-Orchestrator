#!/bin/bash
# ========================================================================
#          SUPER MONITOR ECOMMERCE APOTEK - DEBUG MODE
# ========================================================================

clear
echo "========================================================================"
echo "          LIVE MONITOR ECOMMERCE APOTEK - $(date)"
echo "========================================================================"

# 1. RESOURCE USAGE
echo "[1] KONSUMSI SUMBER DAYA (CONTAINERS)"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemPerc}}" | head -n 8
echo ""

# 2. STATUS LOAD BALANCING (PID)
echo "[2] STATUS WEIGHTS & CPU (AI + PID)"
data=$(docker exec ecommerce-apotek-redis-1 redis-cli --raw MGET \
    weight:A weight:B weight:C \
    aggregator:pid-ctr:cpu:A aggregator:pid-ctr:cpu:B aggregator:pid-ctr:cpu:C \
    metrics:req_rate 2>/dev/null)

if [ ! -z "$data" ]; then
    wa=$(echo "$data" | sed -n '1p'); wb=$(echo "$data" | sed -n '2p'); wc=$(echo "$data" | sed -n '3p')
    ca=$(echo "$data" | sed -n '4p'); cb=$(echo "$data" | sed -n '5p'); cc=$(echo "$data" | sed -n '6p')
    rps=$(echo "$data" | sed -n '7p')
    
    printf "%-10s | %-12s | %-12s\n" "NODE" "WEIGHT" "REAL CPU"
    echo "----------------------------------------------------"
    printf "%-10s | %-12s | %-12s\n" "Node A" "${wa:-0.333}" "${ca:-0.0}"
    printf "%-10s | %-12s | %-12s\n" "Node B" "${wb:-0.333}" "${cb:-0.0}"
    printf "%-10s | %-12s | %-12s\n" "Node C" "${wc:-0.333}" "${cc:-0.0}"
    echo "Current Traffic: ${rps:-0} req/s"
fi
echo ""

# 3. SECURITY AUDIT (GATEKEEPER)
echo "[3] SECURITY AUDIT (GATEKEEPER)"
# Ambil info antrean
queue_len=$(docker exec ecommerce-apotek-redis-1 redis-cli LLEN gatekeeper_queue 2>/dev/null)
blocked_keys=$(docker exec ecommerce-apotek-redis-1 redis-cli KEYS "ip_blocked:*" 2>/dev/null)
blocked_count=$(echo "$blocked_keys" | grep -v '^$' | wc -l)

# Peek data terakhir di queue (buat liat fitur Sens secara live)
raw_peek=$(docker exec ecommerce-apotek-redis-1 redis-cli LINDEX gatekeeper_queue 0 2>/dev/null)
last_ip=$(echo $raw_peek | grep -oP '(?<="ip":")[^"]*')
last_sens=$(echo $raw_peek | grep -oP '(?<="features":\[).*?(?=\])' | awk -F',' '{print $7}')

echo "IP Terblokir  : $blocked_count"
echo "Antrean Queue : ${queue_len:-0}"
echo "----------------------------------------------------"
echo "Live Inspection (Top of Queue):"
if [ ! -z "$last_ip" ]; then
    printf " IP: %-15s | Sens Ratio: %-10s\n" "$last_ip" "$last_sens"
else
    echo " [.] No incoming features to inspect."
fi
echo ""

# 4. RECENT BLOCKED LIST
echo "[4] RECENT BLOCKED IPs (Last 5)"
echo "----------------------------------------------------"
if [ -z "$blocked_keys" ]; then
    echo " No IPs are currently blocked."
else
    echo "$blocked_keys" | tail -n 5 | sed 's/ip_blocked://g' | sed 's/^/ [🚨] /'
fi
echo ""

# 5. DIAGNOSTIC
if [ "${queue_len:-0}" -gt 20 ]; then
    echo ">>> [⚠️] STATUS: BOTTLENECK DETECTED! Workers are slow."
elif [ "$blocked_count" -gt 0 ]; then
    echo ">>> [🛡️] STATUS: ACTIVE DEFENSE. System is blocking IPs."
else
    echo ">>> [✅] STATUS: ALL CLEAR. No anomalies detected."
fi