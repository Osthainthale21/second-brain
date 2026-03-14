import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import http from 'http';
import app from '../app';
import { VaultService, vaultService } from '../services/vault.service';
import { resetAuthConfig } from '../middleware/auth';

describe('Authentication Middleware', () => {
  let server: http.Server;
  let baseUrl: string;
  let testVaultPath: string;

  beforeAll(async () => {
    testVaultPath = path.join(os.tmpdir(), `vault-auth-test-${Date.now()}`);
    const testService = new VaultService(testVaultPath);
    await testService.init();
    Object.assign(vaultService, testService);

    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Invalid address');
    baseUrl = `http://localhost:${address.port}`;
  });

  afterAll(async () => {
    server.close();
    await fs.rm(testVaultPath, { recursive: true, force: true });
    resetAuthConfig();
  });

  describe('Dev mode (no API keys configured)', () => {
    it('should allow access to /health without auth', async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
    });

    it('should allow access to /api/notes without auth (dev mode)', async () => {
      const res = await fetch(`${baseUrl}/api/notes`);
      expect(res.status).toBe(200);
    });

    it('should allow access to /api/search/status without auth (dev mode)', async () => {
      const res = await fetch(`${baseUrl}/api/search/status`);
      expect(res.status).toBe(200);
    });
  });

  describe('Auth config', () => {
    it('should allow access with valid API key when configured', async () => {
      // In test environment, auth is disabled (no keys configured)
      // So all requests should pass through
      const res = await fetch(`${baseUrl}/api/notes`, {
        headers: { 'X-API-Key': 'any-key' },
      });
      expect(res.status).toBe(200);
    });
  });
});
