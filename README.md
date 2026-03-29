# 🚀 Adaptive Traffic Control System (ATCS) with Hybrid AI Mitigation

Sistem infrastruktur adaptif berbasis **Closed-Loop Feedback** yang mengintegrasikan **Machine Learning** dan **Control Theory** untuk manajemen distribusi trafik dinamis serta mitigasi anomali secara asinkron.

---

## 💡 Inspirasi & Visi
> "Membangun sistem yang tidak hanya melayani, tapi juga beradaptasi secara otonom."

Proyek ini lahir dari kegelisahan saat membangun backend E-Commerce Apotek. Saya merasa tertantang untuk menciptakan sesuatu yang lebih dari sekadar API statis—saya ingin membangun **'Living Server'**, sebuah infrastruktur yang memiliki insting untuk bertahan hidup, beradaptasi dengan beban trafik, dan mampu melindungi dirinya sendiri dari serangan bot.

Inspirasi nyata muncul saat melihat masifnya gangguan bot pada server pribadi yang menguras sumber daya. Hal ini mendorong saya untuk menggabungkan **Machine Learning** dengan **Control Theory** sebagai solusi manajemen infrastruktur yang proaktif.

---

## 🏗️ Arsitektur Sistem (Polyglot & Asynchronous)
Arsitektur ini didesain secara detail melalui pemodelan kompleks untuk menyelesaikan masalah **Latency** dalam sistem terdistribusi menggunakan pendekatan *Multi-Language & Shared Memory*.

* **OpenResty (Nginx + Lua)**: Berjalan di *Synchronous Path* sebagai garda depan untuk *Filtering IP* dan *Load Balancing* berbasis bobot dinamis.
* **Redis (Shared State)**: Pusat sinkronisasi state antar modul (Metrik, Status Keamanan, dan Weight) untuk meminimalkan delay komunikasi antar-layer.
* **Aggregator (Python)**: Melakukan *log tailing* dan ekstraksi fitur trafik secara kontinu untuk dikirimkan ke jalur asinkron.
* **Node.js (Inference Runner)**: Mengambil data fitur (*stream*) dari Redis, menjalankan model ONNX, dan menulis hasil inferensi kembali ke Redis tanpa mengganggu jalur request utama.



---

## 🧠 Logika Hybrid-Intelligence
Sistem dibagi menjadi tiga lapisan keputusan dengan disiplin waktu yang berbeda:

### 1. Gatekeeper (Near-Real-Time Anomaly Mitigation)
Menggunakan **Isolation Forest** untuk mendeteksi anomali trafik melalui jalur asinkron.
* **Mekanisme**: Menghitung *anomaly score* dari fitur RPS, payload size, dan entropy.
* **Fitur Utama**: **Delayed Anomaly Mitigation**. Mitigasi dilakukan beberapa detik setelah deteksi untuk menjaga akurasi tanpa menambah latency pada jalur utama (*Zero Latency Path*).

### 2. PID Controller (Near-Real-Time Load Stabilizer)
Sistem saraf otonom yang menjaga stabilitas distribusi beban secara *near real-time* (interval detik).
* **Mekanisme**: Mengoreksi *error* antara target load dengan kondisi aktual (CPU, Latency, Active Connections).
* **Aksi**: Menyesuaikan bobot (*Adjusted Weight*) secara halus untuk menghindari osilasi beban yang tajam.

### 3. Forecaster (Predictive Strategy)
Menggunakan **Gradient Boosting (Quantile Regression)** untuk strategi kapasitas jangka menengah.
* **Mekanisme**: Analisis historis secara periodik untuk menentukan *baseline weight* dan memberikan rekomendasi *scaling* infrastruktur.

---

## 🌊 Alur Kerja Data (Optimized Flow)
1. **Request** diterima oleh **OpenResty**.
2. **Lua Script** melakukan pengecekan **Redis** (blocked IP) secara instan.
3. Jika aman, request diteruskan ke **Backend Cluster** menggunakan algoritma **Weighted Least Connection (WLC)** berbasis *dynamic weight*.
4. **Secara Asinkron**:
    * **Aggregator** mengirim fitur trafik ke Redis.
    * **Gatekeeper** melakukan inferensi AI dan memperbarui status IP di Redis.
    * **PID Controller** memperbarui nilai *weight* secara *near real-time* untuk distribusi request berikutnya.

---

## ⚠️ Limitations (Engineer's Note)
Sistem ini memiliki beberapa batasan teknis sebagai konsekuensi dari desain arsitekturnya:
* **Dependency**: Sangat bergantung pada ketersediaan Redis sebagai *shared state*.
* **Mitigation Delay**: Terdapat jeda beberapa detik antara deteksi anomali dan pemblokiran (bukan proteksi instan).
* **Scope**: Saat ini dioptimalkan untuk *Single-Region deployment*.

---

## 📊 Metrik & Evaluasi Teknis
* **Latency Overhead (Edge Layer)**: < 1 ms melalui optimasi Lua + Redis connection pooling.
* **Resilient State Handling**: Jika Redis gagal, Nginx menggunakan *last known weight* (local cache).
* **Mitigation Speed**: Bot terdeteksi dan terblokir dalam waktu < 5 detik sejak aktivitas anomali dimulai.

---

## 🛠️ Tech Stack
* **Edge Proxy**: OpenResty (Nginx + Lua)
* **Shared Memory**: Redis
* **AI Engine**: Python (Scikit-Learn, LightGBM/XGBoost)
* **Inference Engine**: Node.js (ONNX Runtime)

---

## 📄 Lisensi
Proyek ini dilisensikan di bawah **MIT License**.
