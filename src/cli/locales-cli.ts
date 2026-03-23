import type { Command } from "commander";
import { syncDocsLocales } from "../locales/sync-docs.js";
import { defaultRuntime } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";
import { runCommandWithRuntime } from "./cli-utils.js";

type LocalesSyncDocsOptions = {
  docsDir?: string;
  sourceConfig?: string;
  workspaceDir?: string;
  outputConfig?: string;
  locale?: string[];
  json?: boolean;
};

function collectRepeatedOption(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

export function registerLocalesCli(program: Command) {
  const locales = program
    .command("locales")
    .description("Sync and inspect locale packages")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/tools/plugin", "docs.openclaw.ai/tools/plugin")}\n`,
    );

  locales
    .command("sync-docs")
    .description("Materialize docs locale resources from installed locale plugins")
    .option("--docs-dir <path>", "Docs directory (default: ./docs)")
    .option("--source-config <path>", "Source docs config (default: docs.source.json or docs.json)")
    .option(
      "--workspace-dir <path>",
      "Generated docs workspace (default: docs/.generated/locale-workspace)",
    )
    .option(
      "--output-config <path>",
      "Generated docs config output path (default: <workspace>/docs.json)",
    )
    .option("--locale <id>", "Only sync one locale (repeatable)", collectRepeatedOption, [])
    .option("--json", "Print JSON output", false)
    .action(async (opts: LocalesSyncDocsOptions) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const result = await syncDocsLocales({
          docsDir: opts.docsDir,
          sourceConfigPath: opts.sourceConfig,
          workspaceDir: opts.workspaceDir,
          outputConfigPath: opts.outputConfig,
          locales: opts.locale,
        });

        if (opts.json) {
          defaultRuntime.log(JSON.stringify(result, null, 2));
          return;
        }

        defaultRuntime.log(
          `${theme.heading("Docs locale sync")} ${theme.muted(`(${result.syncedLocales.length} locale(s))`)}`,
        );
        defaultRuntime.log(`Source config: ${result.sourceConfigPath}`);
        defaultRuntime.log(`Workspace: ${result.workspaceDir}`);
        defaultRuntime.log(`Output config: ${result.outputConfigPath}`);
        if (result.syncedLocales.length === 0) {
          defaultRuntime.log(theme.muted("No locale plugins with docs resources were found."));
          return;
        }
        for (const locale of result.syncedLocales) {
          defaultRuntime.log(
            `- ${theme.command(locale.locale)} (${locale.language}) from ${locale.pluginId} -> ${locale.targetDir} ${theme.muted(`[${locale.pageCount} page(s)]`)}`,
          );
        }
      });
    });
}
