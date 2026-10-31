import { type ChildProcess, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const PORT = 3100;
export const BASE_URL = `http://localhost:${PORT}`;

const BUILD_TIMEOUT_MS = 5 * 60_000;
const START_TIMEOUT_MS = 30_000;
const STOP_GRACE_MS = 5_000;

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

/** Resolves with the child's exit code, or "timeout" if it is still running after `ms`. */
function exitWithin(child: ChildProcess, ms: number): Promise<number | null | "timeout"> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("timeout"), ms);
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

/** Stops a child with SIGTERM, escalating to SIGKILL if it ignores the grace period. */
async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  if ((await exitWithin(child, STOP_GRACE_MS)) !== "timeout") return;
  child.kill("SIGKILL");
  await exitWithin(child, STOP_GRACE_MS);
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
 * Prints the child's output and the message itself, then throws. Vitest can crash
 * while source-mapping a global-setup error, which would hide both.
 */
function fail(message: string, output: string): never {
  process.stderr.write(`${output}\n${message}\n`);
  throw new Error(message);
}

async function build(): Promise<void> {
  const child = next(["build"]);
  const output = capture(child);
  const code = await exitWithin(child, BUILD_TIMEOUT_MS);
  if (code === "timeout") {
    await stop(child);
    fail(`next build did not finish within ${BUILD_TIMEOUT_MS / 1000}s.`, output());
  }
  if (code !== 0) fail(`next build exited ${code}.`, output());
}

async function start(): Promise<void> {
  server = next(["start", "-p", String(PORT)]);
  const output = capture(server);
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) fail("next start exited.", output());
    if ((await statusOf(`${BASE_URL}/`)) === 200) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await teardown();
  fail(`next start did not serve ${BASE_URL}/ within ${START_TIMEOUT_MS / 1000}s.`, output());
}

export async function setup(): Promise<void> {
  // A stale server on the port would answer for the fresh build.
  if ((await statusOf(`${BASE_URL}/`)) !== undefined) {
    fail(`Port ${PORT} is already serving; stop that server first.`, "");
  }
  await build();
  await start();
}

export async function teardown(): Promise<void> {
  if (server) await stop(server);
}
