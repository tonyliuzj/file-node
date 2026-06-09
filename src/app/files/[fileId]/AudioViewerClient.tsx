'use client';

import { useState, useRef } from 'react';
import { Play, Pause, Music, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';

interface AudioViewerProps {
  fileUrl: string;
  downloadUrl: string;
  fileName: string;
}

export default function AudioViewerClient({ fileUrl, downloadUrl, fileName }: AudioViewerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(err => {
          toast.error('Failed to play audio: ' + err.message);
        });
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current && duration > 0) {
      setProgress((audioRef.current.currentTime / duration) * 100);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (value: number[]) => {
    if (audioRef.current) {
      const seekTime = (value[0] / 100) * duration;
      audioRef.current.currentTime = seekTime;
      setProgress(value[0]);
    }
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="flex h-full flex-col items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md shadow-sm">
        <CardContent className="flex flex-col items-center p-8">
            <div className="mb-8 flex h-32 w-32 items-center justify-center rounded-md border bg-card">
                <Music className="h-14 w-14 text-primary" />
            </div>

            <h2 className="text-xl font-bold text-center mb-2 truncate w-full" title={fileName}>
                {fileName}
            </h2>
            <p className="text-center text-muted-foreground text-sm mb-8">Audio File</p>

            <audio
            ref={audioRef}
            src={fileUrl}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={() => setIsPlaying(false)}
            onError={() => toast.error('Failed to load audio file')}
            />
            
            <div className="w-full mb-6 space-y-2">
                <Slider
                    value={[progress]}
                    max={100}
                    step={0.1}
                    onValueChange={handleSeek}
                    className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground font-mono">
                    <span>{formatTime((progress / 100) * duration)}</span>
                    <span>{formatTime(duration)}</span>
                </div>
            </div>

            <div className="flex items-center justify-center">
                <Button
                    onClick={togglePlay}
                    size="icon"
                    className="h-14 w-14 rounded-full"
                >
                    {isPlaying ? (
                        <Pause className="h-8 w-8 fill-current" />
                    ) : (
                        <Play className="h-8 w-8 fill-current ml-1" />
                    )}
                </Button>
            </div>
            
            <div className="mt-8 flex justify-center">
                <Button variant="link" asChild size="sm">
                    <a href={downloadUrl} download={fileName}>
                        <Download className="mr-2 h-4 w-4" />
                        Download File
                    </a>
                </Button>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
