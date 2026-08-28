import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import Markdown, { type Components } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { Button } from '../ui/button';

const markdownComponents = {
  h1: ({ children }) => (
    <h1 className="mt-5 mb-2 text-lg leading-6 font-semibold tracking-[-0.015em] text-t1 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-5 mb-2 text-base leading-5 font-semibold tracking-[-0.01em] text-t1 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 mb-1.5 text-[13px] leading-5 font-semibold text-t1 first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-4 mb-1.5 text-[11px] leading-4 font-semibold tracking-wide text-t3 uppercase first:mt-0">
      {children}
    </h4>
  ),
  p: ({ children, node }) => <MarkdownParagraph node={node}>{children}</MarkdownParagraph>,
  strong: ({ children }) => <strong className="font-semibold text-t1">{children}</strong>,
  em: ({ children }) => <em className="text-t2">{children}</em>,
  del: ({ children }) => <del className="text-t3 decoration-line-strong">{children}</del>,
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1 pl-5 marker:text-accent">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1 pl-5 marker:font-mono marker:text-[11px] marker:text-accent">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-0.5 leading-[1.52]">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 rounded-md border border-line bg-accent-soft/55 px-3 py-2 text-t2 [&>p]:my-0">
      {children}
    </blockquote>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="font-medium text-accent underline decoration-accent/35 underline-offset-2 hover:decoration-accent focus-visible:rounded-xs"
    >
      {children}
    </a>
  ),
  hr: () => <hr className="my-4 border-0 border-t border-line" />,
  table: ({ children }) => (
    <div
      className="my-3 max-w-full overflow-x-auto rounded-md border border-line bg-surface"
      role="region"
      aria-label="Scrollable AI response table"
      tabIndex={0}
    >
      <table className="w-max min-w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-surface2 text-[10px] font-semibold tracking-wide text-t3 uppercase">
      {children}
    </thead>
  ),
  tbody: ({ children }) => <tbody className="divide-y divide-line">{children}</tbody>,
  tr: ({ children }) => <tr className="align-top even:bg-surface2/35">{children}</tr>,
  th: ({ children }) => <th className="px-2.5 py-2 text-left whitespace-nowrap">{children}</th>,
  td: ({ children }) => (
    <td className="px-2.5 py-2 leading-4 whitespace-nowrap text-t2">{children}</td>
  ),
  pre: ({ children }) => <PromptBlock>{children}</PromptBlock>,
  code: ({ children }) => (
    <code className="rounded-xs border border-line bg-surface2 px-1 py-0.5 font-mono text-[0.88em] text-t1">
      {children}
    </code>
  ),
  input: ({ checked, type }) =>
    type === 'checkbox' ? (
      <input
        type="checkbox"
        checked={checked}
        readOnly
        tabIndex={-1}
        className="mr-1.5 size-3.5 translate-y-0.5 accent-accent"
      />
    ) : null,
} satisfies Components;

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="min-w-0 text-sm leading-6 text-t1 [overflow-wrap:anywhere]">
      <Markdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={markdownComponents}
        disallowedElements={['img']}
      >
        {content}
      </Markdown>
    </div>
  );
}

function MarkdownParagraph({ children, node }: { children?: ReactNode; node?: unknown }) {
  const kind = paragraphKind(node);
  if (kind === 'title') {
    return (
      <h2 className="mt-0 mb-3 text-base leading-5 tracking-[-0.01em] text-t1 [&>br]:hidden [&>em]:mt-1 [&>em]:block [&>em]:text-xs [&>em]:leading-4 [&>em]:font-normal [&>strong]:block [&>strong]:font-semibold">
        {children}
      </h2>
    );
  }
  if (kind === 'heading') {
    return (
      <h3 className="mt-4 mb-1.5 text-[13px] leading-5 font-semibold text-t1 first:mt-0">
        {children}
      </h3>
    );
  }
  return <p className="my-2 leading-[1.58] first:mt-0 last:mb-0">{children}</p>;
}

function PromptBlock({ children }: { children?: ReactNode }) {
  const child = Children.toArray(children)[0];
  const className = isValidElement<{ className?: string }>(child)
    ? child.props.className
    : undefined;
  const language = className?.match(/language-([\w-]+)/u)?.[1];
  const content = textContent(child).replace(/\n$/u, '');
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const label = language === 'prompt' ? 'Prompt' : language ? language.toUpperCase() : 'Snippet';
  return (
    <div className="my-3 overflow-hidden rounded-lg border border-line-strong bg-surface2">
      <div className="flex min-h-8 items-center justify-between gap-2 border-b border-line bg-inset/55 px-2.5">
        <span className="font-mono text-[10px] font-semibold tracking-wide text-t2 uppercase">
          {label}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-[10px]"
          title={copied ? 'Copied' : `Copy ${label.toLocaleLowerCase()}`}
          aria-label={copied ? 'Copied' : `Copy ${label.toLocaleLowerCase()}`}
          onClick={() => void copy()}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <pre className="max-w-full overflow-x-auto p-3 font-mono text-[12px] leading-5 text-t1 whitespace-pre">
        <code>{content}</code>
      </pre>
    </div>
  );
}

function textContent(value: ReactNode): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textContent).join('');
  if (isValidElement<{ children?: ReactNode }>(value)) return textContent(value.props.children);
  return '';
}

function paragraphKind(node: unknown): 'body' | 'heading' | 'title' {
  if (!isRecord(node) || !Array.isArray(node.children)) return 'body';
  const visible = node.children.filter(
    (child) =>
      !(isRecord(child) && child.type === 'text' && String(child.value ?? '').trim() === '') &&
      !(isRecord(child) && child.type === 'element' && child.tagName === 'br'),
  );
  if (visible.length === 1 && isElement(visible[0], 'strong')) return 'heading';
  if (visible.length === 2 && isElement(visible[0], 'strong') && isElement(visible[1], 'em')) {
    return 'title';
  }
  return 'body';
}

function isElement(value: unknown, tagName: string) {
  return isRecord(value) && value.type === 'element' && value.tagName === tagName;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
