import React from "react";
import { Shield, CheckCircle2 } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0d0e12] text-gray-100 flex flex-col items-center justify-center p-6 font-sans select-none">
      <div className="max-w-md w-full bg-[#14161d] border border-[#232733] rounded-3xl p-8 flex flex-col items-center text-center shadow-2xl shadow-black/60 relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-[#E5A93C]/10 rounded-full blur-3xl pointer-events-none" />

        {/* Brand Icon */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#F3C363] to-[#B87B1D] flex items-center justify-center shadow-xl shadow-[#E5A93C]/20 mb-5">
          <Shield className="w-8 h-8 text-[#0d0e12] stroke-[2.5]" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-black tracking-widest text-[#E5A93C] mb-1">
          BAZAREX AUTOPOST
        </h1>
        <p className="text-xs text-gray-400 font-medium mb-6">
          Autonomous Facebook Exchange Publisher Service
        </p>

        {/* Live Status Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold mb-6">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Service Online & Listening</span>
        </div>

        <div className="w-full pt-6 border-t border-[#232733] text-[11px] text-gray-500 flex items-center justify-between">
          <span>Target: Facebook Graph API</span>
          <span>Interval: 30m Auto-Schedule</span>
        </div>
      </div>
    </main>
  );
}
