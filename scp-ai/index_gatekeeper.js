const { redis } = require('./utils/redis_client');
const gatekeeper = require('./lib/gatekeeper');

// --- KONFIGURASI ---
const CONCURRENCY = 15;
const EMERGENCY_THRESHOLD = 0.85;
const MIN_SENS_FOR_AI = 0.2;

/**
 * logika pemrosesan permintaan (request processing).
 * menerapkan sistem filter bertingkat untuk efisiensi sumber daya:
 * 1. layer 0: pengecekan status blokir yang sudah ada.
 * 2. layer 1: emergency block berdasarkan ambang batas sensitivitas ekstrem.
 * 3. layer 1.5: fast rule untuk mendeteksi lonjakan (spike) tanpa ai.
 * 4. layer 2: klasifikasi mendalam menggunakan model ai onnx.
 */
async function processRequest(workerId, parsed) {
    const { ip, features } = parsed;
    const sens_ratio = features[6] || 0;
    const req_rate = features[0] || 0;
    const blockKey = `ip_blocked:${ip}`;

    try {
        const alreadyBlocked = await redis.exists(blockKey);
        if (alreadyBlocked) return;

        if (sens_ratio > EMERGENCY_THRESHOLD) {
            const res = await redis.set(blockKey, '1', 'EX', 300, 'NX');

            if (res === 'OK') {
                console.log(`[🚨][W-${workerId}] EMERGENCY BLOCK: ${ip} (Sens: ${sens_ratio.toFixed(4)})`);
            }
            return;
        }
        if (req_rate >= 3 && sens_ratio > 0.4) {
            const res = await redis.set(blockKey, '1', 'EX', 300, 'NX');

            if (res === 'OK') {
                console.log(`[⚡][W-${workerId}] FAST BLOCK: ${ip} (RPS: ${req_rate}, Sens: ${sens_ratio.toFixed(4)})`);
            }
            return;
        }

        if (sens_ratio < MIN_SENS_FOR_AI) return;

        const prediction = await gatekeeper.predict(parsed);

        if (prediction === 1) {
            const res = await redis.set(blockKey, '1', 'EX', 300, 'NX');

            if (res === 'OK') {
                console.log(`[🚨][W-${workerId}] AI BLOCKED: ${ip}`);
            }
        } else {
            if (sens_ratio > 0.4) {
                console.log(`[⚠️][W-${workerId}] WATCH: ${ip} (Sens: ${sens_ratio.toFixed(4)})`);
            }
        }

    } catch (err) {
        console.error(`[!][Worker ${workerId}] Error:`, err.message);
    }
}

/**
 * mekanisme worker pool.
 * mengambil data dari antrean redis secara kompetitif menggunakan blpop.
 * concurrency yang tinggi memungkinkan pemrosesan ribuan log per detik 
 * tanpa menghambat alur data utama.
 */
async function worker(id) {
    console.log(`[*] Worker ${id} ready`);

    while (true) {
        try {
            const data = await redis.blpop("gatekeeper_queue", 0);
            if (!data || !data[1]) continue;

            const parsed = JSON.parse(data[1]);
            await processRequest(id, parsed);

        } catch (err) {
            console.error(`[!][Worker ${id}] Loop Error:`, err.message);
            await new Promise(r => setTimeout(r, 500));
        }
    }
}

/**
 * inisialisasi engine gatekeeper.
 * memuat model ai ke memori dan menyebarkan worker sesuai jumlah 
 * concurrency yang dikonfigurasi untuk mulai mendengarkan antrean log.
 */
async function main() {
    try {
        console.log('--- GATEKEEPER HYBRID ENGINE (OPTIMIZED) ---');

        await gatekeeper.init();

        const workers = [];
        for (let i = 0; i < CONCURRENCY; i++) {
            workers.push(worker(i));
        }

        console.log(`[*] ${CONCURRENCY} workers running`);
        await Promise.all(workers);

    } catch (err) {
        console.error('[!] Fatal:', err.message);
        process.exit(1);
    }
}

main().catch(console.error);