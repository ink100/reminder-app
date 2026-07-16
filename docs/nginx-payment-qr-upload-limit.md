# Nginx limit for the license payment QR upload endpoint

The application accepts QR images up to 10MB. `request.formData()` parses multipart bodies before application validation, so production nginx must enforce the request limit before proxying to Next.js.

Add this exact-match location before the general `location /` block for `ne.daydreams.cn`:

```nginx
location = /api/license/payment-qr {
    client_max_body_size 11m;
    proxy_pass http://127.0.0.1:63456;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
}
```

The 1MB multipart overhead allowance lets a 10MB file pass while bounding oversized bodies before they reach Node.js. Verify with `sudo nginx -t` before reloading nginx.
