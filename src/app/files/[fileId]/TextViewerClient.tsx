'use client';

import { useState, useEffect } from 'react';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import type { SyntaxHighlighterProps } from 'react-syntax-highlighter';
import { Loader2, Download, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface TextViewerProps {
  fileUrl: string;
  fileName: string;
}

type ThemeStyle = SyntaxHighlighterProps['style'];

export default function TextViewerClient({ fileUrl, fileName }: TextViewerProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    if (!themeStyle) return; // Wait until theme is loaded

    const fetchContent = async () => {
      try {
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.statusText}`);
        }
        const text = await response.text();
        setContent(text);
        setLoading(false);
        } catch {
          setError('Failed to load file content');
          setLoading(false);
        }
    };

    fetchContent();
  }, [fileUrl, themeStyle]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-md shadow-sm">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="font-medium">{error}</p>
            <Button asChild>
            <a href={fileUrl} download={fileName}>
                <Download className="mr-2 h-4 w-4" />
                Download
            </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Determine language based on file extension
  const extension = fileName.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    html: 'html',
    css: 'css',
    json: 'json',
    xml: 'xml',
    yaml: 'yaml',
    csv: 'plaintext',
    txt: 'plaintext',
  };
  const language = languageMap[extension || ''] || 'plaintext';

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-1 overflow-hidden relative">
          <div className="absolute inset-0">
            {themeStyle ? (
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
                backgroundColor: '#1e1e1e' // Force dark background to match atomOneDark
                }}
            >
                {content}
            </SyntaxHighlighter>
            ) : (
            <pre className="p-6 overflow-auto text-sm font-mono bg-muted text-muted-foreground h-full">
                {content}
            </pre>
            )}
          </div>
      </div>
      <div className="p-4 border-t bg-background flex justify-end">
        <Button asChild size="sm">
             <a href={fileUrl} download={fileName}>
                <Download className="mr-2 h-4 w-4" />
                Download
             </a>
        </Button>
      </div>
    </div>
  );
}
