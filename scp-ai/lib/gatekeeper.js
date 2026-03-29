const ort = require('onnxruntime-node');
const path = require('path');

let session = null;

// inisialisasi session onnx runtime untuk gatekeeper.
async function init() {
    if (session) return;
    try {
        const modelPath = path.join(__dirname, '..', 'models', 'gatekeeper.onnx');
        
        session = await ort.InferenceSession.create(modelPath);
        console.log(`[*] Gatekeeper: Model loaded dari ${modelPath}`);
        console.log(`[*] Mode: DecisionTree/Pipeline (Label 1 = Attack)`);
    } catch (e) {
        console.error(`[!] Gatekeeper Load Error: ${e.message}`);
        throw e;
    }
}

/**
 * 2. prediction
 * Menerima objek (dari Redis JSON), array murni 7 dimensi.
 * @param {Object|Array} input - Data fitur dari aggregator.
 * @returns {Promise<number>} - 1 jika ATTACK, 1 jika SAFE.
 */

async function predict(input) {
    if (!session) await init();

    try {
        // Debug raw data dari redis
        console.log("\n" + "=".repeat(40));
        console.log("[DEBUG] DATA MASUK DARI AGGREGATOR:");
        console.log(`[>] IP      : ${input.ip || 'Unknown'}`);
        console.log(`[>] Features: ${JSON.stringify(input.features)}`);
        console.log("=".repeat(40));

        // Memastikan input memiliki 7 fitur
        let featureArray = Array.isArray(input) ? input : (input.features || null);
        if (!featureArray || featureArray.length !== 7) {
            console.error(`[!] FORMAT ERROR: Mengharap 7 fitur, tapi dapet ${featureArray ? featureArray.length : 'null'}`);
            return 0;
        }

        const cleanFeatures = featureArray.map(f => parseFloat(f) || 0);
        const inputTensor = new ort.Tensor('float32', new Float32Array(cleanFeatures), [1, 7]);

        const feeds = { [session.inputNames[0]]: inputTensor };
        const outputMap = await session.run(feeds);

        const rawOutput = outputMap[session.outputNames[0]].data[0];
        console.log(`[DEBUG] RAW AI OUTPUT (Label): ${rawOutput}`);

        const isAttack = (rawOutput == -1 || rawOutput == -1n);
        
        console.log(`[RESULT] IP: ${input.ip} | Status: ${isAttack ? '🚨 BLOCK (ATTACK)' : '✅ PASS (SAFE)'}`);
        console.log("=".repeat(40) + "\n");

        return isAttack ? 1 : 0;

    } catch (e) {
        console.error(`[!] CRASH DI INFERENCE: ${e.message}`);
        return 0;
    }
}

module.exports = {
    init,
    predict
};