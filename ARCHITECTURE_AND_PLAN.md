# Second Brain - Architecture & Implementation Plan

## System Overview

ระบบ **Advanced AI-Augmented Second Brain** คือ API ที่ทำหน้าที่เป็น "สมองที่ 2" อัจฉริยะ โดยใช้ Hybrid-RAG (Vector Search + Knowledge Graph) ร่วมกับ LLM เพื่อจัดเก็บ, ค้นหา, และสังเคราะห์ความรู้จากโน้ตที่ผู้ใช้สร้างขึ้น

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           INGESTION LAYER                                │
│  ┌──────────┐ ┌──────────────┐ ┌─────────────┐ ┌────────┐ ┌──────────┐ │
│  │ REST API │ │ Telegram Bot │ │ Voice (STT) │ │ Notion │ │ G-Drive  │ │
│  └────┬─────┘ └──────┬───────┘ └──────┬──────┘ └───┬────┘ └────┬─────┘ │
│       └───────┬──────┴────────────────┴─────────────┴───────────┘       │
│               ▼                                                          │
│     ┌─────────────────┐    ┌──────────────────┐                          │
│     │ Ingestion Queue │    │  Web Scraper     │ (Chrome Automation)      │
│     │  (BullMQ/Redis) │    │  (URL → .md)     │                          │
│     └────────┬────────┘    └────────┬─────────┘                          │
└──────────────┼──────────────────────┼────────────────────────────────────┘
               └──────────┬───────────┘
                          ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        PROCESSING LAYER                                  │
│   ┌──────────────────────────────────────────────────────────────────┐   │
│   │                    Ingestion Pipeline                            │   │
│   │  1. Parse & Extract Frontmatter                                  │   │
│   │  2. Auto-tag via LLM (Claude)                                    │   │
│   │  3. Generate Embeddings                                          │   │
│   │  4. Extract Entities & Relations                                 │   │
│   │  5. Save to Vault (.md), ChromaDB, Neo4j                        │   │
│   └──────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         STORAGE LAYER                                    │
│  ┌──────────────┐ ┌───────────────┐ ┌──────────────┐ ┌──────────────┐  │
│  │ Local Vault  │ │   ChromaDB    │ │    Neo4j     │ │ Cloudflare   │  │
│  │ (.md files)  │ │ (Vectors/Emb) │ │ (Knowledge   │ │ D1/KV/R2     │  │
│  │ Source of    │ │ Semantic      │ │  Graph)      │ │ (Edge Cache) │  │
│  │ Truth        │ │ Similarity    │ │              │ │              │  │
│  └──────────────┘ └───────────────┘ └──────────────┘ └──────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     RETRIEVAL LAYER (Hybrid RAG)                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Query → Vector Search (ChromaDB)  ─┐                            │  │
│  │                                      ├→ Rank & Merge → LLM      │  │
│  │  Query → Graph Traversal (Neo4j)   ─┘                            │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     OUTPUT LAYER                                         │
│  ┌──────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │    PDF       │ │  DOCX    │ │  XLSX    │ │  PPTX    │ │  Canva   │ │
│  │  Export      │ │  Export  │ │  Export  │ │  Export  │ │  Design  │ │
│  └──────────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    AUTONOMOUS AGENTS LAYER                               │
│  ┌──────────────┐ ┌────────────┐ ┌───────────────┐ ┌────────────────┐  │
│  │ Daily Digest │ │ Auto-Linker│ │ Inbox         │ │ Notion/Drive   │  │
│  │ Agent        │ │ Agent      │ │ Organizer     │ │ Sync Agent     │  │
│  └──────────────┘ └────────────┘ └───────────────┘ └────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT LAYER                                      │
│  ┌───────────────────────┐  ┌───────────────────────────────────────┐   │
│  │ Local Dev (Express)   │  │ Cloudflare Workers (Edge Production) │   │
│  └───────────────────────┘  └───────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Folder Structure

```
second-brain/
├── src/
│   ├── config/              # Environment & service configuration
│   │   └── index.ts
│   ├── controllers/         # Request handlers (thin, delegate to services)
│   │   ├── notes.controller.ts
│   │   ├── search.controller.ts
│   │   ├── sync.controller.ts       # Notion/Drive/Scrape sync
│   │   ├── export.controller.ts     # PDF/DOCX/XLSX/PPTX export
│   │   └── design.controller.ts     # Canva design generation
│   ├── services/            # Business logic layer
│   │   ├── vault.service.ts          # CRUD on .md files
│   │   ├── embedding.service.ts      # ChromaDB operations
│   │   ├── graph.service.ts          # Neo4j operations
│   │   ├── rag.service.ts            # Hybrid RAG orchestrator
│   │   ├── llm.service.ts            # Claude/OpenAI wrapper
│   │   ├── telegram.service.ts       # Telegram bot handler
│   │   ├── notion-sync.service.ts    # Notion API sync
│   │   ├── gdrive.service.ts         # Google Drive sync
│   │   ├── web-scraper.service.ts    # Chrome automation scraper
│   │   ├── pdf-export.service.ts     # PDF generation
│   │   ├── docx-export.service.ts    # Word document generation
│   │   ├── xlsx-export.service.ts    # Excel spreadsheet generation
│   │   ├── pptx-export.service.ts    # PowerPoint generation
│   │   ├── report-generator.service.ts # LLM-powered report synthesis
│   │   ├── canva-design.service.ts   # Canva API integration
│   │   └── cloudflare.service.ts     # Cloudflare Workers deployment
│   ├── agents/              # Autonomous background agents
│   │   ├── daily-digest.agent.ts
│   │   ├── auto-linker.agent.ts
│   │   ├── inbox-organizer.agent.ts
│   │   └── sync-scheduler.agent.ts   # Auto-sync Notion/Drive
│   ├── routes/              # Express route definitions
│   │   ├── notes.routes.ts
│   │   ├── search.routes.ts
│   │   ├── sync.routes.ts
│   │   ├── export.routes.ts
│   │   └── design.routes.ts
│   ├── models/              # TypeScript interfaces & types
│   │   ├── Note.ts
│   │   ├── Sync.ts                   # Sync job interfaces
│   │   ├── Export.ts                 # Export job interfaces
│   │   └── Design.ts                # Design generation interfaces
│   ├── middleware/           # Express middleware
│   │   └── errorHandler.ts
│   ├── utils/               # Shared utilities
│   │   └── logger.ts
│   ├── app.ts               # Express app setup
│   └── server.ts            # Entry point
├── vault/                   # Local Markdown vault (source of truth)
│   ├── .inbox/              # Unprocessed notes landing zone
│   ├── notion/              # Notes synced from Notion
│   ├── gdrive/              # Notes synced from Google Drive
│   ├── web/                 # Notes from web scraping
│   └── exports/             # Generated export files
├── templates/               # Export templates
│   ├── report.hbs           # Handlebars template for reports
│   ├── digest.hbs           # Daily digest template
│   └── presentation.hbs    # Presentation template
├── ARCHITECTURE_AND_PLAN.md
├── package.json
├── tsconfig.json
├── jest.config.js
├── .eslintrc.json
├── .prettierrc
├── .env.example
├── wrangler.toml            # Cloudflare Workers config
└── .gitignore
```

---

## Implementation Phases

### Phase 1: Storage & Foundation
**เป้าหมาย:** สร้าง CRUD API สำหรับจัดการโน้ตในรูปแบบ Markdown + YAML Frontmatter

**สิ่งที่ต้องทำ:**
- [ ] `VaultService` - อ่าน/เขียน/อัปเดต/ลบไฟล์ .md พร้อม frontmatter parsing (gray-matter)
- [ ] `NotesController` - REST endpoints: `POST /api/notes`, `GET /api/notes`, `GET /api/notes/:id`, `PUT /api/notes/:id`, `DELETE /api/notes/:id`
- [ ] `NotesRoutes` - Express router
- [ ] Input validation middleware
- [ ] Unit tests สำหรับ VaultService
- [ ] Integration tests สำหรับ API endpoints

**Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/notes` | สร้างโน้ตใหม่ |
| GET | `/api/notes` | ดึงโน้ตทั้งหมด (pagination, filter by tag/status) |
| GET | `/api/notes/:id` | ดึงโน้ตตาม ID |
| PUT | `/api/notes/:id` | อัปเดตโน้ต |
| DELETE | `/api/notes/:id` | ลบโน้ต |

---

### Phase 2: Vector Search & RAG (ChromaDB)
**เป้าหมาย:** เพิ่ม Semantic Search ด้วย Embedding vectors

**สิ่งที่ต้องทำ:**
- [ ] `EmbeddingService` - เชื่อมต่อ ChromaDB, สร้าง embeddings จากเนื้อหาโน้ต
- [ ] `LLMService` - Wrapper สำหรับ Claude API (chat completion, embeddings)
- [ ] `RAGService` (v1) - Vector-only retrieval + LLM synthesis
- [ ] `SearchController` - `POST /api/search` endpoint
- [ ] Sync pipeline: เมื่อสร้าง/อัปเดตโน้ต → auto-embed ใน ChromaDB
- [ ] Tests สำหรับ search pipeline

**Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/search` | Semantic search ด้วย natural language query |
| POST | `/api/search/ask` | ถาม-ตอบจาก knowledge base (RAG) |

---

### Phase 3: Knowledge Graph (Neo4j)
**เป้าหมาย:** สร้าง Knowledge Graph เพื่อจับ relationships ระหว่างความรู้

**สิ่งที่ต้องทำ:**
- [ ] `GraphService` - เชื่อมต่อ Neo4j, CRUD nodes/edges
- [ ] Entity extraction pipeline - ใช้ LLM ดึง entities และ relations จากโน้ต
- [ ] Upgrade `RAGService` (v2) - Hybrid retrieval: Vector + Graph traversal
- [ ] `GET /api/graph/neighbors/:id` - ดึงโน้ตที่เกี่ยวข้องผ่าน graph
- [ ] `GET /api/graph/map` - Visualize knowledge map
- [ ] Tests สำหรับ graph operations

**Neo4j Schema:**
```cypher
(:Note {id, title, created_at})
(:Entity {name, type})  // e.g., Person, Concept, Technology
(:Tag {name})

(:Note)-[:MENTIONS]->(:Entity)
(:Note)-[:TAGGED_WITH]->(:Tag)
(:Note)-[:LINKS_TO]->(:Note)
(:Entity)-[:RELATED_TO]->(:Entity)
```

---

### Phase 4: Ingestion Layer (Telegram Bot + Voice)
**เป้าหมาย:** เพิ่มช่องทางรับข้อมูลผ่าน Telegram Bot

**สิ่งที่ต้องทำ:**
- [ ] `TelegramService` - ตั้งค่า Telegraf bot
- [ ] Text message handler → สร้างโน้ตอัตโนมัติ
- [ ] URL/Link handler → ดึงเนื้อหาจาก URL แล้วสร้างโน้ตสรุป
- [ ] Voice message handler → Whisper STT → สร้างโน้ต
- [ ] Inline query สำหรับค้นหาโน้ตจาก Telegram
- [ ] คำสั่ง Bot: `/search`, `/recent`, `/tags`, `/ask`
- [ ] Tests สำหรับ bot handlers

**Telegram Commands:**
| Command | Description |
|---------|-------------|
| `/start` | เริ่มต้นใช้งาน |
| `/search <query>` | ค้นหาโน้ต |
| `/recent` | ดูโน้ตล่าสุด |
| `/tags` | ดู tags ทั้งหมด |
| `/ask <question>` | ถาม-ตอบจาก knowledge base |
| ส่งข้อความ | สร้างโน้ตใหม่อัตโนมัติ |
| ส่ง URL | สรุปเนื้อหาจาก URL |
| ส่งเสียง | แปลงเป็นข้อความแล้วสร้างโน้ต |

---

### Phase 5: Autonomous Agents
**เป้าหมาย:** สร้าง Background Agents ที่ทำงานอัตโนมัติ

**สิ่งที่ต้องทำ:**
- [ ] `DailyDigestAgent` - สรุปสิ่งที่เรียนรู้ในแต่ละวัน, สร้าง daily note
- [ ] `AutoLinkerAgent` - สแกนโน้ตใหม่ หาความเชื่อมโยงกับโน้ตเก่าอัตโนมัติ
- [ ] `InboxOrganizerAgent` - จัดระเบียบโน้ตใน `.inbox/` → auto-tag, auto-categorize, ย้ายไปโฟลเดอร์ที่เหมาะสม
- [ ] BullMQ job queue setup (Redis)
- [ ] Cron scheduling: Daily digest ทุกเที่ยงคืน, Auto-linker ทุก 6 ชม., Inbox organizer ทุก 1 ชม.
- [ ] Agent execution logs & error reporting
- [ ] Tests สำหรับ agents

**Agent Schedule:**
| Agent | Schedule | Description |
|-------|----------|-------------|
| Daily Digest | 00:00 ทุกวัน | สรุปความรู้ใหม่ที่ได้รับในวันนั้น |
| Auto-Linker | ทุก 6 ชั่วโมง | หาความสัมพันธ์ระหว่างโน้ตใหม่กับเก่า |
| Inbox Organizer | ทุก 1 ชั่วโมง | จัดระเบียบโน้ตที่ยังไม่ได้ประมวลผล |

---

### Phase 6: External Integrations (Notion, Google Drive, Web Scraping)
**เป้าหมาย:** ดึงข้อมูลจากแหล่งภายนอกเข้ามาเป็นโน้ตใน vault อัตโนมัติ

**สิ่งที่ต้องทำ:**
- [ ] `NotionSyncService` - ดึงหน้าจาก Notion → แปลงเป็น .md เก็บใน vault
- [ ] `GoogleDriveService` - ค้นหา/ดึงเอกสารจาก Google Drive → สรุปด้วย LLM → สร้างโน้ต
- [ ] `WebScraperService` - Scrape เนื้อหาจาก URL (Chrome automation) → สร้างโน้ตสรุป
- [ ] `SyncController` - REST endpoints สำหรับจัดการ sync
- [ ] Scheduled sync jobs (BullMQ) - ตั้งเวลา sync อัตโนมัติ
- [ ] Conflict resolution - จัดการกรณีข้อมูลซ้ำหรือเปลี่ยนแปลง
- [ ] Tests สำหรับ sync services

**Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sync/notion` | Sync โน้ตจาก Notion |
| POST | `/api/sync/notion/page/:pageId` | ดึงหน้าเฉพาะจาก Notion |
| POST | `/api/sync/gdrive` | ค้นหาและดึงไฟล์จาก Google Drive |
| POST | `/api/sync/gdrive/file/:fileId` | ดึงไฟล์เฉพาะจาก Drive |
| POST | `/api/sync/scrape` | Scrape URL แล้วสร้างโน้ตสรุป |
| GET | `/api/sync/status` | ดูสถานะ sync ล่าสุด |
| GET | `/api/sync/history` | ดูประวัติการ sync |

**Notion Sync Flow:**
```
Notion Page → API fetch → Extract blocks → Convert to Markdown
  → Add frontmatter (source: notion, notion_id: xxx)
  → Save to vault/notion/
  → Embed in ChromaDB + Neo4j
```

**Google Drive Sync Flow:**
```
Drive Search/File → Download → Extract text (Docs/Sheets/PDF)
  → Summarize via LLM → Save as .md
  → Embed in ChromaDB + Neo4j
```

**Web Scraper Flow:**
```
URL → Chrome automation → Extract main content → Clean HTML
  → Summarize via LLM → Save as .md in vault/web/
  → Embed in ChromaDB + Neo4j
```

---

### Phase 7: Document Export & Report Generation
**เป้าหมาย:** สร้างเอกสารจากความรู้ใน vault ในรูปแบบต่างๆ

**สิ่งที่ต้องทำ:**
- [ ] `PdfExportService` - สร้าง/รวม PDF จากโน้ต
- [ ] `DocxExportService` - สร้าง Word document จากโน้ต
- [ ] `XlsxExportService` - Export ข้อมูลโน้ตเป็น Excel (tags, stats, timeline)
- [ ] `PptxExportService` - สร้าง presentation จากโน้ตหรือ topic
- [ ] `ReportGeneratorService` - ใช้ LLM สังเคราะห์ความรู้เป็นรายงาน
- [ ] `ExportController` - REST endpoints สำหรับ export
- [ ] Template system - เทมเพลตสำหรับแต่ละรูปแบบ
- [ ] Tests สำหรับ export services

**Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/export/pdf` | Export โน้ตเป็น PDF |
| POST | `/api/export/pdf/merge` | รวมหลายโน้ตเป็น PDF เดียว |
| POST | `/api/export/docx` | Export เป็น Word document |
| POST | `/api/export/xlsx` | Export ข้อมูลเป็น Excel |
| POST | `/api/export/pptx` | สร้าง presentation จาก topic/notes |
| POST | `/api/export/report` | สร้างรายงานสังเคราะห์จาก knowledge base |
| GET | `/api/export/formats` | ดูรูปแบบที่รองรับ |

**Report Generation Flow:**
```
User: "สร้างรายงานเรื่อง AI Trends จากความรู้ที่มี"
  → RAG search related notes
  → LLM synthesize into structured report
  → Generate PDF/DOCX/PPTX
  → Return download link
```

**Excel Export Formats:**
| Sheet | เนื้อหา |
|-------|---------|
| Notes Overview | ตาราง id, title, tags, created_at, status |
| Tag Analytics | สถิติ tags ที่ใช้บ่อย, tag cloud data |
| Timeline | ไทม์ไลน์การสร้างโน้ต |
| Knowledge Graph | Adjacency matrix ของ note connections |

---

### Phase 8: Cloud Deployment & Design (Cloudflare + Canva)
**เป้าหมาย:** Deploy ขึ้น Cloudflare Workers + สร้าง visual assets ด้วย Canva

**สิ่งที่ต้องทำ:**
- [ ] `CloudflareDeployService` - Deploy API เป็น Cloudflare Worker
- [ ] D1 Database setup - ใช้ Cloudflare D1 เป็น metadata store บน edge
- [ ] KV Namespace - แคช frequently accessed notes
- [ ] R2 Bucket - เก็บไฟล์ export (PDF, DOCX, etc.)
- [ ] `CanvaDesignService` - สร้าง visual knowledge maps, infographics
- [ ] `DesignController` - REST endpoints สำหรับ design generation
- [ ] Wrangler config (wrangler.toml)
- [ ] Edge-compatible build pipeline
- [ ] Tests สำหรับ deployment

**Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/design/knowledge-map` | สร้าง visual knowledge map ด้วย Canva |
| POST | `/api/design/infographic` | สร้าง infographic จาก topic |
| POST | `/api/design/summary-card` | สร้าง summary card สำหรับแชร์ |
| GET | `/api/design/:id` | ดึง design ที่สร้างแล้ว |
| POST | `/api/deploy/status` | ดูสถานะ deployment |

**Cloudflare Architecture:**
```
┌─────────────────────────────────────────┐
│           Cloudflare Edge               │
│  ┌─────────┐  ┌────┐  ┌────┐  ┌────┐  │
│  │ Worker  │  │ D1 │  │ KV │  │ R2 │  │
│  │ (API)   │  │(DB)│  │(캐시)│  │(FS)│  │
│  └─────────┘  └────┘  └────┘  └────┘  │
└─────────────────────────────────────────┘
         ↕ sync
┌─────────────────────────────────────────┐
│         Local Development               │
│  Express API + Vault + ChromaDB + Neo4j │
└─────────────────────────────────────────┘
```

**Canva Design Templates:**
| Template | ใช้ทำอะไร |
|----------|----------|
| Knowledge Map | แผนที่ความสัมพันธ์ระหว่างโน้ต/concepts |
| Daily Digest Card | สรุปประจำวันแบบ visual |
| Topic Infographic | สรุป topic เดียวเป็น infographic |
| Progress Timeline | ไทม์ไลน์การเรียนรู้ |

---

## Key Design Decisions

1. **Local-First**: ไฟล์ Markdown คือ source of truth → สามารถใช้กับ Obsidian/VS Code ได้ทันที
2. **Clean Architecture**: Controller → Service → Storage layers แยกชัดเจน
3. **Hybrid RAG**: ใช้ทั้ง Vector Search (ความหมายคล้ายกัน) + Graph (ความสัมพันธ์เชิงโครงสร้าง) เพื่อผลลัพธ์ที่ดีกว่าการใช้ Vector Search เพียงอย่างเดียว
4. **Idempotent Sync**: ทุกครั้งที่เขียน .md → sync ChromaDB + Neo4j อัตโนมัติ
5. **Graceful Degradation**: ถ้า ChromaDB/Neo4j ล่ม ระบบยังทำงาน CRUD ปกติจาก vault ได้

---

## Current Status

- [x] Phase 0: Project Initialization
  - [x] Node.js/TypeScript project setup
  - [x] Dependencies installed
  - [x] Folder structure created
  - [x] ESLint, Prettier, Jest configured
  - [x] Base Express app with health check
  - [x] Config, Logger, ErrorHandler utilities
  - [x] Note model/interfaces defined
- [ ] Phase 1: Storage & Foundation
- [ ] Phase 2: Vector Search & RAG
- [ ] Phase 3: Knowledge Graph
- [ ] Phase 4: Ingestion Layer (Telegram)
- [ ] Phase 5: Autonomous Agents
- [ ] Phase 6: External Integrations (Notion, Google Drive, Web Scraping)
- [ ] Phase 7: Document Export & Report Generation (PDF, DOCX, XLSX, PPTX)
- [ ] Phase 8: Cloud Deployment & Design (Cloudflare Workers, Canva)
