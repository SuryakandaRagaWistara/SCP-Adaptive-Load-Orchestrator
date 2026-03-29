local redis = require "resty.redis"
local red = redis:new()

red:set_timeout(1000)
local ok, err = red:connect("redis", 6379)

if not ok then
    ngx.log(ngx.ERR, "Gagal konek ke redis: ", err)
    return
end

-- local client_ip = ngx.var.http_x_forwarded_for or ngx.var.http_x_real_ip or ngx.var.remote_addr

local client_ip = ngx.var.remote_addr
ngx.log(ngx.ERR, "[SECURITY] Memeriksa IP asli: ", client_ip)
-- Cek IP Block
local block_key = "ip_blocked:" .. client_ip
local res, err = red:get(block_key)

if res and res ~= ngx.null then
    ngx.log(ngx.WARN, "!!! AKSES DITOLAK !!! IP: ", client_ip)
    red:set_keepalive(1000, 100)
    
    ngx.status = 403
    ngx.header.content_type = "application/json"
    ngx.say('{"error": "Access Denied", "reason": "AI Gatekeeper blocked this IP"}')
    return ngx.exit(403)
end

red:set_keepalive(1000, 100)