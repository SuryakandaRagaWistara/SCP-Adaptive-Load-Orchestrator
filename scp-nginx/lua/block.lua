local redis = require "resty.redis"
local red = redis:new()

-- konfigurasi koneksi redis
red:set_timeout(1000)
local ok, err = red:connect("redis", 6379)

if not ok then
    ngx.log(ngx.ERR, "gagal konek ke redis: ", err)
    return
end

local client_ip = ngx.var.remote_addr
ngx.log(ngx.ERR, "[security] memeriksa ip asli: ", client_ip)

---
-- tahap 1: pengecekan whitelist
-- memeriksa apakah ip terdaftar dalam daftar putih di redis.
---
local whitelist_key = "whitelist:" .. client_ip
local is_whitelisted = red:get(whitelist_key)

if is_whitelisted == "1" then
    red:set_keepalive(1000, 100)
    return
end

---
-- tahap 2: pengecekan ip block (ai gatekeeper)
-- memeriksa apakah ip telah diblokir oleh sistem keamanan ai.
---
local block_key = "ip_blocked:" .. client_ip
local res, err = red:get(block_key)

if res and res ~= ngx.null then
    ngx.log(ngx.WARN, "!!! akses ditolak !!! ip: ", client_ip)
    
    red:set_keepalive(1000, 100)
    
    ngx.status = 403
    ngx.header.content_type = "application/json"
    ngx.say('{"error": "access denied", "reason": "ai gatekeeper blocked this ip"}')
    return ngx.exit(403)
end

red:set_keepalive(1000, 100)
