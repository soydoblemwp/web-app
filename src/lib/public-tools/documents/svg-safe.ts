/**
 * Hand-built SVG string builder for the two Fase 47 tools that need an SVG
 * download (business card, labels). Output is ONLY ever offered as a file
 * download — never rendered in-page via `dangerouslySetInnerHTML` — so this
 * module's one real security job is producing well-formed XML with every
 * piece of visitor text escaped (spec section 9: "no utilices contenido del
 * visitante con dangerouslySetInnerHTML"; section 33: "sin scripts, sin
 * eventos, sin URLs remotas").
 */
export function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export interface SvgTextNode {
  kind: "text";
  x: number;
  y: number;
  text: string;
  size: number;
  bold?: boolean;
  color?: string;
  anchor?: "start" | "middle" | "end";
}

export interface SvgRectNode {
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  rx?: number;
}

export interface SvgLineNode {
  kind: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth?: number;
}

export interface SvgCircleNode {
  kind: "circle";
  cx: number;
  cy: number;
  r: number;
  fill?: string;
}

/** A pre-rendered, already-trusted inner fragment (e.g. jsbarcode/qrcode's own SVG output) — never raw visitor text. */
export interface SvgRawTrustedNode {
  kind: "raw-trusted";
  markup: string;
  x?: number;
  y?: number;
}

export type SvgNode = SvgTextNode | SvgRectNode | SvgLineNode | SvgCircleNode | SvgRawTrustedNode;

function renderNode(node: SvgNode): string {
  switch (node.kind) {
    case "text": {
      const weight = node.bold ? ' font-weight="bold"' : "";
      const anchor = node.anchor ? ` text-anchor="${node.anchor}"` : "";
      const fill = node.color ?? "#111111";
      return `<text x="${node.x}" y="${node.y}" font-size="${node.size}" font-family="Helvetica, Arial, sans-serif" fill="${fill}"${weight}${anchor}>${escapeXml(node.text)}</text>`;
    }
    case "rect": {
      const fill = node.fill ? ` fill="${node.fill}"` : ' fill="none"';
      const stroke = node.stroke ? ` stroke="${node.stroke}" stroke-width="${node.strokeWidth ?? 1}"` : "";
      const rx = node.rx ? ` rx="${node.rx}"` : "";
      return `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}"${fill}${stroke}${rx} />`;
    }
    case "line":
      return `<line x1="${node.x1}" y1="${node.y1}" x2="${node.x2}" y2="${node.y2}" stroke="${node.stroke}" stroke-width="${node.strokeWidth ?? 1}" />`;
    case "circle":
      return `<circle cx="${node.cx}" cy="${node.cy}" r="${node.r}" fill="${node.fill ?? "none"}" />`;
    case "raw-trusted": {
      const transform = node.x !== undefined || node.y !== undefined ? ` transform="translate(${node.x ?? 0}, ${node.y ?? 0})"` : "";
      return `<g${transform}>${node.markup}</g>`;
    }
  }
}

export function buildSvgDocument(widthPt: number, heightPt: number, nodes: SvgNode[]): string {
  const body = nodes.map(renderNode).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPt}" height="${heightPt}" viewBox="0 0 ${widthPt} ${heightPt}">${body}</svg>`;
}
