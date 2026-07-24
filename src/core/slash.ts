export type ReplInput =
  | { type: "conversation"; text: string }
  | { type: "slash"; name: string; args: string[] };

export function parseReplInput(line: string): ReplInput | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("//")) {
    return { type: "conversation", text: trimmed.slice(1) };
  }

  if (!trimmed.startsWith("/")) {
    return { type: "conversation", text: trimmed };
  }

  const commandText = trimmed.slice(1).trim();
  if (!commandText) {
    return { type: "slash", name: "", args: [] };
  }

  const parts = commandText.split(/\s+/);
  return {
    type: "slash",
    name: parts[0].toLowerCase(),
    args: parts.slice(1),
  };
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution = previous[rightIndex - 1] + (
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
      );
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        substitution,
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

export function suggestSlashCommands(input: string, commands: string[]): string[] {
  const normalized = input.toLowerCase();
  const uniqueCommands = [...new Set(commands.map(command => command.toLowerCase()))];

  return uniqueCommands
    .map(command => ({
      command,
      distance: editDistance(normalized, command),
      prefix: command.startsWith(normalized) || normalized.startsWith(command),
    }))
    .filter(candidate => candidate.prefix || candidate.distance <= 2)
    .sort((left, right) =>
      Number(right.prefix) - Number(left.prefix)
      || left.distance - right.distance
      || left.command.localeCompare(right.command)
    )
    .slice(0, 3)
    .map(candidate => candidate.command);
}

export function completeSlashCommands(line: string, commands: string[]): string[] {
  const input = line.trimStart().toLowerCase();
  if (!input.startsWith("/") || input.startsWith("//") || /\s/.test(input)) return [];

  return commands
    .map(command => `/${command.toLowerCase()}`)
    .filter(command => command.startsWith(input));
}
