import { useState } from "react";
import { useI18n } from "../i18n";
import { usePreviewMode } from "./PreviewContext";
import { STATS_NAV, STATS_RANGES, statsPreviewData, type StatsRange, type StatsTab } from "./statsPreview";
import "../styles/stats-preview.css";

/**
 * Preview-mode statistics panel.
 *
 * Mirrors the native dashboard's sections so preview and real mode show the
 * same layout. Only fixtures are read; switching range or tab stays local and
 * never reaches the Host.
 */
export function StatsPreviewSurface() {
  const { marks } = usePreviewMode();
  const { resolvedLanguage } = useI18n();
  const zh = resolvedLanguage === "zh";
  const [range, setRange] = useState<StatsRange>("all");
  const [tab, setTab] = useState<StatsTab>("overview");
  const data = statsPreviewData(zh);
  const table = data.tables[tab];
  const maxRequests = Math.max(...data.activity.map(point => point.requests));
  const rangeFactor = range === "1h" ? 0.04 : range === "24h" ? 0.12 : range === "2d" ? 0.18 : range === "3d" ? 0.24
    : range === "7d" ? 0.38 : range === "30d" ? 0.68 : range === "90d" ? 0.88 : 1;
  const activity = range === "24h" || range === "1h"
    ? data.activity.slice(-6)
    : range === "all" ? data.activity : data.activity.slice(-Math.max(4, Math.round(data.activity.length * rangeFactor)));

  return (
    <div className="stats-preview">
      <header className="sp-head">
        <div className="sp-brand">
          <span className="sp-mark" aria-hidden="true" />{zh ? "Juling 统计" : "Juling Stats"}
          <span className="sp-chip">{zh ? "本机实时" : "Live"}</span>
          {marks ? <span className="chip gray xs">{zh ? "演示" : "Demo"}</span> : null}
        </div>
        <div className="sp-ranges" role="tablist" aria-label={zh ? "时间范围" : "Range"}>
          {STATS_RANGES.map(entry => (
            <button key={entry.id} type="button" role="tab" aria-selected={entry.id === range}
              className={entry.id === range ? "sp-range on" : "sp-range"} onClick={() => setRange(entry.id)}>
              {entry.label}
            </button>
          ))}
        </div>
      </header>
      <div className="sp-body">
        <nav className="sp-nav" aria-label={zh ? "统计分区" : "Statistics sections"}>
          {STATS_NAV.map(group => (
            <section key={group.group[1]}>
              <h2>{zh ? group.group[0] : group.group[1]}</h2>
              {group.items.map(item => (
                <button key={item.id} type="button" aria-current={item.id === tab ? "page" : undefined}
                  className={item.id === tab ? "sp-nav-item on" : "sp-nav-item"} onClick={() => setTab(item.id)}>
                  <span>{zh ? item.label[0] : item.label[1]}</span><kbd>G {item.key}</kbd>
                </button>
              ))}
            </section>
          ))}
        </nav>
        <div className="sp-main">
          {tab === "overview" ? (
            <>
              <h1>{zh ? "概览" : "Overview"}</h1>
              <p className="sp-lead">{zh ? "全部会话在所选范围内的汇总。" : "Everything across your sessions in the selected range."}</p>
              <div className="sp-kpis">
                {data.kpis.map(kpi => (
                  <div key={kpi.label[1]} className="sp-kpi">
                    <span className="sp-kpi-label">{zh ? kpi.label[0] : kpi.label[1]}</span>
                    <strong>{kpi.value}</strong>
                    {kpi.note[1] ? <span className="sp-kpi-note">{zh ? kpi.note[0] : kpi.note[1]}</span> : null}
                  </div>
                ))}
              </div>
              <div className="sp-kpis secondary">
                {data.secondary.map(kpi => (
                  <div key={kpi.label[1]} className="sp-kpi">
                    <span className="sp-kpi-label">{zh ? kpi.label[0] : kpi.label[1]}</span>
                    <strong>{kpi.value}</strong>
                  </div>
                ))}
              </div>
              <div className="sp-split">
                <section className="sp-card">
                  <h2>{zh ? "活动" : "Activity"}<span>{zh ? "按日" : "Per day"}</span></h2>
                  <ul className="sp-bars" aria-label={zh ? "每日请求" : "Daily requests"}>
                    {activity.map(point => (
                      <li key={point.label} title={`${point.label} · ${point.requests} req · ${point.tokens.toLocaleString()} tok`}>
                        <i style={{ height: `${Math.max(4, Math.round(point.requests / maxRequests * 100))}%` }} />
                        <span>{point.label}</span>
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="sp-card">
                  <h2>{zh ? "Token 构成" : "Token mix"}</h2>
                  <div className="sp-mix" role="img" aria-label={zh ? "Token 构成条形图" : "Token mix bar"}>
                    {data.tokenMix.map((entry, index) => (
                      <i key={entry.label[1]} data-i={index} style={{ width: `${entry.share}%` }} />
                    ))}
                  </div>
                  <ul className="sp-legend">
                    {data.tokenMix.map((entry, index) => (
                      <li key={entry.label[1]}><i data-i={index} />{zh ? entry.label[0] : entry.label[1]}<b>{entry.share}%</b></li>
                    ))}
                  </ul>
                </section>
              </div>
              <div className="sp-split">
                <section className="sp-card">
                  <h2>{zh ? "按来源" : "By source"}</h2>
                  <ul className="sp-sources">
                    {data.sources.map(source => (
                      <li key={source.label[1]}>
                        <span>{zh ? source.label[0] : source.label[1]}</span>
                        <b>{source.requests.toLocaleString()} req</b>
                        <span>{source.tokens}</span>
                        <em>{source.share}%</em>
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="sp-card">
                  <h2>{zh ? "最新请求" : "Latest requests"}</h2>
                  <table className="sp-table">
                    <thead><tr>
                      <th>{zh ? "模型" : "Model"}</th><th>{zh ? "时间" : "When"}</th><th>Token</th>
                      <th>{zh ? "费用" : "Cost"}</th><th>{zh ? "时延" : "Duration"}</th><th>{zh ? "状态" : "Status"}</th>
                    </tr></thead>
                    <tbody>
                      {data.latest.map((row, index) => (
                        <tr key={`${row.model}-${index}`}>
                          <td><strong>{row.model}</strong><small>{row.provider}</small></td>
                          <td>{row.when}</td><td>{row.tokens}</td><td>{row.cost}</td><td>{row.duration}</td>
                          <td><span className={row.status === "ok" ? "sp-ok" : "sp-bad"}>{row.status === "ok" ? "OK" : (zh ? "失败" : "Failed")}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>
            </>
          ) : (
            <>
              <h1>{table ? (zh ? table.title[0] : table.title[1]) : (zh ? "该分区" : "This section")}</h1>
              <p className="sp-lead">{table ? (zh ? table.subtitle[0] : table.subtitle[1]) : (zh ? "演示数据未覆盖此分区。" : "No demo data for this section.")}</p>
              {table ? (
                <section className="sp-card">
                  <table className="sp-table wide">
                    <thead><tr>{table.columns.map(column => <th key={column[1]}>{zh ? column[0] : column[1]}</th>)}</tr></thead>
                    <tbody>
                      {table.rows.map((row, index) => (
                        <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
