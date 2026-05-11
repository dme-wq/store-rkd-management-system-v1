"use client";
import React, { useState, useEffect, useCallback } from "react";
import Select from "react-select";
import styles from "./indent.module.css";

// ── Toast System ──────────────────────────────────────────────────────────────
type ToastType = "success" | "error" | "warning" | "info";
interface Toast { id: number; type: ToastType; title: string; message: string; }

function ToastContainer({ toasts, remove }: { toasts: Toast[]; remove: (id: number) => void }) {
  return (
    <div className={styles.toastContainer}>
      {toasts.map(t => (
        <div key={t.id} className={`${styles.toast} ${styles[`toast_${t.type}`]}`}>
          <span className={styles.toastIcon}>
            {t.type === "success" ? "✅" : t.type === "error" ? "❌" : t.type === "warning" ? "⚠️" : "ℹ️"}
          </span>
          <div className={styles.toastBody}>
            <div className={styles.toastTitle}>{t.title}</div>
            {t.message && <div className={styles.toastMsg}>{t.message}</div>}
          </div>
          <button className={styles.toastClose} onClick={() => remove(t.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const add = useCallback((type: ToastType, title: string, message = "") => {
    const id = Date.now();
    setToasts(p => [...p, { id, type, title, message }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 5000);
  }, []);
  const remove = useCallback((id: number) => setToasts(p => p.filter(t => t.id !== id)), []);
  return {
    toasts, remove,
    toast: {
      success: (t: string, m?: string) => add("success", t, m),
      error:   (t: string, m?: string) => add("error", t, m),
      warning: (t: string, m?: string) => add("warning", t, m),
      info:    (t: string, m?: string) => add("info", t, m),
    }
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const toOpts = (arr: string[]) => arr.map(a => ({ value: a, label: a }));

export default function IndentForm() {
  const [pageLoading, setPageLoading] = useState(true);
  const [submitting,  setSubmitting]  = useState(false);
  const [successRkd,  setSuccessRkd]  = useState<string | null>(null);
  const { toasts, remove, toast } = useToast();

  const [options, setOptions] = useState<any>({
    persons: [], departments: [], machineNames: [], machineIDs: [],
    items: [], itemMap: {}, freq: {}
  });

  const [form, setForm] = useState({
    personFillingName: "", department: "",
    machineName: "", machineId: "",
    itemName: "", requireQty: ""
  });

  const itemData = form.itemName && options.itemMap[form.itemName]
    ? options.itemMap[form.itemName]
    : { units: "", rate: "", vendor: "", stock: "" };

  const set = (field: string, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  useEffect(() => {
    const cached = localStorage.getItem("indentCache_v4");
    if (cached) {
      try { setOptions(JSON.parse(cached)); setPageLoading(false); } catch {}
    }
    fetch("/api/indent")
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setOptions(d.options);
          localStorage.setItem("indentCache_v4", JSON.stringify(d.options));
        }
        setPageLoading(false);
      })
      .catch(() => {
        toast.error("Network Error", "Could not load form options.");
        setPageLoading(false);
      });
  }, []);

  // ── react-select shared styles ──
  const mkSelectStyles = (searchable = false) => ({
    control: (b: any, s: any) => ({
      ...b,
      minHeight: "52px",
      border: s.isFocused ? "2px solid #1A5CFF" : "1.5px solid #E2E8F0",
      borderRadius: "14px",
      backgroundColor: s.isFocused ? "#fff" : "#F7F9FC",
      boxShadow: s.isFocused ? "0 0 0 4px rgba(26,92,255,0.1)" : "none",
      paddingLeft: "4px",
      fontSize: "0.95rem",
      fontWeight: "600",
      cursor: searchable ? "text" : "pointer",
      transition: "all 0.2s ease",
      fontFamily: "'Outfit', sans-serif",
    }),
    menu: (b: any) => ({
      ...b, borderRadius: "14px", border: "1px solid #E2E8F0",
      boxShadow: "0 12px 40px rgba(0,0,0,0.12)", zIndex: 500,
      marginTop: "6px", padding: "6px", overflow: "hidden",
    }),
    menuList: (b: any) => ({ ...b, maxHeight: "220px" }),
    option: (b: any, s: any) => ({
      ...b,
      padding: "12px 14px", borderRadius: "10px", margin: "2px 0",
      fontWeight: "600", fontSize: "0.9rem", fontFamily: "'Outfit', sans-serif",
      backgroundColor: s.isSelected ? "#1A5CFF" : s.isFocused ? "#EEF2FF" : "white",
      color: s.isSelected ? "white" : "#1E293B",
      cursor: "pointer",
    }),
    placeholder: (b: any) => ({ ...b, color: "#94A3B8", fontWeight: "400" }),
    singleValue: (b: any) => ({ ...b, color: "#1E293B", fontWeight: "700" }),
    indicatorSeparator: () => ({ display: "none" }),
    dropdownIndicator: (b: any) => ({ ...b, color: "#1A5CFF", paddingRight: "12px" }),
    clearIndicator: (b: any) => ({ ...b, color: "#EF4444", cursor: "pointer" }),
    noOptionsMessage: (b: any) => ({ ...b, color: "#94A3B8", fontStyle: "italic" }),
  });

  const dropStyle  = mkSelectStyles(false); // non-searchable
  const searchStyle = mkSelectStyles(true);  // searchable (Item Name)

  // ── Submit ──
  const handleSubmit = async () => {
    if (!form.personFillingName) { toast.warning("Required", "Please select Person Name."); return; }
    if (!form.department)        { toast.warning("Required", "Please select Department."); return; }
    if (!form.itemName)          { toast.warning("Required", "Please select Item Name."); return; }
    if (!form.requireQty || parseFloat(form.requireQty) <= 0) {
      toast.warning("Required", "Enter a valid Require Quantity."); return;
    }

    const stock = parseFloat(itemData.stock || "0");
    const qty   = parseFloat(form.requireQty);
    if (stock <= 0) toast.warning("⚠️ Out of Stock", `"${form.itemName}" has no stock. Request will be queued.`);
    else if (qty > stock) toast.info("Stock Alert", `Requested qty (${qty}) exceeds available stock (${stock}).`);

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
        setSuccessRkd(data.rkdNumber);
        setForm({ personFillingName: "", department: "", machineName: "", machineId: "", itemName: "", requireQty: "" });
      } else {
        toast.error("Submission Failed", data.error || "Please try again.");
      }
    } catch (e: any) {
      toast.error("Network Error", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading ──
  if (pageLoading) return (
    <div className={styles.loadingScreen}>
      <div className={styles.loadingLogo}>RKD</div>
      <div className={styles.loaderRing}></div>
      <p className={styles.loadingText}>Loading Form...</p>
    </div>
  );

  const stockNum = parseFloat(itemData.stock || "0");

  return (
    <div className={styles.page}>
      <ToastContainer toasts={toasts} remove={remove} />

      {/* ── Hero Header ── */}
      <div className={styles.hero}>
        <div className={styles.heroBg}></div>
        <div className={styles.heroContent}>
          <div className={styles.heroBrand}>
            <div className={styles.heroLogo}>RKD</div>
            <span className={styles.heroLogoLabel}>Group</span>
          </div>
          <h1 className={styles.heroTitle}>Store Miscellaneous<br/>Indent Form</h1>
          <p className={styles.heroSub}>Fill all required details to submit your requirement</p>
        </div>
        <div className={styles.heroWave}>
          <svg viewBox="0 0 1440 80" preserveAspectRatio="none">
            <path d="M0,40 C360,80 1080,0 1440,40 L1440,80 L0,80 Z" fill="#F1F5F9"/>
          </svg>
        </div>
      </div>

      {/* ── Form Card ── */}
      <div className={styles.formWrap}>

        {/* SECTION: Employee */}
        <div className={styles.section}>
          <div className={styles.sectionLabel}>
            <span className={styles.sectionDot}></span>
            Employee Details
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Person Name <span className={styles.req}>*</span></label>
            <Select
              options={toOpts(options.persons)}
              styles={dropStyle} isSearchable={false} isClearable
              placeholder="Select person..."
              value={form.personFillingName ? { value: form.personFillingName, label: form.personFillingName } : null}
              onChange={(o: any) => set("personFillingName", o?.value || "")}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Department <span className={styles.req}>*</span></label>
            <Select
              options={toOpts(options.departments)}
              styles={dropStyle} isSearchable={false} isClearable
              placeholder="Select department..."
              value={form.department ? { value: form.department, label: form.department } : null}
              onChange={(o: any) => set("department", o?.value || "")}
            />
          </div>
        </div>

        {/* SECTION: Machine */}
        <div className={styles.section}>
          <div className={styles.sectionLabel}>
            <span className={styles.sectionDot} style={{ background: "#8B5CF6" }}></span>
            Machine Details
            <span className={styles.optTag}>Optional</span>
          </div>

          <div className={styles.twoCol}>
            <div className={styles.field}>
              <label className={styles.label}>Machine Name</label>
              <Select
                options={toOpts(options.machineNames)}
                styles={dropStyle} isSearchable={false} isClearable
                placeholder="Select..."
                value={form.machineName ? { value: form.machineName, label: form.machineName } : null}
                onChange={(o: any) => set("machineName", o?.value || "")}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Machine ID</label>
              <Select
                options={toOpts(options.machineIDs)}
                styles={dropStyle} isSearchable={false} isClearable
                placeholder="Select..."
                value={form.machineId ? { value: form.machineId, label: form.machineId } : null}
                onChange={(o: any) => set("machineId", o?.value || "")}
              />
            </div>
          </div>
        </div>

        {/* SECTION: Item */}
        <div className={styles.section}>
          <div className={styles.sectionLabel}>
            <span className={styles.sectionDot} style={{ background: "#10B981" }}></span>
            Item Requirement
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Item Name <span className={styles.req}>*</span></label>
            <Select
              options={toOpts(options.items)}
              styles={searchStyle} isSearchable isClearable
              placeholder="🔍 Search item..."
              value={form.itemName ? { value: form.itemName, label: form.itemName } : null}
              onChange={(o: any) => set("itemName", o?.value || "")}
              noOptionsMessage={() => "No matching items"}
              filterOption={(opt, input) => !input || opt.label.toLowerCase().includes(input.toLowerCase())}
            />
          </div>

          {/* Stock info */}
          {form.itemName && (
            <div className={`${styles.stockCard} ${stockNum <= 0 ? styles.stockDanger : stockNum < 5 ? styles.stockWarn : styles.stockOk}`}>
              <div className={styles.stockRow}>
                <span className={styles.stockLabel}>📦 Stock in Store</span>
                <span className={styles.stockVal}>{itemData.stock || "0"} {itemData.units}</span>
              </div>
              {itemData.vendor && (
                <div className={styles.stockRow}>
                  <span className={styles.stockLabel}>🏪 Vendor</span>
                  <span className={styles.stockVendor}>{itemData.vendor}</span>
                </div>
              )}
              {stockNum <= 0 && (
                <div className={styles.stockWarningText}>⚠️ Currently out of stock — will be queued for procurement</div>
              )}
            </div>
          )}

          {/* Qty + Units */}
          <div className={styles.twoCol}>
            <div className={styles.field}>
              <label className={styles.label}>Require Qty <span className={styles.req}>*</span></label>
              <input
                type="number" min="0.01" step="any"
                className={styles.numInput}
                placeholder="e.g. 5"
                value={form.requireQty}
                onChange={e => set("requireQty", e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Units</label>
              <input
                type="text" className={`${styles.numInput} ${styles.disabled}`}
                value={itemData.units} disabled placeholder="—"
              />
            </div>
          </div>
        </div>

        {/* ── Submit ── */}
        <button
          className={styles.submitBtn}
          disabled={submitting || !form.personFillingName || !form.department || !form.itemName || !form.requireQty}
          onClick={handleSubmit}
        >
          {submitting ? (
            <><span className={styles.btnSpinner}></span> Submitting...</>
          ) : (
            "Submit Indent →"
          )}
        </button>

        <p className={styles.formNote}>
          Fields marked <span className={styles.req}>*</span> are required
        </p>
      </div>

      {/* ── Success Modal ── */}
      {successRkd && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalEmoji}>🎉</div>
            <h3 className={styles.modalTitle}>Indent Submitted!</h3>
            <p className={styles.modalSub}>Your requirement has been recorded. The store team will process it shortly.</p>
            <div className={styles.modalRkd}>{successRkd}</div>
            <button className={styles.modalPrimary} onClick={() => setSuccessRkd(null)}>
              + New Indent
            </button>
            <button className={styles.modalSecondary} onClick={() => window.close()}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
