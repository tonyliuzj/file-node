'use client';

import { useState, useEffect } from 'react';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import type { SyntaxHighlighterProps } from 'react-syntax-highlighter';
import { Loader2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatPreviewLimit, useTextFile } from './use-text-file';

interface TextViewerProps {
  fileUrl: string;
  downloadUrl: string;
  fileName: string;
}

type ThemeStyle = SyntaxHighlighterProps['style'];

const languageMap: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  html: 'html',
  css: 'css',
  json: 'json',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  csv: 'plaintext',
  txt: 'plaintext',
  log: 'plaintext',
  sh: 'bash',
  py: 'python',
  ini: 'ini',
  conf: 'ini',
  sql: 'sql',
  go: 'go',
  rs: 'rust',
  java: 'java',
};

export default function TextViewerClient({ fileUrl, downloadUrl, fileName }: TextViewerProps) {
  const file = useTextFile(fileUrl);
  const [themeStyle, setThemeStyle] = useState<ThemeStyle | null>(null);

  useEffect(() => {
    // Dynamically import the theme
    const loadTheme = async () => {
      try {
        const themeModule = await import('react-syntax-highlighter/dist/cjs/styles/hljs');
        setThemeStyle(themeModule.atomOneDark);
      } catch (_e) {
        console.error('Failed to load syntax highlighter theme:', _e);
        setThemeStyle({});
      }
    };

    loadTheme();
  }, []);

  if (file.status === 'loading' || !themeStyle) {
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

  const extension = fileName.split('.').pop()?.toLowerCase();
  const language = languageMap[extension || ''] || 'plaintext';

  return (
    <div className="flex flex-col h-full bg-background">
      {file.truncated && (
        <div className="border-b bg-muted px-4 py-2 text-sm text-muted-foreground">
          Showing the first {formatPreviewLimit()} of this file. Download it to see everything.
        </div>
      )}
      <div className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0">
          <SyntaxHighlighter
            language={language}
            style={themeStyle}
            showLineNumbers
            customStyle={{
              margin: 0,
              padding: '1.5rem',
              height: '100%',
              fontSize: '0.875rem',
              lineHeight: '1.5',
              backgroundColor: '#1e1e1e', // Force dark background to match atomOneDark
            }}
          >
            {file.text}
          </SyntaxHighlighter>
        </div>
      </div>
      <div className="p-4 border-t bg-background flex justify-end">
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
