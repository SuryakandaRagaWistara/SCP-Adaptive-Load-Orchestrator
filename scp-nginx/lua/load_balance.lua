local redis = require "resty.redis"
local red = redis:new()
red:set_timeout(1000)

local ok, err = red:connect("redis", 6379)

-- Default fallback jika Redis mati
local selected_server = "api_server-1:8000" 

if ok then
    -- Ambil Weight dari AI/PID dan Stats Koneksi
    local res, err = red:mget("weight:A", "weight:B", "weight:C", "stats:conn:A", "stats:conn:B", "stats:conn:C")
    
    if res then
        local function clean_num(val, default)
            if val == nil or val == ngx.null then return default end
            return tonumber(val) or default
        end

        -- Ambil Weight (A, B, C)
        local wA = clean_num(res[1], 0.333)
        local wB = clean_num(res[2], 0.333)
        local wC = clean_num(res[3], 0.333)
        
        -- Floor limit agar tidak terjadi pembagian dengan nol
        wA = math.max(wA, 0.001)
        wB = math.max(wB, 0.001)
        wC = math.max(wC, 0.001)

        -- Ambil Koneksi Aktif (A, B, C)
        local cA = clean_num(res[4], 0)
        local cB = clean_num(res[5], 0)
        local cC = clean_num(res[6], 0)

        -- Hitung Score (Semakin kecil semakin baik)
        local scoreA = cA / wA
        local scoreB = cB / wB
        local scoreC = cC / wC

        local min_score = scoreA
        selected_server = "api_server-1:8000"

        if scoreB < min_score then
            min_score = scoreB
            selected_server = "api_server-2:8000"
        end

        if scoreC < min_score then
            selected_server = "api_server-3:8000"
        end
    end
    
    -- Kembalikan koneksi ke pool (efisiensi)
    red:set_keepalive(10000, 100)
end

-- Lempar ke variable Nginx
ngx.var.target_server = selected_server