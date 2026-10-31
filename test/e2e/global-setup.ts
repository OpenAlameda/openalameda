import { type ChildProcess, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const PORT = 3100;
export const BASE_URL = `http://localhost:${PORT}`;

const root = fileURLToPath(new URL("../..", import.meta.url));
const nextBin = fileURLToPath(new URL("../../node_modules/next/dist/bin/next", import.meta.url));

// Static pages bake metadataBase in at build time, so the build needs SITE_URL
// as much as the server does. Vitest sets NODE_ENV=test, which Next warns about.
const env = { ...process.env, SITE_URL: BASE_URL, NODE_ENV: "production" as const };

let server: ChildProcess | undefined;

/** Runs Next with node directly, so killing the child kills the server itself. */
function next(args: string[]): ChildProcess {
  return spawn(process.execPath, [nextBin, ...args], { cwd: root, env });
}

/** Collects a child's output, so it is printed only when something fails. */
function capture(child: ChildProcess): () => string {
  let out = "";
  child.stdout?.on("data", (chunk) => (out += chunk));
  child.stderr?.on("data", (chunk) => (out += chunk));
  return () => out;
}

/** The response status, or undefined when nothing is listening. */
async function statusOf(url: string): Promise<number | undefined> {
  try {
    return (await fetch(url)).status;
  } catch {
    return undefined;
  }
}

/**
 * Prints the child's output itself, then throws a short error: Vitest can crash
 * while source-mapping a global-setup error, which would hide the output.
 */
function fail(message: string, output: string): never {
  process.stderr.write(`${output}\n`);
  throw new Error(message);
}

async function build(): Promise<void> {
  const child = next(["build"]);
  const output = capture(child);
  const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
  if (code !== 0) fail(`next build exited ${code}; its output is above.`, output());
}

async function start(): Promise<void> {
  server = next(["start", "-p", String(PORT)]);
  const output = capture(server);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) fail("next start exited; its output is above.", output());
    if ((await statusOf(`${BASE_URL}/`)) === 200) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await teardown();
  fail(`next start did not serve ${BASE_URL}/ within 30s; its output is above.`, output());
}

export async function setup(): Promise<void> {
  // A stale server on the port would answer for the fresh build.
  if ((await statusOf(`${BASE_URL}/`)) !== undefined) {
    throw new Error(`Port ${PORT} is already serving; stop that server first.`);
  }
  await build();
  await start();
}

export async function teardown(): Promise<void> {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise((resolve) => server?.on("exit", resolve));
  server.kill("SIGTERM");
  await exited;
}
