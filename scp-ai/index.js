const { redis, fetch_gatekeeper_data, fetch_forecaster_data } = require('./utils/redis_client');
const gatekeeper = require('./lib/gatekeeper');
const forecaster = require('./lib/forecaster');
// const { pid_controller } = require('./lib/pid_controller');

async function main() {
    await gatekeeper.init();
    await forecaster.init();
    console.log('[*] Gatekeeper is ready.');
    console.log('[*] Forecaster is ready.');

    // setInterval(() => {
    //     pid_controller().catch(err => {
    //         console.error(`[error] PID controller error: `, err.message);
    //     });
    // }, 5000);
    // console.log(`[Done] PID controller start.`);

    let last_processed_forecast = null;

    while (true) {
        try {
            // --- 1. PROSES FORECASTER ---
            const forecaster_data = await fetch_forecaster_data();
            if (forecaster_data && forecaster_data.raw_input !== last_processed_forecast) {
                const data = JSON.parse(forecaster_data.raw_input);

                if (data) {
                    const feature_array = Object.values(data);

                    const forecast_res = await forecaster.predictBaseline(feature_array, forecaster_data.current_cpu);
                    if (forecast_res){
                        const forecast_pipeline = redis.pipeline();
                        forecast_pipeline.set("forecaster:output", JSON.stringify(forecast_res));

                        forecast_pipeline.set("weight:A", forecast_res.baselines.A);
                        forecast_pipeline.set("weight:B", forecast_res.baselines.B);
                        forecast_pipeline.set("weight:C", forecast_res.baselines.C);
                    
                        await forecast_pipeline.exec();

                        console.log(`[forecast] q50: ${forecast_res.predicted_q50} | q90: ${forecast_res.predicted_q90} | w_a: ${forecast_res.baselines.A} | w_b: ${forecast_res.baselines.B} | w_c: ${forecast_res.baselines.C}`);
                        last_processed_forecast = forecaster_data.raw_input;
                    }
                }
            }    
            // --- 2. PROSES GATEKEEPER ---
            const keys = await fetch_gatekeeper_data();
            if (keys.length > 0) {
                const pipeline = redis.pipeline();
                keys.forEach(key => pipeline.get(key));
                const results = await pipeline.exec();

                const delete_pipeline = redis.pipeline();

                for (let i = 0; i < keys.length; i++) {
                    const raw_data = results[i][1];
                    if (!raw_data) continue;

                    try {
                        const parsed = JSON.parse(raw_data);
                        const is_attack = await gatekeeper.predict(parsed); 

                        if (is_attack === 1) {
                            delete_pipeline.setex(`ip_blocked:${parsed.ip}`, 300, '1');
                            console.log(`[BOT] ALERT: ${parsed.ip} di-block.`);
                        }
                    } catch (e) {}
                    
                    delete_pipeline.del(keys[i]);
                }
                await delete_pipeline.exec();
            }
                        
        } catch (err) {
            console.error(`[error] Error in processing loop:`, err.message);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
    }
}

main().catch(console.error);