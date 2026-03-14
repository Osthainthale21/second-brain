import { vaultService } from '../services/vault.service';
import { embeddingService } from '../services/embedding.service';
import { graphService } from '../services/graph.service';
import { Note } from '../models/Note';
import { logger } from '../utils/logger';

/**
 * AutoLinkerAgent - หาความเชื่อมโยงระหว่างโน้ตใหม่กับโน้ตเก่า
 * ทำงาน: ทุก 6 ชั่วโมง (cron: 0 0,6,12,18 * * *)
 *
 * ขั้นตอน:
 * 1. ดึงโน้ตที่ยังไม่ได้ link (สร้างใหม่ใน 6 ชม.ล่าสุด)
 * 2. ค้นหาโน้ตที่เกี่ยวข้องด้วย vector similarity
 * 3. สร้าง links ใน frontmatter + knowledge graph
 */
export class AutoLinkerAgent {
  private readonly similarityThreshold = 0.4;
  private readonly maxLinksPerNote = 5;

  async run(): Promise<void> {
    const startTime = Date.now();
    logger.info('[AutoLinker] Starting...');

    try {
      const recentNotes = await this.getRecentUnlinkedNotes();

      if (recentNotes.length === 0) {
        logger.info('[AutoLinker] No recent unlinked notes, skipping');
        return;
      }

      let totalLinks = 0;

      for (const note of recentNotes) {
        const linksCreated = await this.findAndCreateLinks(note);
        totalLinks += linksCreated;
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info(
        `[AutoLinker] Done: ${totalLinks} links created for ${recentNotes.length} notes in ${elapsed}s`,
      );
    } catch (err) {
      logger.error('[AutoLinker] Failed', err);
    }
  }

  private async getRecentUnlinkedNotes(): Promise<Note[]> {
    const { notes } = await vaultService.getAll({ limit: 10000 });
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

    return notes.filter((n) => {
      const created = new Date(n.frontmatter.created_at);
      const links = n.frontmatter.links || [];
      return created >= sixHoursAgo && links.length === 0;
    });
  }

  private async findAndCreateLinks(note: Note): Promise<number> {
    let linksCreated = 0;
    const currentLinks = note.frontmatter.links || [];

    // Strategy 1: Vector similarity (if ChromaDB available)
    if (embeddingService.isAvailable()) {
      const results = await embeddingService.search(
        `${note.frontmatter.title} ${note.content.substring(0, 500)}`,
        { nResults: this.maxLinksPerNote + 1 },
      );

      const relatedIds = results.ids
        .filter((id, i) => {
          const distance = results.distances[i] || 999;
          const score = 1 / (1 + distance);
          return id !== note.frontmatter.id && score >= this.similarityThreshold;
        })
        .slice(0, this.maxLinksPerNote);

      if (relatedIds.length > 0) {
        await vaultService.update(note.frontmatter.id, {
          links: [...new Set([...currentLinks, ...relatedIds])],
        });

        // Update knowledge graph if available
        if (graphService.isAvailable()) {
          for (const relatedId of relatedIds) {
            try {
              await graphService.addRelationship(note.frontmatter.id, relatedId, 'RELATED_TO');
            } catch {
              logger.warn(`[AutoLinker] Graph link failed: ${note.frontmatter.id} → ${relatedId}`);
            }
          }
        }

        linksCreated = relatedIds.length;
      }
    }

    // Strategy 2: Tag-based linking (fallback)
    if (linksCreated === 0) {
      const { notes: allNotes } = await vaultService.getAll({ limit: 10000 });
      const relatedByTags = allNotes
        .filter((n) => {
          if (n.frontmatter.id === note.frontmatter.id) return false;
          const sharedTags = n.frontmatter.tags.filter((t) =>
            note.frontmatter.tags.includes(t),
          );
          return sharedTags.length >= 2;
        })
        .slice(0, this.maxLinksPerNote);

      if (relatedByTags.length > 0) {
        const relatedIds = relatedByTags.map((n) => n.frontmatter.id);
        await vaultService.update(note.frontmatter.id, {
          links: [...new Set([...currentLinks, ...relatedIds])],
        });
        linksCreated = relatedIds.length;
      }
    }

    if (linksCreated > 0) {
      logger.info(`[AutoLinker] ${note.frontmatter.title}: ${linksCreated} links`);
    }

    return linksCreated;
  }
}

export const autoLinkerAgent = new AutoLinkerAgent();
