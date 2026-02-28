#!/usr/bin/env tsx
import React from "react";
import { render } from "ink";
import { MockApp } from "../src/testing/MockApp.js";

const validScenarios = ["slow", "burst", "mixed", "long", "error", "human", "large"] as const;

type Scenario = (typeof validScenarios)[number];

// Parse --scenario arg from process.argv
const scenarioArg = process.argv.find((_, i, arr) => arr[i - 1] === "--scenario");
const scenario = (scenarioArg ?? "mixed") as string;

if (!validScenarios.includes(scenario as Scenario)) {
  console.error(`Unknown scenario: ${scenario}`);
  console.error(`Valid scenarios: ${validScenarios.join(", ")}`);
  process.exit(1);
}

console.log(`Starting TUI dev mode with scenario: ${scenario}`);
console.log("Type a prompt and press Enter to trigger the mock agent.\n");

render(<MockApp scenario={scenario as Scenario} />);
