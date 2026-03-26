/**
 * Beads-backed state module — drop-in replacement for the JSON-backed state.ts.
 *
 * Exports the same interface (readState, writeState, createInitialState, bmadDir)
 * so all MCP tool files continue to work unchanged.
 *
 * Instead of reading/writing _bmad/state.json, this module queries and updates
 * beads via the `bd` CLI.
 */

import { access } from "node:fs/promises";
import { join } from "node:path";

import {
  bdExec,
  claimBead,
  closeBead,
  getBead,
  getReady,
  listBeads,
} from "./beads.ts";

import type { BeadRecord } from "./beads.ts";
import type {
  BmadState,
  BmadPhase,
  ActiveWorkflow,
  CompletedWorkflow,
} from "../../types.ts";

// ── Phase order (used for derivation) ───────────────────────────────────────

const PHASE_ORDER: BmadPhase[] = [
  "analysis",
  "planning",
  "solutioning",
  "implementation",
];

// ── bmadDir ─────────────────────────────────────────────────────────────────

export function bmadDir(projectPath: string): string {
  return join(projectPath, "_bmad");
}

// ── createInitialState ──────────────────────────────────────────────────────

export function createInitialState(
  projectPath: string,
  projectName: string
): BmadState {
  return {
    projectName,
    projectPath,
    createdAt: new Date().toISOString(),
    currentPhase: "analysis",
    activeWorkflow: null,
    completedWorkflows: [],
  };
}

// ── readState ───────────────────────────────────────────────────────────────

/**
 * Reconstruct BmadState from beads database.
 *
 * - projectName: extracted from the project bead title ("Project: <name>")
 * - currentPhase: derived from the highest phase with in_progress or all-closed workflows
 * - activeWorkflow: the workflow bead with status "in_progress" (if any)
 * - completedWorkflows: all workflow beads with status "closed"
 */
export async function readState(
  projectPath: string
): Promise<BmadState | null> {
  // Check if beads is initialized
  try {
    await access(join(projectPath, ".beads"));
  } catch {
    return null;
  }

  // Get project bead
  const projectBeads = await listBeads(projectPath, { label: "project" });
  if (projectBeads.length === 0) return null;

  const projectBead = projectBeads[0];
  const projectName =
    projectBead.title.replace(/^Project:\s*/, "") || "Unknown";

  // Get all workflow beads
  const allWorkflows = await listBeads(projectPath, { label: "workflow" });

  // Find active workflow (in_progress)
  const activeBeads = allWorkflows.filter((b) => b.status === "in_progress");
  let activeWorkflow: ActiveWorkflow | null = null;

  if (activeBeads.length > 0) {
    const activeBead = activeBeads[0];
    const meta = activeBead.metadata ?? {};
    activeWorkflow = {
      id: activeBead.title,
      agentId: (meta.agentId as string) ?? "",
      agentName: (meta.agentName as string) ?? "",
      mode: (meta.mode as "normal" | "yolo") ?? "normal",
      currentStep: (meta.currentStep as number) ?? 1,
      totalSteps: (meta.totalSteps as number) ?? null,
      currentStepFile: (meta.currentStepFile as string) ?? "",
      outputFile: (meta.outputFile as string) ?? "",
      startedAt: (meta.startedAt as string) ?? activeBead.updated_at,
    };
    if (meta.lastSavedStep != null) {
      activeWorkflow.lastSavedStep = meta.lastSavedStep as number;
    }
  }

  // Find completed workflows (closed)
  const closedBeads = allWorkflows
    .filter((b) => b.status === "closed")
    .sort(
      (a, b) =>
        new Date(a.closed_at ?? a.updated_at).getTime() -
        new Date(b.closed_at ?? b.updated_at).getTime()
    );

  const completedWorkflows: CompletedWorkflow[] = closedBeads.map((b) => {
    const meta = b.metadata ?? {};
    return {
      id: b.title,
      agentId: (meta.agentId as string) ?? "",
      outputFile: (meta.outputFile as string) ?? "",
      completedAt: b.closed_at ?? b.updated_at,
    };
  });

  // Derive current phase from highest phase with active/completed workflows
  let currentPhase: BmadPhase = "analysis";

  // Check in_progress workflows
  if (activeWorkflow) {
    const activePhaseLabel = activeBeads[0].labels?.find((l) =>
      l.startsWith("phase:")
    );
    if (activePhaseLabel) {
      const phase = activePhaseLabel.replace("phase:", "") as BmadPhase;
      if (PHASE_ORDER.indexOf(phase) > PHASE_ORDER.indexOf(currentPhase)) {
        currentPhase = phase;
      }
    }
  }

  // Check completed workflows (highest closed phase)
  for (const bead of closedBeads) {
    const phaseLabel = bead.labels?.find((l) => l.startsWith("phase:"));
    if (phaseLabel) {
      const phase = phaseLabel.replace("phase:", "") as BmadPhase;
      if (PHASE_ORDER.indexOf(phase) > PHASE_ORDER.indexOf(currentPhase)) {
        currentPhase = phase;
      }
    }
  }

  // Also check if any workflows from a higher phase are now ready (unblocked)
  // This handles the case where closing a solutioning workflow unblocks implementation
  const readyWorkflows = await getReady(projectPath, { label: "workflow" });
  for (const bead of readyWorkflows) {
    const phaseLabel = bead.labels?.find((l) => l.startsWith("phase:"));
    if (phaseLabel) {
      const phase = phaseLabel.replace("phase:", "") as BmadPhase;
      // Only advance phase if the prerequisite phase has completed work
      if (
        PHASE_ORDER.indexOf(phase) > PHASE_ORDER.indexOf(currentPhase) &&
        closedBeads.length > 0
      ) {
        currentPhase = phase;
      }
    }
  }

  return {
    projectName,
    projectPath,
    createdAt: projectBead.created_at,
    currentPhase,
    activeWorkflow,
    completedWorkflows,
  };
}

// ── writeState ──────────────────────────────────────────────────────────────

/**
 * Sync state changes back to beads.
 *
 * Detects what changed between the current beads state and the provided state,
 * then applies the minimal set of beads operations.
 */
export async function writeState(
  projectPath: string,
  state: BmadState
): Promise<void> {
  // Get current beads state
  const allWorkflows = await listBeads(projectPath, { label: "workflow" });

  if (state.activeWorkflow) {
    // Find the bead for this workflow
    const workflowBead = allWorkflows.find(
      (b) => b.title === state.activeWorkflow!.id
    );
    if (workflowBead) {
      // Claim if not already in_progress
      if (workflowBead.status !== "in_progress") {
        await claimBead(projectPath, workflowBead.id);
      }

      // Update metadata
      const meta: Record<string, unknown> = {
        agentId: state.activeWorkflow.agentId,
        agentName: state.activeWorkflow.agentName,
        mode: state.activeWorkflow.mode,
        currentStep: state.activeWorkflow.currentStep,
        totalSteps: state.activeWorkflow.totalSteps,
        currentStepFile: state.activeWorkflow.currentStepFile,
        outputFile: state.activeWorkflow.outputFile,
        startedAt: state.activeWorkflow.startedAt,
      };
      if (state.activeWorkflow.lastSavedStep != null) {
        meta.lastSavedStep = state.activeWorkflow.lastSavedStep;
      }

      await bdExec(projectPath, [
        "update",
        workflowBead.id,
        "--metadata",
        JSON.stringify(meta),
      ]);
    }
  }

  // Check for newly completed workflows: if a workflow that was in_progress
  // is now in completedWorkflows but not in activeWorkflow, close it
  const inProgressBeads = allWorkflows.filter(
    (b) => b.status === "in_progress"
  );
  for (const bead of inProgressBeads) {
    const isStillActive = state.activeWorkflow?.id === bead.title;
    const isNowCompleted = state.completedWorkflows.some(
      (w) => w.id === bead.title
    );
    if (!isStillActive && isNowCompleted) {
      const completed = state.completedWorkflows.find(
        (w) => w.id === bead.title
      );
      if (completed) {
        // Store completion metadata before closing
        await bdExec(projectPath, [
          "update",
          bead.id,
          "--metadata",
          JSON.stringify({
            agentId: completed.agentId,
            outputFile: completed.outputFile,
          }),
        ]);
      }
      await closeBead(
        projectPath,
        bead.id,
        `Completed: ${bead.title}`
      );
    }
  }
}
