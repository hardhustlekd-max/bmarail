import re

with open('src/components/MunicipalDashboardOverview.tsx', 'r') as f:
    text = f.read()

# 1. Start wrapper just before SUPER ADMIN KEY GOVERNANCE STATS CARDS
start_idx = text.find("{/* SUPER ADMIN KEY GOVERNANCE STATS CARDS")
end_idx = text.find("{/* ==================== QUICK ACTION SHORTCUTS ==================== */}")

metrics_content = text[start_idx:end_idx]

# Replace individual section wrappers
# Pattern for standard metric blocks:
# <div className="bg-surface-container-lowest ... rounded-lg p-3 sm:p-4 shadow-xs space-y-3">
# We will replace it with:
# <div className="p-4 sm:p-5 space-y-4">

wrapper_pattern = r'<div className="bg-surface-container-lowest[^>]*p-3 sm:p-4[^>]*space-y-3">'
metrics_content = re.sub(wrapper_pattern, '<div className="p-4 sm:p-5 space-y-4">', metrics_content)

# We also have a `<div className="space-y-4">` in the standalone metric sections which should just become `<>`
# wait, actually it's:
#       {(userRole === 'superadmin' || userRole === 'admin') && (
#         <div className="space-y-4">
# Let's replace that specific div with empty fragment or just a div with `contents` class. 
# `contents` makes the div essentially disappear from layout, so divide-y will bypass it? No, divide-y applies to direct children. 
# If we change it to `<React.Fragment>` it's better. But we don't have to. We can just use `<div className="flex flex-col divide-y divide-outline-variant/60 dark:divide-slate-800">` instead of `space-y-4` there too.
# But wait, we want the unified container to be for ALL metrics.

# Let's manually replace the wrapper in a clever way.
# First, wrap the entire block in the new Overview container:
unified_header = """
      <div className="bg-surface-container-lowest border border-outline-variant/70 rounded-xl shadow-xs overflow-hidden mb-6">
        {/* Unified Overview Header */}
        <div className="flex items-center gap-2.5 border-b border-outline-variant/60 px-4 sm:px-5 py-3.5 bg-slate-50/50 dark:bg-slate-900/50">
          <Icon className="material-symbols-outlined text-[22px] text-primary shrink-0">dashboard</Icon>
          <h2 className="font-black text-sm sm:text-base text-on-surface uppercase tracking-wider">
            {isAmharic ? 'አጠቃላይ እይታ' : 'Overview'}
          </h2>
        </div>
        
        <div className="flex flex-col divide-y divide-outline-variant/60 dark:divide-slate-800">
"""

# Close it at the end
unified_footer = """
        </div>
      </div>
"""

# Let's replace the `div className="space-y-4"` with just a fragment.
# Look for:
#       {(userRole === 'superadmin' || userRole === 'admin') && (
#         <div className="space-y-4">
metrics_content = metrics_content.replace(
    "{(userRole === 'superadmin' || userRole === 'admin') && (\n        <div className=\"space-y-4\">",
    "{(userRole === 'superadmin' || userRole === 'admin') && (\n        <>"
)
# And the closing div for it (this is a bit tricky, it's just before `)}` for that block)
# Actually, replacing that div with `div className="flex flex-col divide-y divide-outline-variant/60 dark:divide-slate-800"` works perfectly if we just make it part of the flow! 
# But we want ONE overall Overview box. 
# So if we make it `<>`, we have to find the closing `</div>` for it.
