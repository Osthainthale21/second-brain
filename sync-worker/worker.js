/**
 * Second Brain — Cloud Sync API + Authentication System
 * Cloudflare Worker + KV Storage + D1 Database
 *
 * Legacy Sync Endpoints:
 *   POST /register    — สร้าง sync code ใหม่
 *   POST /verify      — ตรวจสอบ sync code
 *   POST /push        — อัปโหลดข้อมูลขึ้น cloud
 *   POST /pull        — ดึงข้อมูลจาก cloud
 *   POST /push-beacon — sync via sendBeacon
 *   GET  /health      — health check
 *
 * Auth Endpoints:
 *   POST /auth/signup          — Create new user account
 *   POST /auth/login           — Login with email/password
 *   POST /auth/logout          — Logout (invalidate session)
 *   GET  /auth/me              — Get current user info
 *   PUT  /auth/profile         — Update user profile
 *   POST /auth/change-password — Change password
 *
 * Authenticated Data Endpoints:
 *   POST /data/save  — Save user data (authenticated)
 *   POST /data/load  — Load user data (authenticated)
 */

// ─── CORS ────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sync-Code, X-Sync-Pin',
  'Access-Control-Max-Age': '86400',
};

function corsOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = [
    env.CORS_ORIGIN,
    'http://localhost:3000',
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'null', // for file:// protocol
  ];
  if (allowed.includes(origin) || origin.endsWith('.github.io')) {
    return origin;
  }
  return env.CORS_ORIGIN;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + ':' + salt);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── Authentication Helper ──────────────────────────────────────────────────

async function authenticate(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  if (!token) return null;

  try {
    const session = await env.USERS_DB.prepare(
      'SELECT s.*, u.id as user_id, u.email, u.display_name, u.app_name, u.settings, u.created_at as user_created_at FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > ?'
    )
      .bind(token, new Date().toISOString())
      .first();

    if (!session) return null;

    return {
      id: session.user_id,
      email: session.email,
      displayName: session.display_name,
      appName: session.app_name,
      settings: session.settings ? JSON.parse(session.settings) : {},
      createdAt: session.user_created_at,
      sessionToken: token,
    };
  } catch (err) {
    console.error('Auth error:', err.message);
    return null;
  }
}

// ─── D1 Schema Initialization ───────────────────────────────────────────────

async function ensureTables(env) {
  await env.USERS_DB.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      display_name TEXT DEFAULT '',
      app_name TEXT DEFAULT 'Second Brain',
      settings TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      last_login TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_data (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      data_key TEXT NOT NULL DEFAULT 'main',
      size_bytes INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_data_user ON user_data(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_data_key ON user_data(user_id, data_key);
  `);
}

// ─── Auth Route Handlers ────────────────────────────────────────────────────

async function handleSignup(request, env) {
  const { email, password, displayName, appName } = await request.json();

  // Validate
  if (!email || !isValidEmail(email)) {
    return json({ error: 'Invalid email format' }, 400);
  }
  if (!password || password.length < 6) {
    return json({ error: 'Password must be at least 6 characters' }, 400);
  }

  // Check if email already exists
  const existing = await env.USERS_DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  )
    .bind(email.toLowerCase().trim())
    .first();

  if (existing) {
    return json({ error: 'Email already registered' }, 409);
  }

  // Hash password
  const salt = crypto.randomUUID();
  const passwordHash = await hashPassword(password, salt);
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Insert user
  await env.USERS_DB.prepare(
    'INSERT INTO users (id, email, password_hash, salt, display_name, app_name, settings) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(
      userId,
      email.toLowerCase().trim(),
      passwordHash,
      salt,
      displayName || '',
      appName || 'Second Brain',
      '{}'
    )
    .run();

  // Create session
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await env.USERS_DB.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  )
    .bind(token, userId, now, expiresAt)
    .run();

  return json({
    success: true,
    token,
    user: {
      id: userId,
      email: email.toLowerCase().trim(),
      displayName: displayName || '',
      appName: appName || 'Second Brain',
    },
    expiresAt,
    message: 'Account created successfully',
  });
}

async function handleLogin(request, env) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return json({ error: 'Email and password are required' }, 400);
  }

  // Find user
  const user = await env.USERS_DB.prepare(
    'SELECT * FROM users WHERE email = ?'
  )
    .bind(email.toLowerCase().trim())
    .first();

  if (!user) {
    return json({ error: 'Invalid email or password' }, 401);
  }

  // Verify password
  const passwordHash = await hashPassword(password, user.salt);
  if (passwordHash !== user.password_hash) {
    return json({ error: 'Invalid email or password' }, 401);
  }

  // Create session
  const token = generateToken();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await env.USERS_DB.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  )
    .bind(token, user.id, now, expiresAt)
    .run();

  // Update last_login
  await env.USERS_DB.prepare(
    'UPDATE users SET last_login = ? WHERE id = ?'
  )
    .bind(now, user.id)
    .run();

  return json({
    success: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      appName: user.app_name,
      settings: user.settings ? JSON.parse(user.settings) : {},
      lastLogin: now,
    },
    expiresAt,
    message: 'Login successful',
  });
}

async function handleLogout(request, env) {
  const user = await authenticate(request, env);
  if (!user) {
    return json({ error: 'Not authenticated' }, 401);
  }

  // Delete the session
  const token = request.headers.get('Authorization').slice(7);
  await env.USERS_DB.prepare('DELETE FROM sessions WHERE token = ?')
    .bind(token)
    .run();

  return json({ success: true, message: 'Logged out successfully' });
}

async function handleGetMe(request, env) {
  const user = await authenticate(request, env);
  if (!user) {
    return json({ error: 'Not authenticated' }, 401);
  }

  return json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      appName: user.appName,
      settings: user.settings,
      createdAt: user.createdAt,
    },
  });
}

async function handleUpdateProfile(request, env) {
  const user = await authenticate(request, env);
  if (!user) {
    return json({ error: 'Not authenticated' }, 401);
  }

  const { displayName, appName, settings } = await request.json();
  const now = new Date().toISOString();

  const updates = [];
  const values = [];

  if (displayName !== undefined) {
    updates.push('display_name = ?');
    values.push(displayName);
  }
  if (appName !== undefined) {
    updates.push('app_name = ?');
    values.push(appName);
  }
  if (settings !== undefined) {
    updates.push('settings = ?');
    values.push(JSON.stringify(settings));
  }

  if (updates.length === 0) {
    return json({ error: 'No fields to update' }, 400);
  }

  values.push(user.id);

  await env.USERS_DB.prepare(
    `UPDATE users SET ${updates.join(', ')} WHERE id = ?`
  )
    .bind(...values)
    .run();

  return json({
    success: true,
    message: 'Profile updated successfully',
    updatedAt: now,
  });
}

async function handleChangePassword(request, env) {
  const user = await authenticate(request, env);
  if (!user) {
    return json({ error: 'Not authenticated' }, 401);
  }

  const { oldPassword, newPassword } = await request.json();

  if (!oldPassword || !newPassword) {
    return json({ error: 'Both old and new passwords are required' }, 400);
  }
  if (newPassword.length < 6) {
    return json({ error: 'New password must be at least 6 characters' }, 400);
  }

  // Get current user with password info
  const dbUser = await env.USERS_DB.prepare(
    'SELECT password_hash, salt FROM users WHERE id = ?'
  )
    .bind(user.id)
    .first();

  // Verify old password
  const oldHash = await hashPassword(oldPassword, dbUser.salt);
  if (oldHash !== dbUser.password_hash) {
    return json({ error: 'Current password is incorrect' }, 403);
  }

  // Hash new password with new salt
  const newSalt = crypto.randomUUID();
  const newHash = await hashPassword(newPassword, newSalt);
  const now = new Date().toISOString();

  await env.USERS_DB.prepare(
    'UPDATE users SET password_hash = ?, salt = ? WHERE id = ?'
  )
    .bind(newHash, newSalt, user.id)
    .run();

  // Invalidate all other sessions (keep current one)
  await env.USERS_DB.prepare(
    'DELETE FROM sessions WHERE user_id = ? AND token != ?'
  )
    .bind(user.id, user.sessionToken)
    .run();

  return json({
    success: true,
    message: 'Password changed successfully',
  });
}

// ─── Authenticated Data Handlers ────────────────────────────────────────────

async function handleDataSave(request, env) {
  const user = await authenticate(request, env);
  if (!user) {
    return json({ error: 'Not authenticated' }, 401);
  }

  const { data, dataKey } = await request.json();
  if (!data) {
    return json({ error: 'No data provided' }, 400);
  }

  const key = dataKey || 'main';
  const now = new Date().toISOString();
  const kvKey = `userdata:${user.id}:${key}`;
  const dataStr = JSON.stringify(data);

  // Store in KV (expires in 365 days)
  await env.SYNC_KV.put(kvKey, dataStr, {
    expirationTtl: 365 * 24 * 60 * 60,
  });

  // Store/update metadata in D1 (upsert)
  await env.USERS_DB.prepare(
    'INSERT OR REPLACE INTO user_data (user_id, data_key, data_value, updated_at) VALUES (?, ?, ?, ?)'
  )
    .bind(user.id, key, String(dataStr.length), now)
    .run();

  return json({
    success: true,
    sizeBytes: dataStr.length,
    savedAt: now,
    message: 'Data saved successfully',
  });
}

async function handleDataLoad(request, env) {
  const user = await authenticate(request, env);
  if (!user) {
    return json({ error: 'Not authenticated' }, 401);
  }

  let key = 'main';
  try {
    const body = await request.json();
    if (body.dataKey) key = body.dataKey;
  } catch {
    // No body or invalid JSON — use default key
  }

  const kvKey = `userdata:${user.id}:${key}`;
  const dataStr = await env.SYNC_KV.get(kvKey);

  if (!dataStr) {
    return json({
      success: true,
      data: null,
      message: 'No data found',
    });
  }

  // Get metadata
  const meta = await env.USERS_DB.prepare(
    'SELECT data_value, updated_at FROM user_data WHERE user_id = ? AND data_key = ?'
  )
    .bind(user.id, key)
    .first();

  return json({
    success: true,
    data: JSON.parse(dataStr),
    metadata: meta
      ? {
          sizeBytes: parseInt(meta.data_value || '0'),
          updatedAt: meta.updated_at,
        }
      : null,
  });
}

// ─── Main Worker ─────────────────────────────────────────────────────────────

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
      Object.entries(CORS_HEADERS).forEach(([k, v]) => {
        newHeaders.set(k, v);
      });
      return new Response(response.body, {
        status: response.status,
        headers: newHeaders,
      });
    };

    try {
      // Tables already created via D1 MCP — no need for ensureTables

      // ════════════════════════════════════════════════════════════════
      // AUTH ENDPOINTS
      // ════════════════════════════════════════════════════════════════

      // ===== SIGNUP =====
      if (path === '/auth/signup' && request.method === 'POST') {
        return addCors(await handleSignup(request, env));
      }

      // ===== LOGIN =====
      if (path === '/auth/login' && request.method === 'POST') {
        return addCors(await handleLogin(request, env));
      }

      // ===== LOGOUT =====
      if (path === '/auth/logout' && request.method === 'POST') {
        return addCors(await handleLogout(request, env));
      }

      // ===== GET ME =====
      if (path === '/auth/me' && request.method === 'GET') {
        return addCors(await handleGetMe(request, env));
      }

      // ===== UPDATE PROFILE =====
      if (path === '/auth/profile' && request.method === 'PUT') {
        return addCors(await handleUpdateProfile(request, env));
      }

      // ===== CHANGE PASSWORD =====
      if (path === '/auth/change-password' && request.method === 'POST') {
        return addCors(await handleChangePassword(request, env));
      }

      // ════════════════════════════════════════════════════════════════
      // AUTHENTICATED DATA ENDPOINTS
      // ════════════════════════════════════════════════════════════════

      // ===== DATA SAVE =====
      if (path === '/data/save' && request.method === 'POST') {
        return addCors(await handleDataSave(request, env));
      }

      // ===== DATA LOAD =====
      if (path === '/data/load' && request.method === 'POST') {
        return addCors(await handleDataLoad(request, env));
      }

      // ════════════════════════════════════════════════════════════════
      // LEGACY SYNC ENDPOINTS (unchanged)
      // ════════════════════════════════════════════════════════════════

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
        await env.SYNC_KV.put(
          `meta:${code}`,
          JSON.stringify({
            pinHash,
            salt,
            createdAt: new Date().toISOString(),
            lastSync: null,
            deviceCount: 1,
          })
        );

        return addCors(
          json({
            success: true,
            code,
            message: 'สร้าง Sync Code สำเร็จ! บันทึกรหัสนี้ไว้ใช้กับอุปกรณ์อื่น',
          })
        );
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

        return addCors(
          json({
            success: true,
            lastSync: meta.lastSync,
            message: 'เชื่อมต่อสำเร็จ!',
          })
        );
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
        await env.SYNC_KV.put(
          `data:${syncCode}`,
          JSON.stringify({
            data,
            timestamp: timestamp || now,
            deviceId: deviceId || 'unknown',
            pushedAt: now,
          }),
          { expirationTtl: 90 * 24 * 60 * 60 }
        );

        // Store backup of last 3 versions
        const version = Date.now();
        await env.SYNC_KV.put(
          `backup:${syncCode}:${version}`,
          JSON.stringify(data),
          { expirationTtl: 30 * 24 * 60 * 60 }
        );

        // Update metadata
        meta.lastSync = now;
        await env.SYNC_KV.put(`meta:${syncCode}`, JSON.stringify(meta));

        return addCors(
          json({
            success: true,
            timestamp: now,
            message: 'Sync ขึ้น Cloud สำเร็จ!',
          })
        );
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
          return addCors(
            json({
              success: true,
              data: null,
              message: 'ยังไม่มีข้อมูลบน Cloud',
            })
          );
        }

        const stored = JSON.parse(storedStr);
        return addCors(
          json({
            success: true,
            data: stored.data,
            timestamp: stored.timestamp,
            pushedAt: stored.pushedAt,
            deviceId: stored.deviceId,
          })
        );
      }

      // ===== PUSH-BEACON (for sendBeacon on page close) =====
      if (path === '/push-beacon' && request.method === 'POST') {
        const syncCode = url.searchParams.get('code');
        const syncPin = url.searchParams.get('pin');
        if (!syncCode || !syncPin)
          return addCors(json({ error: 'Missing params' }, 400));

        const metaStr = await env.SYNC_KV.get(`meta:${syncCode}`);
        if (!metaStr) return addCors(json({ error: 'Not found' }, 404));
        const meta = JSON.parse(metaStr);
        const pinHash = await hashPin(syncPin, meta.salt);
        if (pinHash !== meta.pinHash)
          return addCors(json({ error: 'PIN wrong' }, 403));

        const body = await request.json();
        const now = new Date().toISOString();
        await env.SYNC_KV.put(
          `data:${syncCode}`,
          JSON.stringify({
            data: body.data,
            timestamp: body.timestamp || now,
            deviceId: body.deviceId || 'beacon',
            pushedAt: now,
          }),
          { expirationTtl: 90 * 24 * 60 * 60 }
        );
        meta.lastSync = now;
        await env.SYNC_KV.put(`meta:${syncCode}`, JSON.stringify(meta));
        return addCors(json({ success: true }));
      }

      // ===== HEALTH CHECK =====
      if (path === '/' || path === '/health') {
        return addCors(
          json({
            status: 'ok',
            service: 'Second Brain Sync API',
            version: '2.0.0',
            features: ['sync', 'auth', 'cloud-data'],
          })
        );
      }

      return addCors(json({ error: 'Not found' }, 404));
    } catch (err) {
      console.error('Worker error:', err);
      return addCors(json({ error: 'Internal error: ' + err.message }, 500));
    }
  },
};
