import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ md }: { md: string }) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
    </div>
  );
}
