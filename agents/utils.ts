import type { Episode } from "../src/lib/sdk";

export function ts(): string {
  return new Date().toTimeString().slice(0, 8);
}

export function makeLogger(agentName: string): (msg: string) => void {
  return (msg: string) => console.log(`[${agentName} ${ts()}] ${msg}`);
}

export function parseJsonFromClaude(text: string): any {
  const cleaned = text
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
  return JSON.parse(cleaned);
}

export function formatEpisodesForPrompt(episodes: Episode[]): string {
  if (episodes.length === 0) return "";
  const lines = episodes.map((ep, i) => {
    const when = new Date(ep.created_at).toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
    });
    return `Episode ${i + 1} [${when}] — ${ep.outcome.toUpperCase()}\n  ${ep.task_summary}`;
  });
  return ["\n\n---", "PAST EXPERIENCE (use to improve this response):", ...lines, "---"].join("\n");
}
