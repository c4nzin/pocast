#!/usr/bin/env node

const args = process.argv.slice(2);
const command = args[0];

function getFlag(name) {
  return args.includes(name);
}

function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

function output(result) {
  console.log(JSON.stringify(result));
}

function gate() {
  const gateType = getArg('--gate-type');

  if (gateType === 'local-fix') {
    const count = parseInt(getArg('--local-verify-count') || '0', 10);
    const max = parseInt(getArg('--local-verify-attempts') || '3', 10);
    if (count >= max) {
      return output({
        allowed: false,
        localVerifyCount: count,
        message: `Local fix budget exhausted (${count}/${max} attempts)`,
      });
    }
    return output({
      allowed: true,
      localVerifyCount: count + 1,
      message: null,
    });
  }

  if (gateType === 'env-rerun') {
    const count = parseInt(getArg('--env-rerun-count') || '0', 10);
    if (count >= 2) {
      return output({
        allowed: false,
        envRerunCount: count,
        message: `Environment issue persists after ${count} reruns. Manual investigation needed.`,
      });
    }
    return output({
      allowed: true,
      envRerunCount: count + 1,
      message: null,
    });
  }

  output({ allowed: false, message: `Unknown gate type: ${gateType}` });
}

function postAction() {
  const action = getArg('--action');
  const cipeUrl = getArg('--cipe-url');
  const commitSha = getArg('--commit-sha');

  const cipeUrlActions = ['fix-auto-applying', 'apply-mcp', 'env-rerun'];
  const commitShaActions = [
    'apply-local-push',
    'reject-fix-push',
    'local-fix-push',
    'auto-fix-push',
    'empty-commit-push',
  ];

  const trackByCipeUrl = cipeUrlActions.includes(action);
  const trackByCommitSha = commitShaActions.includes(action);

  if (!trackByCipeUrl && !trackByCommitSha) {
    return output({ error: `Unknown action: ${action}` });
  }

  const agentTriggered = action !== 'fix-auto-applying';

  output({
    waitMode: true,
    pollCount: 0,
    lastCipeUrl: trackByCipeUrl ? cipeUrl : null,
    expectedCommitSha: trackByCommitSha ? commitSha : null,
    agentTriggered,
  });
}

function cycleCheck() {
  const status = getArg('--code');
  const wasAgentTriggered = getFlag('--agent-triggered');
  let cycleCount = parseInt(getArg('--cycle-count') || '0', 10);
  const maxCycles = parseInt(getArg('--max-cycles') || '10', 10);
  let envRerunCount = parseInt(getArg('--env-rerun-count') || '0', 10);

  if (wasAgentTriggered) cycleCount++;

  if (status !== 'environment_issue') envRerunCount = 0;

  const approachingLimit = cycleCount >= maxCycles - 2;

  output({
    cycleCount,
    agentTriggered: false,
    envRerunCount,
    approachingLimit,
    message: approachingLimit
      ? `Approaching cycle limit (${cycleCount}/${maxCycles})`
      : null,
  });
}

switch (command) {
  case 'gate':
    gate();
    break;
  case 'post-action':
    postAction();
    break;
  case 'cycle-check':
    cycleCheck();
    break;
  default:
    output({ error: `Unknown command: ${command}` });
}
