const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

const replacements = [
  { old: 'color: "#94a3b8", bg: "rgba(148,163,184,0.1)", border: "rgba(148,163,184,0.25)"', new: 'color: "#ffffff", bg: "rgba(148,163,184,0.3)", border: "rgba(255,255,255,0.4)"' },
  { old: 'color: "#ef4444", bg: "rgba(239,68,68,0.15)", border: "rgba(239,68,68,0.45)"', new: 'color: "#ffffff", bg: "rgba(239,68,68,0.4)", border: "rgba(255,255,255,0.4)"' },
  { old: 'color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.35)"', new: 'color: "#ffffff", bg: "rgba(245,158,11,0.4)", border: "rgba(255,255,255,0.4)"' },
  { old: 'color: "#4ade80", bg: "rgba(74,222,128,0.12)", border: "rgba(74,222,128,0.3)"', new: 'color: "#ffffff", bg: "rgba(74,222,128,0.3)", border: "rgba(255,255,255,0.4)"' },
  { old: 'color: "#a78bfa", bg: "rgba(167,139,250,0.15)", border: "rgba(167,139,250,0.4)"', new: 'color: "#ffffff", bg: "rgba(167,139,250,0.4)", border: "rgba(255,255,255,0.4)"' },
  { old: 'color: "#f97316", bg: "rgba(249,115,22,0.15)", border: "rgba(249,115,22,0.4)"', new: 'color: "#ffffff", bg: "rgba(249,115,22,0.4)", border: "rgba(255,255,255,0.4)"' },
  { old: 'color: "#38bdf8", bg: "rgba(56,189,248,0.12)", border: "rgba(56,189,248,0.35)"', new: 'color: "#ffffff", bg: "rgba(56,189,248,0.3)", border: "rgba(255,255,255,0.4)"' },
  { old: 'color: "#34d399", bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.35)"', new: 'color: "#ffffff", bg: "rgba(52,211,153,0.3)", border: "rgba(255,255,255,0.4)"' },
  { old: 'color: "#10b981", bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.4)"', new: 'color: "#ffffff", bg: "rgba(16,185,129,0.4)", border: "rgba(255,255,255,0.4)"' },
  { old: 'color: "#60a5fa", bg: "rgba(96,165,250,0.12)", border: "rgba(96,165,250,0.35)"', new: 'color: "#ffffff", bg: "rgba(96,165,250,0.3)", border: "rgba(255,255,255,0.4)"' },
  { old: 'color: "#22c55e", bg: "rgba(34,197,94,0.15)", border: "rgba(34,197,94,0.35)"', new: 'color: "#ffffff", bg: "rgba(34,197,94,0.4)", border: "rgba(255,255,255,0.4)"' },
  { old: 'color: "#94a3b8", bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.3)"', new: 'color: "#ffffff", bg: "rgba(148,163,184,0.3)", border: "rgba(255,255,255,0.4)"' }
];

for (const r of replacements) {
  code = code.split(r.old).join(r.new);
}

fs.writeFileSync('src/app/page.tsx', code);
