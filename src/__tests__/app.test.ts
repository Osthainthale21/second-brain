import app from '../app';
import http from 'http';

describe('App', () => {
  let server: http.Server;

  beforeAll(() => {
    server = app.listen(0);
  });

  afterAll((done) => {
    server.close(done);
  });

  it('should respond to health check', async () => {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Invalid address');

    const res = await fetch(`http://localhost:${address.port}/health`);
    const body = (await res.json()) as { status: string; timestamp: string };

    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });
});
