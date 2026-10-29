'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/atom-one-dark.css';
import { Loader2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatPreviewLimit, useTextFile } from './use-text-file';

interface MarkdownViewerProps {
  fileUrl: string;
  downloadUrl: string;
  fileName: string;
}

export default function MarkdownViewerClient({ fileUrl, downloadUrl, fileName }: MarkdownViewerProps) {
  const file = useTextFile(fileUrl);

  if (file.status === 'loading') {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (file.status === 'error') {
    return (
      <div className="flex h-full items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-md shadow-sm">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              This file could not be previewed: {file.message}.
            </p>
            <Button asChild>
              <a href={downloadUrl} download={fileName}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {file.truncated && (
        <div className="border-b bg-muted px-4 py-2 text-sm text-muted-foreground">
          Showing the first {formatPreviewLimit()} of this file. Download it to see everything.
        </div>
      )}
      <ScrollArea className="flex-1">
        <div className="max-w-4xl mx-auto p-8 prose dark:prose-invert prose-blue prose-img:rounded-xl">
            <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{
                a: ({ ...props }) => (
                <a {...props} className="text-primary hover:underline font-medium" target="_blank" rel="noopener noreferrer" />
                ),
                // react-markdown 9+ no longer passes `inline`: inline code is the one without a
                // language class and without line breaks.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                code: (props: any) => {
                // `node` is react-markdown's AST handle; it must not reach the DOM element.
                const { className, children, node, ...rest } = props;
                void node;
                const isInline = !className && !String(children).includes('\n');
                if (isInline) {
                    return <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-primary" {...rest}>{children}</code>;
                }
                return <code className={className} {...rest}>{children}</code>;
                },
                table: ({ ...props }) => (
                <div className="overflow-x-auto my-6 rounded-lg border">
                    <table className="min-w-full divide-y" {...props} />
                </div>
                ),
                th: ({ ...props }) => (
                <th className="px-6 py-3 bg-muted text-left text-xs font-medium text-muted-foreground uppercase tracking-wider" {...props} />
                ),
                td: ({ ...props }) => (
                <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground border-t" {...props} />
                ),
                blockquote: ({ ...props }) => (
                    <blockquote className="border-l-4 border-primary pl-4 italic text-muted-foreground my-4" {...props} />
                )
            }}
            >
            {file.text}
            </ReactMarkdown>
        </div>
      </ScrollArea>
      <div className="p-4 border-t bg-background flex justify-end z-10">
        <Button asChild size="sm">
            <a href={downloadUrl} download={fileName}>
                <Download className="mr-2 h-4 w-4" />
                Download
            </a>
        </Button>
      </div>
    </div>
  );
}
