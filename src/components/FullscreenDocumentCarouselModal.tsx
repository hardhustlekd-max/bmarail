import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './ui/Icon';
import { Language } from '../types';
import { resolveDisplayImageUrl } from '../utils/imageUrlResolver';
import { imageLogger } from '../utils/imageLogger';

export interface DocumentViewerItem {
  url: string;
  title: string;
  subtitle?: string;
  type?: string;
  icon?: string;
}

export const buildRegistrationDocumentList = (
  reg: any,
  lang: Language = 'en',
  isSuperAdmin: boolean = true
): DocumentViewerItem[] => {
  if (!reg) return [];
  const isAmharic = lang === 'am';
  const list: DocumentViewerItem[] = [];

  // 1. Police Permit
  const policePermitPhoto = reg.drivingPermitPhoto || reg.driving_permit_photo || reg.policePermitPhoto || reg.policePermit;
  if (policePermitPhoto && typeof policePermitPhoto === 'string' && policePermitPhoto.trim() !== '') {
    list.push({
      url: policePermitPhoto,
      title: isAmharic ? 'የፖሊስ የመንቀሳቀሻ ፈቃድ' : 'Police Permit',
      subtitle: `${reg.fullName || ''} • ${reg.plateNumber || reg.engineOrSerialNo || ''}`,
      icon: 'menu_book',
      type: 'police-permit',
    });
  }

  // 2. Driver License
  const drivingLicensePhoto = reg.drivingLicensePhoto || reg.driving_license_photo || reg.driverLicensePhoto || reg.licensePhoto;
  if (drivingLicensePhoto && typeof drivingLicensePhoto === 'string' && drivingLicensePhoto.trim() !== '') {
    list.push({
      url: drivingLicensePhoto,
      title: isAmharic ? 'የመንጃ ፍቃድ' : 'Driver License',
      subtitle: `${reg.fullName || ''} • ${reg.plateNumber || ''}`,
      icon: 'card_membership',
      type: 'driving-license',
    });
  }

  // 3. National ID (Front)
  if (reg.nationalIdPhoto && typeof reg.nationalIdPhoto === 'string' && reg.nationalIdPhoto.trim() !== '') {
    list.push({
      url: reg.nationalIdPhoto,
      title: isAmharic ? 'ብሔራዊ መታወቂያ (ፊት)' : 'National ID (Front)',
      subtitle: `${reg.fullName || ''}`,
      icon: 'badge',
      type: 'national-id-front',
    });
  }

  // 4. National ID (Back)
  if (reg.nationalIdBackPhoto && typeof reg.nationalIdBackPhoto === 'string' && reg.nationalIdBackPhoto.trim() !== '') {
    list.push({
      url: reg.nationalIdBackPhoto,
      title: isAmharic ? 'ብሔራዊ መታወቂያ (ጀርባ)' : 'National ID (Back)',
      subtitle: `${reg.fullName || ''}`,
      icon: 'badge',
      type: 'national-id-back',
    });
  }

  // 5. Owner Portrait Photo
  const portrait = reg.userPortraitPhoto || reg.ownerPhoto;
  if (portrait && typeof portrait === 'string' && portrait.trim() !== '') {
    list.push({
      url: portrait,
      title: isAmharic ? 'የባለቤት ፎቶ' : 'Owner Portrait',
      subtitle: reg.fullName || '',
      icon: 'account_circle',
      type: 'owner-photo',
    });
  }

  // 6. Payment Receipt Screenshot
  if (reg.receiptScreenshot && typeof reg.receiptScreenshot === 'string' && reg.receiptScreenshot.trim() !== '') {
    list.push({
      url: reg.receiptScreenshot,
      title: isAmharic ? 'የባንክ ክፍያ ደረሰኝ' : 'Payment Receipt Slip',
      subtitle: `${reg.receiptNumber ? `#${reg.receiptNumber}` : ''} ${reg.paymentAmount ? `• ${reg.paymentAmount} ETB` : ''}`,
      icon: 'receipt_long',
      type: 'receipt-slip',
    });
  }

  return list;
};

interface FullscreenDocumentCarouselModalProps {
  items: DocumentViewerItem[];
  initialIndex?: number;
  lang?: Language;
  onClose: () => void;
}

export const FullscreenDocumentCarouselModal: React.FC<FullscreenDocumentCarouselModalProps> = ({
  items,
  initialIndex = 0,
  lang = 'en',
  onClose,
}) => {
  const isAmharic = lang === 'am';

  // Filter out any empty items
  const validItems = items.filter((item) => item && item.url && item.url.trim() !== '');
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    if (validItems.length === 0) return 0;
    return Math.min(Math.max(0, initialIndex), validItems.length - 1);
  });

  // Transform states (Zoom, Pan, Rotation)
  const [scale, setScale] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [touchDeltaX, setTouchDeltaX] = useState<number>(0);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const initialTouchDistanceRef = useRef<number | null>(null);
  const initialScaleRef = useRef<number>(1);

  const currentItem: DocumentViewerItem | undefined = validItems[currentIndex];

  // Resolve current item's display URL and handle fallback proxy
  const [displayUrl, setDisplayUrl] = useState<string>(() =>
    currentItem ? resolveDisplayImageUrl(currentItem.url).primaryUrl : ''
  );
  const [hasTriedProxy, setHasTriedProxy] = useState<boolean>(false);

  // Lock body scroll while modal is mounted
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    if (!currentItem || !currentItem.url) {
      setDisplayUrl('');
      return;
    }
    const resolved = resolveDisplayImageUrl(currentItem.url);
    setDisplayUrl(resolved.primaryUrl);
    setHasTriedProxy(resolved.primaryUrl === resolved.proxyUrl);
    setImageLoaded(false);
    setHasError(false);

    imageLogger.logLoad(currentItem.url, {
      context: `CarouselModal: ${currentItem.title}`,
      resolvedUrl: resolved.primaryUrl,
    });
  }, [currentItem]);

  // Reset transform when changing documents
  const resetTransform = useCallback(() => {
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
    setTouchDeltaX(0);
    setImageLoaded(false);
    setHasError(false);
  }, []);

  const goToIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < validItems.length && index !== currentIndex) {
        resetTransform();
        setCurrentIndex(index);
      }
    },
    [validItems.length, currentIndex, resetTransform]
  );

  const handlePrev = useCallback(() => {
    if (validItems.length <= 1) return;
    const nextIdx = currentIndex > 0 ? currentIndex - 1 : validItems.length - 1;
    goToIndex(nextIdx);
  }, [currentIndex, validItems.length, goToIndex]);

  const handleNext = useCallback(() => {
    if (validItems.length <= 1) return;
    const nextIdx = currentIndex < validItems.length - 1 ? currentIndex + 1 : 0;
    goToIndex(nextIdx);
  }, [currentIndex, validItems.length, goToIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === '+' || e.key === '=') {
        setScale((s) => Math.min(5, Number((s + 0.25).toFixed(2))));
      } else if (e.key === '-' || e.key === '_') {
        setScale((s) => {
          const next = Math.max(0.5, Number((s - 0.25).toFixed(2)));
          if (next <= 1) setPosition({ x: 0, y: 0 });
          return next;
        });
      } else if (e.key === '0' || e.key.toLowerCase() === 'r') {
        resetTransform();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, handlePrev, handleNext, resetTransform]);

  // Mouse wheel zoom listener (non-passive)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY;
      const zoomFactor = delta < 0 ? 1.15 : 0.85;

      setScale((prev) => {
        const next = Math.min(5.0, Math.max(0.5, Number((prev * zoomFactor).toFixed(2))));
        if (next <= 1) {
          setPosition({ x: 0, y: 0 });
        }
        return next;
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Mouse drag handling for panning when zoomed
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      e.preventDefault();
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch event handlers for swipe & pinch-zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      };
      if (scale > 1) {
        setIsDragging(true);
        setDragStart({
          x: e.touches[0].clientX - position.x,
          y: e.touches[0].clientY - position.y,
        });
      }
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialTouchDistanceRef.current = dist;
      initialScaleRef.current = scale;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      if (scale > 1 && isDragging) {
        setPosition({
          x: e.touches[0].clientX - dragStart.x,
          y: e.touches[0].clientY - dragStart.y,
        });
      } else if (scale <= 1 && touchStartRef.current && validItems.length > 1) {
        const diffX = e.touches[0].clientX - touchStartRef.current.x;
        const diffY = e.touches[0].clientY - touchStartRef.current.y;
        if (Math.abs(diffX) > Math.abs(diffY) * 0.8) {
          setTouchDeltaX(diffX);
        }
      }
    } else if (e.touches.length === 2 && initialTouchDistanceRef.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const newScale = Math.min(
        5,
        Math.max(0.5, (dist / initialTouchDistanceRef.current) * initialScaleRef.current)
      );
      setScale(Number(newScale.toFixed(2)));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setIsDragging(false);
    initialTouchDistanceRef.current = null;

    if (scale <= 1 && touchStartRef.current && e.changedTouches.length === 1 && validItems.length > 1) {
      const diffX = e.changedTouches[0].clientX - touchStartRef.current.x;
      const diffY = e.changedTouches[0].clientY - touchStartRef.current.y;
      const duration = Date.now() - touchStartRef.current.time;

      const isSwipe = (Math.abs(diffX) > 40 || (Math.abs(diffX) > 25 && duration < 250)) && Math.abs(diffX) > Math.abs(diffY) * 0.8;

      if (isSwipe) {
        if (diffX > 0) {
          handlePrev();
        } else {
          handleNext();
        }
      }
    }
    setTouchDeltaX(0);
    touchStartRef.current = null;
  };

  const handleZoomIn = () => {
    setScale((s) => Math.min(5, Number((s + 0.3).toFixed(2))));
  };

  const handleZoomOut = () => {
    setScale((s) => {
      const next = Math.max(0.5, Number((s - 0.3).toFixed(2)));
      if (next <= 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  };

  const handleRotate = () => {
    setRotation((r) => (r + 90) % 360);
  };

  const handleDoubleClick = () => {
    if (scale > 1) {
      resetTransform();
    } else {
      setScale(2);
    }
  };

  if (!currentItem || validItems.length === 0) {
    return null;
  }

  const modalContent = (
    <div
      id="fullscreen-photo-zoom-viewer"
      className="fixed inset-0 z-[999999] w-screen h-[100dvh] max-w-none max-h-none bg-black/95 backdrop-blur-2xl flex flex-col select-none overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* 1. SINGLE-TIER RESPONSIVE HEADER & TOOLS OPTIMIZED FOR MOBILE & DESKTOP */}
      <header className="shrink-0 w-full bg-black/95 border-b border-white/10 z-30 pointer-events-auto h-13 sm:h-16 px-2.5 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 shadow-xl">
        {/* Left Section: Document Title Info with Fixed Position Counter */}
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
          <div className="w-7.5 h-7.5 sm:w-9 sm:h-9 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary shrink-0 shadow-xs">
            <Icon className="material-symbols-outlined text-[16px] sm:text-[20px]">
              {currentItem.icon || 'description'}
            </Icon>
          </div>
          {validItems.length > 1 && (
            <span className="px-2 py-0.5 sm:py-1 rounded-md bg-white/10 text-white text-[10px] sm:text-xs font-mono font-bold shrink-0 border border-white/15 shadow-xs tracking-wider">
              {currentIndex + 1} / {validItems.length}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-xs sm:text-sm md:text-base font-black text-white truncate drop-shadow-md">
              {currentItem.title}
            </h3>
            {currentItem.subtitle && (
              <p className="text-[10px] sm:text-[11px] text-slate-300 truncate drop-shadow-xs hidden xs:block">
                {currentItem.subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Right Section: Desktop Toolbar Controls & Mobile Quick Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Desktop Zoom Controls Pill (Hidden on mobile; mobile uses ergonomic bottom floating dock) */}
          <div className="hidden sm:flex items-center bg-white/10 rounded-lg p-0.5 border border-white/10 shrink-0">
            {/* Zoom Out */}
            <button
              type="button"
              onClick={handleZoomOut}
              title={isAmharic ? 'አሳንስ (-)' : 'Zoom Out (-)'}
              aria-label="Zoom Out"
              className="w-8 h-8 rounded flex items-center justify-center text-white hover:bg-white/20 active:scale-95 transition-all cursor-pointer"
            >
              <Icon className="material-symbols-outlined text-[18px]">zoom_out</Icon>
            </button>

            {/* Zoom Level Indicator & Reset */}
            <button
              type="button"
              onClick={resetTransform}
              title={isAmharic ? 'ወደ ነባሪ መጠን መልስ' : 'Reset View (0 / R)'}
              aria-label="Reset View"
              className="px-2 h-8 text-white text-[11px] font-mono font-bold flex items-center gap-0.5 hover:bg-white/20 rounded transition-all cursor-pointer"
            >
              <span>{Math.round(scale * 100)}%</span>
              {scale !== 1 && <Icon className="material-symbols-outlined text-[13px]">restart_alt</Icon>}
            </button>

            {/* Zoom In */}
            <button
              type="button"
              onClick={handleZoomIn}
              title={isAmharic ? 'አጉላ (+)' : 'Zoom In (+)'}
              aria-label="Zoom In"
              className="w-8 h-8 rounded flex items-center justify-center text-white hover:bg-white/20 active:scale-95 transition-all cursor-pointer"
            >
              <Icon className="material-symbols-outlined text-[18px]">zoom_in</Icon>
            </button>
          </div>

          {/* Desktop Rotate Button */}
          <button
            type="button"
            onClick={handleRotate}
            title={isAmharic ? 'አሽከርክር (90°)' : 'Rotate (90°)'}
            aria-label="Rotate Document"
            className="hidden sm:flex h-8.5 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white items-center justify-center gap-1 transition-all cursor-pointer border border-white/10 shrink-0 text-xs font-semibold"
          >
            <Icon className="material-symbols-outlined text-[18px]">rotate_right</Icon>
            <span className="text-[10px] font-mono">{rotation !== 0 ? `${rotation}°` : '90°'}</span>
          </button>

          {/* Mobile Quick Rotate Button */}
          <button
            type="button"
            onClick={handleRotate}
            title={isAmharic ? 'አሽከርክር (90°)' : 'Rotate (90°)'}
            aria-label="Rotate Document"
            className="sm:hidden w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer border border-white/10 shrink-0"
          >
            <Icon className="material-symbols-outlined text-[17px]">rotate_right</Icon>
          </button>

          {/* Prominent High-Visibility Close Button (Optimized for both mobile and desktop) */}
          <button
            type="button"
            onClick={onClose}
            title={isAmharic ? 'ዝጋ (Esc)' : 'Close Viewer (Esc)'}
            aria-label="Close Document Viewer"
            className="h-8 sm:h-9 px-2 sm:px-4 rounded-lg bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1 transition-all cursor-pointer shadow-lg hover:shadow-red-600/30 border border-white/20 shrink-0"
          >
            <Icon className="material-symbols-outlined text-[18px] sm:text-[20px]">close</Icon>
            <span className="font-bold tracking-wide hidden xs:inline sm:inline">
              {isAmharic ? 'ዝጋ' : 'Close'}
            </span>
          </button>
        </div>
      </header>

      {/* 2. MAIN CAROUSEL STAGE: 3-COLUMN STRUCTURE OPTIMIZED FOR MOBILE */}
      <div className="flex-1 min-h-0 w-full flex items-center justify-between relative overflow-hidden">
        {/* Left Arrow Column - Guaranteed dedicated space so it never overlaps the image */}
        <div className="w-7 sm:w-16 md:w-20 shrink-0 h-full flex items-center justify-center z-20 pointer-events-auto">
          {validItems.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              title={isAmharic ? 'ቀዳሚ ሰነድ (←)' : 'Previous Document (←)'}
              aria-label="Previous Document"
              className="w-7.5 h-7.5 sm:w-11 sm:h-11 rounded-full bg-slate-900/85 hover:bg-slate-800 hover:scale-110 active:scale-95 text-white flex items-center justify-center border border-white/25 shadow-2xl transition-all cursor-pointer backdrop-blur-md hover:border-primary/60"
            >
              <Icon className="material-symbols-outlined text-[18px] sm:text-[26px]">chevron_left</Icon>
            </button>
          )}
        </div>

        {/* Center Document Stage - 100% Symmetrically Centered */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onDoubleClick={handleDoubleClick}
          className={`flex-1 h-full min-w-0 relative flex items-center justify-center p-1.5 sm:p-4 overflow-hidden select-none ${
            scale > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
          }`}
        >
          {/* Loading Spinner */}
          {!imageLoaded && !hasError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70 gap-3 z-10 pointer-events-none">
              <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin"></div>
              <span className="text-xs font-semibold tracking-wide">
                {isAmharic ? 'ሰነዱ እየተጫነ ነው...' : 'Loading Document...'}
              </span>
            </div>
          )}

          {/* Error Fallback */}
          {hasError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70 gap-2 z-10 p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 mb-2">
                <Icon className="material-symbols-outlined text-[32px]">broken_image</Icon>
              </div>
              <h4 className="text-base font-bold text-white">
                {isAmharic ? 'ሰነዱን ማሳየት አልተቻለም' : 'Failed to load document'}
              </h4>
              <p className="text-xs text-white/60 max-w-sm mb-2">
                {isAmharic ? 'ምስሉ አልተገኘም ወይም ተሰርዟል' : 'The image could not be loaded or is corrupted.'}
              </p>
              {currentItem && (
                <button
                  type="button"
                  onClick={() => {
                    setHasError(false);
                    setImageLoaded(false);
                    setHasTriedProxy(true);
                    const sep = currentItem.url.includes('?') ? '&' : '?';
                    const retryUrl = `/api/storage/proxy?url=${encodeURIComponent(currentItem.url)}${sep}_t=${Date.now()}`;
                    imageLogger.logRetry(currentItem.url, retryUrl, 'Manual user retry in Carousel', {
                      context: currentItem.title,
                    });
                    setDisplayUrl(retryUrl);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Icon name="refresh" size={14} />
                  <span>{isAmharic ? 'እንደገና ሞክር' : 'Retry Loading'}</span>
                </button>
              )}
            </div>
          )}

          {/* Centered Document Transform Container */}
          <div className="w-full h-full flex items-center justify-center pointer-events-none">
            <div
              style={{
                transform: `translate3d(${position.x + touchDeltaX}px, ${position.y}px, 0) scale(${scale}) rotate(${rotation}deg)`,
                transformOrigin: 'center center',
                transition: isDragging || touchDeltaX !== 0 ? 'none' : 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)',
              }}
              className="relative flex items-center justify-center max-w-full max-h-full will-change-transform m-auto pointer-events-auto"
            >
              {displayUrl && (
                <img
                  key={displayUrl}
                  src={displayUrl}
                  alt={currentItem?.title || 'Document'}
                  referrerPolicy="no-referrer"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    setImageLoaded(true);
                    setHasError(false);
                    imageLogger.logSuccess(
                      displayUrl,
                      { width: img.naturalWidth, height: img.naturalHeight },
                      undefined,
                      { context: currentItem?.title }
                    );
                  }}
                  onError={() => {
                    if (!hasTriedProxy && currentItem?.url) {
                      const resolved = resolveDisplayImageUrl(currentItem.url);
                      const proxyTarget = resolved.proxyUrl || `/api/storage/proxy?url=${encodeURIComponent(currentItem.url)}`;
                      if (proxyTarget !== displayUrl) {
                        imageLogger.logRetry(displayUrl, proxyTarget, 'Direct carousel fetch failed, routing via proxy', {
                          context: currentItem.title,
                        });
                        setHasTriedProxy(true);
                        setDisplayUrl(proxyTarget);
                        return;
                      }
                    }
                    imageLogger.logError(displayUrl, 'Carousel image load failure', {
                      context: currentItem?.title,
                      originalUrl: currentItem?.url,
                    });
                    setImageLoaded(false);
                    setHasError(true);
                  }}
                  style={{
                    maxHeight: rotation % 180 !== 0 ? '70vw' : '100%',
                    maxWidth: rotation % 180 !== 0 ? '70vh' : '100%',
                  }}
                  className={`max-w-full max-h-full object-contain rounded-xl shadow-2xl transition-opacity duration-200 pointer-events-none select-none block m-auto ${
                    imageLoaded ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              )}
            </div>
          </div>
        </div>

        {/* Right Arrow Column - Guaranteed dedicated space so it never overlaps the image */}
        <div className="w-7 sm:w-16 md:w-20 shrink-0 h-full flex items-center justify-center z-20 pointer-events-auto">
          {validItems.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              title={isAmharic ? 'ቀጣይ ሰነድ (→)' : 'Next Document (→)'}
              aria-label="Next Document"
              className="w-7.5 h-7.5 sm:w-11 sm:h-11 rounded-full bg-slate-900/85 hover:bg-slate-800 hover:scale-110 active:scale-95 text-white flex items-center justify-center border border-white/25 shadow-2xl transition-all cursor-pointer backdrop-blur-md hover:border-primary/60"
            >
              <Icon className="material-symbols-outlined text-[18px] sm:text-[26px]">chevron_right</Icon>
            </button>
          )}
        </div>
      </div>

      {/* FLOATING ZOOM PILL WITH UNMERGED PREV AND NEXT FLANKING BUTTONS */}
      <div className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-auto flex items-center gap-2 sm:gap-2.5 transition-all select-none">
        {/* Standalone Previous Button (Left of Zoom Pill) */}
        {validItems.length > 1 && (
          <button
            type="button"
            onClick={handlePrev}
            title={isAmharic ? 'ቀዳሚ ሰነድ (←)' : 'Previous Document (←)'}
            aria-label="Previous Document"
            className="w-8.5 h-8.5 sm:w-9 sm:h-9 rounded-full bg-slate-900/90 backdrop-blur-xl border border-white/20 shadow-2xl text-white flex items-center justify-center hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all cursor-pointer hover:border-primary/60 shrink-0"
          >
            <Icon className="material-symbols-outlined text-[18px] sm:text-[20px]">chevron_left</Icon>
          </button>
        )}

        {/* Zoom Pill Container */}
        <div className="h-8.5 sm:h-9 bg-slate-900/90 backdrop-blur-xl border border-white/20 rounded-full px-2.5 sm:px-3 flex items-center gap-1 sm:gap-1.5 shadow-2xl shrink-0">
          {/* Zoom Out */}
          <button
            type="button"
            onClick={handleZoomOut}
            title={isAmharic ? 'አሳንስ (-)' : 'Zoom Out'}
            aria-label="Zoom Out"
            className="w-7 h-7 sm:w-7.5 sm:h-7.5 rounded-full flex items-center justify-center text-white hover:bg-white/20 active:scale-90 transition-transform cursor-pointer"
          >
            <Icon className="material-symbols-outlined text-[16px] sm:text-[17px]">zoom_out</Icon>
          </button>

          {/* Zoom Scale & Reset */}
          <button
            type="button"
            onClick={resetTransform}
            title={isAmharic ? 'ወደ ነባሪ መጠን መልስ' : 'Reset Scale'}
            aria-label="Reset Scale"
            className="px-2 h-6 sm:h-6.5 rounded-full bg-white/15 text-white text-[10px] sm:text-[11px] font-mono font-bold flex items-center gap-0.5 hover:bg-white/25 active:scale-95 cursor-pointer"
          >
            <span>{Math.round(scale * 100)}%</span>
            {scale !== 1 && <Icon className="material-symbols-outlined text-[11px] sm:text-[12px]">restart_alt</Icon>}
          </button>

          {/* Zoom In */}
          <button
            type="button"
            onClick={handleZoomIn}
            title={isAmharic ? 'አጉላ (+)' : 'Zoom In'}
            aria-label="Zoom In"
            className="w-7 h-7 sm:w-7.5 sm:h-7.5 rounded-full flex items-center justify-center text-white hover:bg-white/20 active:scale-90 transition-transform cursor-pointer"
          >
            <Icon className="material-symbols-outlined text-[16px] sm:text-[17px]">zoom_in</Icon>
          </button>

          <div className="w-px h-3.5 bg-white/20 mx-0.5" />

          {/* Rotate */}
          <button
            type="button"
            onClick={handleRotate}
            title={isAmharic ? 'አሽከርክር (90°)' : 'Rotate (90°)'}
            aria-label="Rotate Document"
            className="w-7 h-7 sm:w-7.5 sm:h-7.5 rounded-full flex items-center justify-center text-white hover:bg-white/20 active:scale-90 transition-transform cursor-pointer"
          >
            <Icon className="material-symbols-outlined text-[16px] sm:text-[17px]">rotate_right</Icon>
          </button>
        </div>

        {/* Standalone Next Button (Right of Zoom Pill) */}
        {validItems.length > 1 && (
          <button
            type="button"
            onClick={handleNext}
            title={isAmharic ? 'ቀጣይ ሰነድ (→)' : 'Next Document (→)'}
            aria-label="Next Document"
            className="w-8.5 h-8.5 sm:w-9 sm:h-9 rounded-full bg-slate-900/90 backdrop-blur-xl border border-white/20 shadow-2xl text-white flex items-center justify-center hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all cursor-pointer hover:border-primary/60 shrink-0"
          >
            <Icon className="material-symbols-outlined text-[18px] sm:text-[20px]">chevron_right</Icon>
          </button>
        )}
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(modalContent, document.body);
};
