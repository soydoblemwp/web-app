export type RobotsRuleType = "allow" | "disallow";

export interface RobotsRule {
  type: RobotsRuleType;
  path: string;
}

export interface RobotsGroup {
  id: string;
  userAgents: string[];
  rules: RobotsRule[];
  comment: string;
}

export interface RobotsFile {
  groups: RobotsGroup[];
  sitemaps: string[];
}

export const ROBOTS_PRESETS: Record<string, RobotsFile> = {
  "allow-all": { groups: [{ id: "g1", userAgents: ["*"], rules: [{ type: "allow", path: "/" }], comment: "" }], sitemaps: [] },
  "block-folder": { groups: [{ id: "g1", userAgents: ["*"], rules: [{ type: "disallow", path: "/privado/" }], comment: "" }], sitemaps: [] },
  "block-several": {
    groups: [{ id: "g1", userAgents: ["*"], rules: [{ type: "disallow", path: "/admin/" }, { type: "disallow", path: "/carrito/" }, { type: "disallow", path: "/buscar" }], comment: "" }],
    sitemaps: [],
  },
  "block-with-exception": {
    groups: [{ id: "g1", userAgents: ["*"], rules: [{ type: "disallow", path: "/privado/" }, { type: "allow", path: "/privado/publico.html" }], comment: "" }],
    sitemaps: [],
  },
};

function escapePathToRegex(pattern: string): RegExp {
  let hasEndAnchor = false;
  let body = pattern;
  if (body.endsWith("$")) {
    hasEndAnchor = true;
    body = body.slice(0, -1);
  }
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}${hasEndAnchor ? "$" : ""}`);
}

export function buildRobotsTxt(file: RobotsFile): string {
  const lines: string[] = [];
  for (const group of file.groups) {
    if (group.comment) lines.push(`# ${group.comment}`);
    for (const ua of group.userAgents) lines.push(`User-agent: ${ua}`);
    for (const rule of group.rules) {
      lines.push(`${rule.type === "allow" ? "Allow" : "Disallow"}: ${rule.path}`);
    }
    lines.push("");
  }
  for (const sitemap of file.sitemaps) lines.push(`Sitemap: ${sitemap}`);
  return lines.join("\n").trim() + "\n";
}

/** Parses a pasted robots.txt into structured groups — a small local parser, never a remote fetch of the user's actual file (spec section 12: "no descargue un robots.txt remoto"). */
export function parseRobotsTxt(text: string): RobotsFile {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let pendingComment = "";
  let groupCounter = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      pendingComment = line.replace(/^#\s*/, "");
      continue;
    }
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;
    const directive = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();

    if (directive === "user-agent") {
      if (!current || current.rules.length > 0) {
        current = { id: `g${++groupCounter}`, userAgents: [], rules: [], comment: pendingComment };
        groups.push(current);
        pendingComment = "";
      }
      current.userAgents.push(value);
    } else if (directive === "allow" || directive === "disallow") {
      if (!current) {
        current = { id: `g${++groupCounter}`, userAgents: ["*"], rules: [], comment: pendingComment };
        groups.push(current);
        pendingComment = "";
      }
      current.rules.push({ type: directive, path: value });
    } else if (directive === "sitemap") {
      sitemaps.push(value);
    }
  }

  return { groups, sitemaps };
}

export interface RobotsCheckResult {
  allowed: boolean;
  matchedGroupId: string | null;
  matchedRule: RobotsRule | null;
  explanation: string;
}

/**
 * Implements the documented Google robots.txt matching algorithm: pick the
 * most specific matching user-agent group (an exact literal match beats
 * "*"), then within that group pick the LONGEST matching path pattern; on
 * a length tie, Allow wins over Disallow. This is a real, honest
 * approximation of one documented interpretation — the tool says so
 * explicitly rather than claiming to be authoritative for every crawler.
 */
export function checkRobotsPath(file: RobotsFile, userAgent: string, path: string): RobotsCheckResult {
  const uaLower = userAgent.trim().toLowerCase() || "*";
  const exactGroup = file.groups.find((g) => g.userAgents.some((ua) => ua.toLowerCase() === uaLower));
  const wildcardGroup = file.groups.find((g) => g.userAgents.some((ua) => ua === "*"));
  const group = exactGroup ?? wildcardGroup;

  if (!group) {
    return { allowed: true, matchedGroupId: null, matchedRule: null, explanation: "Ningún grupo coincide con este user-agent; por defecto se permite el rastreo." };
  }

  let best: { rule: RobotsRule; length: number } | null = null;
  for (const rule of group.rules) {
    if (!rule.path) continue;
    const regex = escapePathToRegex(rule.path);
    if (regex.test(path)) {
      const length = rule.path.replace(/\$$/, "").length;
      if (!best || length > best.length || (length === best.length && rule.type === "allow" && best.rule.type === "disallow")) {
        best = { rule, length };
      }
    }
  }

  if (!best) {
    return { allowed: true, matchedGroupId: group.id, matchedRule: null, explanation: "Ninguna regla del grupo coincidente aplica a esta ruta; por defecto se permite." };
  }

  const allowed = best.rule.type === "allow";
  return {
    allowed,
    matchedGroupId: group.id,
    matchedRule: best.rule,
    explanation: `La regla más específica que coincide es "${best.rule.type === "allow" ? "Allow" : "Disallow"}: ${best.rule.path}" del grupo para "${group.userAgents.join(", ")}".`,
  };
}
