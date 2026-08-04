"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import styles from "./report.module.css";
import {
  ArrowLeft, RefreshCw, Search, FileText,
  Download, Filter, Loader2, BarChart3, Maximize2, Minimize2,
  Home as HomeIcon, Plus, Layers, ListTodo, PieChart, Database, CheckCircle, Maximize
} from "lucide-react";
import mainStyles from "../page.module.css";

// ── Types ──────────────────────────────────────────────────────────────────
type IssueRow = {
  _rowIdx: number;
  "#": string;
  "Store RKD Number": string;
  "Timestamp": string;
  "Person Filling Name": string;
  "Item Name": string;
  "Require Qty": string;
  "Units": string;
  "Issue Qty": string;
  "Status": string;
  "Department": string;
  "Machine Name": string;
  "Machine ID": string;
  "Vendor Name": string;
  "Price": string;
  "Total Price": string;
};

// ── Month lookup ───────────────────────────────────────────────────────────
const MONTH_MAP: Record<string, number> = {
  // English full
  january:0, february:1, march:2, april:3, may:4, june:5,
  july:6, august:7, september:8, october:9, november:10, december:11,
  // English short
  jan:0, feb:1, mar:2, apr:3, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11,
  // Hindi / Devanagari (Google Sheets Indian locale)
  '\u091C\u0928\u0935\u0930\u0940':0,  // जनवरी
  '\u092B\u0930\u0935\u0930\u0940':1,  // फरवरी
  '\u092E\u093E\u0930\u094D\u091A':2,  // मार्च
  '\u0905\u092A\u094D\u0930\u0948\u0932':3, // अप्रैल
  '\u092E\u0908':4,                    // मई
  '\u091C\u0942\u0928':5,              // जून
  '\u091C\u0941\u0932\u093E\u0908':6, // जुलाई
  '\u0905\u0917\u0938\u094D\u0924':7, // अगस्त
  '\u0938\u093F\u0924\u0902\u092C\u0930':8, // सितंबर
  '\u0905\u0915\u094D\u0924\u0942\u092C\u0930':9, // अक्तूबर
  '\u0928\u0935\u0902\u092C\u0930':10, // नवंबर
  '\u0926\u093F\u0938\u0902\u092C\u0930':11, // दिसंबर
};

// ── Helpers ────────────────────────────────────────────────────────────────
function toNum(v: any) {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

function parseDate(ts: string): Date {
  if (!ts) return new Date(0);

  // 1. Try native first (handles ISO 8601, RFC 2822, US "M/D/YYYY H:MM:SS" etc.)
  const native = new Date(ts);
  if (!isNaN(native.getTime())) return native;

  // 2. Named-month format: "29 March 2026 5:48 PM" / "14 Mar 2026, 17:31:51"
  const clean = ts.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const parts = clean.split(" ");
  let day = -1, month = -1, year = -1;

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i], pLow = p.toLowerCase();
    if (/^\d{4}$/.test(p) && parseInt(p) >= 2000) { year = parseInt(p); continue; }
    if (MONTH_MAP[pLow] !== undefined) {
      month = MONTH_MAP[pLow];
      if (i > 0 && /^\d{1,2}$/.test(parts[i - 1])) day = parseInt(parts[i - 1]);
      else if (i < parts.length - 1 && /^\d{1,2}$/.test(parts[i + 1])) day = parseInt(parts[i + 1]);
      continue;
    }
    const hit = Object.keys(MONTH_MAP).find(k => pLow.startsWith(k) || k.startsWith(pLow));
    if (hit && month === -1) {
      month = MONTH_MAP[hit];
      if (i > 0 && /^\d{1,2}$/.test(parts[i - 1])) day = parseInt(parts[i - 1]);
      else if (i < parts.length - 1 && /^\d{1,2}$/.test(parts[i + 1])) day = parseInt(parts[i + 1]);
    }
  }
  if (day >= 1 && day <= 31 && month >= 0 && year >= 2000) return new Date(year, month, day);

  // 3. DD/MM/YYYY or MM/DD/YYYY or DD-MM-YYYY (numeric, Google Sheets Indian locale)
  //    e.g. "29/5/2026 16:35:00"  →  assume DD/MM/YYYY for India
  const numMatch = ts.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (numMatch) {
    const a = parseInt(numMatch[1]), b = parseInt(numMatch[2]), y = parseInt(numMatch[3]);
    if (y >= 2000 && b >= 1 && b <= 12) return new Date(y, b - 1, a); // DD/MM/YYYY
    if (y >= 2000 && a >= 1 && a <= 12) return new Date(y, a - 1, b); // MM/DD/YYYY
  }

  // 4. YYYY-MM-DD or YYYY/MM/DD fallback
  const isoNum = ts.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (isoNum) {
    const y = parseInt(isoNum[1]), m = parseInt(isoNum[2]), d = parseInt(isoNum[3]);
    if (y >= 2000 && m >= 1 && m <= 12 && d >= 1 && d <= 31) return new Date(y, m - 1, d);
  }

  // 5. DD-MonthName-YYYY (Google Sheets Hindi locale: "01-\u0905\u092A\u094D\u0930\u0948\u0932-2026 10:16")
  //    Also handles English: "14-March-2026 17:31:51"
  const dashMatch = ts.match(/(\d{1,2})-([^\d\-\/]+)-(\d{4})/u);
  if (dashMatch) {
    const d = parseInt(dashMatch[1]);
    const rawMonth = dashMatch[2].trim();
    const y = parseInt(dashMatch[3]);
    const m = MONTH_MAP[rawMonth] ?? MONTH_MAP[rawMonth.toLowerCase()];
    if (y >= 2000 && d >= 1 && d <= 31 && m !== undefined) return new Date(y, m, d);
  }

  return new Date(0);
}

function fmtCurrency(val: any) {
  const n = toNum(val);
  if (n === 0) return "—";
  return "\u20B9" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function fmtNum(val: any) {
  const n = toNum(val);
  if (n === 0) return "—";
  return n % 1 === 0 ? n.toLocaleString("en-IN") : n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function fmtShort(val: number): string {
  if (val >= 10000000) return "\u20B9" + (val / 10000000).toFixed(1) + "Cr";
  if (val >= 100000)   return "\u20B9" + (val / 100000).toFixed(1) + "L";
  if (val >= 1000)     return "\u20B9" + (val / 1000).toFixed(1) + "K";
  return fmtCurrency(val);
}
// PDF-safe currency — jsPDF Helvetica doesn't support \u20B9 (₹), use Rs. instead
function fmtPDF(val: any) {
  const n = toNum(val);
  if (n === 0) return "-";
  return "Rs." + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

// PDF-safe month names (ASCII only — Helvetica can't render Devanagari)
const PDF_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/**
 * Convert any Google Sheets timestamp (Hindi Devanagari or English) to clean
 * ASCII "DD-MMM-YYYY HH:MM" for PDF rendering.
 * e.g. "01-अप्रैल-2026 10:16" → "01-Apr-2026 10:16"
 *      "30-May-2026 16:35"    → "30-May-2026 16:35"
 */
function fmtTimestampPDF(ts: string): string {
  if (!ts) return "-";
  const d = parseDate(ts);
  if (d.getTime() === 0) return ts.replace(/[^\x00-\x7F\s]/g, "?").trim().slice(0, 22);

  const dd  = String(d.getDate()).padStart(2, "0");
  const mon = PDF_MONTHS[d.getMonth()];
  const yr  = d.getFullYear();

  // Try to extract time from the original string (digits after year or after space)
  const timeMatch = ts.match(/(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AaPp][Mm])?)\s*$/);
  const timePart  = timeMatch ? " " + timeMatch[1].trim() : "";
  return `${dd}-${mon}-${yr}${timePart}`;
}

/** Current date-time in IST formatted for PDF header (ASCII-only) */
function fmtNowIST(): string {
  const now = new Date();
  // Convert to IST (UTC+5:30)
  const ist = new Date(now.getTime() + (5 * 60 + 30) * 60000);
  const dd  = String(ist.getUTCDate()).padStart(2, "0");
  const mon = PDF_MONTHS[ist.getUTCMonth()];
  const yr  = ist.getUTCFullYear();
  const hh  = ist.getUTCHours();
  const mm  = String(ist.getUTCMinutes()).padStart(2, "0");
  const ampm = hh >= 12 ? "PM" : "AM";
  const h12  = hh % 12 || 12;
  return `${dd}-${mon}-${yr}, ${h12}:${mm} ${ampm} IST`;
}

// ── Component ──────────────────────────────────────────────────────────────
export default function ReportPage() {
  const router = useRouter();

  const [data, setData]       = useState<IssueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState("");
  const [apiError, setApiError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarTimerRef = useRef<NodeJS.Timeout | null>(null);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error("Error attempting to enable fullscreen:", err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const CURRENT_YEAR = new Date().getFullYear();
  const [selYear, setSelYear]           = useState(String(CURRENT_YEAR));
  const [searchTerm, setSearchTerm]     = useState("");
  const [selDept, setSelDept]           = useState("__all__");
  const [selMachine, setSelMachine]     = useState("__all__");
  const [selMachineID, setSelMachineID] = useState("__all__");
  const [selItem, setSelItem]           = useState("__all__");
  const [selPerson, setSelPerson]       = useState("__all__");
  const [selRKD, setSelRKD]             = useState("__all__");
  const [dateStart, setDateStart]       = useState("");
  const [dateEnd, setDateEnd]           = useState("");
  const [sortCol, setSortCol]           = useState("Timestamp");
  const [sortAsc, setSortAsc]           = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [isTableFullScreen, setIsTableFullScreen] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleFsChange = () => setIsTableFullScreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const toggleTableFullScreen = () => {
    if (!document.fullscreenElement) {
      tableContainerRef.current?.requestFullscreen().catch(err => console.error(err));
    } else {
      document.exitFullscreen();
    }
  };

  // ── Fetch ───────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (silent = false, refresh = false) => {
    if (!silent) setLoading(true);
    try {
      const base = refresh ? "refresh=1" : `t=${Date.now()}`;
      const res  = await fetch(`/api/report?${base}&year=${selYear}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data || []);
        setLastSync(new Date().toLocaleTimeString("en-IN"));
        setApiError(null);
      } else { setApiError(json.error || "Failed to load report"); }
    } catch (e: any) { setApiError(e.message); }
    finally { setLoading(false); }
  }, [selYear]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Dropdown options ─────────────────────────────────────────────────────
  const uniq = (key: keyof IssueRow) =>
    Array.from(new Set(data.map(r => String(r[key] || "").trim()).filter(Boolean))).sort();

  const deptOpts      = useMemo(() => uniq("Department"),          [data]);
  const machineOpts   = useMemo(() => uniq("Machine Name"),        [data]);
  const machineIDOpts = useMemo(() => uniq("Machine ID"),          [data]);
  const itemOpts      = useMemo(() => uniq("Item Name"),           [data]);
  const personOpts    = useMemo(() => uniq("Person Filling Name"), [data]);
  const rkdOpts       = useMemo(() => uniq("Store RKD Number"),    [data]);

  // ── Filter + sort ────────────────────────────────────────────────────────
  const filteredData = useMemo(() => {
    let r = data;
    if (selDept      !== "__all__") r = r.filter(x => x["Department"]?.trim()          === selDept);
    if (selMachine   !== "__all__") r = r.filter(x => x["Machine Name"]?.trim()        === selMachine);
    if (selMachineID !== "__all__") r = r.filter(x => x["Machine ID"]?.trim()          === selMachineID);
    if (selItem      !== "__all__") r = r.filter(x => x["Item Name"]?.trim()           === selItem);
    if (selPerson    !== "__all__") r = r.filter(x => x["Person Filling Name"]?.trim() === selPerson);
    if (selRKD       !== "__all__") r = r.filter(x => x["Store RKD Number"]?.trim()    === selRKD);

    if (dateStart || dateEnd) {
      const s = dateStart ? new Date(dateStart + "T00:00:00") : new Date(0);
      const e = dateEnd   ? new Date(dateEnd   + "T23:59:59") : new Date(8640000000000000);
      r = r.filter(x => {
        const d = parseDate(x["Timestamp"]);
        // If timestamp couldn't be parsed at all, exclude it when a date range is active
        if (d.getTime() === 0) return false;
        return d >= s && d <= e;
      });
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      r = r.filter(x => Object.values(x).some(v => String(v).toLowerCase().includes(q)));
    }

    return [...r].sort((a, b) => {
      let va: any = a[sortCol as keyof IssueRow] ?? "";
      let vb: any = b[sortCol as keyof IssueRow] ?? "";
      if (["Require Qty","Issue Qty","Price","Total Price"].includes(sortCol)) { va = toNum(va); vb = toNum(vb); }
      else if (sortCol === "Timestamp") { va = parseDate(String(va)).getTime(); vb = parseDate(String(vb)).getTime(); }
      else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
      return va < vb ? (sortAsc ? -1 : 1) : va > vb ? (sortAsc ? 1 : -1) : 0;
    });
  }, [data, selDept, selMachine, selMachineID, selItem, selPerson, selRKD,
      dateStart, dateEnd, searchTerm, sortCol, sortAsc]);

  const kpis = useMemo(() => ({
    count:          filteredData.length,
    totalIssueQty:  filteredData.reduce((s, r) => s + toNum(r["Issue Qty"]), 0),
    totalPrice:     filteredData.reduce((s, r) => s + toNum(r["Total Price"]), 0),
    totalIndentQty: filteredData.reduce((s, r) => s + toNum(r["Require Qty"]), 0),
  }), [filteredData]);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(false); }
  };

  const resetFilters = () => {
    setSearchTerm(""); setSelDept("__all__"); setSelMachine("__all__");
    setSelMachineID("__all__"); setSelItem("__all__"); setSelPerson("__all__");
    setSelRKD("__all__"); setDateStart(""); setDateEnd("");
    setSelYear(String(CURRENT_YEAR));
  };

  // ── PDF Export ───────────────────────────────────────────────────────────
  const handleExportPDF = async () => {
    const { jsPDF }  = await import("jspdf");
    const autoTable  = (await import("jspdf-autotable")).default;
    const doc        = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW      = doc.internal.pageSize.getWidth();
    const now        = fmtNowIST();

    doc.setFillColor(28,28,30); doc.rect(0,0,pageW,18,"F");
    doc.setTextColor(255,255,255); doc.setFontSize(13); doc.setFont("helvetica","bold");
    doc.text("Store Miscellaneous Issue Report", pageW/2, 8, { align:"center" });
    doc.setFontSize(7.5); doc.setFont("helvetica","normal");
    doc.text(`Year: ${selYear}  |  Generated: ${now}  |  Records: ${filteredData.length}`, pageW/2, 14, { align:"center" });

    autoTable(doc, {
      startY: 22,
      head: [["#","Timestamp","Department","Item Name","Machine","Machine ID","RKD Number","Person","Indent Qty","Issue Qty","Rate","Total Price"]],
      body: filteredData.map((r,i) => [
        i+1, fmtTimestampPDF(r["Timestamp"]), r["Department"], r["Item Name"],
        r["Machine Name"], r["Machine ID"], r["Store RKD Number"], r["Person Filling Name"],
        fmtNum(r["Require Qty"]), fmtNum(r["Issue Qty"]), fmtPDF(r["Price"]), fmtPDF(r["Total Price"]),
      ]),
      headStyles: { fillColor:[28,28,30], textColor:255, fontStyle:"bold", fontSize:7 },
      bodyStyles: { fontSize:7, textColor:[30,41,59] },
      alternateRowStyles: { fillColor:[252,252,246] },
      foot: [["","","","","","","","TOTAL", fmtNum(kpis.totalIndentQty), fmtNum(kpis.totalIssueQty), "", fmtPDF(kpis.totalPrice)]],
      footStyles: { fillColor:[245,197,32], textColor:[28,28,30], fontStyle:"bold", fontSize:7.5 },
      margin: { left:5, right:5 },
    });
    doc.save(`RKD_Issue_Report_${selYear}_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  // ── Shared table + KPI content ───────────────────────────────────────────
  const COLS = [
    { label:"#",           key:"_sno"              },
    { label:"Timestamp",   key:"Timestamp"          },
    { label:"Department",  key:"Department"         },
    { label:"Item Name",   key:"Item Name"          },
    { label:"Machine",     key:"Machine Name"       },
    { label:"Machine ID",  key:"Machine ID"         },
    { label:"RKD No.",     key:"Store RKD Number"   },
    { label:"Person",      key:"Person Filling Name"},
    { label:"Indent Qty",  key:"Require Qty"        },
    { label:"Issue Qty",   key:"Issue Qty"          },
    { label:"Rate",        key:"Price"              },
    { label:"Total Price", key:"Total Price"        },
  ];

  const DashboardContent = (
    <>
      {/* ── KPI Strip ── */}
      <div className={styles.kpiStrip} style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
        
        <div className={mainStyles.miniBlobCard} data-color="blue">
          <div className={mainStyles.miniBlobDot}></div>
          <div className={mainStyles.miniBlobTitle}>Total Entries</div>
          <div className={mainStyles.miniBlobSub}>Records Found</div>
          <div className={mainStyles.miniBlobPill}>
            <span className={mainStyles.miniBlobPillText}>{kpis.count.toLocaleString("en-IN")}</span>
            <span className={mainStyles.miniBlobPillArrow}>»</span>
          </div>
        </div>

        <div className={mainStyles.miniBlobCard} data-color="pink">
          <div className={mainStyles.miniBlobDot}></div>
          <div className={mainStyles.miniBlobTitle}>Total Issue Qty</div>
          <div className={mainStyles.miniBlobSub}>Units Issued</div>
          <div className={mainStyles.miniBlobPill}>
            <span className={mainStyles.miniBlobPillText}>{kpis.totalIssueQty.toLocaleString("en-IN")}</span>
            <span className={mainStyles.miniBlobPillArrow}>»</span>
          </div>
        </div>

        <div className={mainStyles.miniBlobCard} data-color="yellow">
          <div className={mainStyles.miniBlobDot}></div>
          <div className={mainStyles.miniBlobTitle}>Total Price</div>
          <div className={mainStyles.miniBlobSub}>Total Cost</div>
          <div className={mainStyles.miniBlobPill}>
            <span className={mainStyles.miniBlobPillText}>{fmtShort(kpis.totalPrice)}</span>
            <span className={mainStyles.miniBlobPillArrow}>»</span>
          </div>
        </div>

        <div className={mainStyles.miniBlobCard} data-color="blue">
          <div className={mainStyles.miniBlobDot}></div>
          <div className={mainStyles.miniBlobTitle}>Total Indent Qty</div>
          <div className={mainStyles.miniBlobSub}>Requested Units</div>
          <div className={mainStyles.miniBlobPill}>
            <span className={mainStyles.miniBlobPillText}>{kpis.totalIndentQty.toLocaleString("en-IN")}</span>
            <span className={mainStyles.miniBlobPillArrow}>»</span>
          </div>
        </div>

      </div>

      {/* ── Table Card ── */}
      <div 
        ref={tableContainerRef}
        style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column', 
          marginTop: '8px', 
          background: 'white', 
          borderRadius: isTableFullScreen ? '0' : '16px', 
          boxShadow: isTableFullScreen ? 'none' : '0 1px 3px rgba(0,0,0,0.05)', 
          overflow: 'hidden', 
          border: isTableFullScreen ? 'none' : '1px solid #f1f5f9',
          padding: isTableFullScreen ? '16px' : '0'
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: isTableFullScreen ? '0 0 16px 0' : '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isTableFullScreen && (
              <img src="https://static.wixstatic.com/media/68b92a_d71e34133826499983234774dea1945b~mv2.png/v1/fill/w_186,h_156,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/RKD-Logo.png" alt="RKD Logo" style={{ height: '32px', objectFit: 'contain' }} />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: '#334155' }}>
              <FileText size={16} /> <span>Issue Register</span>
              <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginLeft: '4px' }}>{filteredData.length}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <Search size={14} style={{ color: '#94a3b8' }} />
              <input
                id="table-search"
                type="text"
                placeholder="Search..."
                style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '0.85rem', width: '150px' }}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <button onClick={toggleTableFullScreen} style={{ background: 'white', border: '1px solid #e2e8f0', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#475569', transition: 'all 0.2s' }}>
              {isTableFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>

        <div className={mainStyles.tableScrollArea} style={{ flex: 1, minHeight: 0 }}>
          {loading ? (
            <div className={mainStyles.loaderCenter}>
              <Loader2 className={mainStyles.spinnerIcon} size={28} />
              <p>Loading {selYear} data...</p>
            </div>
          ) : filteredData.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', gap: '12px', padding: '40px' }}>
              <FileText size={36} opacity={0.3} />
              <p style={{ margin: 0, fontWeight: 500 }}>No records match the selected filters.</p>
            </div>
          ) : (
            <table className={mainStyles.dataTable}>
              <thead>
                <tr>
                  {COLS.map(col => (
                    <th
                      key={col.key}
                      style={{ cursor: col.key !== "_sno" ? 'pointer' : 'default', userSelect: 'none' }}
                      onClick={col.key !== "_sno" ? () => handleSort(col.key) : undefined}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {col.label}
                        {sortCol === col.key && <span style={{ opacity: 0.5, fontSize: '0.7rem' }}>{sortAsc ? "↑" : "↓"}</span>}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row, idx) => (
                  <tr key={row._rowIdx}>
                    <td style={{ color: '#94a3b8', fontWeight: 600 }}>{idx + 1}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#64748b' }}>{row["Timestamp"] || "—"}</td>
                    <td>{row["Department"] || "—"}</td>
                    <td style={{ fontWeight: 600, color: '#334155' }}>{row["Item Name"] || "—"}</td>
                    <td>{row["Machine Name"] || "—"}</td>
                    <td style={{ fontFamily: 'monospace' }}>{row["Machine ID"] || "—"}</td>
                    <td><span style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>{row["Store RKD Number"] || "—"}</span></td>
                    <td>{row["Person Filling Name"] || "—"}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(row["Require Qty"])}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>{fmtNum(row["Issue Qty"])}</td>
                    <td style={{ textAlign: 'right', color: '#64748b' }}>{fmtCurrency(row["Price"])}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#4f46e5' }}>{fmtCurrency(row["Total Price"])}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 10, background: '#f8fafc', borderTop: '2px solid #e2e8f0', boxShadow: '0 -4px 6px -1px rgba(0,0,0,0.05)' }}>
                <tr>
                  <td colSpan={8} style={{ fontWeight:800, color:"#334155", fontSize:"0.75rem", padding: '12px 16px' }}>
                    TOTALS — {filteredData.length} entries · {selYear}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight:800, color:"#334155", padding: '12px 16px' }}>{fmtNum(kpis.totalIndentQty)}</td>
                  <td style={{ textAlign: 'right', fontWeight:800, color:"#334155", padding: '12px 16px' }}>{fmtNum(kpis.totalIssueQty)}</td>
                  <td style={{ textAlign: 'right', color:"#94a3b8", padding: '12px 16px' }}>—</td>
                  <td style={{ textAlign: 'right', fontWeight:900, color:"#4f46e5", fontSize: '0.9rem', padding: '12px 16px' }}>{fmtCurrency(kpis.totalPrice)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </>
  );

  // ── Filters JSX (shared) ─────────────────────────────────────────────────
  const filterInputStyle = { padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem', color: '#334155', background: '#f8fafc', outline: 'none' };
  const FiltersJSX = (
    <>
      <div className={mainStyles.filterToggleBar} style={{ marginTop: '0', borderBottom: filtersVisible ? 'none' : '1px solid #f1f5f9', background: 'transparent', padding: '8px 4px' }}>
        <span style={{ flex: 1, fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>FILTER RECORDS</span>
        <button
          className={`${mainStyles.filterToggleBtn} ${!filtersVisible ? mainStyles.filterToggleBtnActive : ''}`}
          onClick={() => setFiltersVisible(!filtersVisible)}
        >
          <Filter size={14} /> Filters
        </button>
      </div>
      <div style={{ 
        display: 'flex', gap: '12px', padding: filtersVisible ? '16px 20px' : '0 20px', flexWrap: 'wrap', alignItems: 'center', 
        background: 'white', borderBottom: filtersVisible ? '1px solid #f1f5f9' : 'none', borderTop: filtersVisible ? '1px solid #f1f5f9' : 'none',
        maxHeight: filtersVisible ? '500px' : '0', opacity: filtersVisible ? 1 : 0, overflow: 'hidden', 
        transition: 'all 0.3s ease', borderRadius: '12px', marginBottom: '8px'
      }}>
      <select style={filterInputStyle} value={selYear} onChange={e => { setSelYear(e.target.value); setDateStart(""); setDateEnd(""); }}>
        {[2024,2025,2026,2027].map(y => <option key={y} value={String(y)}>{y}{y===CURRENT_YEAR?" ★":""}</option>)}
      </select>

      <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 4px' }} />

      <select style={filterInputStyle} value={selDept} onChange={e => setSelDept(e.target.value)}>
        <option value="__all__">— Department —</option>
        {deptOpts.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
      <select style={filterInputStyle} value={selMachine} onChange={e => setSelMachine(e.target.value)}>
        <option value="__all__">— Machine —</option>
        {machineOpts.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
      <select style={filterInputStyle} value={selMachineID} onChange={e => setSelMachineID(e.target.value)}>
        <option value="__all__">— Machine ID —</option>
        {machineIDOpts.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
      <select style={filterInputStyle} value={selItem} onChange={e => setSelItem(e.target.value)}>
        <option value="__all__">— Item Name —</option>
        {itemOpts.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
      <select style={filterInputStyle} value={selPerson} onChange={e => setSelPerson(e.target.value)}>
        <option value="__all__">— Person —</option>
        {personOpts.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
      <select style={filterInputStyle} value={selRKD} onChange={e => setSelRKD(e.target.value)}>
        <option value="__all__">— Request No. —</option>
        {rkdOpts.map(v => <option key={v} value={v}>{v}</option>)}
      </select>

      <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 4px' }} />

      <input type="date" style={filterInputStyle} value={dateStart} onChange={e => setDateStart(e.target.value)} title="Date From" />
      <input type="date" style={filterInputStyle} value={dateEnd} onChange={e => setDateEnd(e.target.value)} title="Date To" />

      <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
        <button onClick={resetFilters} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>↺ Reset</button>
        <button onClick={handleExportPDF} style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', background: '#0f172a', color: 'white', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Download size={14} /> Export PDF
        </button>
      </div>
    </div>
    </>
  );

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={mainStyles.pageContainer}>
      <div className={mainStyles.presentationLayout}>
        {/* NEW DRIBBBLE SIDEBAR */}
        <div 
           className={`${mainStyles.dribbbleSidebar} ${sidebarOpen ? mainStyles.dribbbleSidebarOpen : ''}`}
           onMouseLeave={() => { sidebarTimerRef.current = setTimeout(() => setSidebarOpen(false), 300); }}
           onMouseEnter={() => { if (sidebarTimerRef.current) clearTimeout(sidebarTimerRef.current); }}
        >
           {/* Sidebar Logo */}
           <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
             <img src="https://static.wixstatic.com/media/68b92a_d71e34133826499983234774dea1945b~mv2.png/v1/fill/w_186,h_156,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/RKD-Logo.png" alt="RKD Logo" style={{ height: '45px', objectFit: 'contain' }} />
           </div>

           <div className={mainStyles.dribbbleSidebarMenu}>
              <div className={mainStyles.dribbbleSidebarItem} onClick={() => router.push("/")}>
                 <div className={mainStyles.dribbbleSidebarIcon}><HomeIcon size={20} strokeWidth={2.5} /></div>
                 <span>Home</span>
              </div>
              <div className={mainStyles.dribbbleSidebarItemPrimary} onClick={() => window.open('/indent', '_blank')}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                   <div className={mainStyles.dribbbleSidebarIconPrimary}><Plus size={20} strokeWidth={2.5} /></div>
                   <span>New Indent</span>
                 </div>
                 <span style={{ fontSize: '12px', opacity: 0.8 }}> </span>
              </div>
              
              <div className={mainStyles.dribbbleSidebarItem} onClick={() => router.push("/po")}>
                 <div className={mainStyles.dribbbleSidebarIcon}><Layers size={20} strokeWidth={2.5} /></div>
                 <span>Purchase Order Entry</span>
              </div>

              <div className={mainStyles.dribbbleSidebarItem} onClick={() => router.push("/inward")}>
                 <div className={mainStyles.dribbbleSidebarIcon}><ListTodo size={20} strokeWidth={2.5} /></div>
                 <span>Inward Entry</span>
              </div>

              <div className={`${mainStyles.dribbbleSidebarItem} ${mainStyles.dribbbleSidebarItemActive}`}>
                 <div className={mainStyles.dribbbleSidebarIcon}><PieChart size={20} strokeWidth={2.5} /></div>
                 <span>Issue Entry</span>
              </div>
              
              <div style={{ height: '1px', background: '#f1f5f9', margin: '16px 0 8px 0' }}></div>
              
              <div className={mainStyles.dribbbleSidebarItem} onClick={() => router.push("/ims")}>
                 <div className={mainStyles.dribbbleSidebarIcon}><Database size={20} strokeWidth={2.5} /></div>
                 <span>IMS</span>
              </div>
              
              <div className={mainStyles.dribbbleSidebarItem} onClick={() => router.push("/approval")}>
                 <div className={mainStyles.dribbbleSidebarIcon}><CheckCircle size={20} strokeWidth={2.5} /></div>
                 <span>Approvals</span>
              </div>
              
              <div className={mainStyles.dribbbleSidebarItem} onClick={handleExportPDF}>
                 <div className={mainStyles.dribbbleSidebarIcon}><Download size={20} strokeWidth={2.5} /></div>
                 <span>Download PDF</span>
              </div>
              <div className={mainStyles.dribbbleSidebarItem} onClick={toggleFullScreen}>
                 <div className={mainStyles.dribbbleSidebarIcon}><Maximize size={20} strokeWidth={2.5} /></div>
                 <span>Full Screen</span>
              </div>

              <div className={mainStyles.dribbbleSidebarItem} onClick={() => fetchData(false, false)}>
                 <div className={mainStyles.dribbbleSidebarIcon}><RefreshCw size={20} strokeWidth={2.5} className={loading ? mainStyles.btnSpin : ''} /></div>
                 <span>Sync Now</span>
              </div>
           </div>
        </div>

        <div className={mainStyles.appCardSide}>
          <div className={mainStyles.appCard}>

            {/* App Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #f1f5f9', background: '#ffffff', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div 
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                  onMouseEnter={() => setSidebarOpen(true)}
                  onClick={() => setSidebarOpen(true)}
                >
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '16px', height: '2px', background: '#475569', boxShadow: '0 5px 0 #475569, 0 -5px 0 #475569' }}></div>
                  </div>
                </div>
                <div>
                  <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', fontFamily: "'Outfit', sans-serif" }}>Store Miscellaneous System</h1>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>Issue Report / Dashboard</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', padding: '6px 12px', borderRadius: '999px', fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>
                  <RefreshCw size={12} className={loading ? mainStyles.btnSpin : ''} />
                  <span>{lastSync ? `Synced ${lastSync}` : 'Loading...'}</span>
                </div>
                <button onClick={toggleFullScreen} style={{ background: 'white', border: '1px solid #e2e8f0', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#475569', transition: 'all 0.2s' }}>
                  <Maximize size={16} />
                </button>
              </div>
            </div>

            {/* Content Area */}
            <div className={styles.content}>
              {apiError && <div className={styles.errorBanner}>⚠️ {apiError}</div>}
              {FiltersJSX}
              {DashboardContent}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
