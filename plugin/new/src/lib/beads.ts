/**
 * Beads CLI wrapper — thin async interface to `bd` commands.
 *
 * All beads interaction in the BMAD plugin goes through this module.
 * Uses node:child_process to shell out to the `bd` binary.
 * No external npm dependencies.
 */

import { execFile as execFileCb } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

// ── Types ───────────────────────────────────────────────────────────────────

export interface BeadRecord {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: number;
  issue_type: string;
  assignee?: string;
  owner?: string;
  labels?: string[];
  parent_id?: string;
  parent?: string;
  metadata?: Record<string, unknown>;
  dependencies?: { id: string; title: string; status: string; dependency_type: string }[];
  dependents?: { id: string; title: string; status: string; dependency_type: string }[];
  created_at: string;
  updated_at: string;
  closed_at?: string;
  comment_count: number;
  [key: string]: unknown;
}

// ── Core execution ──────────────────────────────────────────────────────────

/**
 * Execute a `bd` CLI command in the given project directory.
 * Returns stdout on success, throws on non-zero exit.
 */
export async function bdExec(
  projectPath: string,
  args: string[]
): Promise<string> {
  const { stdout } = await execFile("bd", args, {
    cwd: projectPath,
    env: { ...process.env },
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim();
}

// ── Availability ────────────────────────────────────────────────────────────

/**
 * Check if `bd` CLI is available in PATH.
 */
export async function isBeadsAvailable(): Promise<boolean> {
  try {
    await execFile("bd", ["version"]);
    return true;
  } catch {
    return false;
  }
}

// ── Init ────────────────────────────────────────────────────────────────────

/**
 * Initialize beads in a project directory.
 * Skips if .beads/ already exists.
 */
export async function initBeads(projectPath: string): Promise<void> {
  try {
    await access(join(projectPath, ".beads"));
    return; // Already initialized
  } catch {
    // Not initialized, proceed
  }

  await bdExec(projectPath, [
    "init",
    "--skip-agents",
    "--skip-hooks",
    "--quiet",
  ]);
}

// ── Create ──────────────────────────────────────────────────────────────────

/**
 * Create a new bead. Returns the bead ID.
 */
export async function createBead(
  projectPath: string,
  opts: {
    title: string;
    parent?: string;
    labels?: string[];
    desc?: string;
  }
): Promise<string> {
  const args = ["create", opts.title, "--silent"];

  if (opts.parent) {
    args.push("--parent", opts.parent);
  }
  if (opts.labels && opts.labels.length > 0) {
    args.push("--labels", opts.labels.join(","));
  }
  if (opts.desc) {
    args.push("--description", opts.desc);
  }

  const id = await bdExec(projectPath, args);
  return id.trim();
}

// ── Close ───────────────────────────────────────────────────────────────────

/**
 * Close a bead by ID, optionally with a reason.
 */
export async function closeBead(
  projectPath: string,
  id: string,
  reason?: string
): Promise<void> {
  const args = ["close", id];
  if (reason) {
    args.push("--reason", reason);
  }
  await bdExec(projectPath, args);
}

// ── Claim ───────────────────────────────────────────────────────────────────

/**
 * Atomically claim a bead (sets assignee + status to in_progress).
 */
export async function claimBead(
  projectPath: string,
  id: string
): Promise<void> {
  await bdExec(projectPath, ["update", id, "--claim"]);
}

// ── Dependencies ────────────────────────────────────────────────────────────

/**
 * Add a blocking dependency: `child` depends on (is blocked by) `blocker`.
 */
export async function addDep(
  projectPath: string,
  child: string,
  blocker: string
): Promise<void> {
  await bdExec(projectPath, ["dep", "add", child, blocker]);
}

// ── Query: ready ────────────────────────────────────────────────────────────

/**
 * Get beads that are ready to work on (no open blockers).
 */
export async function getReady(
  projectPath: string,
  opts?: {
    label?: string;
    limit?: number;
  }
): Promise<BeadRecord[]> {
  const args = ["ready", "--json"];
  if (opts?.label) {
    args.push("--label", opts.label);
  }
  if (opts?.limit != null) {
    args.push("--limit", String(opts.limit));
  }

  try {
    const output = await bdExec(projectPath, args);
    if (!output) return [];
    return JSON.parse(output) as BeadRecord[];
  } catch {
    return [];
  }
}

// ── Query: show ─────────────────────────────────────────────────────────────

/**
 * Get a single bead by ID with full metadata.
 */
export async function getBead(
  projectPath: string,
  id: string
): Promise<BeadRecord> {
  const output = await bdExec(projectPath, ["show", id, "--json", "--long"]);
  const parsed = JSON.parse(output);
  // bd show returns an array with one element
  const bead = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!bead) throw new Error(`Bead not found: ${id}`);
  return bead as BeadRecord;
}

// ── Query: list ─────────────────────────────────────────────────────────────

/**
 * List beads with optional filters.
 */
export async function listBeads(
  projectPath: string,
  opts?: {
    label?: string;
    status?: string;
  }
): Promise<BeadRecord[]> {
  const args = ["list", "--json", "--limit", "0", "--all"];
  if (opts?.label) {
    args.push("--label", opts.label);
  }
  if (opts?.status) {
    args.push("--status", opts.status);
  }

  try {
    const output = await bdExec(projectPath, args);
    if (!output) return [];
    return JSON.parse(output) as BeadRecord[];
  } catch {
    return [];
  }
}
