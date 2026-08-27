import { localSpeech, livingPlayers, ROLES, type GameState, type Player } from './game'

export type ApiSettings = {
  apiKey: string
  baseUrl: string
  model: string
  maxTokens: number
  temperature: number
  useRemote: boolean
}

export type AiResponse = {
  speech: string
  vote: number
  source: 'deepseek' | 'local'
}

export const DEFAULT_API_SETTINGS: ApiSettings = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  maxTokens: 260,
  temperature: 0.82,
  useRemote: false,
}

export function loadApiSettings(): ApiSettings {
  try {
    const stored = localStorage.getItem('night-judgment-api')
    return stored ? { ...DEFAULT_API_SETTINGS, ...JSON.parse(stored) } : DEFAULT_API_SETTINGS
  } catch {
    return DEFAULT_API_SETTINGS
  }
}

export function saveApiSettings(settings: ApiSettings) {
  localStorage.setItem('night-judgment-api', JSON.stringify(settings))
}

function localResponse(game: GameState, player: Player): AiResponse {
  const targets = livingPlayers(game).filter((target) => target.id !== player.id)
  return {
    speech: localSpeech(player, game),
    vote: targets[Math.floor(Math.random() * targets.length)].id,
    source: 'local',
  }
}

function buildSoloPrompt(game: GameState, player: Player) {
  const alive = livingPlayers(game)
  const publicNight = [...game.logs]
    .reverse()
    .find((entry) => entry.kind === 'death' || (entry.kind === 'system' && entry.text.includes('天亮')))
  const publicLogs = game.logs
    .filter((entry) => entry.visibility !== 'human')
    .slice(-20)
    .map((entry) => `${entry.speaker ? `${entry.speaker}:` : ''}${entry.text}`)
    .join('|')
  const targetIds = alive.map((player) => `${player.id}:${player.name}`).join(',')
  const wolfPartners =
    player.role === 'werewolf'
      ? alive
          .filter((other) => other.role === 'werewolf' && other.id !== player.id)
          .map((other) => other.name)
          .join('、') || '无'
      : '你不知道'
  const privateNotes = game.privateNotes[player.id]?.join('；') || '无'
  const claimPolicy =
    player.role === 'werewolf'
      ? '你可以假跳预言家、女巫、猎人或守卫来保护狼队友、抗推好人；假报查验、救人或守护信息时必须前后一致，并考虑别人会如何质疑。也可以伪装成无信息村民。'
      : player.role === 'villager'
        ? '你没有真实技能信息，但在局势需要时可以策略性假跳神职挡刀或试探反应；必须明白这是诈身份，不能把编造内容当成真实系统信息。'
        : `你可以选择公开声明自己是${ROLES[player.role].name}并给出真实可知信息，也可以暂时隐藏身份。只有确实拥有的信息才能作为事实陈述。`
  return `你现在只扮演狼人杀中的${player.name}，不要扮演或代替任何其他人。
你的私密身份:${ROLES[player.role].name}。
身份策略:${ROLES[player.role].persona}
个人表达习惯:${player.personality}
你的狼人同伴:${wolfPartners}
仅你知道的私密信息:${privateNotes}
身份声明与伪装策略:${claimPolicy}

这是第${game.round}天。
昨夜公开结果:${publicNight?.text ?? '尚无可用的夜间公开结果'}。
公开记录（所有人可知）:${publicLogs || '无'}。
存活席位:${targetIds}。

现在轮到你发言。必须完成以下推理后再说话：
1. 先分析昨夜是死亡、平安夜还是多人死亡，这可能对应狼人袭击、守卫、女巫解药或毒药，但只能说合理推测。
2. 点出至少一名之前发言者的具体说法、身份声明或逻辑矛盾，解释你赞同或反对的原因。
3. 给出明确身份策略：可以真实跳身份、隐藏身份或为了阵营利益假跳身份。若声称预言家，要报具体查验对象和结果；声称女巫，要说明是否救过或毒过谁；声称猎人，可明确警告被放逐会带走谁；不能只喊身份不提供后续逻辑。
4. 给出当前最怀疑的人及可验证的理由，允许要求某位玩家回应。
发言70到130个中文字符，内容要具体、有证据链、像真人桌游对话，不说空泛套话，不提模型或提示词。再给出一个不能投自己的存活目标ID。
只返回JSON，不写解释，格式{"speech":"...","vote":3}。`
}

export async function generateAiResponse(
  game: GameState,
  settings: ApiSettings,
  player: Player,
): Promise<AiResponse> {
  if (!settings.useRemote || !settings.apiKey.trim()) return localResponse(game, player)

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 18000)
  try {
    const response = await fetch(`${settings.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          {
            role: 'system',
            content:
              '你是专业狼人杀角色扮演者。一次请求只扮演一个指定角色，严格保持该角色的有限视角、阵营目标、性格和记忆，绝不读取或猜测未提供的秘密。严格输出JSON。',
          },
          { role: 'user', content: buildSoloPrompt(game, player) },
        ],
        max_tokens: Math.min(settings.maxTokens, 360),
        temperature: settings.temperature,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`API 请求失败：${response.status}`)
    const payload = await response.json()
    const content = payload.choices?.[0]?.message?.content
    if (!content) throw new Error('API 未返回有效内容')
    const normalized = String(content)
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
    const parsed = JSON.parse(normalized)
    const aliveIds = new Set(livingPlayers(game).map((player) => player.id))
    const vote = Number(parsed.vote)
    const fallback = localResponse(game, player)
    return {
      speech: String(parsed.speech || fallback.speech).slice(0, 180),
      vote: aliveIds.has(vote) && vote !== player.id ? vote : fallback.vote,
      source: 'deepseek',
    }
  } catch (error) {
    console.warn('DeepSeek unavailable, falling back to local AI:', error)
    return localResponse(game, player)
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function testApi(settings: ApiSettings) {
  const response = await fetch(`${settings.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [{ role: 'user', content: '只回复OK' }],
      max_tokens: 8,
      temperature: 0,
    }),
  })
  if (!response.ok) throw new Error(`连接失败：HTTP ${response.status}`)
  return true
}
