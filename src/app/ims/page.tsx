"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./ims.module.css";
import {
  Search, Loader2, Package, AlertTriangle, TrendingDown,
  CheckCircle, DollarSign, ArrowLeft, RefreshCw, BarChart3,
  AlertOctagon, Zap, ShieldAlert
} from "lucide-react";

const IMS_HEADERS = [
  "Item Name", "Units", "Minimum Stock", "Delivery Time",
  "Safety Factor", "Min Qty to Maintain", "Opening Stock",
  "Issue Qty", "Received Qty", "Remaining Stock",
  "Price per Unit", "Total Price Value"
];

type FilterType = "all" | "out_of_stock" | "critical" | "below_min" | "adequate" | "high_value";

function toNum(val: any): number {
  const n = parseFloat(String(val).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

function getStockStatus(item: any): "out" | "critical" | "below" | "adequate" {
  const remaining = toNum(item["Remaining Stock"]);
  const minQty = toNum(item["Min Qty to Maintain"]);
  const minStock = toNum(item["Minimum Stock"]);
  const threshold = minQty > 0 ? minQty : minStock;

  if (remaining <= 0) return "out";
  if (threshold > 0 && remaining < threshold * 0.30) return "critical";
  if (threshold > 0 && remaining < threshold) return "below";
  return "adequate";
}

export default function ImsPage() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<string>("");
  const [apiError, setApiError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [sortCol, setSortCol] = useState<string>("Remaining Stock");
  const [sortAsc, setSortAsc] = useState(true);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);
      const res = await fetch(`/api/ims?t=${Date.now()}`, { signal: controller.signal });
      clearTimeout(timer);
      const json = await res.json();
      if (json.success) {
        setData(json.data || []);
        setLastSync(new Date().toLocaleTimeString("en-IN"));
        setApiError(null);
      } else {
        setApiError(json.error || "Failed to fetch IMS data");
      }
    } catch (err: any) {
      if (err.name !== "AbortError") setApiError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Scorecards
  const scorecards = useMemo(() => {
    let outOfStock = 0, critical = 0, belowMin = 0, adequate = 0;
    let totalValue = 0;
    data.forEach(item => {
      const status = getStockStatus(item);
      if (status === "out") outOfStock++;
      else if (status === "critical") critical++;
      else if (status === "below") belowMin++;
      else adequate++;
      totalValue += toNum(item["Total Price Value"]);
    });
    return { total: data.length, outOfStock, critical, belowMin, adequate, totalValue };
  }, [data]);

  // Filtered + Sorted data
  const filtered = useMemo(() => {
    let result = data;

    // Filter by chip
    if (activeFilter === "out_of_stock") result = result.filter(i => getStockStatus(i) === "out");
    else if (activeFilter === "critical") result = result.filter(i => getStockStatus(i) === "critical");
    else if (activeFilter === "below_min") result = result.filter(i => getStockStatus(i) === "below");
    else if (activeFilter === "adequate") result = result.filter(i => getStockStatus(i) === "adequate");
    else if (activeFilter === "high_value") {
      result = [...result].sort((a, b) => toNum(b["Total Price Value"]) - toNum(a["Total Price Value"])).slice(0, 50);
    }

    // Search
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(item =>
        Object.values(item).some(v => String(v).toLowerCase().includes(q))
      );
    }

    // Sort
    if (activeFilter !== "high_value") {
      result = [...result].sort((a, b) => {
        const va = toNum(a[sortCol]) || String(a[sortCol] || "").toLowerCase();
        const vb = toNum(b[sortCol]) || String(b[sortCol] || "").toLowerCase();
        if (va < vb) return sortAsc ? -1 : 1;
        if (va > vb) return sortAsc ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [data, activeFilter, searchTerm, sortCol, sortAsc]);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(true); }
  };

  const fmtNum = (val: any) => {
    const n = toNum(val);
    if (n === 0) return "—";
    return n % 1 === 0 ? n.toLocaleString("en-IN") : n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  };

  const fmtCurrency = (val: any) => {
    const n = toNum(val);
    if (n === 0) return "—";
    return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  };

  const statusBadge = (item: any) => {
    const s = getStockStatus(item);
    if (s === "out") return <span className={styles.badgeOut}>Out of Stock</span>;
    if (s === "critical") return <span className={styles.badgeCritical}>Critical</span>;
    if (s === "below") return <span className={styles.badgeBelow}>Below Min</span>;
    return <span className={styles.badgeOk}>Adequate</span>;
  };

  const stockBarPct = (item: any) => {
    const remaining = toNum(item["Remaining Stock"]);
    const minQty = toNum(item["Min Qty to Maintain"]) || toNum(item["Minimum Stock"]);
    if (minQty <= 0) return 100;
    const pct = (remaining / minQty) * 100;
    return Math.min(pct, 200);
  };

  const stockBarColor = (item: any) => {
    const s = getStockStatus(item);
    if (s === "out") return "#ef4444";
    if (s === "critical") return "#f97316";
    if (s === "below") return "#eab308";
    return "#22c55e";
  };

  return (
    <div className={styles.page}>
      {/* Decorative blobs */}
      <div className={styles.blob1} />
      <div className={styles.blob2} />
      <div className={styles.blob3} />

      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push("/")}>
          <ArrowLeft size={16} /> Back
        </button>
        <div className={styles.headerCenter}>
          <BarChart3 size={22} className={styles.headerIcon} />
          <h1 className={styles.headerTitle}>Inventory Management System</h1>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.syncTag}>
            <RefreshCw size={12} className={loading ? styles.spinning : ""} />
            {lastSync ? `Synced ${lastSync}` : "Syncing..."}
          </span>
          <button className={styles.refreshBtn} onClick={() => fetchData()}>
            <RefreshCw size={14} />
          </button>
        </div>
      </header>

      <div className={styles.content}>
        {/* Error Banner */}
        {apiError && (
          <div className={styles.errorBanner}>
            <AlertTriangle size={16} /> {apiError}
          </div>
        )}

        {/* Scorecard Strip */}
        <div className={styles.scorecards}>
          <div className={`${styles.card} ${styles.cardTotal}`}>
            <Package size={20} className={styles.cardIcon} />
            <div className={styles.cardVal}>{scorecards.total}</div>
            <div className={styles.cardLabel}>Total Items</div>
          </div>
          <div className={`${styles.card} ${styles.cardOut}`}>
            <AlertOctagon size={20} className={styles.cardIcon} />
            <div className={styles.cardVal}>{scorecards.outOfStock}</div>
            <div className={styles.cardLabel}>Out of Stock</div>
          </div>
          <div className={`${styles.card} ${styles.cardCritical}`}>
            <ShieldAlert size={20} className={styles.cardIcon} />
            <div className={styles.cardVal}>{scorecards.critical}</div>
            <div className={styles.cardLabel}>Critical (&lt;30%)</div>
          </div>
          <div className={`${styles.card} ${styles.cardBelow}`}>
            <TrendingDown size={20} className={styles.cardIcon} />
            <div className={styles.cardVal}>{scorecards.belowMin}</div>
            <div className={styles.cardLabel}>Below Min</div>
          </div>
          <div className={`${styles.card} ${styles.cardOk}`}>
            <CheckCircle size={20} className={styles.cardIcon} />
            <div className={styles.cardVal}>{scorecards.adequate}</div>
            <div className={styles.cardLabel}>Adequate</div>
          </div>
          <div className={`${styles.card} ${styles.cardValue}`}>
            <DollarSign size={20} className={styles.cardIcon} />
            <div className={styles.cardVal}>{fmtCurrency(scorecards.totalValue)}</div>
            <div className={styles.cardLabel}>Total Value</div>
          </div>
        </div>

        {/* Smart Filter Chips */}
        <div className={styles.filterRow}>
          <button className={`${styles.chip} ${activeFilter === "all" ? styles.chipActive : ""}`} onClick={() => setActiveFilter("all")}>
            <Package size={13} /> All Items ({data.length})
          </button>
          <button className={`${styles.chip} ${styles.chipRed} ${activeFilter === "out_of_stock" ? styles.chipRedActive : ""}`} onClick={() => setActiveFilter("out_of_stock")}>
            <AlertOctagon size={13} /> Out of Stock ({scorecards.outOfStock})
          </button>
          <button className={`${styles.chip} ${styles.chipOrange} ${activeFilter === "critical" ? styles.chipOrangeActive : ""}`} onClick={() => setActiveFilter("critical")}>
            <ShieldAlert size={13} /> Critical &lt;30% ({scorecards.critical})
          </button>
          <button className={`${styles.chip} ${styles.chipYellow} ${activeFilter === "below_min" ? styles.chipYellowActive : ""}`} onClick={() => setActiveFilter("below_min")}>
            <TrendingDown size={13} /> Below Min Stock ({scorecards.belowMin})
          </button>
          <button className={`${styles.chip} ${styles.chipGreen} ${activeFilter === "adequate" ? styles.chipGreenActive : ""}`} onClick={() => setActiveFilter("adequate")}>
            <CheckCircle size={13} /> Adequate ({scorecards.adequate})
          </button>
          <button className={`${styles.chip} ${styles.chipPurple} ${activeFilter === "high_value" ? styles.chipPurpleActive : ""}`} onClick={() => setActiveFilter("high_value")}>
            <Zap size={13} /> Top 50 High Value
          </button>
        </div>

        {/* Search Bar */}
        <div className={styles.searchRow}>
          <div className={styles.searchBox}>
            <Search size={14} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search items, units..."
              className={styles.searchInput}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            {searchTerm && <button className={styles.clearSearch} onClick={() => setSearchTerm("")}>✕</button>}
          </div>
          <span className={styles.resultCount}>{filtered.length} records</span>
        </div>

        {/* Table */}
        <div className={styles.tableWrap}>
          {loading ? (
            <div className={styles.loaderCenter}>
              <Loader2 className={styles.spin} size={32} />
              <p>Loading IMS Data...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.emptyState}>
              <Package size={40} opacity={0.3} />
              <p>No matching items found</p>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>#</th>
                  {["Item Name", "Units", "Minimum Stock", "Delivery Time", "Min Qty to Maintain",
                    "Opening Stock", "Issue Qty", "Received Qty", "Remaining Stock",
                    "Price per Unit", "Total Price Value"].map(col => (
                    <th
                      key={col}
                      className={`${styles.th} ${styles.sortable}`}
                      onClick={() => handleSort(col)}
                    >
                      {col}
                      {sortCol === col && <span className={styles.sortArrow}>{sortAsc ? " ↑" : " ↓"}</span>}
                    </th>
                  ))}
                  <th className={styles.th}>Status</th>
                  <th className={styles.th}>Stock Level</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => {
                  const status = getStockStatus(item);
                  const pct = Math.min(stockBarPct(item), 200);
                  const barColor = stockBarColor(item);
                  const rowClass = status === "out" ? styles.rowOut
                    : status === "critical" ? styles.rowCritical
                    : status === "below" ? styles.rowBelow
                    : "";
                  return (
                    <tr key={item._id} className={`${styles.tr} ${rowClass}`}>
                      <td className={styles.td}>{idx + 1}</td>
                      <td className={`${styles.td} ${styles.itemName}`}>{item["Item Name"]}</td>
                      <td className={styles.td}>{item["Units"]}</td>
                      <td className={styles.td}>{fmtNum(item["Minimum Stock"])}</td>
                      <td className={styles.td}>{fmtNum(item["Delivery Time"])}</td>
                      <td className={styles.td}>{fmtNum(item["Min Qty to Maintain"])}</td>
                      <td className={styles.td}>{fmtNum(item["Opening Stock"])}</td>
                      <td className={styles.td}>{fmtNum(item["Issue Qty"])}</td>
                      <td className={styles.td}>{fmtNum(item["Received Qty"])}</td>
                      <td className={`${styles.td} ${styles.remainingQty}`} style={{ color: barColor, fontWeight: 700 }}>
                        {fmtNum(item["Remaining Stock"])}
                      </td>
                      <td className={styles.td}>{fmtCurrency(item["Price per Unit"])}</td>
                      <td className={`${styles.td} ${styles.totalValue}`}>{fmtCurrency(item["Total Price Value"])}</td>
                      <td className={styles.td}>{statusBadge(item)}</td>
                      <td className={styles.td}>
                        <div className={styles.stockBarWrap}>
                          <div
                            className={styles.stockBar}
                            style={{ width: `${Math.min(pct, 100)}%`, background: barColor }}
                          />
                          <span className={styles.stockPct}>{Math.round(pct)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
