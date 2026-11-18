import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon } from './ui/Icon';
import { motion, AnimatePresence } from 'motion/react';
import {
  POPOVER_TRANSITION,
  TACTILE_SPRING,
  TAP_SCALE,
  SUBTLE_TAP_SCALE,
} from '../utils/motionPresets';
import { MotorcycleRegistration, VerificationLog, Language, SystemSettings } from '../types';
import { QRCodeCard } from './QRCodeCard';
import { ZoomableDocumentContainer } from './ZoomableDocumentContainer';
import { SmartImage } from './SmartImage';
import { lookupRegistrationInDb, subscribeSettings, DEFAULT_SETTINGS, isTaskViewable } from '../services/dbService';
import { getScannerTheme } from '../utils/scannerThemes';
import {
  createFastScannerPipeline,
  getOptimalCameraConstraints,
  ScanDetectionResult,
} from '../utils/qrScannerEngine';
import {
  FullscreenDocumentCarouselModal,
  buildRegistrationDocumentList,
  DocumentViewerItem,
} from './FullscreenDocumentCarouselModal';
import { getTodayEthiopianDateTimeIso } from '../utils/ethiopianCalendar';

const getStoredLastScanResult = (): MotorcycleRegistration | null => {
  // LocalStorage data loading disabled
  return null;
};

const saveLastScanResult = (_val: MotorcycleRegistration | 'not_found' | null): void => {
  // LocalStorage save disabled
};

const DataField: React.FC<{
  label: string;
  value: React.ReactNode;
  isMono?: boolean;
  isPrimary?: boolean;
  className?: string;
}> = ({ label, value, isMono = false, isPrimary = false, className = "" }) => {
  return (
    <div className={`p-2.5 rounded-md bg-surface-container border border-outline-variant/30 flex flex-col justify-center min-h-[calc(54px*var(--ui-scale))] shadow-2xs ${className}`}>
      <span className="text-2xs  tracking-wider text-secondary font-bold block mb-0.5">
        {label}
      </span>
      <div className={`text-xs font-black truncate text-on-surface leading-tight ${isMono ? 'font-mono' : ''} ${isPrimary ? 'text-primary' : ''}`}>
        {value || '-'}
      </div>
    </div>
  );
};

interface SharedScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  registrations: MotorcycleRegistration[];
  userBadgeId: string;
  onAddVerificationLog: (log: VerificationLog, isNoteUpdate?: boolean) => void;
  onReportUnregistered?: (query?: string) => void;
  isPage?: boolean;
  autoStart?: boolean;
  userRole?: string;
}

export const SharedScannerModal: React.FC<SharedScannerModalProps> = ({
  isOpen,
  onClose,
  lang,
  registrations,
  userBadgeId,
  onAddVerificationLog,
  onReportUnregistered,
  isPage = false,
  autoStart = true,
  userRole = 'officer',
}) => {
  const isAmharic = lang === 'am';
  const isSuperAdmin = userRole === 'superadmin' || userRole === 'super_admin';
  const [searchMode, setSearchMode] = useState<'camera' | 'manual'>('camera');
  const [searchPlate, setSearchPlate] = useState('');
  const [rawScannedRegResult, setScannedRegResult] = useState<MotorcycleRegistration | 'not_found' | null>(null);
  const [lastScannedQuery, setLastScannedQuery] = useState('');
  const [lastScanSource, setLastScanSource] = useState<'camera' | 'image' | 'manual'>('camera');
  const [lastScanTime, setLastScanTime] = useState('');

  // System settings state for reactive global scanner result theme
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const unsub = subscribeSettings((data) => {
      if (data) {
        setSystemSettings(data);
      }
    });
    return () => unsub();
  }, []);

  const activeTheme = useMemo(
    () => getScannerTheme(systemSettings.scannerResultTheme),
    [systemSettings.scannerResultTheme]
  );

  const isAlwaysDarkScannerTheme =
    activeTheme.id === 'deep_cobalt_navy' || activeTheme.id === 'tactical_dark';
  const isAlwaysLightScannerTheme =
    activeTheme.id === 'warm_ivory_cream' || activeTheme.id === 'soft_ice_blue';

  const scannerSemanticApprovedText = isAlwaysDarkScannerTheme
    ? 'text-emerald-300'
    : isAlwaysLightScannerTheme
    ? 'text-emerald-700'
    : 'text-emerald-700 dark:text-emerald-300';

  const scannerSemanticPendingText = isAlwaysDarkScannerTheme
    ? 'text-amber-300'
    : isAlwaysLightScannerTheme
    ? 'text-amber-700'
    : 'text-amber-700 dark:text-amber-300';

  const scannerSemanticRejectedText = isAlwaysDarkScannerTheme
    ? 'text-rose-300'
    : isAlwaysLightScannerTheme
    ? 'text-rose-700'
    : 'text-rose-700 dark:text-rose-300';

  const scannerSemanticBloodText = isAlwaysDarkScannerTheme
    ? 'text-rose-300'
    : isAlwaysLightScannerTheme
    ? 'text-red-700'
    : 'text-red-700 dark:text-rose-300';

  const scannerHairlineBorder = isAlwaysDarkScannerTheme
    ? 'border-white/15'
    : isAlwaysLightScannerTheme
    ? 'border-slate-300/70'
    : 'border-slate-300/70 dark:border-white/15';

  const scannerHairlineBorderLeft = isAlwaysDarkScannerTheme
    ? 'sm:border-l sm:border-white/15'
    : isAlwaysLightScannerTheme
    ? 'sm:border-l sm:border-slate-300/70'
    : 'sm:border-l sm:border-slate-300/70 dark:sm:border-white/15';

  const scannerSecondaryButtonSurface = isAlwaysDarkScannerTheme
    ? `${activeTheme.chipBg} ${activeTheme.headingText} hover:brightness-110`
    : isAlwaysLightScannerTheme
    ? `${activeTheme.chipBg} ${activeTheme.headingText} hover:bg-slate-50`
    : `${activeTheme.chipBg} ${activeTheme.headingText} hover:brightness-95 dark:hover:brightness-110`;

  const scannerNotesInputClass = isAlwaysDarkScannerTheme
    ? 'bg-slate-950/50 border-white/20 text-white placeholder:text-slate-400'
    : isAlwaysLightScannerTheme
    ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-500'
    : 'bg-white dark:bg-[#1C2434] border-slate-300 dark:border-white/20 text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400';

  // Memoized fully populated registration resolving documents & photo fields
  const scannedRegResult = useMemo(() => {
    if (!rawScannedRegResult || rawScannedRegResult === 'not_found') return rawScannedRegResult;

    let dl =
      rawScannedRegResult.drivingLicensePhoto ||
      (rawScannedRegResult as any).driving_license_photo ||
      (rawScannedRegResult as any).driverLicensePhoto ||
      (rawScannedRegResult as any).driver_license_photo ||
      (rawScannedRegResult as any).licensePhoto ||
      (rawScannedRegResult as any).drivingLicense ||
      '';
    let pp =
      rawScannedRegResult.drivingPermitPhoto ||
      (rawScannedRegResult as any).driving_permit_photo ||
      (rawScannedRegResult as any).policePermitPhoto ||
      (rawScannedRegResult as any).police_permit_photo ||
      (rawScannedRegResult as any).policePermit ||
      (rawScannedRegResult as any).librePhoto ||
      '';
    let nid =
      rawScannedRegResult.nationalIdPhoto ||
      (rawScannedRegResult as any).national_id_photo ||
      '';
    let nidBack =
      rawScannedRegResult.nationalIdBackPhoto ||
      (rawScannedRegResult as any).national_id_back_photo ||
      '';
    let up =
      rawScannedRegResult.userPortraitPhoto ||
      (rawScannedRegResult as any).user_portrait_photo ||
      rawScannedRegResult.userPortraitThumbnail ||
      '';

    if (!dl || !pp || !nid || !up) {
      const cleanPlate = (rawScannedRegResult.plateNumber || '').replace(/[\s\-_]/g, '').toLowerCase();
      const matchInList = registrations.find(
        (r) =>
          (r.id && r.id === rawScannedRegResult.id) ||
          (cleanPlate &&
            r.plateNumber &&
            r.plateNumber.replace(/[\s\-_]/g, '').toLowerCase() === cleanPlate)
      );
      if (matchInList) {
        if (!dl) dl = matchInList.drivingLicensePhoto || (matchInList as any).driving_license_photo || (matchInList as any).driverLicensePhoto || '';
        if (!pp) pp = matchInList.drivingPermitPhoto || (matchInList as any).driving_permit_photo || (matchInList as any).policePermitPhoto || '';
        if (!nid) nid = matchInList.nationalIdPhoto || '';
        if (!nidBack) nidBack = matchInList.nationalIdBackPhoto || '';
        if (!up) up = matchInList.userPortraitPhoto || matchInList.userPortraitThumbnail || '';
      }
    }

    return {
      ...rawScannedRegResult,
      drivingLicensePhoto: dl,
      drivingPermitPhoto: pp,
      nationalIdPhoto: nid,
      nationalIdBackPhoto: nidBack,
      userPortraitPhoto: up,
    };
  }, [rawScannedRegResult, registrations]);
  const [isScanning, setIsScanning] = useState(autoStart);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [scanFlash, setScanFlash] = useState<'success' | 'not_found' | null>(null);
  const [verificationNotes, setVerificationNotes] = useState('');
  const [currentLog, setCurrentLog] = useState<VerificationLog | null>(null);
  const [uploadedImageSrc, setUploadedImageSrc] = useState<string | null>(null);
  const [capturedFrameSrc, setCapturedFrameSrc] = useState<string | null>(null);
  const [isProcessingScan, setIsProcessingScan] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [croppedQrSrc, setCroppedQrSrc] = useState<string | null>(null);
  const [qrMotionOffset, setQrMotionOffset] = useState<{ x: number; y: number; scale: number }>({ x: 0, y: 0, scale: 1 });
  const [isBackgroundRemoved, setIsBackgroundRemoved] = useState(false);
  const [scannedVerificationState, setScannedVerificationState] = useState<
    'idle' | 'approved' | 'pending' | 'expired' | 'rejected' | 'not_found'
  >('idle');
  const [showNotesSection, setShowNotesSection] = useState(false);
  const [showDigitalIdModal, setShowDigitalIdModal] = useState(false);
  const [showTopMenu, setShowTopMenu] = useState(false);
  const [carouselModal, setCarouselModal] = useState<{
    items: DocumentViewerItem[];
    initialIndex: number;
  } | null>(null);
  const [isPickingImage, setIsPickingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraContainerRef = useRef<HTMLDivElement>(null);
  const viewfinderReticleRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isProcessingRef = useRef(false);
  const scanSessionRef = useRef(0);
  const filePickOpenedRef = useRef(false);
  const pickerCancelTimerRef = useRef<number | null>(null);

  const resolveVerificationVisualStatus = (
    match: MotorcycleRegistration | null
  ): 'approved' | 'pending' | 'expired' | 'rejected' | 'not_found' => {
    if (!match) return 'not_found';
    const statusLower = (match.status || '').toLowerCase();
    if (statusLower === 'approved' || statusLower === 'printed' || statusLower === 'ordered_print') {
      return 'approved';
    }
    if (statusLower === 'expired') {
      return 'expired';
    }
    if (statusLower === 'rejected') {
      return 'rejected';
    }
    return 'pending';
  };

  // Captures and crops ONLY the detected QR code cleanly without black borders
  const captureCroppedQr = (
    source: HTMLVideoElement | HTMLImageElement,
    boundingBox: { x: number; y: number; width: number; height: number; centerX: number; centerY: number },
    mediaWidth: number,
    mediaHeight: number
  ): string | null => {
    try {
      // Clean tight margin (5%) so QR pattern is intact without picking up outer dark borders or table surfaces
      const marginX = boundingBox.width * 0.05;
      const marginY = boundingBox.height * 0.05;
      
      const cropX = Math.max(0, boundingBox.x - marginX);
      const cropY = Math.max(0, boundingBox.y - marginY);
      const cropW = Math.min(mediaWidth - cropX, boundingBox.width + marginX * 2);
      const cropH = Math.min(mediaHeight - cropY, boundingBox.height + marginY * 2);

      if (cropW <= 0 || cropH <= 0) return null;

      // Pad to a clean 1:1 square canvas so aspect ratio never shifts or stretches during glide/scale
      const side = Math.ceil(Math.max(cropW, cropH));
      const drawX = (side - cropW) / 2;
      const drawY = (side - cropH) / 2;

      const canvas = document.createElement('canvas');
      canvas.width = side;
      canvas.height = side;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, side, side);

      ctx.drawImage(source, cropX, cropY, cropW, cropH, drawX, drawY, cropW, cropH);
      return canvas.toDataURL('image/png');
    } catch (e) {
      console.warn("Failed to crop QR:", e);
      return null;
    }
  };

  // Computes the initial pixel translation and scale so the extracted QR code moves smoothly from its detected spot to the center
  const computeQrInitialOffset = (
    boundingBox: { x: number; y: number; width: number; height: number; centerX: number; centerY: number },
    mediaWidth: number,
    mediaHeight: number
  ) => {
    if (!cameraContainerRef.current || !viewfinderReticleRef.current || !mediaWidth || !mediaHeight) {
      return { x: 0, y: 0, scale: 0.92 };
    }

    try {
      const containerRect = cameraContainerRef.current.getBoundingClientRect();
      const reticleRect = viewfinderReticleRef.current.getBoundingClientRect();

      const cW = containerRect.width;
      const cH = containerRect.height;
      if (cW <= 0 || cH <= 0) return { x: 0, y: 0, scale: 0.92 };

      // Stream / image uses object-fit: cover inside container
      const scaleCover = Math.max(cW / mediaWidth, cH / mediaHeight);
      const renderedW = mediaWidth * scaleCover;
      const renderedH = mediaHeight * scaleCover;
      const offsetX = (cW - renderedW) / 2;
      const offsetY = (cH - renderedH) / 2;

      // QR center in screen coordinates
      const qrScreenX = containerRect.left + offsetX + boundingBox.centerX * scaleCover;
      const qrScreenY = containerRect.top + offsetY + boundingBox.centerY * scaleCover;

      // Reticle center in screen coordinates
      const reticleCenterX = reticleRect.left + reticleRect.width / 2;
      const reticleCenterY = reticleRect.top + reticleRect.height / 2;

      const startDx = qrScreenX - reticleCenterX;
      const startDy = qrScreenY - reticleCenterY;

      // Match square side size (max of width/height with 5% margin) to the inner padded reticle target size
      const qrSquareWidth = Math.max(boundingBox.width, boundingBox.height) * 1.1 * scaleCover;
      const paddingPx = window.innerWidth >= 640 ? 32 : 24;
      const finalDisplaySize = Math.max(1, Math.min(reticleRect.width, reticleRect.height) - paddingPx);
      const startScale = Math.max(0.25, Math.min(1.5, qrSquareWidth / finalDisplaySize));

      return {
        x: Number(startDx.toFixed(1)),
        y: Number(startDy.toFixed(1)),
        scale: Number(startScale.toFixed(3)),
      };
    } catch (e) {
      return { x: 0, y: 0, scale: 0.92 };
    }
  };

  // When closing, reset everything
  const handleClose = () => {
    setIsLocked(false);
    setCroppedQrSrc(null);
    setQrMotionOffset({ x: 0, y: 0, scale: 1 });
    setIsBackgroundRemoved(false);
    setScannedVerificationState('idle');
    if (videoRef.current && videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    }
    onClose();
  };

  // Restart scanning
  const handleRestartScan = () => {
    setIsLocked(false);
    setCroppedQrSrc(null);
    setQrMotionOffset({ x: 0, y: 0, scale: 1 });
    setIsBackgroundRemoved(false);
    setScannedVerificationState('idle');
    setScannedRegResult(null);
    setCapturedFrameSrc(null);
    setUploadedImageSrc(null);
    setIsScanning(true);
    isProcessingRef.current = false;
    setCameraError('');
    if (videoRef.current && videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    }
  };

  const openDocumentCarousel = (targetUrl: string, fallbackTitle?: string) => {
    if (!targetUrl) return;
    const docs = buildRegistrationDocumentList(scannedRegResult, lang, isSuperAdmin, {
      includeReceipt: false,
    });
    const foundIdx = docs.findIndex((d) => d.url === targetUrl);
    if (foundIdx >= 0) {
      setCarouselModal({
        items: docs,
        initialIndex: foundIdx,
      });
    } else {
      setCarouselModal({
        items: [{ url: targetUrl, title: fallbackTitle || (isAmharic ? 'ሰነድ' : 'Document') }, ...docs],
        initialIndex: 0,
      });
    }
  };



  // Audio indicator synthesizer using Web Audio API
  const playScanFeedback = (isSuccess: boolean) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      if (isSuccess) {
        // High-pitched pleasant dual-tone success beep (880Hz -> 1760Hz)
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(880, ctx.currentTime);
        osc2.frequency.setValueAtTime(1760, ctx.currentTime + 0.08);

        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 0.08);
        osc2.start(ctx.currentTime + 0.08);
        osc2.stop(ctx.currentTime + 0.25);

        if (navigator.vibrate) {
          navigator.vibrate([80, 40, 80]);
        }
      } else {
        // Low-tone warning sound for unverified QR
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.3);

        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);

        if (navigator.vibrate) {
          navigator.vibrate([150]);
        }
      }
    } catch (e) {
      console.warn('Audio feedback failed:', e);
    }
  };

  // Synthesize a highly realistic dual-phase mechanical camera shutter click ("ch-click")
  const playShutterSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const playClick = (time: number, duration: number, peakGain: number) => {
        // Create 1-channel buffer of white noise
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        
        const noiseNode = ctx.createBufferSource();
        noiseNode.buffer = buffer;
        
        // Metallic filter to mimic metal shutter blades
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1400, time);
        filter.Q.setValueAtTime(3, time);
        
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(peakGain, time);
        gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration - 0.005);
        
        noiseNode.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        noiseNode.start(time);
        noiseNode.stop(time + duration);
      };

      const now = ctx.currentTime;
      // Phase 1: Shutter open click
      playClick(now, 0.05, 0.35);
      // Phase 2: Shutter close click after a very short mechanical delay (60ms)
      playClick(now + 0.06, 0.08, 0.28);
    } catch (e) {
      console.warn('Shutter sound failed:', e);
    }
  };

// Fullscreen forced request removed per user preference.

  // Synchronously stop active camera tracks and scan loop to prevent device lag when picking or scanning an image
  const stopLiveCamera = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch (e) {}
    }
    setIsTorchOn(false);
  };

  const openImagePicker = () => {
    if (pickerCancelTimerRef.current !== null) {
      window.clearTimeout(pickerCancelTimerRef.current);
      pickerCancelTimerRef.current = null;
    }
    filePickOpenedRef.current = true;
    stopLiveCamera();
    setIsPickingImage(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    } else {
      filePickOpenedRef.current = false;
      setIsPickingImage(false);
    }
  };

  // Resume camera if user closes the OS file explorer / photo picker without choosing an image
  useEffect(() => {
    const inputEl = fileInputRef.current;

    const handlePickerCancel = () => {
      if (pickerCancelTimerRef.current !== null) {
        window.clearTimeout(pickerCancelTimerRef.current);
        pickerCancelTimerRef.current = null;
      }
      if (filePickOpenedRef.current) {
        filePickOpenedRef.current = false;
        setIsPickingImage(false);
      }
    };

    const handleWindowFocus = () => {
      if (!filePickOpenedRef.current) return;
      if (pickerCancelTimerRef.current !== null) {
        window.clearTimeout(pickerCancelTimerRef.current);
      }
      pickerCancelTimerRef.current = window.setTimeout(() => {
        pickerCancelTimerRef.current = null;
        if (filePickOpenedRef.current && (!fileInputRef.current?.files || fileInputRef.current.files.length === 0)) {
          filePickOpenedRef.current = false;
          setIsPickingImage(false);
        }
      }, 650);
    };

    inputEl?.addEventListener('cancel', handlePickerCancel);
    window.addEventListener('focus', handleWindowFocus);
    return () => {
      inputEl?.removeEventListener('cancel', handlePickerCancel);
      window.removeEventListener('focus', handleWindowFocus);
      if (pickerCancelTimerRef.current !== null) {
        window.clearTimeout(pickerCancelTimerRef.current);
        pickerCancelTimerRef.current = null;
      }
    };
  }, [isOpen]);

  // Reset and start camera scanner whenever modal/page is opened
  useEffect(() => {
    if (isOpen) {
      filePickOpenedRef.current = false;
      setIsPickingImage(false);
      setIsScanning(autoStart);
      setScannedRegResult(null);
      setCameraError('');
      setCurrentLog(null);
      setVerificationNotes('');
      setShowNotesSection(false);
      setUploadedImageSrc(null);
      setCapturedFrameSrc(null);
      setIsProcessingScan(false);
      setCroppedQrSrc(null);
      setQrMotionOffset({ x: 0, y: 0, scale: 1 });
      setIsBackgroundRemoved(false);
      setScannedVerificationState('idle');
      setIsLocked(false);
    }
  }, [isOpen, autoStart]);

  // Helper function to auto-create and save verification log immediately upon QR match/search
  const autoSaveLog = (foundReg: MotorcycleRegistration, initialNotes?: string) => {
    const isPass = foundReg.status === 'printed' || foundReg.status === 'approved';
    const logId = `LOG-${Math.floor(100000 + Math.random() * 900000)}`;
    const noteText =
      initialNotes !== undefined
        ? initialNotes
        : isPass
        ? 'QR permit scan verified.'
        : 'Unapproved vehicle permit scanned.';

    const newLog: VerificationLog = {
      id: logId,
      scannedAt: getTodayEthiopianDateTimeIso(),
      plateNumber: foundReg.plateNumber,
      fullName: foundReg.fullName,
      phone: foundReg.phone,
      vehicleCategory: foundReg.vehicleCategory,
      engineOrSerialNo: foundReg.engineOrSerialNo,
      permitStatus: foundReg.status,
      verificationStatus: isPass ? 'verified' : 'warning',
      officerNotes: noteText,
      officerBadgeId: userBadgeId || 'OFF-8842',
      locationName: 'Field Checkpoint Scan',
      userPortraitPhoto: foundReg.userPortraitPhoto || (foundReg as any).userPortraitThumbnail || foundReg.nationalIdPhoto,
      nationalIdPhoto: foundReg.nationalIdPhoto,
      drivingLicensePhoto:
        foundReg.drivingLicensePhoto ||
        (foundReg as any).driving_license_photo ||
        (foundReg as any).driverLicensePhoto ||
        (foundReg as any).licensePhoto ||
        '',
      drivingPermitPhoto:
        foundReg.drivingPermitPhoto ||
        (foundReg as any).driving_permit_photo ||
        (foundReg as any).policePermitPhoto ||
        (foundReg as any).policePermit ||
        '',
    };

    setCurrentLog(newLog);
    setVerificationNotes(noteText);

    if (onAddVerificationLog) {
      onAddVerificationLog(newLog, false);
    }
    return newLog;
  };

  // Live update the existing log whenever officer types or updates notes
  const handleNoteChange = (newNotes: string) => {
    setVerificationNotes(newNotes);
    if (currentLog && onAddVerificationLog) {
      const updatedLog: VerificationLog = {
        ...currentLog,
        officerNotes: newNotes,
        scannedAt: getTodayEthiopianDateTimeIso(),
      };
      setCurrentLog(updatedLog);
      onAddVerificationLog(updatedLog, true);
    }
  };

  // Flip camera between front and rear facing mode
  const handleFlipCamera = () => {
    setIsTorchOn(false);
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Toggle flash/torch on active video track
  const handleToggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) {
      try {
        const nextState = !isTorchOn;
        await (track as any).applyConstraints({
          advanced: [{ torch: nextState }]
        });
        setIsTorchOn(nextState);
      } catch (e) {
        console.warn('Torch constraint not supported on this device/browser:', e);
      }
    }
  };

  // Live Camera QR Scan Loop via high-performance fast pipeline
  useEffect(() => {
    let active = true;
    let pipeline = createFastScannerPipeline();

    if (isOpen && isScanning && searchMode === 'camera' && !scannedRegResult && !uploadedImageSrc && !isPickingImage) {
      setCameraError('');

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(isAmharic ? 'ካሜራ በዚህ አሳሽ አይደገፍም' : 'Camera is not supported on this browser or device.');
        return;
      }

      // Request optimal HD camera stream for razor-sharp QR detection
      navigator.mediaDevices
        .getUserMedia(getOptimalCameraConstraints(facingMode))
        .catch(() => {
          // Fallback to baseline constraints if HD constraints fail
          return navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: facingMode } },
            audio: false,
          });
        })
        .then((stream) => {
          if (!active) {
            stream.getTracks().forEach((track) => track.stop());
            pipeline.destroy();
            return;
          }
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
          }

          let isScanningFrame = false;
          const scanFrame = async () => {
            if (!active) return;
            const video = videoRef.current;
            if (
              video &&
              video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
              !isScanningFrame &&
              !isProcessingRef.current
            ) {
              isScanningFrame = true;
              try {
                const detected = await pipeline.scanVideoFrame(video);
                if (detected && detected.rawValue && active) {
                  isProcessingRef.current = true;
                  
                  if (detected.boundingBox && video.videoWidth && video.videoHeight) {
                    const sessionAtDetect = scanSessionRef.current;
                    setIsLocked(true);
                    playShutterSound();
                    const initialOffset = computeQrInitialOffset(detected.boundingBox, video.videoWidth, video.videoHeight);
                    setQrMotionOffset(initialOffset);
                    const croppedSrc = captureCroppedQr(video, detected.boundingBox, video.videoWidth, video.videoHeight);
                    if (croppedSrc) {
                      setCroppedQrSrc(croppedSrc);
                      // Fade out live background immediately as cutout glides cleanly from its detected spot to reticle center
                      setIsBackgroundRemoved(true);
                    }

                    const lookupPromise = lookupRegistrationInDb(
                      detected.rawValue.trim(),
                      registrations
                    ).catch(() => null);

                    try {
                      video.pause();
                    } catch (e) {}

                    // Paced scanning: allow laser line to sweep across the docked QR code before displaying status-colored verification
                    setTimeout(async () => {
                      if (!active || scanSessionRef.current !== sessionAtDetect) return;
                      const prefetchedMatch = await lookupPromise;
                      if (!active || scanSessionRef.current !== sessionAtDetect) return;
                      const visualStatus = resolveVerificationVisualStatus(prefetchedMatch);
                      setScannedVerificationState(visualStatus);
                      playScanFeedback(visualStatus === 'approved');
                      setTimeout(() => {
                        if (active && scanSessionRef.current === sessionAtDetect) {
                          active = false;
                          isProcessingRef.current = false;
                          processQRData(detected.rawValue, undefined, prefetchedMatch, true);
                        }
                      }, 900);
                    }, 2600);
                  } else {
                    setIsLocked(true);
                    setTimeout(() => {
                      if (active) {
                        active = false;
                        isProcessingRef.current = false;
                        processQRData(detected.rawValue);
                      }
                    }, 2500);
                  }
                  return;
                }
              } catch (e) {
                // Ignore transient frame scan glitches
              } finally {
                isScanningFrame = false;
              }
            }
            if (active) {
              animFrameRef.current = requestAnimationFrame(scanFrame);
            }
          };

          animFrameRef.current = requestAnimationFrame(scanFrame);
        })
        .catch((err) => {
          if (!active) return;
          let msg = err?.message || 'Camera error';
          if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError' || msg.toLowerCase().includes('permission')) {
            msg = isAmharic ? 'የካሜራ ፍቃድ ተከልክሏል' : 'Camera permission denied.';
          } else {
            msg = isAmharic ? 'ካሜራ ማግኘት አልተቻለም' : 'Camera unavailable or disconnected.';
          }
          setCameraError(msg);
        });
    }

    return () => {
      active = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        try {
          videoRef.current.pause();
          videoRef.current.srcObject = null;
        } catch (e) {}
      }
      pipeline.destroy();
    };
  }, [isOpen, isScanning, searchMode, scannedRegResult, uploadedImageSrc, isPickingImage, isAmharic, facingMode]);

  if (!isOpen) return null;

  // Capture snapshot from video element
  const captureCameraFrame = (): string | null => {
    if (!videoRef.current || videoRef.current.readyState < 2) return null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.85);
      }
    } catch (e) {
      console.warn('Failed to capture video frame snapshot:', e);
    }
    return null;
  };

  const processQRData = async (
    qrData: string,
    imageOverride?: string,
    prefetchedMatch?: MotorcycleRegistration | null,
    alreadyPlayedFeedback = false
  ) => {
    const cleanData = qrData.trim();
    if (!cleanData) return;

    setLastScannedQuery(cleanData);
    setLastScanSource(imageOverride ? 'image' : 'camera');
    setLastScanTime(getTodayEthiopianDateTimeIso());
    setIsProcessingScan(true);

    if (imageOverride) {
      setUploadedImageSrc(imageOverride);
    } else {
      const frame = captureCameraFrame();
      if (frame) {
        setCapturedFrameSrc(frame);
      }
    }

    // Perform query against both local cache and live permit database if not already resolved
    const match =
      prefetchedMatch !== undefined
        ? prefetchedMatch
        : await lookupRegistrationInDb(cleanData, registrations);

    setIsProcessingScan(false);
    if (match) {
      autoSaveLog(match);
      setScannedRegResult(match);
      setIsScanning(false);
      setScanFlash(null);
      isProcessingRef.current = false;
    } else {
      if (!alreadyPlayedFeedback) {
        playScanFeedback(false);
      }
      setScannedRegResult('not_found');
      setIsScanning(false);
      setScanFlash(null);
      isProcessingRef.current = false;
    }
  };

  const handleScanResult = (result: any) => {
    if (result && result.length > 0 && result[0].rawValue) {
      processQRData(result[0].rawValue);
    }
  };

  const handleSearchLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchPlate.trim();
    if (!query) return;

    playShutterSound();
    setLastScannedQuery(query);
    setLastScanSource('manual');
    setLastScanTime(getTodayEthiopianDateTimeIso());
    setIsProcessingScan(true);
    const found = await lookupRegistrationInDb(query, registrations);
    setIsProcessingScan(false);

    if (found) {
      setScannedRegResult(found);
      autoSaveLog(found);
      setIsScanning(false);
    } else {
      setScannedRegResult('not_found');
      setCurrentLog(null);
      setIsScanning(false);
    }
  };

  // Helper to scan HTMLImageElement for QR or Barcodes using high-speed pipeline
  const decodeQRFromImage = async (img: HTMLImageElement): Promise<ScanDetectionResult | null> => {
    const pipeline = createFastScannerPipeline();
    try {
      const result = await pipeline.decodeImage(img);
      return result || null;
    } finally {
      pipeline.destroy();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    filePickOpenedRef.current = false;
    if (pickerCancelTimerRef.current !== null) {
      window.clearTimeout(pickerCancelTimerRef.current);
      pickerCancelTimerRef.current = null;
    }
    setIsPickingImage(false);

    const file = e.target.files?.[0];
    if (!file) return;

    stopLiveCamera();
    const sessionAtUpload = ++scanSessionRef.current;

    // Synchronously set object URL for instant 0ms preview & immediate scanning animation
    const instantPreviewUrl = URL.createObjectURL(file);
    setUploadedImageSrc((prev) => {
      if (prev && prev.startsWith('blob:')) {
        URL.revokeObjectURL(prev);
      }
      return instantPreviewUrl;
    });
    setCapturedFrameSrc(null);
    setIsScanning(true);
    setScannedRegResult(null);
    setIsProcessingScan(true);
    isProcessingRef.current = true;
    setIsLocked(false);
    setCroppedQrSrc(null);
    setScannedVerificationState('idle');

    const img = new Image();
    img.onload = async () => {
      const detected = await decodeQRFromImage(img);
      if (scanSessionRef.current !== sessionAtUpload) return;

      if (detected && detected.rawValue) {
        const origW = img.naturalWidth || img.width;
        const origH = img.naturalHeight || img.height;

        if (detected.boundingBox && origW && origH) {
          setIsLocked(true);
          playShutterSound();
          const initialOffset = computeQrInitialOffset(detected.boundingBox, origW, origH);
          setQrMotionOffset(initialOffset);
          const croppedSrc = captureCroppedQr(img, detected.boundingBox, origW, origH);
          if (croppedSrc) {
            setCroppedQrSrc(croppedSrc);
            setIsBackgroundRemoved(true);
          }

          const lookupPromise = lookupRegistrationInDb(
            detected.rawValue.trim(),
            registrations
          ).catch(() => null);

          // Paced scanning: allow laser line to sweep across the docked QR code before displaying status-colored verification
          setTimeout(async () => {
            if (scanSessionRef.current !== sessionAtUpload) return;
            const prefetchedMatch = await lookupPromise;
            if (scanSessionRef.current !== sessionAtUpload) return;
            const visualStatus = resolveVerificationVisualStatus(prefetchedMatch);
            setScannedVerificationState(visualStatus);
            playScanFeedback(visualStatus === 'approved');
            setTimeout(() => {
              if (scanSessionRef.current === sessionAtUpload) {
                isProcessingRef.current = false;
                processQRData(detected.rawValue, instantPreviewUrl, prefetchedMatch, true);
              }
            }, 900);
          }, 2600);
        } else {
          setIsLocked(true);
          setTimeout(() => {
            if (scanSessionRef.current === sessionAtUpload) {
              isProcessingRef.current = false;
              processQRData(detected.rawValue, instantPreviewUrl);
            }
          }, 2500);
        }
      } else {
        setTimeout(() => {
          if (scanSessionRef.current !== sessionAtUpload) return;
          setIsProcessingScan(false);
          playScanFeedback(false);
          setScanFlash('not_found');
          setTimeout(() => {
            if (scanSessionRef.current !== sessionAtUpload) return;
            setLastScannedQuery('');
            setLastScanSource('image');
            setLastScanTime(getTodayEthiopianDateTimeIso());
            setScannedRegResult('not_found');
            setIsScanning(false);
            setScanFlash(null);
            isProcessingRef.current = false;
          }, 450);
        }, 600);
      }
    };
    img.src = instantPreviewUrl;

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleStartCameraScan = () => {
    scanSessionRef.current += 1;
    filePickOpenedRef.current = false;
    setIsPickingImage(false);
    setCameraError('');
    setIsScanning(true);
    setUploadedImageSrc((prev) => {
      if (prev && prev.startsWith('blob:')) {
        URL.revokeObjectURL(prev);
      }
      return null;
    });
    setCapturedFrameSrc(null);
    setIsProcessingScan(false);
    setScannedRegResult(null);
    setCroppedQrSrc(null);
    setQrMotionOffset({ x: 0, y: 0, scale: 1 });
    setIsBackgroundRemoved(false);
    setScannedVerificationState('idle');
    setIsLocked(false);
  };

  const handleRescan = () => {
    scanSessionRef.current += 1;
    filePickOpenedRef.current = false;
    setIsPickingImage(false);
    setScannedRegResult(null);
    setCurrentLog(null);
    setSearchPlate('');
    setLastScannedQuery('');
    setLastScanTime('');
    setVerificationNotes('');
    setShowNotesSection(false);
    setCarouselModal(null);
    setUploadedImageSrc((prev) => {
      if (prev && prev.startsWith('blob:')) {
        URL.revokeObjectURL(prev);
      }
      return null;
    });
    setCapturedFrameSrc(null);
    setIsProcessingScan(false);
    setCroppedQrSrc(null);
    setQrMotionOffset({ x: 0, y: 0, scale: 1 });
    setIsBackgroundRemoved(false);
    setScannedVerificationState('idle');
    setIsLocked(false);
    if (searchMode === 'camera') {
      handleStartCameraScan();
    }
  };

  const mainCardContent = (
    <>
      {/* Hidden File Input for Image Scanning */}
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
      />

      {!scannedRegResult ? (
        <div className="flex-grow flex-1 flex flex-col min-h-0 justify-between gap-0 overflow-hidden h-full max-h-full w-full relative">
          {/* Camera View Box - Flex-grow container for full height camera feed */}
          <div className="relative bg-slate-950 rounded-none w-full flex-grow flex-1 min-h-0 overflow-hidden flex flex-col items-center justify-center border-0">
            {isScanning ? (
              <div ref={cameraContainerRef} className="absolute inset-0 w-full h-full flex items-center justify-center bg-slate-950 overflow-hidden">
                {/* Full background camera feed/image: fades cleanly as extracted QR glides to center */}
                <div
                  className={`absolute inset-0 w-full h-full transition-opacity duration-300 ease-out ${
                    isBackgroundRemoved ? 'opacity-0 pointer-events-none' : 'opacity-100'
                  }`}
                >
                  {uploadedImageSrc ? (
                    <img
                      src={uploadedImageSrc}
                      alt="Uploaded QR Image"
                      className="absolute inset-0 w-full h-full object-cover bg-slate-950"
                    />
                  ) : capturedFrameSrc ? (
                    <img
                      src={capturedFrameSrc}
                      alt="Captured Camera Frame"
                      className="absolute inset-0 w-full h-full object-cover bg-slate-950"
                    />
                  ) : (
                    <video 
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}

                  {/* Dark Vignette Overlay for Camera Feed */}
                  <div className="absolute inset-0 bg-black/25 pointer-events-none z-0" />
                </div>

                {/* Top Active Scanning Status Badge */}
                {isProcessingScan && !uploadedImageSrc && !croppedQrSrc && (
                  <div className="absolute top-16 z-30 flex items-center gap-2 bg-primary/90 px-4 py-1.5 rounded-full text-on-primary font-extrabold text-xs sm:text-sm shadow-xl border border-primary/40 backdrop-blur-md">
                    <Icon className="material-symbols-outlined text-icon-md animate-spin">progress_activity</Icon>
                    <span>
                      {isAmharic ? 'QR ኮድ በመተንተን እና በመቃኘት ላይ...' : 'Capturing & Processing QR Code...'}
                    </span>
                  </div>
                )}

                {/* Custom Live Scanner Overlay UI - Full screen viewfinder & bottom controls */}
                <div className="absolute inset-0 pointer-events-none flex flex-col justify-between overflow-hidden z-10">
                  {/* TOP SEARCH POPUP (Only shown when Search by Plate is toggled) */}
                  <div className="w-full flex flex-col pt-3 px-4 sm:px-6 z-30 shrink-0 min-h-[10px]">
                    <AnimatePresence>
                      {showTopMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: -6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -6, scale: 0.98 }}
                          transition={POPOVER_TRANSITION}
                          className="pointer-events-auto w-full max-w-md mx-auto bg-slate-900/95 border border-slate-700/80 rounded-xl shadow-2xl p-3 text-white backdrop-blur-xl"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                              <Icon className="material-symbols-outlined text-icon-md text-primary">search</Icon>
                              <span>{isAmharic ? 'በሰሌዳ ቁጥር ወይም በስም ፈልግ' : 'Search by Plate No or Owner Name'}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowTopMenu(false)}
                              className="text-slate-400 hover:text-white w-9 h-9 flex items-center justify-center rounded-lg transition-colors cursor-pointer touch-manipulation"
                              aria-label={isAmharic ? 'ዝጋ' : 'Close'}
                            >
                              <Icon className="material-symbols-outlined text-icon-md">close</Icon>
                            </button>
                          </div>
                          <form
                            onSubmit={(e) => {
                              handleSearchLookup(e);
                              setShowTopMenu(false);
                            }}
                            className="flex gap-2 items-center"
                          >
                            <div className="relative flex-1">
                              <div className="absolute inset-y-0 left-3 flex items-center justify-center pointer-events-none text-slate-400">
                                <Icon className="material-symbols-outlined text-icon-md">search</Icon>
                              </div>
                              <input
                                type="text"
                                value={searchPlate}
                                onChange={(e) => setSearchPlate(e.target.value)}
                                placeholder={isAmharic ? 'የሰሌዳ ቁጥር ወይም ስም ያስገቡ...' : 'Enter Plate No or Name...'}
                                className="w-full min-h-[44px] md:min-h-[var(--ui-control-h-md)] bg-slate-800 border border-slate-700 rounded-md pl-10 pr-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary shadow-xs"
                                autoFocus
                              />
                            </div>
                            <motion.button
                              type="submit"
                              data-motion-control="true"
                              whileTap={TAP_SCALE}
                              transition={TACTILE_SPRING}
                              className="min-h-[44px] md:min-h-[var(--ui-control-h-md)] bg-primary hover:bg-primary-hover text-on-primary font-bold text-xs sm:text-sm px-3.5 py-2 rounded-md transition-colors cursor-pointer flex items-center gap-1 shrink-0 shadow-xs touch-manipulation"
                            >
                              <Icon className="material-symbols-outlined text-icon-md">search</Icon>
                              <span>{isAmharic ? 'ፈልግ' : 'Search'}</span>
                            </motion.button>
                          </form>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* 2. CENTER VIEWFINDER (Flex-grow adaptive reticle container) */}
                  <div className="flex-grow min-h-0 flex flex-col items-center justify-center my-auto pointer-events-none py-1 z-20">
                    {(() => {
                      const isQrInView = isLocked || Boolean(croppedQrSrc);
                      const cornerColorClass =
                        scannedVerificationState === 'approved'
                          ? 'border-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.9)]'
                          : scannedVerificationState === 'pending' || scannedVerificationState === 'expired'
                          ? 'border-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.9)]'
                          : scannedVerificationState === 'rejected' || scannedVerificationState === 'not_found'
                          ? 'border-rose-500 shadow-[0_0_16px_rgba(244,63,94,0.9)]'
                          : isQrInView
                          ? 'border-white shadow-[0_0_18px_rgba(255,255,255,0.95)]'
                          : 'border-white/85 shadow-[0_0_8px_rgba(255,255,255,0.45)]';
                      const cornerPulseAnimation =
                        isQrInView && scannedVerificationState === 'idle'
                          ? { scale: [1, 1.16, 1], opacity: [0.85, 1, 0.85] }
                          : { scale: 1, opacity: 1 };
                      const cornerPulseTransition =
                        isQrInView && scannedVerificationState === 'idle'
                          ? { duration: 0.72, ease: 'easeInOut' as const, repeat: Infinity }
                          : { duration: 0.2, ease: 'easeOut' as const };

                      return (
                        <div
                          ref={viewfinderReticleRef}
                          className={`relative w-56 h-56 xs:w-64 xs:h-64 sm:w-80 sm:h-80 max-w-[75vw] max-h-[42vh] sm:max-h-[48vh] border rounded-none shrink-0 transition-colors duration-200 ${
                            isQrInView ? 'border-white/60' : 'border-white/30'
                          }`}
                          style={{ boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.42)' }}
                        >
                          {/* Inside scanner box: Extracted QR Code glides smoothly from detected coordinates to center */}
                          {croppedQrSrc && (
                            <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-4 z-20 pointer-events-none">
                              <motion.div
                                key={croppedQrSrc}
                                initial={{
                                  x: qrMotionOffset.x,
                                  y: qrMotionOffset.y,
                                  scale: qrMotionOffset.scale,
                                  opacity: 0.92,
                                }}
                                animate={{
                                  x: 0,
                                  y: 0,
                                  scale: 1,
                                  opacity: 1,
                                }}
                                transition={{
                                  duration: 0.42,
                                  ease: [0.22, 1, 0.36, 1],
                                }}
                                style={{
                                  willChange: 'transform, opacity',
                                  backfaceVisibility: 'hidden',
                                }}
                                className="w-full h-full flex items-center justify-center"
                              >
                                <img
                                  src={croppedQrSrc}
                                  alt="Extracted QR Code"
                                  className="w-full h-full object-contain rounded-sm shadow-md"
                                />
                              </motion.div>
                            </div>
                          )}

                          {/* Scanning Beam: Solid horizontal line followed by matching transparent gradient trail */}
                          {scannedVerificationState === 'idle' && (
                            <div className="absolute inset-1.5 overflow-hidden pointer-events-none z-30">
                              <motion.div
                                className="relative w-full h-full"
                                animate={{ y: ['1%', '98%', '1%'] }}
                                transition={{
                                  duration: 2.2,
                                  times: [0, 0.5, 1],
                                  ease: 'easeInOut',
                                  repeat: Infinity,
                                }}
                              >
                                <div className="relative w-full h-[2.5px] bg-white shadow-[0_0_12px_rgba(255,255,255,0.85)]">
                                  {/* Trailing gradient wake above bar during downward sweep */}
                                  <motion.div
                                    className="absolute bottom-full inset-x-0 h-12 bg-gradient-to-t from-white/35 via-white/10 to-transparent pointer-events-none"
                                    animate={{ opacity: [0.15, 1, 1, 0, 0, 0.15] }}
                                    transition={{
                                      duration: 2.2,
                                      times: [0, 0.08, 0.44, 0.5, 0.94, 1],
                                      ease: 'easeInOut',
                                      repeat: Infinity,
                                    }}
                                  />
                                  {/* Trailing gradient wake below bar during upward sweep */}
                                  <motion.div
                                    className="absolute top-full inset-x-0 h-12 bg-gradient-to-b from-white/35 via-white/10 to-transparent pointer-events-none"
                                    animate={{ opacity: [0, 0, 1, 1, 0.15] }}
                                    transition={{
                                      duration: 2.2,
                                      times: [0, 0.48, 0.56, 0.92, 1],
                                      ease: 'easeInOut',
                                      repeat: Infinity,
                                    }}
                                  />
                                </div>
                              </motion.div>
                            </div>
                          )}

                          {/* Status-Aware Verification Animation Overlay inside reticle */}
                          <AnimatePresence>
                            {scannedVerificationState !== 'idle' && (
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.16 }}
                                className={`absolute inset-0 backdrop-blur-[2px] rounded-none flex items-center justify-center z-40 ${
                                  scannedVerificationState === 'approved'
                                    ? 'bg-emerald-500/25'
                                    : scannedVerificationState === 'pending' || scannedVerificationState === 'expired'
                                    ? 'bg-amber-500/25'
                                    : 'bg-rose-500/25'
                                }`}
                              >
                                <motion.div
                                  initial={{ scale: 0.5, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  transition={TACTILE_SPRING}
                                  className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg ${
                                    scannedVerificationState === 'approved'
                                      ? 'bg-emerald-500'
                                      : scannedVerificationState === 'pending' || scannedVerificationState === 'expired'
                                      ? 'bg-amber-500'
                                      : 'bg-rose-600'
                                  }`}
                                >
                                  <Icon className="material-symbols-outlined text-icon-3xl text-white">check</Icon>
                                </motion.div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* 4 Pulsing Corner Brackets — pulse immediately when QR code enters view */}
                          <motion.div
                            animate={cornerPulseAnimation}
                            transition={cornerPulseTransition}
                            style={{ willChange: 'transform, opacity' }}
                            className={`absolute -top-1 -left-1 w-6 h-6 border-t-[4px] border-l-[4px] rounded-tl-md origin-bottom-right transition-colors duration-200 z-50 ${cornerColorClass}`}
                          />
                          <motion.div
                            animate={cornerPulseAnimation}
                            transition={cornerPulseTransition}
                            style={{ willChange: 'transform, opacity' }}
                            className={`absolute -top-1 -right-1 w-6 h-6 border-t-[4px] border-r-[4px] rounded-tr-md origin-bottom-left transition-colors duration-200 z-50 ${cornerColorClass}`}
                          />
                          <motion.div
                            animate={cornerPulseAnimation}
                            transition={cornerPulseTransition}
                            style={{ willChange: 'transform, opacity' }}
                            className={`absolute -bottom-1 -left-1 w-6 h-6 border-b-[4px] border-l-[4px] rounded-bl-md origin-top-right transition-colors duration-200 z-50 ${cornerColorClass}`}
                          />
                          <motion.div
                            animate={cornerPulseAnimation}
                            transition={cornerPulseTransition}
                            style={{ willChange: 'transform, opacity' }}
                            className={`absolute -bottom-1 -right-1 w-6 h-6 border-b-[4px] border-r-[4px] rounded-br-md origin-top-left transition-colors duration-200 z-50 ${cornerColorClass}`}
                          />
                        </div>
                      );
                    })()}
                  </div>

                  {/* 3. BOTTOM SECTION: Pinned sticky controls with safe-area bottom padding */}
                  <div className="sticky bottom-0 pointer-events-auto flex flex-col items-center w-full max-w-md mx-auto px-3 sm:px-4 pb-[max(0.75rem,env(safe-area-inset-bottom,12px))] mb-1 z-30 shrink-0 gap-1.5 sm:gap-2">
                    {/* Guide Text without background, positioned just above action buttons */}
                    <div className="text-center pointer-events-none select-none">
                      <span className="text-xs sm:text-sm font-semibold text-white/90 drop-shadow-md">
                        {croppedQrSrc
                          ? scannedVerificationState === 'approved'
                            ? isAmharic
                              ? 'ለመንቀሳቀስ የተፈቀደለት ነው!'
                              : 'Permitted to Move'
                            : scannedVerificationState === 'expired'
                            ? isAmharic
                              ? 'ፈቃድ ያልታደሰ ነው'
                              : 'Permit Expired'
                            : scannedVerificationState === 'pending'
                            ? isAmharic
                              ? 'መንቀሳቀሻ ፈቃድ በመጠበቅ ላይ ነው'
                              : 'Pending Permit'
                            : scannedVerificationState === 'rejected'
                            ? isAmharic
                              ? 'ፈቃድ ያልተሰጠው ነው'
                              : 'Permit Not Granted'
                            : scannedVerificationState === 'not_found'
                            ? isAmharic
                              ? 'ያልተመዘገበ QR ኮድ'
                              : 'Unregistered QR Code'
                            : isAmharic
                            ? 'QR ኮድ ተለይቷል - በመተንተን ላይ...'
                            : 'QR Code Detected - Verifying...'
                          : isAmharic
                          ? 'የQR ኮዱን ሳጥኑ ውስጥ ያስገቡ'
                          : 'Point camera at the QR permit code'}
                      </span>
                    </div>

                    {/* Bottom Action Buttons Row with Opaque Dark Background & Blur */}
                    <div className="w-full bg-black/80 backdrop-blur-md border border-white/15 rounded-xl p-2 sm:p-2.5 flex items-center justify-between sm:justify-evenly shadow-2xl gap-1 sm:gap-2">
                      {/* 1. Back Button */}
                      <motion.button
                        type="button"
                        data-motion-control="true"
                        whileTap={{ scale: 0.9 }}
                        transition={TACTILE_SPRING}
                        onClick={onClose}
                        className="w-11 h-11 sm:w-12 sm:h-12 min-w-[44px] min-h-[44px] rounded-full bg-white/20 hover:bg-white/30 active:bg-white/40 text-white backdrop-blur-md transition-colors touch-manipulation flex items-center justify-center shadow-lg cursor-pointer border border-white/15"
                        title={isAmharic ? 'ተመለስ' : 'Back'}
                      >
                        <Icon className="material-symbols-outlined text-icon-xl sm:text-icon-2xl">arrow_back</Icon>
                      </motion.button>

                      {/* 2. Search Button */}
                      <motion.button
                        type="button"
                        data-motion-control="true"
                        whileTap={{ scale: 0.9 }}
                        transition={TACTILE_SPRING}
                        onClick={() => setShowTopMenu(!showTopMenu)}
                        className={`w-11 h-11 sm:w-12 sm:h-12 min-w-[44px] min-h-[44px] rounded-full transition-colors touch-manipulation flex items-center justify-center shadow-lg cursor-pointer backdrop-blur-md ${
                          showTopMenu
                            ? 'bg-primary text-on-primary shadow-primary/40 ring-4 ring-primary/50'
                            : 'bg-white/20 hover:bg-white/30 active:bg-white/40 text-white'
                        }`}
                        title={isAmharic ? 'ፈልግ' : 'Search'}
                      >
                        <Icon className="material-symbols-outlined text-icon-xl sm:text-icon-2xl">search</Icon>
                      </motion.button>

                      {/* 3. Photo Gallery Upload */}
                      <motion.button
                        type="button"
                        data-motion-control="true"
                        whileTap={{ scale: 0.9 }}
                        transition={TACTILE_SPRING}
                        onClick={openImagePicker}
                        className="w-11 h-11 sm:w-12 sm:h-12 min-w-[44px] min-h-[44px] rounded-full bg-white/20 hover:bg-white/30 active:bg-white/40 text-white backdrop-blur-md transition-colors touch-manipulation flex items-center justify-center shadow-lg cursor-pointer"
                        title={isAmharic ? 'ምስል ስካን' : 'Select Photo'}
                      >
                        <Icon className="material-symbols-outlined text-icon-xl sm:text-icon-2xl">image</Icon>
                      </motion.button>

                      {/* 4. Flashlight / Torch Toggle */}
                      <motion.button
                        type="button"
                        data-motion-control="true"
                        whileTap={{ scale: 0.9 }}
                        transition={TACTILE_SPRING}
                        onClick={handleToggleTorch}
                        className={`w-11 h-11 sm:w-12 sm:h-12 min-w-[44px] min-h-[44px] rounded-full transition-colors touch-manipulation flex items-center justify-center shadow-lg cursor-pointer backdrop-blur-md ${
                          isTorchOn
                            ? 'bg-amber-400 text-amber-950 shadow-amber-400/40 ring-4 ring-amber-300/60'
                            : 'bg-white/20 hover:bg-white/30 active:bg-white/40 text-white'
                        }`}
                        title={isAmharic ? 'ፍላሽ' : 'Flashlight'}
                      >
                        <Icon className="material-symbols-outlined text-icon-xl sm:text-icon-2xl">
                          {isTorchOn ? 'flashlight_on' : 'flashlight_off'}
                        </Icon>
                      </motion.button>

                      {/* 5. Switch Camera (Front/Rear) */}
                      <motion.button
                        type="button"
                        data-motion-control="true"
                        whileTap={{ scale: 0.9 }}
                        transition={TACTILE_SPRING}
                        onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
                        className="w-11 h-11 sm:w-12 sm:h-12 min-w-[44px] min-h-[44px] rounded-full bg-white/20 hover:bg-white/30 active:bg-white/40 text-white backdrop-blur-md transition-colors touch-manipulation flex items-center justify-center shadow-lg cursor-pointer"
                        title={isAmharic ? 'ካሜራ ቀይር' : 'Switch Camera'}
                      >
                        <Icon className="material-symbols-outlined text-icon-xl sm:text-icon-2xl">cameraswitch</Icon>
                      </motion.button>
                    </div>
                  </div>
                </div>


                {/* Camera Error & Permission Denied UI */}
                <AnimatePresence>
                  {cameraError && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.16 }}
                      className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center z-40 space-y-4 pointer-events-auto"
                    >
                      <div className="w-16 h-16 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shadow-lg">
                        <Icon className="material-symbols-outlined text-[length:calc(36px*var(--ui-scale))]">videocam_off</Icon>
                      </div>
                      <div className="space-y-1 max-w-sm">
                        <h4 className="text-white font-black text-sm">
                          {isAmharic ? 'የካሜራ ችግር ተፈጥሯል' : 'Camera Unavailable'}
                        </h4>
                        <p className="text-rose-300/90 text-xs font-medium leading-relaxed">{cameraError}</p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                        <motion.button
                          type="button"
                          data-motion-control="true"
                          whileTap={TAP_SCALE}
                          transition={TACTILE_SPRING}
                          onClick={handleStartCameraScan}
                          className="min-h-[44px] md:min-h-[var(--ui-control-h-md)] bg-primary hover:bg-primary-hover text-on-primary px-4 py-2.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-md flex items-center gap-1.5 touch-manipulation"
                        >
                          <Icon className="material-symbols-outlined text-icon-sm">refresh</Icon>
                          <span>{isAmharic ? 'እንደገና ሞክር' : 'Retry Camera'}</span>
                        </motion.button>
                        <motion.button
                          type="button"
                          data-motion-control="true"
                          whileTap={SUBTLE_TAP_SCALE}
                          transition={TACTILE_SPRING}
                          onClick={openImagePicker}
                          className="min-h-[44px] md:min-h-[var(--ui-control-h-md)] bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-lg text-xs font-bold cursor-pointer transition-colors border border-slate-700 flex items-center gap-1.5 touch-manipulation"
                        >
                          <Icon className="material-symbols-outlined text-icon-sm">image</Icon>
                          <span>{isAmharic ? 'ምስል ስካን' : 'Select Photo'}</span>
                        </motion.button>
                        <motion.button
                          type="button"
                          data-motion-control="true"
                          whileTap={SUBTLE_TAP_SCALE}
                          transition={TACTILE_SPRING}
                          onClick={() => setShowTopMenu(true)}
                          className="min-h-[44px] md:min-h-[var(--ui-control-h-md)] bg-slate-800 hover:bg-slate-700 text-amber-400 px-4 py-2.5 rounded-lg text-xs font-bold cursor-pointer transition-colors border border-slate-700 flex items-center gap-1.5 touch-manipulation"
                        >
                          <Icon className="material-symbols-outlined text-icon-sm">search</Icon>
                          <span>{isAmharic ? 'በሰሌዳ ፈልግ' : 'Search by Plate'}</span>
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="space-y-2 p-3 w-full max-w-md mx-auto flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
                  <Icon className="material-symbols-outlined text-[length:calc(28px*var(--ui-scale))] animate-pulse">
                    qr_code_scanner
                  </Icon>
                </div>
                <h4 className="text-xs font-bold text-slate-100">
                  {isAmharic ? 'የQR ኮድ ፍተሻ' : 'QR Verification'}
                </h4>
                <div className="grid grid-cols-2 gap-2 w-full pt-0.5">
                  <motion.button
                    type="button"
                    data-motion-control="true"
                    whileTap={TAP_SCALE}
                    transition={TACTILE_SPRING}
                    onClick={handleStartCameraScan}
                    className="min-h-[44px] md:min-h-[var(--ui-control-h-md)] bg-primary hover:bg-primary-hover text-on-primary px-3 py-2 rounded-md text-xs font-bold cursor-pointer transition-colors flex items-center justify-center gap-1.5 shadow-xs touch-manipulation"
                  >
                    <Icon className="material-symbols-outlined text-icon-md">photo_camera</Icon>
                    <span>{isAmharic ? 'ካሜራ' : 'Camera'}</span>
                  </motion.button>
                  <motion.button
                    type="button"
                    data-motion-control="true"
                    whileTap={SUBTLE_TAP_SCALE}
                    transition={TACTILE_SPRING}
                    onClick={openImagePicker}
                    className="min-h-[44px] md:min-h-[var(--ui-control-h-md)] bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-md text-xs font-bold cursor-pointer transition-colors flex items-center justify-center gap-1.5 border border-slate-700 touch-manipulation"
                  >
                    <Icon className="material-symbols-outlined text-icon-md">image</Icon>
                    <span>{isAmharic ? 'ምስል ስካን' : 'Image Scan'}</span>
                  </motion.button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : scannedRegResult === 'not_found' ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
          className={`flex-1 min-h-0 w-full ${activeTheme.containerBg} p-0 m-0 text-xs sm:text-sm flex flex-col h-full max-h-full overflow-hidden shadow-none`}
        >
          {(() => {
            const canReportUnregistered =
              Boolean(onReportUnregistered) && isTaskViewable(userRole, 7);
            const scanMethodLabel =
              lastScanSource === 'manual'
                ? isAmharic
                  ? 'በሰሌዳ / መለያ ፍለጋ'
                  : 'Manual Lookup'
                : lastScanSource === 'image'
                ? isAmharic
                  ? 'ምስል ስካን'
                  : 'Image Scan'
                : isAmharic
                ? 'ካሜራ QR ስካን'
                : 'Camera QR Scan';
            const checkedTimestamp = lastScanTime || getTodayEthiopianDateTimeIso();

            return (
              <>
                {/* 1. TOP VERIFICATION STATUS HEADER BAR */}
                <div
                  className={`flex items-center justify-between py-2 sm:py-3 px-2.5 sm:px-4 shrink-0 border-b-2 z-10 shadow-sm transition-colors duration-200 gap-2 ${activeTheme.headerRejected}`}
                >
                  <motion.button
                    type="button"
                    data-motion-control="true"
                    whileTap={TAP_SCALE}
                    transition={TACTILE_SPRING}
                    onClick={handleRescan}
                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg bg-white/20 hover:bg-white/30 text-white touch-manipulation transition-colors cursor-pointer flex items-center justify-center shrink-0 shadow-sm border border-white/40"
                    title={isAmharic ? 'ድጋሚ ቃኝ' : 'Rescan'}
                    aria-label={isAmharic ? 'ድጋሚ ቃኝ' : 'Rescan'}
                  >
                    <Icon className="material-symbols-outlined text-icon-xl sm:text-icon-2xl font-bold">
                      chevron_left
                    </Icon>
                  </motion.button>

                  <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-center">
                    <Icon className="material-symbols-outlined text-icon-lg sm:text-[length:calc(26px*var(--ui-scale))] text-white shrink-0">
                      gpp_bad
                    </Icon>
                    <span className="font-black text-xs sm:text-base md:text-lg tracking-tight text-white truncate text-center">
                      {isAmharic ? 'ያልተመዘገበ የሞተር ፈቃድ' : 'Motor Permit Unregistered'}
                    </span>
                  </div>

                  <motion.button
                    type="button"
                    data-motion-control="true"
                    whileTap={TAP_SCALE}
                    transition={TACTILE_SPRING}
                    onClick={onClose}
                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg bg-white/20 hover:bg-white/30 text-white touch-manipulation transition-colors cursor-pointer flex items-center justify-center shrink-0 shadow-sm border border-white/40"
                    title={isAmharic ? 'ዝጋ' : 'Close'}
                    aria-label={isAmharic ? 'ዝጋ' : 'Close'}
                  >
                    <Icon className="material-symbols-outlined text-icon-xl sm:text-icon-2xl font-bold">
                      close
                    </Icon>
                  </motion.button>
                </div>

                {/* 2. SCROLLABLE VERDICT & RECOVERY BODY */}
                <div
                  className={`flex-1 overflow-y-auto overscroll-contain min-h-0 ${activeTheme.bodyBg}`}
                >
                  <div className="max-w-2xl mx-auto w-full p-2.5 sm:p-4 space-y-3 sm:space-y-3.5">
                    {/* Primary Verdict Surface */}
                    <section
                      className={`${activeTheme.ownerCardBg || activeTheme.cardBg} border rounded-xl p-3.5 sm:p-4.5 shadow-xs`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                        <div
                          className={`w-13 h-13 sm:w-14 sm:h-14 rounded-lg flex items-center justify-center shrink-0 border ${
                            isAlwaysDarkScannerTheme
                              ? 'bg-rose-500/20 border-rose-400/35 text-rose-300'
                              : isAlwaysLightScannerTheme
                              ? 'bg-rose-50 border-rose-200 text-rose-600'
                              : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          <Icon className="material-symbols-outlined text-[length:calc(30px*var(--ui-scale))]">
                            no_accounts
                          </Icon>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div
                            className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-11 font-bold ${activeTheme.labelText}`}
                          >
                            <span>
                              {isAmharic ? 'የሞተር ፈቃድ ሁኔታ' : 'Motor Permit Status'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {checkedTimestamp}
                            </span>
                          </div>

                          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <h2
                              className={`text-lg sm:text-xl font-black tracking-tight text-balance ${activeTheme.headingText}`}
                            >
                              {isAmharic ? 'ያልተመዘገበ' : 'UNREGISTERED'}
                            </h2>
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-extrabold ${scannerSemanticRejectedText}`}
                            >
                              <Icon className="material-symbols-outlined text-icon-sm shrink-0">
                                error_outline
                              </Icon>
                              <span>
                                {isAmharic ? 'በመዝገብ ውስጥ አልተገኘም' : 'No Matching Permit'}
                              </span>
                            </span>
                          </div>

                          <p
                            className={`mt-1 text-xs leading-relaxed ${activeTheme.labelText}`}
                          >
                            {isAmharic
                              ? 'የቃኙት QR ኮድ ወይም ያስገቡት መለያ በማህበሩ መዝገብ ውስጥ አልተገኘም።'
                              : 'No matching permit record was found in the association registry.'}
                          </p>
                        </div>
                      </div>

                      {/* Hairline-Divided Query Telemetry Strip */}
                      <div className={`mt-3.5 pt-3.5 border-t ${scannerHairlineBorder} grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3.5`}>
                        <div className="min-w-0">
                          <span
                            className={`text-2xs font-extrabold block ${activeTheme.labelText}`}
                          >
                            {isAmharic ? 'የተፈተሸ መረጃ' : 'Checked Input'}
                          </span>
                          <span
                            className={`mt-0.5 text-xs font-black font-mono tabular-nums block truncate ${activeTheme.valueText}`}
                            title={lastScannedQuery || undefined}
                          >
                            {lastScannedQuery ||
                              (isAmharic ? 'ያልተነበበ QR' : 'Unreadable QR')}
                          </span>
                        </div>

                        <div className={`min-w-0 ${scannerHairlineBorderLeft} sm:pl-3.5`}>
                          <span
                            className={`text-2xs font-extrabold block ${activeTheme.labelText}`}
                          >
                            {isAmharic ? 'የፍተሻ ዘዴ' : 'Scan Method'}
                          </span>
                          <span
                            className={`mt-0.5 text-xs font-black block truncate ${activeTheme.valueText}`}
                          >
                            {scanMethodLabel}
                          </span>
                        </div>

                        <div className={`min-w-0 ${scannerHairlineBorderLeft} sm:pl-3.5`}>
                          <span
                            className={`text-2xs font-extrabold block ${activeTheme.labelText}`}
                          >
                            {isAmharic ? 'የመዝገብ ውጤት' : 'Registry Result'}
                          </span>
                          <span
                            className={`mt-0.5 text-xs font-black tabular-nums block ${scannerSemanticRejectedText}`}
                          >
                            {isAmharic ? '0 ተዛማጅ መዝገብ' : '0 Matches Found'}
                          </span>
                        </div>
                      </div>
                    </section>

                    {/* Inline Manual Lookup Recovery */}
                    <section
                      className={`${activeTheme.chipBg} border rounded-xl p-3.5 sm:p-4 shadow-xs space-y-2.5`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor="unregistered-manual-lookup"
                          className={`text-xs sm:text-sm font-black flex items-center gap-1.5 ${activeTheme.headingText}`}
                        >
                          <Icon
                            className={`material-symbols-outlined text-icon-md ${activeTheme.sectionIconColor}`}
                          >
                            manage_search
                          </Icon>
                          <span>
                            {isAmharic
                              ? 'በሰሌዳ ቁጥር ወይም በባለቤት ስም እንደገና ፈልግ'
                              : 'Verify Manually by Plate or Owner Name'}
                          </span>
                        </label>
                      </div>

                      <form
                        onSubmit={handleSearchLookup}
                        className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
                      >
                        <div className="relative flex-1 min-w-0">
                          <div
                            className={`absolute inset-y-0 left-3 flex items-center pointer-events-none ${activeTheme.labelText}`}
                          >
                            <Icon className="material-symbols-outlined text-icon-md">
                              search
                            </Icon>
                          </div>
                          <input
                            id="unregistered-manual-lookup"
                            type="text"
                            value={searchPlate}
                            onChange={(e) => setSearchPlate(e.target.value)}
                            placeholder={
                              isAmharic
                                ? 'የሰሌዳ ቁጥር፣ ሞተር ቁጥር ወይም ስም ያስገቡ...'
                                : 'Enter Plate No, ID, or Owner Name...'
                            }
                            className={`w-full min-h-[44px] md:min-h-[var(--ui-control-h-md)] select-text rounded-lg pl-10 pr-3 py-2 text-xs sm:text-sm border focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors ${scannerNotesInputClass}`}
                          />
                        </div>

                        <motion.button
                          type="submit"
                          data-motion-control="true"
                          whileTap={TAP_SCALE}
                          transition={TACTILE_SPRING}
                          disabled={!searchPlate.trim() || isProcessingScan}
                          className={`min-h-[44px] md:min-h-[var(--ui-control-h-md)] px-4 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation ${activeTheme.actionButton}`}
                        >
                          <Icon className="material-symbols-outlined text-icon-md">
                            search
                          </Icon>
                          <span>{isAmharic ? 'ፈልግ' : 'Lookup'}</span>
                        </motion.button>
                      </form>
                    </section>

                    {/* Municipal Copyright Footer */}
                    <div className="pt-1 pb-0.5 text-center text-2xs sm:text-11 font-medium opacity-80">
                      <p className={activeTheme.footerText}>
                        {isAmharic
                          ? '© 2016 የግንቦት 12 ባህር ዳር ሞተረኞች ማህበር ፈቃድ ቁጥጥር ስርዓት። መብቱ የተጠበቀ ነው።'
                          : '© 2026 Bahirdar Motorist Association Permit Control System. All rights reserved.'}
                      </p>
                    </div>

                    {/* Primary & Contextual Enforcement Actions */}
                    <div
                      className={`grid grid-cols-1 gap-2.5 pb-4 ${
                        canReportUnregistered
                          ? 'sm:grid-cols-3'
                          : 'sm:grid-cols-2'
                      }`}
                    >
                      <motion.button
                        type="button"
                        data-motion-control="true"
                        whileTap={TAP_SCALE}
                        transition={TACTILE_SPRING}
                        onClick={handleRescan}
                        className={`min-h-[44px] sm:min-h-[calc(46px*var(--ui-scale))] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-colors flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer touch-manipulation ${activeTheme.actionButton}`}
                      >
                        <Icon className="material-symbols-outlined text-icon-md">
                          qr_code_scanner
                        </Icon>
                        <span>{isAmharic ? 'ድጋሚ ቃኝ' : 'Rescan QR'}</span>
                      </motion.button>

                      <motion.button
                        type="button"
                        data-motion-control="true"
                        whileTap={SUBTLE_TAP_SCALE}
                        transition={TACTILE_SPRING}
                        onClick={openImagePicker}
                        className={`min-h-[44px] sm:min-h-[calc(46px*var(--ui-scale))] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer touch-manipulation border shadow-xs ${scannerSecondaryButtonSurface}`}
                      >
                        <Icon className="material-symbols-outlined text-icon-md">
                          image
                        </Icon>
                        <span>{isAmharic ? 'ምስል ስካን' : 'Scan Image'}</span>
                      </motion.button>

                      {canReportUnregistered && (
                        <motion.button
                          type="button"
                          data-motion-control="true"
                          whileTap={TAP_SCALE}
                          transition={TACTILE_SPRING}
                          onClick={() => onReportUnregistered?.(lastScannedQuery)}
                          className="min-h-[44px] sm:min-h-[calc(46px*var(--ui-scale))] bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-colors flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer shadow-xs touch-manipulation"
                        >
                          <Icon className="material-symbols-outlined text-icon-md">
                            report_problem
                          </Icon>
                          <span>
                            {isAmharic ? 'ያልተመዘገበ ሪፖርት' : 'Report Vehicle'}
                          </span>
                        </motion.button>
                      )}
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
          className={`flex-1 min-h-0 w-full ${activeTheme.containerBg} p-0 m-0 text-xs sm:text-sm flex flex-col h-full max-h-full overflow-hidden shadow-none`}
        >
          {(() => {
            const statusLower = (scannedRegResult.status || '').toLowerCase();
            const isApproved = statusLower === 'approved' || statusLower === 'printed' || statusLower === 'ordered_print';
            const isExpired = statusLower === 'expired';
            const isRejected = statusLower === 'rejected';
            const isPending = !isApproved && !isRejected && !isExpired;

            const portraitUrl =
              scannedRegResult.userPortraitPhoto ||
              (isSuperAdmin ? scannedRegResult.nationalIdPhoto : '') ||
              scannedRegResult.drivingLicensePhoto ||
              scannedRegResult.drivingPermitPhoto ||
              (scannedRegResult as any).photoUrl ||
              (scannedRegResult as any).avatar ||
              `https://ui-avatars.com/api/?name=${encodeURIComponent(scannedRegResult.fullName || 'User')}&size=256&background=0284c7&color=fff&bold=true`;

            return (
              <>
                {/* TOP HEADER STATUS BAR WITH VERIFICATION BADGE */}
                <div className={`flex items-center justify-between py-2 sm:py-3 px-2.5 sm:px-4 shrink-0 border-b-2 z-10 shadow-sm transition-colors duration-200 gap-2 ${
                  isApproved 
                    ? activeTheme.headerApproved 
                    : isExpired || isPending 
                    ? activeTheme.headerPending 
                    : activeTheme.headerRejected
                }`}>
                  {/* Rescan Button on Left */}
                  <motion.button
                    type="button"
                    data-motion-control="true"
                    whileTap={TAP_SCALE}
                    transition={TACTILE_SPRING}
                    onClick={handleRescan}
                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg bg-white/20 hover:bg-white/30 text-white touch-manipulation transition-colors cursor-pointer flex items-center justify-center shrink-0 shadow-sm border border-white/40"
                    title={isAmharic ? 'ድጋሚ ቃኝ' : 'Rescan'}
                  >
                    <Icon className="material-symbols-outlined text-icon-xl sm:text-icon-2xl font-bold">chevron_left</Icon>
                  </motion.button>

                  {/* Center Verification Status Pill matching the uploaded screenshot */}
                  <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-center">
                    <Icon className="material-symbols-outlined text-icon-lg sm:text-[length:calc(26px*var(--ui-scale))] text-white shrink-0">
                      {isApproved ? 'check_circle' : isPending ? 'warning' : 'cancel'}
                    </Icon>
                    <span className="font-black text-xs sm:text-base md:text-lg tracking-tight text-white truncate text-center">
                      {isApproved
                        ? (isAmharic ? 'ለመንቀሳቀስ የተፈቀደለት ነው' : 'Permitted to Move')
                        : isExpired
                        ? (isAmharic ? 'ፈቃድ ያልታደሰ ነው' : 'Permit Expired')
                        : isPending
                        ? (isAmharic ? 'መንቀሳቀሻ ፈቃድ በመጠበቅ ላይ ነው' : 'Pending Permit')
                        : (isAmharic ? 'ፈቃድ ያልተሰጠው ነው' : 'Permit Not Granted')}
                    </span>
                  </div>

                  {/* Add Note Button on Right */}
                  <motion.button
                    type="button"
                    data-motion-control="true"
                    whileTap={TAP_SCALE}
                    transition={TACTILE_SPRING}
                    onClick={() => setShowNotesSection(!showNotesSection)}
                    className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg transition-colors cursor-pointer flex items-center justify-center shrink-0 shadow-sm touch-manipulation ${
                      showNotesSection
                        ? 'bg-white text-slate-900 border border-white font-bold'
                        : 'bg-white/20 hover:bg-white/30 text-white border border-white/40'
                    }`}
                    title={isAmharic ? 'ማስታወሻ ጨምር' : 'Add Inspection Note'}
                  >
                    <Icon className="material-symbols-outlined text-icon-lg sm:text-icon-xl font-bold">
                      {showNotesSection ? 'edit_note' : 'note_add'}
                    </Icon>
                  </motion.button>
                </div>

                {/* 2. MIDDLE SCROLLABLE BODY CONTENT */}
                <div className={`flex-1 overflow-y-auto overscroll-contain min-h-0 ${activeTheme.bodyBg}`}>
                  <div className="p-2 sm:p-3 space-y-2.5 max-w-2xl mx-auto w-full">

                    {/* Warning Alert for Pending Status */}
                    {isPending && (
                      <div className={`border p-2.5 rounded-xl text-xs flex items-start gap-2.5 shadow-xs ${
                        isAlwaysDarkScannerTheme
                          ? 'bg-amber-500/15 border-amber-400/40'
                          : isAlwaysLightScannerTheme
                          ? 'bg-amber-50 border-amber-400'
                          : 'bg-amber-50 dark:bg-amber-950/70 border-amber-400 dark:border-amber-600'
                      }`}>
                        <div className="w-7 h-7 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 font-black">
                          <Icon className="material-symbols-outlined text-icon-lg">warning</Icon>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`font-black text-xs ${
                            isAlwaysDarkScannerTheme
                              ? 'text-amber-200'
                              : isAlwaysLightScannerTheme
                              ? 'text-amber-950'
                              : 'text-amber-950 dark:text-amber-100'
                          }`}>
                            {isAmharic ? 'ማረጋገጫ በመጠባበቅ ላይ ያለ' : 'PENDING APPROVAL'}
                          </p>
                          <p className={`mt-0.5 text-2xs font-bold leading-tight ${
                            isAlwaysDarkScannerTheme
                              ? 'text-amber-100/90'
                              : isAlwaysLightScannerTheme
                              ? 'text-amber-900'
                              : 'text-amber-900 dark:text-amber-200'
                          }`}>
                            {isAmharic
                              ? 'ይህ ተሽከርካሪ በአስተዳዳሪ ገና አልጸደቀም።'
                              : 'This vehicle record is pending admin approval.'}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Association Motor (Company Vehicle) Notice - Visible strictly on scanner results */}
                    {scannedRegResult.hideFromOtherUsers && (
                      <div className={`${activeTheme.cardBg} border p-2.5 rounded-xl text-xs flex items-start gap-2.5 shadow-xs`}>
                        <div className={`w-7 h-7 rounded-lg ${activeTheme.iconCircle} flex items-center justify-center shrink-0 font-black`}>
                          <Icon className="material-symbols-outlined text-icon-md">business</Icon>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className={`font-black text-xs ${activeTheme.headingText}`}>
                              {isAmharic ? 'የማህበር ተሽከርካሪ' : 'ASSOCIATION MOTOR'}
                            </p>
                            <span aria-hidden="true" className={activeTheme.labelText}>·</span>
                            <span className={`text-2xs font-bold ${activeTheme.labelText}`}>
                              {isAmharic ? 'በፍተሻ ውጤት ብቻ የሚታይ' : 'Scanner Verified Result'}
                            </span>
                          </div>
                          <p className={`mt-0.5 text-2xs font-medium leading-tight ${activeTheme.labelText}`}>
                            {isAmharic
                              ? 'ይህ ተሽከርካሪ የማህበር መዝገብ በመሆኑ በሰንጠረዥና በሜትሪክስ የተደበቀ ሲሆን፣ በፍተሻ ውጤት ላይ ብቻ የሚታይ ነው።'
                              : 'This motor is registered as an Association vehicle (hidden from general lists & metrics, verified on scanner result).'}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* =========================================================
                        CARD 1: OWNER & PRIMARY MOTORCYCLE INFO
                        ========================================================= */}
                    <div className={`${activeTheme.ownerCardBg || activeTheme.cardBg} border rounded-xl p-2.5 sm:p-3.5 shadow-xs space-y-2`}>

                      {/* Top Row: Portrait Image on Left & Info Details on Right */}
                      <div className="flex items-start gap-3">

                        {/* Left: Portrait Photo or Cyan Monogram */}
                        <div
                          onClick={() => openDocumentCarousel(portraitUrl, `${scannedRegResult.fullName} — ${isAmharic ? 'የባለቤት ፎቶ' : 'Owner Portrait'}`)}
                          className={`w-28 h-36 sm:w-32 sm:h-40 rounded-lg overflow-hidden bg-black/5 border ${scannerHairlineBorder} shrink-0 shadow-xs cursor-pointer relative group flex items-center justify-center`}
                        >
                          {scannedRegResult.userPortraitPhoto ? (
                            <SmartImage
                              src={portraitUrl}
                              alt={scannedRegResult.fullName || 'Owner Portrait'}
                              fallbackIcon="person"
                              className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full bg-[#0284c7] flex items-center justify-center text-white font-black text-3xl sm:text-4xl select-none">
                              {(() => {
                                const parts = (scannedRegResult.fullName || '').trim().split(/\s+/);
                                if (parts.length >= 2) {
                                  return `${parts[0].slice(0, 2)}${parts[parts.length - 1].slice(0, 1)}`;
                                }
                                return (scannedRegResult.fullName || 'ሙ').slice(0, 2);
                              })()}
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                            <Icon className="material-symbols-outlined text-icon-2xl font-black">zoom_in</Icon>
                          </div>
                        </div>

                        {/* Right: Owner & Vehicle Specs List */}
                        <div className="flex-1 min-w-0 space-y-1.5 text-xs">
                          {/* Owner Full Name */}
                          <div>
                            <span className={`text-2xs ${activeTheme.labelText} font-extrabold block`}>
                              {isAmharic ? 'የባለቤት መረጃ' : 'Owner Info'}
                            </span>
                            <h3 className={`text-sm sm:text-base font-black ${activeTheme.headingText} leading-tight mt-0.5 truncate`}>
                              {scannedRegResult.fullName}
                            </h3>
                          </div>

                          {/* ID Number */}
                          <div>
                            <span className={`text-2xs ${activeTheme.labelText} font-extrabold block`}>
                              {isAmharic ? 'መለያ ቁጥር' : 'ID Number'}
                            </span>
                            <span className={`text-xs font-black font-mono tabular-nums ${activeTheme.headingText} block mt-0.5 truncate`}>
                              {scannedRegResult.id}
                            </span>
                          </div>

                          {/* Plate Number */}
                          <div>
                            <span className={`text-2xs ${activeTheme.labelText} font-extrabold block`}>
                              {isAmharic ? 'ሰሌዳ ቁጥር' : 'Plate Number'}
                            </span>
                            <span className={`text-xs font-black font-mono tabular-nums ${activeTheme.plateBadge} mt-0.5 px-2 py-0.5 rounded-md inline-flex items-center`}>
                              {scannedRegResult.plateNumber}
                            </span>
                          </div>

                          {/* Authorized Motor */}
                          <div>
                            <span className={`text-2xs ${activeTheme.labelText} font-extrabold block`}>
                              {isAmharic ? 'የተፈቀደለት ሞተር' : 'Authorized Motor'}
                            </span>
                            <span className={`text-xs font-black ${activeTheme.headingText} block mt-0.5 truncate`}>
                              {[scannedRegResult.motorBrand, scannedRegResult.motorModel].filter(Boolean).join(' ') || 'ቦክሰር 2015'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* =========================================================
                        CARD 2: MERGED VEHICLE & CONTACT DETAILS (2-COLUMN HORIZONTAL GRID)
                        ========================================================= */}
                    <div className={`${activeTheme.specCardBg || activeTheme.cardBg} border rounded-xl p-2.5 sm:p-3.5 shadow-xs space-y-2.5`}>
                      <h3 className={`text-xs sm:text-sm font-black ${activeTheme.headingText} flex items-center gap-1.5`}>
                        <Icon className={`material-symbols-outlined ${activeTheme.sectionIconColor} text-icon-md`}>two_wheeler</Icon>
                        <span>{isAmharic ? 'ተጨማሪ የተሽከርካሪ ዝርዝሮች' : 'Additional Vehicle Details'}</span>
                      </h3>

                      {/* 2-Column Horizontal Grid with Related Info Grouped in Rows */}
                      <div className="grid grid-cols-2 gap-2">
                        {/* Pair 1, Col 1: Motor Brand */}
                        <div className={`flex items-center gap-2 p-2 ${activeTheme.chipBg} rounded-lg border min-w-0`}>
                          <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full ${activeTheme.iconCircle} flex items-center justify-center shrink-0 shadow-xs`}>
                            <Icon className="material-symbols-outlined text-15 sm:text-icon-sm">two_wheeler</Icon>
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className={`text-2xs ${activeTheme.labelText} font-extrabold block truncate`}>
                              {isAmharic ? 'የሞተር ምርት' : 'Motor Brand'}
                            </span>
                            <span className={`text-xs font-black ${activeTheme.headingText} block truncate`}>
                              {scannedRegResult.motorBrand || '—'}
                            </span>
                          </div>
                        </div>

                        {/* Pair 1, Col 2: Model */}
                        <div className={`flex items-center gap-2 p-2 ${activeTheme.chipBg} rounded-lg border min-w-0`}>
                          <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full ${activeTheme.iconCircle} flex items-center justify-center shrink-0 shadow-xs`}>
                            <Icon className="material-symbols-outlined text-15 sm:text-icon-sm">calendar_today</Icon>
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className={`text-2xs ${activeTheme.labelText} font-extrabold block truncate`}>
                              {isAmharic ? 'ሞዴል' : 'Model'}
                            </span>
                            <span className={`text-xs font-black ${activeTheme.headingText} block truncate`}>
                              {scannedRegResult.motorModel || '—'}
                            </span>
                          </div>
                        </div>

                        {/* Pair 2, Col 1: Registration Date */}
                        <div className={`flex items-center gap-2 p-2 ${activeTheme.chipBg} rounded-lg border min-w-0`}>
                          <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full ${activeTheme.iconCircle} flex items-center justify-center shrink-0 shadow-xs`}>
                            <Icon className="material-symbols-outlined text-15 sm:text-icon-sm">date_range</Icon>
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className={`text-2xs ${activeTheme.labelText} font-extrabold block truncate`}>
                              {isAmharic ? 'የተመዘገበበት ቀን' : 'Reg. Date'}
                            </span>
                            <span className={`text-xs font-black font-mono tabular-nums ${activeTheme.headingText} block truncate`}>
                              {scannedRegResult.registrationDate || '—'}
                            </span>
                          </div>
                        </div>

                        {/* Pair 2, Col 2: Permit Status */}
                        <div className={`flex items-center gap-2 p-2 ${activeTheme.chipBg} rounded-lg border min-w-0`}>
                          <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full ${activeTheme.iconCircle} flex items-center justify-center shrink-0 shadow-xs`}>
                            <Icon className="material-symbols-outlined text-15 sm:text-icon-sm">
                              {isApproved ? 'check_circle' : isExpired || isPending ? 'warning' : 'cancel'}
                            </Icon>
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className={`text-2xs ${activeTheme.labelText} font-extrabold block truncate`}>
                              {isAmharic ? 'የፈቃድ ሁኔታ' : 'Permit Status'}
                            </span>
                            <span className={`text-xs font-black block truncate ${
                              isApproved
                                ? scannerSemanticApprovedText
                                : isExpired || isPending
                                ? scannerSemanticPendingText
                                : scannerSemanticRejectedText
                            }`}>
                              {isApproved
                                ? (isAmharic ? 'የተፈቀደ' : 'Approved')
                                : isExpired
                                ? (isAmharic ? 'ያልታደሰ' : 'Expired')
                                : isPending
                                ? (isAmharic ? 'በመጠበቅ ላይ' : 'Pending')
                                : (isAmharic ? 'ያልተሰጠ' : 'Not Granted')}
                            </span>
                          </div>
                        </div>

                        {/* Pair 3, Col 1: Sub-City */}
                        <div className={`flex items-center gap-2 p-2 ${activeTheme.chipBg} rounded-lg border min-w-0`}>
                          <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full ${activeTheme.iconCircle} flex items-center justify-center shrink-0 shadow-xs`}>
                            <Icon className="material-symbols-outlined text-15 sm:text-icon-sm">location_city</Icon>
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className={`text-2xs ${activeTheme.labelText} font-extrabold block truncate`}>
                              {isAmharic ? 'ክፍለ ከተማ' : 'Sub-City'}
                            </span>
                            <span className={`text-xs font-black ${activeTheme.headingText} block truncate`}>
                              {scannedRegResult.subCity || '—'}
                            </span>
                          </div>
                        </div>

                        {/* Pair 3, Col 2: Phone Number */}
                        <div className={`flex items-center gap-2 p-2 ${activeTheme.chipBg} rounded-lg border min-w-0`}>
                          <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full ${activeTheme.iconCircle} flex items-center justify-center shrink-0 shadow-xs`}>
                            <Icon className="material-symbols-outlined text-15 sm:text-icon-sm">call</Icon>
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className={`text-2xs ${activeTheme.labelText} font-extrabold block truncate`}>
                              {isAmharic ? 'ስልክ ቁጥር' : 'Phone Number'}
                            </span>
                            <span className={`text-xs font-black font-mono tabular-nums ${activeTheme.headingText} block truncate`}>
                              {scannedRegResult.phone || '—'}
                            </span>
                          </div>
                        </div>

                        {/* Pair 4, Col 1: Blood Group */}
                        <div className={`flex items-center gap-2 p-2 ${activeTheme.chipBg} rounded-lg border min-w-0`}>
                          <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full ${activeTheme.iconCircle} flex items-center justify-center shrink-0 shadow-xs`}>
                            <Icon className="material-symbols-outlined text-15 sm:text-icon-sm">bloodtype</Icon>
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className={`text-2xs ${activeTheme.labelText} font-extrabold block truncate`}>
                              {isAmharic ? 'የደም ዓይነት' : 'Blood Group'}
                            </span>
                            <span className={`text-xs font-black ${scannerSemanticBloodText} block truncate`}>
                              {scannedRegResult.bloodGroup || '—'}
                            </span>
                          </div>
                        </div>

                        {/* Pair 4, Col 2: Vehicle Category / Fuel */}
                        <div className={`flex items-center gap-2 p-2 ${activeTheme.chipBg} rounded-lg border min-w-0`}>
                          <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full ${activeTheme.iconCircle} flex items-center justify-center shrink-0 shadow-xs`}>
                            <Icon className="material-symbols-outlined text-15 sm:text-icon-sm">
                              {scannedRegResult.vehicleCategory === 'electric' ? 'electric_moped' : 'local_gas_station'}
                            </Icon>
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className={`text-2xs ${activeTheme.labelText} font-extrabold block truncate`}>
                              {isAmharic ? 'የሞተር ምድብ' : 'Vehicle Type'}
                            </span>
                            <span className={`text-xs font-black ${activeTheme.headingText} block truncate`}>
                              {scannedRegResult.vehicleCategory === 'electric'
                                ? (isAmharic ? 'ኤሌክትሪክ' : 'Electric')
                                : (isAmharic ? 'ቤንዚን (<110cc)' : 'Gas (<110cc)')}
                            </span>
                          </div>
                        </div>

                        {/* Pair 5, Col 1: Driving License in More Info */}
                        {(() => {
                          const dlPhoto =
                            scannedRegResult.drivingLicensePhoto ||
                            (scannedRegResult as any).driving_license_photo ||
                            (scannedRegResult as any).driverLicensePhoto ||
                            (scannedRegResult as any).licensePhoto || '';

                          const ppPhoto =
                            scannedRegResult.drivingPermitPhoto ||
                            (scannedRegResult as any).driving_permit_photo ||
                            (scannedRegResult as any).policePermitPhoto ||
                            (scannedRegResult as any).policePermit || '';

                          return (
                            <>
                              <div
                                onClick={() => {
                                  if (dlPhoto) {
                                    openDocumentCarousel(
                                      dlPhoto,
                                      `${scannedRegResult.fullName} — ${isAmharic ? 'የመንጃ ፍቃድ' : 'Driver License'}`
                                    );
                                  }
                                }}
                                className={`flex items-center gap-2 p-2 ${activeTheme.chipBg} rounded-lg border min-w-0 transition-all ${
                                  dlPhoto
                                    ? 'cursor-pointer shadow-xs hover:brightness-105'
                                    : 'opacity-70'
                                }`}
                                title={dlPhoto ? (isAmharic ? 'መንጃ ፍቃድ ለማየት ይጫኑ' : 'Click to view driving license') : undefined}
                              >
                                <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full ${activeTheme.iconCircle} flex items-center justify-center shrink-0 shadow-xs`}>
                                  <Icon className="material-symbols-outlined text-15 sm:text-icon-sm">card_membership</Icon>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <span className={`text-2xs ${activeTheme.labelText} font-extrabold block truncate`}>
                                    {isAmharic ? 'የመንጃ ፍቃድ' : 'Driving License'}
                                  </span>
                                  <span className={`text-xs font-black truncate flex items-center gap-1 ${
                                    dlPhoto ? scannerSemanticApprovedText : activeTheme.labelText
                                  }`}>
                                    {dlPhoto ? (
                                      <>
                                        <span className="truncate">{isAmharic ? 'የተያያዘ (ይመልከቱ)' : 'Attached (View)'}</span>
                                        <Icon className="material-symbols-outlined text-13 shrink-0">visibility</Icon>
                                      </>
                                    ) : (
                                      isAmharic ? 'ያልተያያዘ' : 'Not Attached'
                                    )}
                                  </span>
                                </div>
                              </div>

                              {/* Pair 5, Col 2: Police Permit in More Info */}
                              <div
                                onClick={() => {
                                  if (ppPhoto) {
                                    openDocumentCarousel(
                                      ppPhoto,
                                      `${scannedRegResult.fullName} — ${isAmharic ? 'የፖሊስ የመንቀሳቀሻ ፈቃድ' : 'Police Permit'}`
                                    );
                                  }
                                }}
                                className={`flex items-center gap-2 p-2 ${activeTheme.chipBg} rounded-lg border min-w-0 transition-all ${
                                  ppPhoto
                                    ? 'cursor-pointer shadow-xs hover:brightness-105'
                                    : 'opacity-70'
                                }`}
                                title={ppPhoto ? (isAmharic ? 'የፖሊስ ፈቃድ ለማየት ይጫኑ' : 'Click to view police permit') : undefined}
                              >
                                <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full ${activeTheme.iconCircle} flex items-center justify-center shrink-0 shadow-xs`}>
                                  <Icon className="material-symbols-outlined text-15 sm:text-icon-sm">local_police</Icon>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <span className={`text-2xs ${activeTheme.labelText} font-extrabold block truncate`}>
                                    {isAmharic ? 'የፖሊስ ፈቃድ' : 'Police Permit'}
                                  </span>
                                  <span className={`text-xs font-black truncate flex items-center gap-1 ${
                                    ppPhoto ? scannerSemanticApprovedText : activeTheme.labelText
                                  }`}>
                                    {ppPhoto ? (
                                      <>
                                        <span className="truncate">{isAmharic ? 'የተሰጠ (ይመልከቱ)' : 'Valid (View)'}</span>
                                        <Icon className="material-symbols-outlined text-13 shrink-0">visibility</Icon>
                                      </>
                                    ) : (
                                      isAmharic ? 'ያልተያያዘ' : 'Not Attached'
                                    )}
                                  </span>
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Municipal Copyright Footer matching Attachment Screenshots */}
                    <div className="pt-2 pb-1 text-center text-2xs sm:text-11 font-medium opacity-80">
                      <p className={activeTheme.footerText}>
                        {isAmharic
                          ? '© 2016 የግንቦት 12 ባህር ዳር ሞተረኞች ማህበር ፈቃድ ቁጥጥር ስርዓት። መብቱ የተጠበቀ ነው።'
                          : '© 2026 Bahirdar Motorist Association Permit Control System. All rights reserved.'}
                      </p>
                    </div>

                    {/* Action Buttons: Scan Again / Add Notes */}
                    <div className="pt-1 pb-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
                      <motion.button
                        type="button"
                        data-motion-control="true"
                        whileTap={TAP_SCALE}
                        transition={TACTILE_SPRING}
                        onClick={handleRescan}
                        className={`flex-1 ${activeTheme.actionButton} font-black min-h-[44px] sm:min-h-[calc(48px*var(--ui-scale))] py-3 px-4 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer touch-manipulation`}
                      >
                        <Icon className="material-symbols-outlined text-icon-lg">qr_code_scanner</Icon>
                        <span>{isAmharic ? 'ሌላ QR ኮድ ቃኝ' : 'Scan Next QR'}</span>
                      </motion.button>

                      <motion.button
                        type="button"
                        data-motion-control="true"
                        whileTap={SUBTLE_TAP_SCALE}
                        transition={TACTILE_SPRING}
                        onClick={() => setShowNotesSection(!showNotesSection)}
                        className={`${scannerSecondaryButtonSurface} border font-black min-h-[44px] sm:min-h-[calc(48px*var(--ui-scale))] py-3 px-4 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs touch-manipulation`}
                      >
                        <Icon className={`material-symbols-outlined text-icon-lg ${activeTheme.sectionIconColor}`}>edit_note</Icon>
                        <span>{isAmharic ? 'ማስታወሻ ጨምር' : 'Add Notes'}</span>
                      </motion.button>
                    </div>
                  </div>
                </div>

                {/* 3. FIXED BOTTOM SECTION WITH SLIDEOUT INSPECTION NOTES */}
                <div className={`shrink-0 ${activeTheme.ownerCardBg || activeTheme.cardBg} border-t ${scannerHairlineBorder} z-20 shadow-lg relative flex flex-col`}>
                  {/* Slideout Inspection Notes Form (GPU transform+opacity reveal) */}
                  <AnimatePresence>
                    {showNotesSection && (
                      <motion.div
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        transition={TACTILE_SPRING}
                        className={`${activeTheme.specCardBg || activeTheme.cardBg} border-b ${scannerHairlineBorder}`}
                      >
                        <div className="max-w-2xl mx-auto w-full p-3.5 sm:p-4 pb-[max(0.875rem,env(safe-area-inset-bottom,12px))] space-y-2.5">
                          <div className="flex items-center justify-between">
                            <label className={`text-xs font-black flex items-center gap-1.5 ${activeTheme.headingText}`}>
                              <Icon className={`material-symbols-outlined text-icon-md ${activeTheme.sectionIconColor}`}>edit_note</Icon>
                              <span>{isAmharic ? 'የተቆጣጣሪ ማስታወሻ' : 'Inspection Notes'}</span>
                            </label>
                            <button
                              type="button"
                              onClick={() => setShowNotesSection(false)}
                              className={`min-h-[var(--ui-control-h-md)] ${activeTheme.labelText} hover:opacity-80 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-opacity touch-manipulation`}
                            >
                              <Icon className="material-symbols-outlined text-icon-md">keyboard_arrow_down</Icon>
                              <span>{isAmharic ? 'ደብቅ' : 'Hide'}</span>
                            </button>
                          </div>
                          <textarea
                            rows={2}
                            value={verificationNotes}
                            onChange={(e) => handleNoteChange(e.target.value)}
                            placeholder={isAmharic ? 'ማስታወሻ ይጻፉ...' : 'Type inspection notes...'}
                            className={`w-full select-text border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-xs ${scannerNotesInputClass}`}
                            autoFocus
                          />

                          {/* Record Button ('መዝግብ' / 'Record') inside inspection notes container */}
                          <div className="flex justify-end pt-1">
                            <motion.button
                              type="button"
                              data-motion-control="true"
                              whileTap={TAP_SCALE}
                              transition={TACTILE_SPRING}
                              onClick={() => {
                                if (currentLog && onAddVerificationLog) {
                                  const finalLog: VerificationLog = {
                                    ...currentLog,
                                    officerNotes: verificationNotes || currentLog.officerNotes,
                                    scannedAt: getTodayEthiopianDateTimeIso(),
                                  };
                                  onAddVerificationLog(finalLog, true);
                                }
                                onClose();
                                handleRescan();
                              }}
                              className="w-full sm:w-auto min-h-[44px] md:min-h-[var(--ui-control-h-md)] bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-5 py-2.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs touch-manipulation"
                            >
                              <Icon className="material-symbols-outlined text-icon-md shrink-0">check_circle</Icon>
                              <span>{isAmharic ? 'መዝግብ' : 'Record'}</span>
                            </motion.button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            );
          })()}
        </motion.div>
      )}

      {/* DIGITAL ID LIGHTBOX MODAL (SuperAdmin Only) */}
      <AnimatePresence>
        {showDigitalIdModal && isSuperAdmin && scannedRegResult && scannedRegResult !== 'not_found' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-[10000] bg-black/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
            onClick={() => setShowDigitalIdModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={POPOVER_TRANSITION}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl"
            >
              <ZoomableDocumentContainer
                lang={lang}
                userRole={userRole as any}
                title={isAmharic ? 'ባህር ዳር ሞተረኞች ማህበር መታወቂያ' : 'Bahirdar Motorist Association ID'}
                onClose={() => setShowDigitalIdModal(false)}
                requireClerkRequest={false}
              >
                <div className="p-4 bg-white dark:bg-slate-900 flex items-center justify-center">
                  <QRCodeCard registration={scannedRegResult} lang={lang} />
                </div>
              </ZoomableDocumentContainer>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 100% VIEWPORT FILLING CAROUSEL DOCUMENT ZOOM VIEWER */}
      {carouselModal && (
        <FullscreenDocumentCarouselModal
          items={carouselModal.items}
          initialIndex={carouselModal.initialIndex}
          lang={lang}
          onClose={() => setCarouselModal(null)}
        />
      )}
    </>
  );

  // Render as a standalone page component or full screen modal overlay
  if (isPage) {
    return (
      <div className="w-full h-full flex flex-col flex-1 min-h-0 overflow-hidden bg-surface p-0 m-0 rounded-none">
        {mainCardContent}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-0 sm:p-4 overflow-hidden touch-none select-none transition-all duration-200">
      <div className="bg-surface rounded-none sm:rounded-2xl p-0 m-0 w-full max-w-full sm:max-w-6xl h-full h-[100dvh] sm:h-[90vh] max-h-full max-h-[100dvh] sm:max-h-[90vh] shadow-2xl flex flex-col min-h-0 overflow-hidden">
        {mainCardContent}
      </div>
    </div>
  );
};
