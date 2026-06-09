'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/atom-one-dark.css';
import { Loader2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MarkdownViewerProps {
  fileUrl: string;
  downloadUrl: string;
  fileName: string;
}

export default function MarkdownViewerClient({ fileUrl, downloadUrl, fileName }: MarkdownViewerProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [loadFailed, setLoadFailed] = useState<boolean>(false);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.statusText}`);
        }
        const text = await response.text();
        setContent(text);
        setLoadFailed(false);
        setLoading(false);
      } catch {
        toast.error('Failed to load file content');
        setLoadFailed(true);
        setLoading(false);
      }
    };

    fetchContent();
  }, [fileUrl]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="flex h-full items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-md shadow-sm">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
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
      <ScrollArea className="flex-1">
        <div className="max-w-4xl mx-auto p-8 prose dark:prose-invert prose-blue prose-img:rounded-xl">
            <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{
                a: ({ ...props }) => (
                <a {...props} className="text-primary hover:underline font-medium" target="_blank" rel="noopener noreferrer" />
                ),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                code: (props: any) => {
                const { inline, className, children, ...rest } = props;
                if (inline) {
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
            {content}
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
