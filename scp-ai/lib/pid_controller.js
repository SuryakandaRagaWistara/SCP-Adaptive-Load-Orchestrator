const { redis } = require('../utils/redis_client');

const CONFIG = {
    target_cpu: 0.7,
    Kp: 0.5, Ki: 0.01, Kd: 0.1, 
    nodes: ['A', 'B', 'C'],
    min_weight: 0.01
};

async function pidController() {
    try {
        const currentWeight = await redis.mget('weight:A', 'weight:B', 'weight:C');
        
        const forecastRaw = await redis.get("forecaster:output");
        const forecast = forecastRaw ? JSON.parse(forecastRaw) : null;

        let adjustedWeights = {};
        let cpuValues = {}; 
        let total = 0;

        for (const node of CONFIG.nodes) {
            const cpu = parseFloat(await redis.get(`aggregator:pid-ctr:cpu:${node}`)) || 0;
            cpuValues[node] = cpu; 
            
            const state = await redis.hgetall(`pid_state:${node}`);
            const nodeIdx = CONFIG.nodes.indexOf(node);
            
            let lastW = parseFloat(currentWeight[nodeIdx]) || 0.33;
            
            let sumError = parseFloat(state.sum_error) || 0;
            let lastError = parseFloat(state.last_error) || 0;

            const error = CONFIG.target_cpu - cpu;
            sumError += error;
            
            if (sumError > 2) sumError = 2;
            if (sumError < -2) sumError = -2;

            const deltaError = error - lastError;
            const adjust = (CONFIG.Kp * error) + (CONFIG.Ki * sumError) + (CONFIG.Kd * deltaError);

            let newW = lastW + adjust;

            if (forecast) {
                const base = forecast.baselines[node];
                newW += (base - newW) * 0.05; 
            }

            if (newW < CONFIG.min_weight) newW = CONFIG.min_weight;
            
            adjustedWeights[node] = newW;
            total += newW;

            await redis.hmset(`pid_state:${node}`, {
                sum_error: sumError.toFixed(4),
                last_error: error.toFixed(4)
            });
        }

        const pipeline = redis.pipeline();
        for (const node of CONFIG.nodes) {
            const finalW = (adjustedWeights[node] / total).toFixed(3);
            pipeline.set(`weight:${node}`, finalW);
            
            // Perbaikan: Gunakan cpuValues[node]
            console.log(`[*] PID Node ${node} | CPU: ${cpuValues[node]} | Final: ${finalW}`);
        }
        await pipeline.exec();

    } catch (err) {
        console.error("[!] Error: ", err.message);
    }
}

module.exports = { pidController };