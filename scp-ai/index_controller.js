const { redis, fetch_forecaster_data } = require('./utils/redis_client');
const forecaster = require('./lib/forecaster');
const { pidController } = require('./lib/pid_controller');

async function main() {
    console.log('[*] Starting Controller Engine...');
    
    // 1. Inisialisasi Forecaster dengan Try-Catch
    try {
        await forecaster.init();
        console.log('[*] Forecaster (ONNX) loaded successfully.');
    } catch (err) {
        console.error('[!] Forecaster Load Error:', err.message);
        console.log('[*] Running in PID-Only mode...');
    }

    let last_processed_forecast = null;

    while (true) {
        try {
            const forecaster_data = await fetch_forecaster_data();
            
            // 2. Proteksi Data Kosong
            // Jika Redis habis di-FLUSH, forecaster_data.raw_input akan null
            if (forecaster_data && forecaster_data.raw_input && forecaster_data.raw_input !== last_processed_forecast) {
                try {
                    const data = JSON.parse(forecaster_data.raw_input);
                    
                    // Pastikan model ONNX siap sebelum prediksi
                    if (data && forecaster.session) {
                        const feature_array = Object.values(data);
                        const forecast_res = await forecaster.predictBaseline(feature_array, forecaster_data.current_cpu);
                        
                        if (forecast_res) {
                            await redis.set("forecaster:output", JSON.stringify(forecast_res));
                            last_processed_forecast = forecaster_data.raw_input;
                            console.log(`[AI] New Baseline: q50 ${forecast_res.predicted_q50.toFixed(2)}`);
                        }
                    }
                } catch (jsonErr) {
                    console.error(`[AI-Error] Gagal parse/predict:`, jsonErr.message);
                }
            }

            // 3. Jalankan PID tetap jalan meskipun AI gagal/kosong
            // PID akan mengambil default baseline (0.33) jika forecaster:output belum ada
            await pidController();

        } catch (err) {
            console.error(`[Loop-Error]`, err.message);
        }

        // Jeda 1 detik
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

// Global error handler agar tidak silent death
main().catch(err => {
    console.error("[FATAL ERROR]", err);
    process.exit(1);
});