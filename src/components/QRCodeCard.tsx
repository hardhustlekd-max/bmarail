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
        <div id="pvc-card-front" className="printable-id-card w-[580px] h-[366px] bg-white rounded-xl shadow-2xl border-2 border-[#2ea44f]/40 overflow-hidden text-slate-900 relative shrink-0 select-none font-sans flex flex-col justify-between">
          
          {/* TOP HEADER BANNER - Corporate Green Header */}
          <div className="bg-gradient-to-r from-[#24963e] via-[#2ea44f] to-[#24963e] text-white px-4 py-2 flex items-center justify-between relative z-20 overflow-visible min-h-[82px] h-[82px] shrink-0 border-b-[3px] border-[#1e7e34] shadow-md">
            
            {/* Left Emblem Logo */}
            <div className="flex flex-col items-center justify-center shrink-0 z-10 w-[72px]">
              <div className="w-14 h-14 rounded-full bg-white shadow-lg flex items-center justify-center relative overflow-hidden ring-2 ring-white/90">
                <img src={APP_LOGO} alt="Logo" crossOrigin="anonymous" className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
              </div>
            </div>

            {/* Center Association Title */}
            <div className="flex flex-col items-center justify-center text-center flex-1 mx-2 z-10 pb-2">
              <h2 className="text-[13px] font-black text-white tracking-tight leading-tight drop-shadow-xs">
                ባህር ዳር ሞተረኞች ማህበር
              </h2>
              <h1 className="text-[11.5px] font-black text-emerald-100 tracking-wider leading-tight mt-0.5 drop-shadow-xs">
                BAHIRDAR MOTORIST ASSOCIATION
              </h1>
            </div>

            {/* Right Column: Flag */}
            <div className="flex flex-col items-end justify-center shrink-0 z-10 w-[72px]">
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

            {/* Hovering Orange Member ID Badge between Header and Middle Container */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                bottom: 0,
                transform: 'translate(-50%, 50%)',
                zIndex: 30,
              }}
              className="bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 px-6 py-1 rounded-full shadow-lg border-2 border-white ring-1 ring-[#24963e]/30 flex flex-col items-center select-none whitespace-nowrap pointer-events-none"
            >
              <span className="text-[12px] font-black leading-tight tracking-tight">የአባል መታወቂያ</span>
              <span className="text-[9px] font-black tracking-wider leading-tight">MEMBER ID CARD</span>
            </div>
          </div>

          {/* MAIN CARD BODY - Clean Crisp White Area with Green Accents */}
          <div className="px-4 pt-6 pb-2.5 bg-white flex-1 flex items-center justify-between gap-3 relative z-10">
            
            {/* Left Column: ENLARGED Portrait Photo with Corporate Green Border */}
            <div className="w-[125px] shrink-0 flex flex-col items-center">
              <div className="w-[120px] h-[155px] rounded-lg border-2 border-[#2ea44f] shadow-md overflow-hidden bg-slate-50 relative ring-2 ring-emerald-50">
                <SmartImage
                  src={portraitPhoto}
                  alt="Member Portrait"
                  fallbackIcon="person"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Center Column: Table Details with Corporate Green & Charcoal Typography */}
            <div className="flex-1 min-w-0 pr-1 space-y-1.5 text-[12px] font-sans">
              
              {/* Full Name */}
              <div className="flex items-start gap-1 leading-normal">
                <span className="font-extrabold text-slate-600 min-w-[145px] shrink-0 text-[11px] whitespace-nowrap">
                  <span>ሙሉ ስም</span> <span className="text-[#2ea44f]">/</span> <span className="text-slate-500">Full Name</span>
                </span>
                <div className="font-black text-[#2ea44f] text-[13.5px] leading-tight min-w-0 flex-1">
                  <p>: {nameParts.am}</p>
                  {nameParts.en && <p className="ml-2 font-bold text-slate-800 text-[11px]">{nameParts.en}</p>}
                </div>
              </div>

              {/* ID No */}
              <div className="flex items-center gap-1 leading-normal">
                <span className="font-extrabold text-slate-600 min-w-[145px] shrink-0 text-[11px] whitespace-nowrap">
                  <span>የአባል መለያ ቁጥር</span> <span className="text-[#2ea44f]">/</span> <span className="text-slate-500">ID No.</span>
                </span>
                <span className="font-mono font-black text-slate-900 text-[13px] min-w-0 flex-1 truncate">: {idNo}</span>
              </div>

              {/* Plate No */}
              <div className="flex items-center gap-1 leading-normal">
                <span className="font-extrabold text-slate-600 min-w-[145px] shrink-0 text-[11px] whitespace-nowrap">
                  <span>የምዝገባ ሰሌዳ</span> <span className="text-[#2ea44f]">/</span> <span className="text-slate-500">Plate No.</span>
                </span>
                <span className="font-mono font-black text-slate-900 text-[13px] min-w-0 flex-1 truncate">: {plateNo}</span>
              </div>

              {/* Blood Group */}
              <div className="flex items-center gap-1 leading-normal">
                <span className="font-extrabold text-slate-600 min-w-[145px] shrink-0 text-[11px] whitespace-nowrap">
                  <span>የደም አይነት</span> <span className="text-[#2ea44f]">/</span> <span className="text-slate-500">Blood Group</span>
                </span>
                <span className="font-black text-rose-600 text-[13px] min-w-0 flex-1">: {bloodGroup}</span>
              </div>

              {/* Phone */}
              <div className="flex items-center gap-1 leading-normal">
                <span className="font-extrabold text-slate-600 min-w-[145px] shrink-0 text-[11px] whitespace-nowrap">
                  <span>ስልክ</span> <span className="text-[#2ea44f]">/</span> <span className="text-slate-500">Phone</span>
                </span>
                <span className="font-mono font-bold text-slate-900 text-[12px] min-w-0 flex-1 truncate">: {phone}</span>
              </div>

              {/* Issue Date */}
              <div className="flex items-center gap-1 leading-normal">
                <span className="font-extrabold text-slate-600 min-w-[145px] shrink-0 text-[11px] whitespace-nowrap">
                  <span>የተሰጠበት ቀን</span> <span className="text-[#2ea44f]">/</span> <span className="text-slate-500">Issue Date</span>
                </span>
                <span className="font-mono font-bold text-slate-900 text-[12px] min-w-0 flex-1 truncate">: {issueDate}</span>
              </div>

              {/* Expiry Date & Time */}
              <div className="flex items-center gap-1 leading-normal">
                <span className="font-extrabold text-slate-600 min-w-[145px] shrink-0 text-[11px] whitespace-nowrap">
                  <span>የሚያበቃበት ቀን</span> <span className="text-[#2ea44f]">/</span> <span className="text-slate-500">Expiry</span>
                </span>
                <span className="font-mono font-bold text-slate-900 text-[11.5px] min-w-0 flex-1 truncate">: {expiryDate} 12:00 PM</span>
              </div>
            </div>

            {/* Right Column: QR Code & Stamp */}
            <div className="w-[120px] shrink-0 flex flex-col items-center justify-between h-[155px]">
              
              {/* QR Code */}
              <div className="bg-white p-1 rounded-lg border-2 border-[#2ea44f]/60 shadow-xs ring-1 ring-emerald-50">
                <QRCodeSVG value={qrVal} size={76} level="M" />
              </div>

              {/* Official Stamp & Signature */}
              <div className="relative flex flex-col items-center mt-0.5">
                <div className="w-16 h-16 rounded-full border-2 border-double border-[#2ea44f] p-0.5 flex items-center justify-center relative bg-white shadow-xs">
                  <div className="w-full h-full rounded-full border border-dashed border-[#24963e] flex flex-col items-center justify-center p-0.5 text-[5.5px] font-black text-[#24963e] text-center">
                    <span>ባህር ዳር ሞተረኞች</span>
                    <Icon className="material-symbols-outlined text-[15px] text-[#2ea44f] my-0.5">two_wheeler</Icon>
                    <span>ማህበር</span>
                  </div>

                  {/* Corporate Green Cursive Signature */}
                  <svg className="absolute w-14 h-8 text-[#24963e] top-2 left-1 drop-shadow-xs" viewBox="0 0 100 30" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M5 20 Q20 5 35 18 T55 12 T75 22 T95 10" />
                  </svg>
                </div>
                <span className="text-[7.5px] font-bold text-slate-700 mt-0.5 text-center leading-tight">
                  የስራ ኃላፊ ፊርማ<br />Authorized Signature
                </span>
              </div>
            </div>
          </div>

          {/* BOTTOM FOOTER BANNER - Corporate Green Banner */}
          <div className="bg-gradient-to-r from-[#24963e] via-[#2ea44f] to-[#24963e] text-white py-1.5 px-3 flex flex-col gap-0.5 items-center shrink-0 border-t-2 border-[#1e7e34]">
            <p className="text-[8.5px] font-bold text-center leading-tight text-emerald-50">
              ይህ የአባልነት መታወቂያ የባህዳር ሞተረኛች ማህበር አባልነት ማረጋገጫ ብቻ ሲሆን እንደ የአሽከርካሪ መንጃ ፈቃድ የማያገለግል ነው።
            </p>
            <div className="text-[10px] font-black tracking-wide text-white">
              ይህ መታወቂያ የባህር ዳር ሞተረኞች ማህበር ንብረት ነው።
            </div>
          </div>
        </div>

        {/* =========================================================================
            ID CARD BACKSIDE DESIGN (Separate Downloadable in Preview Modal)
           ========================================================================= */}
        <div id="pvc-card-back" className="printable-id-card w-[580px] h-[366px] bg-white rounded-xl shadow-2xl border-2 border-[#2ea44f]/40 overflow-hidden text-slate-900 relative shrink-0 select-none font-sans flex flex-col justify-between p-0 mt-4">
          
          {/* Backside Header: Corporate Green Top Banner */}
          <div className="bg-gradient-to-r from-[#24963e] via-[#2ea44f] to-[#24963e] text-white px-5 py-3 flex items-center justify-between border-b-2 border-[#1e7e34]">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center p-0.5 shadow-md shrink-0 ring-2 ring-white/90">
                <img src={APP_LOGO} alt="Logo" crossOrigin="anonymous" className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
              </div>
              <div>
                <h3 className="text-xs font-black text-white tracking-wide">ባህር ዳር ሞተረኞች ማህበር</h3>
                <p className="text-[9px] font-bold text-emerald-100 tracking-wider">BAHIRDAR MOTORIST ASSOCIATION</p>
              </div>
            </div>
          </div>

          {/* Backside Center Content: Terms, Emergency Contacts, & Large QR */}
          <div className="grid grid-cols-3 gap-3 items-center px-5 py-3 flex-1">
            
            {/* Terms & Conditions (Amharic) */}
            <div className="col-span-2 space-y-2 text-[10px] font-medium text-slate-700 leading-relaxed bg-emerald-50/40 p-3 rounded-lg border border-emerald-200">
              <p className="font-extrabold text-[#24963e] text-[10.5px] mb-1">
                <span>የአጠቃቀም ደንቦች እና ማሳሰቢያ</span> <span className="text-slate-400 font-bold">/</span> <span className="text-slate-600">Terms & Conditions:</span>
              </p>
              <ul className="space-y-1 list-disc list-inside text-[9.5px] text-slate-700">
                <li>ይህ መታወቂያ ሲጠፋ ለህግ አስከባሪ አካል ወዲያውኑ ሪፖርት መደረግ አለበት።</li>
                <li>በከተማ ውስጥ ሲንቀሳቀሱ ይህንን መታወቂያ ሁልጊዜ ከእርስዎ ጋር ይያዙ።</li>
                <li>ለአደጋ ጊዜ ድንገተኛ ጥሪ፡ <b className="text-[#2ea44f]">058-220-1122</b> ወይም <b className="text-[#2ea44f]">991</b> ይደውሉ።</li>
              </ul>
            </div>

            {/* Backside Large QR Code */}
            <div className="col-span-1 flex flex-col items-center justify-center">
              <div className="bg-white p-2 rounded-xl shadow-md border-2 border-[#2ea44f] flex items-center justify-center ring-2 ring-emerald-50">
                <QRCodeSVG value={qrVal} size={112} level="M" />
              </div>
            </div>
          </div>

          {/* Backside Footer: Issuing Authority Address & Web Verify */}
          <div className="flex items-center justify-between px-5 py-2.5 border-t border-slate-200 bg-slate-50 text-[9.5px] text-slate-600 font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#2ea44f] animate-pulse"></span>
              <span>Online Verification: https://enforcement.gov.et</span>
            </div>
            <div className="text-right font-bold text-[#2ea44f] whitespace-nowrap">
              Bahirdar, Ethiopia
            </div>
          </div>
        </div>

        </div>
      </div>
    </div>
  );
};
