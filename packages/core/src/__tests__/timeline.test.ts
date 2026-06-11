import { describe, it, expect, beforeEach } from 'vitest';
import { timelineManager } from '../timeline';

describe('TimelineManager', () => {
  beforeEach(() => {
    timelineManager.clearAll();
  });

  it('should record milestones and return the latest session timeline', () => {
    const ip = '192.168.1.100';
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

    timelineManager.recordMilestone(ip, userAgent, 'Mogo.swf served');
    timelineManager.recordMilestone(ip, userAgent, 'Login.swf served');
    timelineManager.recordMilestone(ip, userAgent, 'Login.aspx served');

    const latest = timelineManager.getLatestSession();
    expect(latest).toBeDefined();
    expect(latest.ip).toBe('192.168.1.100');
    expect(latest.userAgent).toBe(userAgent);
    expect(latest.milestones.length).toBe(3);
    expect(latest.milestones[0].name).toBe('Mogo.swf served');
    expect(latest.milestones[1].name).toBe('Login.swf served');
    expect(latest.milestones[2].name).toBe('Login.aspx served');
    expect(latest.tcpMissingWarningFired).toBe(false);
  });

  it('should normalize client IP addresses', () => {
    const ipLocal = '::1';
    const ipMapped = '::ffff:192.168.1.200';
    const userAgent = 'Mozilla/5.0';

    timelineManager.recordMilestone(ipLocal, userAgent, 'Mogo.swf served');
    let latest = timelineManager.getLatestSession();
    expect(latest.ip).toBe('127.0.0.1');

    timelineManager.recordMilestone(ipMapped, userAgent, 'Mogo.swf served');
    latest = timelineManager.getLatestSession();
    expect(latest.ip).toBe('192.168.1.200');
  });

  it('should match TCP milestones (no user agent) to the latest session of the same IP', () => {
    const ip = '127.0.0.1';
    const userAgent = 'TestBrowser';

    timelineManager.recordMilestone(ip, userAgent, 'Mogo.swf served');
    timelineManager.recordMilestone(ip, userAgent, 'Servers.aspx served');

    // TCP connection with same IP but no UA
    timelineManager.recordMilestone(ip, null, 'first TCP connection');

    const latest = timelineManager.getLatestSession();
    expect(latest.milestones.length).toBe(4);
    expect(latest.milestones[2].name).toBe('first TCP connection');
    expect(latest.milestones[3].name).toBe('originalFlowServerSelected');
    expect(latest.serversServedAt).toBeDefined();
    expect(latest.tcpObservedAt).toBeDefined();
    expect(latest.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('should start a fresh session on Mogo.swf served', () => {
    const ip = '127.0.0.1';
    const userAgent = 'Browser';

    timelineManager.recordMilestone(ip, userAgent, 'Mogo.swf served');
    timelineManager.recordMilestone(ip, userAgent, 'Login.swf served');

    const firstSessionId = timelineManager.getLatestSession().id;

    // Relaunch (Mogo.swf served again)
    timelineManager.recordMilestone(ip, userAgent, 'Mogo.swf served');

    const latest = timelineManager.getLatestSession();
    expect(latest.id).not.toBe(firstSessionId);
    expect(latest.milestones.length).toBe(1);
    expect(latest.milestones[0].name).toBe('Mogo.swf served');
  });

  it('should record loading screen requested milestone and clear loading screen timer', () => {
    const ip = '127.0.0.1';
    const userAgent = 'Browser';

    timelineManager.recordMilestone(ip, userAgent, 'Mogo.swf served');
    timelineManager.recordMilestone(ip, userAgent, 'Main.swf served');
    timelineManager.recordMilestone(ip, userAgent, 'LoadingScreen_1.swf served');

    const latest = timelineManager.getLatestSession();
    expect(latest.loadingScreenRequestedAt).toBeDefined();
    expect(latest.loadingScreenMissingWarningFired).toBe(false);
  });
});
