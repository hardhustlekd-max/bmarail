import React, { useState, useRef, useEffect } from 'react';
import { Icon } from './ui/Icon';
import { QRCodeSVG } from 'qrcode.react';
import { MotorcycleRegistration, Language, APP_LOGO, APP_FLAG } from '../types';
import { SmartImage } from './SmartImage';

interface QRCodeCardProps {
  registration: Partial<MotorcycleRegistration>;
  lang: Language;
}

export const autoCapitalize = (str?: string): string => {
  if (!str) return '';
  return str
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

export const QRCodeCard: React.FC<QRCodeCardProps> = ({ registration, lang }) => {
  const isAmharic = lang === 'am';
  const [printError, setPrintError] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [standaloneFitScale, setStandaloneFitScale] = useState<number>(1);
  const [isInZoomable, setIsInZoomable] = useState<boolean>(false);

  useEffect(() => {
    const updateScale = () => {
      if (containerRef.current) {
        if (containerRef.current.closest('[data-zoomable-container="true"]')) {
          setStandaloneFitScale(1);
          setIsInZoomable(true);
          return;
        }
        setIsInZoomable(false);
        const parentWidth = containerRef.current.parentElement?.clientWidth || window.innerWidth;
        const available = Math.min(parentWidth - 16, 580);
        if (available > 0 && available < 580) {
          setStandaloneFitScale(Number((available / 580).toFixed(3)));
        } else {
          setStandaloneFitScale(1);
        }
      }
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  if (!registration) return null;

  const formatNameDisplay = (rawName?: string) => {
    if (!rawName || rawName.trim() === '') return { am: '—', en: '' };
    const match = rawName.match(/^(.*?)\s*\((.*?)\)$/) || rawName.match(/^(.*?)\s*-\s*(.*?)$/);
    if (match) {
      const part1 = match[1].trim();
      const part2 = match[2].trim();
      const isAmh = (s: string) => /[\u1200-\u137F]/.test(s);
      if (isAmh(part2)) {
        return { am: part2, en: autoCapitalize(part1) };
      }
      if (isAmh(part1)) {
        return { am: part1, en: autoCapitalize(part2) };
      }
      return { am: part1, en: autoCapitalize(part2) };
    }
    const isAmhOnly = /[\u1200-\u137F]/.test(rawName);
    if (isAmhOnly) {
      return { am: rawName, en: '' };
    }
    return { am: rawName, en: autoCapitalize(rawName) };
  };

  const nameParts = formatNameDisplay(registration.fullName);

  const formatMemberId = (rawId?: string) => {
    if (!rawId || rawId.trim() === '') return '—';
    if (rawId.startsWith('MB-')) return rawId;
    if (rawId.startsWith('REG-')) return rawId.replace('REG-', 'MB-');
    if (rawId.startsWith('EL') || rawId.startsWith('EN')) return rawId;
    return `MB-${rawId}`;
  };

  const idNo = formatMemberId(registration.id);
  const plateNo = registration.plateNumber || '—';
  const bloodGroup = registration.bloodGroup || 'O+';
  const phone = registration.phone || '—';

  const issueDate = registration.registrationDate
    ? registration.registrationDate.split(' ')[0]
    : new Date().toISOString().split('T')[0];

  const computeExpiry = () => {
    try {
      const parts = issueDate.split(/[-/]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          const year = parseInt(parts[0], 10) + 1;
          return `${year}-${parts[1]}-${parts[2]}`;
        } else {
          const year = parseInt(parts[2], 10) + 1;
          return `${parts[0]}/${parts[1]}/${year}`;
        }
      }
    } catch {}
    return '2027-08-18';
  };
  const expiryDate = computeExpiry();

  const portraitPhoto = registration.userPortraitPhoto || registration.nationalIdPhoto || '';
  const qrVal = registration.qrCodeData || `https://enforcement.gov.et/verify/${registration.id || plateNo}`;

  return (
    <div
      ref={containerRef}
      className={isInZoomable ? "shrink-0 flex flex-col items-center font-sans py-1" : "w-full flex flex-col items-center font-sans py-1 max-w-full overflow-hidden"}
    >
      <div
        style={{
          width: standaloneFitScale < 1 ? `${580 * standaloneFitScale}px` : '580px',
          height: standaloneFitScale < 1 ? `${(366 + 48) * standaloneFitScale}px` : 'auto',
        }}
        className="flex flex-col items-center gap-3 shrink-0 mx-auto relative origin-top"
      >
        <div
          style={{
            transform: standaloneFitScale < 1 ? `scale(${standaloneFitScale})` : 'none',
            transformOrigin: 'top center',
          }}
          className="flex flex-col items-center gap-3 w-[580px] shrink-0"
        >
        
        {/* Replica of Member ID Card matching professional municipal ID standards */}
        <div id="pvc-card-front" className="printable-id-card w-[580px] h-[366px] bg-white rounded-xl shadow-2xl border border-neutral-300 overflow-hidden text-neutral-900 relative shrink-0 select-none font-sans flex flex-col justify-between">
          
          {/* TOP HEADER BANNER - Corporate Green Header with Grid Alignment & Charcoal Text Stroke */}
          <div className="bg-gradient-to-r from-[#24963e] via-[#2ea44f] to-[#24963e] text-white px-4 py-1.5 grid grid-cols-[72px_1fr_72px] items-center relative z-20 min-h-[76px] h-[76px] shrink-0 border-b border-black/10 shadow-md">
            
            {/* Left Emblem Logo */}
            <div className="flex items-center justify-start shrink-0">
              <div className="w-14 h-14 rounded-full bg-white shadow-lg flex items-center justify-center relative overflow-hidden ring-2 ring-white/90">
                <img src={APP_LOGO} alt="Logo" crossOrigin="anonymous" className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
              </div>
            </div>

            {/* Center Association Title - Significantly Increased Text Size */}
            <div className="flex flex-col items-center justify-center text-center px-0.5">
              <h2
                style={{
                  WebkitTextStroke: '0.95px #18181b',
                  paintOrder: 'stroke fill',
                  textShadow: '0 1px 2px rgba(24, 24, 27, 0.85)',
                }}
                className="text-[20px] font-black text-white tracking-tight leading-tight whitespace-nowrap"
              >
                ባህር ዳር ሞተረኞች ማህበር
              </h2>
              <h1
                style={{
                  WebkitTextStroke: '0.85px #18181b',
                  paintOrder: 'stroke fill',
                  textShadow: '0 1px 2px rgba(24, 24, 27, 0.85)',
                }}
                className="text-[15px] font-black text-white tracking-wider leading-tight mt-0.5 whitespace-nowrap"
              >
                BAHIRDAR MOTORIST ASSOCIATION
              </h1>
            </div>

            {/* Right Column: Flag */}
            <div className="flex items-center justify-end shrink-0">
              <div className="w-13 h-7.5 rounded-sm overflow-hidden border border-white/90 shadow-sm shrink-0 relative bg-black/20">
                <img
                  src={APP_FLAG}
                  alt="Ethiopian Flag"
                  crossOrigin="anonymous"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          </div>

          {/* MAIN CARD BODY - CSS Grid Alignment with Zero Vertical Padding & Centered Watermark Stamp */}
          <div className="px-4 py-0 bg-white flex-1 grid grid-cols-[124px_1fr_120px] items-center gap-3 relative z-10 overflow-hidden">
            
            {/* Centered Security Watermark Stamp - Restricted Strictly to Card Body */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0 opacity-15 flex items-center justify-center">
              <div className="w-34 h-34 rounded-full border-4 border-double border-neutral-900 p-1 flex items-center justify-center">
                <div className="w-full h-full rounded-full border-2 border-dashed border-neutral-800 flex flex-col items-center justify-center p-1.5 text-center text-neutral-900 font-black">
                  <span className="text-[10px] tracking-wide">ባህር ዳር ሞተረኞች</span>
                  <Icon className="material-symbols-outlined text-[28px] text-neutral-900 my-0.5">two_wheeler</Icon>
                  <span className="text-[10px] tracking-wide">ማህበር</span>
                </div>
              </div>
            </div>

            {/* Left Column: Portrait Photo with Neutral Charcoal Border */}
            <div className="flex flex-col items-center justify-center z-10">
              <div className="w-[124px] h-[178px] rounded-lg border-2 border-neutral-800 shadow-md overflow-hidden bg-neutral-100 relative ring-2 ring-neutral-200">
                <SmartImage
                  src={portraitPhoto}
                  alt="Member Portrait"
                  fallbackIcon="person"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Center Column: Structured Grid Details with Tight Snug Labels and Perfect Charcoal Values Alignment */}
            <div className="flex flex-col justify-center space-y-2 text-sans z-10">
              
              {/* Full Name */}
              <div className="grid grid-cols-[124px_1fr] items-center gap-1.5 leading-tight">
                <span className="font-extrabold text-[#374151] text-[11.5px] whitespace-nowrap shrink-0">
                  <span>ሙሉ ስም</span> <span className="text-neutral-400 font-normal">/</span> <span className="text-[#4b5563] text-[11px] font-medium">Full Name</span>
                </span>
                <div className="font-bold text-[#18181b] text-[13px] flex items-center flex-wrap gap-1 min-w-0 leading-tight">
                  <span>: {nameParts.am}</span>
                  {nameParts.en && (
                    <span className="text-[#374151] font-semibold text-[11.5px] whitespace-nowrap">
                      ({nameParts.en})
                    </span>
                  )}
                </div>
              </div>

              {/* ID No */}
              <div className="grid grid-cols-[124px_1fr] items-center gap-1.5 leading-tight">
                <span className="font-extrabold text-[#374151] text-[11.5px] whitespace-nowrap shrink-0">
                  <span>የአባል መለያ ቁጥር</span> <span className="text-neutral-400 font-normal">/</span> <span className="text-[#4b5563] text-[11px] font-medium">ID No.</span>
                </span>
                <span className="font-bold text-[#18181b] text-[13px] min-w-0 whitespace-nowrap leading-tight">: {idNo}</span>
              </div>

              {/* Plate No */}
              <div className="grid grid-cols-[124px_1fr] items-center gap-1.5 leading-tight">
                <span className="font-extrabold text-[#374151] text-[11.5px] whitespace-nowrap shrink-0">
                  <span>የምዝገባ ሰሌዳ</span> <span className="text-neutral-400 font-normal">/</span> <span className="text-[#4b5563] text-[11px] font-medium">Plate No.</span>
                </span>
                <span className="font-bold text-[#18181b] text-[13px] min-w-0 whitespace-nowrap leading-tight">: {plateNo}</span>
              </div>

              {/* Blood Group */}
              <div className="grid grid-cols-[124px_1fr] items-center gap-1.5 leading-tight">
                <span className="font-extrabold text-[#374151] text-[11.5px] whitespace-nowrap shrink-0">
                  <span>የደም አይነት</span> <span className="text-neutral-400 font-normal">/</span> <span className="text-[#4b5563] text-[11px] font-medium">Blood Group</span>
                </span>
                <span className="font-bold text-[#18181b] text-[13px] min-w-0 whitespace-nowrap leading-tight">: {bloodGroup}</span>
              </div>

              {/* Phone */}
              <div className="grid grid-cols-[124px_1fr] items-center gap-1.5 leading-tight">
                <span className="font-extrabold text-[#374151] text-[11.5px] whitespace-nowrap shrink-0">
                  <span>ስልክ</span> <span className="text-neutral-400 font-normal">/</span> <span className="text-[#4b5563] text-[11px] font-medium">Phone</span>
                </span>
                <span className="font-bold text-[#18181b] text-[13px] min-w-0 whitespace-nowrap leading-tight">: {phone}</span>
              </div>

              {/* Issue Date */}
              <div className="grid grid-cols-[124px_1fr] items-center gap-1.5 leading-tight">
                <span className="font-extrabold text-[#374151] text-[11.5px] whitespace-nowrap shrink-0">
                  <span>የተሰጠበት ቀን</span> <span className="text-neutral-400 font-normal">/</span> <span className="text-[#4b5563] text-[11px] font-medium">Issue Date</span>
                </span>
                <span className="font-bold text-[#18181b] text-[13px] min-w-0 whitespace-nowrap leading-tight">: {issueDate}</span>
              </div>

              {/* Expiry Date & Time */}
              <div className="grid grid-cols-[124px_1fr] items-center gap-1.5 leading-tight">
                <span className="font-extrabold text-[#374151] text-[11.5px] whitespace-nowrap shrink-0">
                  <span>የሚያበቃበት ቀን</span> <span className="text-neutral-400 font-normal">/</span> <span className="text-[#4b5563] text-[11px] font-medium">Expiry</span>
                </span>
                <span className="font-bold text-[#18181b] text-[13px] min-w-0 whitespace-nowrap leading-tight">: {expiryDate} 12:00 PM</span>
              </div>
            </div>

            {/* Right Column: QR Code & Hand Signature */}
            <div className="flex flex-col items-center justify-between h-[178px] z-10">
              
              {/* QR Code */}
              <div className="bg-white p-1 rounded-lg border border-neutral-300 shadow-sm">
                <QRCodeSVG value={qrVal} size={82} level="M" />
              </div>

              {/* Authorized Hand Signature */}
              <div className="relative flex flex-col items-center justify-center mt-1">
                <div className="w-20 h-9 relative flex items-center justify-center">
                  <svg className="w-full h-full text-neutral-900 drop-shadow-xs" viewBox="0 0 100 30" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M5 20 Q20 5 35 18 T55 12 T75 22 T95 10" />
                  </svg>
                </div>
                <div className="w-20 border-b border-neutral-400 my-0.5" />
                <span className="text-[8px] font-bold text-neutral-800 text-center leading-tight">
                  የስራ ኃላፊ ፊርማ<br />Authorized Signature
                </span>
              </div>
            </div>
          </div>

          {/* BOTTOM FOOTER BANNER - Corporate Green Banner with Charcoal Stroke on White Text */}
          <div className="bg-gradient-to-r from-[#24963e] via-[#2ea44f] to-[#24963e] text-white py-2 px-3 flex flex-col gap-0.5 items-center shrink-0 border-t border-black/10 relative z-20">
            <p
              style={{
                WebkitTextStroke: '0.65px #18181b',
                paintOrder: 'stroke fill',
                textShadow: '0 1px 2px rgba(24, 24, 27, 0.8)',
              }}
              className="text-[9.5px] font-bold text-center leading-tight text-white"
            >
              ይህ የአባልነት መታወቂያ የባህዳር ሞተረኛች ማህበር አባልነት ማረጋገጫ ብቻ ሲሆን እንደ የአሽከርካሪ መንጃ ፈቃድ የማያገለግል ነው።
            </p>
            <div
              style={{
                WebkitTextStroke: '0.75px #18181b',
                paintOrder: 'stroke fill',
                textShadow: '0 1px 2px rgba(24, 24, 27, 0.8)',
              }}
              className="text-[11px] font-black tracking-wide text-white"
            >
              ይህ መታወቂያ የባህር ዳር ሞተረኞች ማህበር ንብረት ነው።
            </div>
          </div>
        </div>

        {/* =========================================================================
            ID CARD BACKSIDE DESIGN (Separate Downloadable in Preview Modal)
           ========================================================================= */}
        <div id="pvc-card-back" className="printable-id-card w-[580px] h-[366px] bg-white rounded-xl shadow-2xl border border-neutral-300 overflow-hidden text-neutral-900 relative shrink-0 select-none font-sans flex flex-col justify-between p-0 mt-4">
          
          {/* Backside Header: Corporate Green Top Banner with Grid Alignment & Charcoal Text Stroke */}
          <div className="bg-gradient-to-r from-[#24963e] via-[#2ea44f] to-[#24963e] text-white px-5 py-2 grid grid-cols-[auto_1fr] items-center gap-3 border-b border-black/10 min-h-[68px] h-[68px] shrink-0">
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center p-0.5 shadow-md shrink-0 ring-2 ring-white/90">
              <img src={APP_LOGO} alt="Logo" crossOrigin="anonymous" className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
            </div>
            <div>
              <h3
                style={{
                  WebkitTextStroke: '0.95px #18181b',
                  paintOrder: 'stroke fill',
                  textShadow: '0 1px 2px rgba(24, 24, 27, 0.85)',
                }}
                className="text-[20px] font-black text-white tracking-wide leading-tight whitespace-nowrap"
              >
                ባህር ዳር ሞተረኞች ማህበር
              </h3>
              <p
                style={{
                  WebkitTextStroke: '0.85px #18181b',
                  paintOrder: 'stroke fill',
                  textShadow: '0 1px 2px rgba(24, 24, 27, 0.85)',
                }}
                className="text-[15px] font-black text-white tracking-wider leading-tight mt-0.5 whitespace-nowrap"
              >
                BAHIRDAR MOTORIST ASSOCIATION
              </p>
            </div>
          </div>

          {/* Backside Center Content: Grid System with Clean Wrapped Terms & Extra Large QR Card */}
          <div className="grid grid-cols-[1fr_235px] gap-3 px-4 py-1 flex-1 items-stretch">
            
            {/* Terms & Conditions Container - Clean Wrapped Text */}
            <div className="h-full flex flex-col justify-center text-neutral-800 bg-neutral-100/80 p-3.5 rounded-xl border border-neutral-200 shadow-xs">
              <p className="font-extrabold text-neutral-900 text-[12px] mb-2 pb-1 border-b border-neutral-200">
                <span>የአጠቃቀም ደንቦች እና ማሳሰቢያ</span> <span className="text-neutral-400 font-bold">/</span> <span className="text-neutral-700 text-[10.5px]">Terms & Conditions:</span>
              </p>
              <ul className="space-y-2 list-disc list-inside text-[10.5px] leading-relaxed text-neutral-800 font-medium break-words">
                <li>ይህ መታወቂያ ሲጠፋ ለህግ አስከባሪ አካል ወዲያውኑ ሪፖርት መደረግ አለበት።</li>
                <li>በከተማ ውስጥ ሲንቀሳቀሱ ይህንን መታወቂያ ሁልጊዜ ከእርስዎ ጋር ይያዙ።</li>
                <li>ለአደጋ ጊዜ ድንገተኛ ጥሪ፡ <b className="text-neutral-950 font-black text-[11.5px]">058-220-1122</b> ወይም <b className="text-neutral-950 font-black text-[11.5px]">991</b> ይደውሉ።</li>
              </ul>
            </div>

            {/* Backside Extra Large QR Code - Maximum Prominence */}
            <div className="h-full flex flex-col items-center justify-center bg-white p-2.5 rounded-xl shadow-sm border border-neutral-300">
              <QRCodeSVG value={qrVal} size={175} level="M" />
              <span className="text-[9.5px] font-mono font-extrabold text-neutral-800 mt-1.5 text-center tracking-wider">
                SCAN TO VERIFY
              </span>
            </div>
          </div>

          {/* Backside Footer: 'ባህርዳር ሞተረኛ ማህበር' & Bahirdar, Ethiopia */}
          <div className="bg-gradient-to-r from-[#24963e] via-[#2ea44f] to-[#24963e] text-white grid grid-cols-[1fr_auto] items-center px-5 py-2.5 shrink-0 border-t border-black/10 text-[11px]">
            <div className="flex items-center gap-1.5 text-white">
              <span
                style={{
                  WebkitTextStroke: '0.75px #18181b',
                  paintOrder: 'stroke fill',
                  textShadow: '0 1px 2px rgba(24, 24, 27, 0.8)',
                }}
                className="text-white font-black text-[12px] tracking-wide"
              >
                ባህርዳር ሞተረኛ ማህበር
              </span>
            </div>
            <div
              style={{
                WebkitTextStroke: '0.75px #18181b',
                paintOrder: 'stroke fill',
                textShadow: '0 1px 2px rgba(24, 24, 27, 0.8)',
              }}
              className="text-right font-black text-white whitespace-nowrap font-mono"
            >
              Bahirdar, Ethiopia
            </div>
          </div>
        </div>

        </div>
      </div>
    </div>
  );
};
