import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  content: string;
  className?: string;
}

function cx(...parts: Array<string | undefined | false>) {
  return parts.filter(Boolean).join(" ");
}

function wrapTable(children: ReactNode) {
  return <div className="my-3 overflow-x-auto">{children}</div>;
}

const components: Components = {
  h1: ({ node: _node, className, ...props }) => (
    <h1 className={cx("mt-4 mb-2 text-base font-semibold", className)} {...props} />
  ),
  h2: ({ node: _node, className, ...props }) => (
    <h2 className={cx("mt-4 mb-2 text-[15px] font-semibold", className)} {...props} />
  ),
  h3: ({ node: _node, className, ...props }) => (
    <h3 className={cx("mt-3 mb-2 font-semibold", className)} {...props} />
  ),
  h4: ({ node: _node, className, ...props }) => (
    <h4 className={cx("mt-3 mb-2 font-medium", className)} {...props} />
  ),
  p: ({ node: _node, className, ...props }) => <p className={cx("my-2", className)} {...props} />,
  ul: ({ node: _node, className, ...props }) => (
    <ul className={cx("my-2 list-disc space-y-1 pl-5", className)} {...props} />
  ),
  ol: ({ node: _node, className, ...props }) => (
    <ol className={cx("my-2 list-decimal space-y-1 pl-5", className)} {...props} />
  ),
  li: ({ node: _node, className, ...props }) => <li className={cx("pl-1", className)} {...props} />,
  a: ({ node: _node, className, ...props }) => (
    <a
      className={cx("underline underline-offset-2 break-all hover:opacity-80", className)}
      target="_blank"
      rel="noreferrer noopener"
      {...props}
    />
  ),
  blockquote: ({ node: _node, className, ...props }) => (
    <blockquote
      className={cx("my-3 border-l-2 border-current/20 pl-3 italic opacity-90", className)}
      {...props}
    />
  ),
  hr: ({ node: _node, className, ...props }) => (
    <hr className={cx("my-4 border-current/10", className)} {...props} />
  ),
  pre: ({ node: _node, className, ...props }) => (
    <pre
      className={cx(
        "my-3 overflow-x-auto rounded-lg border border-white/10 bg-black/30 p-3 text-[13px]",
        className
      )}
      {...props}
    />
  ),
  code: ({ node: _node, className, children, ...props }) => {
    const text = Array.isArray(children) ? children.join("") : children;
    const isBlock = Boolean(className?.includes("language-") || (typeof text === "string" && text.includes("\n")));
    return (
      <code
        className={cx(
          isBlock ? "font-mono text-[13px]" : "rounded bg-black/25 px-1 py-0.5 font-mono text-[13px]",
          className
        )}
        {...props}
      >
        {children}
      </code>
    );
  },
  table: ({ node: _node, className, ...props }) =>
    wrapTable(<table className={cx("min-w-full border-collapse text-left text-[13px]", className)} {...props} />),
  thead: ({ node: _node, className, ...props }) => (
    <thead className={cx("bg-white/5", className)} {...props} />
  ),
  th: ({ node: _node, className, ...props }) => (
    <th className={cx("border border-white/10 px-3 py-2 font-medium", className)} {...props} />
  ),
  td: ({ node: _node, className, ...props }) => (
    <td className={cx("border border-white/10 px-3 py-2 align-top", className)} {...props} />
  ),
  img: ({ node: _node, className, alt, ...props }) => (
    <img className={cx("my-3 max-w-full rounded-lg", className)} alt={alt ?? ""} {...props} />
  ),
};

export default function MarkdownContent({ content, className }: Props) {
  return (
    <div
      className={cx(
        "min-w-0 break-words text-sm leading-6 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
