/**
 * Renders a DILR chart exhibit from a structured spec.
 *
 * WHY A COMPONENT AND NOT STORED SVG. See migration 0010: `content_sources.kind =
 * 'private'` is reserved for a student's own material, and if that ever becomes
 * writable then stored markup rendered as HTML is user-supplied HTML running in
 * someone else's page. A spec rendered here cannot carry script, whoever wrote the
 * row.
 *
 * WHY VALUES ARE NOT PRINTED ON THE MARKS. A chart question tests reading a
 * graphic. Labelling every bar with its exact figure turns it into arithmetic — the
 * same objection that makes a table a dishonest substitute for a chart in the first
 * place. So the marks carry no numbers and the student reads against the gridlines,
 * which is why the accompanying questions are written to be robust to reading
 * precision: comparisons, counts, and approximations whose options are far apart.
 *
 * Design system: mono for every number and label (that is the rule for anything
 * numeric), brass for the primary series, cleared-green for the second, drawn on
 * the dark ink panel the exhibit already sits in.
 */

export type ChartPoint = { x: string | number; y: number };
export type ChartSeries = { name: string; points: ChartPoint[] };
export type ChartSpec = {
  type: "bar" | "line" | "scatter";
  xLabel?: string;
  yLabel?: string;
  yMax?: number;
  series: ChartSeries[];
};

// Series colours, in order. Brass first because it is the accent; green second
// because it reads as distinct at small sizes without introducing a third hue.
const SERIES_COLOURS = ["#B8863B", "#6BA88A", "#E08A7E"];

/** A y-axis maximum that lands on a round number, so gridlines are readable. */
function niceMax(values: number[], override?: number): number {
  if (override !== undefined) return override;
  const peak = Math.max(0, ...values);
  if (peak === 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  // Round up to 1, 2, 2.5, 5 or 10 times the magnitude — the steps that give
  // gridlines a person can actually read a value off.
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (peak <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

export default function StimulusChart({ spec }: { spec: ChartSpec }) {
  // Fixed viewBox with a responsive width: the chart scales to the panel without
  // needing measurement, and stays legible at 360px.
  const W = 320;
  const H = 200;
  const PAD = { top: 12, right: 10, bottom: 34, left: 38 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const allY = spec.series.flatMap((s) => s.points.map((p) => p.y));
  const yMax = niceMax(allY, spec.yMax);

  const yOf = (v: number) => PAD.top + plotH - (v / yMax) * plotH;
  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);

  // Categorical x for bar and line; numeric x for scatter.
  const categories =
    spec.type === "scatter"
      ? []
      : [...new Set(spec.series.flatMap((s) => s.points.map((p) => String(p.x))))];

  const xNumeric = spec.series.flatMap((s) => s.points.map((p) => Number(p.x)));
  const xMax = spec.type === "scatter" ? niceMax(xNumeric) : 0;
  const xOfNumeric = (v: number) => PAD.left + (v / xMax) * plotW;
  const bandW = categories.length > 0 ? plotW / categories.length : plotW;
  const xOfCategory = (i: number) => PAD.left + bandW * (i + 0.5);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${spec.type} chart${spec.yLabel ? ` of ${spec.yLabel}` : ""}`}
      >
        {/* Gridlines and y-axis values — the thing the student reads against. */}
        {gridValues.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yOf(v)}
              y2={yOf(v)}
              stroke="#F4F1EA"
              strokeOpacity={v === 0 ? 0.35 : 0.14}
              strokeWidth={0.75}
            />
            <text
              x={PAD.left - 5}
              y={yOf(v) + 3}
              textAnchor="end"
              className="fill-paper/60 font-mono"
              style={{ fontSize: 8 }}
            >
              {Number.isInteger(v) ? v : v.toFixed(1)}
            </text>
          </g>
        ))}

        {spec.type === "bar" &&
          spec.series.map((s, si) => {
            // Bars sit side by side within each category band.
            const groupW = bandW * 0.62;
            const barW = groupW / spec.series.length;
            return (
              <g key={s.name}>
                {s.points.map((p) => {
                  const i = categories.indexOf(String(p.x));
                  const x = xOfCategory(i) - groupW / 2 + si * barW;
                  return (
                    <rect
                      key={String(p.x)}
                      x={x}
                      y={yOf(p.y)}
                      width={Math.max(1, barW - 1)}
                      height={Math.max(0, yOf(0) - yOf(p.y))}
                      fill={SERIES_COLOURS[si % SERIES_COLOURS.length]}
                    />
                  );
                })}
              </g>
            );
          })}

        {spec.type === "line" &&
          spec.series.map((s, si) => {
            const colour = SERIES_COLOURS[si % SERIES_COLOURS.length];
            const d = s.points
              .map((p, i) => {
                const x = xOfCategory(categories.indexOf(String(p.x)));
                return `${i === 0 ? "M" : "L"}${x} ${yOf(p.y)}`;
              })
              .join(" ");
            return (
              <g key={s.name}>
                <path d={d} fill="none" stroke={colour} strokeWidth={1.6} />
                {s.points.map((p) => (
                  <circle
                    key={String(p.x)}
                    cx={xOfCategory(categories.indexOf(String(p.x)))}
                    cy={yOf(p.y)}
                    r={2.4}
                    fill={colour}
                  />
                ))}
              </g>
            );
          })}

        {spec.type === "scatter" &&
          spec.series.map((s, si) => (
            <g key={s.name}>
              {s.points.map((p, i) => (
                <circle
                  key={i}
                  cx={xOfNumeric(Number(p.x))}
                  cy={yOf(p.y)}
                  r={2.8}
                  fill={SERIES_COLOURS[si % SERIES_COLOURS.length]}
                  fillOpacity={0.9}
                />
              ))}
            </g>
          ))}

        {/* x axis */}
        {spec.type === "scatter"
          ? [0, 0.25, 0.5, 0.75, 1].map((f) => {
              const v = f * xMax;
              return (
                <text
                  key={f}
                  x={xOfNumeric(v)}
                  y={H - PAD.bottom + 11}
                  textAnchor="middle"
                  className="fill-paper/60 font-mono"
                  style={{ fontSize: 8 }}
                >
                  {Number.isInteger(v) ? v : v.toFixed(1)}
                </text>
              );
            })
          : categories.map((c, i) => (
              <text
                key={c}
                x={xOfCategory(i)}
                y={H - PAD.bottom + 11}
                textAnchor="middle"
                className="fill-paper/60 font-mono"
                style={{ fontSize: 8 }}
              >
                {c}
              </text>
            ))}

        {spec.xLabel && (
          <text
            x={PAD.left + plotW / 2}
            y={H - 3}
            textAnchor="middle"
            className="fill-paper/45 font-mono"
            style={{ fontSize: 7.5, letterSpacing: "0.08em" }}
          >
            {spec.xLabel.toUpperCase()}
          </text>
        )}
        {spec.yLabel && (
          <text
            x={8}
            y={PAD.top + plotH / 2}
            textAnchor="middle"
            transform={`rotate(-90 8 ${PAD.top + plotH / 2})`}
            className="fill-paper/45 font-mono"
            style={{ fontSize: 7.5, letterSpacing: "0.08em" }}
          >
            {spec.yLabel.toUpperCase()}
          </text>
        )}
      </svg>

      {/* Legend, only when there is more than one series to tell apart. */}
      {spec.series.length > 1 && (
        <figcaption className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {spec.series.map((s, si) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ backgroundColor: SERIES_COLOURS[si % SERIES_COLOURS.length] }}
              />
              <span className="font-mono text-[10px] tracking-[0.04em] text-paper/70">
                {s.name}
              </span>
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
