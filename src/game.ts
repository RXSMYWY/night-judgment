export type RoleKey =
  | 'werewolf'
  | 'seer'
  | 'witch'
  | 'hunter'
  | 'guard'
  | 'idiot'
  | 'knight'
  | 'villager'

export type Phase = 'night' | 'day' | 'vote' | 'result'
export type NightStep = 'werewolf' | 'guard' | 'seer' | 'witch' | 'resolve'

export type Role = {
  key: RoleKey
  name: string
  camp: 'wolf' | 'good'
  icon: string
  tagline: string
  ability: string
  accent: string
  sprite: string
  persona: string
}

export type Player = {
  id: number
  name: string
  role: RoleKey
  alive: boolean
  isHuman: boolean
  personality: string
  avatar: number
  vote?: number
}

export type LogEntry = {
  id: string
  kind: 'system' | 'speech' | 'death' | 'skill'
  speaker?: string
  text: string
  round: number
  visibility?: 'public' | 'human'
}

export type GameState = {
  players: Player[]
  phase: Phase
  round: number
  logs: LogEntry[]
  winner?: 'wolf' | 'good'
  witchHeal: boolean
  witchPoison: boolean
  lastGuarded?: number
  nightStep: NightStep
  wolfTarget?: number
  guardedTarget?: number
  poisonTarget?: number
  nightHealed: boolean
  privateNotes: Record<number, string[]>
}

export const ROLES: Record<RoleKey, Role> = {
  werewolf: {
    key: 'werewolf',
    name: '狼人',
    camp: 'wolf',
    icon: '◩',
    tagline: '月光之下，猎杀开始',
    ability: '夜晚选择一名玩家袭击，白天隐藏身份。',
    accent: '#b32e3c',
    sprite: 'wolf',
    persona: '你是善于伪装的狼人。表面像认真找狼的村民，敢于质疑和站边；暗中保护狼队友、制造合理怀疑，绝不承认身份或泄露狼队信息。',
  },
  seer: {
    key: 'seer',
    name: '预言家',
    camp: 'good',
    icon: '✦',
    tagline: '群星不会替谎言作证',
    ability: '每晚查验一名玩家的阵营。',
    accent: '#78a9ff',
    sprite: 'seer',
    persona: '你是克制而敏锐的预言家。围绕查验信息组织逻辑，权衡是否跳身份；没查验过的人不乱报结果，被质疑时要清楚解释心路。',
  },
  witch: {
    key: 'witch',
    name: '女巫',
    camp: 'good',
    icon: '♢',
    tagline: '生死，只在一念之间',
    ability: '拥有一次解药和一次毒药。',
    accent: '#79c49c',
    sprite: 'witch',
    persona: '你是谨慎、略带神秘感的女巫。珍惜药剂，不主动泄露夜间秘密；从死亡信息和发言反应推理，说话冷静但关键时会强势。',
  },
  hunter: {
    key: 'hunter',
    name: '猎人',
    camp: 'good',
    icon: '⌖',
    tagline: '最后一发，为真相而鸣',
    ability: '被放逐时可以带走一名玩家。',
    accent: '#d9a35d',
    sprite: 'guard',
    persona: '你是直率强硬的猎人。敢于点名、追问和反击，但不能凭身份知道狼人；发言有压迫感，避免无意义地炫耀枪。',
  },
  guard: {
    key: 'guard',
    name: '守卫',
    camp: 'good',
    icon: '⬡',
    tagline: '今夜，盾墙不会倒下',
    ability: '每晚守护一名玩家，不能连续守护同一人。',
    accent: '#e4c276',
    sprite: 'guard',
    persona: '你是沉稳寡言的守卫。注重保护价值与发言矛盾，绝不公开守护目标；表达简短可靠，不轻易跟风。',
  },
  idiot: {
    key: 'idiot',
    name: '白痴',
    camp: 'good',
    icon: '◇',
    tagline: '疯言之中，也许藏着真相',
    ability: '首次被放逐时翻牌存活，但失去投票权。',
    accent: '#c29bd8',
    sprite: 'villager',
    persona: '你是看似跳脱却观察细致的白痴。偶尔幽默或反问，但分析必须与场上发言有关；不无故暴露身份。',
  },
  knight: {
    key: 'knight',
    name: '骑士',
    camp: 'good',
    icon: '†',
    tagline: '以荣耀，审判谎言',
    ability: '白天可以与一名玩家决斗。',
    accent: '#d7c7a5',
    sprite: 'guard',
    persona: '你是讲究证据与荣誉的骑士。喜欢正面追问矛盾、要求对方给出明确立场；保持克制，不随便发动决斗。',
  },
  villager: {
    key: 'villager',
    name: '村民',
    camp: 'good',
    icon: '⌂',
    tagline: '微弱灯火，也能照见真相',
    ability: '依靠发言、观察和投票找出狼人。',
    accent: '#d6b77b',
    sprite: 'villager',
    persona: '你是没有夜间信息的普通村民。只能依据公开发言、死亡和票型推理；允许判断错误，但要有真实思考过程并回应别人。',
  },
}

const PRESETS: Record<number, { wolves: number; gods: number }> = {
  6: { wolves: 2, gods: 1 },
  7: { wolves: 2, gods: 2 },
  8: { wolves: 2, gods: 3 },
  9: { wolves: 3, gods: 3 },
  10: { wolves: 3, gods: 3 },
  12: { wolves: 4, gods: 4 },
  15: { wolves: 5, gods: 5 },
}

const PERSONALITIES = [
  '冷静的逻辑派，习惯引用上一位的原话再反驳',
  '直觉敏锐但冲动，喜欢直接点名并要求回应',
  '惜字如金的观察者，只说最关键的矛盾',
  '善于追问的怀疑派，会连续追查态度变化',
  '幽默但不胡闹，会用比喻拆穿不自然的发言',
  '谨慎的票型分析者，重视谁在跟票与改口',
  '强势的带队者，愿意给出明确排序和投票建议',
  '温和的调停者，会比较两方观点后再下结论',
]

export const makeId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

export function getPreset(count: number) {
  return PRESETS[count] ?? PRESETS[9]
}

const seededRandom = (seed: string) => {
  let state = [...seed].reduce((value, character) => {
    return Math.imul(value ^ character.charCodeAt(0), 16777619)
  }, 2166136261) >>> 0
  return () => {
    state += 0x6d2b79f5
    let result = state
    result = Math.imul(result ^ (result >>> 15), result | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

const shuffleWith = <T,>(items: T[], random: () => number): T[] =>
  [...items]
    .map((value) => ({ value, order: random() }))
    .sort((a, b) => a.order - b.order)
    .map(({ value }) => value)

export function createGame(count: number, humanSeat = 1, seed?: string): GameState {
  const random = seed ? seededRandom(seed) : Math.random
  const preset = getPreset(count)
  const godPool: RoleKey[] = ['seer', 'witch', 'hunter', 'guard', 'idiot', 'knight']
  const gods = shuffleWith(godPool.slice(0, count <= 7 ? 4 : godPool.length), random).slice(0, preset.gods)
  const roles: RoleKey[] = [
    ...Array<RoleKey>(preset.wolves).fill('werewolf'),
    ...gods,
    ...Array<RoleKey>(count - preset.wolves - preset.gods).fill('villager'),
  ]
  const deck = shuffleWith(roles, random)
  const players: Player[] = deck.map((role, index) => ({
    id: index + 1,
    name: `${index + 1}号`,
    role,
    alive: true,
    isHuman: index + 1 === humanSeat,
    personality: index + 1 === humanSeat ? '由你决定' : PERSONALITIES[index % PERSONALITIES.length],
    avatar: index,
  }))

  return {
    players,
    phase: 'night',
    round: 1,
    witchHeal: true,
    witchPoison: true,
    nightStep: 'werewolf',
    nightHealed: false,
    privateNotes: {},
    logs: [
      {
        id: makeId(),
        kind: 'system',
        text: `${count} 人局开始。村庄沉入夜色，请确认你的身份。`,
        round: 1,
      },
    ],
  }
}

export function livingPlayers(game: GameState) {
  return game.players.filter((player) => player.alive)
}

export function checkWinner(players: Player[]): 'wolf' | 'good' | undefined {
  const alive = players.filter((player) => player.alive)
  const wolves = alive.filter((player) => ROLES[player.role].camp === 'wolf').length
  const goods = alive.length - wolves
  if (wolves === 0) return 'good'
  if (wolves >= goods) return 'wolf'
  return undefined
}

export function localSpeech(player: Player, game: GameState): string {
  const alive = livingPlayers(game).filter((item) => item.id !== player.id)
  const suspect = alive[Math.floor(Math.random() * alive.length)]
  const secondSuspect = alive.find((item) => item.id !== suspect.id) ?? suspect
  const latestSpeech = [...game.logs].reverse().find((entry) => entry.kind === 'speech')
  const nightResult = [...game.logs]
    .reverse()
    .find((entry) => entry.kind === 'death' || entry.text.includes('平安无事'))
  const reply = latestSpeech
    ? `回应${latestSpeech.speaker ?? '上一位'}的判断：`
    : ''
  const nightRead = nightResult?.text.includes('平安无事')
    ? '昨夜平安，可能是守卫挡刀或女巫开了解药，暂时不能直接认定神职。'
    : `昨夜出现死亡，先区分狼刀与女巫用毒，${suspect.name}对死讯的反应值得复盘。`
  const roleLines: Record<RoleKey, string[]> = {
    werewolf: [
      `${reply}${nightRead}我先跳预言家，昨晚查了${secondSuspect.name}是好人。${suspect.name}一直跟着风向走，今天优先听他解释。`,
      `${reply}我是一张带身份的牌，昨夜的信息暂时不能全报。${suspect.name}回避了${latestSpeech?.speaker ?? secondSuspect.name}的核心问题，我建议先压他发言。`,
    ],
    seer: [
      `${reply}${nightRead}我可以明确跳预言家，我的查验会按夜间真实信息给出。${suspect.name}如果对跳，请同时交代警徽流和昨夜查验逻辑。`,
      `${reply}我是预言家，不接受只靠情绪拍身份。${suspect.name}前后关注点不一致，${secondSuspect.name}先回答是否认可他的解释。`,
    ],
    witch: [
      `${reply}${nightRead}我有女巫视角，但药物使用情况要结合真实夜间信息判断。${suspect.name}把平安夜直接归功给守卫，视角开得太快。`,
      `${reply}我可以拍女巫身份，昨夜信息与公开结果能对应。${suspect.name}突然更换目标却没补逻辑，今天必须解释清楚。`,
    ],
    hunter: [
      `${reply}${nightRead}我明跳猎人，谁想抗推我就准备承担后果。若今天被放逐，我目前会考虑带走${suspect.name}，除非他补出完整逻辑。`,
      `${reply}我是猎人，枪口暂挂${suspect.name}。他没有回应${latestSpeech?.speaker ?? secondSuspect.name}的质疑，只重复结论，这不算找狼。`,
    ],
    guard: [
      `${reply}${nightRead}守护信息不能直接公开，但平安夜也不能让任何人自动坐实身份。${suspect.name}借夜况给自己做高身份，我不认可。`,
      `${reply}我有神职身份，暂不报具体夜间目标。${suspect.name}的跟票动作和他声称的怀疑对象不一致，请先解释票型。`,
    ],
    idiot: [
      `${reply}听着像钟楼漏风，响得大却没落点。${suspect.name}你来补上？`,
      `${reply}我可能想歪了，不过${suspect.name}这次转弯也太快了。`,
    ],
    knight: [
      `${reply}请把证据摆上桌。${suspect.name}的立场若不变，就该正面回应。`,
      `${reply}我接受争论，但不接受躲闪。${suspect.name}请给明确答案。`,
    ],
    villager: [
      `${reply}${nightRead}我没有真实夜间信息。${suspect.name}却把一种可能说成确定事实，我认为这是视角问题，先把他放进狼坑。`,
      `${reply}我可以暂时诈一张猎人牌替真神挡刀，但我的判断仍只来自公开发言。${suspect.name}没有回应${secondSuspect.name}，今天应重点追问。`,
    ],
  }
  const lines = roleLines[player.role]
  return lines[Math.floor(Math.random() * lines.length)]
}

const nextNightStep = (game: GameState, current: NightStep): NightStep => {
  const order: NightStep[] = ['werewolf', 'guard', 'seer', 'witch', 'resolve']
  const rolesByStep: Partial<Record<NightStep, RoleKey>> = {
    guard: 'guard',
    seer: 'seer',
    witch: 'witch',
  }
  let index = order.indexOf(current) + 1
  while (index < order.length) {
    const candidate = order[index]
    const requiredRole = rolesByStep[candidate]
    if (!requiredRole || game.players.some((player) => player.alive && player.role === requiredRole)) {
      return candidate
    }
    index += 1
  }
  return 'resolve'
}

const randomFrom = (players: Player[]) => players[Math.floor(Math.random() * players.length)]

export function actNight(game: GameState, targetId?: number, action = 'act'): GameState {
  const human = game.players.find((player) => player.isHuman)!
  const players = game.players.map((player) => ({ ...player }))
  const logs = [...game.logs]
  const privateNotes = Object.fromEntries(
    Object.entries(game.privateNotes).map(([id, notes]) => [id, [...notes]]),
  )
  const step = game.nightStep
  const next = nextNightStep(game, step)
  const result: GameState = { ...game, players, logs, privateNotes, nightStep: next }

  if (step === 'werewolf') {
    const candidates = players.filter(
      (player) => player.alive && ROLES[player.role].camp === 'good',
    )
    result.wolfTarget =
      human.role === 'werewolf' && targetId ? targetId : randomFrom(candidates)?.id
  }

  if (step === 'guard') {
    const candidates = players.filter(
      (player) => player.alive && player.id !== game.lastGuarded,
    )
    result.guardedTarget =
      human.role === 'guard' && targetId ? targetId : randomFrom(candidates)?.id
  }

  if (step === 'seer') {
    const seer = players.find((player) => player.alive && player.role === 'seer')
    const candidates = players.filter((player) => player.alive && player.id !== seer?.id)
    const checkedId =
      human.role === 'seer' && targetId ? targetId : randomFrom(candidates)?.id
    const checked = players.find((player) => player.id === checkedId)
    if (seer && checked) {
      const finding = `${checked.name}是${ROLES[checked.role].camp === 'wolf' ? '狼人' : '好人'}`
      privateNotes[seer.id] = [...(privateNotes[seer.id] ?? []), finding]
      if (seer.isHuman) {
        logs.push({
          id: makeId(),
          kind: 'skill',
          text: `星象显现：${finding}。`,
          round: game.round,
          visibility: 'human',
        })
      }
    }
  }

  if (step === 'witch') {
    const witch = players.find((player) => player.alive && player.role === 'witch')
    const pendingVictim =
      game.wolfTarget && game.wolfTarget !== game.guardedTarget
        ? players.find((player) => player.id === game.wolfTarget && player.alive)
        : undefined
    if (human.role === 'witch' && action === 'heal' && game.witchHeal && pendingVictim) {
      result.nightHealed = true
      result.witchHeal = false
    }
    if (human.role === 'witch' && action === 'poison' && game.witchPoison && targetId) {
      const poisonTarget = players.find((player) => player.id === targetId && player.alive)
      if (poisonTarget) {
        result.poisonTarget = poisonTarget.id
        result.witchPoison = false
      }
    }
    if (witch && !witch.isHuman) {
      if (pendingVictim && game.witchHeal && Math.random() < 0.45) {
        result.nightHealed = true
        result.witchHeal = false
      } else if (game.witchPoison && Math.random() < 0.14) {
        const poisonCandidates = players.filter(
          (player) => player.alive && player.id !== witch.id,
        )
        result.poisonTarget = randomFrom(poisonCandidates)?.id
        if (result.poisonTarget) result.witchPoison = false
      }
    }
  }

  return result
}

export function resolveNight(game: GameState): GameState {
  const players = game.players.map((player) => ({ ...player }))
  const victim = players.find((player) => player.id === game.wolfTarget)
  if (victim && victim.id !== game.guardedTarget && !game.nightHealed) victim.alive = false
  const poisoned = players.find((player) => player.id === game.poisonTarget)
  if (poisoned) poisoned.alive = false
  const deadTonight = players.filter(
    (player, index) => game.players[index].alive && !player.alive,
  )
  const logs: LogEntry[] = [
    ...game.logs,
    {
      id: makeId(),
      kind: deadTonight.length ? 'death' : 'system',
      text: deadTonight.length
        ? `天亮了。昨夜，${deadTonight.map((player) => player.name).join('、')} 没能走出黑暗。`
        : '天亮了。昨夜平安无事。',
      round: game.round,
    },
  ]
  const winner = checkWinner(players)
  return {
    ...game,
    players,
    logs,
    lastGuarded: game.guardedTarget,
    phase: winner ? 'result' : 'day',
    winner,
    nightStep: 'werewolf',
    wolfTarget: undefined,
    guardedTarget: undefined,
    poisonTarget: undefined,
    nightHealed: false,
  }
}

export function resolveVote(game: GameState, humanVote: number, aiVotes: Record<number, number>) {
  const players = game.players.map((player) => ({
    ...player,
    vote: player.isHuman ? humanVote : aiVotes[player.id],
  }))
  const tally = new Map<number, number>()
  players
    .filter((player) => player.alive && player.vote)
    .forEach((player) => tally.set(player.vote!, (tally.get(player.vote!) ?? 0) + 1))
  const max = Math.max(...tally.values())
  const top = [...tally.entries()].filter(([, votes]) => votes === max).map(([id]) => id)
  const eliminatedId = top[Math.floor(Math.random() * top.length)]
  const eliminated = players.find((player) => player.id === eliminatedId)
  if (eliminated) eliminated.alive = false
  const logs = [
    ...game.logs,
    {
      id: makeId(),
      kind: 'death' as const,
      text:
        top.length > 1
          ? `平票裁决落下，${eliminated?.name} 被放逐。`
          : `${eliminated?.name} 以 ${max} 票被放逐出村。`,
      round: game.round,
    },
  ]
  const winner = checkWinner(players)
  return {
    ...game,
    players,
    logs,
    winner,
    phase: winner ? ('result' as const) : ('night' as const),
    round: winner ? game.round : game.round + 1,
    nightStep: 'werewolf' as const,
    wolfTarget: undefined,
    guardedTarget: undefined,
    poisonTarget: undefined,
    nightHealed: false,
  }
}
