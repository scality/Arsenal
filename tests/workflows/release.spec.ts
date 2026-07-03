import { Act } from '@kie/act-js';
import { MockGithub } from '@kie/mock-github';
import path from 'path';
import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';

const exec = promisify(execCb);
const IMAGE = 'ghcr.io/catthehacker/ubuntu:act-latest';

let github: MockGithub;

async function setup(versionFixture: string, branch: string): Promise<Act> {
    // unique setup path per test so act's checkout residue can't collide with another test's repo
    const setupPath = mkdtempSync(path.join(os.tmpdir(), 'arsenal-workflows-'));
    github = new MockGithub(
        {
            repo: {
                arsenal: {
                    currentBranch: branch,
                    files: [
                        { src: path.resolve(__dirname, '../..', '.github'), dest: '.github' },
                        { src: path.resolve(__dirname, 'fixtures', versionFixture), dest: 'package.json' },
                    ],
                },
            },
        },
        setupPath,
    );
    await github.setup();
    const act = new Act(github.repo.getPath('arsenal'));
    act.setWorkflowFile('.github/workflows/release.yaml');
    act.setPlatforms('ubuntu-latest', IMAGE);
    act.setEnv('GITHUB_REPOSITORY', 'scality/Arsenal');
    act.setEnv('GITHUB_REF', `refs/heads/${branch}`);
    return act;
}

async function createTag(tag: string) {
    await exec(`git -C ${github.repo.getPath('arsenal')} tag --no-sign -m test ${tag}`);
}

const mockSteps = {
    release: [
        { name: 'Fail if release already exists', mockWith: 'echo no-release-found' },
        { name: 'Create Release', mockWith: 'echo skip-create-release' },
    ],
};

function run(act: Act) {
    return act.runEvent('workflow_dispatch', { mockSteps });
}

function step(result: { name: string; status: number }[], name: string) {
    return result.find(r => r.name === `Main ${name}`);
}

afterEach(async () => {
    await github.teardown();
});

test('rejects a release dispatched from a disallowed branch', async () => {
    const act = await setup('package-versioned.json', 'feature/not-a-release-branch');
    const result = await run(act);
    expect(step(result, 'Reject disallowed branch')?.status).toBe(1);
});

test('allows a development/* branch and runs through to the release step', async () => {
    const act = await setup('package-versioned.json', 'development/8.3');
    const result = await run(act);
    // the branch guard is `if`-gated, so it is skipped (absent) on an allowed branch
    expect(step(result, 'Reject disallowed branch')).toBeUndefined();
    expect(result.every(r => r.status === 0)).toBe(true);
    expect(step(result, 'Create Release')?.status).toBe(0);
});

test('allows a hotfix/* branch', async () => {
    const act = await setup('package-versioned.json', 'hotfix/8.3.1');
    const result = await run(act);
    expect(step(result, 'Reject disallowed branch')).toBeUndefined();
    expect(step(result, 'Create Release')?.status).toBe(0);
});

test('fails when package.json has no version', async () => {
    const act = await setup('package-no-version.json', 'development/8.3');
    const result = await run(act);
    expect(step(result, 'Read version from package.json')?.status).toBe(1);
});

test('fails when the tag already exists', async () => {
    const act = await setup('package-versioned.json', 'development/8.3');
    await createTag('8.3.12');
    const result = await run(act);
    expect(step(result, 'Fail if tag already exists')?.status).toBe(1);
});
