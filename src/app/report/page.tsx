"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./report.module.css";
import {
  ArrowLeft, RefreshCw, Search, FileText,
  Download, Filter, Loader2, BarChart3
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

// ── Helpers ────────────────────────────────────────────────────────────────
function toNum(v: any) {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

function parseDate(ts: string): Date {
  if (!ts) return new Date(0);
  const d = new Date(ts);
  if (!isNaN(d.getTime())) return d;
  const months: Record<string, number> = {
    january:0,february:1,march:2,april:3,may:4,june:5,
    july:6,august:7,september:8,october:9,november:10,december:11,
    jan:0,feb:1,mar:2,apr:3,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11,
  };
  const parts = ts.split(/[\s,]+/);
  const day = parseInt(parts[0], 10);
  const mon = months[parts[1]?.toLowerCase()] ?? -1;
  const year = parseInt(parts[2], 10);
  if (!isNaN(day) && mon >= 0 && !isNaN(year)) return new Date(year, mon, day);
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

  const [data, setData] = useState<IssueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState("");
  const [apiError, setApiError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm]   = useState("");
  const [selDept, setSelDept]         = useState("__all__");
  const [selMachine, setSelMachine]   = useState("__all__");
  const [selMachineID, setSelMachineID] = useState("__all__");
  const [selItem, setSelItem]         = useState("__all__");
  const [selPerson, setSelPerson]     = useState("__all__");
  const [selRKD, setSelRKD]           = useState("__all__");
  const [dateStart, setDateStart]     = useState("");
  const [dateEnd, setDateEnd]         = useState("");

  // Sort
  const [sortCol, setSortCol] = useState("Timestamp");
  const [sortAsc, setSortAsc] = useState(false);

  // ── Fetch ───────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (silent = false, refresh = false) => {
    if (!silent) setLoading(true);
    try {
      const url = refresh ? "/api/report?refresh=1" : `/api/report?t=${Date.now()}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setData(json.data || []);
        setLastSync(new Date().toLocaleTimeString("en-IN"));
        setApiError(null);
      } else {
        setApiError(json.error || "Failed to load report data");
      }
    } catch (e: any) { setApiError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Unique dropdown options ──────────────────────────────────────────────
  const uniq = (key: keyof IssueRow) =>
    Array.from(new Set(data.map(r => r[key]).filter(Boolean))).sort();

  const deptOpts     = useMemo(() => uniq("Department"),          [data]);
  const machineOpts  = useMemo(() => uniq("Machine Name"),        [data]);
  const machineIDOpts= useMemo(() => uniq("Machine ID"),          [data]);
  const itemOpts     = useMemo(() => uniq("Item Name"),           [data]);
  const personOpts   = useMemo(() => uniq("Person Filling Name"), [data]);
  const rkdOpts      = useMemo(() => uniq("Store RKD Number"),    [data]);

  // ── Filter + sort ────────────────────────────────────────────────────────
  const filteredData = useMemo(() => {
    let r = data;
    if (selDept      !== "__all__") r = r.filter(x => x["Department"]          === selDept);
    if (selMachine   !== "__all__") r = r.filter(x => x["Machine Name"]        === selMachine);
    if (selMachineID !== "__all__") r = r.filter(x => x["Machine ID"]          === selMachineID);
    if (selItem      !== "__all__") r = r.filter(x => x["Item Name"]           === selItem);
    if (selPerson    !== "__all__") r = r.filter(x => x["Person Filling Name"] === selPerson);
    if (selRKD       !== "__all__") r = r.filter(x => x["Store RKD Number"]    === selRKD);

    if (dateStart || dateEnd) {
      const s = dateStart ? new Date(dateStart)             : new Date(0);
      const e = dateEnd   ? new Date(dateEnd + "T23:59:59") : new Date(8640000000000000);
      r = r.filter(x => { const d = parseDate(x["Timestamp"]); return d >= s && d <= e; });
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      r = r.filter(x => Object.values(x).some(v => String(v).toLowerCase().includes(q)));
    }

    return [...r].sort((a, b) => {
      let va: any = a[sortCol as keyof IssueRow] ?? "";
      let vb: any = b[sortCol as keyof IssueRow] ?? "";
      if (["Require Qty","Issue Qty","Price","Total Price"].includes(sortCol)) {
        va = toNum(va); vb = toNum(vb);
      } else if (sortCol === "Timestamp") {
        va = parseDate(String(va)).getTime();
        vb = parseDate(String(vb)).getTime();
      } else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
      return va < vb ? (sortAsc ? -1 : 1) : va > vb ? (sortAsc ? 1 : -1) : 0;
    });
  }, [data, selDept, selMachine, selMachineID, selItem, selPerson, selRKD,
      dateStart, dateEnd, searchTerm, sortCol, sortAsc]);

  // ── KPIs ────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalIssueQty  = filteredData.reduce((s, r) => s + toNum(r["Issue Qty"]), 0);
    const totalPrice     = filteredData.reduce((s, r) => s + toNum(r["Total Price"]), 0);
    const totalIndentQty = filteredData.reduce((s, r) => s + toNum(r["Require Qty"]), 0);
    return { count: filteredData.length, totalIssueQty, totalPrice, totalIndentQty };
  }, [filteredData]);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(false); }
  };

  const resetFilters = () => {
    setSearchTerm(""); setSelDept("__all__"); setSelMachine("__all__");
    setSelMachineID("__all__"); setSelItem("__all__"); setSelPerson("__all__");
    setSelRKD("__all__"); setDateStart(""); setDateEnd("");
  };

  // ── PDF Export ───────────────────────────────────────────────────────────
  const handleExportPDF = async () => {
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    doc.setFillColor(28, 28, 30);
    doc.rect(0, 0, pageW, 18, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13); doc.setFont("helvetica", "bold");
    doc.text("Store Miscellaneous Issue Report", pageW / 2, 8, { align: "center" });
    doc.setFontSize(7.5); doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${now}  |  Records: ${filteredData.length}`, pageW / 2, 14, { align: "center" });

    autoTable(doc, {
      startY: 22,
      head: [["#","Timestamp","Department","Item Name","Machine","Machine ID","RKD Number","Person","Indent Qty","Issue Qty","Rate","Total Price"]],
      body: filteredData.map((r, i) => [
        i+1, r["Timestamp"], r["Department"], r["Item Name"],
        r["Machine Name"], r["Machine ID"], r["Store RKD Number"],
        r["Person Filling Name"],
        fmtNum(r["Require Qty"]), fmtNum(r["Issue Qty"]),
        fmtCurrency(r["Price"]), fmtCurrency(r["Total Price"]),
      ]),
      headStyles: { fillColor: [28,28,30], textColor: 255, fontStyle: "bold", fontSize: 7 },
      bodyStyles: { fontSize: 7, textColor: [30,41,59] },
      alternateRowStyles: { fillColor: [252,252,246] },
      foot: [["","","","","","","","TOTAL",
        fmtNum(kpis.totalIndentQty), fmtNum(kpis.totalIssueQty),
        "", fmtCurrency(kpis.totalPrice)]],
      footStyles: { fillColor: [245,197,32], textColor: [28,28,30], fontStyle: "bold", fontSize: 7.5 },
      margin: { left: 6, right: 6 },
    });
    doc.save(`RKD_Issue_Report_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  // ── Sortable column defs ─────────────────────────────────────────────────
  const COLS = [
    { label: "#",             key: "_sno",                  cls: styles.sno    },
    { label: "Timestamp",     key: "Timestamp",              cls: styles.tdMono },
    { label: "Department",    key: "Department",             cls: ""            },
    { label: "Item Name",     key: "Item Name",              cls: styles.tdBold },
    { label: "Machine Name",  key: "Machine Name",           cls: ""            },
    { label: "Machine ID",    key: "Machine ID",             cls: styles.tdMono },
    { label: "Request No.",   key: "Store RKD Number",       cls: ""            },
    { label: "Person",        key: "Person Filling Name",    cls: ""            },
    { label: "Indent Qty",    key: "Require Qty",            cls: ""            },
    { label: "Issue Qty",     key: "Issue Qty",              cls: styles.tdQty  },
    { label: "Rate",          key: "Price",                  cls: styles.tdPrice},
    { label: "Total Price",   key: "Total Price",            cls: styles.tdTotal},
  ];

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push("/")}>
          <ArrowLeft size={14} /> Back
        </button>

        <div className={styles.headerCenter}>
          <BarChart3 size={18} className={styles.headerIcon} />
          <h1 className={styles.headerTitle}>Store Miscellaneous Issue Report</h1>
        </div>

        <div className={styles.headerRight}>
          <div className={styles.rkdBadge}>
            <span className={styles.rkdR}>R</span>
            <span className={styles.rkdK}>K</span>
            <span className={styles.rkdD}>D</span>
          </div>
          <span className={styles.syncTag}>
            <RefreshCw size={11} className={loading ? styles.spinning : ""} />
            {lastSync ? `Synced ${lastSync}` : "Loading..."}
          </span>
          <button className={styles.refreshBtn} onClick={() => fetchData(false, true)} title="Force Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
      </header>

      <div className={styles.content}>
        {/* Error */}
        {apiError && <div className={styles.errorBanner}>⚠️ {apiError}</div>}

        {/* ── KPI Bento Grid ── */}
        <div className={styles.kpiRow}>
          {/* Card 1 — Entries (white) */}
          <div className={`${styles.kpiCard} ${styles.kpiWhite}`}>
            <div className={styles.kpiIconRow}>
              <div className={`${styles.kpiIcon} ${styles.kpiIconWhite}`}>📋</div>
              <span className={`${styles.kpiBadge} ${styles.kpiBadgeGreen}`}>CLOSED</span>
            </div>
            <div className={`${styles.kpiValue} ${styles.kpiValueWhite}`}>
              {kpis.count.toLocaleString("en-IN")}
            </div>
            <div className={`${styles.kpiLabel} ${styles.kpiLabelWhite}`}>Total Entries</div>
            <div className={`${styles.kpiSub} ${styles.kpiSubWhite}`}>Requirement Closed records</div>
          </div>

          {/* Card 2 — Issue Qty (yellow) */}
          <div className={`${styles.kpiCard} ${styles.kpiYellow}`}>
            <div className={styles.kpiIconRow}>
              <div className={`${styles.kpiIcon} ${styles.kpiIconYellow}`}>📦</div>
              <span className={`${styles.kpiBadge} ${styles.kpiBadgeDark}`}>ISSUED</span>
            </div>
            <div className={`${styles.kpiValue} ${styles.kpiValueYellow}`}>
              {kpis.totalIssueQty.toLocaleString("en-IN")}
            </div>
            <div className={`${styles.kpiLabel} ${styles.kpiLabelYellow}`}>Total Issue Qty</div>
            <div className={`${styles.kpiSub} ${styles.kpiSubYellow}`}>Items issued from store</div>
          </div>

          {/* Card 3 — Total Price (dark) */}
          <div className={`${styles.kpiCard} ${styles.kpiDark}`}>
            <div className={styles.kpiIconRow}>
              <div className={`${styles.kpiIcon} ${styles.kpiIconDark}`}>💰</div>
              <span className={`${styles.kpiBadge} ${styles.kpiBadgeBlack}`}>VALUE</span>
            </div>
            <div className={`${styles.kpiValue} ${styles.kpiValueDark}`}>
              {fmtShort(kpis.totalPrice)}
            </div>
            <div className={`${styles.kpiLabel} ${styles.kpiLabelDark}`}>Grand Total Price</div>
            <div className={`${styles.kpiSub} ${styles.kpiSubDark}`}>{fmtCurrency(kpis.totalPrice)}</div>
          </div>

          {/* Card 4 — Indent Qty (neutral) */}
          <div className={`${styles.kpiCard} ${styles.kpiNeutral}`}>
            <div className={styles.kpiIconRow}>
              <div className={`${styles.kpiIcon} ${styles.kpiIconNeutral}`}>📝</div>
              <span className={`${styles.kpiBadge} ${styles.kpiBadgeGreen}`}>REQUESTED</span>
            </div>
            <div className={`${styles.kpiValue} ${styles.kpiValueNeutral}`}>
              {kpis.totalIndentQty.toLocaleString("en-IN")}
            </div>
            <div className={`${styles.kpiLabel} ${styles.kpiLabelNeutral}`}>Total Indent Qty</div>
            <div className={`${styles.kpiSub} ${styles.kpiSubNeutral}`}>Total items requested</div>
          </div>
        </div>

        {/* ── Filter Panel ── */}
        <div className={styles.filterPanel}>
          <div className={styles.filterTitle}>
            <Filter size={12} /> Filters
          </div>
          <div className={styles.filterGrid}>
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Department Name</label>
              <select id="filter-dept" className={styles.filterSelect} value={selDept} onChange={e => setSelDept(e.target.value)}>
                <option value="__all__">— All Departments —</option>
                {deptOpts.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Machine Name</label>
              <select id="filter-machine" className={styles.filterSelect} value={selMachine} onChange={e => setSelMachine(e.target.value)}>
                <option value="__all__">— All Machines —</option>
                {machineOpts.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Machine ID</label>
              <select id="filter-machineid" className={styles.filterSelect} value={selMachineID} onChange={e => setSelMachineID(e.target.value)}>
                <option value="__all__">— All Machine IDs —</option>
                {machineIDOpts.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Item Name</label>
              <select id="filter-item" className={styles.filterSelect} value={selItem} onChange={e => setSelItem(e.target.value)}>
                <option value="__all__">— All Items —</option>
                {itemOpts.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Person Filling Form</label>
              <select id="filter-person" className={styles.filterSelect} value={selPerson} onChange={e => setSelPerson(e.target.value)}>
                <option value="__all__">— All Persons —</option>
                {personOpts.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Request Number</label>
              <select id="filter-rkd" className={styles.filterSelect} value={selRKD} onChange={e => setSelRKD(e.target.value)}>
                <option value="__all__">— All Request Numbers —</option>
                {rkdOpts.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Date From</label>
              <input id="filter-date-start" type="date" className={styles.filterInput} value={dateStart} onChange={e => setDateStart(e.target.value)} />
            </div>
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Date To</label>
              <input id="filter-date-end" type="date" className={styles.filterInput} value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
            </div>
          </div>
          <div className={styles.filterActions}>
            <button id="btn-reset-filters" className={styles.resetBtn} onClick={resetFilters}>
              ↺ Reset Filters
            </button>
            <button id="btn-export-pdf" className={styles.exportBtn} onClick={handleExportPDF}>
              <Download size={14} /> Export PDF
            </button>
            <span className={styles.resultCount}>{filteredData.length} records found</span>
          </div>
        </div>

        {/* ── Table ── */}
        <div className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <div className={styles.tableHeaderTitle}>
              <FileText size={15} />
              Issue Register
              <span className={styles.tableBadge}>{filteredData.length}</span>
            </div>
            <div className={styles.searchRow}>
              <div className={styles.searchBox}>
                <Search size={13} className={styles.searchIcon} />
                <input
                  id="table-search"
                  type="text"
                  placeholder="Search any field..."
                  className={styles.searchInput}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className={styles.tableWrap}>
            {loading ? (
              <div className={styles.loaderCenter}>
                <Loader2 className={styles.spin} size={32} />
                <p>Loading Report Data...</p>
              </div>
            ) : filteredData.length === 0 ? (
              <div className={styles.emptyState}>
                <FileText size={38} opacity={0.25} />
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
                        {sortCol === col.key && (
                          <span className={styles.sortArrow}>{sortAsc ? "↑" : "↓"}</span>
                        )}
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
                      <td className={`${styles.td} ${styles.tdBold}`}>{row["Item Name"] || "—"}</td>
                      <td className={styles.td}>{row["Machine Name"] || "—"}</td>
                      <td className={`${styles.td} ${styles.tdMono}`}>{row["Machine ID"] || "—"}</td>
                      <td className={styles.td}>
                        <span className={styles.tdRkd}>{row["Store RKD Number"] || "—"}</span>
                      </td>
                      <td className={styles.td}>{row["Person Filling Name"] || "—"}</td>
                      <td className={styles.td}>{fmtNum(row["Require Qty"])}</td>
                      <td className={`${styles.td} ${styles.tdQty}`}>{fmtNum(row["Issue Qty"])}</td>
                      <td className={`${styles.td} ${styles.tdPrice}`}>{fmtCurrency(row["Price"])}</td>
                      <td className={`${styles.td} ${styles.tdTotal}`}>{fmtCurrency(row["Total Price"])}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#FFFBE6", borderTop: "2px solid #F5C520" }}>
                    <td colSpan={8} className={styles.td} style={{ fontWeight: 800, color: "#1C1C1E", fontSize: "0.82rem", fontFamily: "'Outfit', sans-serif" }}>
                      TOTALS — {filteredData.length} entries
                    </td>
                    <td className={styles.td} style={{ fontWeight: 800, color: "#1C1C1E", fontFamily: "'Outfit', sans-serif" }}>{fmtNum(kpis.totalIndentQty)}</td>
                    <td className={styles.td} style={{ fontWeight: 800, color: "#1C1C1E", fontFamily: "'Outfit', sans-serif" }}>{fmtNum(kpis.totalIssueQty)}</td>
                    <td className={styles.td} style={{ color: "#999" }}>—</td>
                    <td className={styles.td} style={{ fontWeight: 900, color: "#D4A800", fontFamily: "'Outfit', sans-serif", fontSize: "0.92rem" }}>{fmtCurrency(kpis.totalPrice)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
