/**
 * bmad_generate_team — Generate or update AGENTS.md with recommended
 * subagents and skills based on the project's tech stack.
 */

import { Type } from "@sinclair/typebox";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readState } from "../lib/state.ts";
import { generateTeamFile } from "../lib/team-resolver.ts";
import type { ToolResult } from "../types.ts";

export const name = "bmad_generate_team";
export const description =
  "Generate or update AGENTS.md with recommended subagents and skills for the project's tech stack. Analyzes architecture docs and filesystem to detect technologies.";

export const parameters = Type.Object({
  projectPath: Type.String({
    description: "Absolute path to the project root directory",
  }),
  force: Type.Optional(
    Type.Boolean({
      description: "Regenerate even if AGENTS.md already exists",
    })
  ),
});

export async function execute(
  _id: string,
  params: { projectPath: string; force?: boolean },
  context: { bmadMethodPath: string }
): Promise<ToolResult> {
  const { projectPath } = params;

  // Get project name from state if available
  const state = await readState(projectPath);
  const projectName = state?.projectName;

  const { content, recommendation } = await generateTeamFile(
    projectPath,
    context.bmadMethodPath,
    projectName ?? undefined
  );

  // Write AGENTS.md to project root
  const agentsPath = join(projectPath, "AGENTS.md");
  await writeFile(agentsPath, content, "utf-8");

  // Build summary
  const { techStack, subagents, skills } = recommendation;
  const techCount = techStack.keywords.length;
  const subagentCount =
    subagents.implementation.length +
    subagents.quality.length +
    subagents.architecture.length;

  const layers = Object.entries(techStack.layers)
    .map(([layer, techs]) => `  - **${layer}:** ${techs.join(", ")}`)
    .join("\n");

  const summary = [
    `AGENTS.md generated at \`${agentsPath}\``,
    "",
    `**Detected ${techCount} technologies:**`,
    layers,
    "",
    `**Recommended ${subagentCount} subagents:**`,
    `  - Implementation: ${subagents.implementation.map((a) => a.name).join(", ") || "none"}`,
    `  - Quality: ${subagents.quality.map((a) => a.name).join(", ") || "none"}`,
    `  - Architecture: ${subagents.architecture.map((a) => a.name).join(", ") || "none"}`,
    "",
    `**${skills.length} skills available:**`,
    `  - ${skills.map((s) => s.name).join(", ") || "none"}`,
  ];

  return text(summary.join("\n"));
}

function text(t: string): ToolResult {
  return { content: [{ type: "text", text: t }] };
}
