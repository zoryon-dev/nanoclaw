import { describe, it, expect } from 'vitest';
import path from 'path';
import { buildAgentRunnerMounts, type VolumeMount } from './container-runner.js';

describe('buildAgentRunnerMounts', () => {
  it('T1: mounts container/agent-runner/src under /app/src using the given projectRoot', () => {
    const mounts: VolumeMount[] = buildAgentRunnerMounts('/repo/root');

    expect(mounts).toHaveLength(1);
    expect(mounts[0].hostPath).toBe(path.join('/repo/root', 'container', 'agent-runner', 'src'));
    expect(mounts[0].containerPath).toBe('/app/src');
  });

  it('T2: mount is read-only (defense + no Bug D recurrence)', () => {
    const mounts = buildAgentRunnerMounts('/repo/root');
    expect(mounts[0].readonly).toBe(true);
  });

  it('T3: regression guard — hostPath must NOT reference per-session data dirs', () => {
    const mounts = buildAgentRunnerMounts('/repo/root');
    // If anyone reverts to per-session copy, hostPath would include
    // 'data/v2-sessions' or 'agent-runner-src'. Block that at the test layer.
    expect(mounts[0].hostPath).not.toContain('data/v2-sessions');
    expect(mounts[0].hostPath).not.toContain('agent-runner-src');
  });
});
