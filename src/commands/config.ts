/**
 * config 命令 — 管理 CLI 配置
 * 用法：arti config set api.timeout 60000
 *       arti config get api.timeout
 *       arti config list
 *       arti config reset
 */
import chalk from "chalk";
import { loadConfig, getConfigValue, setConfigValue, resetConfig, getConfigPath } from "../config.js";

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
    console.log(`  ${chalk.gray(key)} = ${chalk.white(JSON.stringify(value))}`);
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
      console.log(`${prefix}${chalk.gray(key)}: ${chalk.white(JSON.stringify(value))}`);
    }
  }
}

export function configResetCommand(): void {
  resetConfig();
  console.log(chalk.green("  配置已重置为默认值"));
}
