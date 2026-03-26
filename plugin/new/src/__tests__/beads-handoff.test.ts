/**
 * Tests for inter-agent handoff beads.
 *
 * Verifies that agents can create handoff tasks tagged for specific subagents,
 * claim them, close them, and that the generate-team skill integrates them
 * into AGENTS.md.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import {
  initBeads,
  createBead,
  claimBead,
  closeBead,
  getReady,
  getBead,
  listBeads,
} from "../lib/beads.ts";
import type { BeadRecord } from "../lib/beads.ts";

let testDir: string;

beforeAll(async () => {
  testDir = await mkdtemp(join(tmpdir(), "beads-handoff-"));
  execFileSync("git", ["init", "-q"], { cwd: testDir });
  await initBeads(testDir);
}, 30000);

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

// ── Agent creates handoff ───────────────────────────────────────────────────

describe("agent creates handoff", () => {
  let handoffId: string;

  beforeAll(async () => {
    handoffId = await createBead(testDir, {
      title: "Review auth middleware for IDOR",
      labels: ["handoff", "agent:security-engineer"],
      desc: "Code review found potential IDOR in /api/users/:id endpoint. Needs security specialist review.",
    });
  });

  it("creates bead with agent:<name> label", async () => {
    const bead = await getBead(testDir, handoffId);
    expect(bead.labels).toContain("agent:security-engineer");
    expect(bead.labels).toContain("handoff");
  });

  it("handoff bead is independent of workflow graph (no parent)", async () => {
    const bead = await getBead(testDir, handoffId);
    expect(bead.parent).toBeFalsy();
  });

  it("bd ready --label agent:security-engineer returns the handoff", async () => {
    const ready = await getReady(testDir, {
      label: "agent:security-engineer",
    });
    const readyIds = ready.map((b) => b.id);
    expect(readyIds).toContain(handoffId);
  });

  it("bd ready --label agent:python-pro does NOT return a security-engineer handoff", async () => {
    const ready = await getReady(testDir, { label: "agent:python-pro" });
    const readyIds = ready.map((b) => b.id);
    expect(readyIds).not.toContain(handoffId);
  });
});

// ── Agent claims and completes handoff ──────────────────────────────────────

describe("agent claims and completes handoff", () => {
  let claimableId: string;

  beforeAll(async () => {
    claimableId = await createBead(testDir, {
      title: "Optimize DB queries",
      labels: ["handoff", "agent:performance-engineer"],
      desc: "N+1 query detected in user list endpoint",
    });
  });

  it("claim sets status to in_progress", async () => {
    await claimBead(testDir, claimableId);
    const bead = await getBead(testDir, claimableId);
    expect(bead.status).toBe("in_progress");
  });

  it("close with reason marks handoff done", async () => {
    await closeBead(testDir, claimableId, "Fixed N+1 with eager loading");
    const bead = await getBead(testDir, claimableId);
    expect(bead.status).toBe("closed");
  });

  it("closed handoff no longer appears in bd ready", async () => {
    const ready = await getReady(testDir, {
      label: "agent:performance-engineer",
    });
    const readyIds = ready.map((b) => b.id);
    expect(readyIds).not.toContain(claimableId);
  });
});

// ── Pending handoffs query ──────────────────────────────────────────────────

describe("pending handoffs for AGENTS.md", () => {
  beforeAll(async () => {
    // Create a few handoffs for different agents
    await createBead(testDir, {
      title: "Add rate limiting",
      labels: ["handoff", "agent:backend-developer"],
    });
    await createBead(testDir, {
      title: "Fix accessibility issues",
      labels: ["handoff", "agent:accessibility-tester"],
    });
  });

  it("can query all pending handoffs", async () => {
    const handoffs = await getReady(testDir, { label: "handoff" });
    // Should include the security-engineer one from earlier + the two new ones
    expect(handoffs.length).toBeGreaterThanOrEqual(2);
  });

  it("handoff records include bead ID, title, and labels", async () => {
    const handoffs = await getReady(testDir, { label: "handoff" });
    for (const h of handoffs) {
      expect(h.id).toBeTruthy();
      expect(h.title).toBeTruthy();
      expect(h.labels).toContain("handoff");
      // At least one agent label
      const agentLabels = h.labels?.filter((l: string) =>
        l.startsWith("agent:")
      );
      expect(agentLabels?.length).toBeGreaterThan(0);
    }
  });

  it("can extract agent name from labels", async () => {
    const handoffs = await getReady(testDir, { label: "handoff" });
    const agentNames = handoffs.flatMap(
      (h) =>
        h.labels
          ?.filter((l: string) => l.startsWith("agent:"))
          .map((l: string) => l.replace("agent:", "")) ?? []
    );
    expect(agentNames).toContain("backend-developer");
    expect(agentNames).toContain("accessibility-tester");
  });
});
