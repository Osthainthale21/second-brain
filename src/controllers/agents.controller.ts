import { Request, Response, NextFunction } from 'express';
import { agentScheduler } from '../agents/scheduler';

export class AgentsController {
  /**
   * GET /api/agents/status → ดูสถานะ agents ทั้งหมด
   */
  async getStatus(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = agentScheduler.getStatus();
      res.json({ success: true, data: status });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/agents/:name/run → รัน agent ด้วยมือ
   */
  async runAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const name = req.params.name as string;
      const result = await agentScheduler.runNow(name);

      if (result.success) {
        res.json({ success: true, message: result.message });
      } else {
        res.status(400).json({ success: false, error: result.message });
      }
    } catch (err) {
      next(err);
    }
  }
}

export const agentsController = new AgentsController();
