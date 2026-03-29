// pid_tuner.js
const axios = require('axios');

async function tuneNode(nodeUrl) {
    console.log(`--- Tuning Started for ${nodeUrl} ---`);
    
    let startTime = Date.now();
    let cpuHistory = [];
    
    // 1. Ambil data "Step Response"
    // Kita beri beban konstan dan lihat bagaimana CPU naik (R) dan delay-nya (L)
    for (let i = 0; i < 50; i++) {
        const startReq = Date.now();
        await axios.get(nodeUrl).catch(() => {});
        const latency = Date.now() - startReq;
        
        // Asumsi: Kita mendapat data CPU real-time dari aggregator/stats
        // Di sini kita simulasi kenaikan berdasarkan latensi
        let simulatedCpu = Math.min(0.9, (latency / 1000)); 
        cpuHistory.push(simulatedCpu);
    }

    // 2. Analisis Kurva Ziegler-Nichols
    // L = Delay time (Waktu sampai CPU mulai bereaksi)
    // T = Time constant (Waktu sampai mencapai titik stabil baru)
    // R = Slope (R = Delta CPU / Delta Time)
    
    let L = 0.1; // Contoh delay 100ms
    let T = (Date.now() - startTime) / 1000;
    let deltaCpu = cpuHistory[cpuHistory.length - 1] - cpuHistory[0];
    let R = deltaCpu / T;

    // 3. Rumus Ziegler-Nichols untuk PID Controller:
    // Kp = 1.2 / (R * L)
    // Ti = 2 * L  -> Ki = Kp / Ti
    // Td = 0.5 * L -> Kd = Kp * Td

    let Kp = 1.2 / (R * L);
    let Ki = Kp / (2 * L);
    let Kd = Kp * (0.5 * L);

    return {
        node: nodeUrl,
        recommended_config: {
            target_cpu: 0.7,
            Kp: parseFloat(Kp.toFixed(3)),
            Ki: parseFloat(Ki.toFixed(3)),
            Kd: parseFloat(Kd.toFixed(3))
        }
    };
}

// Eksekusi
tuneNode('http://localhost:8001/api/test').then(console.log);