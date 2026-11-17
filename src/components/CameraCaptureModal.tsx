import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from './ui/Icon';
import { BACKDROP_VARIANTS, TACTILE_SPRING, TAP_SCALE } from '../utils/motionPresets';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void | Promise<void>;
  isAmharic: boolean;
  title?: string;
  defaultFacingMode?: 'environment' | 'user';
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  isAmharic,
  title,
  defaultFacingMode = 'environment',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>(defaultFacingMode);
  const [isStarting, setIsStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string>('');
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string>('');
  const [isSubmittingCapture, setIsSubmittingCapture] = useState(false);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore track stop errors
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const clearCapturedPreview = useCallback(() => {
    setCapturedPreviewUrl((prev) => {
      if (prev && prev.startsWith('blob:')) {
        URL.revokeObjectURL(prev);
      }
      return '';
    });
    setCapturedBlob(null);
  }, []);

  const startCamera = useCallback(
    async (mode: 'environment' | 'user') => {
      stopStream();
      setCameraError('');
      setIsStarting(true);

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setIsStarting(false);
        setCameraError(
          isAmharic
            ? 'ቀጥታ ካሜራ በዚህ ብራውዘር አይደገፍም። የስልኩን ካሜራ ይጠቀሙ።'
            : 'Live camera preview is unavailable here. Use Device Camera below.'
        );
        return;
      }

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: mode },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          });
        } catch {
          // Fallback to default camera if preferred facingMode/resolution is rejected
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err: any) {
        const msg = String(err?.name || err?.message || '').toLowerCase();
        if (msg.includes('notallowed') || msg.includes('permission')) {
          setCameraError(
            isAmharic
              ? 'የካሜራ ፍቃድ ተከልክሏል። ፍቃድ ይስጡ ወይም የመሣሪያ ካሜራ ይጠቀሙ።'
              : 'Camera permission denied. Allow access or use Device Camera.'
          );
        } else if (msg.includes('notfound') || msg.includes('devicenotfound')) {
          setCameraError(
            isAmharic
              ? 'ምንም ካሜራ አልተገኘም። የመሣሪያ ካሜራ ወይም ፋይል ይጠቀሙ።'
              : 'No camera detected on this device.'
          );
        } else {
          setCameraError(
            isAmharic
              ? 'ካሜራውን መክፈት አልተቻለም። የመሣሪያ ካሜራ ይሞክሩ።'
              : 'Unable to start camera. Try Device Camera below.'
          );
        }
      } finally {
        setIsStarting(false);
      }
    },
    [isAmharic, stopStream]
  );

  useEffect(() => {
    if (!isOpen) {
      stopStream();
      clearCapturedPreview();
      setCameraError('');
      setIsSubmittingCapture(false);
      return;
    }

    setFacingMode(defaultFacingMode);
    startCamera(defaultFacingMode);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      stopStream();
      clearCapturedPreview();
    };
  }, [isOpen, defaultFacingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  const handleTakeSnapshot = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        stopStream();
        clearCapturedPreview();
        setCapturedBlob(blob);
        setCapturedPreviewUrl(URL.createObjectURL(blob));
      },
      'image/jpeg',
      0.92
    );
  };

  const handleRetake = () => {
    clearCapturedPreview();
    startCamera(facingMode);
  };

  const handleConfirmPhoto = async () => {
    if (!capturedBlob || isSubmittingCapture) return;
    setIsSubmittingCapture(true);
    try {
      const file = new File([capturedBlob], `camera_capture_${Date.now()}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
      await onCapture(file);
      onClose();
    } finally {
      setIsSubmittingCapture(false);
    }
  };

  const handleNativeCameraChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsSubmittingCapture(true);
    try {
      await onCapture(file);
      onClose();
    } finally {
      setIsSubmittingCapture(false);
      if (nativeCameraInputRef.current) {
        nativeCameraInputRef.current.value = '';
      }
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-modal="true"
          variants={BACKDROP_VARIANTS}
          initial="initial"
          animate="animate"
          exit="exit"
          onClick={onClose}
          className="fixed inset-0 z-[10020] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={TACTILE_SPRING}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[92dvh]"
          >
            {/* Header */}
            <div className="px-4 py-3 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-primary/20 text-blue-400 flex items-center justify-center shrink-0">
                  <Icon name="photo_camera" size={18} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-sm font-bold text-white truncate">
                    {title || (isAmharic ? 'በካሜራ ፎቶ አንሳ' : 'Capture from Camera')}
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {!capturedPreviewUrl && !cameraError && (
                  <button
                    type="button"
                    onClick={handleToggleFacingMode}
                    title={isAmharic ? 'ካሜራ ቀይር' : 'Switch Camera'}
                    className="h-9 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Icon name="cameraswitch" size={17} />
                    <span className="hidden sm:inline">{isAmharic ? 'ካሜራ ቀይር' : 'Flip'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={isAmharic ? 'ዝጋ' : 'Close'}
                  className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
            </div>

            {/* Hidden native device camera input fallback */}
            <input
              ref={nativeCameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleNativeCameraChange}
              className="hidden"
            />

            {/* Viewport */}
            <div className="relative flex-1 min-h-[280px] sm:min-h-[380px] bg-black flex items-center justify-center overflow-hidden">
              {capturedPreviewUrl ? (
                <img
                  src={capturedPreviewUrl}
                  alt={title || 'Captured photo'}
                  className="max-h-[65dvh] w-full object-contain"
                />
              ) : cameraError ? (
                <div className="p-6 text-center max-w-sm space-y-3">
                  <div className="w-14 h-14 mx-auto rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-400">
                    <Icon name="videocam_off" size={28} />
                  </div>
                  <p className="text-xs font-semibold text-slate-200 leading-relaxed">
                    {cameraError}
                  </p>
                  <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
                    <button
                      type="button"
                      onClick={() => startCamera(facingMode)}
                      className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Icon name="refresh" size={15} />
                      <span>{isAmharic ? 'እንደገና ሞክር' : 'Retry'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => nativeCameraInputRef.current?.click()}
                      className="px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Icon name="photo_camera" size={15} />
                      <span>{isAmharic ? 'የመሣሪያ ካሜራ ክፈት' : 'Device Camera'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full max-h-[65dvh] object-cover ${facingMode === 'user' ? '-scale-x-100' : ''}`}
                  />

                  {/* Subtle document framing corner brackets */}
                  {!isStarting && (
                    <div className="absolute inset-6 sm:inset-10 pointer-events-none">
                      <div className="absolute top-0 left-0 w-7 h-7 border-t-2 border-l-2 border-white/70 rounded-tl-md" />
                      <div className="absolute top-0 right-0 w-7 h-7 border-t-2 border-r-2 border-white/70 rounded-tr-md" />
                      <div className="absolute bottom-0 left-0 w-7 h-7 border-b-2 border-l-2 border-white/70 rounded-bl-md" />
                      <div className="absolute bottom-0 right-0 w-7 h-7 border-b-2 border-r-2 border-white/70 rounded-br-md" />
                    </div>
                  )}

                  {isStarting && (
                    <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2 text-white">
                      <Icon name="progress_activity" size={28} className="animate-spin text-blue-400" />
                      <span className="text-xs font-semibold text-slate-300">
                        {isAmharic ? 'ካሜራ በመክፈት ላይ...' : 'Starting camera...'}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer Controls */}
            <div className="px-4 py-3 bg-slate-900/95 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
              {capturedPreviewUrl ? (
                <>
                  <motion.button
                    type="button"
                    whileTap={TAP_SCALE}
                    transition={TACTILE_SPRING}
                    onClick={handleRetake}
                    disabled={isSubmittingCapture}
                    className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                  >
                    <Icon name="refresh" size={16} />
                    <span>{isAmharic ? 'እንደገና አንሳ' : 'Retake'}</span>
                  </motion.button>

                  <motion.button
                    type="button"
                    whileTap={TAP_SCALE}
                    transition={TACTILE_SPRING}
                    onClick={handleConfirmPhoto}
                    disabled={isSubmittingCapture}
                    className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm disabled:opacity-50"
                  >
                    <Icon
                      name={isSubmittingCapture ? 'progress_activity' : 'check_circle'}
                      size={16}
                      className={isSubmittingCapture ? 'animate-spin' : ''}
                    />
                    <span>{isAmharic ? 'ፎቶውን ተጠቀም' : 'Use Photo'}</span>
                  </motion.button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => nativeCameraInputRef.current?.click()}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                    title={isAmharic ? 'የመሣሪያ ካሜራ' : 'Device Camera'}
                  >
                    <Icon name="add_a_photo" size={16} />
                    <span className="hidden xs:inline">{isAmharic ? 'የስልክ ካሜራ' : 'Device Camera'}</span>
                  </button>

                  {!cameraError && (
                    <motion.button
                      type="button"
                      whileTap={TAP_SCALE}
                      transition={TACTILE_SPRING}
                      onClick={handleTakeSnapshot}
                      disabled={isStarting}
                      className="w-13 h-13 rounded-full bg-white hover:bg-slate-100 text-slate-950 flex items-center justify-center shadow-lg ring-4 ring-white/25 cursor-pointer transition-all disabled:opacity-40"
                      title={isAmharic ? 'ፎቶ አንሳ' : 'Capture Photo'}
                    >
                      <Icon name="photo_camera" size={24} />
                    </motion.button>
                  )}

                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer transition-colors"
                  >
                    {isAmharic ? 'ሰርዝ' : 'Cancel'}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};
