/**
 * config 命令 — 管理 CLI 配置
 * 用法：arti config set api.timeout 60000
 *       arti config get api.timeout
 *       arti config list
 *       arti config reset
 */
import chalk from "chalk";
import { loadConfig, getConfigValue, setConfigValue, resetConfig, getConfigPath } from "../config.js";

const SECRET_KEYS = new Set(["token", "artiDataInternalKey"]);

export function configSetCommand(key: string, value: string): void {
  try {
    setConfigValue(key, value);
    console.log(chalk.green(`  ${key} = ${value}`));
  } catch (err) {
    console.error(chalk.red(`设置失败: ${err instanceof Error ? err.message : String(err)}`));
  }
}

export function configGetCommand(key: string): void {
  const value = getConfigValue(key);
  if (value === undefined) {
    console.log(chalk.yellow(`  未找到配置项: ${key}`));
  } else {
    const rendered = isSecretConfigKey(key) && typeof value === "string" && value
      ? JSON.stringify(maskSecret(value))
      : JSON.stringify(value);
    console.log(`  ${chalk.gray(key)} = ${chalk.white(rendered)}`);
  }
}

export function configListCommand(): void {
  const config = loadConfig();
  console.log(chalk.cyan(`\n  配置文件: ${getConfigPath()}\n`));
  printObject(config as unknown as Record<string, unknown>, "  ");
}

function printObject(obj: Record<string, unknown>, prefix: string): void {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      console.log(`${prefix}${chalk.gray(key + ":")}`);
      printObject(value as Record<string, unknown>, prefix + "  ");
    } else {
      const rendered = SECRET_KEYS.has(key) && typeof value === "string" && value
        ? JSON.stringify(maskSecret(value))
        : JSON.stringify(value);
      console.log(`${prefix}${chalk.gray(key)}: ${chalk.white(rendered)}`);
    }
  }
}

function maskSecret(value: string): string {
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function isSecretConfigKey(key: string): boolean {
  return key.endsWith(".token") || key.endsWith(".artiDataInternalKey");
}

export function configResetCommand(): void {
  resetConfig();
  console.log(chalk.green("  配置已重置为默认值"));
}
