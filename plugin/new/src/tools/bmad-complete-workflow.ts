/**
 * bmad_complete_workflow — Mark the active workflow as complete.
 * Updates state, advances phase if appropriate, suggests next workflows.
 */

import { Type } from "@sinclair/typebox";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readState, writeState } from "../lib/state.ts";
import { getAvailableWorkflows, getWorkflow } from "../lib/workflow-registry.ts";
import { generateTeamFile } from "../lib/team-resolver.ts";
import type { ToolResult } from "../types.ts";

export const name = "bmad_complete_workflow";
export const description =
  "Mark the active BMad workflow as complete. Updates project state and suggests next workflows.";

export const parameters = Type.Object({
  projectPath: Type.String({
    description: "Absolute path to the project root directory",
  }),
});

/** Workflows that produce architecture/requirements artifacts worth regenerating AGENTS.md for */
const TEAM_TRIGGER_WORKFLOWS = [
  "create-architecture",
  "create-prd",
  "correct-course",
  "technical-research",
  "document-project",
];

export async function execute(
  _id: string,
  params: { projectPath: string },
  context: { bmadMethodPath: string }
): Promise<ToolResult> {
  const state = await readState(params.projectPath);
  if (!state) {
    return text("Error: Project not initialized.");
  }
  if (!state.activeWorkflow) {
    return text("Error: No active workflow to complete.");
  }

  const active = state.activeWorkflow;
  const workflowDef = getWorkflow(active.id);

  // Guard: ensure all steps have been completed before allowing workflow completion
  if (active.totalSteps && active.currentStep < active.totalSteps) {
    return text(
      `Error: Cannot complete workflow "${active.id}" — currently on step ${active.currentStep} of ${active.totalSteps}. ` +
        `Complete all steps before calling \`bmad_complete_workflow\`. ` +
        `Use \`bmad_load_step\` to advance to the next step.`
    );
  }

  // Move to completed
  state.completedWorkflows.push({
    id: active.id,
    agentId: active.agentId,
    outputFile: active.outputFile,
    completedAt: new Date().toISOString(),
  });

  // Clear active
  state.activeWorkflow = null;

  // Phase is now derived automatically by readState() from the beads
  // dependency graph — no manual index comparison needed.

  await writeState(params.projectPath, state);

  // Auto-regenerate AGENTS.md after architecture/PRD workflows
  let teamUpdated = false;
  if (TEAM_TRIGGER_WORKFLOWS.includes(active.id)) {
    try {
      const { content } = await generateTeamFile(
        params.projectPath,
        context.bmadMethodPath,
        state.projectName
      );
      await writeFile(join(params.projectPath, "AGENTS.md"), content, "utf-8");
      teamUpdated = true;
    } catch {
      // Non-critical
    }
  }

  // Suggest next workflows
  const completedIds = state.completedWorkflows.map((w) => w.id);
  const available = getAvailableWorkflows(completedIds).filter(
    (w) => !completedIds.includes(w.id)
  );

  const lines = [
    `✅ Workflow "${active.id}" completed!`,
    "",
    `**Agent:** ${active.agentName} (${active.agentId})`,
    `**Output:** ${active.outputFile || "none"}`,
    `**Duration:** started ${active.startedAt}`,
    teamUpdated ? `**AGENTS.md:** updated with latest tech stack analysis` : "",
    "",
  ];

  if (available.length > 0) {
    lines.push("## Recommended Next Steps");
    lines.push("");
    for (const w of available) {
      lines.push(`- **${w.id}** — ${w.description}`);
    }
    lines.push("");
    lines.push(
      "Use `bmad_start_workflow` to begin the next workflow."
    );
  } else {
    lines.push(
      "🎉 All available workflows are complete! The project is ready for the next phase."
    );
  }

  return text(lines.join("\n"));
}

function text(t: string): ToolResult {
  return { content: [{ type: "text", text: t }] };
}
