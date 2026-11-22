// End-to-end regression test for the git-autosave plugin.
//
// Drives the plugin exactly as the Host does — `apply(ctx, config)`, then a
// `session/event` notification of type `turn/end` — against throwaway git
// repositories, and asserts the commits it leaves behind.
//
//   node test/e2e.mjs
//
// The confined DSH sandbox forbids piped child stdio, so every child process
// here writes stdout and stderr into temporary files read after exit. A normal
// shell has no such restriction but the file form works everywhere.
import { spawn } from 'node:child_process'
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mod = await import(new URL('../index.js', import.meta.url))
const failures = []
const created = []
const scratch = mkdtempSync(join(tmpdir(), 'git-autosave-io-'))
let ioCounter = 0

const check = (name, condition, detail) => {
  if (condition) console.log(`PASS ${name}`)
  else { console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`); failures.push(name) }
}

/** Spawn a child whose stdout and stderr land in files, not pipes. */
function spawnToFiles(command, args, options = {}) {
  const id = ++ioCounter
  const outPath = join(scratch, `${id}.out`)
  const errPath = join(scratch, `${id}.err`)
  const outFd = openSync(outPath, 'w')
  const errFd = openSync(errPath, 'w')
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: ['ignore', outFd, errFd],
  })
  const done = new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => {
      closeSync(outFd)
      closeSync(errFd)
      resolve({ exitCode: code, stdout: readFileSync(outPath, 'utf8'), stderr: readFileSync(errPath, 'utf8') })
    })
  })
  done.catch(() => {})
  return {
    done,
    terminate() { child.kill() },
    waitForExit() { return done },
    read: () => ({
      stdout: { readFrom: () => ({ text: readFileSync(outPath, 'utf8'), lossy: false }) },
      stderr: { readFrom: () => ({ text: readFileSync(errPath, 'utf8'), lossy: false }) },
    }),
  }
}

/** Minimal ctx.subprocess: real spawn, file-captured output. */
function fakeSubprocess() {
  return {
    async resolveExecutable(command) { return command },
    spawn(request) {
      const handle = spawnToFiles(request.argv[0], request.argv.slice(1), {
        cwd: request.cwd,
        env: { ...process.env, ...(request.env ?? {}) },
      })
      return {
        done: handle.done.then(({ exitCode }) => ({ exitCode, signal: null })),
        terminate: handle.terminate,
        waitForExit: handle.waitForExit,
        get collected() { return handle.read() },
      }
    },
  }
}

/** Recording context with just the surface the plugin touches. */
function fakeCtx(log) {
  const handlers = new Map()
  return {
    ctx: {
      logger: {
        info: (m) => log.push(`info ${m}`),
        warn: (m) => log.push(`warn ${m}`),
        debug: (m) => log.push(`debug ${m}`),
      },
      effect: (fn) => { const dispose = fn(); return () => { if (typeof dispose === 'function') dispose() } },
      on: (type, handler) => { handlers.set(type, handler); return () => handlers.delete(type) },
      subprocess: fakeSubprocess(),
    },
    fire(session, event) { handlers.get('session/event')?.(session, event) },
    hasListeners: () => handlers.size > 0,
  }
}

const sh = async (cwd, args) => {
  const result = await spawnToFiles('git', args, { cwd, env: { ...process.env, GIT_CONFIG_COUNT: '0' } }).done
  return { code: result.exitCode, out: result.stdout.trim(), err: result.stderr.trim() }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const commitSubjects = async (cwd) => {
  const log = await sh(cwd, ['log', '--format=%s'])
  return log.code === 0 && log.out !== '' ? log.out.split('\n') : []
}

/** Poll until the expected commit count appears, then read the head commit. */
async function settle(cwd, expected, timeoutMs = 20_000) {
  const started = Date.now()
  let subjects = await commitSubjects(cwd)
  while (subjects.length < expected && Date.now() - started < timeoutMs) {
    await sleep(120)
    subjects = await commitSubjects(cwd)
  }
  const body = await sh(cwd, ['log', '-1', '--format=%B'])
  return { count: subjects.length, subject: subjects[0] ?? '', body: body.out, all: subjects.join(' | ') }
}

async function makeRepo(label) {
  const root = join(mkdtempSync(join(tmpdir(), 'git-autosave-')), label)
  created.push(root)
  mkdirSync(root, { recursive: true })
  await sh(root, ['init', '-q', '-b', 'main'])
  for (const args of [
    ['config', 'user.name', 'Autosave Test'],
    ['config', 'user.email', 'autosave@example.invalid'],
    ['config', 'commit.gpgsign', 'false'],
  ]) await sh(root, args)
  writeFileSync(join(root, 'README.md'), '# repo\n')
  await sh(root, ['add', '-A'])
  await sh(root, ['commit', '-q', '-m', 'chore: seed'])
  return root
}

const sessionFor = (cwd, extra = {}) => ({
  id: '4f1c2a90-0000-4000-8000-000000000001',
  header: { cwd, origin: 'user', ...extra },
  deriveMessages: () => [
    { role: 'user', content: [{ type: 'text', text: 'first task' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
    { role: 'user', content: [{ type: 'text', text: '把周报脚本\n改成读取新表格' }] },
  ],
})

try {
  // A normal turn with changes produces one commit with a task-derived subject.
  {
    const log = []
    const { ctx, fire } = fakeCtx(log)
    mod.apply(ctx, {})
    const repo = await makeRepo('normal')
    writeFileSync(join(repo, 'work.txt'), 'result\n')
    writeFileSync(join(repo, 'README.md'), '# repo\nmore\n')
    fire(sessionFor(repo), { type: 'turn/end', data: { turn: 7 } })
    const result = await settle(repo, 2)
    check('normal: one new commit', result.count === 2, `count=${result.count} log=${result.all}`)
    check('normal: subject from last user message', result.subject === 'dsh: 把周报脚本 改成读取新表格', result.subject)
    check('normal: body has turn number', result.body.includes('turn 7'), result.body)
    check('normal: body has shortstat', /file changed|files changed/.test(result.body), result.body)
    const status = await sh(repo, ['status', '--porcelain'])
    check('normal: clean work tree afterwards', status.out === '', status.out)
    check('normal: info log names the commit', log.some((l) => l.startsWith('info git-autosave: committed')), log.join(' | '))
  }

  // A turn that changed nothing creates no commit and logs no warning.
  {
    const repo = await makeRepo('idle')
    const log = []
    const { ctx, fire } = fakeCtx(log)
    mod.apply(ctx, {})
    fire(sessionFor(repo), { type: 'turn/end', data: { turn: 1 } })
    await sleep(2500)
    const subjects = await commitSubjects(repo)
    check('idle: no extra commit', subjects.length === 1, `count=${subjects.length}`)
    check('idle: no warning', !log.some((l) => l.startsWith('warn')), log.join(' | '))
  }

  // A directory outside any repository is skipped quietly.
  {
    const outside = mkdtempSync(join(tmpdir(), 'git-autosave-plain-'))
    created.push(outside)
    const log = []
    const { ctx, fire } = fakeCtx(log)
    mod.apply(ctx, {})
    writeFileSync(join(outside, 'x.txt'), 'x\n')
    fire(sessionFor(outside), { type: 'turn/end', data: { turn: 2 } })
    await sleep(2500)
    check('non-repo: no warning', !log.some((l) => l.startsWith('warn')), log.join(' | '))
    check('non-repo: skip logged at debug', log.some((l) => l.startsWith('debug') && l.includes('not inside a git repository')), log.join(' | '))
  }

  // A subdirectory Session commits only its own subtree.
  {
    const repo = await makeRepo('scoped')
    mkdirSync(join(repo, 'sub'), { recursive: true })
    mkdirSync(join(repo, 'other'), { recursive: true })
    writeFileSync(join(repo, 'sub', 's.txt'), 's1\n')
    writeFileSync(join(repo, 'other', 'o.txt'), 'o1\n')
    await sh(repo, ['add', '-A'])
    await sh(repo, ['commit', '-q', '-m', 'chore: layout'])
    const sub = join(repo, 'sub')
    const log = []
    const { ctx, fire } = fakeCtx(log)
    mod.apply(ctx, {})
    writeFileSync(join(sub, 's.txt'), 's2\n')
    writeFileSync(join(repo, 'other', 'o.txt'), 'o2\n')
    fire(sessionFor(sub), { type: 'turn/end', data: { turn: 3 } })
    const result = await settle(repo, 3)
    const files = await sh(repo, ['show', '--name-only', '--format=', 'HEAD'])
    check('scoped: commit created', result.count === 3, `count=${result.count}`)
    check('scoped: only the session subtree', files.out === 'sub/s.txt', files.out)
    const status = await sh(repo, ['status', '--porcelain'])
    check('scoped: sibling change left untouched', status.out.includes('other/o.txt'), status.out)
  }

  // Subagent turns are ignored by default.
  {
    const repo = await makeRepo('subagent')
    const log = []
    const { ctx, fire } = fakeCtx(log)
    mod.apply(ctx, {})
    writeFileSync(join(repo, 'child.txt'), 'child\n')
    fire(sessionFor(repo, { origin: 'subagent', delegationDepth: 1 }), { type: 'turn/end', data: { turn: 1 } })
    await sleep(2500)
    const subjects = await commitSubjects(repo)
    check('subagent: no commit', subjects.length === 1, `count=${subjects.length}`)
  }

  // `enabled: false` registers nothing and says why.
  {
    const log = []
    const { ctx, hasListeners } = fakeCtx(log)
    mod.apply(ctx, { enabled: false })
    check('disabled: no session/event listener', !hasListeners())
    check('disabled: explains why', log.some((l) => l.includes('disabled')), log.join(' | '))
  }

  // A custom message prefix is honoured.
  {
    const repo = await makeRepo('prefix')
    const log = []
    const { ctx, fire } = fakeCtx(log)
    mod.apply(ctx, { messagePrefix: 'checkpoint' })
    writeFileSync(join(repo, 'p.txt'), 'p\n')
    fire(sessionFor(repo), { type: 'turn/end', data: { turn: 9 } })
    const result = await settle(repo, 2)
    check('prefix: custom subject prefix', result.subject.startsWith('checkpoint: '), result.subject)
  }

  // Two back-to-back turns serialize without a git index collision.
  {
    const repo = await makeRepo('queue')
    const log = []
    const { ctx, fire } = fakeCtx(log)
    mod.apply(ctx, {})
    writeFileSync(join(repo, 'a.txt'), 'a\n')
    writeFileSync(join(repo, 'b.txt'), 'b\n')
    fire(sessionFor(repo), { type: 'turn/end', data: { turn: 1 } })
    fire(sessionFor(repo), { type: 'turn/end', data: { turn: 2 } })
    await sleep(3000)
    const subjects = await commitSubjects(repo)
    const status = await sh(repo, ['status', '--porcelain'])
    check('queue: one commit covers both turns', subjects.length === 2, `count=${subjects.length} log=${subjects.join(' | ')}`)
    check('queue: no lock or index warning', !log.some((l) => l.startsWith('warn')), log.join(' | '))
    check('queue: clean afterwards', status.out === '', status.out)
  }
} finally {
  rmSync(scratch, { recursive: true, force: true })
  for (const dir of created) rmSync(dir, { recursive: true, force: true })
}

console.log(failures.length === 0 ? '\nALL CHECKS PASSED' : `\nFAILURES: ${failures.join(', ')}`)
process.exit(failures.length === 0 ? 0 : 1)
