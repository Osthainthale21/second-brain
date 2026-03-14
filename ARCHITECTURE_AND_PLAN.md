# Second Brain - Architecture & Implementation Plan

## System Overview

ระบบ **Advanced AI-Augmented Second Brain** คือ API ที่ทำหน้าที่เป็น "สมองที่ 2" อัจฉริยะ โดยใช้ Hybrid-RAG (Vector Search + Knowledge Graph) ร่วมกับ LLM เพื่อจัดเก็บ, ค้นหา, และสังเคราะห์ความรู้จากโน้ตที่ผู้ใช้สร้างขึ้น

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        INGESTION LAYER                          │
│   ┌──────────┐   ┌──────────────┐   ┌───────────────────────┐  │
│   │ REST API │   │ Telegram Bot │   │ Voice (Whisper STT)   │  │
│   └────┬─────┘   └──────┬───────┘   └───────────┬───────────┘  │
│        └────────────┬────┴───────────────────────┘              │
│                     ▼                                           │
│           ┌─────────────────┐                                   │
│           │ Ingestion Queue │ (BullMQ/Redis)                    │
│           └────────┬────────┘                                   │
└────────────────────┼────────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                     PROCESSING LAYER                            │
│   ┌────────────────────────────────────────────────────────┐    │
│   │              Ingestion Pipeline                        │    │
│   │  1. Parse & Extract Frontmatter                        │    │
│   │  2. Auto-tag via LLM                                   │    │
│   │  3. Generate Embeddings                                │    │
│   │  4. Extract Entities & Relations                       │    │
│   │  5. Save to Vault (.md), ChromaDB, Neo4j               │    │
│   └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                      STORAGE LAYER                              │
│  ┌──────────────┐  ┌───────────────┐  ┌─────────────────────┐  │
│  │  Local Vault  │  │   ChromaDB    │  │      Neo4j          │  │
│  │  (.md files)  │  │ (Vectors/Emb) │  │ (Knowledge Graph)   │  │
│  │  Source of    │  │ Semantic      │  │ Entities, Relations │  │
│  │  Truth        │  │ Similarity    │  │ Concept Maps        │  │
│  └──────────────┘  └───────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    RETRIEVAL LAYER (Hybrid RAG)                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Query → Vector Search (ChromaDB)  ─┐                     │ │
│  │                                      ├→ Rank & Merge → LLM│ │
│  │  Query → Graph Traversal (Neo4j)   ─┘                     │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                   AUTONOMOUS AGENTS LAYER                       │
│  ┌──────────────┐ ┌────────────────┐ ┌──────────────────────┐  │
│  │ Daily Digest │ │ Auto-Linker    │ │ Inbox Organizer      │  │
│  │ Agent        │ │ Agent          │ │ Agent                │  │
│  └──────────────┘ └────────────────┘ └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Folder Structure

```
second-brain/
├── src/
│   ├── config/          # Environment & service configuration
│   │   └── index.ts
│   ├── controllers/     # Request handlers (thin, delegate to services)
│   │   ├── notes.controller.ts
│   │   └── search.controller.ts
│   ├── services/        # Business logic layer
│   │   ├── vault.service.ts        # CRUD on .md files
│   │   ├── embedding.service.ts    # ChromaDB operations
│   │   ├── graph.service.ts        # Neo4j operations
│   │   ├── rag.service.ts          # Hybrid RAG orchestrator
│   │   ├── llm.service.ts          # Claude/OpenAI wrapper
│   │   └── telegram.service.ts     # Telegram bot handler
│   ├── agents/          # Autonomous background agents
│   │   ├── daily-digest.agent.ts
│   │   ├── auto-linker.agent.ts
│   │   └── inbox-organizer.agent.ts
│   ├── routes/          # Express route definitions
│   │   ├── notes.routes.ts
│   │   └── search.routes.ts
│   ├── models/          # TypeScript interfaces & types
│   │   └── Note.ts
│   ├── middleware/       # Express middleware
│   │   └── errorHandler.ts
│   ├── utils/           # Shared utilities
│   │   └── logger.ts
│   ├── app.ts           # Express app setup
│   └── server.ts        # Entry point
├── vault/               # Local Markdown vault (source of truth)
│   └── .inbox/          # Unprocessed notes landing zone
├── ARCHITECTURE_AND_PLAN.md
├── package.json
├── tsconfig.json
├── jest.config.ts
├── .eslintrc.json
├── .prettierrc
├── .env.example
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
