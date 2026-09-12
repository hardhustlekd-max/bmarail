import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './ui/Icon';

// Global cache for loaded image URLs to avoid repeated loading animations
const cachedLoadedUrls = new Set<string>();

interface SmartImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  alt: string;
  className?: string;
  fallbackIcon?: string;
  isGrayscale?: boolean;
}

export const SmartImage: React.FC<SmartImageProps> = ({
  src,
  alt,
  className = '',
  fallbackIcon = 'image',
  isGrayscale = false,
  ...props
}) => {
  const [currentSrc, setCurrentSrc] = useState<string>(src || '');
  const [hasTriedProxy, setHasTriedProxy] = useState<boolean>(false);
  const isDataUrl = Boolean(currentSrc && currentSrc.startsWith('data:'));
  const isAlreadyCached = Boolean(currentSrc && cachedLoadedUrls.has(currentSrc));
  const [isLoading, setIsLoading] = useState<boolean>(
    Boolean(currentSrc && currentSrc.trim() !== '' && !isDataUrl && !isAlreadyCached)
  );
  const [hasError, setHasError] = useState<boolean>(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Normalize incoming src and handle internal endpoints
  useEffect(() => {
    if (src && src.trim() !== '') {
      let resolved = src;
      // If it's an internal railway URL, route through the storage proxy
      if (src.includes('.railway.internal') || src.includes('minio:9000') || src.includes('localhost:9000')) {
        resolved = `/api/storage/proxy?url=${encodeURIComponent(src)}`;
      }
      setCurrentSrc(resolved);
      setHasTriedProxy(false);
      setHasError(false);

      if (
        resolved.startsWith('data:') ||
        resolved.startsWith('blob:') ||
        cachedLoadedUrls.has(resolved) ||
        (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0)
      ) {
        setIsLoading(false);
      } else {
        setIsLoading(true);
        const timer = setTimeout(() => {
          setIsLoading(false);
        }, 1500);
        return () => clearTimeout(timer);
      }
    } else {
      setCurrentSrc('');
      setIsLoading(false);
      setHasError(true);
    }
  }, [src]);

  const handleLoad = () => {
    if (currentSrc) {
      cachedLoadedUrls.add(currentSrc);
    }
    setIsLoading(false);
    setHasError(false);
  };

  const handleError = () => {
    // If direct load failed on a remote URL and we haven't tried the backend proxy yet
    if (!hasTriedProxy && currentSrc && (currentSrc.startsWith('http://') || currentSrc.startsWith('https://')) && !currentSrc.startsWith('/api/storage/proxy')) {
      setHasTriedProxy(true);
      setCurrentSrc(`/api/storage/proxy?url=${encodeURIComponent(currentSrc)}`);
      setIsLoading(true);
      return;
    }

    setIsLoading(false);
    setHasError(true);
  };

  const hasNoSrc = !currentSrc || currentSrc.trim() === '';

  if (hasError || hasNoSrc) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-surface-container border border-outline-variant/50 text-secondary p-2 text-center select-none ${className}`}
        id={`fallback-container-${alt.replace(/\s+/g, '-').toLowerCase()}`}
      >
        <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-outline shadow-2xs mb-0.5">
          <Icon name={fallbackIcon} size={20} />
        </div>
        <span className="text-[9px] font-bold tracking-wide uppercase text-secondary/80 max-w-[90%] truncate">
          {alt}
        </span>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${className}`} id={`smart-image-wrap-${alt.replace(/\s+/g, '-').toLowerCase()}`}>
      {/* Soft gradient shimmer when loading */}
      {isLoading && (
        <div className="absolute inset-0 z-10 bg-slate-100 dark:bg-slate-900 flex items-center justify-center animate-pulse">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 dark:via-black/20 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
          <Icon name={fallbackIcon} size={24} className="text-outline/40" />
        </div>
      )}

      <img
        ref={imgRef}
        src={currentSrc}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={handleLoad}
        onError={handleError}
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        className={`w-full h-full object-cover transition-all duration-200 ${
          isGrayscale ? 'grayscale' : ''
        } ${isLoading ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}
        {...props}
      />
    </div>
  );
};

