export type LoadingJobs = {
  jobs: ReadonlyMap<symbol, string>;
  dismissed: ReadonlySet<symbol>;
  background?: ReadonlySet<symbol>;
  lastLabel?: string;
};
export type LoadingAction =
  | { type: "begin"; id: symbol; label: string }
  | { type: "update"; id: symbol; label: string; foreground: boolean }
  | { type: "end"; id: symbol }
  | { type: "continue" };
export function loadingJobs(
  state: LoadingJobs,
  action: LoadingAction,
): LoadingJobs {
  if (action.type === "continue")
    return {
      ...state,
      dismissed: new Set([
        ...state.dismissed,
        ...visibleLoadingJobs(state).map(([id]) => id),
      ]),
    };
  if (action.type === "update" && !state.jobs.has(action.id)) return state;
  const jobs = new Map(state.jobs);
  const dismissed = new Set(state.dismissed);
  const background = new Set(state.background);
  if (action.type === "update") {
    jobs.set(action.id, action.label);
    if (action.foreground) background.delete(action.id);
    else background.add(action.id);
  } else {
    dismissed.delete(action.id);
    background.delete(action.id);
    if (action.type === "begin") jobs.set(action.id, action.label);
    else jobs.delete(action.id);
  }
  return {
    jobs,
    dismissed,
    background,
    lastLabel: action.type !== "end" ? action.label : state.lastLabel,
  };
}
export function visibleLoadingJobs(state: LoadingJobs) {
  return [...state.jobs].filter(
    ([id]) => !state.dismissed.has(id) && !state.background?.has(id),
  );
}
