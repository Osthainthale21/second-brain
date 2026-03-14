import axios from 'axios';
import { ScraperService } from '../services/scraper.service';

describe('ScraperService', () => {
  let service: ScraperService;
  let networkAvailable = false;

  beforeAll(async () => {
    service = new ScraperService();
    try {
      await axios.get('https://example.com', { timeout: 5000 });
      networkAvailable = true;
    } catch {
      networkAvailable = false;
    }
  });

  describe('scrape', () => {
    it('should scrape a real public webpage (requires network)', async () => {
      if (!networkAvailable) return; // skip gracefully

      const result = await service.scrape('https://example.com');
      expect(result.title).toBeDefined();
      expect(result.title.length).toBeGreaterThan(0);
      expect(result.content).toBeDefined();
      expect(result.url).toBe('https://example.com');
    }, 15000);

    it('should throw on invalid URL', async () => {
      await expect(service.scrape('not-a-url')).rejects.toThrow();
    });

    it('should throw on unreachable URL', async () => {
      await expect(
        service.scrape('https://this-domain-does-not-exist-xyz-99999.com'),
      ).rejects.toThrow();
    }, 15000);
  });
});
