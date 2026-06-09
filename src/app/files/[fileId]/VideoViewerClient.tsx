'use client';

import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Maximize, Minimize, Volume2, VolumeX, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';

interface VideoViewerProps {
  fileUrl: string;
  downloadUrl: string;
  fileName: string;
}

export default function VideoViewerClient({ fileUrl, downloadUrl, fileName }: VideoViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(err => {
          toast.error('Failed to play video: ' + err.message);
        });
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (!document.fullscreenElement) {
        if (videoRef.current.requestFullscreen) {
          videoRef.current.requestFullscreen().catch(err => {
            console.error('Fullscreen error:', err);
          });
          setIsFullscreen(true);
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
          setIsFullscreen(false);
        }
      }
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current && duration > 0) {
      setProgress((videoRef.current.currentTime / duration) * 100);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeek = (value: number[]) => {
    if (videoRef.current) {
      const seekTime = (value[0] / 100) * duration;
      videoRef.current.currentTime = seekTime;
      setProgress(value[0]);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    if (videoRef.current) {
        const newVolume = value[0];
        videoRef.current.volume = newVolume;
        setVolume(newVolume);
        setIsMuted(newVolume === 0);
    }
  }

  const toggleMute = () => {
      if (videoRef.current) {
          const newMuted = !isMuted;
          videoRef.current.muted = newMuted;
          setIsMuted(newMuted);
          if (newMuted) {
              setVolume(0);
          } else {
              setVolume(1);
              videoRef.current.volume = 1;
          }
      }
  }

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Handle fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-black text-white relative group">
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        <video
          ref={videoRef}
          src={fileUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setIsPlaying(false)}
          onError={() => {
            toast.error('Failed to load video file');
            setLoadFailed(true);
          }}
          className="max-w-full max-h-full"
          onClick={togglePlay}
        />

        {/* Play/Pause Overlay on Hover or Pause */}
        {!isPlaying && !loadFailed && (
          <div 
            className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
            onClick={togglePlay}
          >
            <div className="p-4 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/30 transition-all">
                <Play className="h-12 w-12 text-white fill-white" />
            </div>
          </div>
        )}
      </div>
      
      {/* Controls Bar */}
      <div className="bg-gradient-to-t from-black/80 to-transparent p-4 absolute bottom-0 left-0 right-0 transition-opacity opacity-0 group-hover:opacity-100 focus-within:opacity-100">
          <div className="flex flex-col gap-2 max-w-5xl mx-auto">
             <div className="flex items-center gap-4">
                <Slider
                    value={[progress]}
                    max={100}
                    step={0.1}
                    onValueChange={handleSeek}
                    className="cursor-pointer"
                />
             </div>
             
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={togglePlay} className="text-white hover:text-white hover:bg-white/20">
                        {isPlaying ? <Pause className="h-5 w-5 fill-white" /> : <Play className="h-5 w-5 fill-white" />}
                    </Button>
                    
                    <span className="text-xs font-mono">
                        {formatTime((progress / 100) * duration)} / {formatTime(duration)}
                    </span>

                    <div className="flex items-center gap-2 group/volume">
                         <Button variant="ghost" size="icon" onClick={toggleMute} className="text-white hover:text-white hover:bg-white/20">
                             {isMuted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                         </Button>
                         <div className="w-24 hidden group-hover/volume:block transition-all">
                            <Slider 
                                value={[isMuted ? 0 : volume]}
                                max={1}
                                step={0.01}
                                onValueChange={handleVolumeChange}
                            />
                         </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <a
                        href={downloadUrl}
                        download={fileName}
                        className="p-2 rounded-md hover:bg-white/20 text-white"
                        title="Download"
                    >
                         <Download className="h-5 w-5" />
                    </a>
                    <Button variant="ghost" size="icon" onClick={toggleFullscreen} className="text-white hover:text-white hover:bg-white/20">
                        {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                    </Button>
                </div>
             </div>
          </div>
      </div>
    </div>
  );
}
