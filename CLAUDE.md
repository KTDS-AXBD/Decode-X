# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AI Foundry** (v0.6, Draft) — a domain knowledge extraction platform that reverse-engineers SI project deliverables (ERD, screen designs, API specs, ISP, requirements docs) to extract tacit knowledge and package it as reusable **AI Skill assets**. Built by KTDS AX BD팀. Pilot domain: 퇴직연금 (Retirement Pension).

Full product requirements and technical design are in `docs/AI_Foundry_PRD_TDS_v0.6.docx`. This is the authoritative reference for all design decisions.

> **Status**: Pre-development. No application code exists yet. This repo will become the implementation home.

---

## Architecture

### 6-Layer System
| Layer | Responsibility |
|---|---|
| **Core Engine** | 5-stage document-to-Skill pipeline |
| **AI Governing** | LLM policy, prompt versioning, cost/data governance, audit |
| **Evaluation** | 3-level trust scoring (individual output → Skill package → system) |
| **DevSecOps** | RBAC, CI/CD, env separation, monitoring, resilience |
| **AI UX** | 13 screens across 5 personas (Cloudflare Pages SPA) |
| **Data & Ontology** | D1 (10 DBs), Neo4j Aura (graph), SKOS/JSON-LD (ontology), R2 (objects) |

### 5-Stage Core Engine Pipeline
```
Stage 1: Document Ingestion
  Input: PDF, PPT, DOCX, Excel, Image (ERD)
  Engine: Unstructured.io (main) + Claude Vision (ERD) + Custom Excel parser
  Output: Structured chunks + classification labels

Stage 2: Structure Extraction
  Engine: Claude Sonnet (complex) / Haiku (standard)
  Output: Process graph + entity relation map + trace matrix

Stage 3: Policy Inference  ← competitive moat; HITL core
  Engine: Claude Opus (policy gen) + Cloudflare HITL (DO + Queues)
  Output: Policy candidates → HITL review → confirmed policies (condition-criteria-outcome triples)

Stage 4: Ontology Normalization
  Engine: SKOS/JSON-LD + Neo4j Aura + Haiku/Workers AI (embedding)
  Output: Domain ontology graph + terminology dictionary

Stage 5: Skill Packaging
  Engine: Custom Skill Spec + Claude Sonnet (docs)
  Output: .skill.json (AI Foundry Spec) + MCP adapter + OpenAPI adapter
```

### MSA — 10 Cloudflare Workers Services
**Domain (Pipeline):**
- `SVC-01` Document Ingestion — Workers, R2, Queue
- `SVC-02` Structure Extraction — Claude, Neo4j
- `SVC-03` Policy Inference — Claude Opus, Durable Objects, Queue
- `SVC-04` Ontology — Neo4j Aura, Workers AI
- `SVC-05` Skill Packaging — Claude Sonnet, R2

**Platform (Cross-cutting):**
- `SVC-06` LLM Router — AI Gateway (tier routing, caching, fallback)
- `SVC-07` Security — Cloudflare Access, RBAC, masking pipeline, audit
- `SVC-08` Governance — Prompt Registry, cost monitoring, trust dashboard
- `SVC-09` Notification — Queue-based review alerts
- `SVC-10` Analytics — KPI aggregation, business dashboards

### Infrastructure (Cloudflare-native)
- **Compute**: Workers (10 SVCs) + Durable Objects (HITL session state)
- **Storage**: D1 (10 separate DBs, one per SVC) + R2 (documents, Skill packages) + KV (cache)
- **Async**: Cloudflare Queues (pipeline event bus: 6 event types)
- **Frontend**: Cloudflare Pages (SPA, 13 screens)
- **LLM gateway**: Cloudflare AI Gateway (logging, caching, rate limiting for all Anthropic calls)
- **Auth**: Cloudflare Access (Zero Trust, SSO with KT DS IdP)
- **Graph DB**: Neo4j Aura (Free → Pro as needed)

### LLM Tier Routing (via SVC-06)
- **Tier 1** (Opus): complexity score > 0.7 — Stage 3 policy inference
- **Tier 2** (Sonnet/Haiku): complexity 0.4–0.7 / < 0.4 — Stages 2, 4, 5
- **Tier 3** (Workers AI): embeddings, classification, similarity

### Skill Package Output Format
- File: `.skill.json` (JSON Schema Draft 2020-12), stored in R2 `skill-packages/`
- Core fields: `skillId`, `metadata`, `policies[]` (condition-criteria-outcome triples), `trust`, `provenance`, `ontologyRef`
- Policy code format: `POL-{DOMAIN}-{TYPE}-{SEQ}` (e.g., `POL-PENSION-WD-HOUSING-001`)
- Adapters are generated projections from the core spec (MCP in Phase 3, OpenAPI in Phase 4)

---

## Key Design Decisions
| ID | Decision |
|---|---|
| T-1 | Hybrid document parsing: Unstructured.io + Claude Vision + custom Excel parser |
| T-2 | Claude-centric tiered LLM: Opus/Sonnet/Haiku + Workers AI (60–70% cost reduction) |
| T-3 | SKOS/JSON-LD ontology schema + Neo4j Aura execution layer |
| T-4 | Custom AI Foundry Skill Spec as single source of truth; MCP/OpenAPI are adapters |
| T-5 | HITL workflow via Cloudflare native primitives (Workers + DO + Queues + D1) |
| T-6 | Full Cloudflare stack + Anthropic API + Neo4j Aura |

---

## User Personas & RBAC Roles
| Persona | Role | CF Access Role |
|---|---|---|
| A — SI Consultant/BD | Upload docs, run pipeline, compare processes | `Analyst` |
| B — Domain Expert | HITL policy review (approve/modify/reject) | `Reviewer` |
| C — AI Engineer | Download/integrate Skill packages | `Developer` |
| D — Client Rep | Read-only results + security audit view | `Client` |
| E — Executive | Trust/ROI/cost dashboard | `Executive` |

---

## Development Phases
| Phase | Weeks | Focus |
|---|---|---|
| 1 — Foundation | W1–W8 | Stage 1–2, masking MW, CF infra, RBAC, CI/CD, Prompt Registry, SVC-01/06/07 skeleton |
| 2 — Pension Pilot | W9–W16 | Stage 3 (Policy+HITL), Stage 4, multi-company comparison, Trust L1+L2, S-B2 Review UI |
| 3 — Skillization | W17–W20 | Stage 5, Skill Spec finalization, MCP adapter, Skill Catalog (S-C1/C2), Trust L3 |
| 4 — Enhancement | W21–W24 | OpenAPI adapter, iterative learning loop, governance dashboard, cost optimization |

Phase 1 Sprint Backlog has 8 Epics (E-01 through E-08), ~40 stories defined in the PRD §44.

---

## Data & Ontology Architecture
- **10 D1 databases** — one per SVC (`db-ingestion`, `db-structure`, `db-policy`, `db-ontology`, `db-skill`, `db-llm`, `db-security`, `db-governance`, `db-notification`, `db-analytics`). Cross-DB references use ID-based loose coupling.
- **Neo4j schema** — 12 node types (Domain, Process, Policy, Entity, Attribute, Screen, API, Document, Term, Skill, Organization, Reviewer) and 20 relationship types.
- **SKOS/JSON-LD** — manages cross-organization term mappings; each `Term` node in Neo4j maps 1:1 to a SKOS Concept.

---

## Security & Data Governance
- All documents are masked before any external API call (PII → tokens, stored encrypted in D1)
- Data classification: Confidential (no LLM) → Internal (masked only) → Public (all tiers)
- Audit logs: 5-year retention (financial regulation compliance)
- Prompt Registry: every prompt versioned (semver), regression-tested against Golden Test Set before deploy, Blue-Green rollout (10% → 50% → 100%)

---

## Environments
| Resource | Dev | Staging | Production |
|---|---|---|---|
| Workers | `wrangler dev` local | Staging deployment | Production |
| D1 | Local SQLite | Staging DB | Encrypted prod DB |
| LLM | Haiku only | Sonnet | Full tier routing |
| Data | Synthetic only | Anonymized samples | Real (masked) |

---

## Repo Structure (planned — monorepo)
Section 29.5 of the PRD defines the planned Cloudflare Workers monorepo layout with one `wrangler.toml` per service. Each SVC deploys independently. As directories are created, update this file with the actual structure.
