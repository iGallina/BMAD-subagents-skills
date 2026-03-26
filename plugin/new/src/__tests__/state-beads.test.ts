/**
 * Tests for the beads-backed state module.
 *
 * Verifies that readState() reconstructs BmadState identically to
 * what the old JSON-backed module would produce, and that writeState()
 * correctly translates state changes into beads operations.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import {
  initBeads,
  createBead,
  addDep,
  claimBead,
  closeBead,
  getBead,
  listBeads,
} from "../lib/beads.ts";
import {
  readState,
  writeState,
  createInitialState,
  bmadDir,
} from "../lib/state.ts";
import type { BmadState, ActiveWorkflow } from "../../types.ts";

// ── Helpers ─────────────────────────────────────────────────────────────────

let testDir: string;
const beadIdMap = new Map<string, string>();

// Minimal workflow set for state tests (just enough to test phase derivation)
const TEST_WORKFLOWS = [
  { id: "create-product-brief", phase: "analysis", requires: [] as string[] },
  { id: "create-prd", phase: "planning", requires: ["create-product-brief"] },
  {
    id: "create-architecture",
    phase: "solutioning",
    requires: ["create-prd"],
  },
  {
    id: "create-epics-and-stories",
    phase: "solutioning",
    requires: ["create-prd", "create-architecture"],
  },
  {
    id: "sprint-planning",
    phase: "implementation",
    requires: ["create-epics-and-stories"],
  },
];

async function seedTestBeads(dir: string): Promise<void> {
  // Create project root bead
  await createBead(dir, {
    title: "Project: TestProject",
    labels: ["project"],
  });

  // Seed workflow beads with metadata
  for (const wf of TEST_WORKFLOWS) {
    const id = await createBead(dir, {
      title: wf.id,
      labels: ["workflow", `phase:${wf.phase}`],
      desc: `Test workflow: ${wf.id}`,
    });
    beadIdMap.set(wf.id, id);
  }

  // Add dependencies
  for (const wf of TEST_WORKFLOWS) {
    const beadId = beadIdMap.get(wf.id)!;
    for (const reqId of wf.requires) {
      const reqBeadId = beadIdMap.get(reqId)!;
      await addDep(dir, beadId, reqBeadId);
    }
  }
}

beforeAll(async () => {
  testDir = await mkdtemp(join(tmpdir(), "beads-state-"));
  execFileSync("git", ["init", "-q"], { cwd: testDir });
  await mkdir(join(testDir, "_bmad"), { recursive: true });
  await initBeads(testDir);
  await seedTestBeads(testDir);
}, 60000);

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

// ── bmadDir ─────────────────────────────────────────────────────────────────

describe("bmadDir", () => {
  it("returns {projectPath}/_bmad (unchanged behavior)", () => {
    expect(bmadDir("/some/path")).toBe("/some/path/_bmad");
  });
});

// ── createInitialState ──────────────────────────────────────────────────────

describe("createInitialState", () => {
  it("returns BmadState with phase 'analysis' and empty arrays", () => {
    const state = createInitialState("/test/path", "TestProject");
    expect(state.projectName).toBe("TestProject");
    expect(state.projectPath).toBe("/test/path");
    expect(state.currentPhase).toBe("analysis");
    expect(state.activeWorkflow).toBeNull();
    expect(state.completedWorkflows).toEqual([]);
    expect(state.createdAt).toBeTruthy();
  });
});

// ── readState — fresh project ───────────────────────────────────────────────

describe("readState — fresh project", () => {
  it("returns BmadState with projectName from project bead", async () => {
    const state = await readState(testDir);
    expect(state).not.toBeNull();
    expect(state!.projectName).toBe("TestProject");
  });

  it("returns currentPhase 'analysis' when no workflows completed", async () => {
    const state = await readState(testDir);
    expect(state!.currentPhase).toBe("analysis");
  });

  it("returns activeWorkflow null when no workflow claimed", async () => {
    const state = await readState(testDir);
    expect(state!.activeWorkflow).toBeNull();
  });

  it("returns empty completedWorkflows array", async () => {
    const state = await readState(testDir);
    expect(state!.completedWorkflows).toEqual([]);
  });

  it("returns null for uninitialized project (no .beads/)", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "beads-empty-"));
    const state = await readState(emptyDir);
    expect(state).toBeNull();
    await rm(emptyDir, { recursive: true, force: true });
  });
});

// ── readState — phase derivation ────────────────────────────────────────────

describe("readState — phase derivation", () => {
  let phaseDir: string;
  const phaseBeadMap = new Map<string, string>();

  beforeAll(async () => {
    phaseDir = await mkdtemp(join(tmpdir(), "beads-phase-"));
    execFileSync("git", ["init", "-q"], { cwd: phaseDir });
    await mkdir(join(phaseDir, "_bmad"), { recursive: true });
    await initBeads(phaseDir);

    await createBead(phaseDir, {
      title: "Project: PhaseTest",
      labels: ["project"],
    });

    for (const wf of TEST_WORKFLOWS) {
      const id = await createBead(phaseDir, {
        title: wf.id,
        labels: ["workflow", `phase:${wf.phase}`],
      });
      phaseBeadMap.set(wf.id, id);
    }
    for (const wf of TEST_WORKFLOWS) {
      for (const req of wf.requires) {
        await addDep(phaseDir, phaseBeadMap.get(wf.id)!, phaseBeadMap.get(req)!);
      }
    }
  }, 60000);

  afterAll(async () => {
    await rm(phaseDir, { recursive: true, force: true });
  });

  it("returns 'analysis' when only analysis workflows are available", async () => {
    const state = await readState(phaseDir);
    expect(state!.currentPhase).toBe("analysis");
  });

  it("returns 'planning' when a planning-phase workflow is in_progress", async () => {
    // Close the analysis prerequisite
    await closeBead(phaseDir, phaseBeadMap.get("create-product-brief")!);
    // Claim the planning workflow
    await claimBead(phaseDir, phaseBeadMap.get("create-prd")!);

    const state = await readState(phaseDir);
    expect(state!.currentPhase).toBe("planning");
  });

  it("returns 'solutioning' after create-prd closed + create-architecture in_progress", async () => {
    await closeBead(phaseDir, phaseBeadMap.get("create-prd")!);
    await claimBead(phaseDir, phaseBeadMap.get("create-architecture")!);

    const state = await readState(phaseDir);
    expect(state!.currentPhase).toBe("solutioning");
  });

  it("returns 'implementation' after create-epics-and-stories is closed", async () => {
    await closeBead(phaseDir, phaseBeadMap.get("create-architecture")!);
    const epicId = phaseBeadMap.get("create-epics-and-stories")!;
    await claimBead(phaseDir, epicId);
    await closeBead(phaseDir, epicId);

    const state = await readState(phaseDir);
    expect(state!.currentPhase).toBe("implementation");
  });
});

// ── readState — active workflow reconstruction ──────────────────────────────

describe("readState — active workflow reconstruction", () => {
  let activeDir: string;
  let workflowBeadId: string;

  beforeAll(async () => {
    activeDir = await mkdtemp(join(tmpdir(), "beads-active-"));
    execFileSync("git", ["init", "-q"], { cwd: activeDir });
    await mkdir(join(activeDir, "_bmad"), { recursive: true });
    await initBeads(activeDir);

    await createBead(activeDir, {
      title: "Project: ActiveTest",
      labels: ["project"],
    });

    workflowBeadId = await createBead(activeDir, {
      title: "create-product-brief",
      labels: ["workflow", "phase:analysis"],
    });
  }, 60000);

  afterAll(async () => {
    await rm(activeDir, { recursive: true, force: true });
  });

  it("returns null activeWorkflow when no bead is in_progress", async () => {
    const state = await readState(activeDir);
    expect(state!.activeWorkflow).toBeNull();
  });

  it("reconstructs ActiveWorkflow from in_progress bead metadata", async () => {
    await claimBead(activeDir, workflowBeadId);
    // Store workflow metadata
    const { bdExec } = await import("../lib/beads.ts");
    await bdExec(activeDir, [
      "update",
      workflowBeadId,
      "--metadata",
      JSON.stringify({
        agentId: "analyst",
        agentName: "Business Analyst",
        mode: "yolo",
        currentStep: 2,
        totalSteps: 5,
        currentStepFile: "/path/to/step-02.md",
        outputFile: "_bmad-output/planning-artifacts/brief.md",
        startedAt: "2026-03-25T10:00:00Z",
      }),
    ]);

    const state = await readState(activeDir);
    expect(state!.activeWorkflow).not.toBeNull();

    const active = state!.activeWorkflow!;
    expect(active.id).toBe("create-product-brief");
    expect(active.agentId).toBe("analyst");
    expect(active.agentName).toBe("Business Analyst");
    expect(active.mode).toBe("yolo");
    expect(active.currentStep).toBe(2);
    expect(active.totalSteps).toBe(5);
    expect(active.currentStepFile).toBe("/path/to/step-02.md");
  });
});

// ── readState — completed workflows ─────────────────────────────────────────

describe("readState — completed workflows", () => {
  let completedDir: string;

  beforeAll(async () => {
    completedDir = await mkdtemp(join(tmpdir(), "beads-completed-"));
    execFileSync("git", ["init", "-q"], { cwd: completedDir });
    await mkdir(join(completedDir, "_bmad"), { recursive: true });
    await initBeads(completedDir);

    await createBead(completedDir, {
      title: "Project: CompletedTest",
      labels: ["project"],
    });

    const id1 = await createBead(completedDir, {
      title: "create-product-brief",
      labels: ["workflow", "phase:analysis"],
    });
    const { bdExec } = await import("../lib/beads.ts");
    await bdExec(completedDir, [
      "update",
      id1,
      "--metadata",
      JSON.stringify({
        agentId: "analyst",
        outputFile: "_bmad-output/planning-artifacts/brief.md",
      }),
    ]);
    await closeBead(completedDir, id1, "Done");

    const id2 = await createBead(completedDir, {
      title: "market-research",
      labels: ["workflow", "phase:analysis"],
    });
    await bdExec(completedDir, [
      "update",
      id2,
      "--metadata",
      JSON.stringify({
        agentId: "analyst",
        outputFile: "_bmad-output/planning-artifacts/market.md",
      }),
    ]);
    await closeBead(completedDir, id2, "Done");
  }, 60000);

  afterAll(async () => {
    await rm(completedDir, { recursive: true, force: true });
  });

  it("lists all closed workflow beads as CompletedWorkflow[]", async () => {
    const state = await readState(completedDir);
    expect(state!.completedWorkflows.length).toBe(2);
  });

  it("includes id, agentId, outputFile, completedAt from bead metadata", async () => {
    const state = await readState(completedDir);
    const brief = state!.completedWorkflows.find(
      (w) => w.id === "create-product-brief"
    );
    expect(brief).toBeDefined();
    expect(brief!.agentId).toBe("analyst");
    expect(brief!.outputFile).toBe(
      "_bmad-output/planning-artifacts/brief.md"
    );
    expect(brief!.completedAt).toBeTruthy();
  });
});

// ── writeState — workflow start ─────────────────────────────────────────────

describe("writeState — workflow start", () => {
  let writeDir: string;
  let wfBeadId: string;

  beforeAll(async () => {
    writeDir = await mkdtemp(join(tmpdir(), "beads-write-"));
    execFileSync("git", ["init", "-q"], { cwd: writeDir });
    await mkdir(join(writeDir, "_bmad"), { recursive: true });
    await initBeads(writeDir);

    await createBead(writeDir, {
      title: "Project: WriteTest",
      labels: ["project"],
    });

    wfBeadId = await createBead(writeDir, {
      title: "create-product-brief",
      labels: ["workflow", "phase:analysis"],
    });
  }, 60000);

  afterAll(async () => {
    await rm(writeDir, { recursive: true, force: true });
  });

  it("claims workflow bead when activeWorkflow is set", async () => {
    const state = await readState(writeDir);
    state!.activeWorkflow = {
      id: "create-product-brief",
      agentId: "analyst",
      agentName: "Business Analyst",
      mode: "yolo",
      currentStep: 1,
      totalSteps: 5,
      currentStepFile: "/path/to/step-01.md",
      outputFile: "",
      startedAt: new Date().toISOString(),
    };
    await writeState(writeDir, state!);

    const bead = await getBead(writeDir, wfBeadId);
    expect(bead.status).toBe("in_progress");
  });

  it("stores step metadata on bead", async () => {
    const bead = await getBead(writeDir, wfBeadId);
    expect(bead.metadata?.agentId).toBe("analyst");
    expect(bead.metadata?.currentStep).toBe(1);
    expect(bead.metadata?.mode).toBe("yolo");
  });
});
