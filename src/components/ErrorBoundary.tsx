import React, { Component, ErrorInfo, ReactNode } from 'react';
import { recordCrash, formatCrashReportForSharing, copyCrashReportToClipboard, CrashReport } from '../utils/crashReporter';
import { Icon } from './ui/Icon';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  report: CrashReport | null;
  copied: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      report: null,
      copied: false,
    };
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const report = recordCrash(error, {
      type: 'render_error',
      componentStack: errorInfo.componentStack || undefined,
    });
    this.setState({ report });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, report: null, copied: false });
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleCopy = async () => {
    if (!this.state.report) return;
    const ok = await copyCrashReportToClipboard(this.state.report);
    if (ok) {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2500);
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isAmharic =
        typeof document !== 'undefined' &&
        (document.documentElement.lang === 'am' ||
          document.documentElement.classList.contains('system-lang-am'));

      return (
        <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-950 text-slate-100">
          <div className="w-full max-w-xl bg-slate-900 border-2 border-rose-600/60 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-500 shrink-0">
                <Icon className="material-symbols-outlined text-[36px]">error</Icon>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-white">
                  {isAmharic ? 'የስርዓት መቆራረጥ አጋጥሟል' : 'Application Render Error'}
                </h1>
                <p className="text-xs sm:text-sm text-slate-400">
                  {isAmharic
                    ? 'ገጹን ሲያሳይ ያልተጠበቀ ስህተት አጋጥሟል። የስህተት ሪፖርት ተመዝግቧል።'
                    : 'An unexpected error interrupted the display. A crash report has been saved.'}
                </p>
              </div>
            </div>

            <div className="bg-slate-950 border border-rose-900/50 rounded-xl p-4 text-xs font-mono text-rose-300 break-words max-h-40 overflow-y-auto">
              <div className="text-[10px] text-slate-500 mb-1">
                {this.state.report?.id || 'CRASH_CAPTURED'}
              </div>
              {this.state.error?.message || 'Unknown render exception'}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 min-h-[46px] px-5 py-2.5 rounded-xl font-black text-xs sm:text-sm bg-rose-600 hover:bg-rose-700 active:scale-95 text-white flex items-center justify-center gap-2 transition-all cursor-pointer touch-manipulation"
              >
                <Icon className="material-symbols-outlined text-[20px]">refresh</Icon>
                <span>{isAmharic ? 'ገጹን ድጋሚ ጫን (Reload)' : 'Reload Application'}</span>
              </button>

              <button
                type="button"
                onClick={this.handleReset}
                className="min-h-[46px] px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 border border-slate-700 flex items-center justify-center gap-2 transition-all cursor-pointer touch-manipulation"
              >
                <Icon className="material-symbols-outlined text-[20px]">restart_alt</Icon>
                <span>{isAmharic ? 'ድጋሚ ሞክር' : 'Try Recovering'}</span>
              </button>

              <button
                type="button"
                onClick={this.handleCopy}
                className={`w-full min-h-[44px] px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 border transition-all cursor-pointer touch-manipulation ${
                  this.state.copied
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800 active:scale-95'
                }`}
              >
                <Icon className="material-symbols-outlined text-[18px]">
                  {this.state.copied ? 'check_circle' : 'content_copy'}
                </Icon>
                <span>
                  {this.state.copied
                    ? isAmharic
                      ? 'ሪፖርት ተቀድቷል!'
                      : 'Crash Diagnostics Copied!'
                    : isAmharic
                    ? 'የስህተት ሪፖርት ቅዳ (Copy Report)'
                    : 'Copy Diagnostics for Support'}
                </span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
