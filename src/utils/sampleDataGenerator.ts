import { MotorcycleRegistration, VehicleCategory } from '../types';

function svgToDataUrl(svgStr: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
}

// 1. Generate Sample Member Portrait Photo Data URL
export function generateSamplePortraitSvg(name: string, index: number, isFemale = false): string {
  const bgGradientStart = isFemale ? '#4f46e5' : '#0284c7';
  const bgGradientEnd = isFemale ? '#7c3aed' : '#0f766e';
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bgGradientStart}"/>
        <stop offset="100%" stop-color="${bgGradientEnd}"/>
      </linearGradient>
      <linearGradient id="cardBg" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="100%" stop-color="#f1f5f9"/>
      </linearGradient>
    </defs>
    
    <!-- Background Frame -->
    <rect width="400" height="400" fill="url(#bg)" rx="24"/>
    <rect x="16" y="16" width="368" height="368" fill="url(#cardBg)" rx="18" stroke="#cbd5e1" stroke-width="4"/>
    
    <!-- Outer Header Banner -->
    <rect x="24" y="24" width="352" height="48" fill="#1e293b" rx="10"/>
    <text x="200" y="54" fill="#ffffff" font-family="sans-serif" font-size="16" font-weight="900" text-anchor="middle" letter-spacing="1">
      BMA MEMBER PORTRAIT
    </text>
    
    <!-- Portrait Avatar Illustration -->
    <g transform="translate(200, 200)">
      <!-- Head Circle -->
      <circle cx="0" cy="-35" r="55" fill="#f87171" opacity="0.15"/>
      <circle cx="0" cy="-35" r="48" fill="#e2e8f0" stroke="#475569" stroke-width="4"/>
      
      <!-- Shoulders / Silhouette -->
      <path d="M -85,80 C -85,20 -50,10 0,10 C 50,10 85,20 85,80 Z" fill="#334155"/>
      
      <!-- Face details -->
      <circle cx="0" cy="-35" r="38" fill="#fed7aa"/>
      <!-- Eyes -->
      <circle cx="-14" cy="-40" r="4" fill="#1e293b"/>
      <circle cx="14" cy="-40" r="4" fill="#1e293b"/>
      <!-- Smile -->
      <path d="M -12,-20 Q 0,-10 12,-20" fill="none" stroke="#9a3412" stroke-width="3" stroke-linecap="round"/>
      
      <!-- Collar / Tie -->
      <polygon points="-12,12 0,40 12,12 0,20" fill="#2563eb"/>
    </g>
    
    <!-- Official Stamp Badge -->
    <circle cx="320" cy="310" r="32" fill="#059669" opacity="0.9"/>
    <circle cx="320" cy="310" r="28" fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="4,2"/>
    <text x="320" y="314" fill="#ffffff" font-family="sans-serif" font-size="10" font-weight="bold" text-anchor="middle">VERIFIED</text>
    
    <!-- Name Tag Footer -->
    <rect x="30" y="325" width="240" height="42" fill="#0f172a" rx="8"/>
    <text x="42" y="348" fill="#38bdf8" font-family="sans-serif" font-size="13" font-weight="bold">
      ${name.length > 22 ? name.substring(0, 22) + '...' : name}
    </text>
    <text x="42" y="361" fill="#94a3b8" font-family="sans-serif" font-size="9" font-weight="bold">
      ID: #BMA-2026-${1000 + index}
    </text>
  </svg>`;

  return svgToDataUrl(svg);
}

// 2. Generate Sample National ID Front SVG Data URL
export function generateSampleNationalIdSvg(name: string, idNo: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380">
    <defs>
      <linearGradient id="ethBg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f8fafc"/>
        <stop offset="100%" stop-color="#e2e8f0"/>
      </linearGradient>
    </defs>
    
    <!-- Card Frame -->
    <rect width="600" height="380" fill="url(#ethBg)" rx="20" stroke="#94a3b8" stroke-width="4"/>
    
    <!-- Top Ethiopia National Header Bar -->
    <rect x="0" y="0" width="600" height="60" fill="#1e293b" rx="20"/>
    <rect x="0" y="50" width="600" height="10" fill="#166534"/>
    <rect x="200" y="50" width="200" height="10" fill="#ca8a04"/>
    <rect x="400" y="50" width="200" height="10" fill="#dc2626"/>
    
    <text x="300" y="34" fill="#ffffff" font-family="sans-serif" font-size="17" font-weight="900" text-anchor="middle">
      ETHIOPIA NATIONAL ID / የኢትዮጵያ ብሔራዊ መታወቂያ
    </text>
    
    <!-- Photo Placeholder Box -->
    <rect x="30" y="85" width="140" height="170" fill="#cbd5e1" rx="10" stroke="#64748b" stroke-width="2"/>
    <circle cx="100" cy="140" r="35" fill="#94a3b8"/>
    <path d="M 50,230 C 50,185 70,175 100,175 C 130,175 150,185 150,230 Z" fill="#64748b"/>
    <text x="100" y="242" fill="#475569" font-family="sans-serif" font-size="10" font-weight="bold" text-anchor="middle">SAMPLE PHOTO</text>
    
    <!-- Fields Section -->
    <g transform="translate(190, 95)" font-family="sans-serif">
      <text x="0" y="18" fill="#64748b" font-size="11" font-weight="bold">FULL NAME / ሙሉ ስም:</text>
      <text x="0" y="40" fill="#0f172a" font-size="16" font-weight="900">${name}</text>
      
      <text x="0" y="72" fill="#64748b" font-size="11" font-weight="bold">NATIONAL ID NO / የመታወቂያ ቁጥር:</text>
      <text x="0" y="94" fill="#1d4ed8" font-size="16" font-weight="900" font-family="monospace">${idNo}</text>
      
      <text x="0" y="126" fill="#64748b" font-size="11" font-weight="bold">REGION / REGION OF RESIDENCE:</text>
      <text x="0" y="146" fill="#0f172a" font-size="14" font-weight="bold">Amhara Region, Bahir Dar</text>
    </g>
    
    <!-- Hologram & Seal -->
    <circle cx="510" cy="280" r="42" fill="#3b82f6" opacity="0.15"/>
    <circle cx="510" cy="280" r="36" fill="none" stroke="#2563eb" stroke-width="3"/>
    <text x="510" y="284" fill="#1d4ed8" font-family="sans-serif" font-size="11" font-weight="900" text-anchor="middle">FDRE OFFICIAL</text>
    
    <!-- Bottom Footer -->
    <rect x="20" y="320" width="560" height="40" fill="#0f172a" rx="10"/>
    <text x="300" y="345" fill="#38bdf8" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">
      VALID FOR OFFICIAL MOTORIST REGISTRATION & VERIFICATION
    </text>
  </svg>`;

  return svgToDataUrl(svg);
}

// 3. Generate Sample National ID Back SVG Data URL
export function generateSampleNationalIdBackSvg(name: string, idNo: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380">
    <rect width="600" height="380" fill="#f1f5f9" rx="20" stroke="#94a3b8" stroke-width="4"/>
    
    <!-- Header -->
    <rect x="0" y="0" width="600" height="45" fill="#334155" rx="20"/>
    <text x="300" y="28" fill="#ffffff" font-family="sans-serif" font-size="14" font-weight="bold" text-anchor="middle">
      FDRE NATIONAL ID - REVERSE / የጀርባ መረጃ
    </text>
    
    <!-- Info Section -->
    <g transform="translate(40, 75)" font-family="sans-serif" font-size="12">
      <text x="0" y="20" fill="#475569" font-weight="bold">ISSUING AUTHORITY:</text>
      <text x="170" y="20" fill="#0f172a" font-weight="extrabold">National ID Program (NIDP Ethiopia)</text>
      
      <text x="0" y="50" fill="#475569" font-weight="bold">ISSUE DATE / የጥቅም ቀን:</text>
      <text x="170" y="50" fill="#0f172a" font-weight="bold">2024-01-15</text>
      
      <text x="0" y="80" fill="#475569" font-weight="bold">EXPIRY DATE / የሚያበቃበት:</text>
      <text x="170" y="80" fill="#166534" font-weight="extrabold">2034-01-15</text>
      
      <text x="0" y="110" fill="#475569" font-weight="bold">ADDRESS / አድራሻ:</text>
      <text x="170" y="110" fill="#0f172a" font-weight="bold">Bahir Dar Subcity, Kebele 04</text>
    </g>
    
    <!-- Barcode Graphic Area -->
    <rect x="40" y="220" width="520" height="80" fill="#ffffff" rx="8" stroke="#cbd5e1"/>
    <g transform="translate(60, 235)" fill="#0f172a">
      <!-- Simulated Barcode Lines -->
      <rect x="0" y="0" width="4" height="50"/>
      <rect x="8" y="0" width="10" height="50"/>
      <rect x="22" y="0" width="6" height="50"/>
      <rect x="32" y="0" width="12" height="50"/>
      <rect x="48" y="0" width="4" height="50"/>
      <rect x="56" y="0" width="8" height="50"/>
      <rect x="68" y="0" width="14" height="50"/>
      <rect x="86" y="0" width="6" height="50"/>
      <rect x="96" y="0" width="4" height="50"/>
      <rect x="104" y="0" width="16" height="50"/>
      <rect x="124" y="0" width="8" height="50"/>
      <rect x="136" y="0" width="4" height="50"/>
      <rect x="144" y="0" width="12" height="50"/>
      <rect x="160" y="0" width="6" height="50"/>
      <rect x="170" y="0" width="18" height="50"/>
      <rect x="192" y="0" width="4" height="50"/>
      <rect x="200" y="0" width="10" height="50"/>
      <rect x="214" y="0" width="8" height="50"/>
      <rect x="226" y="0" width="14" height="50"/>
      <rect x="244" y="0" width="6" height="50"/>
      <rect x="254" y="0" width="12" height="50"/>
      <rect x="270" y="0" width="4" height="50"/>
      <rect x="278" y="0" width="16" height="50"/>
      <rect x="298" y="0" width="8" height="50"/>
      <rect x="310" y="0" width="10" height="50"/>
      <rect x="324" y="0" width="14" height="50"/>
      <rect x="342" y="0" width="6" height="50"/>
      <rect x="352" y="0" width="12" height="50"/>
      <rect x="368" y="0" width="4" height="50"/>
      <rect x="376" y="0" width="16" height="50"/>
      <rect x="396" y="0" width="8" height="50"/>
      <rect x="408" y="0" width="14" height="50"/>
      <rect x="426" y="0" width="6" height="50"/>
      <rect x="436" y="0" width="12" height="50"/>
      <rect x="452" y="0" width="8" height="50"/>
      <rect x="464" y="0" width="10" height="50"/>
    </g>
    
    <text x="300" y="340" fill="#64748b" font-family="monospace" font-size="13" font-weight="bold" text-anchor="middle">
      *${idNo.replace(/[^A-Z0-9]/gi, '')}*
    </text>
  </svg>`;

  return svgToDataUrl(svg);
}

// 4. Generate Sample Driving License SVG Data URL
export function generateSampleDrivingLicenseSvg(name: string, licenseNo: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380">
    <rect width="600" height="380" fill="#f8fafc" rx="20" stroke="#0284c7" stroke-width="4"/>
    
    <!-- Top Header -->
    <rect x="0" y="0" width="600" height="55" fill="#0369a1" rx="20"/>
    <text x="300" y="34" fill="#ffffff" font-family="sans-serif" font-size="16" font-weight="900" text-anchor="middle">
      ETHIOPIAN DRIVING LICENSE / የኢትዮጵያ መንጃ ፈቃድ
    </text>
    
    <!-- Category Badge -->
    <rect x="460" y="70" width="110" height="70" fill="#0284c7" rx="10"/>
    <text x="515" y="100" fill="#ffffff" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">CATEGORY</text>
    <text x="515" y="128" fill="#fef08a" font-family="sans-serif" font-size="24" font-weight="900" text-anchor="middle">A1 / B</text>
    
    <!-- Photo Box -->
    <rect x="30" y="80" width="130" height="160" fill="#e2e8f0" rx="10" stroke="#94a3b8" stroke-width="2"/>
    <circle cx="95" cy="130" r="30" fill="#64748b"/>
    <path d="M 50,210 C 50,170 70,160 95,160 C 120,160 140,170 140,210 Z" fill="#475569"/>
    
    <!-- Details -->
    <g transform="translate(180, 85)" font-family="sans-serif">
      <text x="0" y="18" fill="#64748b" font-size="11" font-weight="bold">DRIVER NAME / የባለቤት ስም:</text>
      <text x="0" y="38" fill="#0f172a" font-size="15" font-weight="900">${name}</text>
      
      <text x="0" y="68" fill="#64748b" font-size="11" font-weight="bold">LICENSE NO / የመንጃ ፈቃድ ቁጥር:</text>
      <text x="0" y="88" fill="#0284c7" font-size="15" font-weight="900" font-family="monospace">${licenseNo}</text>
      
      <text x="0" y="118" fill="#64748b" font-size="11" font-weight="bold">ISSUED BY / የሰጠው አካል:</text>
      <text x="0" y="138" fill="#0f172a" font-size="13" font-weight="bold">Amhara Transport Bureau (Bahir Dar)</text>
    </g>
    
    <!-- Bottom Bar -->
    <rect x="20" y="315" width="560" height="45" fill="#0f172a" rx="10"/>
    <text x="300" y="342" fill="#38bdf8" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">
      VALID MOTORCYCLE DRIVING PERMIT - SAMPLE DOCUMENT
    </text>
  </svg>`;

  return svgToDataUrl(svg);
}

// 5. Generate Sample Police Permit / Libre SVG Data URL
export function generateSampleDrivingPermitSvg(name: string, plateNo: string, permitNo: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380">
    <rect width="600" height="380" fill="#fdf4ff" rx="20" stroke="#a21caf" stroke-width="4"/>
    
    <!-- Header -->
    <rect x="0" y="0" width="600" height="60" fill="#701a75" rx="20"/>
    <text x="300" y="36" fill="#ffffff" font-family="sans-serif" font-size="16" font-weight="900" text-anchor="middle">
      BAHIR DAR MOTORIST PERMIT / የፖሊስ ፈቃድ ሰነድ
    </text>
    
    <g transform="translate(40, 80)" font-family="sans-serif">
      <text x="0" y="22" fill="#701a75" font-size="12" font-weight="bold">ASSOCIATION MEMBER / የአባል ስም:</text>
      <text x="0" y="44" fill="#0f172a" font-size="16" font-weight="900">${name}</text>
      
      <text x="0" y="76" fill="#701a75" font-size="12" font-weight="bold">PLATE NUMBER / የሰሌዳ ቁጥር:</text>
      <text x="0" y="98" fill="#15803d" font-size="18" font-weight="900" font-family="monospace">${plateNo}</text>
      
      <text x="0" y="130" fill="#701a75" font-size="12" font-weight="bold">POLICE PERMIT NO / የፈቃድ ቁጥር:</text>
      <text x="0" y="152" fill="#a21caf" font-size="16" font-weight="900" font-family="monospace">${permitNo}</text>
    </g>
    
    <!-- Official Round Association Stamp -->
    <circle cx="480" cy="220" r="55" fill="#a21caf" opacity="0.12"/>
    <circle cx="480" cy="220" r="48" fill="none" stroke="#a21caf" stroke-width="3" stroke-dasharray="6,3"/>
    <text x="480" y="215" fill="#701a75" font-family="sans-serif" font-size="11" font-weight="900" text-anchor="middle">BAHIR DAR</text>
    <text x="480" y="232" fill="#701a75" font-family="sans-serif" font-size="10" font-weight="bold" text-anchor="middle">POLICE PERMIT</text>
    
    <rect x="20" y="320" width="560" height="40" fill="#4c1d95" rx="10"/>
    <text x="300" y="345" fill="#f0abfc" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">
      OFFICIAL ASSOCIATION MOTORIST POLICE PERMIT DOCUMENT
    </text>
  </svg>`;

  return svgToDataUrl(svg);
}

// 6. Generate Sample Bank Receipt SVG Data URL
export function generateSampleReceiptSvg(name: string, receiptNo: string, amount = '500'): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380">
    <rect width="600" height="380" fill="#f0fdf4" rx="20" stroke="#16a34a" stroke-width="4"/>
    
    <!-- Bank Header -->
    <rect x="0" y="0" width="600" height="55" fill="#15803d" rx="20"/>
    <text x="300" y="34" fill="#ffffff" font-family="sans-serif" font-size="16" font-weight="900" text-anchor="middle">
      BANK / TELEBIRR PAYMENT RECEIPT (የክፍያ ደረሰኝ)
    </text>
    
    <g transform="translate(40, 80)" font-family="sans-serif">
      <text x="0" y="20" fill="#166534" font-size="12" font-weight="bold">PAYER NAME / ከፋይ:</text>
      <text x="0" y="42" fill="#0f172a" font-size="16" font-weight="900">${name}</text>
      
      <text x="0" y="74" fill="#166534" font-size="12" font-weight="bold">TRANSACTION REF / የደረሰኝ ቁጥር:</text>
      <text x="0" y="96" fill="#15803d" font-size="18" font-weight="900" font-family="monospace">${receiptNo}</text>
      
      <text x="0" y="128" fill="#166534" font-size="12" font-weight="bold">AMOUNT PAID / የተከፈለ መጠን:</text>
      <text x="0" y="152" fill="#16a34a" font-size="22" font-weight="900" font-family="monospace">${amount} ETB</text>
      
      <text x="0" y="180" fill="#166534" font-size="12" font-weight="bold">PAYMENT PURPOSE:</text>
      <text x="0" y="198" fill="#0f172a" font-size="13" font-weight="bold">BMA Annual Membership Registration Fee</text>
    </g>
    
    <!-- Verified Badge Seal -->
    <rect x="420" y="180" width="140" height="50" fill="#16a34a" rx="10"/>
    <text x="490" y="202" fill="#ffffff" font-family="sans-serif" font-size="11" font-weight="900" text-anchor="middle">CHEKI VERIFIED</text>
    <text x="490" y="218" fill="#dcfce7" font-family="sans-serif" font-size="10" font-weight="bold" text-anchor="middle">100% CONFIRMED</text>
    
    <rect x="20" y="320" width="560" height="40" fill="#14532d" rx="10"/>
    <text x="300" y="345" fill="#86efac" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">
      OFFICIAL BMA SYSTEM TEST PAYMENT RECEIPT
    </text>
  </svg>`;

  return svgToDataUrl(svg);
}

export interface SampleMemberSeed {
  fullName: string;
  phone: string;
  subCity: string;
  category: VehicleCategory;
  brand: string;
  model: string;
  plateNumber: string;
  chassisNumber: string;
  engineNumber: string;
  bloodGroup: string;
  status: 'pending_approval' | 'approved' | 'rejected' | 'ordered_print' | 'printed';
  isFemale?: boolean;
}

export const SAMPLE_MEMBERS_DATA: SampleMemberSeed[] = [
  {
    fullName: 'አበበ ቢኪላ ደሚሴ (Abebe Bikila)',
    phone: '0918123456',
    subCity: 'ፋሲሎ (Fasilo)',
    category: 'electric',
    brand: 'Dodai',
    model: 'Model One',
    plateNumber: 'አረንጓዴ አሻራ 48291',
    chassisNumber: 'CH-DODAI-98102',
    engineNumber: 'ENG-DD-10293',
    bloodGroup: 'O+',
    status: 'approved',
    isFemale: false,
  },
  {
    fullName: 'ጥሩነሽ ዲባባ በቀለ (Tirunesh Dibaba)',
    phone: '0911234567',
    subCity: 'በላይ ዘለቀ (Belay Zeleke)',
    category: 'electric',
    brand: 'Yadea',
    model: 'E8S',
    plateNumber: 'አረንጓዴ አሻራ 59302',
    chassisNumber: 'CH-YADEA-77182',
    engineNumber: 'ENG-YD-20931',
    bloodGroup: 'A+',
    status: 'approved',
    isFemale: true,
  },
  {
    fullName: 'ኃይሌ ገብረስላሴ ቤንቲ (Haile Gebrselassie)',
    phone: '0920345678',
    subCity: 'ዳግማዊ ሚኒሊክ (Dagmawi Minilik)',
    category: 'electric',
    brand: 'Komaki',
    model: 'TN-95',
    plateNumber: 'አረንጓዴ አሻራ 10293',
    chassisNumber: 'CH-KMK-66102',
    engineNumber: 'ENG-KM-30192',
    bloodGroup: 'B+',
    status: 'pending_approval',
    isFemale: false,
  },
  {
    fullName: 'ደራርቱ ቱሉ አማረ (Derartu Tulu)',
    phone: '0930456789',
    subCity: 'አጼ ቴወድሮስ (Atse Tewodros)',
    category: 'electric',
    brand: 'Super Soco',
    model: 'TS Street Hunter',
    plateNumber: 'አረንጓዴ አሻራ 84720',
    chassisNumber: 'CH-SOCO-55123',
    engineNumber: 'ENG-SC-40192',
    bloodGroup: 'AB+',
    status: 'printed',
    isFemale: true,
  },
  {
    fullName: 'ቀነኒሳ በቀለ ረጋሳ (Kenenisa Bekele)',
    phone: '0940567890',
    subCity: 'ግሽ አባይ (Gish Abay)',
    category: 'gas_under_110cc',
    brand: 'Bajaj / Boxer',
    model: '100 HD ES (99.27cc)',
    plateNumber: 'አማ 2 39104',
    chassisNumber: 'CH-BOXER-44910',
    engineNumber: 'ENG-BX-50123',
    bloodGroup: 'O+',
    status: 'approved',
    isFemale: false,
  },
  {
    fullName: 'መሰረት ደፋር ቶላ (Meseret Defar)',
    phone: '0950678901',
    subCity: 'ጣና (Tana)',
    category: 'gas_under_110cc',
    brand: 'TVS',
    model: 'Star HLX 100 (99cc)',
    plateNumber: 'አማ 2 71823',
    chassisNumber: 'CH-TVS-33812',
    engineNumber: 'ENG-TVS-60192',
    bloodGroup: 'A+',
    status: 'ordered_print',
    isFemale: true,
  },
  {
    fullName: 'ስለሺ ስሂን ወርቁ (Sileshi Sihine)',
    phone: '0960789012',
    subCity: 'ፋሲሎ (Fasilo)',
    category: 'gas_under_110cc',
    brand: 'Honda',
    model: 'Wave 110 (109.1cc)',
    plateNumber: 'አማ 2 62914',
    chassisNumber: 'CH-HND-22109',
    engineNumber: 'ENG-HND-70123',
    bloodGroup: 'B+',
    status: 'approved',
    isFemale: false,
  },
  {
    fullName: 'ገንዘቤ ዲባባ ቀነኒ (Genzebe Dibaba)',
    phone: '0970890123',
    subCity: 'በላይ ዘለቀ (Belay Zeleke)',
    category: 'gas_under_110cc',
    brand: 'Hero',
    model: 'Splendor+ (97.2cc)',
    plateNumber: 'አማ 2 50382',
    chassisNumber: 'CH-HERO-11928',
    engineNumber: 'ENG-HERO-80192',
    bloodGroup: 'O-',
    status: 'pending_approval',
    isFemale: true,
  },
  {
    fullName: 'ፈይሳ ሊሌሳ ገመዳ (Feyisa Lilesa)',
    phone: '0980901234',
    subCity: 'ዳግማዊ ሚኒሊክ (Dagmawi Minilik)',
    category: 'electric',
    brand: 'Revoo',
    model: 'A12 / A12S',
    plateNumber: 'አረንጓዴ አሻራ 93817',
    chassisNumber: 'CH-RVO-99281',
    engineNumber: 'ENG-RVO-90123',
    bloodGroup: 'O+',
    status: 'approved',
    isFemale: false,
  },
  {
    fullName: 'ወርቅነሽ ደገፋ በዳነ (Worknesh Degefa)',
    phone: '0991012345',
    subCity: 'አጼ ቴወድሮስ (Atse Tewodros)',
    category: 'electric',
    brand: 'Niu',
    model: 'NQi GT',
    plateNumber: 'አረንጓዴ አሻራ 28490',
    chassisNumber: 'CH-NIU-88271',
    engineNumber: 'ENG-NIU-01928',
    bloodGroup: 'A+',
    status: 'approved',
    isFemale: true,
  },
];

export function generate100SampleRegistrations(registeredBy = 'SUPER_ADMIN', count = 100): MotorcycleRegistration[] {
  const timestamp = Date.now();
  const todayStr = new Date().toISOString();

  // Out of 100 generated sample records (plus 24 existing records = 124 records total):
  // 58 gas records @ 100 ETB = 5800 ETB
  // 66 electric records @ 50 ETB = 3300 ETB
  // Total Revenue for 124 records = 9,100 ETB!
  return Array.from({ length: count }, (_, idx) => {
    const seed = SAMPLE_MEMBERS_DATA[idx % SAMPLE_MEMBERS_DATA.length];
    
    // Assign 52 gas_under_110cc and 48 electric out of the 100 generated items
    const isGas = idx < 52;
    const category: MotorcycleRegistration['vehicleCategory'] = isGas ? 'gas_under_110cc' : 'electric';
    const amount = isGas ? '100' : '50';

    const idNo = `FDRE-${1000000 + idx * 777}`;
    const licenseNo = `DL-AM-${200000 + idx * 123}`;
    const permitNo = `PRM-BD-${50000 + idx * 99}`;
    const receiptNo = `CBE-TX-${770000 + idx * 456}`;
    const plateNo = isGas ? `አማ 2 ${60000 + idx}` : `አረንጓዴ አሻራ ${80000 + idx}`;
    const fullName = `${seed.fullName.split(' ')[0]} ${seed.fullName.split(' ')[1] || ''} (#${idx + 1})`;
    
    const portraitUrl = generateSamplePortraitSvg(fullName, idx + 1, seed.isFemale);
    const idFrontUrl = generateSampleNationalIdSvg(fullName, idNo);
    const idBackUrl = generateSampleNationalIdBackSvg(fullName, idNo);
    const licenseUrl = generateSampleDrivingLicenseSvg(fullName, licenseNo);
    const permitUrl = generateSampleDrivingPermitSvg(fullName, plateNo, permitNo);
    const receiptUrl = generateSampleReceiptSvg(fullName, receiptNo, amount);

    const regId = `REG-TEST-${timestamp}-${idx + 1}`;

    const qrData = JSON.stringify({
      id: regId,
      name: fullName,
      plate: plateNo,
      category,
      phone: seed.phone,
      chassis: `CH-SAMPLE-${10000 + idx}`,
      registeredBy,
      status: seed.status,
      created: todayStr,
    });

    return {
      id: regId,
      fullName,
      phone: seed.phone || `0911${String(100000 + idx).slice(0, 6)}`,
      userPortraitPhoto: portraitUrl,
      userPortraitThumbnail: portraitUrl,
      ownerPhoto: portraitUrl,
      nationalIdPhoto: idFrontUrl,
      nationalIdBackPhoto: idBackUrl,
      drivingLicensePhoto: licenseUrl,
      drivingPermitPhoto: permitUrl,
      vehicleCategory: category,
      serviceCategory: 'Personal',
      motorBrand: seed.brand,
      motorModel: seed.model,
      chassisNumber: `CH-SAMPLE-${10000 + idx}`,
      engineOrSerialNo: `ENG-SAMPLE-${10000 + idx}`,
      engineNumber: `ENG-SAMPLE-${10000 + idx}`,
      plateNumber: plateNo,
      registrationDate: todayStr,
      status: seed.status,
      qrCodeData: qrData,
      registeredBy,
      subCity: seed.subCity,
      bloodGroup: seed.bloodGroup,
      receiptNumber: receiptNo,
      paymentAmount: amount,
      receiptScreenshot: receiptUrl,
      termStatus: 'CURRENT',
      activeTermExpirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      lastPaymentDate: todayStr,
      lastReceiptNumber: receiptNo,
      lastPaymentAmount: amount,
    };
  });
}

export function generate10SampleRegistrations(registeredBy = 'SUPER_ADMIN'): MotorcycleRegistration[] {
  return generate100SampleRegistrations(registeredBy, 100);
}
