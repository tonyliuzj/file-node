'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Download, FileQuestion, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import PdfViewerClient from './PdfViewerClient';
import TextViewerClient from './TextViewerClient';
import AudioViewerClient from './AudioViewerClient';
import MarkdownViewerClient from './MarkdownViewerClient';
import VideoViewerClient from './VideoViewerClient';

function ViewerContent() {
  const searchParams = useSearchParams();
  
  const backendId = searchParams.get('backendId') || '';
  const path = searchParams.get('path') || '';
  
  const src = `/api/files/view?backendId=${encodeURIComponent(backendId)}&path=${encodeURIComponent(path)}`;
  const downloadUrl = `${src}&download=1`;
  const ext = path.split('.').pop()?.toLowerCase();

  let viewerElement: React.ReactNode;
  const fileName = path.split('/').pop() || '';
  
  if (ext === 'pdf') {
    viewerElement = <PdfViewerClient fileUrl={src} />;
  } else if (ext && ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) {
    viewerElement = (
      <div className="flex h-full items-center justify-center bg-muted/40 p-4">
        <Image
          src={src}
          alt={fileName}
          width={1200}
          height={800}
          className="h-full w-full object-contain"
          unoptimized
        />
      </div>
    );
  } else if (ext && ['mp4', 'webm', 'ogg'].includes(ext)) {
    viewerElement = (
      <VideoViewerClient
        fileUrl={src}
        downloadUrl={downloadUrl}
        fileName={fileName}
      />
    );
  } else if (ext && ['txt', 'js', 'ts', 'html', 'css', 'json', 'xml', 'yaml', 'csv'].includes(ext)) {
    viewerElement = (
      <TextViewerClient
        fileUrl={src}
        downloadUrl={downloadUrl}
        fileName={fileName}
      />
    );
  } else if (ext && ['mp3', 'wav'].includes(ext)) {
    viewerElement = (
      <AudioViewerClient
        fileUrl={src}
        downloadUrl={downloadUrl}
        fileName={fileName}
      />
    );
  } else if (ext && ['md', 'markdown'].includes(ext)) {
    viewerElement = (
      <MarkdownViewerClient
        fileUrl={src}
        downloadUrl={downloadUrl}
        fileName={fileName}
      />
    );
  } else {
    viewerElement = (
      <div className="flex flex-col items-center justify-center h-full bg-muted/40 p-4 text-center">
        <Card className="w-full max-w-md shadow-sm">
          <CardContent className="p-8">
            <FileQuestion className="mx-auto mb-4 h-14 w-14 text-muted-foreground" />
            <p className="mb-2 text-lg font-medium text-card-foreground">
              Preview not available
            </p>
            <p className="mb-6 text-sm text-muted-foreground">
              This file type cannot be previewed in the browser.
            </p>
            <Button asChild>
              <a href={downloadUrl} download={fileName}>
                <Download className="h-4 w-4" />
                Download
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b bg-background px-4 py-2">
        <div className="min-w-0 truncate text-sm font-medium" title={fileName}>
          {fileName}
        </div>
        <Button asChild size="sm" variant="outline">
          <a href={downloadUrl} download={fileName}>
            <Download className="h-4 w-4" />
            Download
          </a>
        </Button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {viewerElement}
      </div>
    </div>
  );
}

export default function ViewerPage() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <Suspense fallback={
        <div className="flex items-center justify-center h-full bg-background">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      }>
        <ViewerContent />
      </Suspense>
    </div>
  );
}
