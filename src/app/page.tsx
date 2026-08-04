"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import { Search, Loader2, Filter, Package, Hash, Zap, Send, CheckCircle, UserCheck, FileText, BarChart3, Download, RefreshCw, Home as HomeIcon, Plus, Layers, ListTodo, PieChart, Database, Maximize } from "lucide-react";
import Select from "react-select";
import { subDays, subMonths, isWithinInterval, startOfDay, endOfDay, isSameDay, isSameMonth } from "date-fns";

const monthMap: Record<string, number> = {
  "जनवरी": 0, "फरवरी": 1, "मार्च": 2, "अप्रैल": 3, "मई": 4, "मयी": 4, "जून": 5,
  "जुलाई": 6, "अगस्त": 7, "सितंबर": 8, "अक्टूबर": 9, "नवंबर": 10, "दिसंबर": 11,
  "january": 0, "february": 1, "march": 2, "april": 3, "may": 4, "june": 5,
  "july": 6, "august": 7, "september": 8, "october": 9, "november": 10, "december": 11,
  "jan": 0, "feb": 1, "mar": 2, "apr": 3, "jun": 5,
  "jul": 6, "aug": 7, "sep": 8, "oct": 9, "nov": 10, "dec": 11
};

function parseCustomDate(dateStr: string): Date {
  if (!dateStr || typeof dateStr !== 'string') return new Date(0);

  // Try native parsing first
  let d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;

  // Split by non-word/non-hindi chars
  const parts = dateStr.split(/[^\w\u0900-\u097F]+/).filter(Boolean);
  if (parts.length >= 3) {
    let day = NaN, month = NaN, year = NaN;

    // Find Year (4 digits or 2 digits)
    let yearIdx = parts.findIndex(p => p.length === 4 && !isNaN(parseInt(p, 10)));
    if (yearIdx === -1) yearIdx = parts.findIndex(p => p.length === 2 && parseInt(p, 10) > 20);

    if (yearIdx !== -1) {
      year = parseInt(parts[yearIdx], 10);
      if (year < 100) year += 2000;

      const otherParts = parts.filter((_, i) => i !== yearIdx);

      // Find Month (name or index)
      for (let i = 0; i < otherParts.length; i++) {
        const p = otherParts[i].toLowerCase();
        const foundMonthKey = Object.keys(monthMap).find(mKey => p.includes(mKey) || mKey.includes(p));
        if (foundMonthKey) {
          month = monthMap[foundMonthKey];
          // If we found a month, the OTHER part (not the time parts) is the day
          // Usually first or second part
          day = parseInt(otherParts[i === 0 ? 1 : 0], 10);
          break;
        }
      }

      // Numeric month fallback (DD-MM or MM-DD)
      if (isNaN(month) && otherParts.length >= 2) {
        const p0 = parseInt(otherParts[0], 10);
        const p1 = parseInt(otherParts[1], 10);
        if (p1 >= 1 && p1 <= 12 && p0 > 12) { month = p1 - 1; day = p0; }
        else if (p0 >= 1 && p0 <= 12) { month = p0 - 1; day = p1; }
        else if (p1 >= 1 && p1 <= 12) { month = p1 - 1; day = p0; }
      }
    }

    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      return new Date(year, month, day);
    }
  }
  return new Date(0);
}

const makeSelectStyles = (minW = 110) => ({
  control: (base: any, state: any) => ({
    ...base,
    padding: "0px 2px",
    minHeight: "34px",
    borderRadius: "10px",
    borderColor: state.isFocused ? "#3b82f6" : "#e2e8f0",
    boxShadow: state.isFocused ? "0 0 0 3px rgba(59,130,246,0.1)" : "none",
    "&:hover": { borderColor: "#3b82f6" },
    fontSize: "0.8rem",
    minWidth: `${minW}px`,
    cursor: "pointer",
  }),
  option: (base: any, state: any) => ({
    ...base,
    backgroundColor: state.isSelected ? "#3b82f6" : state.isFocused ? "#eff6ff" : "white",
    color: state.isSelected ? "white" : "#334155",
    fontSize: "0.85rem",
    cursor: "pointer",
  }),
  menu: (base: any) => ({ ...base, zIndex: 100 }),
  menuList: (base: any) => ({ ...base, maxHeight: "240px" }),
});

const dateOptions = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7days", label: "Last 7 Days" },
  { value: "14days", label: "Last 14 Days" },
  { value: "30days", label: "Last 30 Days" },
  { value: "3months", label: "Last 3 Months" },
  { value: "custom", label: "Custom Range" },
  { value: "all", label: "All Time" }
];

// Helper to build unique options from an array of values
const toOptions = (vals: Set<string>, allLabel: string) => [
  { value: "__all__", label: allLabel },
  ...Array.from(vals).filter(Boolean).sort().map(v => ({ value: v, label: String(v) }))
];

// Digital Clock Component
function DigitalClock() {
  const [time, setTime] = useState(new Date());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!mounted) return <div className={styles.clockWrapper} style={{ visibility: 'hidden' }}></div>;

  const timeStr = time.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const dateStr = time.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className={styles.clockWrapper}>
      <div className={styles.digitalTime}>{timeStr}</div>
      <div className={styles.digitalDate}>{dateStr}</div>
    </div>
  );
}


// Modern Modal Component
function Modal({ isOpen, onClose, title, message, data }: any) {
  if (!isOpen) return null;

  return (
    <div className={`${styles.modalOverlay} ${styles.topModalOverlay}`} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalIconBox}>
            <Zap size={32} />
          </div>
        </div>
        <h3 className={styles.modalTitle}>{title}</h3>
        <p className={styles.modalMessage}>{message}</p>

        {data && (
          <div className={styles.modalInfoGrid}>
            <div className={styles.modalInfoItem}>
              <span className={styles.modalLabel}>Item Name:</span>
              <span className={styles.modalValue}>{data.item}</span>
            </div>
            <div className={styles.modalInfoItem}>
              <span className={styles.modalLabel}>Required Qty:</span>
              <span className={styles.modalValue}>{data.required}</span>
            </div>
            <div className={styles.modalInfoItem}>
              <span className={styles.modalLabel}>Available Stock:</span>
              <span className={styles.modalValue} style={{ color: '#ef4444' }}>{data.available}</span>
            </div>
          </div>
        )}

        <button className={styles.modalBtn} onClick={onClose}>
          Got it, I'll Check! 📦
        </button>
      </div>
    </div>
  );
}

// ── Modern Alert Modal (replaces all browser alert/confirm) ──────────────────
type AlertType = "error" | "warning" | "success" | "info";
function AlertModal({ isOpen, onClose, message, type = "error" }: { isOpen: boolean; onClose: () => void; message: string; type?: AlertType }) {
  if (!isOpen) return null;
  const cfg: Record<AlertType, { icon: string; color: string; bg: string; btnBg: string; title: string }> = {
    error: { icon: "❌", color: "#dc2626", bg: "#fee2e2", btnBg: "linear-gradient(135deg,#dc2626,#b91c1c)", title: "Error" },
    warning: { icon: "⚠️", color: "#d97706", bg: "#fef3c7", btnBg: "linear-gradient(135deg,#d97706,#b45309)", title: "Warning" },
    success: { icon: "✅", color: "#16a34a", bg: "#dcfce7", btnBg: "linear-gradient(135deg,#16a34a,#15803d)", title: "Success" },
    info: { icon: "ℹ️", color: "#2563eb", bg: "#dbeafe", btnBg: "linear-gradient(135deg,#2563eb,#1d4ed8)", title: "Notice" },
  };
  const c = cfg[type];
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
      <div style={{ background: 'white', borderRadius: '24px', padding: '32px 28px', maxWidth: '400px', width: '90%', boxShadow: '0 25px 60px rgba(0,0,0,0.25)', textAlign: 'center', animation: 'fadeIn 0.2s ease' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '1.8rem' }}>{c.icon}</div>
        <h3 style={{ fontFamily: "'Inter','Poppins',sans-serif", fontWeight: 800, fontSize: '1.2rem', color: '#0f172a', margin: '0 0 10px' }}>{c.title}</h3>
        <p style={{ fontFamily: "'Inter','Poppins',sans-serif", color: '#475569', fontSize: '0.93rem', lineHeight: 1.6, margin: '0 0 24px' }}>{message}</p>
        <button onClick={onClose} style={{ background: c.btnBg, color: 'white', border: 'none', borderRadius: '12px', padding: '12px 32px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', width: '100%', fontFamily: "'Inter','Poppins',sans-serif" }}>OK, Got it!</button>
      </div>
    </div>
  );
}

// ── Searchable RKD Select (for Debit Note / Reverse Entry) ───────────────────
function SearchableRKDSelect({ data, value, onChange, placeholder = "Search RKD or Item..." }: any) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  // Only closed requirements
  const closedData = useMemo(() =>
    data.filter((r: any) => String(r["Status"] || "").trim() === "Requirement Closed"),
    [data]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return closedData.filter((r: any) =>
      (r["Store RKD Number"] || "").toLowerCase().includes(q) ||
      (r["Item Name"] || "").toLowerCase().includes(q) ||
      (r["Person Filling Name"] || "").toLowerCase().includes(q)
    );
  }, [closedData, search]);

  const selectedRow = value;

  return (
    <div style={{ position: 'relative' }}>
      {/* Trigger */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', borderRadius: '12px', border: '2px solid #e2e8f0',
          background: 'white', cursor: 'pointer', fontSize: '0.88rem', color: selectedRow ? '#0f172a' : '#94a3b8',
          fontFamily: "'Inter','Poppins',sans-serif", transition: 'border-color 0.2s',
          boxShadow: open ? '0 0 0 3px rgba(59,130,246,0.15)' : 'none',
          borderColor: open ? '#3b82f6' : '#e2e8f0',
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedRow ? `${selectedRow["Store RKD Number"]} — ${selectedRow["Item Name"]}` : placeholder}
        </span>
        <span style={{ marginLeft: 8, color: '#94a3b8', fontSize: '0.75rem', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}>▼</span>
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
          background: 'white', borderRadius: '14px', border: '2px solid #e2e8f0',
          boxShadow: '0 20px 50px rgba(0,0,0,0.15)', zIndex: 9999, overflow: 'hidden',
        }}>
          {/* Search */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Search size={15} color="#94a3b8" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Type to search..."
              style={{ border: 'none', outline: 'none', fontSize: '0.85rem', width: '100%', color: '#0f172a', background: 'transparent', fontFamily: "'Inter','Poppins',sans-serif" }}
            />
          </div>
          {/* List */}
          <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '14px 16px', color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center' }}>No closed requirements found</div>
            ) : filtered.map((r: any) => (
              <div
                key={r._id}
                onClick={() => { onChange(r); setOpen(false); setSearch(""); }}
                style={{
                  padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid #f8fafc',
                  background: selectedRow?._id === r._id ? '#eff6ff' : 'white',
                  transition: 'background 0.1s',
                  fontFamily: "'Inter','Poppins',sans-serif",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={e => (e.currentTarget.style.background = selectedRow?._id === r._id ? '#eff6ff' : 'white')}
              >
                <div style={{ fontWeight: 700, fontSize: '0.83rem', color: '#1e293b' }}>{r["Store RKD Number"]}</div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>{r["Item Name"]} · {r["Person Filling Name"]}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Manual Issue Modal Component
function ManualIssueModal({ isOpen, onClose, row, onSubmit, updating, stockMap }: any) {
  const [qty, setQty] = useState("");
  const [status, setStatus] = useState("Requirement Closed");

  useEffect(() => {
    if (row) {
      setQty(row["Require Qty"] || "");
      setStatus("Requirement Closed");
    }
  }, [row]);

  if (!isOpen || !row) return null;

  const disabledStyle = { background: '#f3f4f6', color: '#9ca3af', cursor: 'not-allowed', borderColor: '#e5e7eb' };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalIconBox} style={{ background: '#eff6ff', color: '#2563eb' }}>
            <Package size={32} />
          </div>
        </div>
        <h3 className={styles.modalTitle}>Manual Issue 📦</h3>
        <p className={styles.modalMessage}>Only <strong>Issue Qty</strong> and <strong>Status</strong> are editable.</p>

        <div className={styles.formInfoBox}>
          <div className={styles.modalInfoItem}><span className={styles.modalLabel}>RKD Number:</span> <span className={styles.modalValue}>{row["Store RKD Number"]}</span></div>
          <div className={styles.modalInfoItem}><span className={styles.modalLabel}>Person:</span> <span className={styles.modalValue}>{row["Person Filling Name"]}</span></div>
          <div className={styles.modalInfoItem}><span className={styles.modalLabel}>Item:</span> <span className={styles.modalValue}>{row["Item Name"]}</span></div>
          <div className={styles.modalInfoItem}><span className={styles.modalLabel}>Department:</span> <span className={styles.modalValue}>{row["Department"]}</span></div>
          <div className={styles.modalInfoItem}><span className={styles.modalLabel}>Machine:</span> <span className={styles.modalValue}>{row["Machine Name"]} ({row["Machine ID"]})</span></div>
          <div className={styles.modalInfoItem} style={{ borderTop: '1px solid #e5e7eb', marginTop: '8px', paddingTop: '8px' }}>
            <span className={styles.modalLabel}>Required:</span> <span className={styles.modalValue}>{row["Require Qty"]} {row["Units"]}</span>
          </div>
          <div className={styles.modalInfoItem}>
            <span className={styles.modalLabel}>Current Stock:</span>
            <span className={styles.modalValue} style={{ color: Number(stockMap[(row["Item Name"] || "").trim().toLowerCase()]) < Number(row["Require Qty"]) ? '#ef4444' : '#166534' }}>
              {stockMap[(row["Item Name"] || "").trim().toLowerCase()] || "0"}
            </span>
          </div>
        </div>

        {/* EDITABLE */}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>✏️ Issue Quantity <span style={{ color: '#2563eb', fontSize: '0.75rem' }}>(Editable)</span></label>
          <input
            type="number"
            className={styles.formInput}
            value={qty}
            onChange={e => setQty(e.target.value)}
            placeholder="Enter quantity"
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>✏️ Status <span style={{ color: '#2563eb', fontSize: '0.75rem' }}>(Editable)</span></label>
          <select
            className={styles.formSelect}
            value={status}
            onChange={e => setStatus(e.target.value)}
          >
            <option value="Requirement Open">Requirement Open</option>
            <option value="Requirement Closed">Requirement Closed</option>
            <option value="Requirement Cancelled">Requirement Cancelled</option>
          </select>
        </div>

        <button
          className={styles.dribbbleBtnPrimary}
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={() => onSubmit(qty, status)}
          disabled={updating}
        >
          {updating ? <Loader2 className={styles.btnSpin} size={20} /> : <span>✅</span>}
          <span>Update & Sync</span>
        </button>
      </div>
    </div>
  );
}

// Manual Approval Modal Component
function ManualApprovalModal({ isOpen, onClose, row, onSubmit, updating, miscMap, isRefreshing, onRefresh }: any) {
  const [vendor, setVendor] = useState("");
  const [rate, setRate] = useState("");
  const [status, setStatus] = useState("No");
  const [approvedQty, setApprovedQty] = useState("");

  useEffect(() => {
    if (row) {
      const itemName = (row["Item Name"] || "").trim().toLowerCase();
      const misc = miscMap[itemName] || { vendor: "", rate: "" };
      setVendor(misc.vendor || "");
      setRate(misc.rate || "");
      setStatus("No");
      setApprovedQty(row["Require Qty"] || "");
    }
  }, [row, miscMap]);

  if (!isOpen || !row) return null;

  const readonlyStyle = { background: '#f3f4f6', color: '#6b7280', cursor: 'not-allowed', borderColor: '#e5e7eb', borderStyle: 'dashed' as const };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalIconBox} style={{ background: '#fffbeb', color: '#d97706' }}>
            <UserCheck size={32} />
          </div>
        </div>
        <h3 className={styles.modalTitle}>Manual Approval ✍️</h3>
        <p className={styles.modalMessage}>Only <strong>Approved Qty</strong> and <strong>Approval Require?</strong> are editable.</p>

        <div className={styles.formInfoBox}>
          <div className={styles.modalInfoItem}><span className={styles.modalLabel}>RKD:</span> <span className={styles.modalValue}>{row["Store RKD Number"]}</span></div>
          <div className={styles.modalInfoItem}><span className={styles.modalLabel}>Item:</span> <span className={styles.modalValue}>{row["Item Name"]}</span></div>
          <div className={styles.modalInfoItem}><span className={styles.modalLabel}>Required:</span> <span className={styles.modalValue}>{row["Require Qty"]} {row["Units"]}</span></div>
        </div>

        {/* READ-ONLY */}
        <div className={styles.formGroup}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label className={styles.formLabel} style={{ color: '#9ca3af', marginBottom: 0 }}>🔒 Vendor Name <span style={{ fontSize: '0.75rem' }}>(Auto-filled)</span></label>
            <button onClick={onRefresh} disabled={isRefreshing} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
              {isRefreshing ? <Loader2 size={12} className={styles.btnSpin} /> : <span>🔄</span>} Refresh
            </button>
          </div>
          <input type="text" className={styles.formInput} value={vendor} readOnly style={readonlyStyle} />
        </div>

        <div className={styles.formGroup}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label className={styles.formLabel} style={{ color: '#9ca3af', marginBottom: 0 }}>🔒 Rate <span style={{ fontSize: '0.75rem' }}>(Auto-filled)</span></label>
            <button onClick={onRefresh} disabled={isRefreshing} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
              {isRefreshing ? <Loader2 size={12} className={styles.btnSpin} /> : <span>🔄</span>} Refresh
            </button>
          </div>
          <input type="text" className={styles.formInput} value={rate} readOnly style={readonlyStyle} />
        </div>

        {/* EDITABLE */}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>✏️ Approved Quantity <span style={{ color: '#d97706', fontSize: '0.75rem' }}>(Editable)</span></label>
          <input
            type="number"
            className={styles.formInput}
            value={approvedQty}
            onChange={e => setApprovedQty(e.target.value)}
            placeholder="Enter approved quantity"
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>✏️ Approval Require? <span style={{ color: '#d97706', fontSize: '0.75rem' }}>(Editable)</span></label>
          <select
            className={styles.formSelect}
            value={status}
            onChange={e => setStatus(e.target.value)}
          >
            <option value="No">No</option>
            <option value="Yes">Yes</option>
          </select>
        </div>

        <button
          className={styles.dribbbleBtnPrimary}
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={() => onSubmit({ vendor, rate, status, approvedQty })}
          disabled={updating}
        >
          {updating ? <Loader2 className={styles.btnSpin} size={18} /> : <span>✅</span>}
          <span>Submit Approval</span>
        </button>
      </div>
    </div>
  );
}

// Instant Approval Detailed Modal Component
function InstantApprovalModal({ isOpen, onClose, row, onSubmit, updating, iaVendor, setIaVendor, iaRate, setIaRate, isRefreshing, onRefresh }: any) {
  if (!isOpen || !row) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalIconBox} style={{ background: '#dcfce7', color: '#16a34a' }}>
            <CheckCircle size={32} />
          </div>
        </div>
        <h3 className={styles.modalTitle}>Instant Approval ⚡</h3>
        <p className={styles.modalMessage}>Review details before instant approval.</p>

        <div className={styles.formInfoBox}>
          <div className={styles.modalInfoItem}><span className={styles.modalLabel}>RKD:</span> <span className={styles.modalValue}>{row["Store RKD Number"]}</span></div>
          <div className={styles.modalInfoItem}><span className={styles.modalLabel}>Item:</span> <span className={styles.modalValue}>{row["Item Name"]}</span></div>
          <div className={styles.modalInfoItem}><span className={styles.modalLabel}>Person:</span> <span className={styles.modalValue}>{row["Person Filling Name"]}</span></div>
          <div className={styles.modalInfoItem}><span className={styles.modalLabel}>Dept:</span> <span className={styles.modalValue}>{row["Department"]}</span></div>
          <div className={styles.modalInfoItem} style={{ borderTop: '1px solid #e5e7eb', marginTop: '8px', paddingTop: '8px' }}>
            <span className={styles.modalLabel}>Required:</span> <span className={styles.modalValue}>{row["Require Qty"]} {row["Units"]}</span>
          </div>
        </div>

        {/* Refreshable Fields */}
        <div className={styles.formGroup} style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label className={styles.formLabel} style={{ color: '#9ca3af', marginBottom: 0 }}>🔒 Vendor Name <span style={{ fontSize: '0.75rem' }}>(Auto-filled)</span></label>
            <button onClick={onRefresh} disabled={isRefreshing} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
              {isRefreshing ? <Loader2 size={12} className={styles.btnSpin} /> : <span>🔄</span>} Refresh
            </button>
          </div>
          <input
            type="text"
            className={styles.formInput}
            value={iaVendor}
            readOnly
            style={{ background: '#f3f4f6', color: '#6b7280', cursor: 'not-allowed', borderColor: '#e5e7eb', borderStyle: 'dashed' }}
          />
        </div>

        <div className={styles.formGroup}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label className={styles.formLabel} style={{ color: '#9ca3af', marginBottom: 0 }}>🔒 Rate (₹) <span style={{ fontSize: '0.75rem' }}>(Auto-filled)</span></label>
            <button onClick={onRefresh} disabled={isRefreshing} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
              {isRefreshing ? <Loader2 size={12} className={styles.btnSpin} /> : <span>🔄</span>} Refresh
            </button>
          </div>
          <input
            type="text"
            className={styles.formInput}
            value={iaRate}
            readOnly
            style={{ background: '#f3f4f6', color: '#6b7280', cursor: 'not-allowed', borderColor: '#e5e7eb', borderStyle: 'dashed' }}
          />
        </div>

        <button
          className={styles.dribbbleBtnPrimary}
          style={{ width: '100%', justifyContent: 'center', background: 'linear-gradient(135deg, #16a34a, #15803d)' }}
          onClick={onSubmit}
          disabled={updating || isRefreshing}
        >
          {updating ? <Loader2 className={styles.btnSpin} size={18} /> : <span>✅</span>}
          <span>Approve & Update</span>
        </button>
      </div>
    </div>
  );
}

// ── Smart Live Status — MULTI-STEP stacked logic ─────────────────────────────
// Returns an array of status steps, all relevant ones shown stacked top-to-bottom.
// Each step = { label, emoji, color, bg, border }
type StatusStep = { label: string; emoji: string; color: string; bg: string; border: string };

function getLiveStatus(
  row: any,
  stockMap: Record<string, string>,
  poMap: Record<string, { poNumber: string; poDate: string; vendorName: string }>,
  inwardMap: Record<string, { inwardQty: string; inwardDate: string }>
): StatusStep[] {
  const steps: StatusStep[] = [];
  const rkdNumber = String(row["Store RKD Number"] || "").trim();
  const status = String(row["Status"] || "").trim();
  const issueQty = parseFloat(row["Issue Qty"] || "0") || 0;
  const reqQty = parseFloat(row["Require Qty"] || "0") || 0;
  const approvalReq = String(row["Approval Require?"] || "").trim().toLowerCase();
  const approvedQty = parseFloat(row["Approved Quantity"] || "0") || 0;
  const itemKey = (row["Item Name"] || "").trim().toLowerCase();
  const imsStockStr = stockMap[itemKey];
  const imsStock = imsStockStr !== undefined ? parseFloat(imsStockStr) || 0 : NaN;

  // Step 1: Always show base state first
  steps.push({ label: "Indent Done", emoji: "📋", color: "#ffffff", bg: "rgba(148,163,184,0.3)", border: "rgba(255,255,255,0.4)" });

  // Step 2: Stock status (if open and not yet issued)
  if (status === "Requirement Open" && issueQty === 0) {
    if (!isNaN(imsStock)) {
      if (imsStock <= 0) {
        steps.push({ label: "Out of Stock", emoji: "🔴", color: "#ffffff", bg: "rgba(239,68,68,0.4)", border: "rgba(255,255,255,0.4)" });
      } else if (imsStock < reqQty) {
        steps.push({ label: "Low Stock", emoji: "⚠️", color: "#ffffff", bg: "rgba(245,158,11,0.4)", border: "rgba(255,255,255,0.4)" });
      } else {
        steps.push({ label: "Stock Available", emoji: "🟢", color: "#ffffff", bg: "rgba(74,222,128,0.3)", border: "rgba(255,255,255,0.4)" });
      }
    }
  }

  // Step 3: Approval flow
  if (approvalReq === "yes" || approvalReq === "हाँ") {
    if (approvedQty > 0) {
      steps.push({ label: "Approval Done", emoji: "✅", color: "#ffffff", bg: "rgba(167,139,250,0.4)", border: "rgba(255,255,255,0.4)" });
    } else {
      steps.push({ label: "Approval Pending", emoji: "⏳", color: "#ffffff", bg: "rgba(249,115,22,0.4)", border: "rgba(255,255,255,0.4)" });
    }
  } else if (approvalReq === "no" || approvalReq === "नहीं") {
    steps.push({ label: "Approval Done", emoji: "✅", color: "#ffffff", bg: "rgba(167,139,250,0.4)", border: "rgba(255,255,255,0.4)" });
  } else if (approvalReq === "pending" || approvalReq === "pending owner approval") {
    steps.push({ label: "Approval Pending", emoji: "⏳", color: "#ffffff", bg: "rgba(249,115,22,0.4)", border: "rgba(255,255,255,0.4)" });
  }

  // Step 4: PO Created (from poMap lookup)
  const poInfo = poMap[rkdNumber];
  if (poInfo && poInfo.poNumber) {
    steps.push({ label: `Order Raised`, emoji: "📄", color: "#ffffff", bg: "rgba(56,189,248,0.3)", border: "rgba(255,255,255,0.4)" });
  }

  // Step 5: Inward Done (from inwardMap lookup)
  const inwardInfo = inwardMap[rkdNumber];
  if (inwardInfo && inwardInfo.inwardQty) {
    steps.push({ label: `Inward Done (${inwardInfo.inwardQty})`, emoji: "📦", color: "#ffffff", bg: "rgba(52,211,153,0.3)", border: "rgba(255,255,255,0.4)" });
  }

  // Step 6: Issue status
  if (issueQty > 0 && issueQty >= reqQty) {
    steps.push({ label: "Issued ✓", emoji: "✅", color: "#ffffff", bg: "rgba(16,185,129,0.4)", border: "rgba(255,255,255,0.4)" });
  } else if (issueQty > 0 && issueQty < reqQty) {
    steps.push({ label: `Partial (${issueQty}/${reqQty})`, emoji: "🔄", color: "#ffffff", bg: "rgba(96,165,250,0.3)", border: "rgba(255,255,255,0.4)" });
  }

  // Step 7: Final state overrides everything
  if (status === "Requirement Closed") {
    return [{ label: "Indent Closed", emoji: "✅", color: "#ffffff", bg: "rgba(34,197,94,0.4)", border: "rgba(255,255,255,0.4)" }];
  }
  if (status === "Requirement Cancelled") {
    return [{ label: "Cancelled", emoji: "🚫", color: "#ffffff", bg: "rgba(148,163,184,0.3)", border: "rgba(255,255,255,0.4)" }];
  }

  return steps;
}
// ─────────────────────────────────────────────────────────────────────────────

export default function Home() {

  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [apiError, setApiError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [selDateFilter, setSelDateFilter] = useState<any>(dateOptions[3]); // Last 14 Days default
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // 6 dependent filters
  const [selRKDNum, setSelRKDNum] = useState<any>(null);
  const [selPerson, setSelPerson] = useState<any>(null);
  const [selItem, setSelItem] = useState<any>(null);
  const [selDept, setSelDept] = useState<any>(null);
  const [selMachine, setSelMachine] = useState<any>(null);
  const [selMachineID, setSelMachineID] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const currentYear = new Date().getFullYear().toString();
  const [updatingRowId, setUpdatingRowId] = useState<number | null>(null);

  // Track row IDs that were just written locally — protect them from stale poll overwrites
  const recentlyWrittenIds = useRef<Set<number>>(new Set());
  const postWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Alert Modal State (replaces browser alert())
  const [alertModal, setAlertModal] = useState<{ open: boolean; msg: string; type: AlertType }>({ open: false, msg: "", type: "error" });
  const showAlert = (msg: string, type: AlertType = "error") => setAlertModal({ open: true, msg, type });

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMsg, setModalMsg] = useState("");
  const [modalData, setModalData] = useState<any>(null);
  const [miscMap, setMiscMap] = useState<Record<string, { vendor: string, rate: string }>>({});
  const [poMap, setPoMap] = useState<Record<string, { poNumber: string; poDate: string; vendorName: string }>>({});
  const [inwardMap, setInwardMap] = useState<Record<string, { inwardQty: string; inwardDate: string }>>({});
  const hasLoadedOnce = useRef(false); // track if we ever got real data
  const fullDataLoaded = useRef(false); // track if full dataset has been fetched
  const isProcessingRef = useRef(false); // prevent double clicking
  const [isFullScreen, setIsFullScreen] = useState(false);
  const fullScreenRef = useRef<HTMLDivElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const sidebarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filtersVisible, setFiltersVisible] = useState(true);

  const toggleFullScreen = async () => {
    if (!document.fullscreenElement) {
      try {
        await fullScreenRef.current?.requestFullscreen();
      } catch (err) {
        console.error("Fullscreen API failed", err);
      }
    } else {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullScreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // Manual Issue State
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isManualApprovalModalOpen, setIsManualApprovalModalOpen] = useState(false);
  const [manualRow, setManualRow] = useState<any>(null);

  // Instant Approval Modal State
  const [isInstantApproveModalOpen, setIsInstantApproveModalOpen] = useState(false);
  const [instantApproveRow, setInstantApproveRow] = useState<any>(null);
  const [iaVendor, setIaVendor] = useState("");
  const [iaRate, setIaRate] = useState("");


  // Master Modal States
  const [isEditMasterOpen, setIsEditMasterOpen] = useState(false);
  const [editMasterRow, setEditMasterRow] = useState<any>(null);
  const [emUnit, setEmUnit] = useState("");
  const [emPrice, setEmPrice] = useState("");
  const [emVendor, setEmVendor] = useState("");
  const [emMinQty, setEmMinQty] = useState("");
  const [emSafety, setEmSafety] = useState("");
  const [emGst, setEmGst] = useState("");
  const [emRack, setEmRack] = useState("");
  const [metaOpts, setMetaOpts] = useState<{ units: string[], vendors: string[] }>({ units: [], vendors: [] });
  const [isMetaLoading, setIsMetaLoading] = useState(false);
  const [emSubmitting, setEmSubmitting] = useState(false);

  const fetchMetaOpts = async () => {
    setIsMetaLoading(true);
    try {
      const res = await fetch("/api/indent?action=meta");
      const json = await res.json();
      if (json.success) {
        setMetaOpts({ units: json.units || [], vendors: json.vendors || [] });
      }
    } catch (e) { }
    setIsMetaLoading(false);
  };

  const handleEditMasterSave = async () => {
    if (!editMasterRow) return;
    const itemName = editMasterRow["Item Name"];
    setEmSubmitting(true);
    try {
      const res = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "EDIT_ITEM_MASTER",
          itemName: itemName,
          updatedFields: {
            unit: emUnit,
            price: emPrice,
            vendor: emVendor,
            minQty: emMinQty,
            safetyFactor: emSafety,
            gst: emGst,
            rackNo: emRack
          }
        })
      });
      const data = await res.json();
      if (data.success) {
        showAlert("Master Data Updated Successfully!", "success");
        setIsEditMasterOpen(false);
        fetchData(true);
      } else {
        showAlert(data.error || "Update Failed", "error");
      }
    } catch (e: any) {
      showAlert("Network Error: " + e.message, "error");
    } finally {
      setEmSubmitting(false);
    }
  };

  // AI Voice Assistant States
  const [isListening, setIsListening] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiParsing, setIsAiParsing] = useState(false);
  const [aiReviewOpen, setAiReviewOpen] = useState(false);
  const [aiPayload, setAiPayload] = useState<{ intent: string, analysis: string, targets: any[], originalText: string, suggestedFilters?: any } | null>(null);
  const [aiExecutionProgress, setAiExecutionProgress] = useState<{ current: number, total: number, active: boolean }>({ current: 0, total: 0, active: false });
  const aiTimeoutRef = useRef<any>(null);

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showAlert("Speech Recognition is not supported in this browser. Please use Chrome.", "warning");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'hi-IN'; // Hindi model correctly handles Hinglish (kal, kitne, indent, close, cancel)
    recognition.continuous = false;
    recognition.interimResults = true; // Real-time feedback

    recognition.onstart = () => {
      setIsListening(true);
      if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
    };
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((res: any) => res[0].transcript)
        .join('');
      setAiPrompt(transcript);
      // Voice fills the box \u2014 user reviews and clicks Send manually
    };
    recognition.onerror = (e: any) => {
      setIsListening(false);
      showAlert("Speech recognition error: " + e.error, "error");
    };
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const processAiCommand = async (directPrompt?: string) => {
    const finalPrompt = directPrompt || aiPrompt;
    if (!finalPrompt.trim()) return;
    setIsAiParsing(true);
    try {
      // ── Hindi month name parser ──
      const hindiMonths: Record<string, string> = {
        'जनवरी': '01', 'फरवरी': '02', 'मार्च': '03', 'अप्रैल': '04',
        'मई': '05', 'जून': '06', 'जुलाई': '07', 'अगस्त': '08',
        'सितंबर': '09', 'अक्टूबर': '10', 'नवंबर': '11', 'दिसंबर': '12'
      };
      const parseIndentDate = (ts: string): Date => {
        try {
          let normalized = ts;
          for (const [hindi, num] of Object.entries(hindiMonths)) {
            if (normalized.includes(hindi)) { normalized = normalized.replace(hindi, num); break; }
          }
          const parts = normalized.split(' ')[0].split('-');
          if (parts.length === 3) {
            const d1 = new Date(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`);
            if (!isNaN(d1.getTime())) return d1;
            const d2 = new Date(`${parts[1]} ${parts[0]}, ${parts[2]}`);
            if (!isNaN(d2.getTime())) return d2;
          }
        } catch { }
        return new Date(ts);
      };

      // ── SMART PRE-FILTER: detect date intent from prompt to minimize tokens sent ──
      const now = new Date();
      const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const todayStart = new Date(istNow.getFullYear(), istNow.getMonth(), istNow.getDate());
      const yesterdayStart = new Date(todayStart.getTime() - 86400000);
      const yesterdayEnd = new Date(todayStart.getTime() - 1);

      const p = finalPrompt.toLowerCase();
      let dateCutoffFrom: Date;
      let dateCutoffTo: Date = new Date(8640000000000000); // far future
      let detectedWindow = 'Last 60 Days';

      if (/(aaj|आज|today|abhi|अभी)/i.test(p)) {
        dateCutoffFrom = todayStart; detectedWindow = 'Today';
      } else if (/(kal\b|कल|yesterday)/i.test(p)) {
        dateCutoffFrom = yesterdayStart; dateCutoffTo = yesterdayEnd; detectedWindow = 'Yesterday';
      } else if (/(7 din|7 day|last week|pichle 7|सात दिन)/i.test(p)) {
        dateCutoffFrom = new Date(now.getTime() - 7 * 86400000); detectedWindow = 'Last 7 Days';
      } else if (/(14 din|14 day|pichle 14)/i.test(p)) {
        dateCutoffFrom = new Date(now.getTime() - 14 * 86400000); detectedWindow = 'Last 14 Days';
      } else if (/(30 din|30 day|mahine|month|महीना)/i.test(p)) {
        dateCutoffFrom = new Date(now.getTime() - 30 * 86400000); detectedWindow = 'Last 30 Days';
      } else {
        dateCutoffFrom = new Date(now.getTime() - 60 * 86400000); detectedWindow = 'Last 60 Days';
      }

      const stripRKD = (s: string) => s?.replace(/^RKD_S_\d{4}_/, '') ?? s;
      const abbrevStatus = (s: string) => {
        if (s === 'Requirement Open') return 'Open';
        if (s === 'Requirement Closed') return 'Closed';
        if (s === 'Requirement Cancelled') return 'Cancelled';
        return s;
      };

      const activeIndents = data.filter(r => {
        const d = parseIndentDate(r["Timestamp"] || "");
        return !isNaN(d.getTime()) && d >= dateCutoffFrom && d <= dateCutoffTo;
      });

      const isActionQuery = /(close|cancel|band|karo|kardo|bund|band kar)/i.test(p);

      // For ACTION queries: include IssueQty + StockInStore so AI validates before suggesting CLOSE
      const compressedIndents = activeIndents.map(r => {
        const stockVal = stockMap[r["Item Name"]] ?? 0;
        if (isActionQuery) {
          // Full context: RKD|Item|RequireQty|IssueQty|Stock|Status|Person|Timestamp
          return `${stripRKD(r["Store RKD Number"])}|${r["Item Name"]}|Req:${r["Require Qty"]}|Issued:${r["Issue Qty"] || 0}|Stock:${stockVal}|${abbrevStatus(r["Status"])}|${r["Person Filling Name"]}|${r["Timestamp"]}`;
        }
        // VIEW queries: lighter format
        return `${stripRKD(r["Store RKD Number"])}|${r["Item Name"]}|${r["Require Qty"]}|${abbrevStatus(r["Status"])}|${r["Person Filling Name"]}|${r["Timestamp"]}`;
      });

      const needsPO = /(po|purchase order|order|vendor)/i.test(p);
      const needsInward = /(inward|received|aaya|stock main)/i.test(p);

      const compressedInwards = needsInward ? Object.entries(inwardMap)
        .filter(([, v]) => { const d = parseIndentDate((v as any).inwardDate || ''); return !isNaN(d.getTime()) && d >= dateCutoffFrom && d <= dateCutoffTo; })
        .map(([k, v]) => `${stripRKD(k)}|${(v as any).inwardQty}|${(v as any).inwardDate}`) : [];

      const compressedPos = needsPO ? Object.entries(poMap)
        .filter(([, v]) => { const d = parseIndentDate((v as any).poDate || ''); return !isNaN(d.getTime()) && d >= dateCutoffFrom && d <= dateCutoffTo; })
        .map(([k, v]) => `${stripRKD(k)}|${(v as any).poNumber}|${(v as any).poDate}|${(v as any).vendorName}`) : [];

      // Always include stock for ACTION queries so AI can validate CLOSE eligibility
      const activeItemSet = new Set(activeIndents.map(r => r["Item Name"]));
      const compressedStock = (isActionQuery || needsInward) ? Object.entries(stockMap)
        .filter(([k]) => activeItemSet.has(k))
        .map(([k, v]) => `${k}|${v}`) : [];

      const contextData = {
        window: detectedWindow,
        indents: compressedIndents,
        ...(compressedStock.length > 0 && { stockLevels: compressedStock }),
        ...(needsInward && { inwardHistory: compressedInwards }),
        ...(needsPO && { poHistory: compressedPos }),
      };

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: finalPrompt, contextData })
      });
      const resData = await res.json();

      if (!resData.success) {
        throw new Error(resData.message || resData.error || "Unknown Error");
      }

      const { intent, analysis, targets } = resData.result;

      if (!intent || intent === "UNKNOWN") {
        showAlert("AI could not understand the command.", "warning");
        return;
      }

      // Map targets back to real rows — handle both short (32485) and full (RKD_S_2026_32485) formats
      const enrichedTargets = (targets || []).map((t: any) => {
        const rkdNum = t.rkdNumber || "";
        const row = data.find(r =>
          r["Store RKD Number"] === rkdNum ||                          // exact full match
          r["Store RKD Number"]?.endsWith(`_${rkdNum}`) ||            // suffix match: 32485
          r["Store RKD Number"]?.replace(/^RKD_S_\d{4}_/, '') === rkdNum.replace(/^RKD_S_\d{4}_/, '') // normalize both
        );
        return row ? { ...row, _aiProposedAction: t.proposedAction, _aiReason: t.reason } : null;
      }).filter(Boolean);

      setAiPayload({ intent, analysis, targets: enrichedTargets, originalText: finalPrompt, suggestedFilters: resData.result.suggestedFilters });
      setAiReviewOpen(true);
      setAiPrompt("");

    } catch (e: any) {
      showAlert("AI Processing Error: " + e.message, "error");
    } finally {
      setIsAiParsing(false);
    }
  };

  const executeAiBulkAction = async () => {
    if (!aiPayload || aiPayload.targets.length === 0 || aiPayload.intent !== "ACTION") return;

    // ── HARD BUSINESS RULE ENFORCEMENT (before any API call) ──
    const blocked: string[] = [];
    const validTargets = aiPayload.targets.filter(t => {
      // Rule 1: Cannot act on already-Closed or already-Cancelled records
      if (t["Status"] !== "Requirement Open") {
        blocked.push(`${t["Item Name"]} (${t["Status"]} — already processed)`);
        return false;
      }
      // Rule 2: Cannot CLOSE if stock is 0 AND issue qty is 0
      if (t._aiProposedAction === "CLOSE") {
        const stock = Number(stockMap[t["Item Name"]] ?? 0);
        const issued = Number(t["Issue Qty"] ?? 0);
        if (stock === 0 && issued === 0) {
          blocked.push(`${t["Item Name"]} (Stock: 0, Issued: 0 — cannot close without issue)`);
          return false;
        }
      }
      return true;
    });

    if (blocked.length > 0) {
      showAlert(`⚠️ Blocked ${blocked.length} record(s) due to business rules:\n• ${blocked.join('\n• ')}`, "warning");
    }
    if (validTargets.length === 0) {
      showAlert("No valid records to process after applying business rules.", "warning");
      return;
    }

    setAiReviewOpen(false);

    // Filter only those that actually have an action
    const actionTargets = validTargets.filter(t => t._aiProposedAction === "CLOSE" || t._aiProposedAction === "CANCEL");
    if (actionTargets.length === 0) {
      showAlert("No actionable records to process.", "warning");
      return;

    }

    setAiExecutionProgress({ current: 0, total: actionTargets.length, active: true });

    let successCount = 0;
    for (let i = 0; i < actionTargets.length; i++) {
      const row = actionTargets[i];
      setAiExecutionProgress(p => ({ ...p, current: i + 1 }));

      try {
        if (row._aiProposedAction === "CLOSE") {
          await fetch("/api/sheets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "ISSUE",
              rkdNumber: row["Store RKD Number"],
              issueQty: row["Require Qty"],
              status: "Requirement Closed",
              itemName: row["Item Name"],
              rate: "0"
            })
          });
        } else if (row._aiProposedAction === "CANCEL") {
          await fetch("/api/sheets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "ISSUE",
              rkdNumber: row["Store RKD Number"],
              issueQty: "0",
              status: "Requirement Cancelled",
              itemName: row["Item Name"],
              rate: "0"
            })
          });
        }
        successCount++;
      } catch (e) {
        console.error("Failed AI action for RKD:", row["Store RKD Number"]);
      }
    }

    setAiExecutionProgress({ current: 0, total: 0, active: false });
    setAiPayload(null);
    showAlert(`Successfully processed ${successCount} / ${actionTargets.length} entries.`, "success");
    fetchData(true);
  };

  // Debit Note / Reverse Entry Modal State
  const [isDebitNoteOpen, setIsDebitNoteOpen] = useState(false);
  const [isReverseEntryOpen, setIsReverseEntryOpen] = useState(false);
  const [dnSelectedRKD, setDnSelectedRKD] = useState<any>(null);
  const [dnQty, setDnQty] = useState("");
  const [reSelectedRKD, setReSelectedRKD] = useState<any>(null);
  const [reQty, setReQty] = useState("");
  const [columnUpdating, setColumnUpdating] = useState(false);

  const handleColumnUpdate = async (rkdNumber: string, column: "S" | "T", qty: string, requireQty: string) => {
    const qtyNum = parseFloat(qty);
    const reqNum = parseFloat(requireQty);
    if (isNaN(qtyNum) || qtyNum <= 0) { showAlert("Please enter a valid quantity.", "warning"); return; }
    if (qtyNum > reqNum) { showAlert(`Quantity cannot exceed Required Qty (${requireQty}).`, "warning"); return; }
    setColumnUpdating(true);
    const originalData = [...data];
    // Optimistic UI update for Debit Note (S) or Reverse Entry (T) column
    const colKey = column === "S" ? "Debit Note Qty" : "Reverse Entry Qty";
    const newData = data.map(r => r["Store RKD Number"] === rkdNumber ? { ...r, [colKey]: qty } : r);
    setData(newData);
    setIsDebitNoteOpen(false);
    setIsReverseEntryOpen(false);
    setDnSelectedRKD(null); setDnQty("");
    setReSelectedRKD(null); setReQty("");
    try {
      const res = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "UPDATE_COLUMN", rkdNumber, column, value: qty })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setModalTitle("Saved! ✅");
      setModalMsg(`${column === "S" ? "Debit Note" : "Reverse Entry"} Qty updated for ${rkdNumber}.`);
      setModalData(null); setIsModalOpen(true);
      setTimeout(() => setIsModalOpen(false), 2500);
      refreshAfterWrite(); // confirm from server after 1.5s
    } catch (err: any) {
      showAlert("Update Failed: " + err.message, "error");
      setData(originalData); // rollback on error
    } finally {
      setColumnUpdating(false);
    }
  };

  const fetchData = async (silent = false, fullMode = false) => {
    if (!silent) setLoading(true);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);
      const modeParam = fullMode ? '&mode=full' : '';
      const res = await fetch(`/api/sheets?t=${Date.now()}${modeParam}`, { signal: controller.signal, cache: 'no-store' });
      clearTimeout(timer);
      const json = await res.json();

      if (json.success) {
        setData(json.data || []);
        setStockMap(json.stockMap || {});
        setMiscMap(json.miscMap || {});
        setPoMap(json.poMap || {});
        setInwardMap(json.inwardMap || {});
        setLastUpdated(new Date().toLocaleTimeString("en-IN"));
        setApiError(null);
        hasLoadedOnce.current = true;
        if (fullMode || json.isFullData) fullDataLoaded.current = true;
      } else {
        // success:false — only clear data if we never loaded before AND no error yet
        console.error("[fetchData] API success=false:", json.error);
        if (!hasLoadedOnce.current) {
          // Auto-retry once after 4 seconds on cold start failure
          setApiError("Connecting... retrying automatically.");
          setTimeout(() => fetchData(true), 4000);
        } else {
          // We have stale data — show a mild warning but keep the table
          setApiError("Sync warning — showing last loaded data.");
          setTimeout(() => setApiError(null), 6000);
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        if (!hasLoadedOnce.current) {
          setApiError("Slow connection — retrying automatically...");
          setTimeout(() => fetchData(true), 4000);
        } else {
          setApiError("Slow connection — showing cached data.");
          setTimeout(() => setApiError(null), 6000);
        }
      } else {
        if (!hasLoadedOnce.current) {
          setApiError("Network error — retrying automatically...");
          setTimeout(() => fetchData(true), 4000);
        } else {
          setApiError(err.message);
        }
        console.error("[fetchData] Error:", err);
      }
    } finally {
      setLoading(false);
    }
  };

  // Safe JSON parser — avoids crash when API returns HTML (e.g. Vercel 504 timeout)
  const safeResJson = async (res: Response) => {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      // If the sheet update already succeeded (2xx range but garbled body), treat it as success
      if (res.ok) return { success: true };
      throw new Error(`Server error (${res.status}): Please check your connection and try again.`);
    }
  };

  // Triggers a silent server fetch 1.5s after any successful write.
  // This confirms the real Sheets state so the optimistic update is validated
  // and any stale server-cache is bypassed (cache was already cleared by the POST).
  const refreshAfterWrite = useCallback((rowId?: number) => {
    if (postWriteTimerRef.current) clearTimeout(postWriteTimerRef.current);
    if (rowId !== undefined) recentlyWrittenIds.current.add(rowId);
    postWriteTimerRef.current = setTimeout(async () => {
      await fetchData(true); // silent, no loading spinner
      if (rowId !== undefined) recentlyWrittenIds.current.delete(rowId);
    }, 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDirectIssue = async (row: any) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    const rowId = row._id;
    const rkdNumber = row["Store RKD Number"];
    const requireQty = row["Require Qty"];

    if (!rkdNumber) {
      showAlert("Error: RKD Number not found for this row.", "error");
      isProcessingRef.current = false;
      return;
    }

    // Check if stock is sufficient before issuing
    const itemKey = (row["Item Name"] || "").trim().toLowerCase();
    const currentStockStr = stockMap[itemKey];
    const currentStock = currentStockStr !== undefined ? Number(currentStockStr) : 0;
    const reqQty = Number(requireQty) || 0;

    if (currentStock < reqQty) {
      setModalTitle("Insufficient Stock! ⚠️");
      setModalMsg("We cannot process this issue because there isn't enough stock in the store.");
      setModalData({
        item: row["Item Name"],
        required: reqQty,
        available: currentStock
      });
      setIsModalOpen(true);
      isProcessingRef.current = false;
      return;
    }

    // Optimistic Update — immediately show the new state
    setUpdatingRowId(rowId);
    const originalData = [...data];
    const newData = data.map(r => {
      if (r._id === rowId) {
        return { ...r, "Status": "Requirement Closed", "Issue Qty": requireQty };
      }
      return r;
    });
    setData(newData);

    try {
      const res = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rkdNumber,
          issueQty: requireQty,
          status: "Requirement Closed",
          itemName: row["Item Name"],
          rate: row["Price"] || "0"
        })
      });
      const json = await safeResJson(res);
      if (!json.success) throw new Error(json.error || "Update failed");
      // Fetch fresh server state 1.5s later to confirm the write
      refreshAfterWrite(rowId);
    } catch (err: any) {
      showAlert("Failed to update: " + err.message, "error");
      setData(originalData); // Rollback
    } finally {
      setUpdatingRowId(null);
      isProcessingRef.current = false;
    }
  };

  const handleManualSubmit = async (issueQty: string, status: string) => {
    if (isProcessingRef.current) return;
    if (!manualRow) return;

    isProcessingRef.current = true;
    const rowId = manualRow._id;
    const rkdNumber = manualRow["Store RKD Number"];

    // Stock Check
    const itemKey = (manualRow["Item Name"] || "").trim().toLowerCase();
    const currentStockStr = stockMap[itemKey];
    const currentStock = currentStockStr !== undefined ? Number(currentStockStr) : 0;
    const qtyNum = Number(issueQty) || 0;
    const reqNum = Number(manualRow["Require Qty"]) || 0;

    // 1. Check if Issue Qty exceeds Required Qty
    if (qtyNum > reqNum) {
      setModalTitle("Quantity Exceeded! 🚫");
      setModalMsg("You cannot issue more than the requested quantity.");
      setModalData({
        item: manualRow["Item Name"],
        required: reqNum,
        available: "N/A (Max Allowed)"
      });
      setIsModalOpen(true);
      isProcessingRef.current = false;
      return;
    }

    // 2. Stock Check
    if (currentStock < qtyNum && status !== "Requirement Cancelled") {
      setModalTitle("Insufficient Stock! ⚠️");
      setModalMsg("You are trying to issue more than what is available in the store.");
      setModalData({
        item: manualRow["Item Name"],
        required: qtyNum,
        available: currentStock
      });
      setIsModalOpen(true);
      isProcessingRef.current = false;
      return;
    }

    setUpdatingRowId(rowId);
    const originalData = [...data];
    const newData = data.map(r => {
      if (r._id === rowId) return { ...r, "Status": status, "Issue Qty": issueQty };
      return r;
    });
    setData(newData);
    setIsManualModalOpen(false);

    try {
      const res = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rkdNumber,
          issueQty,
          status,
          itemName: manualRow["Item Name"],
          rate: manualRow["Price"] || "0"
        })
      });
      const json = await safeResJson(res);
      if (!json.success) throw new Error(json.error || "Update failed");
      refreshAfterWrite(rowId);
    } catch (err: any) {
      showAlert("Failed to update: " + err.message, "error");
      setData(originalData);
    } finally {
      setUpdatingRowId(null);
      isProcessingRef.current = false;
    }
  };

  const handleInstantApproval = (row: any) => {
    setInstantApproveRow(row);
    // Pre-fill with existing row values from StoreDataEntry
    setIaVendor(row["Vendor Name"] || "");
    setIaRate(row["Price"] || "");
    setIsInstantApproveModalOpen(true);
  };

  const submitInstantApproval = async () => {
    if (isProcessingRef.current) return;
    if (!instantApproveRow) return;
    isProcessingRef.current = true;
    const row = instantApproveRow;
    const rowId = row._id;
    const rkdNumber = row["Store RKD Number"];
    const reqQty = row["Require Qty"];

    setUpdatingRowId(rowId);
    const originalData = [...data];
    const newData = data.map(r => {
      if (r._id === rowId) return { ...r, "Approval Require?": "No", "Approved Quantity": reqQty, "Vendor Name": iaVendor, "Price": iaRate };
      return r;
    });
    setData(newData);
    setIsInstantApproveModalOpen(false);

    try {
      const res = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "INSTANT_APPROVE",
          rkdNumber,
          itemName: row["Item Name"],
          approvedQty: reqQty,
          vendorName: iaVendor,
          rate: iaRate
        })
      });
      const json = await safeResJson(res);
      if (!json.success) throw new Error(json.error || "Update failed");
      refreshAfterWrite(rowId);

      setModalTitle("Instant Approval! \u2705");
      setModalMsg(`Approval status set to "No" and Approved Quantity set to "${reqQty}" for ${rkdNumber}.`);
      setModalData(null);
      setIsModalOpen(true);
      setTimeout(() => setIsModalOpen(false), 3000);
    } catch (err: any) {
      showAlert("Instant Approval Failed: " + err.message, "error");
      setData(originalData);
    } finally {
      setUpdatingRowId(null);
      setInstantApproveRow(null);
      isProcessingRef.current = false;
    }
  };



  const handleManualApprovalSubmit = async (formData: any) => {
    if (!manualRow) return;
    const rowId = manualRow._id;
    const rkdNumber = manualRow["Store RKD Number"];

    setUpdatingRowId(rowId);
    setIsManualApprovalModalOpen(false);
    const originalData = [...data];

    // Optimistic UI Update
    const newData = data.map(r => {
      if (r._id === rowId) return { ...r, "Approval Require?": formData.status, "Approved Quantity": formData.approvedQty };
      return r;
    });
    setData(newData);

    try {
      const res = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "APPROVE",
          rkdNumber,
          itemName: manualRow["Item Name"],
          vendorName: formData.vendor,
          rate: formData.rate,
          approvedQty: formData.approvedQty,
          status: formData.status // Yes/No
        })
      });
      const json = await safeResJson(res);
      if (!json.success) throw new Error(json.error || "Update failed");
      refreshAfterWrite(rowId);
      setModalTitle("Approved Successfully! ✅");
      setModalMsg(`Manual Approval for "${manualRow["Item Name"]}" has been logged.`);
      setModalData(null);
      setIsModalOpen(true);
      setTimeout(() => setIsModalOpen(false), 3000);
    } catch (err: any) {
      showAlert("Manual Approval Failed: " + err.message, "error");
      setData(originalData);
    } finally {
      setUpdatingRowId(null);
    }
  };

  const handleRowRefresh = async (row: any) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setUpdatingRowId(row._id);
    try {
      const res = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REFRESH_VENDOR_RATE",
          rkdNumber: row["Store RKD Number"]
        })
      });
      const json = await safeResJson(res);
      if (json.success) {
        await fetchData(true, false);
        const freshMiscRes = await fetch("/api/sheets?mode=full");
        const freshJson = await safeResJson(freshMiscRes);
        if (freshJson.success && freshJson.miscMap) {
          if (instantApproveRow && row._id === instantApproveRow._id) {
            const itemName = (instantApproveRow["Item Name"] || "").trim().toLowerCase();
            const freshMisc = freshJson.miscMap[itemName] || { vendor: "", rate: "" };
            setIaVendor(freshMisc.vendor || "");
            setIaRate(freshMisc.rate || "");
          }
        }
        showAlert(`Refreshed ${row["Item Name"]}`, "success");
      } else {
        showAlert(json.message || "Failed to refresh", "error");
      }
    } catch (e: any) {
      console.error(e);
      showAlert("Error refreshing item data", "error");
    } finally {
      setUpdatingRowId(null);
      isProcessingRef.current = false;
    }
  };

  // Fetch full data when date filter changes (if not already fetched)
  const prevDateFilter = useRef<string | null>(null);
  useEffect(() => {
    const filterVal = selDateFilter?.value || null;
    // On the very first render, skip (initial load already fetched)
    if (prevDateFilter.current === null) {
      prevDateFilter.current = filterVal;
      return;
    }
    // If filter changed and we don't have full data yet, fetch it
    if (prevDateFilter.current !== filterVal && !fullDataLoaded.current) {
      prevDateFilter.current = filterVal;
      fetchData(true, true); // silent + full mode
    } else {
      prevDateFilter.current = filterVal;
    }
  }, [selDateFilter]);

  useEffect(() => {
    let timeoutId: any;
    const poll = async () => {
      try {
        await fetchData(true);
      } finally {
        // Wait 30 seconds AFTER the request completes before starting the next one
        timeoutId = setTimeout(poll, 30000);
      }
    };

    fetchData().then(() => {
      timeoutId = setTimeout(poll, 30000);
    });

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // Apply date + keyword filter first (base for dependent dropdowns)
  const dateFilteredData = useMemo(() => {
    const today = new Date();
    let start: Date | null = null, end: Date | null = null;
    if (selDateFilter?.value === "today") { start = startOfDay(today); end = endOfDay(today); }
    else if (selDateFilter?.value === "yesterday") { start = startOfDay(subDays(today, 1)); end = endOfDay(subDays(today, 1)); }
    else if (selDateFilter?.value === "7days") { start = startOfDay(subDays(today, 7)); end = endOfDay(today); }
    else if (selDateFilter?.value === "14days") { start = startOfDay(subDays(today, 14)); end = endOfDay(today); }
    else if (selDateFilter?.value === "30days") { start = startOfDay(subDays(today, 30)); end = endOfDay(today); }
    else if (selDateFilter?.value === "3months") { start = startOfDay(subMonths(today, 3)); end = endOfDay(today); }
    else if (selDateFilter?.value === "custom" && customStart && customEnd) {
      start = startOfDay(new Date(customStart)); end = endOfDay(new Date(customEnd));
    }
    return data.filter(row => {
      if (start && end) {
        const d = parseCustomDate(row["Timestamp"]);
        // FIX: If timestamp can't be parsed (d === epoch 0), treat the entry as
        // "too old" — exclude it from any time-bounded filter. This prevents
        // entries with Hindi month timestamps that fail parsing from leaking into
        // "Last 30 Days" / "Today" views and making the table look unfiltered.
        if (d.getTime() === 0 || !isWithinInterval(d, { start, end })) return false;
      }
      if (searchTerm) {
        return Object.values(row).some(v => String(v).toLowerCase().includes(searchTerm.toLowerCase()));
      }
      return true;
    });
  }, [data, selDateFilter, customStart, customEnd, searchTerm]);

  // Progressively filtered data for dependent dropdowns
  const afterRKD = useMemo(() =>
    !selRKDNum || selRKDNum.value === "__all__" ? dateFilteredData
      : dateFilteredData.filter(r => r["Store RKD Number"] === selRKDNum.value),
    [dateFilteredData, selRKDNum]);

  const afterPerson = useMemo(() =>
    !selPerson || selPerson.value === "__all__" ? afterRKD
      : afterRKD.filter(r => r["Person Filling Name"] === selPerson.value),
    [afterRKD, selPerson]);

  const afterItem = useMemo(() =>
    !selItem || selItem.value === "__all__" ? afterPerson
      : afterPerson.filter(r => r["Item Name"] === selItem.value),
    [afterPerson, selItem]);

  const afterDept = useMemo(() =>
    !selDept || selDept.value === "__all__" ? afterItem
      : afterItem.filter(r => r["Department"] === selDept.value),
    [afterItem, selDept]);

  const afterMachine = useMemo(() =>
    !selMachine || selMachine.value === "__all__" ? afterDept
      : afterDept.filter(r => r["Machine Name"] === selMachine.value),
    [afterDept, selMachine]);

  const filteredData = useMemo(() => {
    let result = !selMachineID || selMachineID.value === "__all__" ? afterMachine
      : afterMachine.filter(r => r["Machine ID"] === selMachineID.value);

    if (statusFilter) {
      result = result.filter(r => String(r["Status"] || "").trim() === statusFilter);
    }
    return result;
  }, [afterMachine, selMachineID, statusFilter]);

  // Dropdown options derived from progressively filtered data
  const rkdOptions = useMemo(() => toOptions(new Set(dateFilteredData.map(r => r["Store RKD Number"])), "All RKD Numbers"), [dateFilteredData]);
  const personOptions = useMemo(() => toOptions(new Set(afterRKD.map(r => r["Person Filling Name"])), "All Persons"), [afterRKD]);
  const itemOptions = useMemo(() => toOptions(new Set(afterPerson.map(r => r["Item Name"])), "All Items"), [afterPerson]);
  const deptOptions = useMemo(() => toOptions(new Set(afterItem.map(r => r["Department"])), "All Departments"), [afterItem]);
  const machineOptions = useMemo(() => toOptions(new Set(afterDept.map(r => r["Machine Name"])), "All Machines"), [afterDept]);
  const machineIDOptions = useMemo(() => toOptions(new Set(afterMachine.map(r => r["Machine ID"])), "All Machine IDs"), [afterMachine]);

  const totalRequests = filteredData.length;
  const rawTotalQty = filteredData.reduce((acc, row) => acc + (Number(row["Issue Qty"]) || 0), 0);

  // ── PDF Generation ──────────────────────────────────────────────────────────
  const generateIssuePDF = async () => {
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    // Header
    doc.setFillColor(220, 20, 100);
    doc.rect(0, 0, pageW, 20, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("RKD Store — Issue Report", pageW / 2, 8, { align: "center" });
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${now}`, pageW / 2, 14, { align: "center" });

    // Filter summary sub-header
    const filterParts: string[] = [];
    if (statusFilter) filterParts.push(`Status: ${statusFilter}`);
    if (selDateFilter?.label) filterParts.push(`Date: ${selDateFilter.label}`);
    if (selDept?.value) filterParts.push(`Dept: ${selDept.value}`);
    if (selItem?.value) filterParts.push(`Item: ${selItem.value}`);
    if (selPerson?.value) filterParts.push(`Person: ${selPerson.value}`);
    if (selMachine?.value) filterParts.push(`Machine: ${selMachine.value}`);
    if (filterParts.length > 0) {
      doc.setFontSize(7);
      doc.setTextColor(80, 80, 80);
      doc.text(`Filters: ${filterParts.join(" | ")}`, 14, 25);
    }

    // Build table rows
    const rows = filteredData.map((row, idx) => {
      const issueQty = parseFloat(row["Issue Qty"] || "0") || 0;
      const rate = parseFloat(row["Price"] || "0") || 0;
      const total = issueQty * rate;

      // Extract date part from Timestamp (e.g., "07-May-2026 11:30" -> "07-May-2026")
      const fullTs = row["Timestamp"] || "-";
      let dateOnly = fullTs !== "-" ? fullTs.split(" ")[0] : "-";

      // Fix Hindi characters in date (jsPDF helvetica doesn't support them)
      const hindiToEnglishMonths: Record<string, string> = {
        "जनवरी": "Jan", "फरवरी": "Feb", "मार्च": "Mar", "अप्रैल": "Apr", "मई": "May", "मयी": "May", "जून": "Jun",
        "जुलाई": "Jul", "अगस्त": "Aug", "सितंबर": "Sep", "अक्टूबर": "Oct", "नवंबर": "Nov", "दिसंबर": "Dec"
      };
      Object.keys(hindiToEnglishMonths).forEach(hi => {
        dateOnly = dateOnly.replace(hi, hindiToEnglishMonths[hi]);
      });

      return [
        idx + 1,
        dateOnly,
        row["Store RKD Number"] || "-",
        row["Department"] || "-",
        row["Item Name"] || "-",
        row["Machine Name"] || "-",
        row["Machine ID"] || "-",
        row["Person Filling Name"] || "-",
        row["Vendor Name"] || "-",
        row["Require Qty"] || "0",
        issueQty > 0 ? issueQty : "0",
        rate > 0 ? `Rs. ${rate.toFixed(2)}` : "-",
        total > 0 ? `Rs. ${total.toFixed(2)}` : "-",
      ];
    });

    // Grand Total
    const grandTotal = filteredData.reduce((sum, row) => {
      const qty = parseFloat(row["Issue Qty"] || "0") || 0;
      const rate = parseFloat(row["Price"] || "0") || 0;
      return sum + qty * rate;
    }, 0);

    autoTable(doc, {
      startY: filterParts.length > 0 ? 30 : 26,
      head: [[
        "#", "Timestamp", "RKD Number", "Department", "Item Name",
        "Machine Name", "Machine ID", "Person", "Vendor",
        "Indent Qty", "Issue Qty", "Rate", "Total Price"
      ]],
      body: rows,
      foot: [["", "", "", "", "", "", "", "", "",
        { content: "GRAND TOTAL", colSpan: 2, styles: { fontStyle: "bold", halign: "right" } },
        "",
        { content: `Rs. ${grandTotal.toFixed(2)}`, styles: { fontStyle: "bold", textColor: [220, 20, 100] } }
      ]],
      showFoot: "lastPage",
      styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: [30, 30, 50], textColor: 255, fontStyle: "bold", fontSize: 7.5 },
      footStyles: { fillColor: [240, 240, 240], textColor: [30, 30, 30], fontSize: 8 },
      alternateRowStyles: { fillColor: [252, 252, 255] },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 21 },
        2: { cellWidth: 26 },
        3: { cellWidth: 22 },
        4: { cellWidth: 30 },
        5: { cellWidth: 22 },
        6: { cellWidth: 18 },
        7: { cellWidth: 22 },
        8: { cellWidth: 24 },
        9: { cellWidth: 14, halign: "center" },
        10: { cellWidth: 14, halign: "center" },
        11: { cellWidth: 18, halign: "right" },
        12: { cellWidth: 20, halign: "right" },
      },
      didDrawPage: (data: any) => {
        // Page footer
        const pageCount = (doc as any).internal.getNumberOfPages();
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(`Page ${data.pageNumber} of ${pageCount}`, pageW - 14, doc.internal.pageSize.getHeight() - 6, { align: "right" });
        doc.text("RKD Furnishings Pvt Ltd.", 14, doc.internal.pageSize.getHeight() - 6);
      }
    });

    const dateStr = new Date().toLocaleDateString("en-IN").replace(/\//g, "-");
    const label = statusFilter ? statusFilter.replace("Requirement ", "") : "All";
    doc.save(`RKD_Issue_Report_${label}_${dateStr}.pdf`);
  };
  // ────────────────────────────────────────────────────────────────────────────
  const totalItemsQty = Number.isInteger(rawTotalQty) ? rawTotalQty : Number(rawTotalQty.toFixed(2));

  // Scorecard Calculations (based on all 30 days data)
  const scorecards = useMemo(() => {
    const today = new Date();

    let tIndent = 0, tIssue = 0, mIndent = 0, mIssue = 0;
    let sOpen = 0, sClosed = 0, sCancelled = 0;

    data.forEach(row => {
      const d = parseCustomDate(row["Timestamp"]);
      const status = String(row["Status"] || "").trim();
      const isClosed = status === "Requirement Closed";

      // All-time counts for buttons
      if (status === "Requirement Open") sOpen += 1;
      else if (isClosed) sClosed += 1;
      else if (status === "Requirement Cancelled") sCancelled += 1;

      if (d.getTime() === 0) return; // Ignore invalid dates for scorecards to avoid inflation

      if (isSameDay(d, today)) {
        tIndent += 1;
        if (isClosed) tIssue += 1;
      }
      if (isSameMonth(d, today)) {
        mIndent += 1;
        if (isClosed) mIssue += 1;
      }
    });

    return {
      todayIndent: tIndent,
      todayIssue: tIssue,
      monthIndent: mIndent,
      monthIssue: mIssue,
      statusCounts: { open: sOpen, closed: sClosed, cancelled: sCancelled }
    };
  }, [data]);

  const ss = makeSelectStyles(100);

  return (
    <div className={styles.pageContainer}>
      <style>{`
        @keyframes geminiGradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes geminiPulse {
          0% { height: 4px; }
          100% { height: 16px; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {isNavigating && (
        <div className={styles.navigatingOverlay}>
          <div className={styles.navSpinner}></div>
          <div className={styles.navText}>Please wait...</div>
        </div>
      )}
      <div className={styles.bgTopShapeLayer1}></div>
      <div className={styles.bgTopShapeLayer2}></div>
      <div className={styles.bgBottomShape}></div>
      <div className={styles.glassOrb}></div>

      {/* Main Layout */}
      {/* ─── Auto-Hide Left Sidebar Trigger ─── */}
      <div
        className={styles.sidebarTrigger}
        onMouseEnter={() => { if (sidebarTimerRef.current) clearTimeout(sidebarTimerRef.current); setSidebarOpen(true); }}
      />
      <div className={styles.presentationLayout}>
        {/* NEW DRIBBBLE SIDEBAR */}
        <div 
           className={`${styles.dribbbleSidebar} ${sidebarOpen ? styles.dribbbleSidebarOpen : ''}`}
           onMouseLeave={() => { sidebarTimerRef.current = setTimeout(() => setSidebarOpen(false), 300); }}
           onMouseEnter={() => { if (sidebarTimerRef.current) clearTimeout(sidebarTimerRef.current); }}
        >
           {/* Sidebar Logo */}
           <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
             <img src="https://static.wixstatic.com/media/68b92a_d71e34133826499983234774dea1945b~mv2.png/v1/fill/w_186,h_156,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/RKD-Logo.png" alt="RKD Logo" style={{ height: '45px', objectFit: 'contain' }} />
           </div>

           <div className={styles.dribbbleSidebarMenu}>
              <div className={`${styles.dribbbleSidebarItem} ${styles.dribbbleSidebarItemActive}`}>
                 <div className={styles.dribbbleSidebarIcon}><HomeIcon size={20} strokeWidth={2.5} /></div>
                 <span>Home</span>
              </div>
              <div className={styles.dribbbleSidebarItemPrimary} onClick={() => window.open('/indent', '_blank')}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                   <div className={styles.dribbbleSidebarIconPrimary}><Plus size={20} strokeWidth={2.5} /></div>
                   <span>New Indent</span>
                 </div>
                 <span style={{ fontSize: '12px', opacity: 0.8 }}>▼</span>
              </div>
              
              <div className={styles.dribbbleSidebarItem} onClick={() => { setIsNavigating(true); router.push("/po"); }}>
                 <div className={styles.dribbbleSidebarIcon}><Layers size={20} strokeWidth={2.5} /></div>
                 <span>Projects (PO)</span>
              </div>

              <div className={styles.dribbbleSidebarItem} onClick={() => { setIsNavigating(true); router.push("/inward"); }}>
                 <div className={styles.dribbbleSidebarIcon}><ListTodo size={20} strokeWidth={2.5} /></div>
                 <span>Tasks (Inward)</span>
              </div>

              <div className={styles.dribbbleSidebarItem} onClick={() => { setIsNavigating(true); router.push("/report"); }}>
                 <div className={styles.dribbbleSidebarIcon}><PieChart size={20} strokeWidth={2.5} /></div>
                 <span>Reporting</span>
              </div>
              
              <div style={{ height: '1px', background: '#f1f5f9', margin: '16px 0 8px 0' }}></div>
              
              <div className={styles.dribbbleSidebarItem} onClick={() => { setIsNavigating(true); router.push("/ims"); }}>
                 <div className={styles.dribbbleSidebarIcon}><Database size={20} strokeWidth={2.5} /></div>
                 <span>IMS</span>
              </div>
              
              <div className={styles.dribbbleSidebarItem} onClick={() => { setIsNavigating(true); router.push("/approval"); }}>
                 <div className={styles.dribbbleSidebarIcon}><CheckCircle size={20} strokeWidth={2.5} /></div>
                 <span>Approvals</span>
              </div>
              
              <div className={styles.dribbbleSidebarItem} onClick={() => setIsDebitNoteOpen(true)}>
                 <div className={styles.dribbbleSidebarIcon}><FileText size={20} strokeWidth={2.5} /></div>
                 <span>Debit Note</span>
              </div>
              
              <div className={styles.dribbbleSidebarItem} onClick={() => setIsReverseEntryOpen(true)}>
                 <div className={styles.dribbbleSidebarIcon}><RefreshCw size={20} strokeWidth={2.5} /></div>
                 <span>Reverse Entry</span>
              </div>
              
              <div className={styles.dribbbleSidebarItem} onClick={generateIssuePDF}>
                 <div className={styles.dribbbleSidebarIcon}><Download size={20} strokeWidth={2.5} /></div>
                 <span>Download PDF</span>
              </div>
              <div className={styles.dribbbleSidebarItem} onClick={toggleFullScreen}>
                 <div className={styles.dribbbleSidebarIcon}><Maximize size={20} strokeWidth={2.5} /></div>
                 <span>Full Screen</span>
              </div>

              <div className={styles.dribbbleSidebarItem} onClick={() => fetchData(false, false)}>
                 <div className={styles.dribbbleSidebarIcon}><RefreshCw size={20} strokeWidth={2.5} className={loading ? styles.btnSpin : ''} /></div>
                 <span>Sync Now</span>
              </div>
           </div>
        </div>

        <div className={styles.appCardSide}>
          <div className={styles.appCard}>

            {/* App Header with Logo */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #f1f5f9', background: '#ffffff', flexShrink: 0 }}>
              <img src="https://static.wixstatic.com/media/68b92a_d71e34133826499983234774dea1945b~mv2.png/v1/fill/w_186,h_156,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/RKD-Logo.png" alt="RKD Logo" style={{ height: '36px', objectFit: 'contain', marginRight: '16px' }} />
              <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#1e293b' }}>Store Miscellaneous System</h2>
            </div>

            {/* Error notice only (moved to top of appCard) */}
            {apiError && (
              <div style={{ margin: '16px', padding: '12px 16px', background: '#fee2e2', borderRadius: '12px', color: '#ef4444', fontSize: '0.85rem', fontWeight: 800 }}>
                ⚠️ {apiError}
              </div>
            )}

            {/* Status Filter Cards */}
            <div style={{ display: 'flex', gap: '12px', padding: '16px 16px 0 16px', flexWrap: 'wrap' }}>
              <div 
                className={`${styles.statusFilterCard} ${statusFilter === "Requirement Open" ? styles.statusFilterCardActive : ''}`}
                onClick={() => setStatusFilter(statusFilter === "Requirement Open" ? null : "Requirement Open")}
              >
                <span className={styles.statusFilterNumber}>{scorecards.statusCounts.open}</span>
                <span className={styles.statusFilterText}>Requirement Open</span>
              </div>
              <div 
                className={`${styles.statusFilterCard} ${statusFilter === "Requirement Closed" ? styles.statusFilterCardActive : ''}`}
                onClick={() => setStatusFilter(statusFilter === "Requirement Closed" ? null : "Requirement Closed")}
              >
                <span className={styles.statusFilterNumber}>{scorecards.statusCounts.closed}</span>
                <span className={styles.statusFilterText}>Requirement Closed</span>
              </div>
              <div 
                className={`${styles.statusFilterCard} ${statusFilter === "Requirement Cancelled" ? styles.statusFilterCardActive : ''}`}
                onClick={() => setStatusFilter(statusFilter === "Requirement Cancelled" ? null : "Requirement Cancelled")}
              >
                <span className={styles.statusFilterNumber}>{scorecards.statusCounts.cancelled}</span>
                <span className={styles.statusFilterText}>Requirement Cancelled</span>
              </div>
            </div>

            {/* Filter Toggle Bar */}
            <div className={styles.filterToggleBar}>
              <span style={{ flex: 1, fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>
                {filtersVisible ? 'Filters visible — collapse to gain table space' : 'Filters hidden — more table rows visible'}
              </span>
              <button
                className={`${styles.filterToggleBtn} ${!filtersVisible ? styles.filterToggleBtnActive : ''}`}
                onClick={() => setFiltersVisible(v => !v)}
              >
                <span>{filtersVisible ? '🔼 Hide Filters' : '🔽 Show Filters'}</span>
              </button>
            </div>

            {/* Smart Filters — Unified Row */}
            <div className={`${styles.filterRow} ${!filtersVisible ? styles.filterRowCollapsed : ''}`}>
              <div style={{ display: 'none', gap: '8px', alignItems: 'center', flex: 1, minWidth: isListening ? '100%' : '350px', transition: 'min-width 0.3s ease' }}>

                {/* ── GEMINI VOICE ASSIST BAR ── */}
                <div style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  position: 'relative',
                  background: '#ffffff',
                  borderRadius: '24px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                  padding: '2px',
                  height: '44px',
                  overflow: 'hidden',
                  backgroundClip: 'padding-box',
                }}>
                  {/* Animated Gradient Border Layer */}
                  {(isListening || isAiParsing) && (
                    <div style={{
                      position: 'absolute',
                      top: -2, left: -2, right: -2, bottom: -2,
                      background: 'linear-gradient(90deg, #4285f4, #9b72cb, #d96570, #f4b400, #4285f4)',
                      backgroundSize: '200% 100%',
                      borderRadius: '24px',
                      zIndex: -1,
                      animation: 'geminiGradient 2s linear infinite'
                    }}></div>
                  )}

                  <div style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    background: '#ffffff',
                    borderRadius: '22px',
                    padding: '4px 8px',
                    gap: '4px'
                  }}>
                    <button
                      onClick={isListening ? undefined : startListening}
                      style={{
                        border: 'none',
                        cursor: isListening ? 'default' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        transition: 'all 0.3s ease',
                        background: isListening ? 'rgba(66, 133, 244, 0.1)' : 'transparent'
                      }}
                      title="Gemini Voice Command"
                    >
                      {isListening ? (
                        /* Gemini Animated Listening Waveform Equivalent */
                        <div style={{ display: 'flex', gap: '3px', alignItems: 'center', height: '16px' }}>
                          <div style={{ width: '4px', background: '#4285f4', borderRadius: '4px', animation: 'geminiPulse 1s ease-in-out infinite alternate', height: '8px' }}></div>
                          <div style={{ width: '4px', background: '#ea4335', borderRadius: '4px', animation: 'geminiPulse 1s ease-in-out infinite alternate 0.2s', height: '16px' }}></div>
                          <div style={{ width: '4px', background: '#fbbc05', borderRadius: '4px', animation: 'geminiPulse 1s ease-in-out infinite alternate 0.4s', height: '10px' }}></div>
                          <div style={{ width: '4px', background: '#34a853', borderRadius: '4px', animation: 'geminiPulse 1s ease-in-out infinite alternate 0.6s', height: '12px' }}></div>
                        </div>
                      ) : (
                        /* Gemini Sparkle SVG */
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M19.3 18.2C18.6 18.7 18 19.3 17.5 20L16.4 21.6C16.2 21.9 15.8 21.9 15.6 21.6L14.5 20C14 19.3 13.4 18.7 12.7 18.2L11.1 17.1C10.8 16.9 10.8 16.5 11.1 16.3L12.7 15.2C13.4 14.7 14 14.1 14.5 13.4L15.6 11.8C15.8 11.5 16.2 11.5 16.4 11.8L17.5 13.4C18 14.1 18.6 14.7 19.3 15.2L20.9 16.3C21.2 16.5 21.2 16.9 20.9 17.1L19.3 18.2ZM11.4 10.7C10.2 11.6 9 12.6 8.2 13.9L6.5 16.6C6.1 17.2 5.2 17.2 4.8 16.6L3.1 13.9C2.3 12.6 1.1 11.6 -0.1 10.7L-2.8 8.8C-3.4 8.4 -3.4 7.6 -2.8 7.2L-0.1 5.3C1.1 4.4 2.3 3.4 3.1 2.1L4.8 -0.6C5.2 -1.2 6.1 -1.2 6.5 -0.6L8.2 2.1C9 3.4 10.2 4.4 11.4 5.3L14.1 7.2C14.7 7.6 14.7 8.4 14.1 8.8L11.4 10.7Z" fill="url(#geminiGradientFill)" />
                          <defs>
                            <linearGradient id="geminiGradientFill" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                              <stop stopColor="#4285f4" />
                              <stop offset="0.33" stopColor="#9b72cb" />
                              <stop offset="0.66" stopColor="#d96570" />
                              <stop offset="1" stopColor="#f4b400" />
                            </linearGradient>
                          </defs>
                        </svg>
                      )}
                    </button>

                    <textarea
                      placeholder={isListening ? "Listening to your request..." : "Ask Gemini to manage your inventory..."}
                      className={styles.searchInput}
                      value={aiPrompt}
                      onChange={(e) => {
                        setAiPrompt(e.target.value);
                        // Reset then grow only if content wraps > 1 line
                        e.target.style.height = '30px';
                        if (e.target.scrollHeight > 36) {
                          e.target.style.height = e.target.scrollHeight + 'px';
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          processAiCommand();
                        }
                      }}
                      style={{
                        flex: 1,
                        border: 'none',
                        background: 'transparent',
                        outline: 'none',
                        color: '#1e293b',
                        fontSize: '0.9rem',
                        fontWeight: 500,
                        resize: 'none',
                        height: '28px',
                        overflow: 'hidden',
                        lineHeight: '1.5',
                        padding: '2px 4px',
                      }}
                    />

                    {/* Send Button — always visible, outside the floating textarea layer */}
                    {isAiParsing ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 300, position: 'relative' }}>
                        <Loader2 size={20} style={{ color: '#4285f4', animation: 'spin 1s linear infinite' }} />
                      </div>
                    ) : (
                      <button
                        onClick={() => processAiCommand()}
                        disabled={!aiPrompt.trim()}
                        style={{
                          background: aiPrompt.trim() ? 'linear-gradient(135deg, #4285f4, #9b72cb)' : '#f1f5f9',
                          border: 'none',
                          cursor: aiPrompt.trim() ? 'pointer' : 'default',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          flexShrink: 0,
                          transition: 'all 0.2s',
                          zIndex: 300,
                          position: 'relative',
                          boxShadow: aiPrompt.trim() ? '0 2px 8px rgba(66,133,244,0.4)' : 'none'
                        }}
                        title="Send to Gemini"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={aiPrompt.trim() ? '#fff' : '#cbd5e1'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="22" y1="2" x2="11" y2="13"></line>
                          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                <div className={styles.searchBox}>
                  <Search className={styles.searchIcon} size={14} />
                  <input
                    type="text"
                    placeholder="Search..."
                    className={styles.searchInput}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              <button
                className={styles.dribbbleBtnSecondary}
                style={{ padding: '8px 12px', fontSize: '0.75rem', fontWeight: 600, border: '1px dashed #cbd5e1' }}
                onClick={() => {
                  setSearchTerm("");
                  setSelDateFilter(dateOptions[3]); // Reset to Last 30 Days default
                  setSelRKDNum(null); setSelPerson(null); setSelItem(null);
                  setSelDept(null); setSelMachine(null); setSelMachineID(null);
                  setStatusFilter(null);
                }}
              >
                Clear All Filters
              </button>

              <Select
                instanceId="date-filter"
                options={dateOptions}
                value={selDateFilter}
                onChange={setSelDateFilter}
                styles={makeSelectStyles(110)}
                isSearchable={false}
                className={styles.selectWrap}
              />
              {selDateFilter?.value === "custom" && (
                <div className={styles.customDateInputs}>
                  <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className={styles.dateInput} />
                  <span className={styles.dateTo}>to</span>
                  <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className={styles.dateInput} />
                </div>
              )}

              <Select instanceId="rkd-filter" options={rkdOptions} value={selRKDNum} onChange={v => { setSelRKDNum(v); setSelPerson(null); setSelItem(null); setSelDept(null); setSelMachine(null); setSelMachineID(null); }} styles={ss} placeholder="All RKD Numbers" isClearable className={styles.selectWrap} />
              <Select instanceId="person-filter" options={personOptions} value={selPerson} onChange={v => { setSelPerson(v); setSelItem(null); setSelDept(null); setSelMachine(null); setSelMachineID(null); }} styles={ss} placeholder="All Persons" isClearable className={styles.selectWrap} />
              <Select instanceId="item-filter" options={itemOptions} value={selItem} onChange={v => { setSelItem(v); setSelDept(null); setSelMachine(null); setSelMachineID(null); }} styles={ss} placeholder="All Items" isClearable className={styles.selectWrap} />
              <Select instanceId="dept-filter" options={deptOptions} value={selDept} onChange={v => { setSelDept(v); setSelMachine(null); setSelMachineID(null); }} styles={ss} placeholder="All Departments" isClearable className={styles.selectWrap} />
              <Select instanceId="machine-filter" options={machineOptions} value={selMachine} onChange={v => { setSelMachine(v); setSelMachineID(null); }} styles={ss} placeholder="All Machines" isClearable className={styles.selectWrap} />
              <Select instanceId="machineid-filter" options={machineIDOptions} value={selMachineID} onChange={setSelMachineID} styles={ss} placeholder="All Machine IDs" isClearable className={styles.selectWrap} />
            </div>

            {/* Table */}
            <div
              ref={fullScreenRef}
              style={isFullScreen ? {
                backgroundColor: '#f1f5f9',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                width: '100vw',
                height: '100vh',
                overflow: 'hidden'
              } : { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
            >
              {isFullScreen && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h2 style={{ margin: 0, fontFamily: "'Outfit', sans-serif", fontSize: '1.8rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.4rem' }}>🔴 LIVE</span> Data Dashboard
                  </h2>
                  <button onClick={toggleFullScreen} className={styles.dribbbleBtnPrimary} style={{ background: '#ef4444', color: 'white', border: 'none', boxShadow: '0 4px 14px rgba(239,68,68,0.4)', padding: '10px 20px', fontSize: '1rem' }}>
                    Exit Full Screen ✖
                  </button>
                </div>
              )}
              <div className={styles.tableScrollArea} style={isFullScreen ? { flex: 1, maxHeight: 'none', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' } : {}}>
                {loading ? (
                  <div className={styles.loaderCenter}>
                    <Loader2 className={styles.spinnerIcon} size={32} />
                    <p>Syncing Database...</p>
                  </div>
                ) : (
                  <table className={styles.dataTable}>
                    <thead>
                      <tr>
                        <th className={styles.stickyCol}>Timestamp</th>
                        <th>Store RKD Number</th>
                        <th>Person Filling Name</th>
                        <th>Item Name</th>
                        <th>Require Qty</th>
                        <th>Issue Qty</th>
                        <th>Units</th>
                        <th>Department</th>
                        <th>Machine Name</th>
                        <th>Machine ID</th>
                        <th>Rate (₹)</th>
                        <th>Stock in Store</th>
                        <th>Status</th>
                        <th>Live Status</th>
                        {(!statusFilter || statusFilter === "Requirement Open") && <th className={styles.actionCol}>Action</th>}
                      </tr>
                    </thead>
                    <tbody className={styles.dataTableBody}>
                      {filteredData.map((row, idx) => {
                        const itemKey = (row["Item Name"] || "").trim().toLowerCase();
                        const imsStock = stockMap[itemKey];
                        const stockNum = imsStock !== undefined ? Number(imsStock) : NaN;
                        const reqNum = Number(row["Require Qty"]) || 0;
                        const isLow = !isNaN(stockNum) && stockNum < reqNum;
                        const isUnknown = imsStock === undefined;

                        const status = String(row["Status"] || "").trim();
                        let statusClass = "";
                        if (status === "Requirement Open") statusClass = styles.rowOpen;
                        else if (status === "Requirement Closed") statusClass = styles.rowClosed;
                        else if (status === "Requirement Cancelled") statusClass = styles.rowCancelled;

                        return (
                          <tr
                            key={idx}
                            style={{ animationDelay: idx < 50 ? `${(idx % 50) * 0.02}s` : '0s' }}
                            className={`${idx < 50 ? styles.tableRowFadeIn : ""} ${statusClass}`}
                          >
                            <td className={statusClass ? styles.colWhite : styles.colMuted}>{row["Timestamp"] || "-"}</td>
                            <td onClick={() => {
                              if (status === "Requirement Open") {
                                const itemKey = (row["Item Name"] || "").trim().toLowerCase();
                                const misc = miscMap[itemKey] || { vendor: "", rate: "" };
                                setEditMasterRow(row);
                                setEmUnit(row["Units"] || "");
                                setEmPrice(misc.rate || "");
                                setEmVendor(misc.vendor || "");
                                setEmMinQty("");
                                setEmSafety("");
                                setEmGst("");
                                setEmRack("");
                                setIsEditMasterOpen(true);
                                fetchMetaOpts();
                              }
                            }}>
                              <span
                                className={`${styles.pillId} ${(isLow && status === "Requirement Open") ? styles.pillIdLowStock : ""}`}
                                style={{ cursor: status === "Requirement Open" ? "pointer" : "default" }}
                                title={status === "Requirement Open" ? "Edit Item Master Data" : ""}
                              >
                                {row["Store RKD Number"] || "-"}
                              </span>
                            </td>
                            <td>{row["Person Filling Name"] || "-"}</td>
                            <td className={styles.colBold}>{row["Item Name"] || "-"}</td>
                            <td><span className={styles.pillReq}>{row["Require Qty"] || "0"}</span></td>
                            <td><span className={styles.pillIss}>{row["Issue Qty"] || "0"}</span></td>
                            <td className={styles.colMuted}>{row["Units"] || "-"}</td>
                            <td>{row["Department"] || "-"}</td>
                            <td>{row["Machine Name"] || "-"}</td>
                            <td className={styles.colMuted}>{row["Machine ID"] || "-"}</td>
                            <td className={styles.colMuted}>{row["Price"] || "-"}</td>
                            <td>
                              <span className={`${styles.pillStock} ${isUnknown ? styles.stockUnknown : isLow ? styles.stockDanger : styles.stockSafe}`}>
                                {isUnknown ? "No Stock" : imsStock}
                              </span>
                            </td>
                            <td className={styles.colBold}>{row["Status"] || "-"}</td>
                            <td>
                              {(() => {
                                const steps = getLiveStatus(row, stockMap, poMap, inwardMap);
                                return (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '120px' }}>
                                    {steps.map((ls, i) => (
                                      <span key={i} style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '2px 8px',
                                        borderRadius: '20px',
                                        fontSize: '0.68rem',
                                        fontWeight: 700,
                                        letterSpacing: '0.2px',
                                        background: ls.bg,
                                        border: `1px solid ${ls.border}`,
                                        color: ls.color,
                                        whiteSpace: 'nowrap',
                                      }}>
                                        <span style={{ fontSize: '0.7rem' }}>{ls.emoji}</span>
                                        <span>{ls.label}</span>
                                      </span>
                                    ))}
                                  </div>
                                );
                              })()}
                            </td>
                            {(!statusFilter || statusFilter === "Requirement Open") && (
                              <td className={styles.actionCell}>
                                {row["Status"] === "Requirement Open" && (
                                  <>
                                    <div className={styles.actionGroup}>
                                      <span className={styles.groupLabel}>Issue</span>
                                      <div className={styles.groupButtons}>
                                        <button
                                          className={styles.directIssueBtn}
                                          onClick={() => handleDirectIssue(row)}
                                          disabled={updatingRowId === row._id}
                                          title="Instant Issue"
                                        >
                                          {updatingRowId === row._id ? (
                                            <Loader2 className={styles.btnSpin} size={14} />
                                          ) : (
                                            <Zap size={14} fill="currentColor" />
                                          )}
                                        </button>
                                        <button
                                          className={styles.manualIssueBtn}
                                          onClick={() => { setManualRow(row); setIsManualModalOpen(true); }}
                                          disabled={updatingRowId === row._id}
                                          title="Manual Issue"
                                        >
                                          <Send size={14} fill="currentColor" />
                                        </button>
                                        <button
                                          className={styles.manualIssueBtn}
                                          style={{ backgroundColor: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', marginLeft: '4px' }}
                                          onClick={() => handleRowRefresh(row)}
                                          disabled={updatingRowId === row._id}
                                          title="Refresh Vendor Rate"
                                        >
                                          <RefreshCw size={14} />
                                        </button>
                                      </div>
                                    </div>

                                    {(() => {
                                      const appReq = String(row["Approval Require?"] || "").trim().toLowerCase();
                                      const appQty = parseFloat(String(row["Approved Quantity"] || "0"));
                                      const isApprovalDone = (appReq === "no" || appReq === "नहीं") || ((appReq === "yes" || appReq === "हाँ") && appQty > 0);

                                      if (isApprovalDone) return null;

                                      return (
                                        <div className={styles.actionGroup}>
                                          <span className={styles.groupLabel}>Approval</span>
                                          <div className={styles.groupButtons}>
                                            <button
                                              className={styles.instantApprovalBtn}
                                              onClick={() => handleInstantApproval(row)}
                                              disabled={updatingRowId === row._id}
                                              title="Instant Approval"
                                            >
                                              {updatingRowId === row._id ? (
                                                <Loader2 className={styles.btnSpin} size={14} />
                                              ) : (
                                                <CheckCircle size={14} />
                                              )}
                                            </button>
                                            <button
                                              className={styles.manualApprovalBtn}
                                              onClick={() => {
                                                setManualRow(row);
                                                setIsManualApprovalModalOpen(true);
                                              }}
                                              disabled={updatingRowId === row._id}
                                              title="Manual Approval"
                                            >
                                              <UserCheck size={14} />
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                      {/* Connecting / Retry State — show spinner not error */}
                      {apiError && (apiError.includes("retry") || apiError.includes("Connecting") || apiError.includes("Slow")) && filteredData.length === 0 && (
                        <tr>
                          <td colSpan={(!statusFilter || statusFilter === "Requirement Open") ? 13 : 12} className={styles.noDataCell}>
                            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: '#ec4899' }} />
                            <p style={{ color: '#64748b', marginTop: 8 }}>{apiError}</p>
                          </td>
                        </tr>
                      )}
                      {/* Hard Error — show only if not a retry and no data */}
                      {apiError && !apiError.includes("retry") && !apiError.includes("Connecting") && !apiError.includes("Slow") && filteredData.length === 0 && (
                        <tr>
                          <td colSpan={(!statusFilter || statusFilter === "Requirement Open") ? 13 : 12} className={styles.noDataCell} style={{ color: '#ef4444' }}>
                            <p>⚠️ {apiError}</p>
                            <button onClick={() => fetchData(true)} className={styles.statusBtn} style={{ marginTop: '10px' }}>Retry</button>
                          </td>
                        </tr>
                      )}
                      {/* Empty state — only after first successful load */}
                      {!apiError && hasLoadedOnce.current && filteredData.length === 0 && (
                        <tr>
                          <td colSpan={(!statusFilter || statusFilter === "Requirement Open") ? 13 : 12} className={styles.noDataCell}>
                            <Filter size={32} />
                            <p>No matching records found.</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
              {/* Modern Modal */}
              <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={modalTitle}
                message={modalMsg}
                data={modalData}
              />

              {/* Manual Issue Modal */}
              <ManualIssueModal
                isOpen={isManualModalOpen}
                onClose={() => setIsManualModalOpen(false)}
                row={manualRow}
                onSubmit={handleManualSubmit}
                updating={updatingRowId !== null && manualRow && updatingRowId === manualRow._id}
                stockMap={stockMap}
              />

              {/* Manual Approval Modal */}
              <ManualApprovalModal
                isOpen={isManualApprovalModalOpen}
                onClose={() => setIsManualApprovalModalOpen(false)}
                row={manualRow}
                onSubmit={handleManualApprovalSubmit}
                updating={updatingRowId !== null && manualRow && updatingRowId === manualRow._id}
                miscMap={miscMap}
                isRefreshing={updatingRowId === manualRow?._id}
                onRefresh={() => handleRowRefresh(manualRow)}
              />

              {/* Instant Approval Modal */}
              <InstantApprovalModal
                isOpen={isInstantApproveModalOpen}
                onClose={() => setIsInstantApproveModalOpen(false)}
                row={instantApproveRow}
                onSubmit={submitInstantApproval}
                updating={updatingRowId !== null && instantApproveRow && updatingRowId === instantApproveRow._id}
                iaVendor={iaVendor}
                setIaVendor={setIaVendor}
                iaRate={iaRate}
                setIaRate={setIaRate}
                isRefreshing={updatingRowId === instantApproveRow?._id}
                onRefresh={() => handleRowRefresh(instantApproveRow)}
              />

              {/* ─── Debit Note Modal ─── */}
              {isDebitNoteOpen && (
                <div className={styles.modalOverlay} onClick={() => setIsDebitNoteOpen(false)}>
                  <div className={styles.modalContent} onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                    <div className={styles.modalHeader}>
                      <div className={styles.modalIconBox} style={{ background: 'linear-gradient(135deg,#fee2e2,#fecaca)', color: '#dc2626' }}>
                        <span style={{ fontSize: '2rem' }}>📄</span>
                      </div>
                    </div>
                    <h3 className={styles.modalTitle}>Debit Note Entry</h3>
                    <p className={styles.modalMessage}>Select RKD Number and enter Debit Note Qty <span style={{ color: '#dc2626', fontWeight: 700 }}>(≤ Required Qty)</span></p>

                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>🔖 Select RKD Store Number <span style={{ color: '#dc2626', fontSize: '0.75rem' }}>(Requirement Closed only)</span></label>
                      <SearchableRKDSelect
                        data={data}
                        value={dnSelectedRKD}
                        onChange={(row: any) => { setDnSelectedRKD(row); setDnQty(row["Debit Note Qty"] || ""); }}
                        placeholder="Search RKD Number or Item..."
                      />
                    </div>

                    {dnSelectedRKD && (
                      <div className={styles.formInfoBox} style={{ margin: '0 0 16px 0' }}>
                        <div className={styles.modalInfoItem}><span className={styles.modalLabel}>Item:</span><span className={styles.modalValue}>{dnSelectedRKD["Item Name"]}</span></div>
                        <div className={styles.modalInfoItem}><span className={styles.modalLabel}>Person:</span><span className={styles.modalValue}>{dnSelectedRKD["Person Filling Name"]}</span></div>
                        <div className={styles.modalInfoItem}><span className={styles.modalLabel}>Required Qty:</span><span className={styles.modalValue} style={{ color: '#dc2626', fontWeight: 700 }}>{dnSelectedRKD["Require Qty"]} {dnSelectedRKD["Units"]}</span></div>
                        <div className={styles.modalInfoItem}><span className={styles.modalLabel}>Issue Qty:</span><span className={styles.modalValue}>{dnSelectedRKD["Issue Qty"] || "—"}</span></div>
                      </div>
                    )}

                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>✏️ Debit Note Qty <span style={{ color: '#dc2626', fontSize: '0.75rem' }}>(Max: {dnSelectedRKD?.["Require Qty"] || "—"})</span></label>
                      <input
                        type="number"
                        className={styles.formInput}
                        value={dnQty}
                        onChange={e => setDnQty(e.target.value)}
                        placeholder="Enter debit note quantity"
                        max={dnSelectedRKD?.["Require Qty"]}
                        disabled={!dnSelectedRKD}
                      />
                    </div>

                    <button
                      className={styles.dribbbleBtnPrimary}
                      style={{ width: '100%', justifyContent: 'center' }}
                      disabled={columnUpdating || !dnSelectedRKD || !dnQty}
                      onClick={() => handleColumnUpdate(dnSelectedRKD["Store RKD Number"], "S", dnQty, dnSelectedRKD["Require Qty"])}
                    >
                      {columnUpdating ? <Loader2 className={styles.btnSpin} size={18} /> : <span>💾</span>}
                      <span>Save Debit Note</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ─── Reverse Entry Modal ─── */}
              {isReverseEntryOpen && (
                <div className={styles.modalOverlay} onClick={() => setIsReverseEntryOpen(false)}>
                  <div className={styles.modalContent} onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                    <div className={styles.modalHeader}>
                      <div className={styles.modalIconBox} style={{ background: 'linear-gradient(135deg,#ede9fe,#ddd6fe)', color: '#7c3aed' }}>
                        <span style={{ fontSize: '2rem' }}>↩️</span>
                      </div>
                    </div>
                    <h3 className={styles.modalTitle}>Reverse Entry</h3>
                    <p className={styles.modalMessage}>Select RKD Number and enter Reverse Entry Qty <span style={{ color: '#7c3aed', fontWeight: 700 }}>(≤ Required Qty)</span></p>

                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>🔖 Select RKD Store Number <span style={{ color: '#7c3aed', fontSize: '0.75rem' }}>(Requirement Closed only)</span></label>
                      <SearchableRKDSelect
                        data={data}
                        value={reSelectedRKD}
                        onChange={(row: any) => { setReSelectedRKD(row); setReQty(row["Reverse Entry Qty"] || ""); }}
                        placeholder="Search RKD Number or Item..."
                      />
                    </div>

                    {reSelectedRKD && (
                      <div className={styles.formInfoBox} style={{ margin: '0 0 16px 0' }}>
                        <div className={styles.modalInfoItem}><span className={styles.modalLabel}>Item:</span><span className={styles.modalValue}>{reSelectedRKD["Item Name"]}</span></div>
                        <div className={styles.modalInfoItem}><span className={styles.modalLabel}>Person:</span><span className={styles.modalValue}>{reSelectedRKD["Person Filling Name"]}</span></div>
                        <div className={styles.modalInfoItem}><span className={styles.modalLabel}>Required Qty:</span><span className={styles.modalValue} style={{ color: '#7c3aed', fontWeight: 700 }}>{reSelectedRKD["Require Qty"]} {reSelectedRKD["Units"]}</span></div>
                        <div className={styles.modalInfoItem}><span className={styles.modalLabel}>Issue Qty:</span><span className={styles.modalValue}>{reSelectedRKD["Issue Qty"] || "—"}</span></div>
                      </div>
                    )}

                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>✏️ Reverse Entry Qty <span style={{ color: '#7c3aed', fontSize: '0.75rem' }}>(Max: {reSelectedRKD?.["Require Qty"] || "—"})</span></label>
                      <input
                        type="number"
                        className={styles.formInput}
                        value={reQty}
                        onChange={e => setReQty(e.target.value)}
                        placeholder="Enter reverse entry quantity"
                        max={reSelectedRKD?.["Require Qty"]}
                        disabled={!reSelectedRKD}
                      />
                    </div>

                    <button
                      className={styles.dribbbleBtnPrimary}
                      style={{ width: '100%', justifyContent: 'center' }}
                      disabled={columnUpdating || !reSelectedRKD || !reQty}
                      onClick={() => handleColumnUpdate(reSelectedRKD["Store RKD Number"], "T", reQty, reSelectedRKD["Require Qty"])}
                    >
                      {columnUpdating ? <Loader2 className={styles.btnSpin} size={18} /> : <span>💾</span>}
                      <span>Save Reverse Entry</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ── Edit Item Master Modal ── */}
              {isEditMasterOpen && editMasterRow && (
                <div className={styles.modalOverlay} onClick={() => setIsEditMasterOpen(false)}>
                  <div className={styles.modalContent} onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                    <div className={styles.modalHeader}>
                      <div className={styles.modalIconBox} style={{ background: '#f5f3ff', color: '#8b5cf6' }}>
                        📦
                      </div>
                      <div>
                        <h3 className={styles.modalTitle}>Edit Master Data</h3>
                        <p className={styles.modalSubtitle}>Update item details in Data tab</p>
                      </div>
                      <button className={styles.modalCloseBtn} onClick={() => setIsEditMasterOpen(false)}>×</button>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Item Name <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>(Read-only)</span></label>
                      <input type="text" className={styles.formInput} value={editMasterRow["Item Name"]} disabled style={{ background: '#f1f5f9', color: '#64748b' }} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                      <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                        <label className={styles.formLabel}>Unit</label>
                        <input type="text" list="emUnitsList" className={styles.formInput} value={emUnit} onChange={e => setEmUnit(e.target.value)} placeholder="Select/Add" />
                        <datalist id="emUnitsList">{metaOpts.units.map(u => <option key={u} value={u} />)}</datalist>
                      </div>
                      <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                        <label className={styles.formLabel}>Price Per Unit (₹)</label>
                        <input type="number" className={styles.formInput} value={emPrice} onChange={e => setEmPrice(e.target.value)} placeholder="0.00" />
                      </div>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Party Name (Vendor)</label>
                      <input type="text" list="emVendorsList" className={styles.formInput} value={emVendor} onChange={e => setEmVendor(e.target.value)} placeholder="Select/Add Vendor" />
                      <datalist id="emVendorsList">{metaOpts.vendors.map(v => <option key={v} value={v} />)}</datalist>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                      <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                        <label className={styles.formLabel}>Min Qty</label>
                        <input type="number" className={styles.formInput} value={emMinQty} onChange={e => setEmMinQty(e.target.value)} placeholder="0" />
                      </div>
                      <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                        <label className={styles.formLabel}>Safety Factor</label>
                        <input type="number" className={styles.formInput} value={emSafety} onChange={e => setEmSafety(e.target.value)} placeholder="0" />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                      <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                        <label className={styles.formLabel}>GST</label>
                        <select className={styles.formInput} value={emGst} onChange={e => setEmGst(e.target.value)}>
                          <option value="">Select</option>
                          <option value="0%">0%</option>
                          <option value="5%">5%</option>
                          <option value="12%">12%</option>
                          <option value="18%">18%</option>
                          <option value="28%">28%</option>
                        </select>
                      </div>
                      <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                        <label className={styles.formLabel}>Rack No</label>
                        <input type="text" className={styles.formInput} value={emRack} onChange={e => setEmRack(e.target.value)} placeholder="Rack No" />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button className={styles.dribbbleBtnPrimary} style={{ flex: 1, justifyContent: 'center' }} disabled={emSubmitting} onClick={handleEditMasterSave}>
                        {emSubmitting ? <Loader2 className={styles.btnSpin} size={18} /> : <span>💾</span>}
                        <span>Save Master Data</span>
                      </button>
                    </div>
                    <div style={{ marginTop: '16px', textAlign: 'center' }}>
                      <a href="/indent" target="_blank" style={{ fontSize: '0.85rem', color: '#3b82f6', textDecoration: 'none', fontWeight: 500 }}>
                        + Add New Item to Master
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* ── AI Agent Interface Modal (Gemini Theme) ── */}
              {aiReviewOpen && aiPayload && (
                <div className={styles.modalOverlay} onClick={() => setAiReviewOpen(false)}>
                  <div className={styles.modalContent} onClick={e => e.stopPropagation()} style={{
                    maxWidth: '900px',
                    width: '90%',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '90vh',
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(248,250,252,0.95) 100%)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255,255,255,0.5)',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 20px rgba(66, 133, 244, 0.1)',
                    overflow: 'hidden'
                  }}>
                    {/* Top Gemini Gradient Line */}
                    <div style={{ height: '4px', width: '100%', background: 'linear-gradient(90deg, #4285f4, #9b72cb, #d96570, #f4b400)', position: 'absolute', top: 0, left: 0 }}></div>

                    <div className={styles.modalHeader} style={{ borderBottom: 'none', paddingBottom: '0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M19.3 18.2C18.6 18.7 18 19.3 17.5 20L16.4 21.6C16.2 21.9 15.8 21.9 15.6 21.6L14.5 20C14 19.3 13.4 18.7 12.7 18.2L11.1 17.1C10.8 16.9 10.8 16.5 11.1 16.3L12.7 15.2C13.4 14.7 14 14.1 14.5 13.4L15.6 11.8C15.8 11.5 16.2 11.5 16.4 11.8L17.5 13.4C18 14.1 18.6 14.7 19.3 15.2L20.9 16.3C21.2 16.5 21.2 16.9 20.9 17.1L19.3 18.2ZM11.4 10.7C10.2 11.6 9 12.6 8.2 13.9L6.5 16.6C6.1 17.2 5.2 17.2 4.8 16.6L3.1 13.9C2.3 12.6 1.1 11.6 -0.1 10.7L-2.8 8.8C-3.4 8.4 -3.4 7.6 -2.8 7.2L-0.1 5.3C1.1 4.4 2.3 3.4 3.1 2.1L4.8 -0.6C5.2 -1.2 6.1 -1.2 6.5 -0.6L8.2 2.1C9 3.4 10.2 4.4 11.4 5.3L14.1 7.2C14.7 7.6 14.7 8.4 14.1 8.8L11.4 10.7Z" fill="url(#geminiGradientModal)" />
                          <defs>
                            <linearGradient id="geminiGradientModal" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                              <stop stopColor="#4285f4" />
                              <stop offset="0.33" stopColor="#9b72cb" />
                              <stop offset="0.66" stopColor="#d96570" />
                              <stop offset="1" stopColor="#f4b400" />
                            </linearGradient>
                          </defs>
                        </svg>
                        <div>
                          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, background: 'linear-gradient(90deg, #1e293b, #334155)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>Gemini Store Analyst</h3>
                        </div>
                      </div>
                      <button className={styles.modalCloseBtn} onClick={() => setAiReviewOpen(false)}>×</button>
                    </div>

                    {/* User Prompt Bubble */}
                    <div style={{ alignSelf: 'flex-end', background: '#f1f5f9', padding: '10px 16px', borderRadius: '20px 20px 0 20px', margin: '16px 0', maxWidth: '80%', fontSize: '0.9rem', color: '#1e293b' }}>
                      {aiPayload.originalText}
                    </div>

                    {/* AI Analysis Bubble */}
                    <div style={{ alignSelf: 'flex-start', background: 'transparent', padding: '0 0 16px 8px', maxWidth: '100%', fontSize: '0.95rem', color: '#334155', lineHeight: 1.6, animation: 'fadeIn 0.5s ease' }}>
                      {aiPayload.analysis}
                      {aiPayload.suggestedFilters && Object.values(aiPayload.suggestedFilters).some(v => v !== null && v !== "") && (
                        <div style={{ marginTop: '12px' }}>
                          <button
                            onClick={() => {
                              const f = aiPayload.suggestedFilters;
                              if (f?.dateFilter && f.dateFilter !== "null") setSelDateFilter({ label: f.dateFilter, value: f.dateFilter });
                              if (f?.statusFilter && f.statusFilter !== "null") setStatusFilter(f.statusFilter);
                              if (f?.personFilter && f.personFilter !== "null") setSelPerson({ label: f.personFilter, value: f.personFilter });
                              setAiReviewOpen(false);
                            }}
                            style={{
                              background: 'rgba(66, 133, 244, 0.1)', border: '1px solid rgba(66, 133, 244, 0.3)',
                              color: '#4285f4', padding: '6px 12px', borderRadius: '6px', fontSize: '0.85rem',
                              fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
                              gap: '6px', transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(66, 133, 244, 0.2)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(66, 133, 244, 0.1)'; }}
                          >
                            🎯 View Results in Main Table
                          </button>
                        </div>
                      )}
                    </div>

                    {/* AI Scorecard Panel — shown when AI returns aggregate data */}
                    {(aiPayload as any).scorecard && (aiPayload as any).scorecard.total > 0 && (
                      <div style={{ marginBottom: '16px', animation: 'fadeIn 0.5s ease' }}>
                        {/* Stat Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '14px' }}>
                          {[
                            { label: 'Total', value: (aiPayload as any).scorecard.total, color: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
                            { label: 'Open', value: (aiPayload as any).scorecard.open, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
                            { label: 'Closed', value: (aiPayload as any).scorecard.closed, color: '#22c55e', bg: 'rgba(34,197,94,0.08)' },
                            { label: 'Cancelled', value: (aiPayload as any).scorecard.cancelled, color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
                          ].map(sc => (
                            <div key={sc.label} style={{ background: sc.bg, border: `1px solid ${sc.color}33`, borderRadius: '10px', padding: '10px 14px', textAlign: 'center' }}>
                              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: sc.color, lineHeight: 1 }}>{sc.value}</div>
                              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', fontWeight: 600 }}>{sc.label}</div>
                            </div>
                          ))}
                        </div>
                        {/* Top People & Items */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          {(aiPayload as any).scorecard.byPerson && Object.keys((aiPayload as any).scorecard.byPerson).length > 0 && (
                            <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '12px 14px', border: '1px solid #e2e8f0' }}>
                              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>👤 Top Persons</div>
                              {Object.entries((aiPayload as any).scorecard.byPerson).map(([name, count]: any) => (
                                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#334155', padding: '3px 0', borderBottom: '1px solid #f1f5f9' }}>
                                  <span>{name}</span><span style={{ fontWeight: 700, color: '#6366f1' }}>{count}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {(aiPayload as any).scorecard.byItem && Object.keys((aiPayload as any).scorecard.byItem).length > 0 && (
                            <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '12px 14px', border: '1px solid #e2e8f0' }}>
                              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📦 Top Items</div>
                              {Object.entries((aiPayload as any).scorecard.byItem).map(([item, count]: any) => (
                                <div key={item} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#334155', padding: '3px 0', borderBottom: '1px solid #f1f5f9' }}>
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '130px' }}>{item}</span>
                                  <span style={{ fontWeight: 700, color: '#6366f1' }}>{count}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* For ACTION queries only: show the review table */}
                    {aiPayload.intent === "ACTION" && aiPayload.targets.length > 0 && (
                      <div style={{ flex: 1, overflowY: 'auto', border: '1px solid rgba(226, 232, 240, 0.6)', borderRadius: '12px', marginBottom: '20px', background: '#ffffff', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                          <thead style={{ background: 'rgba(248, 250, 252, 0.8)', backdropFilter: 'blur(4px)', position: 'sticky', top: 0, zIndex: 1 }}>
                            <tr>
                              <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600 }}>RKD Number</th>
                              <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600 }}>Item Name</th>
                              <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600 }}>Status</th>
                              <th style={{ padding: '12px 16px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600 }}>Action</th>
                              <th style={{ padding: '12px 16px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600 }}>Exclude</th>
                            </tr>
                          </thead>
                          <tbody>
                            {aiPayload.targets.map(row => (
                              <tr key={row["Store RKD Number"]} style={{ borderBottom: '1px solid #f8fafc' }}>
                                <td style={{ padding: '10px 16px', color: '#475569', fontSize: '0.8rem' }}>{row["Store RKD Number"]}</td>
                                <td style={{ padding: '10px 16px', fontWeight: 600, color: '#1e293b' }}>{row["Item Name"]}</td>
                                <td style={{ padding: '10px 16px' }}>
                                  <span style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', color: '#64748b' }}>{row["Status"]}</span>
                                </td>
                                <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                                  <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, background: row._aiProposedAction === "CLOSE" ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: row._aiProposedAction === "CLOSE" ? '#16a34a' : '#dc2626' }}>
                                    {row._aiProposedAction}
                                  </span>
                                </td>
                                <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                                  <button onClick={() => setAiPayload({ ...aiPayload, targets: aiPayload.targets.filter(r => r["Store RKD Number"] !== row["Store RKD Number"]) })} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1.1rem' }} title="Remove">🗑️</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid rgba(226, 232, 240, 0.5)' }}>
                      <button
                        onClick={() => setAiReviewOpen(false)}
                        style={{ background: 'transparent', border: '1px solid #cbd5e1', padding: '10px 20px', borderRadius: '8px', color: '#64748b', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        {aiPayload.intent === "VIEW" ? "Done" : "Cancel"}
                      </button>
                      {aiPayload.intent === "ACTION" && (
                        <button
                          disabled={aiPayload.targets.length === 0}
                          onClick={executeAiBulkAction}
                          style={{
                            background: aiPayload.targets.length === 0 ? '#cbd5e1' : 'linear-gradient(90deg, #4285f4, #9b72cb, #d96570)',
                            border: 'none', padding: '10px 24px', borderRadius: '8px', color: '#fff', fontWeight: 600,
                            cursor: aiPayload.targets.length === 0 ? 'not-allowed' : 'pointer',
                            boxShadow: aiPayload.targets.length === 0 ? 'none' : '0 4px 12px rgba(155, 114, 203, 0.3)',
                            transition: 'all 0.2s', opacity: aiPayload.targets.length === 0 ? 0.7 : 1
                          }}
                        >
                          Execute Actions ({aiPayload.targets.length})
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ✨ AI Processing "Please Wait" Overlay */}
              {isAiParsing && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.55)', zIndex: 99998, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
                  <div style={{ background: '#fff', borderRadius: '20px', padding: '40px 48px', textAlign: 'center', boxShadow: '0 24px 64px rgba(0,0,0,0.2)', maxWidth: '340px', width: '90%' }}>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '24px' }}>
                      {['#4285f4', '#ea4335', '#fbbc05', '#34a853'].map((c, i) => (
                        <div key={c} style={{ width: '14px', height: '14px', borderRadius: '50%', background: c, animation: 'geminiPulse 1s ease-in-out infinite alternate', animationDelay: `${i * 0.2}s` }} />
                      ))}
                    </div>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1e293b', margin: '0 0 8px' }}>Gemini is Analyzing...</h3>
                    <p style={{ fontSize: '0.9rem', color: '#64748b', margin: 0, lineHeight: 1.5 }}>Processing your command against the last 60 days of store data.</p>
                  </div>
                </div>
              )}

              {/* ── AI Background Execution Overlay ── */}
              {aiExecutionProgress.active && (

                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255,255,255,0.8)', zIndex: 99999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                  <Loader2 className={styles.btnSpin} size={48} style={{ color: '#8b5cf6', marginBottom: 16 }} />
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>AI Executing Action</h2>
                  <p style={{ fontSize: '1rem', color: '#64748b', marginTop: 8 }}>
                    Processing entry {aiExecutionProgress.current} of {aiExecutionProgress.total}...
                  </p>
                  <div style={{ width: '300px', height: '8px', background: '#e2e8f0', borderRadius: '4px', marginTop: '24px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: '#8b5cf6', width: `${(aiExecutionProgress.current / aiExecutionProgress.total) * 100}%`, transition: 'width 0.3s' }}></div>
                  </div>
                </div>
              )}

              {/* Modern Alert Modal — replaces all browser alert() */}
              <AlertModal
                isOpen={alertModal.open}
                onClose={() => setAlertModal(a => ({ ...a, open: false }))}
                message={alertModal.msg}
                type={alertModal.type}
              />

            </div>
          </div>
        </div>
      </div>


    </div>
  );
}
