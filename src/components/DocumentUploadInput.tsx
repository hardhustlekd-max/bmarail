import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TACTILE_SPRING, TAP_SCALE, SUBTLE_TAP_SCALE, BACKDROP_VARIANTS } from '../utils/motionPresets';
import { Icon } from './ui/Icon';
import { imageUploadManager, UploadStatus } from '../services/imageUploadManager';
import { compressImageToBlob } from '../utils/imageCompressor';
import { SmartImage } from './SmartImage';
import { ZoomableDocumentContainer } from './ZoomableDocumentContainer';
import { CameraCaptureModal } from './CameraCaptureModal';

interface DocumentUploadInputProps {
  label: string;
  photoUrl: string;
  onPhotoChange: (newUrl: string) => void;
  isAmharic: boolean;
  id?: string;
  hasError?: boolean;
  folder?: string;
}

export const DocumentUploadInput: React.FC<DocumentUploadInputProps> = ({
  label,
  photoUrl,
  onPhotoChange,
  isAmharic,
  id = Math.random().toString(36).substring(2, 9),
  hasError = false,
  folder = 'permits',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const instanceIdRef = useRef<string>(`upload_slot_${id}`);
  
  const [localDisplayUrl, setLocalDisplayUrl] = useState<string>(photoUrl || '');
  const [status, setStatus] = useState<UploadStatus>(photoUrl ? 'completed' : 'idle');
  const [uploadProgress, setUploadProgress] = useState<number>(photoUrl ? 100 : 0);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [showZoom, setShowZoom] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const lastSelectedFileRef = useRef<File | null>(null);

  // Synchronize local preview when parent photoUrl changes (e.g. form load, reset, or draft fetch)
  useEffect(() => {
    if (photoUrl && photoUrl.trim() !== '') {
      setLocalDisplayUrl(photoUrl);
      setStatus('completed');
      setUploadProgress(100);
      setErrorMessage('');
    } else if (status !== 'uploading' && status !== 'compressing') {
      setLocalDisplayUrl('');
      setStatus('idle');
      setUploadProgress(0);
    }
  }, [photoUrl]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      imageUploadManager.abortUpload(instanceIdRef.current);
      if (localDisplayUrl && localDisplayUrl.startsWith('blob:')) {
        imageUploadManager.revokeUrl(localDisplayUrl);
      }
    };
  }, []);

  const processFile = async (file: File) => {
    if (!file || !file.type.startsWith('image/')) {
      return;
    }

    lastSelectedFileRef.current = file;
    setErrorMessage('');
    setStatus('compressing');
    setUploadProgress(30);

    try {
      // 1. High-efficiency client-side compression pass at 60% JPEG quality
      const compressed = await compressImageToBlob(file, {
        maxWidth: 1400,
        maxHeight: 1400,
        quality: 0.60,
        preferredFormat: 'image/jpeg',
        maxBytes: 100 * 1024,
        contrastBoost: true,
      });

      // 2. Instant zero-lag in-memory preview without pre-uploading orphaned files to server
      const displayUrl = compressed.dataUrl || compressed.objectUrl;
      setLocalDisplayUrl(displayUrl);
      setStatus('completed');
      setUploadProgress(100);

      // 3. Pass compressed 60% JPEG data URL to parent form state (uploaded only upon final form submit)
      onPhotoChange(compressed.dataUrl);
    } catch (err: any) {
      console.warn('[DocumentUploadInput] Notice during compression process:', err);
      setStatus('error');
      setErrorMessage(isAmharic ? 'የምስል ማስተካከል ችግር አጋጥሟል' : 'Image processing failed');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      await processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    imageUploadManager.abortUpload(instanceIdRef.current);
    if (localDisplayUrl && localDisplayUrl.startsWith('blob:')) {
      imageUploadManager.revokeUrl(localDisplayUrl);
    }
    setLocalDisplayUrl('');
    setStatus('idle');
    setUploadProgress(0);
    setErrorMessage('');
    lastSelectedFileRef.current = null;
    onPhotoChange('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (lastSelectedFileRef.current) {
      processFile(lastSelectedFileRef.current);
    } else if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const triggerSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const isBusy = status === 'compressing' || status === 'uploading';
  const hasPhoto = Boolean(localDisplayUrl && localDisplayUrl.trim() !== '');

  return (
    <div className="space-y-1.5" id={`doc-upload-field-${id}`}>
      {/* Header with Title and Dynamic Badge */}
      <div className="flex items-center justify-between">
        <label className={`block text-11 font-bold ${hasError && !hasPhoto ? 'text-red-600 dark:text-red-400' : 'text-on-surface'}`}>
          {label}
        </label>
        
        {isBusy ? (
          <span className="inline-flex items-center gap-1 text-2xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/25">
            <Icon className="material-symbols-outlined text-13 animate-spin">progress_activity</Icon>
            <span>{status === 'compressing' ? (isAmharic ? 'እየተዘጋጀ...' : 'Optimizing...') : `${uploadProgress}%`}</span>
          </span>
        ) : status === 'completed' && hasPhoto ? (
          <span className="inline-flex items-center gap-1 text-2xs font-bold text-emerald-700 dark:text-[#6EE7B7] bg-emerald-50 dark:bg-[#10B981]/15 px-2 py-0.5 rounded-md border border-emerald-200/80 dark:border-[#10B981]/30">
            <Icon className="material-symbols-outlined text-13">check_circle</Icon>
            <span>{isAmharic ? 'ተጭኗል' : 'Uploaded'}</span>
          </span>
        ) : status === 'error' ? (
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-1 text-2xs font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 px-2 py-0.5 rounded-md border border-amber-200/80 dark:border-amber-500/30 hover:bg-amber-100 cursor-pointer"
          >
            <Icon className="material-symbols-outlined text-13">refresh</Icon>
            <span>{isAmharic ? 'እንደገና ይሞክሩ' : 'Retry'}</span>
          </button>
        ) : hasError ? (
          <span className="inline-flex items-center gap-1 text-2xs font-bold text-rose-700 dark:text-[#FDA4AF] bg-rose-50 dark:bg-[#FB5454]/15 px-2 py-0.5 rounded-md border border-rose-200/80 dark:border-[#FB5454]/30">
            <Icon className="material-symbols-outlined text-13">error</Icon>
            <span>{isAmharic ? 'ያስፈልጋል' : 'Required'}</span>
          </span>
        ) : null}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        onChange={handleFileChange}
        className="hidden"
        id={`input-file-${id}`}
      />

      {/* Empty State / Dropzone */}
      {!hasPhoto ? (
        <div
          onClick={triggerSelect}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative border border-dashed rounded-lg p-3.5 sm:p-3 text-center transition-all cursor-pointer min-h-[calc(120px*var(--ui-scale))] flex flex-col items-center justify-center space-y-1.5 group touch-manipulation active:scale-[0.98] ${
            hasError
              ? 'border-[#FB5454] bg-rose-50/70 dark:bg-[#FB5454]/15 ring-2 ring-[#FB5454]/25'
              : isDraggingOver
              ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
              : 'border-[#E2E8F0] dark:border-[#2E3A47] hover:border-primary bg-[#F7F9FC] dark:bg-[#24303F]/60 hover:bg-[#F1F5F9] dark:hover:bg-[#24303F]'
          }`}
        >
          {isBusy ? (
            <div className="flex flex-col items-center justify-center space-y-2 py-2">
              <Icon className="material-symbols-outlined animate-spin text-primary text-icon-2xl">progress_activity</Icon>
              <span className="text-11 font-bold text-[#1C2434] dark:text-white">
                {status === 'compressing'
                  ? isAmharic ? 'ምስሉ እየተስተካከለ ነው...' : 'Compressing image...'
                  : isAmharic ? `እየተጫነ ነው (${uploadProgress}%)...` : `Uploading (${uploadProgress}%)...`}
              </span>
              {/* GPU scaleX Progress bar */}
              <div className="w-28 h-1.5 bg-[#E2E8F0] dark:bg-[#2E3A47] rounded-full overflow-hidden">
                <div
                  className="h-full w-full bg-primary transition-transform duration-200 origin-left rounded-full"
                  style={{ transform: `scaleX(${Math.max(0.05, uploadProgress / 100)})` }}
                />
              </div>
            </div>
          ) : (
            <>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform border ${
                hasError
                  ? 'bg-[#FB5454]/10 text-[#FB5454] border-[#FB5454]/25'
                  : 'bg-white dark:bg-[#1C2434] text-primary border-[#E2E8F0] dark:border-[#2E3A47]'
              }`}>
                <Icon className="material-symbols-outlined text-icon-xl">
                  {hasError ? 'warning' : 'add_a_photo'}
                </Icon>
              </div>
              <p className={`text-xs font-black ${hasError ? 'text-rose-700 dark:text-[#FDA4AF]' : 'text-[#1C2434] dark:text-white'}`}>
                {hasError
                  ? isAmharic ? 'እባክዎ ሰነዱን ይጫኑ' : 'Please upload document'
                  : isAmharic ? 'ፎቶ/ምስል ይጫኑ' : 'Upload Photo'}
              </p>
              <div className="flex items-center justify-center gap-1.5 pt-1 flex-wrap">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerSelect();
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-outline-variant bg-surface hover:bg-surface-container text-on-surface text-11 font-bold transition-colors cursor-pointer touch-manipulation"
                >
                  <Icon name="upload_file" size={14} />
                  <span>{isAmharic ? 'ፋይል' : 'File'}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCamera(true);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-primary hover:bg-primary-hover text-on-primary text-11 font-bold transition-colors cursor-pointer touch-manipulation shadow-2xs"
                >
                  <Icon name="photo_camera" size={14} />
                  <span>{isAmharic ? 'ካሜራ' : 'Camera'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        /* Image Preview Container */
        <div className="relative border border-[#E2E8F0] dark:border-[#2E3A47] rounded-lg overflow-hidden bg-white dark:bg-[#1C2434] group">
          {/* Main Image Box */}
          <div className="h-28 w-full bg-[#1C2434] flex items-center justify-center overflow-hidden relative">
            <SmartImage
              src={localDisplayUrl}
              alt={label}
              fallbackIcon="add_a_photo"
              className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-200"
            />

            {/* In-Flight Overlay with progress indicator */}
            {isBusy && (
              <div className="absolute inset-0 bg-[#1A222C]/75 backdrop-blur-xs flex flex-col items-center justify-center p-2 text-white space-y-1 z-10">
                <Icon className="material-symbols-outlined animate-spin text-white text-icon-lg">progress_activity</Icon>
                <span className="text-2xs font-bold">
                  {status === 'compressing'
                    ? isAmharic ? 'እየተስተካከለ ነው...' : 'Optimizing...'
                    : `${uploadProgress}%`}
                </span>
                <div className="w-20 h-1 bg-white/30 rounded-full overflow-hidden">
                  <div
                    className="h-full w-full bg-white transition-transform duration-200 origin-left rounded-full"
                    style={{ transform: `scaleX(${Math.max(0.05, uploadProgress / 100)})` }}
                  />
                </div>
              </div>
            )}

            {/* Quick Actions Hover Overlay */}
            {!isBusy && (
              <div className="absolute inset-0 bg-[#1A222C]/65 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 p-2 z-10 flex-wrap">
                <motion.button
                  type="button"
                  data-motion-control="true"
                  whileTap={TAP_SCALE}
                  transition={TACTILE_SPRING}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowZoom(true);
                  }}
                  className="min-h-[var(--ui-control-h-sm)] bg-primary hover:bg-primary-hover text-on-primary px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm cursor-pointer touch-manipulation"
                  title={isAmharic ? 'አጉላ' : 'Zoom Image'}
                >
                  <Icon className="material-symbols-outlined text-icon-sm">zoom_in</Icon>
                  <span>{isAmharic ? 'አጉላ' : 'Zoom'}</span>
                </motion.button>
                <motion.button
                  type="button"
                  data-motion-control="true"
                  whileTap={SUBTLE_TAP_SCALE}
                  transition={TACTILE_SPRING}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCamera(true);
                  }}
                  className="min-h-[var(--ui-control-h-sm)] bg-white/95 hover:bg-white text-[#1C2434] px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm cursor-pointer touch-manipulation"
                  title={isAmharic ? 'በካሜራ አንሳ' : 'Capture from Camera'}
                >
                  <Icon className="material-symbols-outlined text-icon-sm">photo_camera</Icon>
                  <span>{isAmharic ? 'ካሜራ' : 'Camera'}</span>
                </motion.button>
                <motion.button
                  type="button"
                  data-motion-control="true"
                  whileTap={SUBTLE_TAP_SCALE}
                  transition={TACTILE_SPRING}
                  onClick={triggerSelect}
                  className="min-h-[var(--ui-control-h-sm)] bg-white/90 hover:bg-white text-[#1C2434] px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm cursor-pointer touch-manipulation"
                >
                  <Icon className="material-symbols-outlined text-icon-sm">upload_file</Icon>
                  <span>{isAmharic ? 'ቀይር' : 'File'}</span>
                </motion.button>
                <motion.button
                  type="button"
                  data-motion-control="true"
                  whileTap={TAP_SCALE}
                  transition={TACTILE_SPRING}
                  onClick={handleClear}
                  className="min-h-[var(--ui-control-h-sm)] bg-[#FB5454] hover:bg-rose-600 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm cursor-pointer touch-manipulation"
                >
                  <Icon className="material-symbols-outlined text-icon-sm">delete</Icon>
                  <span>{isAmharic ? 'ሰርዝ' : 'Remove'}</span>
                </motion.button>
              </div>
            )}
          </div>

          {/* Touch-Friendly Footer Bar on Mobile */}
          <div className="px-2.5 py-2 bg-[#F7F9FC] dark:bg-[#24303F] border-t border-[#E2E8F0] dark:border-[#2E3A47] flex items-center justify-between gap-1 text-11">
            <span className="text-[#475569] dark:text-[#CBD5E1] font-medium truncate max-w-[calc(88px*var(--ui-scale))] sm:max-w-[calc(115px*var(--ui-scale))]">{label}</span>
            <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
              <motion.button
                type="button"
                data-motion-control="true"
                whileTap={TAP_SCALE}
                transition={TACTILE_SPRING}
                onClick={() => setShowZoom(true)}
                className="text-primary font-bold px-2 py-1.5 rounded-md hover:bg-primary/10 transition-colors cursor-pointer flex items-center gap-1 min-h-[40px] sm:min-h-[var(--ui-control-h-sm)] touch-manipulation"
                title={isAmharic ? 'አጉላ' : 'Zoom'}
              >
                <Icon className="material-symbols-outlined text-15">zoom_in</Icon>
                <span className="hidden xs:inline">{isAmharic ? 'አጉላ' : 'Zoom'}</span>
              </motion.button>
              <motion.button
                type="button"
                data-motion-control="true"
                whileTap={TAP_SCALE}
                transition={TACTILE_SPRING}
                onClick={() => setShowCamera(true)}
                className="text-primary font-bold px-2 py-1.5 rounded-md hover:bg-primary/10 transition-colors cursor-pointer flex items-center gap-1 min-h-[40px] sm:min-h-[var(--ui-control-h-sm)] touch-manipulation"
                title={isAmharic ? 'በካሜራ አንሳ' : 'Camera'}
              >
                <Icon className="material-symbols-outlined text-15">photo_camera</Icon>
                <span>{isAmharic ? 'ካሜራ' : 'Camera'}</span>
              </motion.button>
              <motion.button
                type="button"
                data-motion-control="true"
                whileTap={TAP_SCALE}
                transition={TACTILE_SPRING}
                onClick={triggerSelect}
                className="text-[#475569] dark:text-[#CBD5E1] font-bold px-2 py-1.5 rounded-md hover:bg-[#F1F5F9] dark:hover:bg-[#333A48] transition-colors cursor-pointer flex items-center gap-1 min-h-[40px] sm:min-h-[var(--ui-control-h-sm)] touch-manipulation"
                title={isAmharic ? 'ፋይል ቀይር' : 'Change File'}
              >
                <Icon className="material-symbols-outlined text-15">upload_file</Icon>
                <span>{isAmharic ? 'ቀይር' : 'File'}</span>
              </motion.button>
              <motion.button
                type="button"
                data-motion-control="true"
                whileTap={TAP_SCALE}
                transition={TACTILE_SPRING}
                onClick={handleClear}
                className="text-[#FB5454] font-bold px-1.5 py-1.5 rounded-md hover:bg-[#FB5454]/10 transition-colors cursor-pointer flex items-center justify-center min-w-[38px] min-h-[40px] sm:min-w-[calc(34px*var(--ui-scale))] sm:min-h-[var(--ui-control-h-sm)] touch-manipulation"
                title={isAmharic ? 'ሰርዝ' : 'Remove'}
              >
                <Icon className="material-symbols-outlined text-icon-sm">delete</Icon>
              </motion.button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      <AnimatePresence>
        {showZoom && hasPhoto && (
          <motion.div
            variants={BACKDROP_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 z-[10000] bg-black/90 backdrop-blur-md flex items-start justify-center pt-6 sm:pt-10 md:pt-14 pb-8 p-2 sm:p-4 overflow-y-auto"
            onClick={() => setShowZoom(false)}
          >
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-4xl">
              <ZoomableDocumentContainer
                lang={isAmharic ? 'am' : 'en'}
                title={label}
                onClose={() => setShowZoom(false)}
                requireClerkRequest={false}
              >
                <img
                  src={localDisplayUrl}
                  alt={label}
                  referrerPolicy="no-referrer"
                  className="max-h-[70vh] w-auto object-contain rounded-lg shadow-lg"
                />
              </ZoomableDocumentContainer>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Camera Capture Modal */}
      <CameraCaptureModal
        isOpen={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={processFile}
        isAmharic={isAmharic}
        title={label}
      />
    </div>
  );
};
