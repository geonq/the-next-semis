import type { ReactNode } from "react";

export function renderMarkdown(markdown: string): ReactNode[] {
  return markdown
    .split(/\n{2,}/)
    .map((block, index) => renderBlock(block.trim(), index))
    .filter(Boolean);
}

function renderBlock(block: string, index: number): ReactNode {
  if (block.startsWith("# ")) return <h1 key={index}>{inline(block.slice(2))}</h1>;
  if (block.startsWith("## ")) return <h2 key={index}>{inline(block.slice(3))}</h2>;

  if (/^\d+\.\s/.test(block)) {
    return (
      <ol key={index}>
        {block.split("\n").map((line) => (
          <li key={line}>{inline(line.replace(/^\d+\.\s/, ""))}</li>
        ))}
      </ol>
    );
  }

  return <p key={index}>{inline(block.replace(/\n/g, " "))}</p>;
}

function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    const key = `${match.index}-${token}`;

    if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }

    cursor = match.index + token.length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}
