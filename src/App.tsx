import { useEffect, useMemo, useRef, useState } from 'react'
import {
  generateAiResponse,
  loadApiSettings,
  saveApiSettings,
  testApi,
  type ApiSettings,
} from './ai'
import {
  actNight,
  createGame,
  getPreset,
  livingPlayers,
  makeId,
  resolveNight,
  resolveVote,
  ROLES,
  type GameState,
  type LogEntry,
  type Player,
} from './game'
import {
  clearRoomSession,
  createRoomSocket,
  loadRoomSession,
  roomInviteUrl,
  saveRoomSession,
  sendRoomMessage,
  type OnlineGameMeta,
  type RoomMessage,
  type RoomState,
} from './multiplayer'
import './App.css'

type Screen = 'home' | 'setup' | 'room' | 'reveal' | 'game'

const PLAYER_COUNTS = [6, 7, 8, 9, 10, 12, 15]
const PLAYER_AVATAR_ATLAS = `${import.meta.env.BASE_URL}player-avatar-atlas.jpg`
const ROLE_ATLAS = `${import.meta.env.BASE_URL}role-atlas.jpg`

function AtlasPortrait({ player, large = false }: { player: Player; large?: boolean }) {
  const column = player.avatar % 4
  const row = Math.floor(player.avatar / 4)
  return (
    <div
      className={`atlas-portrait ${large ? 'large' : ''}`}
      style={{
        backgroundImage: `url(${PLAYER_AVATAR_ATLAS})`,
        backgroundPosition: `${column * 33.333}% ${row * 33.333}%`,
      }}
      role="img"
      aria-label={`${player.name}的公开头像`}
    />
  )
}

function RolePortrait({ player }: { player: Player }) {
  return (
    <div
      className={`role-portrait sprite-${ROLES[player.role].sprite}`}
      style={{ backgroundImage: `url(${ROLE_ATLAS})` }}
      role="img"
      aria-label={`你的${ROLES[player.role].name}身份卡`}
    />
  )
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))

const shuffledIds = (players: Player[]) =>
  [...players]
    .map((player) => ({ id: player.id, order: Math.random() }))
    .sort((left, right) => left.order - right.order)
    .map(({ id }) => id)

function SettingsModal({
  value,
  onSave,
  onClose,
}: {
  value: ApiSettings
  onSave: (settings: ApiSettings) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(value)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState('')

  const update = <K extends keyof ApiSettings>(key: K, next: ApiSettings[K]) =>
    setDraft((current) => ({ ...current, [key]: next }))

  async function handleTest() {
    setTesting(true)
    setMessage('')
    try {
      await testApi(draft)
      setMessage('连接成功，模型可以响应。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '连接失败，请检查配置。')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <span className="eyebrow">AI CONNECTION</span>
            <h2 id="settings-title">DeepSeek 密钥设置</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭设置">
            ×
          </button>
        </header>

        <div className="cost-banner">
          <span className="cost-icon">◈</span>
          <div>
            <strong>独立角色模式</strong>
            <p>每名 AI 在轮到自己时单独请求，能真正承接前面的发言，但调用次数会随存活人数增加。</p>
          </div>
        </div>

        <label className="toggle-row">
          <span>
            <strong>启用 DeepSeek</strong>
            <small>关闭时使用免费本地策略 AI</small>
          </span>
          <input
            type="checkbox"
            checked={draft.useRemote}
            onChange={(event) => update('useRemote', event.target.checked)}
          />
        </label>

        <label>
          <span>API Key</span>
          <input
            type="password"
            autoComplete="off"
            placeholder="sk-••••••••••••••••"
            value={draft.apiKey}
            onChange={(event) => update('apiKey', event.target.value)}
          />
        </label>
        <div className="field-grid">
          <label>
            <span>API Base URL</span>
            <input
              value={draft.baseUrl}
              onChange={(event) => update('baseUrl', event.target.value)}
            />
          </label>
          <label>
            <span>模型名称</span>
            <input value={draft.model} onChange={(event) => update('model', event.target.value)} />
          </label>
        </div>

        <details>
          <summary>费用控制参数</summary>
          <div className="field-grid compact-fields">
            <label>
              <span>单轮最大 Token</span>
              <input
                type="number"
                min={120}
                max={500}
                value={draft.maxTokens}
                onChange={(event) => update('maxTokens', Number(event.target.value))}
              />
            </label>
            <label>
              <span>发言随机度</span>
              <input
                type="number"
                min={0}
                max={1.5}
                step={0.05}
                value={draft.temperature}
                onChange={(event) => update('temperature', Number(event.target.value))}
              />
            </label>
          </div>
        </details>

        <p className="privacy-note">
          密钥仅保存在当前浏览器的本地存储中，不会写入项目文件。生产部署建议通过服务端代理隐藏密钥。
        </p>
        {message && <p className="status-message">{message}</p>}
        <footer className="modal-actions">
          <button
            className="button ghost"
            onClick={handleTest}
            disabled={!draft.apiKey || testing}
          >
            {testing ? '连接中…' : '测试连接'}
          </button>
          <button
            className="button primary"
            onClick={() => {
              onSave(draft)
              onClose()
            }}
          >
            保存设置
          </button>
        </footer>
      </section>
    </div>
  )
}

function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [playerCount, setPlayerCount] = useState(9)
  const [game, setGame] = useState<GameState | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<ApiSettings>(loadApiSettings)
  const [selectedTarget, setSelectedTarget] = useState<number>()
  const [speech, setSpeech] = useState('')
  const [thinking, setThinking] = useState(false)
  const [activeSpeakerId, setActiveSpeakerId] = useState<number>()
  const [liveBubble, setLiveBubble] = useState('')
  const [speechOrder, setSpeechOrder] = useState<number[]>([])
  const [speechIndex, setSpeechIndex] = useState(0)
  const [aiVotes, setAiVotes] = useState<Record<number, number>>({})
  const [aiSource, setAiSource] = useState<'deepseek' | 'local'>('local')
  const [nightCue, setNightCue] = useState('')
  const [nightActing, setNightActing] = useState(false)
  const speakingRef = useRef<number | undefined>(undefined)
  const roomSocket = useRef<WebSocket | null>(null)
  const roomCodeRef = useRef('')
  const reconnectTimerRef = useRef<number | undefined>(undefined)
  const leavingRoomRef = useRef(false)
  const audioRef = useRef<{
    context: AudioContext
    gain: GainNode
    oscillators: OscillatorNode[]
  } | null>(null)
  const roomPlayerIdRef = useRef('')
  const onlineStartedRef = useRef(false)
  const onlineVersionRef = useRef({ matchId: '', revision: -1 })
  const [room, setRoom] = useState<RoomState | null>(null)
  const [roomPlayerId, setRoomPlayerId] = useState('')
  const [roomStatus, setRoomStatus] = useState<'connecting' | 'online' | 'offline'>('offline')
  const [roomError, setRoomError] = useState('')
  const [copied, setCopied] = useState(false)
  const [onlineMeta, setOnlineMeta] = useState<OnlineGameMeta | null>(null)
  const [countdown, setCountdown] = useState(0)
  const [wolfMessage, setWolfMessage] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(true)

  const human = game?.players.find((player) => player.isHuman)
  const role = human ? ROLES[human.role] : undefined
  const alive = game ? livingPlayers(game) : []
  const nightRoleByStep = {
    werewolf: 'werewolf',
    guard: 'guard',
    seer: 'seer',
    witch: 'witch',
  } as const
  const activeNightRole =
    game?.nightStep === 'resolve' ? undefined : nightRoleByStep[game?.nightStep ?? 'werewolf']
  const isHumanNightTurn = Boolean(human?.alive && role?.key === activeNightRole)
  const pendingWitchVictim =
    game?.wolfTarget && game.wolfTarget !== game.guardedTarget
      ? game.players.find((player) => player.id === game.wolfTarget && player.alive)
      : undefined
  const isOnlineGame = room?.status === 'playing'
  const gamePhase = game?.phase

  const expectedRoles = useMemo(() => {
    const preset = getPreset(playerCount)
    return `${preset.wolves} 狼人 · ${preset.gods} 神职 · ${
      playerCount - preset.wolves - preset.gods
    } 村民`
  }, [playerCount])

  function beginGame() {
    setGame(createGame(playerCount))
    setSelectedTarget(undefined)
    setSpeechOrder([])
    setSpeechIndex(0)
    setAiVotes({})
    setActiveSpeakerId(undefined)
    setLiveBubble('')
    setScreen('reveal')
  }

  function connectRoom(mode: 'create' | 'join', code?: string, reconnecting = false) {
    const previousSocket = roomSocket.current
    roomSocket.current = null
    previousSocket?.close()
    leavingRoomRef.current = false
    if (!reconnecting) {
      onlineStartedRef.current = false
      onlineVersionRef.current = { matchId: '', revision: -1 }
      setRoom(null)
      setGame(null)
      setOnlineMeta(null)
      setRoomError('')
      setScreen('room')
    }
    const normalizedCode = code?.toUpperCase()
    const savedSession =
      mode === 'join' && normalizedCode ? loadRoomSession(normalizedCode) : null
    let resumeAttempted = Boolean(savedSession)
    const socket = createRoomSocket(
      (message: RoomMessage) => {
        if (message.type === 'error') {
          if (message.code === 'resume-failed' && normalizedCode && resumeAttempted) {
            resumeAttempted = false
            clearRoomSession(normalizedCode)
            sendRoomMessage(socket, { type: 'join', code: normalizedCode })
            return
          }
          setRoomError(message.message)
          return
        }
        if (message.type === 'joined') {
          setRoomError('')
          roomCodeRef.current = message.room.code
          if (reconnectTimerRef.current) {
            window.clearTimeout(reconnectTimerRef.current)
            reconnectTimerRef.current = undefined
          }
          roomPlayerIdRef.current = message.playerId
          setRoomPlayerId(message.playerId)
          setRoom(message.room)
          saveRoomSession(message.room.code, {
            playerId: message.playerId,
            reconnectToken: message.reconnectToken,
          })
          window.history.replaceState({}, '', roomInviteUrl(message.room.code))
        }
        if (message.type === 'room') setRoom(message.room)
        if (message.type === 'started') {
          setRoom(message.room)
        }
        if (message.type === 'game-state') {
          const currentVersion = onlineVersionRef.current
          if (
            currentVersion.matchId === message.view.matchId &&
            message.view.revision < currentVersion.revision
          ) return
          onlineVersionRef.current = {
            matchId: message.view.matchId,
            revision: message.view.revision,
          }
          setRoom(message.room)
          setGame(message.view.game)
          setSpeechOrder(message.view.speechOrder)
          setSpeechIndex(message.view.speechIndex)
          setOnlineMeta({
            matchId: message.view.matchId,
            revision: message.view.revision,
            deadline: message.view.deadline,
            speechOrder: message.view.speechOrder,
            speechIndex: message.view.speechIndex,
            hasActed: message.view.hasActed,
            hasVoted: message.view.hasVoted,
            wolfTeammates: message.view.wolfTeammates,
            wolfChat: message.view.wolfChat,
          })
          if (!onlineStartedRef.current) {
            onlineStartedRef.current = true
            setScreen('reveal')
          }
        }
      },
      setRoomStatus,
    )
    roomSocket.current = socket
    socket.addEventListener('close', () => {
      if (leavingRoomRef.current || roomSocket.current !== socket) return
      const reconnectCode = roomCodeRef.current || normalizedCode
      if (!reconnectCode) return
      reconnectTimerRef.current = window.setTimeout(
        () => connectRoom('join', reconnectCode, true),
        1200,
      )
    })
    socket.addEventListener('open', () => {
      sendRoomMessage(
        socket,
        mode === 'create'
          ? { type: 'create', targetCount: playerCount }
          : savedSession && normalizedCode
            ? {
                type: 'resume',
                code: normalizedCode,
                playerId: savedSession.playerId,
                reconnectToken: savedSession.reconnectToken,
              }
            : { type: 'join', code: normalizedCode },
      )
    })
  }

  function leaveRoom() {
    leavingRoomRef.current = true
    if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current)
    if (room) clearRoomSession(room.code)
    const url = new URL(window.location.href)
    url.searchParams.delete('room')
    window.history.replaceState({}, '', url)
    const socket = roomSocket.current
    roomSocket.current = null
    socket?.close()
    roomCodeRef.current = ''
    setRoom(null)
    setGame(null)
    setOnlineMeta(null)
    setScreen('home')
  }

  async function copyInvite() {
    if (!room) return
    await navigator.clipboard.writeText(roomInviteUrl(room.code))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('room')
    const timer = code ? window.setTimeout(() => connectRoom('join', code), 0) : undefined
    return () => {
      if (timer) window.clearTimeout(timer)
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current)
      leavingRoomRef.current = true
      const socket = roomSocket.current
      roomSocket.current = null
      socket?.close()
    }
    // URL 邀请只在页面首次加载时消费，避免状态变化导致重复加入。
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!onlineMeta?.deadline) {
      setCountdown(0)
      return
    }
    const update = () => {
      setCountdown(Math.max(0, Math.ceil((onlineMeta.deadline - Date.now()) / 1000)))
    }
    update()
    const timer = window.setInterval(update, 250)
    return () => window.clearInterval(timer)
  }, [onlineMeta?.deadline])

  useEffect(() => {
    const stopAudio = () => {
      audioRef.current?.oscillators.forEach((oscillator) => oscillator.stop())
      void audioRef.current?.context.close()
      audioRef.current = null
    }
    stopAudio()
    if (!soundEnabled || screen !== 'game' || !gamePhase) return stopAudio
    const AudioContextClass = window.AudioContext
    const context = new AudioContextClass()
    const gain = context.createGain()
    const isNight = gamePhase === 'night'
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(isNight ? 0.018 : 0.012, context.currentTime + 1.2)
    gain.connect(context.destination)
    const frequencies = isNight ? [55, 82.4] : [146.8, 220]
    const oscillators = frequencies.map((frequency, index) => {
      const oscillator = context.createOscillator()
      oscillator.type = index === 0 ? 'sine' : 'triangle'
      oscillator.frequency.value = frequency
      oscillator.detune.value = index ? 5 : -4
      oscillator.connect(gain)
      oscillator.start()
      return oscillator
    })
    const cue = context.createOscillator()
    const cueGain = context.createGain()
    cue.type = 'sine'
    cue.frequency.setValueAtTime(isNight ? 110 : 392, context.currentTime)
    cue.frequency.exponentialRampToValueAtTime(
      isNight ? 55 : 523.25,
      context.currentTime + 1.4,
    )
    cueGain.gain.setValueAtTime(0.0001, context.currentTime)
    cueGain.gain.exponentialRampToValueAtTime(0.045, context.currentTime + 0.08)
    cueGain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 1.5)
    cue.connect(cueGain)
    cueGain.connect(context.destination)
    cue.start()
    cue.stop(context.currentTime + 1.6)
    audioRef.current = { context, gain, oscillators }
    void context.resume().catch(() => undefined)
    return stopAudio
  }, [gamePhase, screen, soundEnabled])

  function appendLog(entry: Omit<LogEntry, 'id' | 'round'>) {
    setGame((current) =>
      current
        ? {
            ...current,
            logs: [
              ...current.logs,
              { ...entry, id: makeId(), round: current.round },
            ],
          }
        : current,
    )
  }

  async function takeNightAction(action = 'act') {
    if (!game || nightActing) return
    if (isOnlineGame) {
      sendRoomMessage(roomSocket.current, {
        type: 'night-action',
        action,
        targetId: selectedTarget,
      })
      setSelectedTarget(undefined)
      return
    }
    setNightActing(true)
    const cues = {
      werewolf: '狼人正在月色下选择袭击目标……',
      guard: '守卫举起盾牌，决定今夜的守护……',
      seer: '预言家凝视星盘，查验一人的阵营……',
      witch: '女巫打开药箱，权衡生与死……',
      resolve: '所有人闭眼，等待黎明……',
    }
    setNightCue(cues[game.nightStep])
    await wait(850)
    const nextGame =
      game.nightStep === 'resolve'
        ? resolveNight(game)
        : actNight(game, selectedTarget, action)
    setGame(nextGame)
    setSelectedTarget(undefined)
    setNightCue('')
    setNightActing(false)
    if (nextGame.phase === 'day') {
      const order = shuffledIds(livingPlayers(nextGame))
      setSpeechOrder(order)
      setSpeechIndex(0)
      void playSpeakingOrder(order, 0, nextGame)
    }
  }

  async function animateSpeech(player: Player, text: string) {
    setActiveSpeakerId(player.id)
    setLiveBubble('')
    for (let index = 1; index <= text.length; index += 1) {
      setLiveBubble(text.slice(0, index))
      await wait(18)
    }
    await wait(420)
    setActiveSpeakerId(undefined)
    setLiveBubble('')
  }

  async function playSpeakingOrder(order: number[], startIndex: number, initialGame: GameState) {
    let conversation = initialGame
    for (let index = startIndex; index < order.length; index += 1) {
      const player = conversation.players.find((item) => item.id === order[index])
      if (!player?.alive) continue
      setSpeechIndex(index)
      if (player.isHuman) {
        setThinking(false)
        setGame(conversation)
        return
      }
      if (speakingRef.current === player.id) return
      speakingRef.current = player.id
      setThinking(true)
      const response = await generateAiResponse(conversation, settings, player)
      setAiVotes((current) => ({ ...current, [player.id]: response.vote }))
      setAiSource(response.source)
      await animateSpeech(player, response.speech)
      conversation = {
        ...conversation,
        logs: [
          ...conversation.logs,
          {
            id: makeId(),
            kind: 'speech',
            speaker: player.name,
            text: response.speech,
            round: conversation.round,
          },
        ],
      }
      setGame(conversation)
      speakingRef.current = undefined
    }
    setSpeechIndex(order.length)
    setThinking(false)
    setGame({ ...conversation, phase: 'vote' })
  }

  async function finishSpeech(override?: string) {
    const spokenText = override ?? speech
    if (!game || !spokenText.trim() || thinking) return
    const player = game.players.find((item) => item.isHuman)
    if (!player) return
    if (isOnlineGame) {
      const text = spokenText.trim().slice(0, 240)
      setSpeech('')
      sendRoomMessage(roomSocket.current, { type: 'speech', text })
      return
    }
    setSpeech('')
    setThinking(true)
    const text = spokenText.trim().slice(0, 240)
    await animateSpeech(player, text)
    const nextGame: GameState = {
      ...game,
      logs: [
        ...game.logs,
        {
          id: makeId(),
          kind: 'speech',
          speaker: player.name,
          text,
          round: game.round,
        },
      ],
    }
    setGame(nextGame)
    setThinking(false)
    void playSpeakingOrder(speechOrder, speechIndex + 1, nextGame)
  }

  function castVote() {
    if (!game || !selectedTarget) return
    if (isOnlineGame) {
      sendRoomMessage(roomSocket.current, { type: 'vote', targetId: selectedTarget })
      setSelectedTarget(undefined)
      return
    }
    setGame(resolveVote(game, selectedTarget, aiVotes))
    setSelectedTarget(undefined)
    setAiVotes({})
    setSpeechOrder([])
    setSpeechIndex(0)
  }

  function sendWolfMessage() {
    const text = wolfMessage.trim()
    if (!text) return
    sendRoomMessage(roomSocket.current, { type: 'wolf-chat', text })
    setWolfMessage('')
  }

  function enterVillage() {
    setScreen('game')
    if (isOnlineGame) {
      sendRoomMessage(roomSocket.current, { type: 'enter-game' })
    }
  }

  function restart() {
    setGame(null)
    setScreen('setup')
  }

  const currentSpeakerId = speechOrder[speechIndex]
  const currentSpeaker = game?.players.find((player) => player.id === currentSpeakerId)

  return (
    <main className={`app-shell ${game?.phase === 'night' ? 'is-night' : ''}`}>
      <div className="noise" aria-hidden="true" />
      <header className="topbar">
        <button className="brand" onClick={() => setScreen('home')} aria-label="返回首页">
          <span className="brand-mark">N</span>
          <span>
            <strong>夜幕审判</strong>
            <small>NIGHT JUDGMENT</small>
          </span>
        </button>
        <div className="top-actions">
          {game && screen === 'game' && (
            <span className={`phase-chip ${game.phase}`}>
              第 {game.round} 轮 · {game.phase === 'night' ? '夜幕' : game.phase === 'day' ? '黎明' : game.phase === 'vote' ? '审判' : '终局'}
            </span>
          )}
          <button
            className="text-button"
            onClick={() => setSoundEnabled((enabled) => !enabled)}
            aria-label={soundEnabled ? '关闭背景音效' : '开启背景音效'}
          >
            {soundEnabled ? '♫ 音效开' : '♩ 音效关'}
          </button>
          <button className="text-button" onClick={() => setShowSettings(true)}>
            <span className={`api-dot ${settings.useRemote && settings.apiKey ? 'online' : ''}`} />
            {settings.useRemote && settings.apiKey ? 'DeepSeek' : '本地 AI'}
          </button>
        </div>
      </header>

      {screen === 'home' && (
        <section className="home-screen">
          <div className="moon" aria-hidden="true">
            <div className="moon-shadow" />
          </div>
          <div className="village-silhouette" aria-hidden="true" />
          <div className="hero-copy">
            <span className="eyebrow">AN AI SOCIAL DEDUCTION GAME</span>
            <h1>
              夜色会掩盖足迹，
              <br />
              却掩盖不了<span>谎言。</span>
            </h1>
            <p>与拥有记忆、性格和秘密身份的 AI 同桌。每一句发言，都可能是陷阱。</p>
            <div className="hero-actions">
              <button className="button primary large" onClick={() => setScreen('setup')}>
                开始新对局 <span>›</span>
              </button>
              <button className="button ghost large" onClick={() => connectRoom('create')}>
                创建联机房间
              </button>
              <button className="button ghost large" onClick={() => setShowSettings(true)}>
                配置 DeepSeek
              </button>
            </div>
            <div className="feature-strip">
              <span><b>01</b> 6–15 人动态牌组</span>
              <span><b>02</b> AI 独立人格推理</span>
              <span><b>03</b> 独立角色按序思考</span>
            </div>
          </div>
          <aside className="omen-card">
            <span>今夜预言</span>
            <blockquote>“当钟声响过第三次，最诚实的人将最先被怀疑。”</blockquote>
            <small>—— 无名占星师手记</small>
          </aside>
        </section>
      )}

      {screen === 'room' && (
        <section className="room-screen content-panel">
          <div className="room-header">
            <div>
              <span className="eyebrow">ONLINE VILLAGE</span>
              <h1>联机等候室</h1>
              <p>所有真人玩家准备后，由房主开始游戏。空位可以使用 AI 补齐。</p>
            </div>
            <span className={`connection-pill ${roomStatus}`}>
              {roomStatus === 'online' ? '房间已连接' : roomStatus === 'connecting' ? '连接中' : '连接已断开'}
            </span>
          </div>

          {room ? (
            <>
              <div className="invite-panel">
                <div>
                  <span>房间号</span>
                  <strong>{room.code}</strong>
                </div>
                <label>
                  <span>邀请链接</span>
                  <input value={roomInviteUrl(room.code)} readOnly />
                </label>
                <button className="button ghost" onClick={copyInvite}>
                  {copied ? '已复制' : '复制链接'}
                </button>
              </div>

              <div className="room-layout">
                <div className="room-roster">
                  {Array.from({ length: room.targetCount }).map((_, index) => {
                    const player = room.players[index]
                    return (
                      <article className={`room-seat ${player?.ready ? 'ready' : ''}`} key={index}>
                        <span className="seat-index">{index + 1}</span>
                        {player ? (
                          <>
                            <div className="mini-avatar">{player.isBot ? 'AI' : '人'}</div>
                            <div>
                              <strong>{player.name}</strong>
                              <small>
                                {player.id === room.hostId ? '房主 · ' : ''}
                                {player.isBot ? '人机玩家' : player.id === roomPlayerId ? '你' : '真人玩家'}
                              </small>
                            </div>
                            <b>{player.ready ? '已准备' : '未准备'}</b>
                            {room.hostId === roomPlayerId && player.isBot && (
                              <button
                                className="seat-remove"
                                onClick={() => sendRoomMessage(roomSocket.current, { type: 'remove-bot', playerId: player.id })}
                                aria-label={`移除${player.name}`}
                              >
                                ×
                              </button>
                            )}
                          </>
                        ) : (
                          <div className="empty-seat">
                            <strong>等待玩家</strong>
                            <small>分享链接邀请朋友</small>
                          </div>
                        )}
                      </article>
                    )
                  })}
                </div>

                <aside className="room-controls">
                  <span className="mode-seal">{room.players.length}/{room.targetCount}</span>
                  <h2>迷雾村庄</h2>
                  <p>真人进入后占据独立席位；AI 玩家自动准备，并使用角色专属推理。</p>
                  <div className="ready-summary">
                    <span>准备情况</span>
                    <strong>{room.players.filter((player) => player.ready).length} / {room.targetCount}</strong>
                  </div>
                  <button
                    className="button primary large"
                    onClick={() => {
                      const own = room.players.find((player) => player.id === roomPlayerId)
                      sendRoomMessage(roomSocket.current, { type: 'ready', ready: !own?.ready })
                    }}
                  >
                    {room.players.find((player) => player.id === roomPlayerId)?.ready ? '取消准备' : '点击准备'}
                  </button>
                  {room.hostId === roomPlayerId && (
                    <>
                      <button
                        className="button ghost"
                        disabled={room.players.length >= room.targetCount}
                        onClick={() => sendRoomMessage(roomSocket.current, { type: 'fill-bots' })}
                      >
                        空位全部补充人机
                      </button>
                      <button
                        className="button danger"
                        disabled={room.players.length !== room.targetCount || !room.players.every((player) => player.ready)}
                        onClick={() => sendRoomMessage(roomSocket.current, { type: 'start' })}
                      >
                        全员准备，开始游戏
                      </button>
                    </>
                  )}
                  <button className="text-button" onClick={() => {
                    leaveRoom()
                  }}>
                    离开房间
                  </button>
                </aside>
              </div>
            </>
          ) : (
            <div className="room-loading">
              <i /><i /><i />
              <strong>{roomStatus === 'offline' ? '无法连接房间服务器' : '正在进入村庄…'}</strong>
              <p>请确认 Render 服务已启动，并正确设置 `VITE_ROOM_SERVER_URL`。</p>
            </div>
          )}
          {roomError && <p className="status-message room-error">{roomError}</p>}
        </section>
      )}

      {screen === 'setup' && (
        <section className="setup-screen content-panel">
          <div className="section-heading">
            <span className="eyebrow">CREATE A CIRCLE</span>
            <h1>召集今夜的村民</h1>
            <p>你占据一席，其余位置由性格各异的 AI 玩家加入。</p>
          </div>
          <div className="setup-layout">
            <div className="count-panel">
              <h2>选择游戏人数</h2>
              <div className="count-grid">
                {PLAYER_COUNTS.map((count) => (
                  <button
                    key={count}
                    className={count === playerCount ? 'active' : ''}
                    onClick={() => setPlayerCount(count)}
                  >
                    <strong>{count}</strong>
                    <span>人局</span>
                  </button>
                ))}
              </div>
              <div className="roster-preview">
                <span>本局牌组</span>
                <strong>{expectedRoles}</strong>
                <small>神职将从预言家、女巫、猎人、守卫、白痴与骑士中随机产生</small>
              </div>
            </div>
            <aside className="mode-panel">
              <span className="mode-seal">标准</span>
              <h2>迷雾村庄</h2>
              <p>身份牌隐藏，死亡不翻牌，平票时由命运随机裁决。</p>
              <ul>
                <li>完整昼夜轮替</li>
                <li>文字发言与质询</li>
                <li>神职夜间技能</li>
                <li>{settings.useRemote && settings.apiKey ? 'DeepSeek 智能对局' : '免费本地 AI 对局'}</li>
              </ul>
              <div className="cost-estimate">
                <span>预计 API 调用</span>
                <strong>{settings.useRemote && settings.apiKey ? '每名存活 AI 每轮 1 次' : '0 次'}</strong>
              </div>
            </aside>
          </div>
          <div className="setup-actions">
            <button className="button ghost" onClick={() => setScreen('home')}>返回</button>
            <button className="button ghost" onClick={() => connectRoom('create')}>按当前人数创建联机房</button>
            <button className="button primary large" onClick={beginGame}>抽取身份牌</button>
          </div>
        </section>
      )}

      {screen === 'reveal' && game && human && role && (
        <section className={`reveal-screen reveal-${role.key}`}>
          <div className="fx-orbit" aria-hidden="true" />
          <div className="fx-particles" aria-hidden="true">
            {Array.from({ length: 12 }).map((_, index) => <i key={index} />)}
          </div>
          <div className="role-card">
            <div className="role-card-image">
              <RolePortrait player={human} />
              <span className="role-glyph">{role.icon}</span>
            </div>
            <div className="role-card-copy">
              <span className="eyebrow">YOUR SECRET IDENTITY</span>
              <p>你的身份是</p>
              <h1 style={{ color: role.accent }}>{role.name}</h1>
              <blockquote>“{role.tagline}”</blockquote>
              <div className="ability-box">
                <span>能力</span>
                <p>{role.ability}</p>
              </div>
              <div className="camp-line">
                <span>阵营目标</span>
                <strong>{role.camp === 'wolf' ? '隐藏身份，猎尽所有好人' : '找出并放逐所有狼人'}</strong>
              </div>
              {role.key === 'werewolf' && onlineMeta && (
                <div className="camp-line wolf-team-line">
                  <span>你的狼队友</span>
                  <strong>
                    {onlineMeta.wolfTeammates.length
                      ? onlineMeta.wolfTeammates.map((id) => `${id}号`).join('、')
                      : '你是场上唯一存活狼人'}
                  </strong>
                </div>
              )}
              <button className="button primary large" onClick={enterVillage}>
                进入村庄
              </button>
            </div>
          </div>
        </section>
      )}

      {screen === 'game' && game && human && role && (
        <section className="game-screen">
          <aside className="status-rail">
            <div className="round-orb">
              <small>ROUND</small>
              <strong>{String(game.round).padStart(2, '0')}</strong>
            </div>
            <div className="identity-mini">
              <span>你的身份</span>
              <strong style={{ color: role.accent }}>{role.icon} {role.name}</strong>
              <small>{role.camp === 'wolf' ? '狼人阵营' : '好人阵营'}</small>
            </div>
            <div className="survival">
              <span>存活</span>
              <strong>{alive.length}<small> / {game.players.length}</small></strong>
            </div>
          </aside>

          <div className="table-stage">
            <div className="stage-heading">
              <span className="eyebrow">
                {game.phase === 'night' ? 'THE NIGHT FALLS' : game.phase === 'day' ? 'DAWN SPEECH' : game.phase === 'vote' ? 'THE TRIAL' : 'FINAL VERDICT'}
              </span>
              <h2>
                {game.phase === 'night' && '夜幕降临'}
                {game.phase === 'day' && '黎明发言'}
                {game.phase === 'vote' && '放逐审判'}
                {game.phase === 'result' && (game.winner === role.camp ? '阵营获胜' : '阵营落败')}
              </h2>
              <p>
                {game.phase === 'night' && '村庄沉睡，睁眼者开始行动。'}
                {game.phase === 'day' && '写下你的判断，系统将随机决定本轮每个人的发言顺序。'}
                {game.phase === 'vote' && '选择你认为最可疑的玩家。'}
                {game.phase === 'result' && '所有秘密都已在晨光中显现。'}
              </p>
            </div>

            <div className="player-circle">
              {game.players.map((player) => (
                <button
                  key={player.id}
                  className={`player-seat ${selectedTarget === player.id ? 'selected' : ''} ${!player.alive ? 'dead' : ''} ${player.isHuman ? 'human' : ''}`}
                  disabled={
                    !player.alive ||
                    (player.isHuman && !(
                      game.phase === 'night' &&
                      game.nightStep === 'werewolf' &&
                      role.key === 'werewolf'
                    )) ||
                    game.phase === 'result' ||
                    (game.phase === 'day')
                  }
                  onClick={() => setSelectedTarget(player.id)}
                >
                  {activeSpeakerId === player.id && (
                    <span className="speech-bubble" aria-live="polite">
                      {liveBubble}
                      <i className="typing-caret" />
                    </span>
                  )}
                  <span className="seat-number">{player.id}</span>
                  <AtlasPortrait player={player} />
                  <strong>{player.name}</strong>
                  <small>
                    {game.phase === 'result'
                      ? `${ROLES[player.role].name} · ${player.alive ? '存活' : '出局'}`
                      : !player.alive
                      ? '已出局'
                      : player.isHuman
                        ? '你'
                        : isOnlineGame &&
                            game.phase === 'night' &&
                            onlineMeta?.wolfTeammates.includes(player.id)
                          ? '狼队友'
                        : selectedTarget === player.id
                          ? '已选择'
                          : player.isBot
                            ? 'AI 玩家'
                            : '真人玩家'}
                  </small>
                </button>
              ))}
              <div className="table-core">
                <div className="table-moon">◐</div>
                <span>{game.phase === 'night' ? '保持安静' : game.phase === 'vote' ? '选择一人' : '聆听发言'}</span>
              </div>
            </div>

            {game.phase === 'night' && (
              <div className="action-dock">
                <div>
                  <span>
                    夜间顺序 · {
                      game.nightStep === 'werewolf' ? '① 狼人' :
                      game.nightStep === 'guard' ? '② 守卫' :
                      game.nightStep === 'seer' ? '③ 预言家' :
                      game.nightStep === 'witch' ? '④ 女巫' : '⑤ 天亮结算'
                    }
                    {isOnlineGame &&
                      game.nightStep !== 'resolve' &&
                      (onlineMeta?.deadline ? ` · ${countdown} 秒` : ' · 等待全员进入')}
                  </span>
                  <strong>
                    {isOnlineGame && !onlineMeta?.deadline && '等待其他真人玩家查看身份并进入村庄'}
                    {(!isOnlineGame || Boolean(onlineMeta?.deadline)) && !isHumanNightTurn && game.nightStep !== 'resolve' && `${ROLES[activeNightRole!].name}正在秘密行动，你无法看到其选择`}
                    {isHumanNightTurn && game.nightStep === 'werewolf' && '轮到你行动：选择今夜的袭击目标'}
                    {isHumanNightTurn && game.nightStep === 'guard' && '轮到你行动：选择一名玩家守护，不能连续守护同一人'}
                    {isHumanNightTurn && game.nightStep === 'seer' && '轮到你行动：选择一名玩家查验阵营'}
                    {isHumanNightTurn && game.nightStep === 'witch' && (pendingWitchVictim ? `${pendingWitchVictim.name}遭到袭击，可使用解药救治` : '今夜没有可使用解药救治的死亡目标')}
                    {game.nightStep === 'resolve' && '所有夜间角色均已行动，准备迎接黎明'}
                    {isOnlineGame && onlineMeta?.hasActed && ' · 你的选择已提交'}
                  </strong>
                </div>
                <div className="dock-actions">
                  {isHumanNightTurn && game.nightStep === 'witch' && (
                    <>
                      <button className="button ghost" disabled={!game.witchHeal || !pendingWitchVictim || nightActing || onlineMeta?.hasActed || (isOnlineGame && !onlineMeta?.deadline)} onClick={() => takeNightAction('heal')}>
                        {pendingWitchVictim ? `解救 ${pendingWitchVictim.name}` : '没有可救目标'}
                      </button>
                      <button className="button danger" disabled={!game.witchPoison || !selectedTarget || nightActing || onlineMeta?.hasActed || (isOnlineGame && !onlineMeta?.deadline)} onClick={() => takeNightAction('poison')}>使用毒药</button>
                      <button className="button ghost" disabled={nightActing || onlineMeta?.hasActed || (isOnlineGame && !onlineMeta?.deadline)} onClick={() => takeNightAction('skip')}>不使用药剂</button>
                    </>
                  )}
                  {isHumanNightTurn && ['werewolf', 'seer', 'guard'].includes(game.nightStep) && (
                    <button className="button primary" disabled={!selectedTarget || nightActing || onlineMeta?.hasActed || (isOnlineGame && !onlineMeta?.deadline)} onClick={() => takeNightAction('act')}>确认目标</button>
                  )}
                  {!isOnlineGame && !isHumanNightTurn && game.nightStep !== 'resolve' && (
                    <button className="button primary" disabled={nightActing} onClick={() => takeNightAction('act')}>
                      {nightActing ? '行动中…' : `让${ROLES[activeNightRole!].name}行动`}
                    </button>
                  )}
                  {!isOnlineGame && game.nightStep === 'resolve' && (
                    <button className="button primary" disabled={nightActing} onClick={() => takeNightAction('resolve')}>
                      {nightActing ? '天色渐亮…' : '等待天亮'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {isOnlineGame && game.phase === 'night' && role.key === 'werewolf' && human.alive && (
              <div className="wolf-chat-panel">
                <header>
                  <div>
                    <span>WOLF CHANNEL · 狼队私聊</span>
                    <strong>
                      队友：{onlineMeta?.wolfTeammates.map((id) => `${id}号`).join('、') || '无'}
                    </strong>
                  </div>
                  <small>只有存活狼人可见</small>
                </header>
                <div className="wolf-chat-messages">
                  {onlineMeta?.wolfChat.length
                    ? onlineMeta.wolfChat.map((message) => (
                        <p key={message.id}>
                          <strong>{message.name}</strong>
                          {message.text}
                        </p>
                      ))
                    : <p className="empty-chat">和狼队友商量今晚袭击谁。</p>}
                </div>
                <div className="wolf-chat-compose">
                  <input
                    value={wolfMessage}
                    onChange={(event) => setWolfMessage(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') sendWolfMessage()
                    }}
                    maxLength={120}
                    placeholder="输入仅狼队可见的消息…"
                  />
                  <button className="button danger" onClick={sendWolfMessage}>发送</button>
                </div>
              </div>
            )}

            {game.phase === 'day' && (
              <div className="speech-dock">
                {speechOrder.length > 0 && (
                  <div className="order-preview">
                    <span>本轮随机顺序</span>
                    <strong>
                      {speechOrder
                        .map((id) => game.players.find((player) => player.id === id)?.name)
                        .join(' → ')}
                    </strong>
                  </div>
                )}
                <textarea
                  value={speech}
                  onChange={(event) => setSpeech(event.target.value)}
                  placeholder={currentSpeaker?.isHuman ? '轮到你发言：输入分析、身份声明或质疑…' : `正在等待 ${currentSpeaker?.name ?? '下一位'} 发言…`}
                  maxLength={240}
                  disabled={thinking || !human.alive || !currentSpeaker?.isHuman}
                />
                <div>
                  <span>
                    {speechIndex < speechOrder.length ? `第 ${speechIndex + 1} / ${speechOrder.length} 位` : '本轮发言结束'}
                    {isOnlineGame && onlineMeta?.deadline ? ` · ${countdown} 秒` : ''}
                    {' · '}{speech.length} / 240
                  </span>
                  <button className="button primary" disabled={!speech.trim() || thinking || !human.alive || !currentSpeaker?.isHuman} onClick={() => finishSpeech()}>
                    {thinking ? '正在发言…' : currentSpeaker?.isHuman ? '完成我的发言' : `等待 ${currentSpeaker?.name ?? 'AI'}`}
                  </button>
                </div>
              </div>
            )}

            {game.phase === 'vote' && (
              <div className="action-dock">
                <div>
                  <span>放逐投票</span>
                  <strong>
                    {selectedTarget
                      ? `已选择 ${game.players.find((item) => item.id === selectedTarget)?.name}`
                      : '点击桌上的存活玩家进行选择'}
                    {isOnlineGame && onlineMeta?.deadline ? ` · 剩余 ${countdown} 秒` : ''}
                  </strong>
                </div>
                <button className="button danger" disabled={!human.alive || !selectedTarget || Boolean(onlineMeta?.hasVoted)} onClick={castVote}>
                  {onlineMeta?.hasVoted ? '已提交投票' : '落下审判票'}
                </button>
              </div>
            )}

            {game.phase === 'result' && (
              <div className="result-stack">
                <div className={`result-dock ${game.winner}`}>
                  <div>
                    <span>{game.winner === 'good' ? 'DAWN RETURNS' : 'ETERNAL NIGHT'}</span>
                    <strong>{game.winner === 'good' ? '好人驱散了长夜' : '狼人吞噬了村庄'}</strong>
                  </div>
                  <button className="button primary" onClick={restart}>再来一局</button>
                </div>
                <div className="action-history">
                  <header>
                    <span>本局行动复盘</span>
                    <strong>身份与秘密行动已全部公开</strong>
                  </header>
                  <div>
                    {(game.actionHistory ?? []).length
                      ? (game.actionHistory ?? []).map((entry) => (
                          <p key={entry.id}>
                            <b>第 {entry.round} 轮</b>
                            <span>{entry.actor}</span>
                            {entry.action}：{entry.target}
                          </p>
                        ))
                      : <p>本局没有可记录的秘密行动。</p>}
                  </div>
                </div>
              </div>
            )}
          </div>

          <aside className="chronicle">
            <header>
              <div>
                <span className="eyebrow">CHRONICLE</span>
                <h3>村庄纪事</h3>
              </div>
              <span className="source-tag">{aiSource === 'deepseek' ? 'DeepSeek 独立角色' : '本地角色'}</span>
            </header>
            <div className="log-list" aria-live="polite">
              {game.logs.map((entry) => (
                <article key={entry.id} className={`log-entry ${entry.kind}`}>
                  <span className="log-mark">{entry.kind === 'speech' ? '“' : entry.kind === 'death' ? '†' : '✦'}</span>
                  <div>
                    {entry.speaker && <strong>{entry.speaker}</strong>}
                    <p>{entry.text}</p>
                  </div>
                </article>
              ))}
              {thinking && <div className="thinking"><i /><i /><i /> AI 正在审视每一句话</div>}
            </div>
          </aside>
        </section>
      )}

      {nightActing && nightCue && (
        <div className="night-ceremony" role="status" aria-live="assertive">
          <div className="ceremony-moon">◐</div>
          <span>NIGHT ORDER</span>
          <strong>{nightCue}</strong>
          <div className="ceremony-line" />
        </div>
      )}

      {showSettings && (
        <SettingsModal
          value={settings}
          onClose={() => setShowSettings(false)}
          onSave={(next) => {
            setSettings(next)
            saveApiSettings(next)
          }}
        />
      )}
      <footer className="global-footer">
        <span>月相 <b>残月</b></span>
        <span>DEEPSEEK COST-SAVER ENGINE</span>
        <button onClick={() => appendLog({ kind: 'system', text: '你听见远处传来一声狼嚎。' })}>聆听夜色</button>
      </footer>
    </main>
  )
}

export default App
