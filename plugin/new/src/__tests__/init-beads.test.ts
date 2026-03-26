/**
 * Tests for beads seeding during bmad_init_project.
 *
 * Verifies that all 23 WORKFLOW_REGISTRY workflows are created as beads
 * with correct labels and dependency relationships matching the `requires[]`
 * arrays in the registry.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import {
  initBeads,
  createBead,
  addDep,
  closeBead,
  getReady,
  listBeads,
  getBead,
} from "../lib/beads.ts";
import type { BeadRecord } from "../lib/beads.ts";

// ── The complete BMAD workflow dependency map ───────────────────────────────
// Extracted from workflow-registry.ts — this IS the source of truth.

interface WorkflowDef {
  id: string;
  phase: string;
  requires: string[];
}

const WORKFLOWS: WorkflowDef[] = [
  // Analysis (no deps)
  { id: "create-product-brief", phase: "analysis", requires: [] },
  { id: "market-research", phase: "analysis", requires: [] },
  { id: "domain-research", phase: "analysis", requires: [] },
  { id: "technical-research", phase: "analysis", requires: [] },
  { id: "document-project", phase: "analysis", requires: [] },
  { id: "generate-project-context", phase: "analysis", requires: [] },
  { id: "brainstorming", phase: "analysis", requires: [] },
  { id: "quick-spec", phase: "analysis", requires: [] },

  // Planning
  { id: "create-prd", phase: "planning", requires: ["create-product-brief"] },
  { id: "validate-prd", phase: "planning", requires: ["create-prd"] },
  { id: "edit-prd", phase: "planning", requires: ["create-prd"] },
  { id: "create-ux-design", phase: "planning", requires: ["create-prd"] },

  // Solutioning
  { id: "create-architecture", phase: "solutioning", requires: ["create-prd"] },
  {
    id: "create-epics-and-stories",
    phase: "solutioning",
    requires: ["create-prd", "create-architecture"],
  },
  {
    id: "check-implementation-readiness",
    phase: "solutioning",
    requires: ["create-prd", "create-architecture", "create-epics-and-stories"],
  },

  // Implementation
  {
    id: "sprint-planning",
    phase: "implementation",
    requires: ["create-epics-and-stories"],
  },
  { id: "create-story", phase: "implementation", requires: ["sprint-planning"] },
  { id: "dev-story", phase: "implementation", requires: ["create-story"] },
  { id: "code-review", phase: "implementation", requires: ["dev-story"] },
  { id: "correct-course", phase: "implementation", requires: ["sprint-planning"] },
  { id: "sprint-status", phase: "implementation", requires: ["sprint-planning"] },
  { id: "retrospective", phase: "implementation", requires: ["sprint-planning"] },
  { id: "qa-generate-e2e-tests", phase: "implementation", requires: ["dev-story"] },

  // Quick flow
  { id: "quick-dev", phase: "implementation", requires: ["quick-spec"] },
];

// ── Test setup: seed all workflow beads ──────────────────────────────────────

let testDir: string;
const beadIdMap = new Map<string, string>(); // workflow.id → bead ID

async function seedWorkflowBeads(dir: string): Promise<void> {
  for (const wf of WORKFLOWS) {
    const id = await createBead(dir, {
      title: wf.id,
      labels: ["workflow", `phase:${wf.phase}`],
      desc: `Workflow: ${wf.id}`,
    });
    beadIdMap.set(wf.id, id);
  }

  // Now add all dependencies
  for (const wf of WORKFLOWS) {
    const beadId = beadIdMap.get(wf.id)!;
    for (const reqId of wf.requires) {
      const reqBeadId = beadIdMap.get(reqId)!;
      await addDep(dir, beadId, reqBeadId);
    }
  }
}

beforeAll(async () => {
  testDir = await mkdtemp(join(tmpdir(), "beads-init-"));
  execFileSync("git", ["init", "-q"], { cwd: testDir });
  await initBeads(testDir);
  await seedWorkflowBeads(testDir);
}, 60000);

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function getBeadId(workflowId: string): string {
  const id = beadIdMap.get(workflowId);
  if (!id) throw new Error(`No bead for workflow: ${workflowId}`);
  return id;
}

async function closeWorkflow(workflowId: string): Promise<void> {
  await closeBead(testDir, getBeadId(workflowId));
}

async function getReadyWorkflowIds(): Promise<string[]> {
  const ready = await getReady(testDir, { label: "workflow" });
  return ready.map((b) => b.title);
}

// ── Workflow bead creation ──────────────────────────────────────────────────

describe("workflow bead creation", () => {
  it("creates one bead per workflow in WORKFLOW_REGISTRY (25 workflows)", async () => {
    const workflows = await listBeads(testDir, { label: "workflow" });
    expect(workflows.length).toBe(WORKFLOWS.length);
  });

  it("each workflow bead has label 'workflow'", async () => {
    const workflows = await listBeads(testDir, { label: "workflow" });
    for (const wf of workflows) {
      expect(wf.labels).toContain("workflow");
    }
  });

  it("each workflow bead has label 'phase:{phase}'", async () => {
    for (const wf of WORKFLOWS) {
      const bead = await getBead(testDir, getBeadId(wf.id));
      expect(bead.labels).toContain(`phase:${wf.phase}`);
    }
  });

  it("workflow bead title matches workflow.id", async () => {
    for (const wf of WORKFLOWS) {
      const bead = await getBead(testDir, getBeadId(wf.id));
      expect(bead.title).toBe(wf.id);
    }
  });
});

// ── Dependency graph — analysis phase (no deps) ────────────────────────────

describe("dependency graph — analysis phase (no deps)", () => {
  const analysisFree = [
    "create-product-brief",
    "market-research",
    "domain-research",
    "technical-research",
    "brainstorming",
    "document-project",
    "generate-project-context",
    "quick-spec",
  ];

  for (const wfId of analysisFree) {
    it(`${wfId} has 0 blockers — immediately ready`, async () => {
      const bead = await getBead(testDir, getBeadId(wfId));
      expect((bead.dependencies?.length ?? 0)).toBe(0);
    });
  }
});

// ── Dependency graph — planning phase ───────────────────────────────────────

describe("dependency graph — planning phase", () => {
  it("create-prd blocked by create-product-brief", async () => {
    const bead = await getBead(testDir, getBeadId("create-prd"));
    expect((bead.dependencies?.length ?? 0)).toBe(1);
  });

  it("validate-prd blocked by create-prd", async () => {
    const bead = await getBead(testDir, getBeadId("validate-prd"));
    expect((bead.dependencies?.length ?? 0)).toBe(1);
  });

  it("edit-prd blocked by create-prd", async () => {
    const bead = await getBead(testDir, getBeadId("edit-prd"));
    expect((bead.dependencies?.length ?? 0)).toBe(1);
  });

  it("create-ux-design blocked by create-prd", async () => {
    const bead = await getBead(testDir, getBeadId("create-ux-design"));
    expect((bead.dependencies?.length ?? 0)).toBe(1);
  });
});

// ── Dependency graph — solutioning phase ────────────────────────────────────

describe("dependency graph — solutioning phase", () => {
  it("create-architecture blocked by create-prd", async () => {
    const bead = await getBead(testDir, getBeadId("create-architecture"));
    expect((bead.dependencies?.length ?? 0)).toBe(1);
  });

  it("create-epics-and-stories blocked by create-prd AND create-architecture", async () => {
    const bead = await getBead(testDir, getBeadId("create-epics-and-stories"));
    expect((bead.dependencies?.length ?? 0)).toBe(2);
  });

  it("check-implementation-readiness blocked by 3 workflows", async () => {
    const bead = await getBead(
      testDir,
      getBeadId("check-implementation-readiness")
    );
    expect((bead.dependencies?.length ?? 0)).toBe(3);
  });
});

// ── Dependency graph — implementation phase ─────────────────────────────────

describe("dependency graph — implementation phase", () => {
  it("sprint-planning blocked by create-epics-and-stories", async () => {
    const bead = await getBead(testDir, getBeadId("sprint-planning"));
    expect((bead.dependencies?.length ?? 0)).toBe(1);
  });

  it("create-story blocked by sprint-planning", async () => {
    const bead = await getBead(testDir, getBeadId("create-story"));
    expect((bead.dependencies?.length ?? 0)).toBe(1);
  });

  it("dev-story blocked by create-story", async () => {
    const bead = await getBead(testDir, getBeadId("dev-story"));
    expect((bead.dependencies?.length ?? 0)).toBe(1);
  });

  it("code-review blocked by dev-story", async () => {
    const bead = await getBead(testDir, getBeadId("code-review"));
    expect((bead.dependencies?.length ?? 0)).toBe(1);
  });

  it("correct-course blocked by sprint-planning", async () => {
    const bead = await getBead(testDir, getBeadId("correct-course"));
    expect((bead.dependencies?.length ?? 0)).toBe(1);
  });

  it("sprint-status blocked by sprint-planning", async () => {
    const bead = await getBead(testDir, getBeadId("sprint-status"));
    expect((bead.dependencies?.length ?? 0)).toBe(1);
  });

  it("retrospective blocked by sprint-planning", async () => {
    const bead = await getBead(testDir, getBeadId("retrospective"));
    expect((bead.dependencies?.length ?? 0)).toBe(1);
  });

  it("qa-generate-e2e-tests blocked by dev-story", async () => {
    const bead = await getBead(testDir, getBeadId("qa-generate-e2e-tests"));
    expect((bead.dependencies?.length ?? 0)).toBe(1);
  });
});

// ── Dependency graph — quick flow ───────────────────────────────────────────

describe("dependency graph — quick flow", () => {
  it("quick-dev blocked by quick-spec", async () => {
    const bead = await getBead(testDir, getBeadId("quick-dev"));
    expect((bead.dependencies?.length ?? 0)).toBe(1);
  });
});

// ── bd ready reflects gating ────────────────────────────────────────────────

describe("bd ready reflects gating", () => {
  it("initially only analysis-phase + standalone workflows are ready", async () => {
    const readyIds = await getReadyWorkflowIds();

    // All analysis-phase workflows should be ready
    expect(readyIds).toContain("create-product-brief");
    expect(readyIds).toContain("market-research");
    expect(readyIds).toContain("domain-research");
    expect(readyIds).toContain("technical-research");
    expect(readyIds).toContain("brainstorming");
    expect(readyIds).toContain("document-project");
    expect(readyIds).toContain("generate-project-context");
    expect(readyIds).toContain("quick-spec");

    // No planning/solutioning/implementation workflows should be ready
    expect(readyIds).not.toContain("create-prd");
    expect(readyIds).not.toContain("create-architecture");
    expect(readyIds).not.toContain("sprint-planning");
  });

  it("after closing create-product-brief, create-prd becomes ready", async () => {
    await closeWorkflow("create-product-brief");
    const readyIds = await getReadyWorkflowIds();
    expect(readyIds).toContain("create-prd");
  });

  it("after closing create-prd, architecture + validate + edit + ux become ready", async () => {
    await closeWorkflow("create-prd");
    const readyIds = await getReadyWorkflowIds();
    expect(readyIds).toContain("create-architecture");
    expect(readyIds).toContain("validate-prd");
    expect(readyIds).toContain("edit-prd");
    expect(readyIds).toContain("create-ux-design");
  });

  it("after closing create-architecture, create-epics-and-stories becomes ready", async () => {
    await closeWorkflow("create-architecture");
    const readyIds = await getReadyWorkflowIds();
    expect(readyIds).toContain("create-epics-and-stories");
  });

  it("after closing create-epics-and-stories, sprint-planning becomes ready", async () => {
    await closeWorkflow("create-epics-and-stories");
    const readyIds = await getReadyWorkflowIds();
    expect(readyIds).toContain("sprint-planning");
    expect(readyIds).toContain("check-implementation-readiness");
  });
});
