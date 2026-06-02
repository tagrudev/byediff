import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

export interface Instance {
  repoPath: string;
  port: number;
  pid: number;
}

function registryDir(): string {
  return join(homedir(), ".config", "byediff");
}

export function registryPath(): string {
  return join(registryDir(), "instances.json");
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function readInstances(): Instance[] {
  try {
    const raw = readFileSync(registryPath(), "utf8");
    const parsed = JSON.parse(raw) as Instance[];
    return parsed.filter((i) => isAlive(i.pid));
  } catch {
    return [];
  }
}

function write(instances: Instance[]): void {
  mkdirSync(registryDir(), { recursive: true });
  writeFileSync(registryPath(), JSON.stringify(instances, null, 2));
}

export function registerInstance(instance: Instance): void {
  const others = readInstances().filter((i) => i.repoPath !== instance.repoPath);
  write([...others, instance]);
}

export function unregisterInstance(repoPath: string): void {
  write(readInstances().filter((i) => i.repoPath !== repoPath));
}
