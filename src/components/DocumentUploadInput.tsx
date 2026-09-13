import React, { useRef, useState, useEffect } from 'react';
import { Icon } from './ui/Icon';
import { imageUploadManager, UploadStatus } from '../services/imageUploadManager';
import { SmartImage } from './SmartImage';
import { ZoomableDocumentContainer } from './ZoomableDocumentContainer';

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
    setUploadProgress(15);

    try {
      const { previewUrl, remoteUrlPromise } = await imageUploadManager.upload(
        instanceIdRef.current,
        file,
        folder,
        (evt) => {
          setStatus(evt.status);
          setUploadProgress(evt.progress);
          if (evt.error) {
            setErrorMessage(evt.error);
          }
        }
      );

      // Instantly display preview with zero lag
      if (previewUrl) {
        setLocalDisplayUrl(previewUrl);
      }

      // Wait for background network upload
      const finalRemoteUrl = await remoteUrlPromise;
      if (finalRemoteUrl) {
        setLocalDisplayUrl(finalRemoteUrl);
        setStatus('completed');
        setUploadProgress(100);
        onPhotoChange(finalRemoteUrl);
      }
    } catch (err: any) {
      console.warn('[DocumentUploadInput] Notice during upload process:', err);
      setStatus('error');
      setErrorMessage(isAmharic ? 'የመስቀል ችግር አጋጥሟል' : 'Upload failed');
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
        <label className={`block text-[11px] font-bold ${hasError && !hasPhoto ? 'text-red-600 dark:text-red-400' : 'text-on-surface'}`}>
          {label}
        </label>
        
        {isBusy ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#0B1E48] dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800 animate-pulse">
            <Icon className="material-symbols-outlined text-[13px] animate-spin">progress_activity</Icon>
            <span>{status === 'compressing' ? (isAmharic ? 'እየተዘጋጀ...' : 'Optimizing...') : `${uploadProgress}%`}</span>
          </span>
        ) : status === 'completed' && hasPhoto ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
            <Icon className="material-symbols-outlined text-[13px]">check_circle</Icon>
            <span>{isAmharic ? 'ተጭኗል' : 'Uploaded'}</span>
          </span>
        ) : status === 'error' ? (
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800 hover:bg-amber-100 cursor-pointer"
          >
            <Icon className="material-symbols-outlined text-[13px]">refresh</Icon>
            <span>{isAmharic ? 'እንደገና ይሞክሩ' : 'Retry'}</span>
          </button>
        ) : hasError ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-full border border-red-200 dark:border-red-800 animate-pulse">
            <Icon className="material-symbols-outlined text-[13px]">error</Icon>
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
          className={`relative border-2 border-dashed rounded-md p-3 text-center transition-all cursor-pointer min-h-[110px] flex flex-col items-center justify-center space-y-1 group ${
            hasError
              ? 'border-red-500 bg-red-50/70 dark:bg-red-950/30 ring-2 ring-red-500/30'
              : isDraggingOver
              ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
              : 'border-outline-variant hover:border-[#0B1E48] bg-surface-container/30 hover:bg-[#0B1E48]/5'
          }`}
        >
          {isBusy ? (
            <div className="flex flex-col items-center justify-center space-y-2 py-2">
              <Icon className="material-symbols-outlined animate-spin text-[#0B1E48] text-[24px]">progress_activity</Icon>
              <span className="text-[11px] font-bold text-[#0B1E48]">
                {status === 'compressing'
                  ? isAmharic ? 'ምስሉ እየተስተካከለ ነው...' : 'Compressing image...'
                  : isAmharic ? `እየተጫነ ነው (${uploadProgress}%)...` : `Uploading (${uploadProgress}%)...`}
              </span>
              {/* Progress bar */}
              <div className="w-28 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#0B1E48] transition-all duration-300 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform ${
                hasError
                  ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                  : 'bg-[#0B1E48]/10 text-[#0B1E48]'
              }`}>
                <Icon className="material-symbols-outlined text-[20px]">
                  {hasError ? 'warning' : 'add_a_photo'}
                </Icon>
              </div>
              <p className={`text-xs font-bold ${hasError ? 'text-red-600 dark:text-red-400' : 'text-[#0B1E48]'}`}>
                {hasError
                  ? isAmharic ? 'እባክዎ ሰነዱን ይጫኑ' : 'Please upload document'
                  : isAmharic ? 'ፎቶ/ምስል ይጫኑ' : 'Upload Photo'}
              </p>
              <p className={`text-[10px] ${hasError ? 'text-red-500 font-semibold' : 'text-secondary'}`}>
                {isAmharic ? 'ለማያያዝ እዚህ ይጫኑ' : 'Click to select picture'}
              </p>
            </>
          )}
        </div>
      ) : (
        /* Image Preview Container */
        <div className="relative border border-outline-variant rounded-md overflow-hidden bg-surface group">
          {/* Main Image Box */}
          <div className="h-28 w-full bg-slate-900 flex items-center justify-center overflow-hidden relative">
            <SmartImage
              src={localDisplayUrl}
              alt={label}
              fallbackIcon="add_a_photo"
              className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-200"
            />

            {/* In-Flight Overlay with progress indicator */}
            {isBusy && (
              <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs flex flex-col items-center justify-center p-2 text-white space-y-1 z-10">
                <Icon className="material-symbols-outlined animate-spin text-white text-[20px]">progress_activity</Icon>
                <span className="text-[10px] font-bold">
                  {status === 'compressing'
                    ? isAmharic ? 'እየተስተካከለ ነው...' : 'Optimizing...'
                    : `${uploadProgress}%`}
                </span>
                <div className="w-20 h-1 bg-white/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white transition-all duration-300 rounded-full"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Quick Actions Hover Overlay */}
            {!isBusy && (
              <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 p-2 z-10">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowZoom(true);
                  }}
                  className="bg-primary hover:bg-primary-hover text-white px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-sm cursor-pointer transition-transform hover:scale-105"
                  title={isAmharic ? 'አጉላ' : 'Zoom Image'}
                >
                  <Icon className="material-symbols-outlined text-[14px]">zoom_in</Icon>
                  <span>{isAmharic ? 'አጉላ' : 'Zoom'}</span>
                </button>
                <button
                  type="button"
                  onClick={triggerSelect}
                  className="bg-white/90 hover:bg-white text-slate-900 px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-sm cursor-pointer transition-transform hover:scale-105"
                >
                  <Icon className="material-symbols-outlined text-[14px]">edit</Icon>
                  <span>{isAmharic ? 'ቀይር' : 'Change'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  className="bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-sm cursor-pointer transition-transform hover:scale-105"
                >
                  <Icon className="material-symbols-outlined text-[14px]">delete</Icon>
                  <span>{isAmharic ? 'ሰርዝ' : 'Remove'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Footer Bar */}
          <div className="px-2.5 py-1.5 bg-surface-container/60 border-t border-outline-variant flex items-center justify-between text-[10px]">
            <span className="text-secondary truncate max-w-[120px]">{label}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowZoom(true)}
                className="text-primary font-bold hover:underline cursor-pointer flex items-center gap-0.5"
              >
                <Icon className="material-symbols-outlined text-[12px]">zoom_in</Icon>
                <span>{isAmharic ? 'አጉላ' : 'Zoom'}</span>
              </button>
              <button
                type="button"
                onClick={triggerSelect}
                className="text-primary font-bold hover:underline cursor-pointer flex items-center gap-0.5"
              >
                <Icon className="material-symbols-outlined text-[12px]">photo_camera</Icon>
                <span>{isAmharic ? 'ቀይር' : 'Change'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {showZoom && hasPhoto && (
        <div
          className="fixed inset-0 z-[10000] bg-black/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150 overflow-y-auto"
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
        </div>
      )}
    </div>
  );
};
