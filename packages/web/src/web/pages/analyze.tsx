import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "../lib/api";
import {
  Upload,
  FileText,
  ClipboardPaste,
  Loader,
  AlertCircle,
  CheckCircle,
  ChevronRight,
  X,
} from "lucide-react";

type Mode = "upload" | "paste";
type Perspective = "BUYER" | "SELLER";

export default function AnalyzePage() {
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<Mode>("upload");
  const [perspective, setPerspective] = useState<Perspective>("BUYER");
  const [pastedText, setPastedText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submitText = useMutation({
    mutationFn: async (contractText: string) => {
      const res = await api.analyses.$post({
        json: { contractText, filename: "Pasted Contract", reviewPerspective: perspective },
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      navigate(`/reports/${data.id}`);
    },
    onError: (err: any) => {
      setError(err.message ?? "Failed to submit");
    },
  });

  const submitFile = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const token = localStorage.getItem("bearer_token") ?? "";
      const res = await fetch("/api/analyses/upload", {
        method: "POST",
        body: formData,
        headers: {
          "X-Review-Perspective": perspective,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error((err as any).error ?? "Upload failed");
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      navigate(`/reports/${data.id}`);
    },
    onError: (err: any) => {
      setError(err.message ?? "Upload failed");
    },
  });

  const isPending = submitText.isPending || submitFile.isPending;

  function handleFile(file: File) {
    if (
      !file.type.includes("pdf") &&
      !file.type.includes("text") &&
      !file.name.endsWith(".txt") &&
      !file.name.endsWith(".pdf")
    ) {
      setError("Only .pdf or .txt files are supported");
      return;
    }
    setError(null);
    setSelectedFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleSubmit() {
    setError(null);
    if (mode === "paste") {
      if (pastedText.trim().length < 100) {
        setError("Please paste a contract with at least 100 characters.");
        return;
      }
      submitText.mutate(pastedText.trim());
    } else {
      if (!selectedFile) {
        setError("Please select a file.");
        return;
      }
      submitFile.mutate(selectedFile);
    }
  }

  return (
    <div style={{ padding: "32px", maxWidth: "800px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <h1
          style={{
            fontFamily: "Poppins, sans-serif",
            fontSize: "1.6rem",
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: "6px",
          }}
        >
          New Contract Analysis
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>
          Submit an M&A contract for multi-agent AI risk assessment
        </p>
      </div>

      {/* Mode toggle + Perspective toggle row */}
      <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "24px", flexWrap: "wrap" }}>
        {/* Mode toggle */}
        <div
          style={{
            display: "flex",
            gap: "0",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "4px",
          }}
        >
          {[
            { id: "upload" as Mode, label: "Upload File", icon: Upload },
            { id: "paste" as Mode, label: "Paste Text", icon: ClipboardPaste },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "7px",
                padding: "8px 16px",
                borderRadius: "5px",
                border: "none",
                background: mode === id ? "var(--bg-tertiary)" : "transparent",
                color: mode === id ? "var(--text-primary)" : "var(--text-muted)",
                cursor: "pointer",
                fontFamily: "Poppins, sans-serif",
                fontWeight: mode === id ? 600 : 400,
                fontSize: "13px",
                transition: "all 0.15s",
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Perspective toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)", fontFamily: "Poppins, sans-serif" }}>
            Reviewing as:
          </span>
          <div
            style={{
              display: "flex",
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              padding: "4px",
            }}
          >
            {(["BUYER", "SELLER"] as Perspective[]).map((p) => (
              <button
                key={p}
                onClick={() => setPerspective(p)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "5px",
                  border: "none",
                  background: perspective === p
                    ? p === "BUYER" ? "rgba(59,130,246,0.15)" : "rgba(212,168,67,0.15)"
                    : "transparent",
                  color: perspective === p
                    ? p === "BUYER" ? "#60a5fa" : "var(--accent-gold)"
                    : "var(--text-muted)",
                  cursor: "pointer",
                  fontFamily: "Poppins, sans-serif",
                  fontWeight: perspective === p ? 700 : 400,
                  fontSize: "12px",
                  transition: "all 0.15s",
                  borderRight: p === "BUYER" ? "1px solid var(--border)" : "none",
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Upload mode */}
      {mode === "upload" && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${dragOver ? "var(--accent-gold)" : selectedFile ? "var(--risk-low)" : "var(--border)"}`,
            borderRadius: "10px",
            background: dragOver
              ? "var(--accent-gold-bg)"
              : selectedFile
              ? "rgba(34,197,94,0.05)"
              : "var(--bg-secondary)",
            padding: "48px 32px",
            textAlign: "center",
            transition: "all 0.2s",
            marginBottom: "20px",
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt"
            aria-label="Upload contract file"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />

          {selectedFile ? (
            <div>
              <CheckCircle
                size={36}
                color="var(--risk-low)"
                style={{ margin: "0 auto 12px" }}
              />
              <div
                style={{
                  fontFamily: "Poppins, sans-serif",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: "4px",
                }}
              >
                {selectedFile.name}
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "12px", marginBottom: "16px" }}>
                {(selectedFile.size / 1024).toFixed(1)} KB
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                  borderRadius: "5px",
                  padding: "5px 12px",
                  cursor: "pointer",
                  fontSize: "12px",
                  margin: "0 auto",
                }}
              >
                <X size={12} /> Remove
              </button>
            </div>
          ) : (
            <div>
              <FileText
                size={36}
                color="var(--text-muted)"
                style={{ margin: "0 auto 12px" }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  fontFamily: "Poppins, sans-serif",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  marginBottom: "4px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "inherit",
                  padding: 0,
                }}
              >
                Drop file here or click to browse
              </button>
              <div style={{ color: "var(--text-muted)", fontSize: "12px" }}>
                Supports .pdf and .txt files
              </div>
            </div>
          )}
        </div>
      )}

      {/* Paste mode */}
      {mode === "paste" && (
        <div style={{ marginBottom: "20px" }}>
          <textarea
            aria-label="Contract text"
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder="Paste the full M&A contract text here..."
            style={{
              width: "100%",
              height: "320px",
              background: "var(--bg-secondary)",
              border: `1px solid ${pastedText.length > 0 ? "var(--border-light)" : "var(--border)"}`,
              borderRadius: "8px",
              color: "var(--text-primary)",
              fontFamily: "Inter, monospace",
              fontSize: "12px",
              lineHeight: 1.6,
              padding: "16px",
              resize: "vertical",
              outline: "none",
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "rgba(212,168,67,0.4)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor =
                pastedText.length > 0 ? "var(--border-light)" : "var(--border)";
            }}
          />
          <div style={{ textAlign: "right", fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>
            {pastedText.length.toLocaleString()} characters
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: "6px",
            padding: "10px 14px",
            color: "var(--risk-critical)",
            fontSize: "13px",
            marginBottom: "16px",
          }}
        >
          <AlertCircle size={14} style={{ flexShrink: 0 }} />
          {error}
        </div>
      )}

      {/* Pipeline info */}
      <div
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "16px 20px",
          marginBottom: "20px",
          display: "flex",
          gap: "20px",
          flexWrap: "wrap",
        }}
      >
        {[
          { step: "1", label: "Analyst", desc: "First-pass review", model: "Gemini 2.5 Flash" },
          { step: "2", label: "Critic", desc: "Adversarial audit", model: "Gemini 2.5 Flash Lite" },
          { step: "3", label: "Adjudicator", desc: "Final verdict + score", model: "Gemini 2.0 Flash" },
        ].map(({ step, label, desc, model }) => (
          <div key={step} style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "180px" }}>
            <div
              style={{
                width: "28px",
                height: "28px",
                background: "var(--accent-gold-bg)",
                border: "1px solid rgba(212,168,67,0.3)",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "Poppins, sans-serif",
                fontWeight: 700,
                fontSize: "12px",
                color: "var(--accent-gold)",
                flexShrink: 0,
              }}
            >
              {step}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>{label}</div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{desc} · {model}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={isPending}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: isPending ? "var(--accent-gold-dim)" : "var(--accent-gold)",
          color: "#0a0d14",
          border: "none",
          borderRadius: "7px",
          padding: "12px 28px",
          fontFamily: "Poppins, sans-serif",
          fontWeight: 700,
          fontSize: "14px",
          cursor: isPending ? "not-allowed" : "pointer",
          width: "100%",
          justifyContent: "center",
          transition: "background 0.15s",
        }}
      >
        {isPending ? (
          <>
            <Loader size={16} className="spinner" />
            Starting Analysis…
          </>
        ) : (
          <>
            Run Multi-Agent Analysis
            <ChevronRight size={16} />
          </>
        )}
      </button>
    </div>
  );
}
