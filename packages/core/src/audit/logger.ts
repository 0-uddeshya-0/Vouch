export const auditLogger = {
  log(event: string, payload: Record<string, unknown>): void {
    console.log(JSON.stringify({ event, ...payload, at: new Date().toISOString() }));
  },
};
