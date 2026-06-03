"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import styles from "./report.module.css";
import {
  ArrowLeft, RefreshCw, Search, FileText,
  Download, Filter, Loader2, BarChart3, Maximize2, Minimize2
} from "lucide-react";

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
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function fmtNum(val: any) {
  const n = toNum(val);
  if (n === 0) return "—";
  return n % 1 === 0 ? n.toLocaleString("en-IN") : n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function fmtShort(val: number): string {
  if (val >= 10000000) return "₹" + (val / 10000000).toFixed(1) + "Cr";
  if (val >= 100000)   return "₹" + (val / 100000).toFixed(1) + "L";
  if (val >= 1000)     return "₹" + (val / 1000).toFixed(1) + "K";
  return fmtCurrency(val);
}

// ── Component ──────────────────────────────────────────────────────────────
export default function ReportPage() {
  const router = useRouter();

  const [data, setData]       = useState<IssueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState("");
  const [apiError, setApiError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
    const now        = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    doc.setFillColor(28,28,30); doc.rect(0,0,pageW,18,"F");
    doc.setTextColor(255,255,255); doc.setFontSize(13); doc.setFont("helvetica","bold");
    doc.text("Store Miscellaneous Issue Report", pageW/2, 8, { align:"center" });
    doc.setFontSize(7.5); doc.setFont("helvetica","normal");
    doc.text(`Year: ${selYear}  |  Generated: ${now}  |  Records: ${filteredData.length}`, pageW/2, 14, { align:"center" });

    autoTable(doc, {
      startY: 22,
      head: [["#","Timestamp","Department","Item Name","Machine","Machine ID","RKD Number","Person","Indent Qty","Issue Qty","Rate","Total Price"]],
      body: filteredData.map((r,i) => [
        i+1, r["Timestamp"], r["Department"], r["Item Name"],
        r["Machine Name"], r["Machine ID"], r["Store RKD Number"], r["Person Filling Name"],
        fmtNum(r["Require Qty"]), fmtNum(r["Issue Qty"]), fmtCurrency(r["Price"]), fmtCurrency(r["Total Price"]),
      ]),
      headStyles: { fillColor:[28,28,30], textColor:255, fontStyle:"bold", fontSize:7 },
      bodyStyles: { fontSize:7, textColor:[30,41,59] },
      alternateRowStyles: { fillColor:[252,252,246] },
      foot: [["","","","","","","","TOTAL", fmtNum(kpis.totalIndentQty), fmtNum(kpis.totalIssueQty), "", fmtCurrency(kpis.totalPrice)]],
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
      <div className={styles.kpiStrip}>
        <div className={`${styles.kpiChip} ${styles.kpiChipWhite}`}>
          <span className={styles.chipBadge + " " + styles.chipBadgeGreen}>CLOSED</span>
          <span className={styles.chipEmoji}>📋</span>
          <div className={styles.chipBody}>
            <div className={`${styles.chipValue} ${styles.chipValueW}`}>{kpis.count.toLocaleString("en-IN")}</div>
            <div className={`${styles.chipLabel} ${styles.chipLabelW}`}>Total Entries</div>
          </div>
        </div>
        <div className={`${styles.kpiChip} ${styles.kpiChipYellow}`}>
          <span className={styles.chipBadge + " " + styles.chipBadgeDark}>ISSUED</span>
          <span className={styles.chipEmoji}>📦</span>
          <div className={styles.chipBody}>
            <div className={`${styles.chipValue} ${styles.chipValueY}`}>{kpis.totalIssueQty.toLocaleString("en-IN")}</div>
            <div className={`${styles.chipLabel} ${styles.chipLabelY}`}>Total Issue Qty</div>
          </div>
        </div>
        <div className={`${styles.kpiChip} ${styles.kpiChipDark}`}>
          <span className={styles.chipBadge + " " + styles.chipBadgeWhite}>VALUE</span>
          <span className={styles.chipEmoji}>💰</span>
          <div className={styles.chipBody}>
            <div className={`${styles.chipValue} ${styles.chipValueD}`}>{fmtShort(kpis.totalPrice)}</div>
            <div className={`${styles.chipLabel} ${styles.chipLabelD}`}>Grand Total Price</div>
            <div className={`${styles.chipSub} ${styles.chipSubD}`}>{fmtCurrency(kpis.totalPrice)}</div>
          </div>
        </div>
        <div className={`${styles.kpiChip} ${styles.kpiChipNeutral}`}>
          <span className={styles.chipBadge + " " + styles.chipBadgeGray}>REQUESTED</span>
          <span className={styles.chipEmoji}>📝</span>
          <div className={styles.chipBody}>
            <div className={`${styles.chipValue} ${styles.chipValueN}`}>{kpis.totalIndentQty.toLocaleString("en-IN")}</div>
            <div className={`${styles.chipLabel} ${styles.chipLabelN}`}>Total Indent Qty</div>
          </div>
        </div>
      </div>

      {/* ── Table Card ── */}
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div className={styles.tableHeaderTitle}>
            <FileText size={14} /> Issue Register
            <span className={styles.tableBadge}>{filteredData.length}</span>
          </div>
          <div className={styles.tableToolbar}>
            <div className={styles.searchBox}>
              <Search size={12} className={styles.searchIcon} />
              <input
                id="table-search"
                type="text"
                placeholder="Search..."
                className={styles.searchInput}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <button
              className={styles.fullscreenBtn}
              onClick={() => setIsFullscreen(f => !f)}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </div>
        </div>

        <div className={styles.tableWrap}>
          {loading ? (
            <div className={styles.loaderCenter}>
              <Loader2 className={styles.spin} size={28} />
              <p>Loading {selYear} data...</p>
            </div>
          ) : filteredData.length === 0 ? (
            <div className={styles.emptyState}>
              <FileText size={36} opacity={0.2} />
              <p>No records match the selected filters.</p>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  {COLS.map(col => (
                    <th
                      key={col.key}
                      className={`${styles.th} ${col.key !== "_sno" ? styles.thSort : ""}`}
                      onClick={col.key !== "_sno" ? () => handleSort(col.key) : undefined}
                    >
                      {col.label}
                      {sortCol === col.key && <span className={styles.sortArrow}>{sortAsc ? "↑" : "↓"}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row, idx) => (
                  <tr key={row._rowIdx} className={styles.tr}>
                    <td className={`${styles.td} ${styles.sno}`}>{idx + 1}</td>
                    <td className={`${styles.td} ${styles.tdMono}`}>{row["Timestamp"] || "—"}</td>
                    <td className={styles.td}>{row["Department"] || "—"}</td>
                    <td className={`${styles.td} ${styles.tdBold} ${styles.tdWide}`}>{row["Item Name"] || "—"}</td>
                    <td className={styles.td}>{row["Machine Name"] || "—"}</td>
                    <td className={`${styles.td} ${styles.tdMono} ${styles.tdNarrow}`}>{row["Machine ID"] || "—"}</td>
                    <td className={styles.td}><span className={styles.tdRkd}>{row["Store RKD Number"] || "—"}</span></td>
                    <td className={styles.td}>{row["Person Filling Name"] || "—"}</td>
                    <td className={`${styles.td} ${styles.tdNarrow}`}>{fmtNum(row["Require Qty"])}</td>
                    <td className={`${styles.td} ${styles.tdQty} ${styles.tdNarrow}`}>{fmtNum(row["Issue Qty"])}</td>
                    <td className={`${styles.td} ${styles.tdPrice} ${styles.tdNarrow}`}>{fmtCurrency(row["Price"])}</td>
                    <td className={`${styles.td} ${styles.tdTotal}`}>{fmtCurrency(row["Total Price"])}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background:"#FFFBE6", borderTop:"2px solid #F5C520" }}>
                  <td colSpan={8} className={styles.td} style={{ fontWeight:800, color:"#1C1C1E", fontSize:"0.75rem", fontFamily:"'Outfit',sans-serif" }}>
                    TOTALS — {filteredData.length} entries · {selYear}
                  </td>
                  <td className={styles.td} style={{ fontWeight:800, color:"#1C1C1E", fontFamily:"'Outfit',sans-serif" }}>{fmtNum(kpis.totalIndentQty)}</td>
                  <td className={styles.td} style={{ fontWeight:800, color:"#1C1C1E", fontFamily:"'Outfit',sans-serif" }}>{fmtNum(kpis.totalIssueQty)}</td>
                  <td className={styles.td} style={{ color:"#999" }}>—</td>
                  <td className={styles.td} style={{ fontWeight:900, color:"#C9A100", fontFamily:"'Outfit',sans-serif" }}>{fmtCurrency(kpis.totalPrice)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </>
  );

  // ── Filters JSX (shared) ─────────────────────────────────────────────────
  const FiltersJSX = (
    <div className={styles.filterPanel}>
      <div className={styles.filterBar}>
        <span className={styles.filterLabel}>📅</span>
        <select id="filter-year" className={styles.filterSelect} value={selYear} onChange={e => { setSelYear(e.target.value); setDateStart(""); setDateEnd(""); }}>
          {[2024,2025,2026,2027].map(y => <option key={y} value={String(y)}>{y}{y===CURRENT_YEAR?" ★":""}</option>)}
        </select>

        <div className={styles.filterDivider} />

        <select id="filter-dept" className={styles.filterSelect} value={selDept} onChange={e => setSelDept(e.target.value)}>
          <option value="__all__">— Department —</option>
          {deptOpts.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select id="filter-machine" className={styles.filterSelect} value={selMachine} onChange={e => setSelMachine(e.target.value)}>
          <option value="__all__">— Machine —</option>
          {machineOpts.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select id="filter-machineid" className={styles.filterSelect} value={selMachineID} onChange={e => setSelMachineID(e.target.value)}>
          <option value="__all__">— Machine ID —</option>
          {machineIDOpts.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select id="filter-item" className={styles.filterSelect} value={selItem} onChange={e => setSelItem(e.target.value)}>
          <option value="__all__">— Item Name —</option>
          {itemOpts.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select id="filter-person" className={styles.filterSelect} value={selPerson} onChange={e => setSelPerson(e.target.value)}>
          <option value="__all__">— Person —</option>
          {personOpts.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select id="filter-rkd" className={styles.filterSelect} value={selRKD} onChange={e => setSelRKD(e.target.value)}>
          <option value="__all__">— Request No. —</option>
          {rkdOpts.map(v => <option key={v} value={v}>{v}</option>)}
        </select>

        <div className={styles.filterDivider} />

        <input id="filter-date-start" type="date" className={styles.filterInput} value={dateStart} onChange={e => setDateStart(e.target.value)} placeholder="From date" title="Date From" />
        <input id="filter-date-end" type="date" className={styles.filterInput} value={dateEnd} onChange={e => setDateEnd(e.target.value)} placeholder="To date" title="Date To" />
      </div>

      <div className={styles.filterActions}>
        <button id="btn-reset-filters" className={styles.resetBtn} onClick={resetFilters}>↺ Reset</button>
        <button id="btn-export-pdf" className={styles.exportBtn} onClick={handleExportPDF}>
          <Download size={13} /> Export PDF
        </button>
        <span className={styles.resultCount}>{filteredData.length} records</span>
      </div>
    </div>
  );

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push("/")}>
          <ArrowLeft size={13} /> Back
        </button>
        <div className={styles.headerCenter}>
          <BarChart3 size={17} className={styles.headerIcon} />
          <h1 className={styles.headerTitle}>Store Miscellaneous Issue Report</h1>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.rkdBadge}>
            <span className={styles.rkdR}>R</span>
            <span className={styles.rkdK}>K</span>
            <span className={styles.rkdD}>D</span>
          </div>
          <span className={styles.syncTag}>
            <RefreshCw size={10} className={loading ? styles.spinning : ""} />
            {lastSync ? `Synced ${lastSync}` : "Loading..."}
          </span>
          <button className={styles.refreshBtn} onClick={() => fetchData(false, true)} title="Force Refresh">
            <RefreshCw size={13} />
          </button>
        </div>
      </header>

      {/* ── Fullscreen Overlay ── */}
      {isFullscreen ? (
        <div className={styles.fullscreenOverlay}>
          {FiltersJSX}
          {DashboardContent}
        </div>
      ) : (
        <div className={styles.content}>
          {apiError && <div className={styles.errorBanner}>⚠️ {apiError}</div>}
          {FiltersJSX}
          {DashboardContent}
        </div>
      )}
    </div>
  );
}
