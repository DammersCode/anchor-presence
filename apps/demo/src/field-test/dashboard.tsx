import type { UiProps } from "./variant";

const stats = [
  ["orders", "Orders", "1,284"],
  ["revenue", "Revenue", "$48.2k"],
  ["users", "Users", "9,310"],
  ["churn", "Churn", "2.1%"],
] as const;
const bars = [40, 64, 52, 80, 70, 92, 60];
const rows = [
  ["1042", "Ada Lovelace", "Paid", "$120"],
  ["1043", "Alan Turing", "Open", "$89"],
  ["1044", "Grace Hopper", "Paid", "$310"],
  ["1045", "Linus T.", "Late", "$45"],
];
const head = ["Order", "Customer", "Status", "Total"];

const card = "rounded-lg border border-gray-200 bg-white p-3 shadow-sm";

function Chart({ className }: { className: string }) {
  return (
    <div data-anchor="dash.chart" className={`${card} ${className}`}>
      <p data-anchor="dash.chart.title" className="text-sm font-medium">
        Weekly sales
      </p>
      <div data-anchor="dash.chart.bars" className="mt-3 flex h-32 items-end gap-2">
        {bars.map((h, i) => (
          <div
            key={h}
            data-anchor={`dash.bar:${i}`}
            style={{ height: `${h}%` }}
            className="flex-1 rounded bg-indigo-500"
          />
        ))}
      </div>
    </div>
  );
}

function Table({ wrap, hideCols }: { wrap: string; hideCols: boolean }) {
  const hide = (i: number) => (hideCols && i > 1 ? "hidden md:table-cell" : "");
  return (
    <div data-anchor="dash.table" className={`${card} ${wrap}`}>
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} data-anchor={`dash.col:${h.toLowerCase()}`} className={`py-1 pr-4 ${hide(i)}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} data-anchor={`dash.row:${r[0]}`}>
              {r.map((c, i) => (
                <td
                  key={head[i]}
                  data-anchor={`dash.cell:${r[0]}.${i}`}
                  className={`whitespace-nowrap py-1 pr-4 ${hide(i)}`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({
  id,
  label,
  value,
  className,
}: {
  id: string;
  label: string;
  value: string;
  className: string;
}) {
  return (
    <div data-anchor={`dash.stat:${id}`} className={`${card} ${className}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

export function Dashboard({ variant }: UiProps) {
  if (variant === "jumpy") {
    return (
      <div data-anchor="dash" className="space-y-4 p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map(([id, l, v]) => (
            <Stat key={id} id={id} label={l} value={v} className="" />
          ))}
        </div>
        <Chart className="w-full" />
        <Table wrap="w-full" hideCols />
      </div>
    );
  }
  return (
    <div data-anchor="dash" className="flex flex-wrap gap-8 p-4">
      <div data-anchor="dash.stats" className="flex w-[358px] flex-wrap gap-3">
        {stats.map(([id, l, v]) => (
          <Stat key={id} id={id} label={l} value={v} className="h-20 w-[173px]" />
        ))}
      </div>
      <Chart className="w-[358px]" />
      <Table wrap="w-[358px] overflow-x-auto" hideCols={false} />
    </div>
  );
}
