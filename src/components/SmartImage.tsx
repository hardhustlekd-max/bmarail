import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './ui/Icon';
import { resolveDisplayImageUrl, ResolvedImageSources } from '../utils/imageUrlResolver';
import { imageLogger } from '../utils/imageLogger';

// Global cache for successfully loaded image URLs to avoid flicker
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
  const [resolvedSources, setResolvedSources] = useState<ResolvedImageSources>(() =>
    resolveDisplayImageUrl(src)
  );
  const [currentSrc, setCurrentSrc] = useState<string>(() => resolveDisplayImageUrl(src).primaryUrl);
  const [hasTriedProxy, setHasTriedProxy] = useState<boolean>(false);
  const [hasTriedBust, setHasTriedBust] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(src && src.trim() !== ''));
  const [hasError, setHasError] = useState<boolean>(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const loadStartTimeRef = useRef<number>(performance.now());

  // Re-resolve URL whenever src prop changes
  useEffect(() => {
    if (!src || src.trim() === '') {
      setCurrentSrc('');
      setIsLoading(false);
      setHasError(true);
      return;
    }

    const resolved = resolveDisplayImageUrl(src);
    setResolvedSources(resolved);
    setCurrentSrc(resolved.primaryUrl);
    setHasTriedProxy(resolved.primaryUrl === resolved.proxyUrl);
    setHasTriedBust(false);
    setHasError(false);
    loadStartTimeRef.current = performance.now();

    imageLogger.logLoad(src, {
      context: alt,
      resolvedUrl: resolved.primaryUrl,
    });

    if (
      resolved.isDataOrBlob ||
      cachedLoadedUrls.has(resolved.primaryUrl) ||
      (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0)
    ) {
      setIsLoading(false);
    } else {
      setIsLoading(true);
      // Failsafe timer so loading animation never hangs indefinitely
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [src, alt]);

  const handleLoad = () => {
    const img = imgRef.current;
    const dims = img ? { width: img.naturalWidth, height: img.naturalHeight } : undefined;
    const duration = Math.round(performance.now() - loadStartTimeRef.current);

    if (currentSrc) {
      cachedLoadedUrls.add(currentSrc);
    }

    imageLogger.logSuccess(currentSrc, dims, duration, { context: alt });
    setIsLoading(false);
    setHasError(false);
  };

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    // 1. If direct load failed on a cloud URL and we haven't tried the backend proxy yet
    if (!hasTriedProxy && resolvedSources.proxyUrl && currentSrc !== resolvedSources.proxyUrl) {
      imageLogger.logRetry(currentSrc, resolvedSources.proxyUrl, 'Direct fetch failed (likely 403 or CORS)', {
        context: alt,
      });
      setHasTriedProxy(true);
      setCurrentSrc(resolvedSources.proxyUrl);
      setIsLoading(true);
      return;
    }

    // 2. If proxy was attempted once and failed, attempt a cache-busting timestamp retry
    if (!hasTriedBust && currentSrc && !currentSrc.startsWith('data:') && !currentSrc.startsWith('blob:')) {
      setHasTriedBust(true);
      const sep = currentSrc.includes('?') ? '&' : '?';
      const bustUrl = `${currentSrc}${sep}_t=${Date.now()}`;
      imageLogger.logRetry(currentSrc, bustUrl, 'Proxy retry with cache buster', { context: alt });
      setCurrentSrc(bustUrl);
      setIsLoading(true);
      return;
    }

    // 3. Complete failure after all fallback paths
    imageLogger.logError(currentSrc, 'Image decode or network error', {
      context: alt,
      attemptedUrls: [
        src || '',
        resolvedSources.primaryUrl,
        resolvedSources.proxyUrl || '',
        currentSrc,
      ],
      naturalWidth: imgRef.current?.naturalWidth,
      naturalHeight: imgRef.current?.naturalHeight,
    });

    setIsLoading(false);
    setHasError(true);
  };

  const handleManualRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!src) return;
    setHasError(false);
    setHasTriedProxy(false);
    setHasTriedBust(false);
    setIsLoading(true);
    loadStartTimeRef.current = performance.now();
    const sep = src.includes('?') ? '&' : '?';
    const retryUrl = `/api/storage/proxy?url=${encodeURIComponent(src)}${sep}_t=${Date.now()}`;
    imageLogger.logRetry(src, retryUrl, 'Manual user retry triggered', { context: alt });
    setCurrentSrc(retryUrl);
  };

  const hasNoSrc = !currentSrc || currentSrc.trim() === '';

  if (hasError || hasNoSrc) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 text-slate-500 dark:text-slate-400 p-2 text-center select-none relative group ${className}`}
        id={`fallback-container-${alt.replace(/\s+/g, '-').toLowerCase()}`}
      >
        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-400 mb-1">
          <Icon name={fallbackIcon} size={18} />
        </div>
        <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300 max-w-[90%] truncate">
          {alt}
        </span>
        {src && (
          <button
            type="button"
            onClick={handleManualRetry}
            title="እንደገና ሞክር / Retry loading image"
            className="mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-slate-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-100 border border-blue-200 dark:border-blue-800 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Icon name="refresh" size={10} />
            <span>እንደገና ሞክር</span>
          </button>
        )}
      </div>
    );
  }

  const { key, ...restProps } = props as any;

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      id={`smart-image-wrap-${alt.replace(/\s+/g, '-').toLowerCase()}`}
    >
      {/* Loading Shimmer */}
      {isLoading && (
        <div className="absolute inset-0 z-10 bg-slate-100 dark:bg-slate-800/90 flex items-center justify-center animate-pulse">
          <Icon name={fallbackIcon} size={20} className="text-slate-400 opacity-60" />
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
        className={`w-full h-full object-cover transition-all duration-200 ${
          isGrayscale ? 'grayscale' : ''
        } ${isLoading ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}
        {...restProps}
      />
    </div>
  );
};
