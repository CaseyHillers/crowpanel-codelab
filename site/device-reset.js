export async function resetDevice(connection, { clearSource, files, onPhase = () => {} }) {
  onPhase("Restarting MicroPython…");
  await connection.softReset();
  onPhase("Deleting device files…");
  const cleared = await connection.execute(clearSource, { timeoutMs: 30000 });
  if (cleared.stderr || !cleared.stdout.split(/\r?\n/).includes("WORKSHOP FILES CLEARED")) {
    throw new Error("Clearing device files did not complete. Files may have been partially deleted; retry Reset device.");
  }
  await connection.softReset();
  onPhase("Reinstalling workshop files…");
  await connection.writeFiles(files);
  onPhase("Checking workshop imports…");
  const checked = await connection.execute("import crowpanel, weather, slides, stocks\n", { timeoutMs: 10000 });
  if (checked.stderr) throw new Error("Workshop import check failed. Retry Reset device before running a lesson.");
}
