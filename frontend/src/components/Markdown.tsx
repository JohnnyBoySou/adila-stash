import { Browser } from "@wailsio/runtime";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

interface Props {
  children: string;
  className?: string;
}

const COMPONENTS: Components = {
  a: ({ href, children, ...rest }) => (
    <a
      {...rest}
      href={href}
      onClick={(e) => {
        if (!href) return;
        if (/^https?:\/\//i.test(href)) {
          e.preventDefault();
          void Browser.OpenURL(href);
        }
      }}
      className="text-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
    >
      {children}
    </a>
  ),
  input: (props) => {
    if (props.type === "checkbox") {
      return (
        <input
          {...props}
          disabled
          className="mr-1 size-3 translate-y-[1px] border border-border align-middle accent-foreground"
        />
      );
    }
    return <input {...props} />;
  },
};

export function Markdown({ children, className }: Props) {
  if (!children.trim()) return null;
  return (
    <div className={cn("md text-[12px] break-words", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
