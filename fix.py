with open('src/components/MunicipalDashboardOverview.tsx', 'r') as f:
    text = f.read()

# 1. The Super Admin Governance Stats wrapper
text = text.replace(
    '''      {/* SUPER ADMIN KEY GOVERNANCE STATS CARDS (FOR SUPERADMIN ROLE ON DASHBOARD ONLY) */}
      {userRole === 'superadmin' && (
        <div className="bg-surface-container-lowest border border-outline-variant/70 rounded-lg p-3 sm:p-4 shadow-xs space-y-3">''',
    '''      {/* SUPER ADMIN KEY GOVERNANCE STATS CARDS (FOR SUPERADMIN ROLE ON DASHBOARD ONLY) */}
      {userRole === 'superadmin' && (
        <div className="p-4 sm:p-5 space-y-4">'''
)

# 2. Clerk Stats wrapper
text = text.replace(
    '''      {/* CLERK STATS OVERVIEW CARDS (ONLY VISIBLE WHEN TOGGLED ON IN SUPER ADMIN) */}
      {userRole === 'clerk' && settings.showClerkPermitStatus && (
        <div className="bg-surface-container-lowest border border-outline-variant/70 rounded-lg p-3 sm:p-4 shadow-xs space-y-3">''',
    '''      {/* CLERK STATS OVERVIEW CARDS (ONLY VISIBLE WHEN TOGGLED ON IN SUPER ADMIN) */}
      {userRole === 'clerk' && settings.showClerkPermitStatus && (
        <div className="p-4 sm:p-5 space-y-4">'''
)

# 3. Standalone Metric Sections container
text = text.replace(
    '''      {/* ==================== STANDALONE METRIC SECTIONS (FOR SUPER ADMIN & MANAGER) ==================== */}
      {(userRole === 'superadmin' || userRole === 'admin') && (
        <div className="space-y-4">''',
    '''      {/* ==================== STANDALONE METRIC SECTIONS (FOR SUPER ADMIN & MANAGER) ==================== */}
      {(userRole === 'superadmin' || userRole === 'admin') && (
        <>'''
)
# The closing for Standalone metric sections is a bit tricky. It is followed by `      {/* ==================== FIELD OFFICER PATROL HUB (FOR OFFICER ROLE ONLY) ==================== */}`
text = text.replace(
    '''          )}
        </div>
      )}

      {/* ==================== FIELD OFFICER PATROL HUB (FOR OFFICER ROLE ONLY) ==================== */}''',
    '''          )}
        </>
      )}

      {/* ==================== FIELD OFFICER PATROL HUB (FOR OFFICER ROLE ONLY) ==================== */}'''
)


# Inside standalone: Revenue
text = text.replace(
    '''          {/* 1. Payment Receipts & Compliance Metrics (Super Admin Only) */}
          {(userRole === 'superadmin' || (userRole as string) === 'super_admin') && (
            <div className="bg-surface-container-lowest dark:bg-slate-900 border border-outline-variant dark:border-slate-800 rounded-lg p-3 sm:p-4 shadow-xs space-y-3">''',
    '''          {/* 1. Payment Receipts & Compliance Metrics (Super Admin Only) */}
          {(userRole === 'superadmin' || (userRole as string) === 'super_admin') && (
            <div className="p-4 sm:p-5 space-y-4">'''
)

# Inside standalone: Patrol
text = text.replace(
    '''          {/* 3. Field Officer Patrol & Inspection Hub */}
          <div className="bg-surface-container-lowest dark:bg-slate-900 border border-outline-variant dark:border-slate-800 rounded-lg p-3 sm:p-4 shadow-xs space-y-3">''',
    '''          {/* 3. Field Officer Patrol & Inspection Hub */}
          <div className="p-4 sm:p-5 space-y-4">'''
)

# Inside standalone: Unregistered Vehicles Alert
text = text.replace(
    '''          {/* 4. Unregistered Vehicles Alert */}
          {unregisteredReports.length > 0 && (
            <div className="bg-surface-container-lowest dark:bg-slate-900 border border-outline-variant dark:border-slate-800 rounded-lg p-3 sm:p-4 shadow-xs space-y-3">''',
    '''          {/* 4. Unregistered Vehicles Alert */}
          {unregisteredReports.length > 0 && (
            <div className="p-4 sm:p-5 space-y-4">'''
)

# 4. Officer Patrol Hub
text = text.replace(
    '''      {/* ==================== FIELD OFFICER PATROL HUB (FOR OFFICER ROLE ONLY) ==================== */}
      {userRole === 'officer' && getPermissionState(userRole, 10) !== 'deny' && (
        <div className="bg-surface-container-lowest border border-outline-variant/70 rounded-lg p-3 sm:p-4 shadow-xs space-y-3">''',
    '''      {/* ==================== FIELD OFFICER PATROL HUB (FOR OFFICER ROLE ONLY) ==================== */}
      {userRole === 'officer' && getPermissionState(userRole, 10) !== 'deny' && (
        <div className="p-4 sm:p-5 space-y-4">'''
)

# 5. Add the wrapping Unified container
unified_top = '''      {/* ==================== UNIFIED OVERVIEW CONTAINER ==================== */}
      <div className="bg-surface-container-lowest border border-outline-variant/70 rounded-xl shadow-xs overflow-hidden mb-6">
        {/* Unified Overview Header */}
        <div className="flex items-center gap-2.5 border-b border-outline-variant/60 px-4 sm:px-5 py-3.5 bg-slate-50/50 dark:bg-slate-900/50">
          <Icon className="material-symbols-outlined text-[22px] text-primary shrink-0">dashboard</Icon>
          <h2 className="font-black text-sm sm:text-base text-on-surface uppercase tracking-wider">
            {isAmharic ? 'አጠቃላይ እይታ' : 'Overview'}
          </h2>
        </div>
        
        <div className="flex flex-col divide-y divide-outline-variant/60 dark:divide-slate-800">

'''
text = text.replace('      {/* SUPER ADMIN KEY GOVERNANCE STATS CARDS (FOR SUPERADMIN ROLE ON DASHBOARD ONLY) */}', unified_top + '      {/* SUPER ADMIN KEY GOVERNANCE STATS CARDS (FOR SUPERADMIN ROLE ON DASHBOARD ONLY) */}')

unified_bottom = '''
        </div>
      </div>
      {/* ==================== QUICK ACTION SHORTCUTS ==================== */}'''
text = text.replace('      {/* ==================== QUICK ACTION SHORTCUTS ==================== */}', unified_bottom)


with open('src/components/MunicipalDashboardOverview.tsx', 'w') as f:
    f.write(text)
