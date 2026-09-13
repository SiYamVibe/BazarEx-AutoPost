"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Download,
  Send,
  ZoomIn,
  ZoomOut,
  CheckCircle2,
  RefreshCw,
  Sparkles,
} from "lucide-react";

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  previewUrl: string | null;
  exchangeNo: number;
  onConfirmPublish: () => Promise<void>;
  isPublishing: boolean;
  publishingStatus: string | null;
}

export default function PreviewModal({
  isOpen,
  onClose,
  previewUrl,
  exchangeNo,
  onConfirmPublish,
  isPublishing,
  publishingStatus,
}: PreviewModalProps) {
  const [isZoomed, setIsZoomed] = useState(false);

  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPublishing) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, isPublishing, onClose]);

  if (!isOpen || !previewUrl) return null;

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = previewUrl;
    link.download = `bazarex_exchange_${exchangeNo}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md transition-opacity duration-200 animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPublishing) onClose();
      }}
    >
      <div className="bg-[#12141a] border border-[#232733] rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Modal Top Bar */}
        <div className="px-6 py-4 border-b border-[#232733] flex items-center justify-between bg-[#151821]">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-[#E5A93C] animate-pulse" />
            <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
              <span>Final Artwork Preview</span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#232733] text-gray-400">
                1024 × 1024 px
              </span>
            </h3>
            <span className="text-xs font-mono font-black text-[#E5A93C] bg-[#E5A93C]/10 border border-[#E5A93C]/30 px-2 py-0.5 rounded-lg">
              #{exchangeNo}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsZoomed(!isZoomed)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1d212b] border border-[#2a3040] text-xs font-medium text-gray-300 hover:text-white hover:bg-[#252b38] transition"
              title={isZoomed ? "Fit to modal" : "1:1 Actual size"}
            >
              {isZoomed ? (
                <>
                  <ZoomOut className="w-3.5 h-3.5 text-[#E5A93C]" />
                  <span>Fit</span>
                </>
              ) : (
                <>
                  <ZoomIn className="w-3.5 h-3.5 text-[#E5A93C]" />
                  <span>100% Zoom</span>
                </>
              )}
            </button>

            <button
              onClick={onClose}
              disabled={isPublishing}
              className="p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-[#232733] disabled:opacity-50 transition"
              title="Close (ESC)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Image Viewport */}
        <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-[#090a0d]/90 relative min-h-[440px]">
          <div
            className={`transition-all duration-200 cursor-pointer select-none ${
              isZoomed ? "overflow-auto max-w-none" : "flex items-center justify-center"
            }`}
            onClick={() => setIsZoomed(!isZoomed)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Final Composed Exchange Artwork"
              className={`rounded-2xl shadow-2xl border border-[#232733] object-contain transition-transform ${
                isZoomed
                  ? "w-[1024px] h-[1024px] min-w-[1024px] cursor-zoom-out"
                  : "max-h-[64vh] max-w-full aspect-square cursor-zoom-in hover:scale-[1.005]"
              }`}
            />
          </div>
        </div>

        {/* Modal Bottom Bar */}
        <div className="px-6 py-4 border-t border-[#232733] flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#151821]">
          <div className="text-xs text-gray-400 flex items-center gap-2">
            {isPublishing ? (
              <span className="flex items-center gap-2 text-[#E5A93C] font-medium">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                {publishingStatus || "Publishing to Meta Graph API..."}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Sanitized & Composited onto ebg.webp frame</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={handleDownload}
              disabled={isPublishing}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1d212b] border border-[#2a3040] text-xs font-bold text-gray-200 hover:bg-[#252b38] hover:text-white disabled:opacity-50 transition"
            >
              <Download className="w-4 h-4 text-[#E5A93C]" />
              <span>Download Preview (PNG)</span>
            </button>

            <button
              onClick={onConfirmPublish}
              disabled={isPublishing}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#F3C363] to-[#E5A93C] text-[#0d0e12] text-xs font-black hover:opacity-95 shadow-lg shadow-[#E5A93C]/20 disabled:opacity-50 transition active:scale-[0.98]"
            >
              {isPublishing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Publishing...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Confirm & Publish to Facebook</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
