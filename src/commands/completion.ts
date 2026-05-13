/**
 * completion 命令 — 生成 Shell 自动补全脚本
 * 用法：arti completion bash >> ~/.bashrc
 *       arti completion zsh >> ~/.zshrc
 */
import chalk from "chalk";
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

const BASH_COMPLETION = `###-begin-arti-completions-###
_arti_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local commands="login logout whoami quick-scan quick qs full panorama fr deep dr quote market scan predict news research config watchlist insights watch export completion credits"
  local market_subs="gainers losers active"
  local config_subs="set get list reset"
  local watchlist_subs="add remove list"

  if [ "\${COMP_CWORD}" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
  elif [ "\${COMP_CWORD}" -eq 2 ]; then
    case "\${COMP_WORDS[1]}" in
      market) COMPREPLY=( $(compgen -W "\${market_subs}" -- "\${cur}") ) ;;
      config) COMPREPLY=( $(compgen -W "\${config_subs}" -- "\${cur}") ) ;;
      watchlist) COMPREPLY=( $(compgen -W "\${watchlist_subs}" -- "\${cur}") ) ;;
      completion) COMPREPLY=( $(compgen -W "bash zsh" -- "\${cur}") ) ;;
    esac
  fi
}
complete -F _arti_completions arti
###-end-arti-completions-###`;

const ZSH_COMPLETION = `###-begin-arti-completions-###
_arti() {
  local -a commands market_subs config_subs watchlist_subs
  commands=(
    'quick-scan:主产品 Quick Scan'
    'full:主产品 Full 全景研报'
    'deep:主产品 Deep 深度研报'
    'login:登录 ARTI 账户'
    'logout:退出当前账户'
    'whoami:查看当前登录状态'
    'quote:查询实时行情'
    'market:全球市场概览'
    'scan:技术指标扫描'
    'predict:综合预测分析'
    'news:财经新闻'
    'research:AI 多维研报'
    'config:配置管理'
    'watchlist:自选股管理'
    'insights:投研洞察'
    'watch:实时行情 Dashboard'
    'export:导出历史数据'
    'credits:查看 Credits 与套餐'
    'completion:生成自动补全脚本'
  )
  market_subs=('gainers:涨幅榜' 'losers:跌幅榜' 'active:活跃榜')
  config_subs=('set:设置配置项' 'get:查看配置项' 'list:列出配置' 'reset:重置配置')
  watchlist_subs=('add:添加自选' 'remove:移除自选' 'list:列出自选')

  if (( CURRENT == 2 )); then
    _describe 'command' commands
  elif (( CURRENT == 3 )); then
    case "\${words[2]}" in
      market) _describe 'subcommand' market_subs ;;
      config) _describe 'subcommand' config_subs ;;
      watchlist) _describe 'subcommand' watchlist_subs ;;
      completion) _describe 'shell' '(bash zsh)' ;;
    esac
  fi
}
compdef _arti arti
###-end-arti-completions-###`;

export function completionCommand(shell?: string): void {
  if (!shell) {
    console.log(chalk.cyan("\n  生成 Shell 自动补全脚本\n"));
    console.log(chalk.gray("  用法:"));
    console.log(chalk.white("    arti completion bash") + chalk.gray(" >> ~/.bashrc"));
    console.log(chalk.white("    arti completion zsh") + chalk.gray("  >> ~/.zshrc"));
    console.log(chalk.gray("\n  添加后重新加载 Shell 即可生效\n"));
    return;
  }

  switch (shell.toLowerCase()) {
    case "bash":
      console.log(BASH_COMPLETION);
      break;
    case "zsh":
      console.log(ZSH_COMPLETION);
      break;
    default:
      console.log(chalk.red(`不支持的 Shell: ${shell}，可用: bash, zsh`));
  }
}

/** 检测当前 Shell 类型 */
function detectShell(): "zsh" | "bash" | null {
  const shell = process.env.SHELL ?? "";
  if (shell.endsWith("/zsh")) return "zsh";
  if (shell.endsWith("/bash")) return "bash";
  try {
    const result = execSync("echo $0", { encoding: "utf-8" }).trim();
    if (result.includes("zsh")) return "zsh";
    if (result.includes("bash")) return "bash";
  } catch { /* ignore */ }
  return null;
}

const MARKER = "###-begin-arti-completions-###";

/** 一键安装补全脚本到 Shell 配置文件 */
export function installCompletion(): void {
  const shell = detectShell();
  if (!shell) {
    console.log(chalk.red("  无法检测 Shell 类型，请手动运行:"));
    console.log(chalk.white("    arti completion bash >> ~/.bashrc"));
    console.log(chalk.white("    arti completion zsh >> ~/.zshrc"));
    return;
  }

  const script = shell === "zsh" ? ZSH_COMPLETION : BASH_COMPLETION;
  const rcFile = join(homedir(), shell === "zsh" ? ".zshrc" : ".bashrc");

  // 检查是否已安装
  if (existsSync(rcFile)) {
    const content = readFileSync(rcFile, "utf-8");
    if (content.includes(MARKER)) {
      console.log(chalk.yellow(`  ⚠ 补全脚本已存在于 ${rcFile}，无需重复安装`));
      return;
    }
  }

  appendFileSync(rcFile, "\n" + script + "\n");
  console.log(chalk.green(`  ✓ 补全脚本已写入 ${rcFile}`));
  console.log(chalk.gray(`  重新打开终端或运行 ${chalk.white(`source ${rcFile}`)} 即可生效`));
}
