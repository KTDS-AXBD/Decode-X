interface MarkdownPreviewProps {
  content: string;
}

function parseInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(
      /`(.+?)`/g,
      '<code class="bg-gray-100 dark:bg-gray-800 px-1 rounded text-sm">$1</code>',
    );
}

interface Block {
  type: "heading" | "table" | "list" | "paragraph";
  level?: number | undefined;
  rows?: string[][] | undefined;
  items?: string[] | undefined;
  text?: string | undefined;
}

function parseBlocks(content: string): Block[] {
  const lines = content.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Heading
    const headingMatch = /^(#{1,3})\s+(.+)/.exec(line);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1]!.length,
        text: headingMatch[2],
      });
      i++;
      continue;
    }

    // Table: detect | at start, then separator line |---|
    if (line.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length) {
        const tl = lines[i]!;
        if (!tl.trim().startsWith("|")) break;
        // Skip separator lines like |---|---|
        if (/^\|[\s\-:|]+\|$/.test(tl.trim())) {
          i++;
          continue;
        }
        const cells = tl
          .split("|")
          .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
          .map((c) => c.trim());
        if (cells.length > 0) rows.push(cells);
        i++;
      }
      if (rows.length > 0) {
        blocks.push({ type: "table", rows });
      }
      continue;
    }

    // List item
    if (/^[-*]\s/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length) {
        const ll = lines[i]!;
        if (!/^[-*]\s/.test(ll.trim()) && ll.trim() !== "") break;
        if (ll.trim() === "") {
          i++;
          continue;
        }
        items.push(ll.trim().replace(/^[-*]\s/, ""));
        i++;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    // Paragraph
    blocks.push({ type: "paragraph", text: line });
    i++;
  }

  return blocks;
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  if (!content.trim()) {
    return (
      <div className="text-center text-gray-400 py-12">No content</div>
    );
  }

  const blocks = parseBlocks(content);

  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {blocks.map((block, idx) => {
        if (block.type === "heading") {
          const Tag = `h${block.level}` as "h1" | "h2" | "h3";
          const sizes: Record<number, string> = {
            1: "text-xl font-bold border-b border-gray-200 dark:border-gray-700 pb-2 mb-2",
            2: "text-lg font-semibold mt-4 mb-1",
            3: "text-base font-semibold mt-3 mb-1",
          };
          return (
            <Tag
              key={idx}
              className={sizes[block.level ?? 1] ?? "font-semibold"}
              dangerouslySetInnerHTML={{
                __html: parseInline(block.text ?? ""),
              }}
            />
          );
        }

        if (block.type === "table" && block.rows) {
          const [header, ...body] = block.rows;
          return (
            <div key={idx} className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-200 dark:border-gray-700 text-xs">
                {header && (
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800">
                      {header.map((cell, ci) => (
                        <th
                          key={ci}
                          className="border border-gray-200 dark:border-gray-700 px-2 py-1.5 text-left font-semibold"
                          dangerouslySetInnerHTML={{
                            __html: parseInline(cell),
                          }}
                        />
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {body.map((row, ri) => (
                    <tr
                      key={ri}
                      className="even:bg-gray-50 dark:even:bg-gray-800/50"
                    >
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          className="border border-gray-200 dark:border-gray-700 px-2 py-1"
                          dangerouslySetInnerHTML={{
                            __html: parseInline(cell),
                          }}
                        />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === "list" && block.items) {
          return (
            <ul key={idx} className="list-disc list-inside space-y-0.5 pl-2">
              {block.items.map((item, ii) => (
                <li
                  key={ii}
                  className="text-gray-700 dark:text-gray-300"
                  dangerouslySetInnerHTML={{ __html: parseInline(item) }}
                />
              ))}
            </ul>
          );
        }

        return (
          <p
            key={idx}
            className="text-gray-700 dark:text-gray-300"
            dangerouslySetInnerHTML={{ __html: parseInline(block.text ?? "") }}
          />
        );
      })}
    </div>
  );
}
