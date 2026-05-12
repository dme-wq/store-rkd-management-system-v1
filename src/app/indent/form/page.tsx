"use client";

import React, { useState, useEffect, useCallback } from "react";
import Select from "react-select";
import { CheckSquare, RefreshCw } from "lucide-react";
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
    setPageLoading(true);
    try {
      // 1. Fetch Options only
      const resOptions = await fetch("/api/indent");
      const jsonOptions = await resOptions.json();
      if (jsonOptions.success) {
        setOptions(jsonOptions.options);
      }
    } catch (err: any) {
      showToast("error", "Failed to load options.");
    } finally {
      setPageLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // ── react-select AppSheet styles ──
  const mkSelectStyles = () => ({
    control: (b: any, s: any) => ({
      ...b,
      minHeight: "42px",
      border: s.isFocused ? "2px solid var(--appsheet-green)" : "1px solid var(--table-border)",
      borderRadius: "4px",
      boxShadow: "none",
      "&:hover": { borderColor: "var(--appsheet-green)" },
      fontFamily: "'Outfit', sans-serif",
      fontSize: "0.9rem"
    }),
    option: (b: any, s: any) => ({
      ...b,
      backgroundColor: s.isSelected ? "var(--appsheet-green)" : s.isFocused ? "#e8f5e9" : "white",
      color: s.isSelected ? "white" : "#333",
      fontFamily: "'Outfit', sans-serif",
      fontSize: "0.9rem"
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
        setForm({ personFillingName: "", department: "", machineName: "", machineId: "", itemName: "", requireQty: "" });
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
        <p style={{ marginTop: 16, color: "var(--appsheet-green)", fontWeight: 500 }}>Loading Form...</p>
      </div>
    );
  }

  return (
    <div className={styles.page} style={{ background: '#f8f9fa', alignItems: 'center', padding: '20px' }}>
      <ToastContainer toasts={toasts} />

      <div style={{
        width: '100%',
        maxWidth: '500px',
        background: '#fff',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Form Header matching Drawer Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--table-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--appsheet-green)',
          color: 'white'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontWeight: 800, fontSize: '1.2rem', letterSpacing: '1px' }}>RKD</div>
            <h3 style={{ fontSize: '1.1rem', margin: 0, fontWeight: 500 }}>New Indent Form</h3>
          </div>
          <button className={styles.btnSave} style={{ background: 'white', color: 'var(--appsheet-green)', border: 'none' }} onClick={handleSave} disabled={submitting}>
            {submitting ? "Saving..." : "Submit"}
          </button>
        </div>

        {/* Form Body matching Drawer Body */}
        <div style={{ padding: '24px 20px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div className={styles.formField}>
            <label className={styles.label}>Person Filing Name <span className={styles.req}>*</span></label>
            <Select
              options={toOpts(options.persons)}
              styles={selStyle} isClearable
              placeholder="Add or search"
              value={form.personFillingName ? { value: form.personFillingName, label: form.personFillingName } : null}
              onChange={(o: any) => setF("personFillingName", o?.value || "")}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.label}>Item Name <span className={styles.req}>*</span></label>
            <Select
              options={toOpts(options.items)}
              styles={selStyle} isClearable isSearchable
              placeholder="Add or search"
              value={form.itemName ? { value: form.itemName, label: form.itemName } : null}
              onChange={(o: any) => setF("itemName", o?.value || "")}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.label}>Require Qty <span className={styles.req}>*</span></label>
            <div className={styles.qtyWrapper}>
              <input 
                type="number" 
                className={styles.qtyInput} 
                value={form.requireQty} 
                onChange={e => setF("requireQty", e.target.value)} 
                placeholder="0.00" 
              />
              <button className={styles.qtyBtn} onClick={() => adjQty(-1)}>−</button>
              <button className={styles.qtyBtn} onClick={() => adjQty(1)}>+</button>
            </div>
          </div>

          <div className={styles.formField}>
            <label className={styles.label}>Department <span className={styles.req}>*</span></label>
            <Select
              options={toOpts(options.departments)}
              styles={selStyle} isClearable
              placeholder="Add or search"
              value={form.department ? { value: form.department, label: form.department } : null}
              onChange={(o: any) => setF("department", o?.value || "")}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.label}>Machine Name</label>
            <Select
              options={toOpts(options.machineNames)}
              styles={selStyle} isClearable
              placeholder="Add or search"
              value={form.machineName ? { value: form.machineName, label: form.machineName } : null}
              onChange={(o: any) => setF("machineName", o?.value || "")}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.label}>Machine ID</label>
            <Select
              options={toOpts(options.machineIDs)}
              styles={selStyle} isClearable
              placeholder="Add or search"
              value={form.machineId ? { value: form.machineId, label: form.machineId } : null}
              onChange={(o: any) => setF("machineId", o?.value || "")}
            />
          </div>

        </div>
      </div>
    </div>
  );
}
