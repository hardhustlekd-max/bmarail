import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './ui/Icon';
import { QRCodeSVG } from 'qrcode.react';
import { MotorcycleRegistration, Language, APP_LOGO } from '../types';
import { triggerDocumentPrint } from '../utils/printUtils';
import { formatEthiopianDate } from '../utils/ethiopianCalendar';

interface VehicleQRStickerProps {
  registration: Partial<MotorcycleRegistration>;
  lang: Language;
  onClose?: () => void;
  autoPrint?: boolean;
}

export const VehicleQRSticker: React.FC<VehicleQRStickerProps> = ({
  registration,
  lang,
  onClose,
  autoPrint = false,
}) => {
  const isAmharic = lang === 'am';
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
        const available = Math.min(parentWidth - 16, 400);
        if (available > 0 && available < 400) {
          setStandaloneFitScale(Number((available / 400).toFixed(3)));
        } else {
          setStandaloneFitScale(1);
        }
      }
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  const regId = registration.id || '';
  const userRegNo = registration.plateNumber && registration.plateNumber.toUpperCase() !== 'ELECTRIC'
    ? registration.plateNumber
    : (registration.id || registration.plateNumber || '—');
  const qrVal = registration.qrCodeData || `https://enforcement.gov.et/verify/${regId || registration.plateNumber || ''}`;

  // Format valid until date derived from registration in Ethiopian Calendar
  const computeExpiryDateFormatted = () => {
    try {
      const issue = registration.registrationDate || new Date().toISOString().split('T')[0];
      const regD = new Date(issue);
      if (!isNaN(regD.getTime())) {
        regD.setFullYear(regD.getFullYear() + 1);
        return formatEthiopianDate(regD, isAmharic ? 'am' : 'en');
      }
    } catch {}
    return formatEthiopianDate(new Date(), isAmharic ? 'am' : 'en');
  };
  const expiryDateFormatted = computeExpiryDateFormatted();

  const handlePrint = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    triggerDocumentPrint('sticker');
  };

  useEffect(() => {
    if (autoPrint) {
      const timer = setTimeout(() => {
        handlePrint();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [autoPrint]);

  return (
    <div
      ref={containerRef}
      id="vehicle-qr-sticker-container"
      className={isInZoomable ? "shrink-0 flex flex-col items-center font-sans select-none py-1" : "w-full flex flex-col items-center font-sans select-none py-1 max-w-full overflow-hidden"}
    >
      <div
        style={{
          width: standaloneFitScale < 1 ? `${400 * standaloneFitScale}px` : '400px',
          height: standaloneFitScale < 1 ? `${(460 + 48) * standaloneFitScale}px` : 'auto',
        }}
        className="flex flex-col items-center gap-3 shrink-0 mx-auto relative origin-top"
      >
        <div
          style={{
            transform: standaloneFitScale < 1 ? `scale(${standaloneFitScale})` : 'none',
            transformOrigin: 'top center',
          }}
          className="flex flex-col items-center gap-3 w-[400px] shrink-0"
        >

        {/* PRINTABLE STICKER CARD FRAME */}
        <div className="flex justify-center py-1">
          <div id="sticker-container" className="printable-sticker w-[380px] h-[380px] bg-[#e5e7eb] rounded-[32px] p-3.5 shadow-2xl relative overflow-hidden font-sans flex flex-col items-center justify-center ring-1 ring-black/10">
            
            {/* Outer Silver Security Pattern Border Background */}
            <div className="absolute inset-0 bg-[radial-gradient(#d1d5db_1px,transparent_1px)] [background-size:6px_6px] rounded-[32px] opacity-70 pointer-events-none" />

            {/* Main Corporate Green Inner Frame Container (Matching ID Card Theme) */}
            <div className="relative z-10 w-full h-full bg-white rounded-[24px] border-[5px] border-[#24963e] flex flex-col justify-between overflow-hidden shadow-inner">
              
              {/* Top Corporate Green Header Section */}
              <div className="bg-gradient-to-r from-[#24963e] via-[#2ea44f] to-[#24963e] border-b-[3px] border-[#1f7a33] px-3.5 py-2.5 flex items-center gap-3 text-white shrink-0 shadow-sm">
                
                {/* System Seal Emblem */}
                <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center shrink-0 shadow-md relative overflow-hidden ring-2 ring-white/90">
                  <img src={APP_LOGO} alt="Logo" className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
                </div>

                {/* Header System Title Text Block */}
                <div className="flex-1 text-center font-sans leading-none text-white">
                  <div className="text-[16px] font-black tracking-wide font-sans text-white drop-shadow-sm leading-tight">
                    ባህር ዳር ሞተረኞች ማህበር
                  </div>
                  <div className="text-[12px] font-black tracking-wider text-emerald-50 leading-tight mt-1">
                    BAHIR DAR MOTORIST ASSOCIATION
                  </div>
                </div>
              </div>

              {/* Middle Area: Centered QR Code */}
              <div className="flex-1 bg-white flex flex-col items-center justify-center p-2 relative">
                <div className="bg-white p-2.5 rounded-xl border-2 border-[#24963e] shadow-xs">
                  <QRCodeSVG 
                    value={qrVal} 
                    size={175} 
                    level="H" 
                    includeMargin={false}
                  />
                </div>
              </div>

              {/* Bottom Area: Validity & Serial Number */}
              <div className="bg-white text-center pb-3 pt-1 relative shrink-0">
                
                {/* Validity Label */}
                <div className="text-[13px] font-extrabold tracking-wider text-slate-900 font-sans">
                  Valid until: {expiryDateFormatted}
                </div>

                {/* Registration Number Display */}
                <div className="text-[26px] font-black tracking-wider text-slate-950 font-mono leading-none mt-1">
                  {userRegNo}
                </div>

                {/* Bottom Corner Green Security Triangles (Matching ID Card Theme) */}
                {/* Left Bottom Corner Triangle */}
                <div 
                  className="absolute bottom-0 left-0 w-12 h-12 bg-[#24963e] pointer-events-none z-10"
                  style={{ clipPath: 'polygon(0 100%, 0 0, 100% 100%)' }}
                />

                {/* Right Bottom Corner Triangle */}
                <div 
                  className="absolute bottom-0 right-0 w-12 h-12 bg-[#24963e] pointer-events-none z-10"
                  style={{ clipPath: 'polygon(100% 100%, 100% 0, 0 100%)' }}
                />
              </div>

            </div>
          </div>
        </div>



        </div>
      </div>
    </div>
  );
};

