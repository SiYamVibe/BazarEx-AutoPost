"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Shield,
  Upload,
  CheckCircle2,
  AlertCircle,
  Eye,
  Send,
  RefreshCw,
  Edit2,
  Trash2,
  ExternalLink,
  Sliders,
  Sparkles,
  Lock,
  ArrowLeftRight,
  ArrowRight,
  Layers,
} from "lucide-react";
import PreviewModal from "@/components/preview-modal";

interface ManualBox {
  id: string;
  xRatio: number;
  yRatio: number;
  wRatio: number;
  hRatio: number;
  label?: string;
}

interface ImageCardState {
  file: File | null;
  previewUrl: string | null;
  imgNaturalWidth: number;
  imgNaturalHeight: number;
  autoBlur: boolean;
  manualBoxes: ManualBox[];
  detectedCount: number;
}

const CURRENCIES = [
  { code: "INR", label: "INR 🇮🇳" },
  { code: "PKR", label: "PKR 🇵🇰" },
  { code: "BDT", label: "BDT 🇧🇩" },
  { code: "USD", label: "USD 🇺🇸" },
];

function generateDefaultCaption(counter: number, fromCurr: string, toCurr: string) {
  return `💸 Exchange Successful ✅
Exchange ID: #${counter}
Exchange Details:
🟢 From: ${fromCurr}
🔵 To: ${toCurr}

🤝 Thank you for trusting us with your exchange!

🔗 Join: .gg/bazarex`;
}

export default function Dashboard() {
  const [exchangeNo, setExchangeNo] = useState<number>(11042);
  const [isEditingCounter, setIsEditingCounter] = useState(false);
  const [tempCounter, setTempCounter] = useState("11042");

  const [fromCurrency, setFromCurrency] = useState("INR 🇮🇳");
  const [toCurrency, setToCurrency] = useState("PKR 🇵🇰");
  const [detectionConfidence, setDetectionConfidence] = useState<string | null>(null);

  const [caption, setCaption] = useState("");
  const [captionCustomized, setCaptionCustomized] = useState(false);

  const [dryRun, setDryRun] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);

  // Received and Sent card states
  const [receivedCard, setReceivedCard] = useState<ImageCardState>({
    file: null,
    previewUrl: null,
    imgNaturalWidth: 1080,
    imgNaturalHeight: 1920,
    autoBlur: true,
    manualBoxes: [],
    detectedCount: 0,
  });

  const [sentCard, setSentCard] = useState<ImageCardState>({
    file: null,
    previewUrl: null,
    imgNaturalWidth: 1080,
    imgNaturalHeight: 1920,
    autoBlur: true,
    manualBoxes: [],
    detectedCount: 0,
  });

  const [compositePreview, setCompositePreview] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successPost, setSuccessPost] = useState<{ id: string; permalink_url: string; simulated?: boolean } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch counter on mount
  useEffect(() => {
    fetch("/api/counter")
      .then((res) => res.json())
      .then((data) => {
        if (data.exchangeNo) {
          setExchangeNo(data.exchangeNo);
          setTempCounter(String(data.exchangeNo));
        }
      })
      .catch((err) => console.error("Could not fetch counter", err));
  }, []);

  // Update caption dynamically when currencies or counter change, unless customized
  useEffect(() => {
    if (!captionCustomized) {
      setCaption(generateDefaultCaption(exchangeNo, fromCurrency, toCurrency));
    }
  }, [exchangeNo, fromCurrency, toCurrency, captionCustomized]);

  const handleSaveCounter = async () => {
    const val = parseInt(tempCounter, 10);
    if (isNaN(val) || val < 0) return;
    try {
      const res = await fetch("/api/counter", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exchangeNo: val }),
      });
      const data = await res.json();
      if (data.exchangeNo) {
        setExchangeNo(data.exchangeNo);
        setIsEditingCounter(false);
      }
    } catch {
      alert("Failed to update counter");
    }
  };

  // Helper to load an image file into state
  const prepareCardState = (file: File): Promise<ImageCardState> => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        resolve({
          file,
          previewUrl: url,
          imgNaturalWidth: img.naturalWidth || 1080,
          imgNaturalHeight: img.naturalHeight || 1920,
          autoBlur: true,
          manualBoxes: [],
          detectedCount: 0,
        });
      };
      img.onerror = () => {
        resolve({
          file,
          previewUrl: url,
          imgNaturalWidth: 1080,
          imgNaturalHeight: 1920,
          autoBlur: true,
          manualBoxes: [],
          detectedCount: 0,
        });
      };
      img.src = url;
    });
  };

  // Handle dropping or selecting 2 files simultaneously
  const handleDualUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).slice(0, 2);
    if (fileArray.length < 2) {
      setErrorMessage("Please drop or select exactly 2 screenshot files.");
      return;
    }

    setErrorMessage(null);
    setSuccessPost(null);
    setCompositePreview(null);
    setIsModalOpen(false);
    setIsClassifying(true);
    setStatusMessage("Classifying receipts & detecting currency pair autonomously...");

    try {
      const [f0, f1] = fileArray;
      const [card0, card1] = await Promise.all([prepareCardState(f0), prepareCardState(f1)]);

      const fd = new FormData();
      fd.append("file0", f0);
      fd.append("file1", f1);

      const res = await fetch("/api/classify", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();

      if (res.ok && data.success) {
        const isF0Received = data.receivedIndex === 0;
        setReceivedCard(isF0Received ? card0 : card1);
        setSentCard(isF0Received ? card1 : card0);

        if (data.fromCurrency?.label) setFromCurrency(data.fromCurrency.label);
        if (data.toCurrency?.label) setToCurrency(data.toCurrency.label);
        setDetectionConfidence(data.confidence || "high");
      } else {
        // Fallback: 0 = Received, 1 = Sent
        setReceivedCard(card0);
        setSentCard(card1);
        setDetectionConfidence("fallback");
      }
    } catch (err: any) {
      console.error("Classification error:", err);
      const [c0, c1] = await Promise.all([prepareCardState(fileArray[0]), prepareCardState(fileArray[1])]);
      setReceivedCard(c0);
      setSentCard(c1);
      setDetectionConfidence("fallback");
    } finally {
      setIsClassifying(false);
      setStatusMessage(null);
    }
  };

  // 1-Click Swap Cards
  const handleSwapCards = () => {
    setReceivedCard(sentCard);
    setSentCard(receivedCard);

    const prevFrom = fromCurrency;
    setFromCurrency(toCurrency);
    setToCurrency(prevFrom);
  };

  // Convert manual boxes to pixel coords
  const getPixelBoxes = (card: ImageCardState) => {
    return card.manualBoxes.map((b) => ({
      x: Math.round(b.xRatio * card.imgNaturalWidth),
      y: Math.round(b.yRatio * card.imgNaturalHeight),
      width: Math.round(b.wRatio * card.imgNaturalWidth),
      height: Math.round(b.hRatio * card.imgNaturalHeight),
      reason: "Manual Blur",
    }));
  };

  // Generate high-fidelity 1024x1024 preview and open modal
  const handleGeneratePreview = async () => {
    if (!receivedCard.file || !sentCard.file) {
      setErrorMessage("Please upload both screenshots before generating preview.");
      return;
    }

    setIsPreviewLoading(true);
    setErrorMessage(null);
    setStatusMessage("Running OCR Privacy Guard & compositing preview...");

    try {
      const fd = new FormData();
      fd.append("received", receivedCard.file);
      fd.append("sent", sentCard.file);
      fd.append("autoBlur", String(receivedCard.autoBlur && sentCard.autoBlur));
      fd.append("exchangeNo", String(exchangeNo));

      const manualBoxes = {
        received: getPixelBoxes(receivedCard),
        sent: getPixelBoxes(sentCard),
      };
      fd.append("manualBoxes", JSON.stringify(manualBoxes));

      const res = await fetch("/api/preview", {
        method: "POST",
        body: fd,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate preview");
      }

      setCompositePreview(data.previewUrl);
      setIsModalOpen(true);

      if (data.detectedBoxes) {
        setReceivedCard((prev) => ({
          ...prev,
          detectedCount: data.detectedBoxes.received?.length || 0,
        }));
        setSentCard((prev) => ({
          ...prev,
          detectedCount: data.detectedBoxes.sent?.length || 0,
        }));
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to generate preview");
    } finally {
      setIsPreviewLoading(false);
      setStatusMessage(null);
    }
  };

  // Publish to Facebook
  const handlePublish = async () => {
    if (!receivedCard.file || !sentCard.file) {
      setErrorMessage("Please upload both receipts.");
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessPost(null);
    setStatusMessage("Sanitizing sensitive data & preparing artwork...");

    try {
      const fd = new FormData();
      fd.append("received", receivedCard.file);
      fd.append("sent", sentCard.file);
      fd.append("caption", caption);
      fd.append("autoBlur", String(receivedCard.autoBlur && sentCard.autoBlur));
      fd.append("dryRun", String(dryRun));

      const manualBoxes = {
        received: getPixelBoxes(receivedCard),
        sent: getPixelBoxes(sentCard),
      };
      fd.append("manualBoxes", JSON.stringify(manualBoxes));

      setStatusMessage("Dispatching to Meta Graph API...");
      const res = await fetch("/api/exchange", {
        method: "POST",
        body: fd,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to publish exchange");
      }

      setSuccessPost(data.post);
      setCompositePreview(data.previewUrl);
      setExchangeNo(data.nextExchangeNo);
      setTempCounter(String(data.nextExchangeNo));
      setIsModalOpen(false);
    } catch (err: any) {
      setErrorMessage(err.message || "Publishing failed");
    } finally {
      setIsProcessing(false);
      setStatusMessage(null);
    }
  };

  const hasScreenshots = Boolean(receivedCard.file && sentCard.file);

  return (
    <div className="min-h-screen bg-[#0d0e12] text-gray-100 flex flex-col font-sans selection:bg-[#E5A93C]/30">
      {/* Top Header */}
      <header className="border-b border-[#232733] bg-[#12141a]/90 backdrop-blur sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#F3C363] to-[#B87B1D] flex items-center justify-center shadow-lg shadow-[#E5A93C]/20">
            <Shield className="w-5 h-5 text-[#0d0e12] stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold tracking-widest text-[#E5A93C] text-lg">BAZAREX</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#232733] text-gray-400 uppercase tracking-wider">
                Autonomous
              </span>
            </div>
            <p className="text-xs text-gray-400">P2P Proof Sanitizer & Facebook Publisher</p>
          </div>
        </div>

        {/* Counter & Mode */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[#171a22] border border-[#232733] px-3.5 py-1.5 rounded-full shadow-inner">
            <span className="text-xs text-gray-400 font-medium">Exchange Counter:</span>
            {isEditingCounter ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  value={tempCounter}
                  onChange={(e) => setTempCounter(e.target.value)}
                  className="w-20 bg-[#0d0e12] border border-[#E5A93C] rounded px-1.5 py-0.5 text-sm font-bold text-[#E5A93C] text-center outline-none"
                  autoFocus
                />
                <button
                  onClick={handleSaveCounter}
                  className="px-2 py-0.5 text-xs bg-[#E5A93C] text-[#0d0e12] rounded font-bold hover:bg-[#f5b746]"
                >
                  Save
                </button>
                <button
                  onClick={() => setIsEditingCounter(false)}
                  className="text-xs text-gray-400 hover:text-white px-1"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="font-mono font-black text-sm text-[#E5A93C]">#{exchangeNo}</span>
                <button
                  onClick={() => setIsEditingCounter(true)}
                  title="Override Counter"
                  className="text-gray-400 hover:text-[#E5A93C] transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none bg-[#171a22] border border-[#232733] px-3 py-1.5 rounded-full">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="accent-[#E5A93C] rounded"
            />
            <span>Dry Run Mode</span>
          </label>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Error Notification */}
        {errorMessage && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3 text-red-400 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex-1">
              <strong className="font-semibold block">Error</strong>
              {errorMessage}
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-red-200">
              ✕
            </button>
          </div>
        )}

        {/* Success Post Banner */}
        {successPost && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-center justify-between text-emerald-300 text-sm">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <p className="font-semibold">
                  {successPost.simulated ? "Simulated Publish Successful" : "Published to Facebook Page!"}
                </p>
                <p className="text-xs text-emerald-400/80">
                  Counter auto-incremented to <span className="font-bold">#{exchangeNo}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-[#232733] text-gray-200 font-bold text-xs hover:bg-[#2e3444] transition"
              >
                View Artwork
              </button>
              <a
                href={successPost.permalink_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-[#0d0e12] font-bold text-xs hover:bg-emerald-400 transition"
              >
                <span>View Post</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}

        {/* Unified Dropzone */}
        {!hasScreenshots && (
          <UnifiedDropzone
            isClassifying={isClassifying}
            onFilesSelected={handleDualUpload}
          />
        )}

        {/* Classified Screenshots Workspace */}
        {hasScreenshots && (
          <div className="space-y-6">
            {/* Toolbar */}
            <div className="bg-[#14161d] border border-[#232733] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-[#0d0e12] border border-[#232733] px-3 py-1.5 rounded-xl text-xs">
                  <span className="text-gray-400">Detected Pair:</span>
                  <span className="font-bold text-[#E5A93C] flex items-center gap-1.5">
                    {fromCurrency} <ArrowRight className="w-3.5 h-3.5" /> {toCurrency}
                  </span>
                  {detectionConfidence && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold uppercase">
                      {detectionConfidence} confidence
                    </span>
                  )}
                </div>

                <button
                  onClick={handleSwapCards}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1d212b] border border-[#2a3040] text-xs font-bold text-gray-200 hover:bg-[#262c3b] hover:border-[#E5A93C]/50 transition"
                  title="Invert which receipt is Received vs Sent"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-[#E5A93C]" />
                  <span>⇄ Swap Received & Sent</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1d212b] border border-[#2a3040] text-xs font-medium text-gray-400 hover:text-white cursor-pointer transition">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Different Screenshots</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length >= 2) {
                        handleDualUpload(e.target.files);
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            {/* Side-by-Side Sanitization & Preview Cards */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <DropzoneCard
                title="WE RECEIVED"
                badgeColor="bg-emerald-500"
                currencyLabel={fromCurrency}
                state={receivedCard}
                setState={setReceivedCard}
              />
              <DropzoneCard
                title="WE SENT"
                badgeColor="bg-blue-500"
                currencyLabel={toCurrency}
                state={sentCard}
                setState={setSentCard}
              />
            </section>

            {/* Currency Pair Fine-Tuning & Dynamic Caption */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-[#14161d] border border-[#232733] rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2 border-b border-[#232733] pb-3">
                  <Sliders className="w-4 h-4 text-[#E5A93C]" />
                  <h3 className="font-bold text-sm text-gray-200">Currency Override</h3>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1.5">🟢 From Currency</label>
                    <select
                      value={fromCurrency}
                      onChange={(e) => setFromCurrency(e.target.value)}
                      className="w-full bg-[#0d0e12] border border-[#232733] rounded-xl px-3 py-2 text-sm text-gray-200 focus:border-[#E5A93C] outline-none"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c.code} value={c.label}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-gray-400 block mb-1.5">🔵 To Currency</label>
                    <select
                      value={toCurrency}
                      onChange={(e) => setToCurrency(e.target.value)}
                      className="w-full bg-[#0d0e12] border border-[#232733] rounded-xl px-3 py-2 text-sm text-gray-200 focus:border-[#E5A93C] outline-none"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c.code} value={c.label}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="pt-2 text-xs text-gray-500 border-t border-[#232733] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#E5A93C]" />
                  <span>Auto-updated caption from receipt text</span>
                </div>
              </div>

              {/* Editable Caption Preview */}
              <div className="lg:col-span-2 bg-[#14161d] border border-[#232733] rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-[#232733] pb-3">
                  <div className="flex items-center gap-2">
                    <Edit2 className="w-4 h-4 text-[#E5A93C]" />
                    <h3 className="font-bold text-sm text-gray-200">Facebook Caption</h3>
                  </div>
                  {captionCustomized && (
                    <button
                      onClick={() => {
                        setCaptionCustomized(false);
                        setCaption(generateDefaultCaption(exchangeNo, fromCurrency, toCurrency));
                      }}
                      className="text-xs text-[#E5A93C] hover:underline"
                    >
                      Reset to Auto-format
                    </button>
                  )}
                </div>

                <textarea
                  value={caption}
                  onChange={(e) => {
                    setCaption(e.target.value);
                    setCaptionCustomized(true);
                  }}
                  rows={6}
                  className="w-full bg-[#0d0e12] border border-[#232733] rounded-xl p-3.5 text-xs text-gray-200 font-mono focus:border-[#E5A93C] outline-none resize-none leading-relaxed"
                />
              </div>
            </section>

            {/* Primary Action Bar */}
            <section className="bg-[#14161d] border border-[#232733] rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-gray-400">
                {isProcessing || isPreviewLoading ? (
                  <span className="flex items-center gap-2 text-[#E5A93C]">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    {statusMessage || "Processing..."}
                  </span>
                ) : (
                  <span>Ready. Review auto-redactions or click Preview Artwork before publishing.</span>
                )}
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  onClick={handleGeneratePreview}
                  disabled={isProcessing || isPreviewLoading}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#1d212b] border border-[#2a3040] text-gray-200 text-xs font-bold hover:bg-[#252b38] disabled:opacity-50 transition"
                >
                  {isPreviewLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-[#E5A93C]" />
                      <span>Compositing...</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4 text-[#E5A93C]" />
                      <span>Preview Artwork</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handlePublish}
                  disabled={isProcessing || isPreviewLoading}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#F3C363] to-[#E5A93C] text-[#0d0e12] text-xs font-extrabold hover:opacity-95 shadow-lg shadow-[#E5A93C]/20 disabled:opacity-50 transition active:scale-[0.98]"
                >
                  <Send className="w-4 h-4" />
                  <span>Publish to Facebook</span>
                </button>
              </div>
            </section>
          </div>
        )}

        {/* Interactive High-Fidelity Preview Modal */}
        <PreviewModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          previewUrl={compositePreview}
          exchangeNo={exchangeNo}
          onConfirmPublish={handlePublish}
          isPublishing={isProcessing}
          publishingStatus={statusMessage}
        />
      </main>
    </div>
  );
}

// -------------------------------------------------------------
// Unified 2-File Dropzone
// -------------------------------------------------------------
function UnifiedDropzone({
  isClassifying,
  onFilesSelected,
}: {
  isClassifying: boolean;
  onFilesSelected: (files: FileList | File[]) => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(e.dataTransfer.files);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      className={`w-full h-80 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center p-8 transition select-none ${
        isDragOver
          ? "border-[#E5A93C] bg-[#E5A93C]/5"
          : "border-[#232733] bg-[#14161d] hover:border-[#E5A93C]/40"
      }`}
    >
      {isClassifying ? (
        <div className="flex flex-col items-center gap-3 text-[#E5A93C]">
          <RefreshCw className="w-10 h-10 animate-spin" />
          <p className="font-bold text-sm text-gray-200">Autonomous Classifier Active</p>
          <p className="text-xs text-gray-400">
            Scanning receipt text, classifying Received vs Sent, and detecting currency pair...
          </p>
        </div>
      ) : (
        <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer">
          <input
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onFilesSelected(e.target.files);
              }
            }}
          />
          <div className="w-16 h-16 rounded-2xl bg-[#1c202a] flex items-center justify-center mb-4 text-[#E5A93C] shadow-lg shadow-black/40">
            <Layers className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-gray-100 mb-1">
            Drop 2 Payment Screenshots Here
          </h3>
          <p className="text-xs text-gray-400 mb-4 text-center max-w-md">
            Order does not matter. The system autonomously determines which receipt is{" "}
            <span className="text-emerald-400 font-semibold">We Received</span> and which is{" "}
            <span className="text-blue-400 font-semibold">We Sent</span>, then extracts the currency pair.
          </p>
          <span className="px-4 py-2 rounded-xl bg-[#232733] text-gray-200 text-xs font-semibold hover:bg-[#2b3140] transition">
            Browse 2 Files
          </span>
        </label>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Interactive Dropzone Card with Manual Blur Drawer
// -------------------------------------------------------------
function DropzoneCard({
  title,
  badgeColor,
  currencyLabel,
  state,
  setState,
}: {
  title: string;
  badgeColor: string;
  currencyLabel: string;
  state: ImageCardState;
  setState: React.Dispatch<React.SetStateAction<ImageCardState>>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!state.previewUrl || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setStartPos({ x, y });
    setIsDrawing(true);
    setCurrentBox({ x, y, w: 0, h: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !startPos || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const currentY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

    const left = Math.min(startPos.x, currentX);
    const top = Math.min(startPos.y, currentY);
    const width = Math.abs(currentX - startPos.x);
    const height = Math.abs(currentY - startPos.y);

    setCurrentBox({ x: left, y: top, w: width, h: height });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentBox || !containerRef.current) {
      setIsDrawing(false);
      setStartPos(null);
      setCurrentBox(null);
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    if (currentBox.w > 10 && currentBox.h > 10) {
      const newBox: ManualBox = {
        id: `box_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        xRatio: currentBox.x / rect.width,
        yRatio: currentBox.y / rect.height,
        wRatio: currentBox.w / rect.width,
        hRatio: currentBox.h / rect.height,
        label: "Manual Censor",
      };

      setState((prev) => ({
        ...prev,
        manualBoxes: [...prev.manualBoxes, newBox],
      }));
    }

    setIsDrawing(false);
    setStartPos(null);
    setCurrentBox(null);
  };

  const removeBox = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setState((prev) => ({
      ...prev,
      manualBoxes: prev.manualBoxes.filter((b) => b.id !== id),
    }));
  };

  return (
    <div className="bg-[#14161d] border border-[#232733] rounded-2xl p-5 flex flex-col space-y-4">
      {/* Dropzone Header */}
      <div className="flex items-center justify-between border-b border-[#232733] pb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${badgeColor}`} />
          <h3 className="font-extrabold text-sm tracking-wider text-gray-200">{title}</h3>
          <span className="text-xs px-2 py-0.5 rounded-md bg-[#232733] text-[#E5A93C] font-semibold">
            {currencyLabel}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={state.autoBlur}
              onChange={(e) => setState((prev) => ({ ...prev, autoBlur: e.target.checked }))}
              className="accent-[#E5A93C] rounded"
            />
            <Lock className="w-3 h-3 text-[#E5A93C]" />
            <span>Auto OCR Blur</span>
          </label>

          {state.manualBoxes.length > 0 && (
            <button
              onClick={() => setState((prev) => ({ ...prev, manualBoxes: [] }))}
              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear ({state.manualBoxes.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Interactive Canvas Area */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className="relative w-full h-[420px] rounded-xl border border-[#2a3040] bg-[#090a0d] cursor-crosshair overflow-hidden select-none"
      >
        {state.previewUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={state.previewUrl}
              alt="Receipt Preview"
              className="w-full h-full object-contain pointer-events-none"
            />

            {/* Render Manual Blur Overlays */}
            {state.manualBoxes.map((b) => (
              <div
                key={b.id}
                style={{
                  left: `${b.xRatio * 100}%`,
                  top: `${b.yRatio * 100}%`,
                  width: `${b.wRatio * 100}%`,
                  height: `${b.hRatio * 100}%`,
                }}
                className="absolute border border-[#E5A93C] bg-black/70 backdrop-blur-sm rounded flex items-center justify-between p-1 group z-10"
              >
                <span className="text-[9px] text-[#E5A93C] font-mono font-semibold truncate">
                  [REDACTED]
                </span>
                <button
                  onClick={(e) => removeBox(b.id, e)}
                  className="text-red-400 hover:text-red-200 bg-[#0d0e12] rounded p-0.5"
                  title="Remove redaction"
                >
                  ✕
                </button>
              </div>
            ))}

            {/* Active Drawing Box */}
            {currentBox && (
              <div
                style={{
                  left: `${currentBox.x}px`,
                  top: `${currentBox.y}px`,
                  width: `${currentBox.w}px`,
                  height: `${currentBox.h}px`,
                }}
                className="absolute border-2 border-dashed border-[#E5A93C] bg-[#E5A93C]/20 pointer-events-none rounded"
              />
            )}

            {/* Tooltip */}
            <div className="absolute bottom-2 left-2 right-2 bg-[#0d0e12]/80 backdrop-blur text-[11px] text-gray-400 px-2.5 py-1 rounded-md border border-[#232733] pointer-events-none flex items-center justify-between">
              <span>Drag to draw redaction box</span>
              {state.detectedCount > 0 && (
                <span className="text-emerald-400 font-semibold">{state.detectedCount} auto-blurs</span>
              )}
            </div>
          </>
        )}
      </div>

      {state.file && (
        <div className="text-xs text-gray-500 truncate">
          File: <span className="text-gray-300 font-mono">{state.file.name}</span>
        </div>
      )}
    </div>
  );
}
