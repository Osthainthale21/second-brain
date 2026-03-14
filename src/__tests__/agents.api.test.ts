import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import http from 'http';
import app from '../app';
import { VaultService, vaultService } from '../services/vault.service';
import { agentScheduler } from '../agents/scheduler';

describe('Agents API', () => {
  let server: http.Server;
  let baseUrl: string;
  let testVaultPath: string;

  beforeAll(async () => {
    testVaultPath = path.join(os.tmpdir(), `vault-agents-api-${Date.now()}`);
    const testService = new VaultService(testVaultPath);
    await testService.init();
    Object.assign(vaultService, testService);

    agentScheduler.init();

    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Invalid address');
    baseUrl = `http://localhost:${address.port}`;
  });

  afterAll(async () => {
    agentScheduler.stop();
    server.close();
    await fs.rm(testVaultPath, { recursive: true, force: true });
  });

  describe('GET /api/agents/status', () => {
    it('should return all agents status', async () => {
      const res = await fetch(`${baseUrl}/api/agents/status`);
      const body = (await res.json()) as {
        success: boolean;
        data: {
          enabled: boolean;
          agents: { name: string; schedule: string; description: string }[];
        };
      };

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.enabled).toBe(true);
      expect(body.data.agents.length).toBe(3);
    });
  });

  describe('POST /api/agents/:name/run', () => {
    it('should run agent manually', async () => {
      const res = await fetch(`${baseUrl}/api/agents/daily-digest/run`, {
        method: 'POST',
      });
      const body = (await res.json()) as { success: boolean; message: string };

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it('should return 400 for unknown agent', async () => {
      const res = await fetch(`${baseUrl}/api/agents/unknown-agent/run`, {
        method: 'POST',
      });

      expect(res.status).toBe(400);
    });
  });
});
