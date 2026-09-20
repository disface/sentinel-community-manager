import React, { useState, useRef, useEffect, useCallback } from 'react';

interface AudioPlayerProps {
  src: string;
  title?: string;
  duration?: number;
  waveform?: number[];
  onDownload?: () => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  src,
  title,
  duration: initialDuration,
  waveform,
  onDownload,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration && !isNaN(initialDuration) ? initialDuration : 0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      } else if (initialDuration && !isNaN(initialDuration)) {
        setDuration(initialDuration);
      }
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      try {
        audio.pause();
        audio.src = '';
      } catch {}
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, [initialDuration]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch((err) => {
        console.warn('Audio play error:', err);
      });
    }
  };

  const seekToPercent = useCallback((percent: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const effectiveDuration = duration > 0 ? duration : (initialDuration || 0);
    if (effectiveDuration <= 0) return;

    const newTime = Math.max(0, Math.min(effectiveDuration, (percent / 100) * effectiveDuration));
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration, initialDuration]);

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformRef.current) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
    seekToPercent(percent);
  };

  const handleSeekSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || !isFinite(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const effectiveDuration = duration > 0 ? duration : (initialDuration || 0);
  const progressPercent = effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;

  return (
    <div className="flex flex-col gap-2 p-3 bg-surface-900 border border-surface-700/80 rounded-2xl my-1.5 min-w-[280px] max-w-[420px] shadow-md select-none">
      <audio ref={audioRef} src={src} preload="metadata" />

      <div className="flex items-center justify-between text-xs text-surface-400">
        <span className="flex items-center gap-1.5 font-medium text-white truncate max-w-[240px]">
          <svg className="w-3.5 h-3.5 text-accent shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
          <span className="truncate">{title || 'Голосовое сообщение'}</span>
        </span>
        <span className="font-mono text-[11px] text-accent font-semibold shrink-0">
          {formatTime(currentTime)} / {formatTime(effectiveDuration)}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          className="w-10 h-10 rounded-xl bg-accent hover:bg-accent-hover text-white flex items-center justify-center transition-all shadow-md active:scale-95 shrink-0"
          title={isPlaying ? 'Пауза' : 'Воспроизвести'}
        >
          {isPlaying ? (
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 fill-current ml-0.5" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Интерактивная волна с кликом и перемоткой */}
        <div className="flex-1 flex flex-col justify-center">
          {waveform && waveform.length > 0 ? (
            <div
              ref={waveformRef}
              onClick={handleWaveformClick}
              className="flex items-center gap-[2px] h-7 px-1 py-0.5 rounded-lg bg-surface-950 cursor-pointer hover:bg-surface-850 transition-colors"
              title="Нажмите в любое место волны для перемотки"
            >
              {waveform.slice(0, 48).map((val, idx) => {
                const barHeight = Math.max(3, Math.min(24, Math.round((val / 30) * 24)));
                const isPassed = (idx / 48) * 100 <= progressPercent;
                return (
                  <div
                    key={idx}
                    className={`w-[4px] rounded-full transition-colors ${
                      isPassed ? 'bg-accent' : 'bg-surface-700 hover:bg-surface-600'
                    }`}
                    style={{ height: `${barHeight}px` }}
                  />
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <input
                type="range"
                min={0}
                max={effectiveDuration || 100}
                value={currentTime}
                onChange={handleSeekSlider}
                className="w-full h-1.5 bg-surface-700 rounded-lg appearance-none cursor-pointer"
              />
              <div className="w-full bg-surface-800 h-1 rounded-full overflow-hidden">
                <div
                  className="bg-accent h-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Скачивание */}
        <button
          onClick={onDownload ? onDownload : () => window.scmAPI?.openExternal?.(src)}
          className="p-2 hover:bg-surface-800 text-surface-400 hover:text-white rounded-lg transition-colors shrink-0"
          title="Сохранить файл"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
      </div>
    </div>
  );
};
