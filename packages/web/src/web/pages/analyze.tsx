import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "../lib/api.js";
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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submitText = useMutation({
    mutationFn: async (contractText: string) => {
      const token = localStorage.getItem("bearer_token") ?? "";
      const res = await fetch("/api/analyses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ contractText, filename: "Pasted Contract", reviewPerspective: perspective }),
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

  const submitFiles = useMutation({
  mutationFn: async (files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append("file", file, file.name); // ✅ Changed to "file"
    });
    formData.append("reviewPerspective", perspective);
    
    const token = localStorage.getItem("bearer_token") ?? "";
    
    const res = await fetch("/api/analyses/upload", {
      method: "POST",
      body: formData,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    
    if (!res.ok) {
      let errorMessage = "Upload failed";
      const raw = await res.text();
      try {
        const err = JSON.parse(raw);
        errorMessage = err.error || err.message || errorMessage;
      } catch {
        if (raw) errorMessage = raw;
      }
      throw new Error(errorMessage);
    }
    return res.json();
  },
  onSuccess: (data: any) => {
    console.log("Upload response:", data);
    if (data && data.id) {
      navigate(`/reports/${data.id}`);
    } else {
      setError("Files uploaded but no analysis ID returned");
    }
  },
  onError: (err: any) => {
    console.error("Upload error:", err);
    setError(err.message ?? "Upload failed");
  },
});

  const isPending = submitText.isPending || submitFiles.isPending;

  function handleFiles(files: FileList | null) {
  if (!files) {
    setError("No files selected");
    return;
  }
  
  const newFiles: File[] = [];
  const allowedTypes = ['application/pdf', 'text/plain'];
  const allowedExtensions = ['.pdf', '.txt'];
  
  for (const file of Array.from(files)) {
    // Check by MIME type
    const isAllowedType = allowedTypes.some(type => file.type.includes(type));
    // Check by extension
    const isAllowedExtension = allowedExtensions.some(ext => 
      file.name.toLowerCase().endsWith(ext)
    );
    
    if (!isAllowedType && !isAllowedExtension) {
      setError(`File "${file.name}" is not supported. Only .pdf or .txt allowed.`);
      return;
    }
    newFiles.push(file);
  }
  
  setError(null);
  setSelectedFiles(prev => [...prev, ...newFiles]);
  console.log("Selected files:", newFiles); // Debug log
}

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
        setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  function removeFile(index: number) {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
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
    if (selectedFiles.length === 0) {
      setError("Please select at least one file.");
      return;
    }
    console.log("Submitting files:", selectedFiles); // Debug log
    console.log("Perspective:", perspective); // Debug log
    submitFiles.mutate(selectedFiles);
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
          Deal Room Analysis
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>
          Upload one or more contracts for comprehensive multi-agent risk assessment
        </p>
      </div>

      {/* Mode toggle + Perspective toggle row */}
      <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "24px", flexWrap: "wrap" }}>
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
            { id: "upload" as Mode, label: "Upload Files", icon: Upload },
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
            border: `2px dashed ${dragOver ? "var(--accent-gold)" : selectedFiles.length > 0 ? "var(--risk-low)" : "var(--border)"}`,
            borderRadius: "10px",
            background: dragOver
              ? "var(--accent-gold-bg)"
              : selectedFiles.length > 0
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
            multiple
            aria-label="Upload contract files"
            style={{ display: "none" }}
            onChange={(e) => handleFiles(e.target.files)}
          />

          {selectedFiles.length > 0 ? (
            <div style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: "8px", maxWidth: "400px", margin: "0 auto" }}>
              {selectedFiles.map((file, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    background: "var(--bg-tertiary)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontFamily: "Poppins, sans-serif",
                    color: "var(--text-primary)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
                    <FileText size={14} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(i);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      padding: "2px",
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => {
                  setSelectedFiles([]);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                style={{
                  marginTop: "12px",
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: "12px",
                  textDecoration: "underline",
                  textAlign: "center",
                  width: "100%",
                }}
              >
                Clear all files
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
                Drop files here or click to browse
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
          { step: "2", label: "Critic", desc: "Adversarial audit", model: "Gemini 2.5 Flash" },
          { step: "3", label: "Adjudicator", desc: "Final verdict + score", model: "Gemma 4 31B" },
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
            Running Deal Room Analysis...
          </>
        ) : (
          <>
            Run Multi-Agent Analysis
            <ChevronRight size={16} />
          </>
        )}
      </button>

      <div style={{ textAlign: "center", marginTop: "24px", fontSize: "11px", color: "var(--text-muted)", fontFamily: "Poppins, sans-serif" }}>
        System Version: 1.0.2-MultiDoc
      </div>
    </div>
  );
}