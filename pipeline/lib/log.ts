export function log(step: string, msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${step.padEnd(18)} ${msg}`);
}

export function progress(step: string, i: number, total: number, msg = ""): void {
  const pct = ((100 * i) / total).toFixed(0).padStart(3);
  log(step, `${pct}% (${i}/${total}) ${msg}`);
}
