/**
 * Second Brain — Cloud Sync API
 * Cloudflare Worker + KV Storage
 *
 * Endpoints:
 *   POST /register    — สร้าง sync code ใหม่
 *   POST /push        — อัปโหลดข้อมูลขึ้น cloud
 *   POST /pull        — ดึงข้อมูลจาก cloud
 *   POST /verify      — ตรวจสอบ sync code
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Sync-Code, X-Sync-Pin',
  'Access-Control-Max-Age': '86400',
};

function corsOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  // Allow GitHub Pages + localhost for dev
  const allowed = [
    env.CORS_ORIGIN,
    'http://localhost:3000',
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    'null' // for file:// protocol
  ];
  if (allowed.includes(origin) || origin.endsWith('.github.io')) {
    return origin;
  }
  return env.CORS_ORIGIN;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code.slice(0, 4) + '-' + code.slice(4);
}

async function hashPin(pin, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + ':' + salt);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          ...CORS_HEADERS,
          'Access-Control-Allow-Origin': corsOrigin(request, env),
        },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Add CORS to all responses
    const addCors = (response) => {
      const newHeaders = new Headers(response.headers);
      newHeaders.set('Access-Control-Allow-Origin', corsOrigin(request, env));
      return new Response(response.body, {
        status: response.status,
        headers: newHeaders,
      });
    };

    try {
      // ===== REGISTER =====
      if (path === '/register' && request.method === 'POST') {
        const { pin } = await request.json();
        if (!pin || pin.length < 4) {
          return addCors(json({ error: 'PIN ต้องมีอย่างน้อย 4 หลัก' }, 400));
        }

        // Generate unique code
        let code;
        let attempts = 0;
        do {
          code = generateCode();
          const existing = await env.SYNC_KV.get(`meta:${code}`);
          if (!existing) break;
          attempts++;
        } while (attempts < 10);

        const salt = crypto.randomUUID();
        const pinHash = await hashPin(pin, salt);

        // Store metadata
        await env.SYNC_KV.put(`meta:${code}`, JSON.stringify({
          pinHash,
          salt,
          createdAt: new Date().toISOString(),
          lastSync: null,
          deviceCount: 1,
        }));

        return addCors(json({
          success: true,
          code,
          message: 'สร้าง Sync Code สำเร็จ! บันทึกรหัสนี้ไว้ใช้กับอุปกรณ์อื่น'
        }));
      }

      // ===== VERIFY =====
      if (path === '/verify' && request.method === 'POST') {
        const { code, pin } = await request.json();
        if (!code || !pin) {
          return addCors(json({ error: 'กรุณาใส่ Sync Code และ PIN' }, 400));
        }

        const metaStr = await env.SYNC_KV.get(`meta:${code}`);
        if (!metaStr) {
          return addCors(json({ error: 'ไม่พบ Sync Code นี้' }, 404));
        }

        const meta = JSON.parse(metaStr);
        const pinHash = await hashPin(pin, meta.salt);

        if (pinHash !== meta.pinHash) {
          return addCors(json({ error: 'PIN ไม่ถูกต้อง' }, 403));
        }

        return addCors(json({
          success: true,
          lastSync: meta.lastSync,
          message: 'เชื่อมต่อสำเร็จ!'
        }));
      }

      // ===== PUSH (Upload data) =====
      if (path === '/push' && request.method === 'POST') {
        const syncCode = request.headers.get('X-Sync-Code');
        const syncPin = request.headers.get('X-Sync-Pin');

        if (!syncCode || !syncPin) {
          return addCors(json({ error: 'ต้องมี Sync Code และ PIN' }, 401));
        }

        // Verify PIN
        const metaStr = await env.SYNC_KV.get(`meta:${syncCode}`);
        if (!metaStr) {
          return addCors(json({ error: 'ไม่พบ Sync Code' }, 404));
        }

        const meta = JSON.parse(metaStr);
        const pinHash = await hashPin(syncPin, meta.salt);
        if (pinHash !== meta.pinHash) {
          return addCors(json({ error: 'PIN ไม่ถูกต้อง' }, 403));
        }

        // Get data from request body
        const { data, timestamp, deviceId } = await request.json();
        if (!data) {
          return addCors(json({ error: 'ไม่มีข้อมูล' }, 400));
        }

        const now = new Date().toISOString();

        // Store main data (expires in 90 days)
        await env.SYNC_KV.put(`data:${syncCode}`, JSON.stringify({
          data,
          timestamp: timestamp || now,
          deviceId: deviceId || 'unknown',
          pushedAt: now,
        }), { expirationTtl: 90 * 24 * 60 * 60 });

        // Store backup of last 3 versions
        const version = Date.now();
        await env.SYNC_KV.put(`backup:${syncCode}:${version}`, JSON.stringify(data), {
          expirationTtl: 30 * 24 * 60 * 60
        });

        // Update metadata
        meta.lastSync = now;
        await env.SYNC_KV.put(`meta:${syncCode}`, JSON.stringify(meta));

        return addCors(json({
          success: true,
          timestamp: now,
          message: 'Sync ขึ้น Cloud สำเร็จ!'
        }));
      }

      // ===== PULL (Download data) =====
      if (path === '/pull' && request.method === 'POST') {
        const syncCode = request.headers.get('X-Sync-Code');
        const syncPin = request.headers.get('X-Sync-Pin');

        if (!syncCode || !syncPin) {
          return addCors(json({ error: 'ต้องมี Sync Code และ PIN' }, 401));
        }

        // Verify PIN
        const metaStr = await env.SYNC_KV.get(`meta:${syncCode}`);
        if (!metaStr) {
          return addCors(json({ error: 'ไม่พบ Sync Code' }, 404));
        }

        const meta = JSON.parse(metaStr);
        const pinHash = await hashPin(syncPin, meta.salt);
        if (pinHash !== meta.pinHash) {
          return addCors(json({ error: 'PIN ไม่ถูกต้อง' }, 403));
        }

        // Get data
        const storedStr = await env.SYNC_KV.get(`data:${syncCode}`);
        if (!storedStr) {
          return addCors(json({
            success: true,
            data: null,
            message: 'ยังไม่มีข้อมูลบน Cloud'
          }));
        }

        const stored = JSON.parse(storedStr);
        return addCors(json({
          success: true,
          data: stored.data,
          timestamp: stored.timestamp,
          pushedAt: stored.pushedAt,
          deviceId: stored.deviceId,
        }));
      }

      // ===== PUSH-BEACON (for sendBeacon on page close) =====
      if (path === '/push-beacon' && request.method === 'POST') {
        const syncCode = url.searchParams.get('code');
        const syncPin = url.searchParams.get('pin');
        if (!syncCode || !syncPin) return addCors(json({ error: 'Missing params' }, 400));

        const metaStr = await env.SYNC_KV.get(`meta:${syncCode}`);
        if (!metaStr) return addCors(json({ error: 'Not found' }, 404));
        const meta = JSON.parse(metaStr);
        const pinHash = await hashPin(syncPin, meta.salt);
        if (pinHash !== meta.pinHash) return addCors(json({ error: 'PIN wrong' }, 403));

        const body = await request.json();
        const now = new Date().toISOString();
        await env.SYNC_KV.put(`data:${syncCode}`, JSON.stringify({
          data: body.data,
          timestamp: body.timestamp || now,
          deviceId: body.deviceId || 'beacon',
          pushedAt: now,
        }), { expirationTtl: 90 * 24 * 60 * 60 });
        meta.lastSync = now;
        await env.SYNC_KV.put(`meta:${syncCode}`, JSON.stringify(meta));
        return addCors(json({ success: true }));
      }

      // ===== HEALTH CHECK =====
      if (path === '/' || path === '/health') {
        return addCors(json({
          status: 'ok',
          service: 'Second Brain Sync API',
          version: '1.0.0'
        }));
      }

      return addCors(json({ error: 'Not found' }, 404));

    } catch (err) {
      return addCors(json({ error: 'Internal error: ' + err.message }, 500));
    }
  },
};
