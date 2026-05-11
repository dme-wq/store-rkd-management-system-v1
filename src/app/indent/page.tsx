"use client";
import React, { useState, useEffect, useCallback } from "react";
import Select from "react-select";
import styles from "./indent.module.css";

// ── Toast system ──────────────────────────────────────────────────────────────
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
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4500);
  }, []);
  const remove = useCallback((id: number) => setToasts(p => p.filter(t => t.id !== id)), []);
  return { toasts, remove, toast: { success: (t: string, m?: string) => add("success", t, m), error: (t: string, m?: string) => add("error", t, m), warning: (t: string, m?: string) => add("warning", t, m), info: (t: string, m?: string) => add("info", t, m) } };
}

// ── Chip Selector Component ───────────────────────────────────────────────────
function ChipSelector({ label, required, options, value, onChange, freq }: {
  label: string; required?: boolean; options: string[]; value: string;
  onChange: (v: string) => void; freq?: Record<string, number>;
}) {
  const [showAll, setShowAll] = useState(false);
  const top = options.slice(0, 6);
  const rest = options.slice(6);
  const visible = showAll ? options : top;

  return (
    <div className={styles.fieldBlock}>
      <div className={styles.fieldLabel}>{label}{required && <span className={styles.req}>*</span>}</div>
      <div className={styles.chipGrid}>
        {visible.map(opt => (
          <button
            key={opt}
            type="button"
            className={`${styles.chip} ${value === opt ? styles.chipActive : ""}`}
            onClick={() => onChange(value === opt ? "" : opt)}
          >
            {opt}
            {freq && freq[opt] > 2 && <span className={styles.chipBadge}>{freq[opt]}</span>}
          </button>
        ))}
        {rest.length > 0 && !showAll && (
          <button type="button" className={styles.chipMore} onClick={() => setShowAll(true)}>
            +{rest.length} more
          </button>
        )}
        {showAll && rest.length > 0 && (
          <button type="button" className={styles.chipMore} onClick={() => setShowAll(false)}>
            Show less ↑
          </button>
        )}
      </div>
      {value && (
        <div className={styles.selectedPill}>
          ✓ <strong>{value}</strong>
          <button type="button" onClick={() => onChange("")} className={styles.pillClear}>×</button>
        </div>
      )}
    </div>
  );
}

export default function IndentForm() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successRkd, setSuccessRkd] = useState<string | null>(null);
  const { toasts, remove, toast } = useToast();

  const [options, setOptions] = useState<any>({
    persons: [], departments: [], machineNames: [], machineIDs: [], items: [], itemMap: {}, freq: {}
  });

  useEffect(() => {
    const cached = localStorage.getItem("indentOptionsCache_v3");
    if (cached) {
      try { setOptions(JSON.parse(cached)); setLoading(false); } catch (e) {}
    }
    fetch("/api/indent")
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setOptions(data.options);
          localStorage.setItem("indentOptionsCache_v3", JSON.stringify(data.options));
        }
        setLoading(false);
      })
      .catch(() => { toast.error("Network Error", "Could not load form options."); setLoading(false); });
  }, []);

  const [form, setForm] = useState({
    personFillingName: "", department: "", machineName: "", machineId: "", itemName: "", requireQty: ""
  });

  const selectedItemData = form.itemName && options.itemMap[form.itemName]
    ? options.itemMap[form.itemName]
    : { units: "", rate: "", vendor: "", stock: "" };

  const handleChange = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const toSelectOptions = (arr: string[]) => arr.map(a => ({ value: a, label: a }));

  const handleSubmit = async () => {
    // Validation with toast alerts
    if (!form.personFillingName) { toast.warning("Person Required", "Please select the person filling this indent."); return; }
    if (!form.department) { toast.warning("Department Required", "Please select your department."); return; }
    if (!form.itemName) { toast.warning("Item Required", "Please select the item you need."); return; }
    if (!form.requireQty || parseFloat(form.requireQty) <= 0) {
      toast.warning("Quantity Required", "Please enter a valid required quantity."); return;
    }

    const stock = parseFloat(selectedItemData.stock || "0");
    const qty = parseFloat(form.requireQty);
    if (stock <= 0) {
      toast.warning("⚠️ Out of Stock", `Stock for "${form.itemName}" is currently ${stock}. Submitting anyway — store team will review.`);
    } else if (qty > stock) {
      toast.info("Quantity Alert", `Requested qty (${qty}) exceeds current stock (${stock}). Your request will be reviewed.`);
    }

    setSubmitting(true);
    try {
      const payload = {
        personFillingName: form.personFillingName, itemName: form.itemName,
        requireQty: form.requireQty, department: form.department,
        machineName: form.machineName, machineId: form.machineId,
        units: selectedItemData.units, vendorName: selectedItemData.vendor,
        price: selectedItemData.rate, stockInStore: selectedItemData.stock
      };
      const res = await fetch("/api/indent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
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

  // react-select styles — AppSheet blue theme, centered
  const selectStyles = {
    control: (base: any, state: any) => ({
      ...base,
      backgroundColor: state.isFocused ? "#ffffff" : "#F8F9FA",
      border: state.isFocused ? "2px solid #1A73E8" : "1.5px solid #DADCE0",
      borderRadius: "10px",
      padding: "4px 6px",
      boxShadow: state.isFocused ? "0 0 0 3px rgba(26,115,232,0.15)" : "none",
      fontSize: "0.95rem",
      fontWeight: "500",
      minHeight: "50px",
      transition: "all 0.2s ease",
      textAlign: "left" as const,
    }),
    menu: (base: any) => ({
      ...base, borderRadius: "12px", border: "1px solid #E8EAED",
      boxShadow: "0 8px 32px rgba(60,64,67,0.18)", zIndex: 500,
      marginTop: "6px", padding: "6px", overflow: "hidden",
    }),
    menuList: (base: any) => ({ ...base, maxHeight: "260px" }),
    option: (base: any, state: any) => ({
      ...base, padding: "11px 14px", borderRadius: "8px", margin: "2px 0",
      fontWeight: "500", fontSize: "0.9rem",
      backgroundColor: state.isSelected ? "#1A73E8" : state.isFocused ? "#EEF4FD" : "white",
      color: state.isSelected ? "white" : "#202124", cursor: "pointer",
    }),
    placeholder: (base: any) => ({ ...base, color: "#9AA0A6", fontWeight: "400" }),
    singleValue: (base: any) => ({ ...base, color: "#202124", fontWeight: "600" }),
    indicatorSeparator: () => ({ display: "none" }),
    dropdownIndicator: (base: any) => ({ ...base, color: "#1A73E8" }),
    clearIndicator: (base: any) => ({ ...base, color: "#EA4335", cursor: "pointer" }),
    noOptionsMessage: (base: any) => ({ ...base, color: "#9AA0A6", fontStyle: "italic" }),
  };

  if (loading) return (
    <div className={styles.loadingOverlay}>
      <div className={styles.loaderBox}></div>
      <div className={styles.loadingText}>Loading form...</div>
    </div>
  );

  return (
    <div className={styles.pageContainer}>
      <ToastContainer toasts={toasts} remove={remove} />

      {/* App Bar */}
      <div className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIcon}>📋</div>
            <div>
              <h1 className={styles.headerTitle}>Store Miscellaneous Indent</h1>
              <div className={styles.headerSub}>RKD Group — Fill all required fields</div>
            </div>
          </div>
          <div className={styles.rkdLogoBox}>RKD</div>
        </div>
        <div className={styles.progressStrip}><div className={styles.progressFill}></div></div>
      </div>

      {/* Content */}
      <div className={styles.contentArea}>

        {/* EMPLOYEE DETAILS */}
        <div className={styles.formCard}>
          <div className={styles.cardHeader}>
            <span className={styles.cardHeaderIcon}>👤</span>
            <span>Employee Details</span>
          </div>
          <div className={styles.cardBody}>
            <ChipSelector
              label="Person Name" required
              options={options.persons} value={form.personFillingName}
              onChange={v => handleChange("personFillingName", v)}
              freq={options.freq?.person}
            />
            <ChipSelector
              label="Department" required
              options={options.departments} value={form.department}
              onChange={v => handleChange("department", v)}
              freq={options.freq?.dept}
            />
          </div>
        </div>

        {/* MACHINE DETAILS */}
        <div className={styles.formCard}>
          <div className={styles.cardHeader}>
            <span className={styles.cardHeaderIcon}>⚙️</span>
            <span>Machine Details <span className={styles.optional}>(optional)</span></span>
          </div>
          <div className={styles.cardBody}>
            <ChipSelector
              label="Machine Name"
              options={options.machineNames} value={form.machineName}
              onChange={v => handleChange("machineName", v)}
              freq={options.freq?.machineName}
            />
            <ChipSelector
              label="Machine ID"
              options={options.machineIDs} value={form.machineId}
              onChange={v => handleChange("machineId", v)}
              freq={options.freq?.machineId}
            />
          </div>
        </div>

        {/* ITEM REQUIREMENT */}
        <div className={styles.formCard}>
          <div className={styles.cardHeader}>
            <span className={styles.cardHeaderIcon}>📦</span>
            <span>Item Requirement</span>
          </div>
          <div className={styles.cardBody}>

            {/* Item Name — searchable dropdown */}
            <div className={styles.fieldBlock}>
              <div className={styles.fieldLabel}>Item Name <span className={styles.req}>*</span></div>
              <Select
                options={toSelectOptions(options.items)}
                styles={selectStyles}
                placeholder="🔍 Search item name..."
                value={form.itemName ? { value: form.itemName, label: form.itemName } : null}
                onChange={(o: any) => handleChange("itemName", o?.value || "")}
                isClearable
                isSearchable
                noOptionsMessage={() => "No items found"}
                filterOption={(opt, input) =>
                  !input || opt.label.toLowerCase().includes(input.toLowerCase())
                }
              />
            </div>

            {/* Stock Info Box */}
            {form.itemName && (
              <div className={`${styles.infoBox} ${parseFloat(selectedItemData.stock) <= 0 ? styles.infoBoxDanger : parseFloat(selectedItemData.stock) < 5 ? styles.infoBoxWarn : ""}`}>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>📦 Current Stock in Store</span>
                  <span className={styles.stockBadge}>{selectedItemData.stock || "0"}</span>
                </div>
                {selectedItemData.vendor && (
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>🏪 Vendor</span>
                    <span className={styles.infoValue}>{selectedItemData.vendor}</span>
                  </div>
                )}
                {parseFloat(selectedItemData.stock) <= 0 && (
                  <div className={styles.stockAlert}>⚠️ Out of Stock — request will be queued for procurement</div>
                )}
              </div>
            )}

            {/* Qty + Units row */}
            <div className={styles.rowGrid}>
              <div className={styles.fieldBlock} style={{ marginBottom: 0 }}>
                <div className={styles.fieldLabel}>Require Qty <span className={styles.req}>*</span></div>
                <input
                  type="number" step="any" min="0.01"
                  className={styles.formInput}
                  placeholder="e.g. 5"
                  value={form.requireQty}
                  onChange={e => handleChange("requireQty", e.target.value)}
                />
              </div>
              <div className={styles.fieldBlock} style={{ marginBottom: 0 }}>
                <div className={styles.fieldLabel}>Units</div>
                <input
                  type="text" className={styles.formInput}
                  value={selectedItemData.units} disabled placeholder="—"
                />
              </div>
            </div>

          </div>
        </div>

        {/* Spacer for fixed button */}
        <div style={{ height: 8 }}></div>
      </div>

      {/* Sticky Submit Bar */}
      <div className={styles.bottomBar}>
        <div className={styles.bottomInner}>
          <div className={styles.formSummary}>
            {form.personFillingName && <span className={styles.summaryChip}>👤 {form.personFillingName}</span>}
            {form.itemName && <span className={styles.summaryChip}>📦 {form.itemName}</span>}
          </div>
          <button
            className={styles.submitBtn}
            disabled={submitting || !form.personFillingName || !form.itemName || !form.requireQty || !form.department}
            onClick={handleSubmit}
          >
            {submitting ? (
              <><div className={styles.btnSpinner}></div> Submitting...</>
            ) : (
              <><span>Submit Indent</span> <span className={styles.submitArrow}>→</span></>
            )}
          </button>
        </div>
      </div>

      {/* Success Modal */}
      {successRkd && (
        <div className={styles.successModal}>
          <div className={styles.successCard}>
            <div className={styles.successAnim}>📬</div>
            <h3 className={styles.successTitle}>Indent Submitted!</h3>
            <div className={styles.successSubtitle}>
              Your requirement has been received. The store team will process it shortly.
            </div>
            <div className={styles.successRkd}>{successRkd}</div>
            <div className={styles.successActions}>
              <button className={styles.successBtnPrimary} onClick={() => setSuccessRkd(null)}>
                + New Indent
              </button>
              <button className={styles.successBtnSecondary} onClick={() => window.close()}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
