import re

with open('src/components/MunicipalDashboardOverview.tsx', 'r') as f:
    text = f.read()

def replace_first(pattern, replacement, string):
    return re.sub(pattern, replacement, string, count=1, flags=re.DOTALL)

# 1. Super Admin Key Governance
text = replace_first(
    r'\{\/\* SUPER ADMIN KEY GOVERNANCE STATS CARDS \(FOR SUPERADMIN ROLE ON DASHBOARD ONLY\) \*\/.*?<div className="bg-surface-container-lowest[^>]*p-3 sm:p-4[^>]*space-y-3">',
    r'      {/* ==================== UNIFIED OVERVIEW CONTAINER ==================== */}\n'
    r'      <div className="bg-surface-container-lowest border border-outline-variant/70 rounded-xl shadow-xs overflow-hidden mb-6">\n'
    r'        <div className="flex items-center gap-2.5 border-b border-outline-variant/60 px-4 sm:px-5 py-3.5 bg-slate-50/50 dark:bg-slate-900/50">\n'
    r'          <Icon className="material-symbols-outlined text-[22px] text-primary shrink-0">dashboard</Icon>\n'
    r'          <h2 className="font-black text-sm sm:text-base text-on-surface uppercase tracking-wider">\n'
    r'            {isAmharic ? \'አጠቃላይ እይታ\' : \'Overview\'}\n'
    r'          </h2>\n'
    r'        </div>\n'
    r'        <div className="flex flex-col divide-y divide-outline-variant/60 dark:divide-slate-800">\n\n'
    r'      {/* SUPER ADMIN KEY GOVERNANCE STATS CARDS (FOR SUPERADMIN ROLE ON DASHBOARD ONLY) */}\n'
    r'      {userRole === \'superadmin\' && (\n'
    r'        <div className="p-4 sm:p-5 space-y-4">',
    text
)

# 2. Clerk Stats Overview Cards
text = replace_first(
    r'\{\/\* CLERK STATS OVERVIEW CARDS \(ONLY VISIBLE WHEN TOGGLED ON IN SUPER ADMIN\) \*\/.*?<div className="bg-surface-container-lowest[^>]*p-3 sm:p-4[^>]*space-y-3">',
    r'{/* CLERK STATS OVERVIEW CARDS (ONLY VISIBLE WHEN TOGGLED ON IN SUPER ADMIN) */}\n      {userRole === \'clerk\' && settings.showClerkPermitStatus && (\n        <div className="p-4 sm:p-5 space-y-4">',
    text
)


# 3. Standalone Metric Sections container wrapper
text = replace_first(
    r'\{\/\* ==================== STANDALONE METRIC SECTIONS \(FOR SUPER ADMIN & MANAGER\) ==================== \*\/\s*\{\(userRole === \'superadmin\' \|\| userRole === \'admin\'\) && \(\s*<div className="space-y-4">',
    r'{/* ==================== STANDALONE METRIC SECTIONS (FOR SUPER ADMIN & MANAGER) ==================== */}\n      {(userRole === \'superadmin\' || userRole === \'admin\') && (\n        <>',
    text
)


# 3a. Payment Receipts wrapper
text = replace_first(
    r'\{\/\* 1\. Payment Receipts & Compliance Metrics \(Super Admin Only\) \*\/\s*\{\(userRole === \'superadmin\' \|\| \(userRole as string\) === \'super_admin\'\) && \(\s*<div className="bg-surface-container-lowest[^>]*p-3 sm:p-4[^>]*space-y-3">',
    r'{/* 1. Payment Receipts & Compliance Metrics (Super Admin Only) */}\n          {(userRole === \'superadmin\' || (userRole as string) === \'super_admin\') && (\n            <div className="p-4 sm:p-5 space-y-4">',
    text
)


# 3c. Field Officer Patrol Hub wrapper
text = replace_first(
    r'\{\/\* 3\. Field Officer Patrol & Inspection Hub \*\/\s*<div className="bg-surface-container-lowest[^>]*p-3 sm:p-4[^>]*space-y-3">',
    r'{/* 3. Field Officer Patrol & Inspection Hub */}\n          <div className="p-4 sm:p-5 space-y-4">',
    text
)

# 3d. Unregistered Vehicles Alert
text = replace_first(
    r'\{\/\* 4\. Unregistered Vehicles Alert \*\/\s*\{unregisteredReports\.length > 0 && \(\s*<div className="bg-surface-container-lowest[^>]*p-3 sm:p-4[^>]*space-y-3">',
    r'{/* 4. Unregistered Vehicles Alert */}\n          {unregisteredReports.length > 0 && (\n            <div className="p-4 sm:p-5 space-y-4">',
    text
)

# Replace the closing `</div>` for Standalone Metric Sections container
# It's right before `{/* ==================== FIELD OFFICER PATROL HUB`
text = replace_first(
    r'\s*\)\}\s*<\/div>\s*\)\}\s*\{\/\* ==================== FIELD OFFICER PATROL HUB \(FOR OFFICER ROLE ONLY\) ==================== \*\/',
    r'\n          )}\n        </>\n      )}\n\n      {/* ==================== FIELD OFFICER PATROL HUB (FOR OFFICER ROLE ONLY) ==================== */}',
    text
)


# 4. Field Officer Patrol Hub (Officer Role) wrapper
text = replace_first(
    r'\{\/\* ==================== FIELD OFFICER PATROL HUB \(FOR OFFICER ROLE ONLY\) ==================== \*\/\s*\{userRole === \'officer\' && getPermissionState\(userRole, 10\) !== \'deny\' && \(\s*<div className="bg-surface-container-lowest[^>]*p-3 sm:p-4[^>]*space-y-3">',
    r'{/* ==================== FIELD OFFICER PATROL HUB (FOR OFFICER ROLE ONLY) ==================== */}\n      {userRole === \'officer\' && getPermissionState(userRole, 10) !== \'deny\' && (\n        <div className="p-4 sm:p-5 space-y-4">',
    text
)

# 5. Close the Unified container before Quick Action Shortcuts
text = replace_first(
    r'\{\/\* ==================== QUICK ACTION SHORTCUTS ==================== \*\/',
    r'        </div>\n      </div>\n\n      {/* ==================== QUICK ACTION SHORTCUTS ==================== */}',
    text
)

with open('src/components/MunicipalDashboardOverview.tsx', 'w') as f:
    f.write(text)
