import { randomUUID } from 'node:crypto'

const durationFromEnv = (name, fallback) => {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export const NIGHT_ACTION_MS = durationFromEnv('NIGHT_ACTION_MS', 10_000)
export const NIGHT_RESOLVE_MS = durationFromEnv('NIGHT_RESOLVE_MS', 1_200)
export const SPEECH_TURN_MS = durationFromEnv('SPEECH_TURN_MS', 60_000)
export const BOT_SPEECH_DELAY_MS = durationFromEnv('BOT_SPEECH_DELAY_MS', 900)

const PRESETS = {
  6: { wolves: 2, gods: 1 },
  7: { wolves: 2, gods: 2 },
  8: { wolves: 2, gods: 3 },
  9: { wolves: 3, gods: 3 },
  10: { wolves: 3, gods: 3 },
  12: { wolves: 4, gods: 4 },
  15: { wolves: 5, gods: 5 },
}

const GODS = ['seer', 'witch', 'hunter', 'guard', 'idiot', 'knight']
const NIGHT_ORDER = ['werewolf', 'guard', 'seer', 'witch', 'resolve']

const seededRandom = (seed) => {
  let state = [...seed].reduce(
    (value, character) => Math.imul(value ^ character.charCodeAt(0), 16777619),
    2166136261,
  ) >>> 0
  return () => {
    state += 0x6d2b79f5
    let result = state
    result = Math.imul(result ^ (result >>> 15), result | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

const shuffle = (items, random = Math.random) =>
  [...items]
    .map((value) => ({ value, order: random() }))
    .sort((left, right) => left.order - right.order)
    .map(({ value }) => value)

const pick = (items) => items[Math.floor(Math.random() * items.length)]
const living = (game) => game.players.filter((player) => player.alive)
const addLog = (game, kind, text, speaker) => {
  game.logs.push({ id: randomUUID(), kind, text, speaker, round: game.round })
}

function winnerOf(players) {
  const alive = players.filter((player) => player.alive)
  const wolves = alive.filter((player) => player.role === 'werewolf').length
  const goods = alive.length - wolves
  if (wolves === 0) return 'good'
  if (wolves >= goods) return 'wolf'
}

export function createAuthoritativeGame(room, seed) {
  const random = seededRandom(seed)
  const preset = PRESETS[room.targetCount] ?? PRESETS[9]
  const gods = shuffle(
    GODS.slice(0, room.targetCount <= 7 ? 4 : GODS.length),
    random,
  ).slice(0, preset.gods)
  const roles = shuffle([
    ...Array(preset.wolves).fill('werewolf'),
    ...gods,
    ...Array(room.targetCount - preset.wolves - preset.gods).fill('villager'),
  ], random)

  return {
    matchId: randomUUID(),
    revision: 0,
    players: room.players.map((roomPlayer, index) => ({
      id: roomPlayer.seat,
      name: `${roomPlayer.seat}号`,
      role: roles[index],
      alive: true,
      avatar: index,
      isBot: roomPlayer.isBot,
    })),
    phase: 'night',
    round: 1,
    logs: [{
      id: randomUUID(),
      kind: 'system',
      text: `${room.targetCount} 人联机局开始。所有玩家共享同一局游戏。`,
      round: 1,
    }],
    winner: undefined,
    witchHeal: true,
    witchPoison: true,
    lastGuarded: undefined,
    nightStep: 'werewolf',
    wolfTarget: undefined,
    guardedTarget: undefined,
    poisonTarget: undefined,
    nightHealed: false,
    privateNotes: {},
    nightActions: {},
    votes: {},
    speechOrder: [],
    speechIndex: 0,
    speechTurnSeat: undefined,
    wolfChat: [],
    deadline: 0,
  }
}

export function playerView(room, viewer) {
  const game = room.game
  const own = game.players.find((player) => player.id === viewer.seat)
  const maySeeWolves = own?.role === 'werewolf'
  const revealAll = game.phase === 'result'
  const visiblePlayers = game.players.map((player) => ({
    id: player.id,
    name: player.name,
    role:
      revealAll || player.id === viewer.seat || (maySeeWolves && player.role === 'werewolf')
        ? player.role
        : 'villager',
    alive: player.alive,
    isHuman: player.id === viewer.seat,
    isBot: player.isBot,
    personality: player.isBot ? 'AI 玩家' : '真人玩家',
    avatar: player.avatar,
    vote: game.phase === 'result' ? game.votes[player.id] : undefined,
  }))

  const maySeeWolfTarget = own?.role === 'werewolf' || own?.role === 'witch'
  return {
    matchId: game.matchId,
    revision: game.revision,
    game: {
      players: visiblePlayers,
      phase: game.phase,
      round: game.round,
      logs: game.logs,
      winner: game.winner,
      witchHeal: own?.role === 'witch' ? game.witchHeal : false,
      witchPoison: own?.role === 'witch' ? game.witchPoison : false,
      lastGuarded: own?.role === 'guard' ? game.lastGuarded : undefined,
      nightStep: game.nightStep,
      wolfTarget: maySeeWolfTarget ? game.wolfTarget : undefined,
      guardedTarget: own?.role === 'guard' ? game.guardedTarget : undefined,
      poisonTarget: own?.role === 'witch' ? game.poisonTarget : undefined,
      nightHealed: own?.role === 'witch' ? game.nightHealed : false,
      privateNotes: { [viewer.seat]: game.privateNotes[viewer.seat] ?? [] },
    },
    deadline: game.deadline,
    speechOrder: game.speechOrder,
    speechIndex: game.speechIndex,
    hasActed: Boolean(game.nightActions[viewer.seat]),
    hasVoted: Boolean(game.votes[viewer.seat]),
    wolfTeammates: maySeeWolves
      ? game.players
          .filter((player) => player.role === 'werewolf' && player.id !== viewer.seat)
          .map((player) => player.id)
      : [],
    wolfChat: maySeeWolves
      ? game.wolfChat.filter((message) => message.round === game.round)
      : [],
  }
}

export function submitNightAction(room, actor, message) {
  const game = room.game
  const player = game.players.find((item) => item.id === actor.seat)
  if (
    !player?.alive ||
    game.phase !== 'night' ||
    !game.deadline ||
    Date.now() > game.deadline ||
    player.role !== game.nightStep
  ) {
    return false
  }
  const target = game.players.find((item) => item.id === Number(message.targetId))
  if (message.targetId && !target?.alive) return false
  if (player.role === 'werewolf' && target?.role === 'werewolf') return false
  if (player.role === 'guard' && target?.id === game.lastGuarded) return false
  if (player.role === 'seer' && target?.id === player.id) return false
  if (player.role === 'witch' && message.action === 'poison' && target?.id === player.id) {
    return false
  }
  game.nightActions[player.id] = {
    action: String(message.action || 'skip'),
    targetId: target?.id,
  }
  return true
}

const botTarget = (game, role) => {
  const actor = game.players.find((player) => player.alive && player.role === role)
  const candidates = living(game).filter((player) => {
    if (role === 'werewolf') return player.role !== 'werewolf'
    if (role === 'guard') return player.id !== game.lastGuarded
    return player.id !== actor?.id
  })
  return pick(candidates)?.id
}

function nextNightStep(game) {
  let index = NIGHT_ORDER.indexOf(game.nightStep) + 1
  while (index < NIGHT_ORDER.length) {
    const step = NIGHT_ORDER[index]
    if (
      step === 'resolve' ||
      step === 'werewolf' ||
      game.players.some((player) => player.alive && player.role === step)
    ) return step
    index += 1
  }
  return 'resolve'
}

export function resolveNightStep(room) {
  const game = room.game
  if (game.phase !== 'night') return
  const step = game.nightStep

  if (step === 'werewolf') {
    const wolfVotes = game.players
      .filter((player) => player.alive && player.role === 'werewolf')
      .map((player) => {
        const action = game.nightActions[player.id]
        return action?.targetId ?? (player.isBot ? botTarget(game, 'werewolf') : undefined)
      })
      .filter(Boolean)
    const tally = new Map()
    wolfVotes.forEach((target) => tally.set(target, (tally.get(target) ?? 0) + 1))
    game.wolfTarget = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  }

  if (step === 'guard') {
    const guard = game.players.find((player) => player.alive && player.role === 'guard')
    game.guardedTarget = guard
      ? game.nightActions[guard.id]?.targetId ?? (guard.isBot ? botTarget(game, 'guard') : undefined)
      : undefined
  }

  if (step === 'seer') {
    const seer = game.players.find((player) => player.alive && player.role === 'seer')
    const targetId = seer
      ? game.nightActions[seer.id]?.targetId ?? (seer.isBot ? botTarget(game, 'seer') : undefined)
      : undefined
    const checked = game.players.find((player) => player.id === targetId)
    if (seer && checked) {
      const finding = `${checked.name}是${checked.role === 'werewolf' ? '狼人' : '好人'}`
      game.privateNotes[seer.id] = [...(game.privateNotes[seer.id] ?? []), finding]
    }
  }

  if (step === 'witch') {
    const witch = game.players.find((player) => player.alive && player.role === 'witch')
    let action = witch ? game.nightActions[witch.id] : undefined
    if (witch?.isBot && !action) {
      action = game.wolfTarget && game.witchHeal && Math.random() < 0.45
        ? { action: 'heal' }
        : { action: 'skip' }
    }
    const canHeal =
      game.wolfTarget &&
      game.wolfTarget !== game.guardedTarget &&
      game.players.some((player) => player.id === game.wolfTarget && player.alive)
    if (action?.action === 'heal' && canHeal && game.witchHeal) {
      game.nightHealed = true
      game.witchHeal = false
    }
    if (action?.action === 'poison' && action.targetId && game.witchPoison) {
      game.poisonTarget = action.targetId
      game.witchPoison = false
    }
  }

  game.nightActions = {}
  game.nightStep = nextNightStep(game)
  game.deadline =
    Date.now() + (game.nightStep === 'resolve' ? NIGHT_RESOLVE_MS : NIGHT_ACTION_MS)
}

export function resolveNight(room) {
  const game = room.game
  const victim = game.players.find((player) => player.id === game.wolfTarget)
  if (victim && victim.id !== game.guardedTarget && !game.nightHealed) victim.alive = false
  const poisoned = game.players.find((player) => player.id === game.poisonTarget)
  if (poisoned) poisoned.alive = false
  const dead = [victim, poisoned]
    .filter((player, index, all) =>
      player && !player.alive && all.findIndex((item) => item?.id === player.id) === index)
  addLog(
    game,
    dead.length ? 'death' : 'system',
    dead.length
      ? `天亮了。昨夜，${dead.map((player) => player.name).join('、')}没能走出黑暗。`
      : '天亮了。昨夜平安无事。',
  )
  game.winner = winnerOf(game.players)
  game.phase = game.winner ? 'result' : 'day'
  game.lastGuarded = game.guardedTarget
  game.nightStep = 'werewolf'
  game.wolfTarget = undefined
  game.guardedTarget = undefined
  game.poisonTarget = undefined
  game.nightHealed = false
  game.speechOrder = shuffle(living(game).map((player) => player.id))
  game.speechIndex = 0
  game.speechTurnSeat = undefined
  game.deadline = 0
}

const botSpeech = (player, game) => {
  const candidates = living(game).filter((item) => item.id !== player.id)
  const suspect = pick(candidates)
  const night = [...game.logs].reverse().find((entry) =>
    entry.kind === 'death' || entry.text.includes('平安无事'))
  const nightRead = night?.text.includes('平安无事')
    ? '昨夜平安，守卫挡刀和女巫开药都有可能，不能据此直接坐实任何人。'
    : '昨夜出现死亡，需要区分狼刀和女巫毒药，死讯后的反应也值得复盘。'
  if (player.role === 'werewolf') {
    return `${nightRead}我先报预言家，昨晚查验${suspect?.name}是狼人，今天请他正面解释，不要只用情绪反驳。`
  }
  if (player.role === 'seer') {
    const note = game.privateNotes[player.id]?.at(-1)
    return `我跳预言家，${note ?? '昨夜查验暂不公开'}。${suspect?.name}需要交代对昨夜情况的判断依据。`
  }
  if (player.role === 'witch') {
    return `${nightRead}我有女巫视角，但不会空报药况。${suspect?.name}把一种可能说成确定事实，逻辑过度。`
  }
  if (player.role === 'hunter') {
    return `${nightRead}我明跳猎人，若被放逐目前会考虑带走${suspect?.name}，因为他的判断缺少可验证依据。`
  }
  return `${nightRead}${suspect?.name}的结论缺少前因后果，请明确回应前面玩家的质疑和自己的投票方向。`
}

export function advanceBotSpeeches(room, onChange) {
  const game = room.game
  clearTimeout(room.gameTimer)
  if (game.phase !== 'day') return
  let player = game.players.find(
    (item) => item.id === game.speechOrder[game.speechIndex],
  )
  while (player && !player.alive) {
    game.speechIndex += 1
    player = game.players.find(
      (item) => item.id === game.speechOrder[game.speechIndex],
    )
  }
  if (!player) {
    game.phase = 'vote'
    game.deadline = 0
    game.speechTurnSeat = undefined
    game.votes = {}
    living(game)
      .filter((item) => item.isBot)
      .forEach((bot) => {
        game.votes[bot.id] = pick(living(game).filter((item) => item.id !== bot.id))?.id
      })
    onChange()
    return
  }
  game.speechTurnSeat = player.id
  game.deadline = Date.now() + SPEECH_TURN_MS
  onChange()
  room.gameTimer = setTimeout(() => {
    if (
      game.phase !== 'day' ||
      game.speechTurnSeat !== player.id ||
      game.speechOrder[game.speechIndex] !== player.id
    ) return
    if (player.isBot) {
      addLog(game, 'speech', botSpeech(player, game), player.name)
    } else {
      addLog(game, 'system', `${player.name}发言时间结束，已自动过麦。`)
    }
    game.speechIndex += 1
    game.speechTurnSeat = undefined
    game.deadline = 0
    advanceBotSpeeches(room, onChange)
  }, player.isBot ? BOT_SPEECH_DELAY_MS : SPEECH_TURN_MS)
}

export function submitSpeech(room, actor, text, onChange) {
  const game = room.game
  const currentSeat = game.speechOrder[game.speechIndex]
  if (
    game.phase !== 'day' ||
    actor.seat !== currentSeat ||
    game.speechTurnSeat !== currentSeat ||
    !game.deadline ||
    Date.now() > game.deadline
  ) return false
  const value = String(text || '').trim().slice(0, 240)
  if (!value) return false
  clearTimeout(room.gameTimer)
  addLog(game, 'speech', value, `${actor.seat}号`)
  game.speechIndex += 1
  game.speechTurnSeat = undefined
  game.deadline = 0
  advanceBotSpeeches(room, onChange)
  return true
}

export function submitVote(room, actor, targetId) {
  const game = room.game
  const voter = game.players.find((player) => player.id === actor.seat)
  const target = game.players.find((player) => player.id === Number(targetId))
  if (game.phase !== 'vote' || !voter?.alive || !target?.alive || voter.id === target.id) {
    return false
  }
  game.votes[voter.id] = target.id
  const humanSeats = room.players
    .filter((player) => !player.isBot)
    .map((player) => player.seat)
    .filter((seat) => game.players.find((player) => player.id === seat)?.alive)
  if (!humanSeats.every((seat) => game.votes[seat])) return true

  const tally = new Map()
  Object.values(game.votes).forEach((vote) => tally.set(vote, (tally.get(vote) ?? 0) + 1))
  const max = Math.max(...tally.values())
  const top = [...tally.entries()].filter(([, count]) => count === max).map(([id]) => id)
  const eliminated = game.players.find((player) => player.id === pick(top))
  if (eliminated) eliminated.alive = false
  addLog(game, 'death', `${eliminated?.name}以 ${max} 票被放逐出村。`)
  game.winner = winnerOf(game.players)
  game.phase = game.winner ? 'result' : 'night'
  if (!game.winner) {
    game.round += 1
    game.nightStep = 'werewolf'
    game.nightActions = {}
    game.votes = {}
    game.speechOrder = []
    game.speechIndex = 0
    game.speechTurnSeat = undefined
    game.deadline = Date.now() + NIGHT_ACTION_MS
  }
  return true
}

export function submitWolfChat(room, actor, text) {
  const game = room.game
  const player = game.players.find((item) => item.id === actor.seat)
  const value = String(text || '').trim().slice(0, 120)
  if (
    game.phase !== 'night' ||
    player?.role !== 'werewolf' ||
    !player.alive ||
    !value
  ) return false
  game.wolfChat.push({
    id: randomUUID(),
    seat: actor.seat,
    name: `${actor.seat}号`,
    text: value,
    round: game.round,
  })
  game.wolfChat = game.wolfChat.slice(-30)
  return true
}
