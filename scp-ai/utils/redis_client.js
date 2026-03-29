// utils/redis_client.js

const Redis = require('ioredis');
const REDIS_HOST = process.env.REDIS_HOST || 'redis';

// konfiguras
const redis = new Redis({
    host: REDIS_HOST,
    port: 6379,
    connectTimeout: 10000, 
    retryStrategy(times) {
        return Math.min(times * 50, 2000);
    }
});

redis.on('connect', () => console.log('[*] Redis: Connected.'));
redis.on('error', (err) => {
    if (err.code === 'ETIMEDOUT') {
        console.error('[!] Redis Timeout: Server terlalu sibuk.');
    } else {
        console.error('[!] Redis Error:', err.message);
    }
});

/**
 * Mengambil keys untuk Gatekeeper berdasarkan namespace input aggregator
 */
async function fetch_gatekeeper_data() {
    try {
        const found_keys = await redis.keys('aggregator:gatekeeper:input:*');
        return found_keys; 
    } catch (e) { 
        console.error(`[!] fetch_gatekeeper_data error: ${e.message}`);
        return []; 
    }
}

/**
 * Mengambil semua data sistem yang diperlukan untuk Forecaster
 */
async function fetch_forecaster_data() {
    try {
        const raw_input = await redis.get("aggregator:forecaster:input");
        if (!raw_input) return null;

        // Ambil metrik CPU dari namespace pid-ctr
        const [cpu_a, cpu_b, cpu_c] = await Promise.all([
            redis.get("aggregator:pid-ctr:cpu:A"),
            redis.get("aggregator:pid-ctr:cpu:B"),
            redis.get("aggregator:pid-ctr:cpu:C"),
        ]);

        return {
            raw_input: raw_input,
            current_cpu: {
                a: parseFloat(cpu_a) || 0,
                b: parseFloat(cpu_b) || 0,
                c: parseFloat(cpu_c) || 0
            }
        };
    } catch (e) { 
        console.error(`[!] fetch_forecaster_data error: ${e.message}`);
        return null;
    }
}

module.exports = { redis, fetch_gatekeeper_data, fetch_forecaster_data };