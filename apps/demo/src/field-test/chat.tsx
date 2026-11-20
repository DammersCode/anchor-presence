import type { UiProps } from "./variant";

const threads = [
  { id: "ada", name: "Ada", last: "See you at 5" },
  { id: "alan", name: "Alan", last: "Shipped it" },
  { id: "grace", name: "Grace", last: "Check the logs" },
  { id: "linus", name: "Linus", last: "Merged" },
];
const messages = [
  { id: 1, mine: false, text: "Did the deploy go out?" },
  { id: 2, mine: true, text: "Yes, five minutes ago." },
  { id: 3, mine: false, text: "Great, thanks." },
];

export function Chat({ variant }: UiProps) {
  const jumpy = variant === "jumpy";
  return (
    <div
      data-anchor="chat"
      className={jumpy ? "flex flex-col gap-4 p-4 md:flex-row" : "flex flex-wrap items-start gap-8 p-4"}
    >
      <ul
        data-anchor="chat.list"
        className={`space-y-2 rounded-lg bg-white p-2 ${jumpy ? "w-full md:w-64" : "w-[358px]"}`}
      >
        {threads.map((t) => (
          <li
            key={t.id}
            data-anchor={`chat.thread:${t.id}`}
            className="h-14 rounded px-2 py-1 text-sm hover:bg-gray-100"
          >
            <p data-anchor={`chat.thread:${t.id}.name`} className="font-medium">
              {t.name}
            </p>
            <p data-anchor={`chat.thread:${t.id}.last`} className="truncate text-xs text-gray-500">
              {t.last}
            </p>
          </li>
        ))}
      </ul>
      <section
        data-anchor="chat.pane"
        className={`flex flex-col gap-2 rounded-lg bg-white p-3 ${jumpy ? "flex-1" : "w-[358px]"}`}
      >
        <h2 data-anchor="chat.header" className="text-sm font-semibold">
          Ada
        </h2>
        <div data-anchor="chat.messages" className="flex flex-col gap-2">
          {messages.map((m) => (
            <p
              key={m.id}
              data-anchor={`chat.msg:${m.id}`}
              className={`rounded-lg px-3 py-1.5 text-sm ${m.mine ? "self-end bg-indigo-600 text-white" : "self-start bg-gray-100"} ${jumpy ? "" : "w-56"}`}
            >
              {m.text}
            </p>
          ))}
        </div>
        <form data-anchor="chat.composer" className={`flex gap-2 ${jumpy ? "flex-col md:flex-row" : ""}`}>
          <input
            data-anchor="chat.input"
            className={`rounded border px-2 py-1.5 text-sm ${jumpy ? "flex-1" : "w-60"}`}
            placeholder="Message"
          />
          <button
            data-anchor="chat.send"
            type="button"
            className={`rounded bg-indigo-600 py-1.5 text-sm text-white ${jumpy ? "px-4" : "w-20"}`}
          >
            Send
          </button>
        </form>
      </section>
    </div>
  );
}
