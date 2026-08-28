import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownMessage } from './MarkdownMessage';

describe('MarkdownMessage', () => {
  it('renders semantic headings, lists, and GFM tables', () => {
    const markup = renderToStaticMarkup(
      <MarkdownMessage
        content={`## Open work

- One overdue task
- Four unassigned tasks

| Task | Status |
| --- | --- |
| #2 | Overdue |`}
      />,
    );

    expect(markup).toContain('<h2');
    expect(markup).toContain('<ul');
    expect(markup).toContain('aria-label="Scrollable AI response table"');
    expect(markup).toContain('<table');
    expect(markup).not.toContain('| Task | Status |');
  });

  it('upgrades legacy bold-only summary labels into semantic headings', () => {
    const markup = renderToStaticMarkup(
      <MarkdownMessage
        content={`**Open Work Summary**
*As of 2026-08-27*

**Overall Status**

Five tasks are open.`}
      />,
    );

    expect(markup).toContain('<h2');
    expect(markup).toContain('<h3');
    expect(markup).toContain('As of 2026-08-27');
  });

  it('renders fenced prompt blocks as copyable windows and keeps inline code compact', () => {
    const markup = renderToStaticMarkup(
      <MarkdownMessage content={'Use `Task #2`.\n\n```prompt\nSummarize overdue work.\n```'} />,
    );

    expect(markup).toContain('>Prompt<');
    expect(markup).toContain('aria-label="Copy prompt"');
    expect(markup).toContain('Summarize overdue work.');
    expect(markup).toContain('Task #2');
  });

  it('does not render model-supplied image elements', () => {
    const markup = renderToStaticMarkup(
      <MarkdownMessage content="![tracking pixel](https://example.com/pixel.gif)" />,
    );

    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('pixel.gif');
  });
});
