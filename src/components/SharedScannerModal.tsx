import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon } from './ui/Icon';
import jsQR from 'jsqr';
import { motion, AnimatePresence } from 'motion/react';
import { MotorcycleRegistration, VerificationLog, Language, SystemSettings } from '../types';
import { QRCodeCard } from './QRCodeCard';
import { ZoomableDocumentContainer } from './ZoomableDocumentContainer';
import { SmartImage } from './SmartImage';
import { lookupRegistrationInDb, subscribeSettings, DEFAULT_SETTINGS } from '../services/dbService';
import { getScannerTheme } from '../utils/scannerThemes';
import {
  FullscreenDocumentCarouselModal,
  buildRegistrationDocumentList,
  DocumentViewerItem,
} from './FullscreenDocumentCarouselModal';

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
    <div className={`p-2.5 rounded-md bg-surface-container border border-outline-variant/30 flex flex-col justify-center min-h-[54px] shadow-2xs ${className}`}>
      <span className="text-[10px] uppercase tracking-wider text-secondary font-bold block mb-0.5">
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
  isPage = false,
  autoStart = true,
  userRole = 'officer',
}) => {
  const isAmharic = lang === 'am';
  const isSuperAdmin = userRole === 'superadmin' || userRole === 'super_admin';
  const [searchMode, setSearchMode] = useState<'camera' | 'manual'>('camera');
  const [searchPlate, setSearchPlate] = useState('');
  const [rawScannedRegResult, setScannedRegResult] = useState<MotorcycleRegistration | 'not_found' | null>(null);

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
  const [expandedVehicleSpecs, setExpandedVehicleSpecs] = useState(false);
  const [expandedDocs, setExpandedDocs] = useState(false);
  const [expandedDigitalId, setExpandedDigitalId] = useState(false);
  const [showNotesSection, setShowNotesSection] = useState(false);
  const [showDigitalIdModal, setShowDigitalIdModal] = useState(false);
  const [showTopMenu, setShowTopMenu] = useState(false);
  const [carouselModal, setCarouselModal] = useState<{
    items: DocumentViewerItem[];
    initialIndex: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isProcessingRef = useRef(false);

  const openDocumentCarousel = (targetUrl: string, fallbackTitle?: string) => {
    if (!targetUrl) return;
    const docs = buildRegistrationDocumentList(scannedRegResult, lang, isSuperAdmin);
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

// Fullscreen forced request removed per user preference.

  // Reset and start camera scanner whenever modal/page is opened
  useEffect(() => {
    if (isOpen) {
      setIsScanning(autoStart);
      setScannedRegResult(null);
      setCameraError('');
      setCurrentLog(null);
      setVerificationNotes('');
      setShowNotesSection(false);
      setUploadedImageSrc(null);
      setCapturedFrameSrc(null);
      setIsProcessingScan(false);
      setExpandedVehicleSpecs(false);
      setExpandedDocs(false);
      setExpandedDigitalId(false);
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
      scannedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
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
        scannedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
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

  // Live Camera QR Scan Loop via jsQR
  useEffect(() => {
    let active = true;

    if (isOpen && isScanning && searchMode === 'camera' && !scannedRegResult) {
      setCameraError('');

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(isAmharic ? 'ካሜራ በዚህ አሳሽ አይደገፍም' : 'Camera is not supported on this browser or device.');
        return;
      }

      navigator.mediaDevices
        .getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } }
        })
        .then((stream) => {
          if (!active) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
          }

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { willReadFrequently: true });

          const scanFrame = () => {
            if (!active) return;
            const video = videoRef.current;
            if (video && video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert'
              });
              if (code && code.data) {
                processQRData(code.data);
                return;
              }
            }
            animFrameRef.current = requestAnimationFrame(scanFrame);
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
    };
  }, [isOpen, isScanning, searchMode, scannedRegResult, isAmharic, facingMode]);

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

  const processQRData = async (qrData: string, imageOverride?: string) => {
    const cleanData = qrData.trim();
    if (!cleanData) return;
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    // Show active scanning processing animation
    setIsProcessingScan(true);

    if (imageOverride) {
      setUploadedImageSrc(imageOverride);
    } else {
      const frame = captureCameraFrame();
      if (frame) {
        setCapturedFrameSrc(frame);
      }
    }

    // Perform deep query against both local cache and live Firestore permit database
    const match = await lookupRegistrationInDb(cleanData, registrations);

    // Scanning delay (850ms) so scanning laser beam animation plays over captured camera/image frame
    setTimeout(() => {
      setIsProcessingScan(false);
      if (match) {
        playScanFeedback(true);
        setScanFlash('success');
        autoSaveLog(match);
        setTimeout(() => {
          setScannedRegResult(match);
          setIsScanning(false);
          setScanFlash(null);
          isProcessingRef.current = false;
        }, 450);
      } else {
        playScanFeedback(false);
        setScanFlash('not_found');
        setTimeout(() => {
          setScannedRegResult('not_found');
          setIsScanning(false);
          setScanFlash(null);
          isProcessingRef.current = false;
        }, 450);
      }
    }, 850);
  };

  const handleScanResult = (result: any) => {
    if (result && result.length > 0 && result[0].rawValue) {
      processQRData(result[0].rawValue);
    }
  };

  const handleSearchLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchPlate.trim()) return;

    setIsProcessingScan(true);
    const found = await lookupRegistrationInDb(searchPlate.trim(), registrations);
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

  // Helper to scan HTMLImageElement for QR or Barcodes using native API + multi-scale jsQR
  const decodeQRFromImage = async (img: HTMLImageElement): Promise<string | null> => {
    // 1. Try Native BarcodeDetector API if available
    if ('BarcodeDetector' in window) {
      try {
        const detector = new (window as any).BarcodeDetector({
          formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'data_matrix', 'pdf417']
        });
        const detected = await detector.detect(img);
        if (detected && detected.length > 0 && detected[0].rawValue) {
          return detected[0].rawValue;
        }
      } catch (err) {
        console.warn('Native BarcodeDetector failed, trying jsQR scales:', err);
      }
    }

    // 2. Try jsQR across multiple scaled canvas resolutions
    const targetSizes = [800, 1200, 500, Math.max(img.width, img.height)];
    for (const maxDim of targetSizes) {
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) continue;

      ctx.drawImage(img, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth'
      });
      if (code && code.data && code.data.trim()) {
        return code.data.trim();
      }
    }

    return null;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Synchronously set object URL for instant 0ms preview & immediate scanning animation
    const instantPreviewUrl = URL.createObjectURL(file);
    setUploadedImageSrc(instantPreviewUrl);
    setCapturedFrameSrc(null);
    setIsScanning(true);
    setScannedRegResult(null);
    setIsProcessingScan(true);
    isProcessingRef.current = true;

    const img = new Image();
    img.onload = async () => {
      const foundData = await decodeQRFromImage(img);
      
      // Delay so the user sees the active scanning animation over uploaded image in camera view
      setTimeout(() => {
        isProcessingRef.current = false;
        if (foundData) {
          processQRData(foundData, instantPreviewUrl);
        } else {
          setIsProcessingScan(false);
          playScanFeedback(false);
          setScanFlash('not_found');
          setTimeout(() => {
            setScannedRegResult('not_found');
            setIsScanning(false);
            setScanFlash(null);
            isProcessingRef.current = false;
          }, 450);
        }
      }, 700);
    };
    img.src = instantPreviewUrl;

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleStartCameraScan = () => {
    setCameraError('');
    setIsScanning(true);
    setUploadedImageSrc(null);
    setCapturedFrameSrc(null);
    setIsProcessingScan(false);
    setScannedRegResult(null);
  };

  const handleRescan = () => {
    setScannedRegResult(null);
    setCurrentLog(null);
    setSearchPlate('');
    setVerificationNotes('');
    setExpandedVehicleSpecs(false);
    setExpandedDocs(false);
    setExpandedDigitalId(false);
    setShowNotesSection(false);
    setCarouselModal(null);
    setUploadedImageSrc(null);
    setCapturedFrameSrc(null);
    setIsProcessingScan(false);
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
        <div className="flex-1 flex flex-col min-h-0 justify-between gap-0 overflow-hidden h-full max-h-full w-full relative">
          {/* Camera View Box - Full viewpoint height & width */}
          <div className="relative bg-slate-950 rounded-none w-full flex-1 min-h-0 overflow-hidden flex flex-col items-center justify-center border-0">
            {isScanning ? (
              <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-black overflow-hidden">
                {uploadedImageSrc ? (
                  <img
                    src={uploadedImageSrc}
                    alt="Uploaded QR Image"
                    className="w-full h-full object-cover bg-slate-950"
                  />
                ) : capturedFrameSrc ? (
                  <img
                    src={capturedFrameSrc}
                    alt="Captured Camera Frame"
                    className="w-full h-full object-cover bg-slate-950"
                  />
                ) : (
                  <video 
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                )}

                {/* Dark Vignette Overlay for Camera Feed */}
                <div className="absolute inset-0 bg-black/25 pointer-events-none z-0" />

                {/* Top Active Scanning Status Badge (Shown only for live camera processing, disabled for image upload scanning) */}
                {isProcessingScan && !uploadedImageSrc && (
                  <div className="absolute top-16 z-30 flex items-center gap-2 bg-primary/90 px-4 py-1.5 rounded-full text-white font-extrabold text-xs sm:text-sm shadow-xl border border-primary/40 backdrop-blur-md">
                    <Icon className="material-symbols-outlined text-[18px] animate-spin">progress_activity</Icon>
                    <span>
                      {isAmharic ? 'QR ኮድ በመተንተን እና በመቃኘት ላይ...' : 'Capturing & Processing QR Code...'}
                    </span>
                  </div>
                )}

                {/* Custom Live Scanner Overlay UI - Full screen viewfinder & bottom controls */}
                <div className="absolute inset-0 pointer-events-none flex flex-col justify-between z-10">
                  {/* 1. TOP HEADER with Opaque Dark Background & Blur */}
                  <div className="w-full flex flex-col pt-3 px-4 sm:px-6 z-30 shrink-0">
                    <div className="pointer-events-auto bg-black/70 backdrop-blur-md border border-white/15 rounded-lg px-4 py-3 flex items-center justify-between shadow-2xl">
                      {/* Back Button with Title */}
                      <button
                        type="button"
                        onClick={onClose}
                        className="flex items-center gap-1.5 sm:gap-2 text-white hover:text-white/80 active:scale-95 transition-all cursor-pointer drop-shadow-md select-none group"
                        title={isAmharic ? 'ተመለስ' : 'Back'}
                      >
                        <Icon className="material-symbols-outlined text-[28px] sm:text-[32px] leading-none text-white transition-transform group-hover:-translate-x-0.5">
                          chevron_left
                        </Icon>
                        <span className="text-base sm:text-lg font-bold tracking-tight text-white drop-shadow-xs">
                          {isAmharic ? 'ኮውአር ኮድ ፈትሽ' : 'Scan QR Code'}
                        </span>
                      </button>
                    </div>

                    {/* Search Dropdown Card if active */}
                    {showTopMenu && (
                      <div className="pointer-events-auto w-full max-w-md mx-auto mt-3 bg-slate-900/95 border border-slate-700 rounded-lg shadow-2xl p-3 text-white backdrop-blur-xl animate-in slide-in-from-top-3 duration-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                            <Icon className="material-symbols-outlined text-[18px] text-primary">search</Icon>
                            <span>{isAmharic ? 'በሰሌዳ ቁጥር ወይም በስም ፈልግ' : 'Search by Plate No or Owner Name'}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowTopMenu(false)}
                            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
                          >
                            <Icon className="material-symbols-outlined text-[18px]">close</Icon>
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
                              <Icon className="material-symbols-outlined text-[18px]">search</Icon>
                            </div>
                            <input
                              type="text"
                              value={searchPlate}
                              onChange={(e) => setSearchPlate(e.target.value)}
                              placeholder={isAmharic ? 'የሰሌዳ ቁጥር ወይም ስም ያስገቡ...' : 'Enter Plate No or Name...'}
                              className="w-full bg-slate-800 border border-slate-700 rounded-md pl-10 pr-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary shadow-xs"
                              autoFocus
                            />
                          </div>
                          <button
                            type="submit"
                            className="bg-primary hover:bg-primary-hover text-white font-bold text-xs sm:text-sm px-3.5 py-2 rounded-md transition-colors cursor-pointer flex items-center gap-1 shrink-0 shadow-xs"
                          >
                            <Icon className="material-symbols-outlined text-[18px]">search</Icon>
                            <span>{isAmharic ? 'ፈልግ' : 'Search'}</span>
                          </button>
                        </form>
                      </div>
                    )}
                  </div>

                  {/* 2. CENTER VIEWFINDER (Bigger Reticle Size) */}
                  <div className="flex flex-col items-center justify-center my-auto pointer-events-none">
                    <div
                      className="relative w-72 h-72 sm:w-92 sm:h-92 max-w-[85vw] max-h-[75vh] border border-white/20 rounded-lg flex-shrink-0"
                      style={{ boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.7)' }}
                    >
                      {/* 4 Vibrant Blue Corner Brackets */}
                      <div className="absolute -top-1 -left-1 w-7 h-7 border-t-[4px] border-l-[4px] border-[#3b82f6] rounded-tl-sm z-20" />
                      <div className="absolute -top-1 -right-1 w-7 h-7 border-t-[4px] border-r-[4px] border-[#3b82f6] rounded-tr-sm z-20" />
                      <div className="absolute -bottom-1 -left-1 w-7 h-7 border-b-[4px] border-l-[4px] border-[#3b82f6] rounded-bl-sm z-20" />
                      <div className="absolute -bottom-1 -right-1 w-7 h-7 border-b-[4px] border-r-[4px] border-[#3b82f6] rounded-br-sm z-20" />

                      {/* Animated Red Laser Scanning Line */}
                      {!uploadedImageSrc && (
                        <div className="absolute left-2 right-2 h-[2.5px] bg-red-500 shadow-[0_0_14px_#ef4444] rounded-full z-20 animate-red-laser" />
                      )}
                    </div>
                  </div>

                  {/* 3. BOTTOM SECTION: Guide Text (No background, placed above bottom buttons) & ACTION BUTTONS */}
                  <div className="pointer-events-auto flex flex-col items-center w-full max-w-md mx-auto px-4 pb-6 z-30 shrink-0 gap-2 sm:gap-2.5">
                    {/* Guide Text without background, positioned just above action buttons */}
                    <div className="text-center pointer-events-none select-none">
                      <span className="text-xs sm:text-sm font-semibold text-white/90 drop-shadow-md">
                        {isAmharic ? 'የQR ኮዱን ሳጥኑ ውስጥ ያስገቡ' : 'Point camera at the QR permit code'}
                      </span>
                    </div>

                    {/* Bottom Action Buttons Row with Opaque Dark Background & Blur */}
                    <div className="w-full bg-black/70 backdrop-blur-md border border-white/15 rounded-lg p-3 sm:p-4 flex items-center justify-evenly shadow-2xl">
                      {/* 1. Search Button */}
                      <button
                        type="button"
                        onClick={() => setShowTopMenu(!showTopMenu)}
                        className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full transition-all active:scale-95 flex items-center justify-center shadow-lg cursor-pointer backdrop-blur-md ${
                          showTopMenu
                            ? 'bg-primary text-white shadow-primary/40 ring-2 ring-primary/50'
                            : 'bg-white/20 hover:bg-white/30 active:bg-white/40 text-white'
                        }`}
                        title={isAmharic ? 'ፈልግ' : 'Search'}
                      >
                        <Icon className="material-symbols-outlined text-[24px]">search</Icon>
                      </button>

                      {/* 2. Photo Gallery Upload */}
                      <button
                        type="button"
                        onClick={() => {
                          if (fileInputRef.current) {
                            fileInputRef.current.value = '';
                            fileInputRef.current.click();
                          }
                        }}
                        className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white/20 hover:bg-white/30 active:bg-white/40 text-white backdrop-blur-md transition-all active:scale-95 flex items-center justify-center shadow-lg cursor-pointer"
                        title={isAmharic ? 'ምስል ስካን' : 'Select Photo'}
                      >
                        <Icon className="material-symbols-outlined text-[24px]">image</Icon>
                      </button>

                      {/* 3. Flashlight / Torch Toggle */}
                      <button
                        type="button"
                        onClick={handleToggleTorch}
                        className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full transition-all active:scale-95 flex items-center justify-center shadow-lg cursor-pointer backdrop-blur-md ${
                          isTorchOn
                            ? 'bg-amber-400 text-amber-950 shadow-amber-400/40 ring-2 ring-amber-300/60'
                            : 'bg-white/20 hover:bg-white/30 active:bg-white/40 text-white'
                        }`}
                        title={isAmharic ? 'ፍላሽ' : 'Flashlight'}
                      >
                        <Icon className="material-symbols-outlined text-[24px]">
                          {isTorchOn ? 'flashlight_on' : 'flashlight_off'}
                        </Icon>
                      </button>

                      {/* 4. Switch Camera (Front/Rear) */}
                      <button
                        type="button"
                        onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
                        className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white/20 hover:bg-white/30 active:bg-white/40 text-white backdrop-blur-md transition-all active:scale-95 flex items-center justify-center shadow-lg cursor-pointer"
                        title={isAmharic ? 'ካሜራ ቀይር' : 'Switch Camera'}
                      >
                        <Icon className="material-symbols-outlined text-[24px]">cameraswitch</Icon>
                      </button>
                    </div>
                  </div>
                </div>


                {cameraError && (
                  <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-4 text-center z-20 space-y-2">
                    <Icon className="material-symbols-outlined text-rose-400 text-[32px]">videocam_off</Icon>
                    <p className="text-rose-300 text-xs font-bold max-w-xs">{cameraError}</p>
                    <button
                      type="button"
                      onClick={handleStartCameraScan}
                      className="bg-slate-800 hover:bg-slate-700 text-white px-3.5 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer"
                    >
                      {isAmharic ? 'እንደገና ሞክር' : 'Retry Camera'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2 p-3 w-full max-w-md mx-auto flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
                  <Icon className="material-symbols-outlined text-[28px] animate-pulse">
                    qr_code_scanner
                  </Icon>
                </div>
                <h4 className="text-xs font-bold text-slate-100">
                  {isAmharic ? 'የQR ኮድ ፍተሻ' : 'QR Verification'}
                </h4>
                <div className="grid grid-cols-2 gap-2 w-full pt-0.5">
                  <button
                    type="button"
                    onClick={handleStartCameraScan}
                    className="bg-primary hover:bg-primary-hover text-white px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Icon className="material-symbols-outlined text-[18px]">photo_camera</Icon>
                    <span>{isAmharic ? 'ካሜራ' : 'Camera'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                        fileInputRef.current.click();
                      }
                    }}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer transition-colors flex items-center justify-center gap-1.5 border border-slate-700"
                  >
                    <Icon className="material-symbols-outlined text-[18px]">image</Icon>
                    <span>{isAmharic ? 'ምስል ስካን' : 'Image Scan'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : scannedRegResult === 'not_found' ? (
        <div className="bg-transparent p-4 sm:p-6 m-0 rounded-none border-0 text-xs sm:text-sm shadow-none space-y-3 animate-in fade-in duration-150 flex flex-col h-full max-h-full overflow-hidden justify-center">
          {/* Top Status Header Bar inside the container */}
          <div className="flex items-center justify-between gap-2 w-full">
            <div className="flex-1 flex items-center justify-between bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/80 text-red-950 dark:text-red-300 rounded-md px-3.5 py-1.5 shadow-2xs">
              <div className="flex items-center gap-2">
                <Icon className="material-symbols-outlined text-[24px] select-none text-red-600 dark:text-red-400">
                  cancel
                </Icon>
                <span className="font-black text-sm sm:text-base">
                  {isAmharic ? 'ያልተፈቀደለት የሞተር ፈቃድ' : 'Motor Permit Status'}
                </span>
              </div>
              <div className="bg-red-200/60 dark:bg-red-900/60 text-red-900 dark:text-red-200 border border-red-300 dark:border-red-700 text-xs px-2.5 py-0.5 rounded-lg uppercase tracking-wider font-extrabold shadow-2xs">
                {isAmharic ? 'ያልተመዘገበ' : 'UNREGISTERED'}
              </div>
            </div>
          </div>

          <div className="space-y-2 flex flex-col items-center justify-center py-4">
            <div className="w-12 h-12 rounded-full bg-error-container/30 border border-error/30 flex items-center justify-center text-error mb-1">
              <Icon className="material-symbols-outlined text-[28px]">
                error_outline
              </Icon>
            </div>
            <h4 className="text-xs sm:text-sm font-bold text-on-surface">
              {isAmharic ? 'መረጃው አልተገኘም' : 'Record Not Found'}
            </h4>
            <p className="text-[11px] text-secondary text-center max-w-sm">
              {isAmharic 
                ? 'የቃኙት QR ኮድ ወይም ያስገቡት መረጃ አልተገኘም። እባክዎ በድጋሚ ይሞክሩ።' 
                : 'Scanned record not found in system registry.'}
            </p>
            <button
               type="button"
               onClick={handleRescan}
               className="bg-primary hover:bg-primary-hover text-white px-4 py-1.5 rounded-md text-xs font-bold cursor-pointer transition-colors flex items-center gap-1.5 shadow-xs"
             >
               <Icon className="material-symbols-outlined text-[16px]">qr_code_scanner</Icon>
               <span>{isAmharic ? 'ድጋሚ ቃኝ' : 'Rescan'}</span>
             </button>
          </div>
        </div>
      ) : (
        <div className={`${activeTheme.containerBg} p-0 m-0 text-xs sm:text-sm flex flex-col h-full max-h-full overflow-hidden shadow-none animate-in fade-in duration-150`}>
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
                <div className={`flex items-center justify-between py-3.5 px-4 shrink-0 border-b-2 z-10 shadow-sm transition-all ${
                  isApproved 
                    ? activeTheme.headerApproved 
                    : isExpired || isPending 
                    ? activeTheme.headerPending 
                    : activeTheme.headerRejected
                }`}>
                  {/* Rescan Button on Left */}
                  <button
                    type="button"
                    onClick={handleRescan}
                    className="w-9 h-9 rounded-md bg-white/20 hover:bg-white/30 text-white transition-colors cursor-pointer flex items-center justify-center shrink-0 shadow-sm border border-white/40"
                    title={isAmharic ? 'ድጋሚ ቃኝ' : 'Rescan'}
                  >
                    <Icon className="material-symbols-outlined text-[22px] font-bold">chevron_left</Icon>
                  </button>

                  {/* Center Verification Status Pill matching the uploaded screenshot */}
                  <div className="flex items-center gap-2">
                    <Icon className="material-symbols-outlined text-[26px] text-white">
                      {isApproved ? 'check_circle' : isPending ? 'warning' : 'cancel'}
                    </Icon>
                    <span className="font-black text-base sm:text-lg tracking-tight text-white">
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
                  <button
                    type="button"
                    onClick={() => setShowNotesSection(!showNotesSection)}
                    className={`w-9 h-9 rounded-md transition-all cursor-pointer flex items-center justify-center shrink-0 shadow-sm ${
                      showNotesSection
                        ? 'bg-white text-slate-900 border border-white font-bold'
                        : 'bg-white/20 hover:bg-white/30 text-white border border-white/40'
                    }`}
                    title={isAmharic ? 'ማስታወሻ ጨምር' : 'Add Inspection Note'}
                  >
                    <Icon className="material-symbols-outlined text-[20px] font-bold">
                      {showNotesSection ? 'edit_note' : 'note_add'}
                    </Icon>
                  </button>
                </div>

                {/* 2. MIDDLE SCROLLABLE BODY CONTENT */}
                <div className={`flex-1 overflow-y-auto min-h-0 p-1 sm:p-1.5 md:p-2 space-y-1.5 max-w-2xl mx-auto w-full ${activeTheme.bodyBg}`}>
                  
                  {/* Warning Alert for Pending Status */}
                  {isPending && (
                    <div className="bg-amber-100/90 dark:bg-amber-950/90 border-2 border-amber-500 dark:border-amber-600 p-2 rounded-md text-xs flex items-start gap-2 shadow-xs">
                      <div className="w-7 h-7 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 font-black">
                        <Icon className="material-symbols-outlined text-[20px]">warning</Icon>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-amber-950 dark:text-amber-100 text-xs">
                          {isAmharic ? 'ማስጠንቀቂያ፡ ማረጋገጫ በመጠባበቅ ላይ ያለ' : 'WARNING: PENDING APPROVAL'}
                        </p>
                        <p className="mt-0.5 text-[10px] text-amber-900 dark:text-amber-200 font-extrabold leading-tight">
                          {isAmharic
                            ? 'ይህ ተሽከርካሪ በስርዓቱ ከተመዘገቡት መረጃዎች መካከል ቢገኝም በከተማው አስተዳደር ገና አልጸደቀም።'
                            : 'This vehicle record exists in the system but is PENDING ADMIN APPROVAL.'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* =========================================================
                      CARD 1: OWNER & PRIMARY MOTORCYCLE INFO
                      ========================================================= */}
                  <div className={`${activeTheme.ownerCardBg || activeTheme.cardBg} border-2 rounded-md p-2 sm:p-2.5 shadow-xs space-y-2`}>
                    
                    {/* Top Row: Portrait Image on Left & Info Details on Right */}
                    <div className="flex items-start gap-2.5">
                      
                      {/* Left: Portrait Photo or Cyan Monogram (As in Attachment 1) */}
                      <div 
                        onClick={() => openDocumentCarousel(portraitUrl, `${scannedRegResult.fullName} — ${isAmharic ? 'የባለቤት ፎቶ' : 'Owner Portrait'}`)}
                        className="w-28 h-36 sm:w-32 sm:h-40 rounded-md overflow-hidden bg-slate-100 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 shrink-0 shadow-xs cursor-pointer relative group flex items-center justify-center"
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
                          <Icon className="material-symbols-outlined text-[24px] font-black">zoom_in</Icon>
                        </div>
                      </div>

                      {/* Right: Owner & Vehicle Specs List */}
                      <div className="flex-1 min-w-0 space-y-1.5 text-xs">
                        {/* Owner Full Name */}
                        <div>
                          <span className={`text-[10px] ${activeTheme.labelText} font-extrabold block`}>
                            {isAmharic ? 'የባለቤት መረጃ' : 'Owner Info'}
                          </span>
                          <h3 className={`text-sm sm:text-base font-black ${activeTheme.headingText} leading-tight mt-0.5 truncate`}>
                            {scannedRegResult.fullName}
                          </h3>
                        </div>

                        {/* ID Number */}
                        <div>
                          <span className={`text-[10px] ${activeTheme.labelText} font-extrabold block`}>
                            {isAmharic ? 'መለያ ቁጥር' : 'ID Number'}
                          </span>
                          <span className={`text-xs font-black font-mono ${activeTheme.headingText} block mt-0.5`}>
                            {scannedRegResult.id}
                          </span>
                        </div>

                        {/* Plate Number */}
                        <div>
                          <span className={`text-[10px] ${activeTheme.labelText} font-extrabold block`}>
                            {isAmharic ? 'ሰሌዳ ቁጥር' : 'Plate Number'}
                          </span>
                          <span className={`text-xs font-black font-mono ${activeTheme.plateBadge} block mt-0.5 px-2 py-0.5 rounded-md inline-block`}>
                            {scannedRegResult.plateNumber}
                          </span>
                        </div>

                        {/* Authorized Motor */}
                        <div>
                          <span className={`text-[10px] ${activeTheme.labelText} font-extrabold block`}>
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
                  <div className={`${activeTheme.specCardBg || activeTheme.cardBg} border-2 rounded-md p-2 sm:p-2.5 shadow-xs space-y-2`}>
                    <h3 className={`text-xs sm:text-sm font-black ${activeTheme.headingText} flex items-center gap-1.5`}>
                      <Icon className={`material-symbols-outlined ${activeTheme.sectionIconColor} text-[18px]`}>two_wheeler</Icon>
                      <span>{isAmharic ? 'ተጨማሪ የተሽከርካሪ ዝርዝሮች' : 'Additional Vehicle Details'}</span>
                    </h3>

                    {/* 2-Column Horizontal Grid with Related Info Grouped in Rows */}
                    <div className="grid grid-cols-2 gap-2">
                      {/* Pair 1, Col 1: Motor Brand */}
                      <div className={`flex items-center gap-2 p-1.5 ${activeTheme.chipBg} rounded-lg border min-w-0`}>
                        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full ${activeTheme.iconCircle} flex items-center justify-center shrink-0 shadow-xs`}>
                          <Icon className="material-symbols-outlined text-[15px] sm:text-[16px]">two_wheeler</Icon>
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className={`text-[10px] ${activeTheme.labelText} font-extrabold block truncate`}>
                            {isAmharic ? 'የሞተር ምርት' : 'Motor Brand'}
                          </span>
                          <span className={`text-xs font-black ${activeTheme.headingText} block truncate`}>
                            {scannedRegResult.motorBrand || '—'}
                          </span>
                        </div>
                      </div>

                      {/* Pair 1, Col 2: Model */}
                      <div className={`flex items-center gap-2 p-1.5 ${activeTheme.chipBg} rounded-lg border min-w-0`}>
                        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full ${activeTheme.iconCircle} flex items-center justify-center shrink-0 shadow-xs`}>
                          <Icon className="material-symbols-outlined text-[15px] sm:text-[16px]">calendar_today</Icon>
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className={`text-[10px] ${activeTheme.labelText} font-extrabold block truncate`}>
                            {isAmharic ? 'ሞዴል' : 'Model'}
                          </span>
                          <span className={`text-xs font-black ${activeTheme.headingText} block truncate`}>
                            {scannedRegResult.motorModel || '—'}
                          </span>
                        </div>
                      </div>

                      {/* Pair 2, Col 1: Registration Date */}
                      <div className={`flex items-center gap-2 p-1.5 ${activeTheme.chipBg} rounded-lg border min-w-0`}>
                        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full ${activeTheme.iconCircle} flex items-center justify-center shrink-0 shadow-xs`}>
                          <Icon className="material-symbols-outlined text-[15px] sm:text-[16px]">date_range</Icon>
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className={`text-[10px] ${activeTheme.labelText} font-extrabold block truncate`}>
                            {isAmharic ? 'የተመዘገበበት ቀን' : 'Reg. Date'}
                          </span>
                          <span className={`text-xs font-black font-mono ${activeTheme.headingText} block truncate`}>
                            {scannedRegResult.registrationDate || '—'}
                          </span>
                        </div>
                      </div>

                      {/* Pair 2, Col 2: Permit Status */}
                      <div className={`flex items-center gap-2 p-1.5 ${activeTheme.chipBg} rounded-lg border min-w-0`}>
                        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full ${activeTheme.iconCircle} flex items-center justify-center shrink-0 shadow-xs`}>
                          <Icon className="material-symbols-outlined text-[15px] sm:text-[16px]">
                            {isApproved ? 'check_circle' : isExpired || isPending ? 'warning' : 'cancel'}
                          </Icon>
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className={`text-[10px] ${activeTheme.labelText} font-extrabold block truncate`}>
                            {isAmharic ? 'የፈቃድ ሁኔታ' : 'Permit Status'}
                          </span>
                          <span className={`text-xs font-black block truncate ${
                            isApproved
                              ? 'text-emerald-700 dark:text-emerald-300'
                              : isExpired || isPending
                              ? 'text-amber-700 dark:text-amber-300'
                              : 'text-rose-700 dark:text-rose-300'
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
                      <div className={`flex items-center gap-2 p-1.5 ${activeTheme.chipBg} rounded-lg border min-w-0`}>
                        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full ${activeTheme.iconCircle} flex items-center justify-center shrink-0 shadow-xs`}>
                          <Icon className="material-symbols-outlined text-[15px] sm:text-[16px]">location_city</Icon>
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className={`text-[10px] ${activeTheme.labelText} font-extrabold block truncate`}>
                            {isAmharic ? 'ክፍለ ከተማ' : 'Sub-City'}
                          </span>
                          <span className={`text-xs font-black ${activeTheme.headingText} block truncate`}>
                            {scannedRegResult.subCity || '—'}
                          </span>
                        </div>
                      </div>

                      {/* Pair 3, Col 2: Phone Number */}
                      <div className={`flex items-center gap-2 p-1.5 ${activeTheme.chipBg} rounded-lg border min-w-0`}>
                        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full ${activeTheme.iconCircle} flex items-center justify-center shrink-0 shadow-xs`}>
                          <Icon className="material-symbols-outlined text-[15px] sm:text-[16px]">call</Icon>
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className={`text-[10px] ${activeTheme.labelText} font-extrabold block truncate`}>
                            {isAmharic ? 'ስልክ ቁጥር' : 'Phone Number'}
                          </span>
                          <span className={`text-xs font-black font-mono ${activeTheme.headingText} block truncate`}>
                            {scannedRegResult.phone || '—'}
                          </span>
                        </div>
                      </div>

                      {/* Pair 4, Col 1: Blood Group */}
                      <div className={`flex items-center gap-2 p-1.5 ${activeTheme.chipBg} rounded-lg border min-w-0`}>
                        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full ${activeTheme.iconCircle} flex items-center justify-center shrink-0 shadow-xs`}>
                          <Icon className="material-symbols-outlined text-[15px] sm:text-[16px]">bloodtype</Icon>
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className={`text-[10px] ${activeTheme.labelText} font-extrabold block truncate`}>
                            {isAmharic ? 'የደም ዓይነት' : 'Blood Group'}
                          </span>
                          <span className="text-xs font-black text-red-700 dark:text-red-400 block truncate">
                            {scannedRegResult.bloodGroup || '—'}
                          </span>
                        </div>
                      </div>

                      {/* Pair 4, Col 2: Vehicle Category / Fuel */}
                      <div className={`flex items-center gap-2 p-1.5 ${activeTheme.chipBg} rounded-lg border min-w-0`}>
                        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full ${activeTheme.iconCircle} flex items-center justify-center shrink-0 shadow-xs`}>
                          <Icon className="material-symbols-outlined text-[15px] sm:text-[16px]">
                            {scannedRegResult.vehicleCategory === 'electric' ? 'electric_moped' : 'local_gas_station'}
                          </Icon>
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className={`text-[10px] ${activeTheme.labelText} font-extrabold block truncate`}>
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
                                } else {
                                  setExpandedVehicleSpecs(true);
                                }
                              }}
                              className={`flex items-center gap-2 p-1.5 rounded-lg border min-w-0 transition-all ${
                                dlPhoto
                                  ? `${activeTheme.chipBg} cursor-pointer shadow-xs hover:brightness-105`
                                  : 'bg-slate-100/60 dark:bg-slate-900/40 border-slate-300/60 dark:border-slate-700/60'
                              }`}
                              title={dlPhoto ? (isAmharic ? 'መንጃ ፍቃድ ለማየት ይጫኑ' : 'Click to view driving license') : undefined}
                            >
                              <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full ${activeTheme.iconCircle} flex items-center justify-center shrink-0 shadow-xs`}>
                                <Icon className="material-symbols-outlined text-[15px] sm:text-[16px]">card_membership</Icon>
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className={`text-[10px] ${activeTheme.labelText} font-extrabold block truncate`}>
                                  {isAmharic ? 'የመንጃ ፍቃድ' : 'Driving License'}
                                </span>
                                <span className={`text-xs font-black block truncate flex items-center gap-1 ${
                                  dlPhoto ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'
                                }`}>
                                  {dlPhoto ? (
                                    <>
                                      <span>{isAmharic ? 'የተያያዘ (ይመልከቱ)' : 'Attached (View)'}</span>
                                      <Icon className="material-symbols-outlined text-[13px]">visibility</Icon>
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
                                } else {
                                  setExpandedVehicleSpecs(true);
                                }
                              }}
                              className={`flex items-center gap-2 p-1.5 rounded-lg border min-w-0 transition-all ${
                                ppPhoto
                                  ? `${activeTheme.chipBg} cursor-pointer shadow-xs hover:brightness-105`
                                  : 'bg-slate-100/60 dark:bg-slate-900/40 border-slate-300/60 dark:border-slate-700/60'
                              }`}
                              title={ppPhoto ? (isAmharic ? 'የፖሊስ ፈቃድ ለማየት ይጫኑ' : 'Click to view police permit') : undefined}
                            >
                              <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full ${activeTheme.iconCircle} flex items-center justify-center shrink-0 shadow-xs`}>
                                <Icon className="material-symbols-outlined text-[15px] sm:text-[16px]">local_police</Icon>
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className={`text-[10px] ${activeTheme.labelText} font-extrabold block truncate`}>
                                  {isAmharic ? 'የፖሊስ ፈቃድ' : 'Police Permit'}
                                </span>
                                <span className={`text-xs font-black block truncate flex items-center gap-1 ${
                                  ppPhoto ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'
                                }`}>
                                  {ppPhoto ? (
                                    <>
                                      <span>{isAmharic ? 'የተሰጠ (ይመልከቱ)' : 'Valid (View)'}</span>
                                      <Icon className="material-symbols-outlined text-[13px]">visibility</Icon>
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

                    {/* Action Button at bottom: 'ዝርዝር መረጃ' */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setExpandedVehicleSpecs((prev) => !prev)}
                        className={`w-full ${activeTheme.actionButton} active:scale-[0.99] font-black py-2.5 px-3 rounded-md text-center shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs`}
                      >
                        <Icon className="material-symbols-outlined text-[18px]">
                          {expandedVehicleSpecs ? 'expand_less' : 'description'}
                        </Icon>
                        <span>{isAmharic ? (expandedVehicleSpecs ? 'መረጃዎችን ደብቅ' : 'ዝርዝር መረጃ') : (expandedVehicleSpecs ? 'Hide Details' : 'Detailed Documents & Info')}</span>
                      </button>
                    </div>
                  </div>

                  {/* =========================================================
                      EXPANDABLE DETAILS & DOCUMENT ATTACHMENTS (When expanded)
                      ========================================================= */}
                  <AnimatePresence>
                    {expandedVehicleSpecs && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        className="overflow-hidden space-y-4"
                      >
                        {/* Document Credentials */}
                        <div className={`${activeTheme.cardBg} border-2 rounded-lg p-4 sm:p-5 shadow-sm space-y-3`}>
                          <div className="flex items-center justify-between">
                            <h4 className={`font-bold text-xs sm:text-sm ${activeTheme.headingText} flex items-center gap-2`}>
                              <Icon className={`material-symbols-outlined ${activeTheme.sectionIconColor} text-[20px]`}>folder_shared</Icon>
                              <span>{isAmharic ? 'የአባልነት ማስረጃዎች እና ሰነዶች' : 'Member Credentials & Documents'}</span>
                            </h4>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">{isAmharic ? 'ለማጉላት ይጫኑ' : 'Click to zoom'}</span>
                          </div>

                          {(() => {
                            const policePermitPhoto =
                              scannedRegResult.drivingPermitPhoto ||
                              (scannedRegResult as any).driving_permit_photo ||
                              (scannedRegResult as any).policePermitPhoto ||
                              (scannedRegResult as any).policePermit || '';

                            const drivingLicensePhoto =
                              scannedRegResult.drivingLicensePhoto ||
                              (scannedRegResult as any).driving_license_photo ||
                              (scannedRegResult as any).driverLicensePhoto ||
                              (scannedRegResult as any).licensePhoto || '';

                            const nationalIdPhoto =
                              scannedRegResult.nationalIdPhoto ||
                              (scannedRegResult as any).national_id_photo || '';

                            const nationalIdBackPhoto =
                              scannedRegResult.nationalIdBackPhoto ||
                              (scannedRegResult as any).national_id_back_photo || '';

                            return (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                {/* Police Permit Card - Increased Height & Prominent */}
                                {policePermitPhoto ? (
                                  <div
                                    onClick={() => openDocumentCarousel(
                                      policePermitPhoto,
                                      `${scannedRegResult.fullName} — ${isAmharic ? 'የፖሊስ የመንቀሳቀሻ ፈቃድ' : 'Police Permit'}`
                                    )}
                                    className={`group cursor-pointer ${activeTheme.docCardBg} hover:brightness-105 border ${activeTheme.docCardBorder} p-3 rounded-lg text-center space-y-2 transition-all shadow-xs ${
                                      !isSuperAdmin && !drivingLicensePhoto ? 'sm:col-span-2' : ''
                                    }`}
                                  >
                                    <div className="relative h-64 sm:h-72 rounded-lg overflow-hidden bg-slate-900 flex items-center justify-center">
                                      <SmartImage
                                        src={policePermitPhoto}
                                        alt="Police Permit"
                                        fallbackIcon="menu_book"
                                        className="w-full h-full object-cover group-hover:scale-103 transition-transform"
                                      />
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                        <Icon className="material-symbols-outlined text-[28px]">zoom_in</Icon>
                                      </div>
                                    </div>
                                    <span className={`text-xs sm:text-sm font-black ${activeTheme.headingText} block truncate`}>
                                      {isAmharic ? 'የፖሊስ ፈቃድ' : 'Police Permit'}
                                    </span>
                                  </div>
                                ) : (
                                  <div className={`bg-slate-50/80 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 p-3 rounded-lg text-center space-y-2 ${
                                    !isSuperAdmin && !drivingLicensePhoto ? 'sm:col-span-2' : ''
                                  }`}>
                                    <div className="h-64 sm:h-72 rounded-lg bg-slate-200/50 dark:bg-slate-900/50 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 gap-2">
                                      <Icon className="material-symbols-outlined text-[40px] text-slate-400">local_police</Icon>
                                      <span className="text-xs font-bold">{isAmharic ? 'ሰነድ አልተያያዘም' : 'No permit attached'}</span>
                                    </div>
                                    <span className="text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-400 block truncate">
                                      {isAmharic ? 'የፖሊስ ፈቃድ (የለም)' : 'Police Permit (None)'}
                                    </span>
                                  </div>
                                )}

                                {/* Driver License Card */}
                                {drivingLicensePhoto ? (
                                  <div
                                    onClick={() => openDocumentCarousel(
                                      drivingLicensePhoto,
                                      `${scannedRegResult.fullName} — ${isAmharic ? 'የመንጃ ፍቃድ' : 'Driver License'}`
                                    )}
                                    className={`group cursor-pointer ${activeTheme.docCardBg} hover:brightness-105 border ${activeTheme.docCardBorder} p-3 rounded-lg text-center space-y-2 transition-all shadow-xs`}
                                  >
                                    <div className="relative h-64 sm:h-72 rounded-lg overflow-hidden bg-slate-900 flex items-center justify-center">
                                      <SmartImage
                                        src={drivingLicensePhoto}
                                        alt="Driver License"
                                        fallbackIcon="card_membership"
                                        className="w-full h-full object-cover group-hover:scale-103 transition-transform"
                                      />
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                        <Icon className="material-symbols-outlined text-[28px]">zoom_in</Icon>
                                      </div>
                                    </div>
                                    <span className={`text-xs sm:text-sm font-black ${activeTheme.headingText} block truncate`}>
                                      {isAmharic ? 'የመንጃ ፍቃድ' : 'Driver License'}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="bg-slate-50/80 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 p-3 rounded-lg text-center space-y-2">
                                    <div className="h-64 sm:h-72 rounded-lg bg-slate-200/50 dark:bg-slate-900/50 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 gap-2">
                                      <Icon className="material-symbols-outlined text-[40px] text-slate-400">card_membership</Icon>
                                      <span className="text-xs font-bold">{isAmharic ? 'ሰነድ አልተያያዘም' : 'No license attached'}</span>
                                    </div>
                                    <span className="text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-400 block truncate">
                                      {isAmharic ? 'የመንጃ ፍቃድ (የለም)' : 'Driver License (None)'}
                                    </span>
                                  </div>
                                )}

                                {/* National ID (Front) - Visible ONLY for SuperAdmin */}
                                {isSuperAdmin && nationalIdPhoto && (
                                  <div
                                    onClick={() => openDocumentCarousel(
                                      nationalIdPhoto,
                                      `${scannedRegResult.fullName} — ${isAmharic ? 'ብሔራዊ መታወቂያ (ፊት)' : 'National ID (Front)'}`
                                    )}
                                    className={`group cursor-pointer ${activeTheme.docCardBg} hover:brightness-105 border ${activeTheme.docCardBorder} p-2.5 rounded-md text-center space-y-1.5 transition-all`}
                                  >
                                    <div className="relative h-48 sm:h-56 rounded-lg overflow-hidden bg-slate-900 flex items-center justify-center">
                                      <SmartImage
                                        src={nationalIdPhoto}
                                        alt="National ID Front"
                                        fallbackIcon="badge"
                                        className="w-full h-full object-cover group-hover:scale-103 transition-transform"
                                      />
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                        <Icon className="material-symbols-outlined text-[24px]">zoom_in</Icon>
                                      </div>
                                    </div>
                                    <span className={`text-xs font-bold ${activeTheme.headingText} block truncate`}>
                                      {isAmharic ? 'ብሔራዊ መታወቂያ (ፊት)' : 'National ID (Front)'}
                                    </span>
                                  </div>
                                )}

                                {/* National ID (Back) - Visible ONLY for SuperAdmin */}
                                {isSuperAdmin && nationalIdBackPhoto && (
                                  <div
                                    onClick={() => openDocumentCarousel(
                                      nationalIdBackPhoto,
                                      `${scannedRegResult.fullName} — ${isAmharic ? 'ብሔራዊ መታወቂያ (ጀርባ)' : 'National ID (Back)'}`
                                    )}
                                    className={`group cursor-pointer ${activeTheme.docCardBg} hover:brightness-105 border ${activeTheme.docCardBorder} p-2.5 rounded-md text-center space-y-1.5 transition-all`}
                                  >
                                    <div className="relative h-48 sm:h-56 rounded-lg overflow-hidden bg-slate-900 flex items-center justify-center">
                                      <SmartImage
                                        src={nationalIdBackPhoto}
                                        alt="National ID Back"
                                        fallbackIcon="badge"
                                        className="w-full h-full object-cover group-hover:scale-103 transition-transform"
                                      />
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                        <Icon className="material-symbols-outlined text-[24px]">zoom_in</Icon>
                                      </div>
                                    </div>
                                    <span className={`text-xs font-bold ${activeTheme.headingText} block truncate`}>
                                      {isAmharic ? 'ብሔራዊ መታወቂያ (ጀርባ)' : 'National ID (Back)'}
                                    </span>
                                  </div>
                                )}

                                {/* Digital ID Card Preview (Motorcyclists Association ID) - Visible ONLY for SuperAdmin */}
                                {isSuperAdmin && (
                                  <div
                                    onClick={() => setShowDigitalIdModal(true)}
                                    className={`group cursor-pointer ${activeTheme.docCardBg} hover:brightness-105 border ${activeTheme.docCardBorder} p-2.5 rounded-md text-center space-y-1.5 transition-all sm:col-span-2`}
                                  >
                                    <div className="relative rounded-md overflow-hidden bg-slate-950 flex items-center justify-center p-2 border border-slate-800">
                                      <QRCodeCard registration={scannedRegResult} lang={lang} />
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                        <Icon className="material-symbols-outlined text-[28px]">zoom_in</Icon>
                                      </div>
                                    </div>
                                    <span className={`text-xs font-black ${activeTheme.headingText} block`}>
                                      {isAmharic ? 'የሞተረኞች ማህበር መታወቂያ (SuperAdmin ብቻ)' : 'Motorcyclists Association ID (SuperAdmin Only)'}
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Municipal Copyright Footer matching Attachment Screenshots */}
                  <div className="pt-3 pb-1 text-center text-[10px] sm:text-[11px] font-medium opacity-80">
                    <p className={activeTheme.footerText}>
                      {isAmharic
                        ? '© 2016 የግንቦት 12 የባህር ዳር ክፍለ ከተሞች ፈቃድ ቁጥጥር ስርዓት። መብቱ የተጠበቀ ነው።'
                        : '© 2026 Bahir Dar Sub-Cities Permit Control System. All rights reserved.'}
                    </p>
                  </div>

                  {/* Action Buttons: Scan Again / Back */}
                  <div className="pt-2 pb-6 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleRescan}
                      className="flex-1 bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-bold py-3 px-4 rounded-md text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer border border-outline-variant/60 shadow-xs"
                    >
                      <Icon className="material-symbols-outlined text-[18px]">qr_code_scanner</Icon>
                      <span>{isAmharic ? 'ሌላ QR ኮድ ቃኝ' : 'Scan Next QR'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowNotesSection(!showNotesSection)}
                      className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 font-bold py-3 px-4 rounded-md text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
                    >
                      <Icon className="material-symbols-outlined text-[18px]">edit_note</Icon>
                      <span>{isAmharic ? 'ማስታወሻ' : 'Notes'}</span>
                    </button>
                  </div>
                </div>

                {/* 3. FIXED BOTTOM SECTION WITH SLIDEOUT INSPECTION NOTES */}
                <div className="shrink-0 bg-surface-container-lowest border-t border-outline-variant/60 z-20 shadow-lg relative flex flex-col">
                  {/* Slideout Inspection Notes Form */}
                  <AnimatePresence>
                    {showNotesSection && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="overflow-hidden bg-surface-container-low/70 border-b border-outline-variant/40"
                      >
                        <div className="p-3.5 sm:p-4 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                              <Icon className="material-symbols-outlined text-[18px] text-primary">edit_note</Icon>
                              <span>{isAmharic ? 'የተቆጣጣሪ ማስታወሻ' : 'Inspection Notes'}</span>
                            </label>
                            <button
                              type="button"
                              onClick={() => setShowNotesSection(false)}
                              className="text-secondary hover:text-on-surface p-1 rounded-lg hover:bg-surface-container text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <Icon className="material-symbols-outlined text-[18px]">keyboard_arrow_down</Icon>
                              <span>{isAmharic ? 'ደብቅ' : 'Hide'}</span>
                            </button>
                          </div>
                          <textarea
                            rows={2}
                            value={verificationNotes}
                            onChange={(e) => handleNoteChange(e.target.value)}
                            placeholder={isAmharic ? 'ማስታወሻ ይጻፉ...' : 'Type inspection notes...'}
                            className="w-full bg-surface border border-outline-variant rounded-md px-3 py-2 text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-primary shadow-xs"
                            autoFocus
                          />
                          
                          {/* Record Button ('መዝግብ' / 'Record') inside inspection notes container */}
                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                if (currentLog && onAddVerificationLog) {
                                  const finalLog: VerificationLog = {
                                    ...currentLog,
                                    officerNotes: verificationNotes || currentLog.officerNotes,
                                    scannedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
                                  };
                                  onAddVerificationLog(finalLog, true);
                                }
                                onClose();
                                handleRescan();
                              }}
                              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-5 py-2.5 rounded-md transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                            >
                              <Icon className="material-symbols-outlined text-[18px] shrink-0">check_circle</Icon>
                              <span>{isAmharic ? 'መዝግብ' : 'Record'}</span>
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>


                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* DIGITAL ID LIGHTBOX MODAL (SuperAdmin Only) */}
      {showDigitalIdModal && isSuperAdmin && (
        <div
          className="fixed inset-0 z-[10000] bg-black/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150 overflow-y-auto"
          onClick={() => setShowDigitalIdModal(false)}
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl">
            <ZoomableDocumentContainer
              lang={lang}
              userRole={userRole as any}
              title={isAmharic ? 'የሞተረኞች ማህበር መታወቂያ' : 'Motorcyclists Association ID'}
              onClose={() => setShowDigitalIdModal(false)}
              requireClerkRequest={false}
            >
              <div className="p-4 bg-white dark:bg-slate-900 flex items-center justify-center">
                <QRCodeCard registration={scannedRegResult} lang={lang} />
              </div>
            </ZoomableDocumentContainer>
          </div>
        </div>
      )}

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
    <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-0 overflow-hidden transition-all duration-200">
      <div className="bg-surface rounded-none p-0 m-0 w-full max-w-full sm:max-w-6xl h-[100dvh] sm:h-[98vh] max-h-[100dvh] shadow-2xl flex flex-col overflow-hidden">
        {mainCardContent}
      </div>
    </div>
  );
};
