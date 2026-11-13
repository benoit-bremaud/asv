/** Entry point of the owner scripts (`package.json` `mod:invite`, `mod:revoke`). */
import { runOwnerCommand } from "./owner-cli";

try {
  console.log(await runOwnerCommand(process.argv.slice(2), process.env));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
