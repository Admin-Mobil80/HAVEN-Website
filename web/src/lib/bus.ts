// Tiny in-page event bus. In judge mode the simulator, the tablet and Priya's phone are three
// components on one page; this is how "Alexa, talk to Priya" opens the tablet and how the step
// bar speaks for Amma.

export type LogItem = {
  at: string;
  source: "alexa-sim" | "tablet" | "agent" | "rule" | "webhook" | "external" | "family";
  dir: "→" | "←" | "•";
  title: string;
  detail?: string;
  isError?: boolean;
};

type Events = {
  log: LogItem;
  "tablet:open": undefined;
  "tablet:say": string;
  "alexa:say": string;
  refresh: undefined;
};

type Handler<K extends keyof Events> = (payload: Events[K]) => void;
const handlers = new Map<keyof Events, Set<Handler<never>>>();

export function on<K extends keyof Events>(event: K, fn: Handler<K>) {
  let set = handlers.get(event);
  if (!set) handlers.set(event, (set = new Set()));
  set.add(fn as Handler<never>);
  return () => void set.delete(fn as Handler<never>);
}

export function emit<K extends keyof Events>(event: K, ...payload: Events[K] extends undefined ? [] : [Events[K]]) {
  for (const fn of handlers.get(event) ?? []) (fn as Handler<K>)(payload[0] as Events[K]);
}

export const log = (item: Omit<LogItem, "at">) => emit("log", { at: new Date().toISOString(), ...item });
