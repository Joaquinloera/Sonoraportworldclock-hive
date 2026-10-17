import test from 'node:test';
import assert from 'node:assert/strict';
import {runScheduledCycle} from './research-scheduler.mjs';
test('rejects absent config',async()=>await assert.rejects(runScheduledCycle(),/CONFIG_REQUIRED/));
test('rejects invalid concurrency',async()=>await assert.rejects(runScheduledCycle({queue:{},roster:{},manifest:{},workerCount:9}),/INVALID_WORKERS/));
test('rejects invalid claim budget',async()=>await assert.rejects(runScheduledCycle({queue:{},roster:{},manifest:{},maxClaims:145}),/INVALID_CLAIMS/));
