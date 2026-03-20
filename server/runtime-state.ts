export type AgentRuntimeState = "idle" | "processing" | "building" | "deploying" | "error";

const runtimeState = {
  agentState: "idle" as AgentRuntimeState,
  pendingConfirmations: 0,
  notebookReachable: true,
};

export function setAgentState(nextState: AgentRuntimeState) {
  runtimeState.agentState = nextState;
}

export function setPendingConfirmationCount(count: number) {
  runtimeState.pendingConfirmations = count;
}

export function setNotebookReachable(reachable: boolean) {
  runtimeState.notebookReachable = reachable;
}

export function getRuntimeState() {
  return { ...runtimeState };
}
