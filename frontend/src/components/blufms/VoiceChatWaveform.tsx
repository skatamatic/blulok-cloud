import React, { useEffect, useRef, useState, useCallback } from 'react';

interface VoiceChatWaveformProps {
  className?: string;
  statusText?: string;
}

export const VoiceChatWaveform: React.FC<VoiceChatWaveformProps> = ({ className = '', statusText }) => {
  const [audioLevels, setAudioLevels] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Number of bars on each side (total will be double for symmetric waveform)
  const barCountPerSide = 30;

  const startListening = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);

      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

      const updateWaveform = () => {
        if (!analyserRef.current || !dataArrayRef.current || !audioContextRef.current) return;

        analyserRef.current.getByteFrequencyData(dataArrayRef.current);

        // Calculate frequency per bin
        const sampleRate = audioContextRef.current.sampleRate;
        const nyquist = sampleRate / 2;
        const frequencyPerBin = nyquist / dataArrayRef.current.length;
        
        // Focus on voice frequencies: 300-3400 Hz (standard telephone bandwidth, optimal for voice)
        const lowCutoffFrequency = 300;
        const highCutoffFrequency = 3400;
        const lowCutoffBin = Math.floor(lowCutoffFrequency / frequencyPerBin);
        const highCutoffBin = Math.floor(highCutoffFrequency / frequencyPerBin);
        
        // Extract levels for symmetric visualization
        const usableBins = Math.max(highCutoffBin - lowCutoffBin, 1);
        const step = Math.max(Math.floor(usableBins / barCountPerSide), 1);

        // Build left side (from center outward)
        const leftSide: number[] = [];
        for (let i = 0; i < barCountPerSide; i++) {
          const index = lowCutoffBin + (barCountPerSide - 1 - i) * step;
          // Ensure we don't exceed the high cutoff
          const clampedIndex = Math.min(Math.max(index, lowCutoffBin), highCutoffBin - 1);
          const value = dataArrayRef.current[clampedIndex] || 0;
          // Normalize
          const normalized = Math.min(value / 255, 1);
          
          // Apply threshold to filter out very quiet sounds (improves dynamic range)
          const threshold = 0.15; // Only show sounds above 15% of max
          if (normalized < threshold) {
            leftSide.push(0);
            continue;
          }
          
          // Normalize above threshold (0-1 range becomes threshold-1, then remap to 0-1)
          const aboveThreshold = (normalized - threshold) / (1 - threshold);
          
          // Apply stronger curve for better dynamic range
          // Higher exponent = less sensitive to quiet sounds, better distinction for loud sounds
          const curved = Math.pow(aboveThreshold, 0.8);
          leftSide.push(curved);
        }

        // Mirror to create symmetric waveform (left + right)
        const rightSide = [...leftSide].reverse();
        setAudioLevels([...leftSide, ...rightSide]);
        animationFrameRef.current = requestAnimationFrame(updateWaveform);
      };

      updateWaveform();
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError('Unable to access microphone. Please check permissions.');
    }
  }, []);

  const stopListening = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    dataArrayRef.current = null;
    setAudioLevels(new Array(barCountPerSide * 2).fill(0));
  }, []);

  // Auto-start listening when component mounts
  useEffect(() => {
    startListening();
    return () => {
      stopListening();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount/unmount

  return (
    <div 
      className={`flex items-center justify-center ${className}`} 
      style={{ opacity: 0.85, zIndex: 9999, position: 'relative' }}
    >
      <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 px-6 py-4 flex flex-col gap-3 w-[90%] max-w-[95%]">
        {/* Waveform Visualization - Symmetric from center with fade at edges */}
        <div className="flex items-center justify-center gap-1 w-full h-12">
          {audioLevels.length > 0 ? (
            audioLevels.map((level, index) => {
              // Calculate bar height for vertical reflection (extends both up and down from center)
              // Enhanced dynamic range with logarithmic-like scaling
              // Use a higher exponent to compress quiet sounds and expand loud sounds
              const curvedLevel = Math.pow(level, 0.7); // Stronger curve for better dynamic range
              // Use wider range with exponential-like scaling for better visual variation
              const halfHeight = Math.max(Math.round(curvedLevel * 22 + 3), 3); // 3-25px on each side, rounded to avoid aliasing
              const baseOpacity = Math.max(level * 0.7 + 0.3, 0.5); // 0.5-1.0 opacity
              
              // Calculate fade opacity at edges (25% fade on each side with exponential curve)
              const totalBars = audioLevels.length;
              const fadeZone = Math.floor(totalBars * 0.25); // 25% of bars
              let edgeOpacity = 1;
              
              if (index < fadeZone) {
                // Left edge fade with exponential curve (steeper)
                const progress = index / fadeZone; // 0 to 1
                edgeOpacity = Math.pow(progress, 2.5); // Exponential fade (steeper than linear)
              } else if (index >= totalBars - fadeZone) {
                // Right edge fade with exponential curve (steeper)
                const progress = (totalBars - index - 1) / fadeZone; // 0 to 1
                edgeOpacity = Math.pow(progress, 2.5); // Exponential fade (steeper than linear)
              }
              
              const finalOpacity = baseOpacity * edgeOpacity;
              
              return (
                <div
                  key={index}
                  className="bg-primary-600 dark:bg-primary-400 transition-all duration-50 ease-out voice-waveform-bar"
                  style={{
                    width: '3px',
                    height: `${halfHeight * 2}px`, // Total height is double (up + down)
                    opacity: finalOpacity,
                    minHeight: '6px',
                    borderRadius: '1.5px', // Half of width for consistent rounded appearance
                    flexShrink: 0, // Prevent bars from shrinking
                  }}
                />
              );
            })
          ) : (
            // Placeholder bars when not listening
            Array.from({ length: barCountPerSide * 2 }).map((_, index) => {
              const totalBars = barCountPerSide * 2;
              const fadeZone = Math.floor(totalBars * 0.25);
              let edgeOpacity = 0.3;
              
              if (index < fadeZone) {
                // Exponential fade for placeholder bars
                const progress = index / fadeZone;
                edgeOpacity = Math.pow(progress, 2.5) * 0.3;
              } else if (index >= totalBars - fadeZone) {
                // Exponential fade for placeholder bars
                const progress = (totalBars - index - 1) / fadeZone;
                edgeOpacity = Math.pow(progress, 2.5) * 0.3;
              }
              
              return (
                <div
                  key={index}
                  className="bg-gray-300 dark:bg-gray-600 voice-waveform-bar"
                  style={{
                    width: '3px',
                    height: '8px',
                    opacity: edgeOpacity,
                    borderRadius: '1.5px',
                    flexShrink: 0,
                  }}
                />
              );
            })
          )}
        </div>

        {/* Transcription Text Area */}
        <div className="flex items-center justify-start w-full min-h-[20px]">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {/* Placeholder for real-time transcription */}
            {error ? (
              <span className="text-red-600 dark:text-red-400">{error}</span>
            ) : statusText ? (
              <span className="text-gray-900 dark:text-white">{statusText}</span>
            ) : (
              <span className="text-gray-500 dark:text-gray-400">Listening...</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};

