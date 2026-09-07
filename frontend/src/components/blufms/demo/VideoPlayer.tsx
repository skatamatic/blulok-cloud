import React, { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { PlayIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon } from '@heroicons/react/24/solid';

interface VideoPlayerProps {
  videoUrl: string;
  className?: string;
}

// Custom scrubber component with perfectly synced thumb and fill
interface VideoScrubberProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  size?: 'small' | 'large';
}

const VideoScrubber: React.FC<VideoScrubberProps> = ({
  currentTime,
  duration,
  onSeek,
  onDragStart,
  onDragEnd,
  size = 'small',
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const getTimeFromPosition = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || duration <= 0) return 0;

      const rect = track.getBoundingClientRect();
      const x = clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, x / rect.width));
      return percentage * duration;
    },
    [duration]
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
    onDragStart();
    const time = getTimeFromPosition(e.clientX);
    onSeek(time);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const time = getTimeFromPosition(e.clientX);
      onSeek(time);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      onDragEnd();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, getTimeFromPosition, onSeek, onDragEnd]);

  const trackHeight = size === 'large' ? 'h-2' : 'h-2';
  const thumbSize = size === 'large' ? 'w-4 h-4' : 'w-3 h-3';

  return (
    <div
      ref={trackRef}
      className={`relative flex-1 ${trackHeight} rounded-full cursor-pointer select-none`}
      onMouseDown={handleMouseDown}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Track background */}
      <div className="absolute inset-0 rounded-full bg-gray-600" />

      {/* Fill - width based on progress */}
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-blue-500"
        style={{ width: `${progress}%` }}
      />

      {/* Thumb - positioned at exact same percentage as fill */}
      <div
        className={`absolute top-1/2 ${thumbSize} rounded-full bg-blue-500 shadow-md border-2 border-white`}
        style={{
          left: `${progress}%`,
          transform: 'translate(-50%, -50%)',
        }}
      />
    </div>
  );
};

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ videoUrl, className = '' }) => {
  const smallVideoRef = useRef<HTMLVideoElement>(null);
  const fullscreenVideoRef = useRef<HTMLVideoElement>(null);

  // Small player state
  const [smallPlaying, setSmallPlaying] = useState(false);
  const [smallTime, setSmallTime] = useState(0);
  const [smallDuration, setSmallDuration] = useState(0);
  const [smallDragging, setSmallDragging] = useState(false);

  // Fullscreen player state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenPlaying, setFullscreenPlaying] = useState(false);
  const [fullscreenTime, setFullscreenTime] = useState(0);
  const [fullscreenDuration, setFullscreenDuration] = useState(0);
  const [fullscreenDragging, setFullscreenDragging] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const formatTime = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // ===== SMALL PLAYER CONTROLS =====

  const handleSmallPlayPause = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const video = smallVideoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const handleSmallSeek = (time: number) => {
    const video = smallVideoRef.current;
    if (!video) return;
    video.currentTime = time;
    setSmallTime(time);
  };

  const handleEnterFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const small = smallVideoRef.current;
    if (!small) return;

    const wasPlaying = !small.paused;
    const time = small.currentTime;

    if (wasPlaying) {
      small.pause();
    }

    setFullscreenTime(time);
    setFullscreenPlaying(wasPlaying);
    setIsFullscreen(true);
  };

  // ===== FULLSCREEN PLAYER CONTROLS =====

  const handleFullscreenPlayPause = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const video = fullscreenVideoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const handleFullscreenSeek = (time: number) => {
    const video = fullscreenVideoRef.current;
    if (!video) return;
    video.currentTime = time;
    setFullscreenTime(time);
  };

  const handleExitFullscreen = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    const full = fullscreenVideoRef.current;
    const small = smallVideoRef.current;
    if (!full || !small) return;

    const wasPlaying = !full.paused;
    const time = full.currentTime;

    if (wasPlaying) {
      full.pause();
    }

    setIsFullscreen(false);

    setTimeout(() => {
      small.currentTime = time;
      setSmallTime(time);
      if (wasPlaying) {
        small.play().catch(() => {});
      }
    }, 50);
  };

  const stopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  // Smooth updates for small player using rAF
  useEffect(() => {
    let frameId: number;

    const tick = () => {
      const video = smallVideoRef.current;
      if (video && !smallDragging && !isFullscreen) {
        setSmallTime(video.currentTime);
      }
      frameId = requestAnimationFrame(tick);
    };

    if (smallPlaying && !isFullscreen) {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [smallPlaying, smallDragging, isFullscreen]);

  // Smooth updates for fullscreen player using rAF
  useEffect(() => {
    let frameId: number;

    const tick = () => {
      const video = fullscreenVideoRef.current;
      if (video && !fullscreenDragging && isFullscreen) {
        setFullscreenTime(video.currentTime);
      }
      frameId = requestAnimationFrame(tick);
    };

    if (fullscreenPlaying && isFullscreen) {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [fullscreenPlaying, fullscreenDragging, isFullscreen]);

  if (error) {
    return (
      <div className={`relative bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center ${className}`} style={{ minHeight: '200px' }}>
        <div className="text-center p-6">
          <div className="text-red-400 mb-2">⚠️</div>
          <div className="text-sm text-gray-300 mb-1">Video Error</div>
          <div className="text-xs text-gray-500">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* SMALL PLAYER */}
      <div
        className={`relative bg-black rounded-lg overflow-hidden group ${className}`}
        onClick={handleSmallPlayPause}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <video
          ref={smallVideoRef}
          src={videoUrl}
          className="w-full h-full object-contain"
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => {
            setSmallDuration(e.currentTarget.duration);
            setError(null);
          }}
          onPlay={() => setSmallPlaying(true)}
          onPause={() => setSmallPlaying(false)}
          onError={() => setError('Failed to load video')}
        />

        {!smallPlaying && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
            <div className="p-4 bg-primary-600 rounded-full text-white shadow-lg">
              <PlayIcon className="h-10 w-10" />
            </div>
          </div>
        )}

        <div
          className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent transition-opacity duration-200 ${
            smallDragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          onClick={stopPropagation}
          onMouseDown={stopPropagation}
        >
          <div className="p-4">
            <div className="flex items-center gap-3">
              <VideoScrubber
                currentTime={smallTime}
                duration={smallDuration}
                onSeek={handleSmallSeek}
                onDragStart={() => setSmallDragging(true)}
                onDragEnd={() => setSmallDragging(false)}
                size="small"
              />
              <span className="text-sm text-white font-mono min-w-[4rem] text-right">
                {formatTime(smallTime)} / {formatTime(smallDuration)}
              </span>
            </div>
          </div>
        </div>

        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            onClick={handleEnterFullscreen}
            className="p-2 bg-black/60 hover:bg-black/80 rounded-lg text-white transition-colors"
            aria-label="Enter fullscreen"
          >
            <ArrowsPointingOutIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* FULLSCREEN PLAYER (PORTAL) */}
      {isFullscreen &&
        createPortal(
          <div className="fixed inset-0 z-[999] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8" onClick={handleExitFullscreen}>
            <div className="relative w-full max-w-6xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl group" onClick={(e) => e.stopPropagation()}>
              <video
                ref={fullscreenVideoRef}
                src={videoUrl}
                className="w-full h-full object-contain"
                playsInline
                preload="metadata"
                onClick={handleFullscreenPlayPause}
                onLoadedMetadata={(e) => {
                  const video = e.currentTarget;
                  setFullscreenDuration(video.duration);
                  setError(null);
                  video.currentTime = fullscreenTime;
                  if (fullscreenPlaying) {
                    video.play().catch(() => {});
                  }
                }}
                onPlay={() => setFullscreenPlaying(true)}
                onPause={() => setFullscreenPlaying(false)}
                onError={() => setError('Failed to load video')}
              />

              {!fullscreenPlaying && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                  <div className="p-6 bg-primary-600 rounded-full text-white shadow-lg">
                    <PlayIcon className="h-16 w-16" />
                  </div>
                </div>
              )}

              <div
                className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent transition-opacity duration-200 opacity-0 group-hover:opacity-100`}
                onClick={stopPropagation}
                onMouseDown={stopPropagation}
              >
                <div className="p-6">
                  <div className="flex items-center gap-4">
                    <VideoScrubber
                      currentTime={fullscreenTime}
                      duration={fullscreenDuration}
                      onSeek={handleFullscreenSeek}
                      onDragStart={() => setFullscreenDragging(true)}
                      onDragEnd={() => setFullscreenDragging(false)}
                      size="large"
                    />
                    <span className="text-base text-white font-mono min-w-[5rem] text-right">
                      {formatTime(fullscreenTime)} / {formatTime(fullscreenDuration)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="absolute top-4 right-4">
                <button
                  onClick={handleExitFullscreen}
                  className="p-3 bg-black/60 hover:bg-black/80 rounded-lg text-white transition-colors"
                  aria-label="Exit fullscreen"
                >
                  <ArrowsPointingInIcon className="h-6 w-6" />
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
