/**
 * Tests for beads.ts — thin CLI wrapper around `bd` commands.
 *
 * These are integration tests that run against a real bd/Dolt instance.
 * Each test suite creates a temporary git repo + beads database and
 * tears it down after.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import {
  bdExec,
  isBeadsAvailable,
  initBeads,
  createBead,
  closeBead,
  claimBead,
  addDep,
  getReady,
  getBead,
  listBeads,
} from "../lib/beads.ts";

// ── Helpers ─────────────────────────────────────────────────────────────────

let testDir: string;

beforeAll(async () => {
  testDir = await mkdtemp(join(tmpdir(), "beads-test-"));
  execFileSync("git", ["init", "-q"], { cwd: testDir });
  await initBeads(testDir);
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

// ── bdExec ──────────────────────────────────────────────────────────────────

describe("bdExec", () => {
  it("executes bd command in project directory and returns stdout", async () => {
    const output = await bdExec(testDir, ["version"]);
    expect(output).toContain("bd version");
  });

  it("throws on non-zero exit code with stderr message", async () => {
    await expect(
      bdExec(testDir, ["show", "nonexistent-bead-id-12345"])
    ).rejects.toThrow();
  });

  it("passes all args correctly to bd binary", async () => {
    // --json flag should produce JSON output
    const output = await bdExec(testDir, ["list", "--json", "--limit", "0"]);
    // Should be valid JSON (empty array or array of beads)
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
  });
});

// ── isBeadsAvailable ────────────────────────────────────────────────────────

describe("isBeadsAvailable", () => {
  it("returns true when bd is in PATH", async () => {
    const available = await isBeadsAvailable();
    expect(available).toBe(true);
  });
});

// ── initBeads ───────────────────────────────────────────────────────────────

describe("initBeads", () => {
  it("creates .beads/ directory in project", async () => {
    // Already initialized in beforeAll, just verify
    await expect(access(join(testDir, ".beads"))).resolves.toBeUndefined();
  });

  it("skips if .beads/ already exists", async () => {
    // Should not throw when called again
    await expect(initBeads(testDir)).resolves.toBeUndefined();
  });
});

// ── createBead ──────────────────────────────────────────────────────────────

describe("createBead", () => {
  it("creates bead with title and returns bead ID", async () => {
    const id = await createBead(testDir, { title: "Test bead" });
    expect(id).toMatch(/^beads-test-/); // prefix from dir name
  });

  it("creates bead with labels array", async () => {
    const id = await createBead(testDir, {
      title: "Labeled bead",
      labels: ["workflow", "phase:analysis"],
    });
    const bead = await getBead(testDir, id);
    expect(bead.labels).toContain("workflow");
    expect(bead.labels).toContain("phase:analysis");
  });

  it("creates bead with description", async () => {
    const id = await createBead(testDir, {
      title: "Described bead",
      desc: "This is a test description",
    });
    const bead = await getBead(testDir, id);
    expect(bead.description).toBe("This is a test description");
  });

  it("creates bead with parent ID for nesting", async () => {
    const parentId = await createBead(testDir, { title: "Parent" });
    const childId = await createBead(testDir, {
      title: "Child",
      parent: parentId,
    });
    const child = await getBead(testDir, childId);
    expect(child.parent).toBe(parentId);
  });
});

// ── claimBead ───────────────────────────────────────────────────────────────

describe("claimBead", () => {
  it("atomically claims bead (sets assignee + in_progress)", async () => {
    const id = await createBead(testDir, { title: "Claimable" });
    await claimBead(testDir, id);
    const bead = await getBead(testDir, id);
    expect(bead.status).toBe("in_progress");
    expect(bead.assignee).toBeTruthy();
  });
});

// ── closeBead ───────────────────────────────────────────────────────────────

describe("closeBead", () => {
  it("closes bead by ID", async () => {
    const id = await createBead(testDir, { title: "To close" });
    await closeBead(testDir, id);
    const bead = await getBead(testDir, id);
    expect(bead.status).toBe("closed");
  });

  it("closes bead with reason message", async () => {
    const id = await createBead(testDir, { title: "To close with note" });
    await closeBead(testDir, id, "Completed successfully");
    const bead = await getBead(testDir, id);
    expect(bead.status).toBe("closed");
  });
});

// ── addDep ──────────────────────────────────────────────────────────────────

describe("addDep", () => {
  it("creates blocking dependency between child and parent", async () => {
    const blockerId = await createBead(testDir, { title: "Blocker" });
    const blockedId = await createBead(testDir, { title: "Blocked" });
    await addDep(testDir, blockedId, blockerId);

    // blockedId should NOT be in ready list (it's blocked)
    const ready = await getReady(testDir);
    const readyIds = ready.map((b) => b.id);
    expect(readyIds).not.toContain(blockedId);
  });
});

// ── getReady ────────────────────────────────────────────────────────────────

describe("getReady", () => {
  it("returns beads with zero open blockers", async () => {
    const id = await createBead(testDir, {
      title: "Ready bead",
      labels: ["ready-test"],
    });
    const ready = await getReady(testDir, { label: "ready-test" });
    const readyIds = ready.map((b) => b.id);
    expect(readyIds).toContain(id);
  });

  it("filters by label when provided", async () => {
    const id = await createBead(testDir, {
      title: "Filtered",
      labels: ["unique-filter-test"],
    });
    const ready = await getReady(testDir, { label: "unique-filter-test" });
    expect(ready.length).toBe(1);
    expect(ready[0].id).toBe(id);
  });

  it("parses JSON output into BeadRecord[]", async () => {
    const ready = await getReady(testDir);
    expect(Array.isArray(ready)).toBe(true);
    if (ready.length > 0) {
      expect(ready[0]).toHaveProperty("id");
      expect(ready[0]).toHaveProperty("title");
      expect(ready[0]).toHaveProperty("status");
    }
  });

  it("returns empty array when no ready beads match", async () => {
    const ready = await getReady(testDir, {
      label: "nonexistent-label-xyz",
    });
    expect(ready).toEqual([]);
  });

  it("respects limit parameter", async () => {
    const ready = await getReady(testDir, { limit: 1 });
    expect(ready.length).toBeLessThanOrEqual(1);
  });
});

// ── getBead ─────────────────────────────────────────────────────────────────

describe("getBead", () => {
  it("returns single bead by ID with full metadata", async () => {
    const id = await createBead(testDir, {
      title: "Detailed bead",
      labels: ["detail-test"],
      desc: "Full details",
    });
    const bead = await getBead(testDir, id);
    expect(bead.id).toBe(id);
    expect(bead.title).toBe("Detailed bead");
    expect(bead.description).toBe("Full details");
    expect(bead.labels).toContain("detail-test");
  });

  it("throws for non-existent bead ID", async () => {
    await expect(getBead(testDir, "nonexistent-id-xyz")).rejects.toThrow();
  });
});

// ── listBeads ───────────────────────────────────────────────────────────────

describe("listBeads", () => {
  it("lists all beads", async () => {
    const all = await listBeads(testDir);
    expect(all.length).toBeGreaterThan(0);
  });

  it("filters by label", async () => {
    const unique = `list-filter-${Date.now()}`;
    await createBead(testDir, { title: "List test", labels: [unique] });
    const filtered = await listBeads(testDir, { label: unique });
    expect(filtered.length).toBe(1);
    expect(filtered[0].labels).toContain(unique);
  });

  it("filters by status", async () => {
    const id = await createBead(testDir, { title: "Status filter test" });
    await closeBead(testDir, id);
    const closed = await listBeads(testDir, { status: "closed" });
    const closedIds = closed.map((b) => b.id);
    expect(closedIds).toContain(id);
  });
});
