"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import styles from "./page.module.css";
import { Search, Loader2, Filter, Package, Hash, Zap, Send, CheckCircle, UserCheck } from "lucide-react";
import Select from "react-select";
import { subDays, subMonths, isWithinInterval, startOfDay, endOfDay, isSameDay, isSameMonth } from "date-fns";

const monthMap: Record<string, number> = {
  "जनवरी": 0, "फरवरी": 1, "मार्च": 2, "अप्रैल": 3, "मई": 4, "जून": 5,
  "जुलाई": 6, "अगस्त": 7, "सितंबर": 8, "अक्टूबर": 9, "नवंबर": 10, "दिसंबर": 11,
  "january": 0, "february": 1, "march": 2, "april": 3, "may": 4, "june": 5,
  "july": 6, "august": 7, "september": 8, "october": 9, "november": 10, "december": 11,
  "jan": 0, "feb": 1, "mar": 2, "apr": 3, "jun": 5,
  "jul": 6, "aug": 7, "sep": 8, "oct": 9, "nov": 10, "dec": 11
};

function parseCustomDate(dateStr: string): Date {
  if (!dateStr) return new Date(0);
  
  // Try native parsing first
  let d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;

  // Split by anything that isn't a word character or a Hindi character
  const parts = dateStr.split(/[^\w\u0900-\u097F]+/);
  if (parts.length >= 3) {
    let day = NaN, month = NaN, year = NaN;

    // 1. Find Year (4 digits)
    const yearIdx = parts.findIndex(p => p.length === 4 && !isNaN(parseInt(p, 10)));
    if (yearIdx !== -1) {
      year = parseInt(parts[yearIdx], 10);
      // Remove year from parts to find day/month
      const otherParts = parts.filter((_, i) => i !== yearIdx);
      
      // 2. Find Month (either name or number)
      for (let i = 0; i < otherParts.length; i++) {
        const p = otherParts[i].toLowerCase();
        if (monthMap[p] !== undefined) {
          month = monthMap[p];
          day = parseInt(otherParts[1-i], 10);
          break;
        }
      }

      // If month still NaN, try to find numeric month
      if (isNaN(month) && otherParts.length >= 2) {
        const p0 = parseInt(otherParts[0], 10);
        const p1 = parseInt(otherParts[1], 10);
        // Ambiguity: DD-MM vs MM-DD. Assume DD-MM for this system.
        if (p1 >= 1 && p1 <= 12) {
          month = p1 - 1;
          day = p0;
        } else if (p0 >= 1 && p0 <= 12) {
          month = p0 - 1;
          day = p1;
        }
      }
    }
    
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      return new Date(year, month, day);
    }
  }
  return new Date(0);
}

const makeSelectStyles = (minW = 160) => ({
  control: (base: any, state: any) => ({
    ...base,
    padding: "2px 4px",
    borderRadius: "10px",
    borderColor: state.isFocused ? "#3b82f6" : "#e2e8f0",
    boxShadow: state.isFocused ? "0 0 0 3px rgba(59,130,246,0.1)" : "none",
    "&:hover": { borderColor: "#3b82f6" },
    fontSize: "0.85rem",
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

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalIconBox} style={{ background: '#eff6ff', color: '#2563eb' }}>
            <Package size={32} />
          </div>
        </div>
        <h3 className={styles.modalTitle}>Manual Issue 📦</h3>
        <p className={styles.modalMessage}>Update quantity and status for this requirement.</p>
        
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

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Issue Quantity</label>
          <input 
            type="number" 
            className={styles.formInput} 
            value={qty} 
            onChange={e => setQty(e.target.value)}
            placeholder="Enter quantity"
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Status</label>
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
          className={styles.submitBtn} 
          onClick={() => onSubmit(qty, status)}
          disabled={updating}
        >
          {updating ? <Loader2 className={styles.btnSpin} size={20} /> : "Update & Sync ✅"}
        </button>
      </div>
    </div>
  );
}

// Manual Approval Modal Component
function ManualApprovalModal({ isOpen, onClose, row, onSubmit, updating, miscMap }: any) {
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

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalIconBox} style={{ background: '#fffbeb', color: '#d97706' }}>
            <UserCheck size={32} />
          </div>
        </div>
        <h3 className={styles.modalTitle}>Manual Approval ✍️</h3>
        <p className={styles.modalMessage}>Review and approve this requirement with custom details.</p>
        
        <div className={styles.formInfoBox}>
          <div className={styles.modalInfoItem}><span className={styles.modalLabel}>RKD:</span> <span className={styles.modalValue}>{row["Store RKD Number"]}</span></div>
          <div className={styles.modalInfoItem}><span className={styles.modalLabel}>Item:</span> <span className={styles.modalValue}>{row["Item Name"]}</span></div>
          <div className={styles.modalInfoItem}><span className={styles.modalLabel}>Required:</span> <span className={styles.modalValue}>{row["Require Qty"]} {row["Units"]}</span></div>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Vendor Name</label>
          <input 
            type="text" 
            className={styles.formInput} 
            value={vendor} 
            onChange={e => setVendor(e.target.value)}
            placeholder="Enter vendor name"
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Rate</label>
          <input 
            type="text" 
            className={styles.formInput} 
            value={rate} 
            onChange={e => setRate(e.target.value)}
            placeholder="Enter rate"
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Approved Quantity</label>
          <input 
            type="number" 
            className={styles.formInput} 
            value={approvedQty} 
            onChange={e => setApprovedQty(e.target.value)}
            placeholder="Enter approved quantity"
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Approval Require?</label>
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
          className={styles.submitBtn} 
          style={{ background: '#d97706' }}
          onClick={() => onSubmit({ vendor, rate, status, approvedQty })}
          disabled={updating}
        >
          {updating ? <Loader2 className={styles.btnSpin} size={18} /> : "Submit Approval ✅"}
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState<any[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [apiError, setApiError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [selDateFilter, setSelDateFilter] = useState<any>(dateOptions[3]); // Last 30 Days
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

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMsg, setModalMsg] = useState("");
  const [modalData, setModalData] = useState<any>(null);
  const [miscMap, setMiscMap] = useState<Record<string, { vendor: string, rate: string }>>({});

  // Manual Issue State
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isManualApprovalModalOpen, setIsManualApprovalModalOpen] = useState(false);
  const [manualRow, setManualRow] = useState<any>(null);

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/sheets");
      const json = await res.json();
      if (json.success) {
        setData(json.data || []);
        setStockMap(json.stockMap || {});
        setMiscMap(json.miscMap || {});
        setLastUpdated(new Date().toLocaleTimeString("en-IN"));
        setApiError(null);
      } else {
        setApiError(json.error || "Failed to fetch data");
        console.error("API Success False:", json.error);
      }
    } catch (err: any) {
      setApiError(err.message);
      console.error("Fetch Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDirectIssue = async (row: any) => {
    const rowId = row._id;
    const rkdNumber = row["Store RKD Number"];
    const requireQty = row["Require Qty"];
    
    if (!rkdNumber) {
      alert("Error: RKD Number not found for this row.");
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
      return;
    }

    // Optimistic Update
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
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
    } catch (err: any) {
      alert("Failed to update: " + err.message);
      setData(originalData); // Rollback
    } finally {
      setUpdatingRowId(null);
    }
  };

  const handleManualSubmit = async (issueQty: string, status: string) => {
    if (!manualRow) return;
    
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
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
    } catch (err: any) {
      alert("Failed to update: " + err.message);
      setData(originalData);
    } finally {
      setUpdatingRowId(null);
    }
  };

  const handleInstantApproval = async (row: any) => {
    const rowId = row._id;
    const rkdNumber = row["Store RKD Number"];
    const itemName = (row["Item Name"] || "").trim().toLowerCase();
    const misc = miscMap[itemName] || { vendor: "-", rate: "0" };
    const reqQty = row["Require Qty"];

    setUpdatingRowId(rowId);
    const originalData = [...data];
    const newData = data.map(r => {
      if (r._id === rowId) return { ...r, "Approval Require?": "No", "Approved Quantity": reqQty };
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
          itemName: row["Item Name"],
          vendorName: misc.vendor,
          rate: misc.rate,
          approvedQty: reqQty
        })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      // Show Success Popup
      setModalTitle("Approved Successfully! ✅");
      setModalMsg(`Requirement for "${row["Item Name"]}" has been approved.`);
      setModalData(null);
      setIsModalOpen(true);

      // Auto-close after 3 seconds
      setTimeout(() => {
        setIsModalOpen(false);
      }, 3000);
    } catch (err: any) {
      alert("Approval Failed: " + err.message);
      setData(originalData);
    } finally {
      setUpdatingRowId(null);
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
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      setModalTitle("Approved Successfully! ✅");
      setModalMsg(`Manual Approval for "${manualRow["Item Name"]}" has been logged.`);
      setModalData(null);
      setIsModalOpen(true);
      setTimeout(() => setIsModalOpen(false), 3000);
    } catch (err: any) {
      alert("Manual Approval Failed: " + err.message);
      setData(originalData);
    } finally {
      setUpdatingRowId(null);
    }
  };

  useEffect(() => {
    let timeoutId: any;
    const poll = async () => {
      try {
        await fetchData(true);
      } finally {
        // Wait 20 seconds AFTER the request completes before starting the next one
        timeoutId = setTimeout(poll, 20000);
      }
    };

    fetchData().then(() => {
      timeoutId = setTimeout(poll, 20000);
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
    else if (selDateFilter?.value === "30days") { start = startOfDay(subDays(today, 30)); end = endOfDay(today); }
    else if (selDateFilter?.value === "3months") { start = startOfDay(subMonths(today, 3)); end = endOfDay(today); }
    else if (selDateFilter?.value === "custom" && customStart && customEnd) {
      start = startOfDay(new Date(customStart)); end = endOfDay(new Date(customEnd));
    }
    return data.filter(row => {
      if (start && end) {
        const d = parseCustomDate(row["Timestamp"]);
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

      if (d.getTime() === 0) return;
      
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

  const ss = makeSelectStyles(150);

  return (
    <div className={styles.pageContainer}>
      <div className={styles.bgTopShapeLayer1}></div>
      <div className={styles.bgTopShapeLayer2}></div>
      <div className={styles.bgBottomShape}></div>
      <div className={styles.glassOrb}></div>

      {/* Header */}
      <header className={styles.topHeader}>
        <div className={styles.headerLeft}>
          <h1 className={styles.headerTitle}>Store Management System</h1>
        </div>
        <div className={styles.headerCenter}>
          <DigitalClock />
        </div>
        <div className={styles.headerRight}>
          <div className={styles.liveIndicator}>
            <div className={styles.liveDot}></div>
            <span className={styles.liveText}>LIVE</span>
          </div>
          <div className={styles.logoSquare}>
            <span className={styles.logoTextR}>R</span>
            <span className={styles.logoTextK}>K</span>
            <span className={styles.logoTextD}>D</span>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className={styles.presentationLayout}>
        <div className={styles.appCardSide}>
          <div className={styles.appCard}>

            {/* App Card Header */}
            <div className={styles.appHeader}>
              <div className={styles.appHeaderTitles}>
                <h2 className={styles.liveTitle}>Live Inward Data</h2>
              </div>
              <div className={styles.appMetricsInline}>
                <div className={styles.scorecard}>
                  <span className={styles.scorecardTitle}>Today Indent</span>
                  <span className={styles.scorecardValue}>{scorecards.todayIndent}</span>
                </div>
                <div className={styles.scorecard}>
                  <span className={styles.scorecardTitle}>Today Issue</span>
                  <span className={styles.scorecardValue}>{scorecards.todayIssue}</span>
                </div>
                <div className={styles.scorecard}>
                  <span className={styles.scorecardTitle}>Monthly Indent</span>
                  <span className={styles.scorecardValue}>{scorecards.monthIndent}</span>
                </div>
                <div className={styles.scorecard}>
                  <span className={styles.scorecardTitle}>Monthly Issue</span>
                  <span className={styles.scorecardValue}>{scorecards.monthIssue}</span>
                </div>
              </div>

              <div className={styles.quickStatusFilters}>
                <button 
                  className={`${styles.statusBtn} ${styles.btnOpen} ${statusFilter === "Requirement Open" ? styles.btnActive : ""}`}
                  onClick={() => setStatusFilter(statusFilter === "Requirement Open" ? null : "Requirement Open")}
                >
                  <span className={styles.statusBadge}>{scorecards.statusCounts.open}</span>
                  Requirement Open
                </button>
                <button 
                  className={`${styles.statusBtn} ${styles.btnClosed} ${statusFilter === "Requirement Closed" ? styles.btnActive : ""}`}
                  onClick={() => setStatusFilter(statusFilter === "Requirement Closed" ? null : "Requirement Closed")}
                >
                  <span className={styles.statusBadge}>{scorecards.statusCounts.closed}</span>
                  Requirement Closed
                </button>
                <button 
                  className={`${styles.statusBtn} ${styles.btnCancelled} ${statusFilter === "Requirement Cancelled" ? styles.btnActive : ""}`}
                  onClick={() => setStatusFilter(statusFilter === "Requirement Cancelled" ? null : "Requirement Cancelled")}
                >
                  <span className={styles.statusBadge}>{scorecards.statusCounts.cancelled}</span>
                  Requirement Cancelled
                </button>
              </div>
            </div>

            {/* Smart Filters — Row 1: Search + Date + Custom Range */}
            <div className={styles.filterRow}>
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

              <Select
                instanceId="date-filter"
                options={dateOptions}
                value={selDateFilter}
                onChange={setSelDateFilter}
                styles={makeSelectStyles(160)}
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
            </div>

            {/* Smart Filters — Row 2: Dependent Dropdowns */}
            <div className={styles.filterRow}>
              <Select instanceId="rkd-filter" options={rkdOptions} value={selRKDNum} onChange={v => { setSelRKDNum(v); setSelPerson(null); setSelItem(null); setSelDept(null); setSelMachine(null); setSelMachineID(null); }} styles={ss} placeholder="All RKD Numbers" isClearable className={styles.selectWrap} />
              <Select instanceId="person-filter" options={personOptions} value={selPerson} onChange={v => { setSelPerson(v); setSelItem(null); setSelDept(null); setSelMachine(null); setSelMachineID(null); }} styles={ss} placeholder="All Persons" isClearable className={styles.selectWrap} />
              <Select instanceId="item-filter" options={itemOptions} value={selItem} onChange={v => { setSelItem(v); setSelDept(null); setSelMachine(null); setSelMachineID(null); }} styles={ss} placeholder="All Items" isClearable className={styles.selectWrap} />
              <Select instanceId="dept-filter" options={deptOptions} value={selDept} onChange={v => { setSelDept(v); setSelMachine(null); setSelMachineID(null); }} styles={ss} placeholder="All Departments" isClearable className={styles.selectWrap} />
              <Select instanceId="machine-filter" options={machineOptions} value={selMachine} onChange={v => { setSelMachine(v); setSelMachineID(null); }} styles={ss} placeholder="All Machines" isClearable className={styles.selectWrap} />
              <Select instanceId="machineid-filter" options={machineIDOptions} value={selMachineID} onChange={setSelMachineID} styles={ss} placeholder="All Machine IDs" isClearable className={styles.selectWrap} />
            </div>

            {/* Table */}
            <div className={styles.tableScrollArea}>
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
                      <th>Stock in Store</th>
                      <th>Status</th>
                      <th>Approval Status</th>
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
                          <td><span className={`${styles.pillId} ${(isLow && status === "Requirement Open") ? styles.pillIdLowStock : ""}`}>{row["Store RKD Number"] || "-"}</span></td>
                          <td>{row["Person Filling Name"] || "-"}</td>
                          <td className={styles.colBold}>{row["Item Name"] || "-"}</td>
                          <td><span className={styles.pillReq}>{row["Require Qty"] || "0"}</span></td>
                          <td><span className={styles.pillIss}>{row["Issue Qty"] || "0"}</span></td>
                          <td className={styles.colMuted}>{row["Units"] || "-"}</td>
                          <td>{row["Department"] || "-"}</td>
                          <td>{row["Machine Name"] || "-"}</td>
                          <td className={styles.colMuted}>{row["Machine ID"] || "-"}</td>
                          <td>
                            <span className={`${styles.pillStock} ${isUnknown ? styles.stockUnknown : isLow ? styles.stockDanger : styles.stockSafe}`}>
                              {isUnknown ? "No Stock" : imsStock}
                            </span>
                          </td>
                          <td className={styles.colBold}>{row["Status"] || "-"}</td>
                          <td>
                            <span className={`${styles.pillId} ${
                              row["Approval Require?"] === "Yes" ? styles.pillIdLowStock : 
                              row["Approval Require?"] === "No" ? styles.stockDanger : ""
                            }`}>
                              {row["Approval Require?"] || "-"}
                            </span>
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
                                    </div>
                                  </div>

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
                                </>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {apiError && (
                      <tr>
                        <td colSpan={(!statusFilter || statusFilter === "Requirement Open") ? 13 : 12} className={styles.noDataCell} style={{ color: '#ef4444' }}>
                          <p>Error: {apiError}</p>
                          <button onClick={() => fetchData(true)} className={styles.statusBtn} style={{ marginTop: '10px' }}>Retry</button>
                        </td>
                      </tr>
                    )}
                    {!apiError && filteredData.length === 0 && (
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
          </div>
        </div>
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
      />
    </div>
  );
}
