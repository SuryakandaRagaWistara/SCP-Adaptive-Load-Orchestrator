const ort = require('onnxruntime-node');
const path = require('path');

let sessQ50 = null;
let sessQ90 = null;

/**
 * inisialisasi session onnx runtime.
 * memuat dua model kuantil (q50 untuk median dan q90 untuk skenario beban tinggi) 
 * ke dalam memori agar proses inferensi berikutnya dapat berjalan secara instan.
 */
async function init() {
    if (sessQ50 && sessQ90) return;
    try {
        const modelPathQ50 = path.join(__dirname, '..', 'models', 'forecaster_q50.onnx');
        const modelPathQ90 = path.join(__dirname, '..', 'models', 'forecaster_q90.onnx');
        
        sessQ50 = await ort.InferenceSession.create(modelPathQ50);
        sessQ90 = await ort.InferenceSession.create(modelPathQ90);

        console.log(`[*] Forecaster: Models loaded (Q50 & Q90)`);
        console.log(`[*] Input Dimension: 13 Features`);
    } catch (e) {
        console.error(`[!] Forecaster Load Error: ${e.message}`);
        throw e;
    }
}

/**
 * 2. Prediction & Baseline Calculation
 * @param {Array} featureArray - 13 fitur dari aggregator (forecaster:input)
 * @param {Object} currentCpu - Objek {a, b, c} untuk hitung baseline
 */
async function predictBaseline(featureArray, currentCpu) {
    if (!sessQ50 || !sessQ90) await init();

    try {
        /**
         * transformasi data input.
         * memastikan data berbentuk float32array dengan dimensi tensor [1, 13] 
         * sesuai dengan spesifikasi input model onnx yang telah dilatih.
         */
        const cleanFeatures = featureArray.map(f => parseFloat(f) || 0);
        const inputTensor = new ort.Tensor('float32', new Float32Array(cleanFeatures), [1, 13]);
        const feeds = { [sessQ50.inputNames[0]]: inputTensor };

        const output50 = await sessQ50.run(feeds);
        const output90 = await sessQ90.run(feeds);

        const q50 = parseFloat(output50[sessQ50.outputNames[0]].data[0]);
        const q90 = parseFloat(output90[sessQ90.outputNames[0]].data[0]);

        /**
         * logika kalkulasi agresivitas dan invers cpu.
         * menghitung selisih (gap) antara q90 dan q50 untuk menentukan tingkat ketidakpastian.
         * bobot dihitung menggunakan metode 'inverse cpu', di mana node dengan penggunaan 
         * cpu lebih rendah akan mendapatkan porsi beban (baseline) yang lebih besar.
         */
        const gap = Math.max(0, q90 - q50);
        const aggressiveness = 1.0 + (gap / (q50 + 1.0));

        const cpuValues = [currentCpu.a, currentCpu.b, currentCpu.c];
        
        const invCpu = cpuValues.map(cpu => 1.0 / Math.pow((parseFloat(cpu) + 0.05), aggressiveness));
        const sumInv = invCpu.reduce((a, b) => a + b, 0);
        
        const weights = invCpu.map(v => v / sumInv);

        return {
            predicted_q50: q50.toFixed(2),
            predicted_q90: q90.toFixed(2),
            baselines: {
                A: weights[0].toFixed(4),
                B: weights[1].toFixed(4),
                C: weights[2].toFixed(4)
            }
        };

    } catch (e) {
        console.error(`[!] Forecaster Inference Error: ${e.message}`);
        return null;
    }
}

module.exports = { init, predictBaseline };