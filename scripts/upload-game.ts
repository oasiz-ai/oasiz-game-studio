#!/usr/bin/env bun
/// <reference types="@types/bun" />
/**
 * Upload Game Script
 *
 * Builds and uploads a game to the Oasiz platform.
 *
 * Usage:
 *   bun run upload <game-folder>
 *   bun run scripts/upload-game.ts <game-folder>
 *
 * Requirements:
 *   - OASIZ_UPLOAD_TOKEN env var must be set
 *   - OASIZ_API_URL env var (defaults to production)
 *   - Game folder must have a publish.json file
 *
 * Example:
 *   export OASIZ_UPLOAD_TOKEN=your_token_here
 *   bun run upload block-blast
 */

import { existsSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { $ } from "bun";

// Configuration
const DEFAULT_API_URL = "https://api.oasiz.ai/api/upload/game";
const API_URL = process.env.OASIZ_API_URL || DEFAULT_API_URL;
const API_TOKEN = process.env.OASIZ_UPLOAD_TOKEN;
const CREATOR_EMAIL = process.env.OASIZ_EMAIL;

// Types
interface PublishConfig {
  title: string;
  description: string;
  category: "arcade" | "puzzle" | "party" | "action" | "strategy" | "casual";
  gameId?: string;
  isMultiplayer?: boolean;
  maxPlayers?: number;
}

interface UploadPayload {
  title: string;
  slug: string;
  description: string;
  category: string;
  email: string;
  gameId?: string;
  isMultiplayer?: boolean;
  maxPlayers?: number;
  thumbnailBase64?: string;
  bundleHtml: string;
}

// Helpers
function logInfo(message: string): void {
  console.log(`[upload-game] ${message}`);
}

function logError(message: string): void {
  console.error(`[upload-game] ERROR: ${message}`);
}

function logSuccess(message: string): void {
  console.log(`[upload-game] ✓ ${message}`);
}

async function validateEnvironment(): Promise<void> {
  if (!API_TOKEN) {
    logError("OASIZ_UPLOAD_TOKEN environment variable not set");
    console.log("");
    console.log("To set up your upload token:");
    console.log("  1. Get your token from the Oasiz team");
    console.log("  2. Add it to your shell:");
    console.log("     export OASIZ_UPLOAD_TOKEN=your_token_here");
    console.log("");
    console.log("Or add it to your ~/.zshrc or ~/.bashrc for persistence.");
    process.exit(1);
  }

  if (!CREATOR_EMAIL) {
    logError("OASIZ_EMAIL environment variable not set");
    console.log("");
    console.log("Set your registered Oasiz email:");
    console.log("  export OASIZ_EMAIL=your-email@example.com");
    console.log("");
    console.log("This email must be registered in the Oasiz platform.");
    process.exit(1);
  }
}

function getGameFolders(): string[] {
  const rootDir = resolve(import.meta.dir, "..");
  const excludeDirs = new Set([
    "scripts",
    "template",
    "node_modules",
    ".git",
    "unfinished-games",
    "perfect-drop",
  ]);

  return readdirSync(rootDir, { withFileTypes: true })
    .filter((dirent) => {
      if (!dirent.isDirectory()) return false;
      if (excludeDirs.has(dirent.name)) return false;
      if (dirent.name.startsWith(".")) return false;

      // Check if it looks like a game folder (has src/main.ts or index.html)
      const gamePath = join(rootDir, dirent.name);
      return (
        existsSync(join(gamePath, "src", "main.ts")) ||
        existsSync(join(gamePath, "index.html"))
      );
    })
    .map((dirent) => dirent.name);
}

function validateGameFolder(gameFolder: string): string {
  const rootDir = resolve(import.meta.dir, "..");
  const gamePath = join(rootDir, gameFolder);

  if (!existsSync(gamePath)) {
    logError(`Game folder not found: ${gameFolder}`);
    console.log("");
    console.log("Available game folders:");
    const folders = getGameFolders();
    folders.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }

  return gamePath;
}

async function readPublishConfig(gamePath: string): Promise<PublishConfig> {
  const publishPath = join(gamePath, "publish.json");
  const gameFolder = gamePath.split("/").pop() || "unknown";

  // Default config if publish.json doesn't exist
  const defaultConfig: PublishConfig = {
    title: gameFolder,
    description: "test",
    category: "arcade",
  };

  if (!existsSync(publishPath)) {
    logInfo(`No publish.json found, using defaults`);
    return defaultConfig;
  }

  const content = await Bun.file(publishPath).text();
  const config = JSON.parse(content) as Partial<PublishConfig>;

  // Merge with defaults for any missing fields
  return {
    title: config.title || defaultConfig.title,
    description: config.description || defaultConfig.description,
    category: config.category || defaultConfig.category,
    gameId: config.gameId,
    isMultiplayer: config.isMultiplayer,
    maxPlayers: config.maxPlayers,
  };
}

async function buildGame(gamePath: string): Promise<void> {
  const gameFolder = gamePath.split("/").pop();
  logInfo(`Building ${gameFolder}...`);

  try {
    // Always run bun install to ensure dependencies are up to date
    logInfo("Installing dependencies...");
    await $`cd ${gamePath} && bun install`.quiet();

    // Build the game using bunx to ensure vite is found
    logInfo("Running vite build...");
    await $`cd ${gamePath} && bunx --bun vite build`.quiet();
    logSuccess(`Built ${gameFolder}`);
  } catch (error) {
    logError(`Build failed for ${gameFolder}`);
    console.error(error);
    process.exit(1);
  }
}

async function readBundleHtml(gamePath: string): Promise<string> {
  const distPath = join(gamePath, "dist", "index.html");

  if (!existsSync(distPath)) {
    logError("Build output not found at dist/index.html");
    logError("Make sure the game builds correctly with: bun run build");
    process.exit(1);
  }

  return await Bun.file(distPath).text();
}

async function readThumbnail(gamePath: string): Promise<string | undefined> {
  const thumbnailDir = join(gamePath, "thumbnail");

  if (!existsSync(thumbnailDir)) {
    logInfo("No thumbnail folder found (optional)");
    return undefined;
  }

  // Find the first image file in the thumbnail directory
  const files = readdirSync(thumbnailDir);
  const imageFile = files.find((f) =>
    /\.(png|jpg|jpeg|webp|gif)$/i.test(f)
  );

  if (!imageFile) {
    logInfo("No thumbnail image found in thumbnail/ folder");
    return undefined;
  }

  const thumbnailPath = join(thumbnailDir, imageFile);
  const buffer = await Bun.file(thumbnailPath).arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const mimeType = imageFile.endsWith(".png")
    ? "image/png"
    : imageFile.endsWith(".webp")
      ? "image/webp"
      : imageFile.endsWith(".gif")
        ? "image/gif"
        : "image/jpeg";

  logSuccess(`Found thumbnail: ${imageFile}`);
  return `data:${mimeType};base64,${base64}`;
}

async function uploadGame(payload: UploadPayload): Promise<void> {
  logInfo(`Uploading ${payload.title} to ${API_URL}...`);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logError(`Upload failed (${response.status}): ${errorText}`);
      process.exit(1);
    }

    const result = (await response.json()) as { gameId?: string };
    logSuccess(`Upload complete!`);
    if (result.gameId) {
      logSuccess(`Uploaded game successfully`);
    }
  } catch (error) {
    logError(`Upload request failed: ${error}`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Handle --list flag
  if (args.includes("--list") || args.includes("-l")) {
    console.log("Available games:");
    const folders = getGameFolders();
    folders.forEach((f) => {
      const hasPublish = existsSync(
        join(resolve(import.meta.dir, ".."), f, "publish.json")
      );
      console.log(`  ${hasPublish ? "✓" : "○"} ${f}`);
    });
    console.log("");
    console.log("✓ = has publish.json, ○ = needs publish.json");
    process.exit(0);
  }

  // Handle --help flag
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    console.log("Usage: bun run upload <game-folder> [options]");
    console.log("");
    console.log("Options:");
    console.log("  --list, -l     List available game folders");
    console.log("  --skip-build   Skip the build step (use existing dist/)");
    console.log("  --dry-run      Build but don't upload (test mode)");
    console.log("  --help, -h     Show this help message");
    console.log("");
    console.log("Examples:");
    console.log("  bun run upload block-blast");
    console.log("  bun run upload two-dots --skip-build");
    console.log("  bun run upload --list");
    console.log("");
    console.log("Environment:");
    console.log("  OASIZ_UPLOAD_TOKEN  Your API token (required)");
    console.log("  OASIZ_EMAIL         Your registered Oasiz email (required)");
    console.log("  OASIZ_API_URL       API endpoint (optional, has default)");
    process.exit(0);
  }

  const gameFolder = args[0];
  const skipBuild = args.includes("--skip-build");
  const dryRun = args.includes("--dry-run");

  // Validate environment
  if (!dryRun) {
    await validateEnvironment();
  }

  // Validate and resolve game path
  const gamePath = validateGameFolder(gameFolder);
  logInfo(`Processing game: ${gameFolder}`);

  // Read publish config
  const publishConfig = await readPublishConfig(gamePath);
  logSuccess(`Loaded publish.json: "${publishConfig.title}"`);

  // Build the game
  if (!skipBuild) {
    await buildGame(gamePath);
  } else {
    logInfo("Skipping build (--skip-build)");
  }

  // Read the built HTML bundle
  const bundleHtml = await readBundleHtml(gamePath);
  logSuccess(`Read bundle: ${(bundleHtml.length / 1024).toFixed(1)} KB`);

  // Read thumbnail if available
  const thumbnailBase64 = await readThumbnail(gamePath);

  // Prepare payload
  const payload: UploadPayload = {
    title: publishConfig.title,
    slug: gameFolder,
    description: publishConfig.description,
    category: publishConfig.category,
    email: CREATOR_EMAIL!,
    gameId: publishConfig.gameId,
    isMultiplayer: publishConfig.isMultiplayer,
    maxPlayers: publishConfig.maxPlayers,
    thumbnailBase64,
    bundleHtml,
  };

  if (dryRun) {
    logInfo("Dry run mode - skipping upload");
    console.log("");
    console.log("Would upload:");
    console.log(`  Title: ${payload.title}`);
    console.log(`  Slug: ${payload.slug}`);
    console.log(`  Category: ${payload.category}`);
    console.log(`  Description: ${payload.description}`);
    console.log(`  Creator Email: ${payload.email}`);
    console.log(`  Has Thumbnail: ${!!payload.thumbnailBase64}`);
    console.log(`  Bundle Size: ${(payload.bundleHtml.length / 1024).toFixed(1)} KB`);
    console.log(`  Game ID: ${payload.gameId || "(will be assigned)"}`);
    process.exit(0);
  }

  // Upload!
  await uploadGame(payload);
}

main().catch((error) => {
  logError(`Unexpected error: ${error}`);
  process.exit(1);
});
