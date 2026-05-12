"use client";

import React, { useState, useEffect, useCallback } from "react";
import Select from "react-select";
import { CheckSquare, RefreshCw, Box, ClipboardList, Activity } from "lucide-react";
import styles from "../indent.module.css";

// ── Toast System ──
type ToastType = "success" | "error" | "warning" | "info";
interface Toast { id: number; type: ToastType; message: string; }

function ToastContainer({ toasts }: { toasts: Toast[] }) {
  return (
    <div className={styles.toastContainer}>
      {toasts.map(t => (
        <div key={t.id} className={`${styles.toast} ${styles[`toast_${t.type}`]}`}>
          {t.type === "success" ? "✅" : t.type === "error" ? "❌" : t.type === "warning" ? "⚠️" : "ℹ️"}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

const toOpts = (arr: string[]) => arr.map(a => ({ value: a, label: a }));

export default function StandaloneIndentForm() {
  const [pageLoading, setPageLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Data
  const [options, setOptions] = useState<any>({
    persons: [], departments: [], machineNames: [], machineIDs: [],
    items: [], itemMap: {}
  });

  // UI State
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Form State
  const [form, setForm] = useState({
    personFillingName: "", department: "",
    machineName: "", machineId: "",
    itemName: "", requireQty: ""
  });

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = Date.now();
    setToasts(p => [...p, { id, type, message }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);

  const setF = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const itemData = form.itemName && options.itemMap[form.itemName]
    ? options.itemMap[form.itemName]
    : { units: "", rate: "", vendor: "", stock: "" };

  const loadData = async () => {
    // Check cache first for instant load
    const cached = localStorage.getItem("rkd_form_options");
    if (cached) {
      try {
        setOptions(JSON.parse(cached));
        setPageLoading(false); // Stop loading instantly!
      } catch (e) {
        console.error("Cache parsing error", e);
      }
    } else {
      setPageLoading(true); // Only show loading spinner if no cache exists
    }

    try {
      const resOptions = await fetch("/api/indent");
      const jsonOptions = await resOptions.json();
      if (jsonOptions.success) {
        setOptions(jsonOptions.options);
        localStorage.setItem("rkd_form_options", JSON.stringify(jsonOptions.options));
      }
    } catch (err: any) {
      if (!cached) showToast("error", "Failed to load options. Please check your internet connection.");
    } finally {
      setPageLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // ── react-select AppSheet styles for MOBILE (bigger fields) ──
  const mkSelectStyles = () => ({
    control: (b: any, s: any) => ({
      ...b,
      minHeight: "52px", // Mobile friendly bigger height
      border: s.isFocused ? "2px solid var(--appsheet-green)" : "1px solid #d1d5db",
      borderRadius: "8px",
      boxShadow: "none",
      "&:hover": { borderColor: "var(--appsheet-green)" },
      fontFamily: "'Outfit', sans-serif",
      fontSize: "1rem", // Modern readable font size
      padding: "2px"
    }),
    option: (b: any, s: any) => ({
      ...b,
      backgroundColor: s.isSelected ? "var(--appsheet-green)" : s.isFocused ? "#e8f5e9" : "white",
      color: s.isSelected ? "white" : "#333",
      fontFamily: "'Outfit', sans-serif",
      fontSize: "1rem",
      padding: "12px"
    })
  });
  const selStyle = mkSelectStyles();

  const handleSave = async () => {
    if (!form.personFillingName || !form.department || !form.itemName || !form.requireQty) {
      showToast("warning", "Please fill all required (*) fields.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        personFillingName: form.personFillingName, department: form.department,
        machineName: form.machineName, machineId: form.machineId,
        itemName: form.itemName, requireQty: form.requireQty,
        units: itemData.units, vendorName: itemData.vendor,
        price: itemData.rate, stockInStore: itemData.stock
      };
      const res  = await fetch("/api/indent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", `Indent ${data.rkdNumber} Saved!`);
        setForm({ ...form, machineName: "", machineId: "", itemName: "", requireQty: "" }); // Keep person and dept filled for faster multi-entry
      } else {
        showToast("error", data.error || "Failed to save.");
      }
    } catch (e: any) {
      showToast("error", "Network Error.");
    } finally {
      setSubmitting(false);
    }
  };

  const adjQty = (delta: number) => {
    const current = parseFloat(form.requireQty || "0");
    const next = Math.max(0, current + delta);
    setF("requireQty", next > 0 ? next.toString() : "");
  };

  if (pageLoading && Object.keys(options.itemMap).length === 0) {
    return (
      <div className={styles.page} style={{ alignItems: 'center', justifyContent: 'center' }}>
        <RefreshCw className={styles.syncSpinner} size={32} color="var(--appsheet-green)" />
        <p style={{ marginTop: 16, color: "var(--appsheet-green)", fontWeight: 500 }}>Loading Indent Form...</p>
      </div>
    );
  }

  return (
    <div className={styles.page} style={{ 
      backgroundColor: '#f0f4f8',
      backgroundImage: `
        radial-gradient(at 0% 0%, hsla(140, 48%, 90%, 1) 0px, transparent 50%),
        radial-gradient(at 100% 0%, hsla(270, 48%, 90%, 1) 0px, transparent 50%),
        radial-gradient(at 100% 100%, hsla(140, 48%, 90%, 1) 0px, transparent 50%),
        radial-gradient(at 0% 100%, hsla(270, 48%, 90%, 1) 0px, transparent 50%)
      `,
      alignItems: 'center', 
      padding: '16px', 
      minHeight: '100vh', 
      overflowY: 'auto' 
    }}>
      <ToastContainer toasts={toasts} />
      
      {/* CSS Animation for Pulse Submit Button */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulsePurpleGlow {
          0% { box-shadow: 0 0 0 0 rgba(168, 85, 247, 0.6); }
          70% { box-shadow: 0 0 0 12px rgba(168, 85, 247, 0); }
          100% { box-shadow: 0 0 0 0 rgba(168, 85, 247, 0); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />

      <div style={{
        width: '100%',
        maxWidth: '500px',
        background: '#fff',
        borderRadius: '16px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
        display: 'flex',
        flexDirection: 'column',
        marginBottom: '24px',
        animation: 'fadeUp 0.4s ease-out'
      }}>
        {/* Form Header */}
        <div style={{
          padding: '24px 20px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          background: 'linear-gradient(135deg, var(--appsheet-green), #14532d)',
          color: 'white',
          borderTopLeftRadius: '16px',
          borderTopRightRadius: '16px',
          textAlign: 'center'
        }}>
          <div style={{ background: 'rgba(255,255,255,0.2)', padding: '8px 16px', borderRadius: '20px', marginBottom: '12px', fontWeight: 800, letterSpacing: '2px', fontSize: '0.9rem' }}>RKD GROUP</div>
          <h2 style={{ fontSize: '1.4rem', margin: 0, fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>Material Request Form</h2>
          <p style={{ margin: '6px 0 0 0', opacity: 0.9, fontSize: '0.9rem' }}>Fill details to raise a new indent</p>
        </div>

        {/* Form Body */}
        <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
          
          <div className={styles.formField}>
            <label className={styles.label} style={{ fontSize: '0.95rem', fontWeight: 500, color: '#374151' }}>Store RKD Number</label>
            <input 
              type="text" 
              className={styles.qtyInput} 
              disabled
              value={options.nextRkdNumber ? `${options.nextRkdNumber} (Estimated)` : "Loading RKD..."} 
              style={{ 
                minHeight: '52px', 
                fontSize: '0.95rem', 
                background: '#f8fafc', 
                color: '#94a3b8', 
                border: '1px dashed #cbd5e1', 
                borderRadius: '8px',
                padding: '0 16px',
                fontWeight: 600,
                textAlign: 'center',
                width: '100%'
              }} 
            />
          </div>
          
          <div className={styles.formField}>
            <label className={styles.label} style={{ fontSize: '0.95rem', fontWeight: 500, color: '#374151' }}>Person Filing Name <span className={styles.req}>*</span></label>
            <Select
              options={toOpts(options.persons)}
              styles={selStyle} isClearable
              placeholder="Select your name"
              value={form.personFillingName ? { value: form.personFillingName, label: form.personFillingName } : null}
              onChange={(o: any) => setF("personFillingName", o?.value || "")}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.label} style={{ fontSize: '0.95rem', fontWeight: 500, color: '#374151' }}>Item Name <span className={styles.req}>*</span></label>
            <Select
              options={toOpts(options.items)}
              styles={selStyle} isClearable isSearchable
              placeholder="Search or select item"
              value={form.itemName ? { value: form.itemName, label: form.itemName } : null}
              onChange={(o: any) => setF("itemName", o?.value || "")}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.label} style={{ fontSize: '0.95rem', fontWeight: 500, color: '#374151' }}>Require Quantity <span className={styles.req}>*</span></label>
            <div className={styles.qtyWrapper} style={{ height: '52px', border: '1px solid #d1d5db', borderRadius: '8px', overflow: 'hidden' }}>
              <input 
                type="number" 
                className={styles.qtyInput} 
                style={{ fontSize: '1.1rem', height: '100%', padding: '0 16px' }}
                value={form.requireQty} 
                onChange={e => setF("requireQty", e.target.value)} 
                placeholder="0" 
              />
              <button className={styles.qtyBtn} style={{ width: '48px', fontSize: '1.4rem', background: '#f8fafc', color: '#333' }} onClick={() => adjQty(-1)}>−</button>
              <button className={styles.qtyBtn} style={{ width: '48px', fontSize: '1.4rem', background: '#f8fafc', color: '#333', borderLeft: '1px solid #e2e8f0' }} onClick={() => adjQty(1)}>+</button>
            </div>
          </div>

          <div className={styles.formField}>
            <label className={styles.label} style={{ fontSize: '0.95rem', fontWeight: 500, color: '#374151' }}>Department <span className={styles.req}>*</span></label>
            <Select
              options={toOpts(options.departments)}
              styles={selStyle} isClearable
              placeholder="Select department"
              value={form.department ? { value: form.department, label: form.department } : null}
              onChange={(o: any) => setF("department", o?.value || "")}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.label} style={{ fontSize: '0.95rem', fontWeight: 500, color: '#374151' }}>Machine Name</label>
            <Select
              options={toOpts(options.machineNames)}
              styles={selStyle} isClearable
              placeholder="Optional machine name"
              value={form.machineName ? { value: form.machineName, label: form.machineName } : null}
              onChange={(o: any) => setF("machineName", o?.value || "")}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.label} style={{ fontSize: '0.95rem', fontWeight: 500, color: '#374151' }}>Machine ID</label>
            <Select
              options={toOpts(options.machineIDs)}
              styles={selStyle} isClearable
              placeholder="Optional machine ID"
              value={form.machineId ? { value: form.machineId, label: form.machineId } : null}
              onChange={(o: any) => setF("machineId", o?.value || "")}
            />
          </div>

          {/* New Animated Purple Submit Button at the Bottom */}
          <button 
            onClick={handleSave} 
            disabled={submitting}
            style={{
              background: 'linear-gradient(135deg, #a855f7, #7e22ce)',
              color: 'white',
              border: 'none',
              padding: '18px',
              borderRadius: '12px',
              fontSize: '1.15rem',
              fontWeight: 600,
              letterSpacing: '0.5px',
              marginTop: '12px',
              animation: submitting ? 'none' : 'pulsePurpleGlow 2s infinite',
              cursor: submitting ? 'not-allowed' : 'pointer',
              width: '100%',
              fontFamily: "'Outfit', sans-serif",
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 15px rgba(126, 34, 206, 0.4)'
            }}
          >
            {submitting ? (
              <><RefreshCw size={20} className={styles.spin} /> Processing...</>
            ) : (
              <><CheckSquare size={20} /> Submit Indent</>
            )}
          </button>
        </div>
      </div>

    </div>
  );
}
