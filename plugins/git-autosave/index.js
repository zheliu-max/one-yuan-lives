/**
 * Automatic git checkpoints.
 *
 * After every finished top-level turn this plugin stages the Session working
 * directory and, when anything changed, records one local commit. Nothing is
 * pushed, no remote is contacted, and files the repository ignores stay
 * ignored. A working directory outside a git repository is skipped quietly, so
 * mounting the plugin is harmless in workspaces that are not versioned.
 *
 * Git runs through the `subprocess` capability (scrubbed environment, bounded
 * output, abortable) and never through a shell, so commit messages and paths
 * cannot be reinterpreted by a command interpreter.
 */

/** Stable Loader identity; must match the row id in `cordis.patch.yml`. */
export const name = 'git-autosave'

/** One subprocess seam is required; the plugin stays inactive without it. */
export const inject = ['subprocess']

/** In-memory cap for one git command's stdout and stderr. */
const OUTPUT_MAX_BYTES = 64 * 1024

/** Milliseconds a git child gets to exit after termination starts. */
const TERMINATE_GRACE_MS = 2_000

/** Longest commit subject carried from the Session's last user message. */
const SUBJECT_MAX_LENGTH = 60

/** Values used when the row's `config` omits a field. */
const DEFAULTS = {
  enabled: true,
  topLevelOnly: true,
  timeoutMs: 30_000,
  messagePrefix: 'dsh',
  includeStat: true,
  push: false,
}

/**
 * Read the row's `config` mapping into validated options. Missing or malformed
 * fields keep their default so a bad hand edit never disables saving silently.
 * @param raw - the Loader row's config value, possibly absent.
 * @returns validated options.
 */
function readConfig(raw) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  return {
    enabled: source.enabled === undefined ? DEFAULTS.enabled : Boolean(source.enabled),
    topLevelOnly: source.topLevelOnly === undefined ? DEFAULTS.topLevelOnly : Boolean(source.topLevelOnly),
    timeoutMs: Number.isSafeInteger(source.timeoutMs) && source.timeoutMs > 0 ? source.timeoutMs : DEFAULTS.timeoutMs,
    includeStat: source.includeStat === undefined ? DEFAULTS.includeStat : Boolean(source.includeStat),
    push: source.push === undefined ? DEFAULTS.push : Boolean(source.push),
    messagePrefix: typeof source.messagePrefix === 'string' && source.messagePrefix.trim() !== ''
      ? source.messagePrefix.trim()
      : DEFAULTS.messagePrefix,
  }
}

/**
 * Flatten one message's content into single-line plain text.
 * @param content - a message content array of typed parts, or a bare string.
 * @returns the joined text, or an empty string.
 */
function contentText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const part of content) {
    if (part !== null && typeof part === 'object' && typeof part.text === 'string') parts.push(part.text)
  }
  return parts.join(' ')
}

/**
 * Harness-injected scaffolding arrives as user-role messages (time context,
 * reminders, policy notes). They describe the session, not the task, so they
 * must never become the commit subject.
 */
const SCAFFOLDING = [
  /^time sampled/i,
  /^current (working directory|dsh file policy)/i,
  /^browser time zone/i,
  /^<system-reminder>/i,
  /^approval prompts are enabled/i,
  /^you are the root agent/i,
  /^agent teams is available/i,
]

/** Whether a user-role message is harness scaffolding rather than a request. */
function isScaffolding(text) {
  return SCAFFOLDING.some((pattern) => pattern.test(text))
}

/**
 * Derive a one-line commit subject from the last real user message of the
 * Session, which identifies the task the turn belongs to far better than a
 * timestamp. Reading derived history is best-effort: any projection failure
 * falls back to the timestamp subject.
 * @param session - the Session whose turn just ended.
 * @returns a shortened subject, or an empty string.
 */
function subjectFor(session) {
  let messages
  try {
    messages = typeof session?.deriveMessages === 'function' ? session.deriveMessages() : undefined
  } catch {
    return ''
  }
  if (!Array.isArray(messages)) return ''
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message === null || typeof message !== 'object' || message.role !== 'user') continue
    const text = contentText(message.content).replace(/\s+/g, ' ').trim()
    if (text === '' || isScaffolding(text)) continue
    return text.length > SUBJECT_MAX_LENGTH ? `${text.slice(0, SUBJECT_MAX_LENGTH - 1)}…` : text
  }
  return ''
}

/**
 * Build the complete commit message: subject, provenance, and optional stat.
 * @param settings - validated options.
 * @param session - the Session whose turn just ended.
 * @param turn - turn number carried by the `turn/end` event.
 * @param stat - `git diff --cached --shortstat` output, already trimmed.
 * @returns the message text.
 */
function commitMessage(settings, session, turn, stat) {
  const subject = subjectFor(session) || 'auto-save'
  const sessionId = typeof session?.id === 'string' ? session.id : ''
  const shortId = sessionId.length > 8 ? sessionId.slice(0, 8) : sessionId
  const lines = [
    `${settings.messagePrefix}: ${subject}`,
    '',
    `auto-saved at ${new Date().toISOString()}`,
    `session ${shortId || 'unknown'} · turn ${turn === undefined ? '?' : String(turn)}`,
  ]
  if (stat !== '') lines.push(stat)
  return lines.join('\n')
}

/**
 * Observe finished turns and checkpoint the working directory of each one.
 * Checkpoints for the same directory are serialized so two Sessions running
 * against one repository cannot interleave `add` and `commit`.
 * @param ctx - host context providing `subprocess` and a logger.
 * @param config - the Loader row's `config` mapping.
 */
export function apply(ctx, config) {
  const settings = readConfig(config)
  const log = (level, message) => {
    const write = typeof ctx.logger?.[level] === 'function' ? ctx.logger[level] : ctx.logger?.info
    if (typeof write === 'function') write.call(ctx.logger, message)
  }
  if (!settings.enabled) {
    log('info', 'git-autosave: disabled by configuration; turns are not committed')
    return
  }

  const lifetime = new AbortController()
  ctx.effect(() => () => { lifetime.abort() })

  let executable
  /**
   * Resolve the git executable once for the plugin's lifetime.
   * @returns the executable path, or null when git is unavailable.
   */
  const gitExecutable = () => {
    executable ??= Promise.resolve()
      .then(() => ctx.subprocess.resolveExecutable('git', undefined, lifetime.signal))
      .catch(() => {
        log('warn', 'git-autosave: git was not found on this host; turns are not committed')
        return null
      })
    return executable
  }

  /**
   * Run one git command with scrubbed environment, bounded output, and a
   * per-command timeout.
   * @param git - resolved executable.
   * @param args - argv after the executable; never shell-interpreted.
   * @param cwd - working directory of the command.
   * @returns exit code and collected output; spawn failures report a null code.
   */
  const runGit = async (git, args, cwd) => {
    const timeout = AbortSignal.timeout(settings.timeoutMs)
    const signal = AbortSignal.any([lifetime.signal, timeout])
    try {
      const handle = ctx.subprocess.spawn({
        argv: [git, ...args],
        cwd,
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: OUTPUT_MAX_BYTES },
          stderr: { maxBytes: OUTPUT_MAX_BYTES },
        },
        graceMs: TERMINATE_GRACE_MS,
        signal,
        // The subprocess credential scrub strips ambient GIT_CONFIG_KEY_n
        // entries, so the count must be reset; nothing here may prompt.
        env: { GIT_CONFIG_COUNT: '0', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' },
      })
      const outcome = await handle.done
      const stdout = handle.collected?.stdout?.readFrom(0)?.text ?? ''
      const stderr = handle.collected?.stderr?.readFrom(0)?.text ?? ''
      return { exitCode: outcome?.exitCode ?? null, stdout, stderr }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return { exitCode: null, stdout: '', stderr: timeout.aborted ? `timed out after ${settings.timeoutMs}ms` : reason }
    }
  }

  /**
   * Report a failed git command, keeping the ordinary "not a repository"
   * outcome out of the warning stream.
   * @param result - settled command facts.
   * @param cwd - directory the command ran in.
   */
  const reportFailure = (result, cwd) => {
    const detail = (result.stderr.trim() || result.stdout.trim()).slice(0, 400)
    if (/not a git repository|not a working tree/i.test(detail)) {
      log('debug', `git-autosave: ${cwd} is not inside a git repository; skipped`)
      return
    }
    log('warn', `git-autosave: git exited ${result.exitCode === null ? 'without a code' : result.exitCode} in ${cwd}: ${detail}`)
  }

  /**
   * Stage and commit one working directory when it has pending changes.
   * @param cwd - the Session working directory.
   * @param session - the Session whose turn just ended.
   * @param turn - turn number from the `turn/end` event.
   */
  const checkpoint = async (cwd, session, turn) => {
    if (lifetime.signal.aborted) return
    const git = await gitExecutable()
    if (git === null) return

    const staged = await runGit(git, ['add', '-A', '--', '.'], cwd)
    if (staged.exitCode !== 0) {
      reportFailure(staged, cwd)
      return
    }

    const pending = await runGit(git, ['diff', '--cached', '--quiet', '--', '.'], cwd)
    if (pending.exitCode === 0) return
    if (pending.exitCode !== 1) {
      reportFailure(pending, cwd)
      return
    }

    let stat = ''
    if (settings.includeStat) {
      const summary = await runGit(git, ['diff', '--cached', '--shortstat', '--', '.'], cwd)
      if (summary.exitCode === 0) stat = summary.stdout.replace(/\s+/g, ' ').trim()
    }

    const message = commitMessage(settings, session, turn, stat)
    const committed = await runGit(git, ['commit', '-m', message, '--', '.'], cwd)
    if (committed.exitCode !== 0) {
      reportFailure(committed, cwd)
      return
    }
    const sessionId = typeof session?.id === 'string' ? session.id.slice(0, 8) : 'unknown'
    log('info', `git-autosave: committed ${cwd} for session ${sessionId}${stat === '' ? '' : ` (${stat})`}`)

    if (settings.push) await pushRemote(git, cwd)
  }

  /**
   * Push the current branch to its upstream after a commit. A repository with
   * no remote, or a branch with no upstream, is skipped quietly: this plugin
   * must never turn a local-only workspace into an error surface. Authentication
   * comes from the host's git credential helper because the subprocess seam
   * scrubs credentials from the environment and prompting is disabled.
   * @param git - resolved executable.
   * @param cwd - the working directory that owns the repository.
   */
  const pushRemote = async (git, cwd) => {
    const remotes = await runGit(git, ['remote'], cwd)
    if (remotes.exitCode !== 0 || remotes.stdout.trim() === '') {
      log('debug', `git-autosave: ${cwd} has no git remote; commit kept local`)
      return
    }

    const branch = await runGit(git, ['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
    const name = branch.stdout.trim()
    if (branch.exitCode !== 0 || name === '' || name === 'HEAD') {
      log('debug', `git-autosave: ${cwd} is on a detached HEAD; commit kept local`)
      return
    }

    const pushed = await runGit(git, ['push', '--quiet', 'origin', name], cwd)
    if (pushed.exitCode !== 0) {
      log('warn', `git-autosave: commit kept local, push failed in ${cwd}: ${(pushed.stderr.trim() || pushed.stdout.trim()).slice(0, 300)}`)
      return
    }
    log('info', `git-autosave: pushed ${name} from ${cwd}`)
  }

  const chains = new Map()
  /**
   * Serialize checkpoint work per working directory.
   * @param cwd - the working directory that owns the queue.
   * @param task - the checkpoint to run once earlier ones settle.
   */
  const enqueue = (cwd, task) => {
    const previous = chains.get(cwd) ?? Promise.resolve()
    const next = previous.then(task, task).catch((error) => {
      const reason = error instanceof Error ? error.message : String(error)
      log('warn', `git-autosave: checkpoint in ${cwd} failed: ${reason}`)
    })
    chains.set(cwd, next)
    void next.then(() => {
      if (chains.get(cwd) === next) chains.delete(cwd)
    })
  }

  ctx.on('session/event', (session, event) => {
    if (event?.type !== 'turn/end') return
    const header = session?.header
    if (header === null || typeof header !== 'object') return
    if (settings.topLevelOnly && (header.origin === 'subagent' || (header.delegationDepth ?? 0) > 0)) return
    const cwd = header.cwd
    if (typeof cwd !== 'string' || cwd === '') return
    enqueue(cwd, () => checkpoint(cwd, session, event.data?.turn))
  })
}
