import type { GameState } from './game'

export type RoomPlayer = {
  id: string
  seat: number
  name: string
  ready: boolean
  isBot: boolean
  online: boolean
}

export type RoomState = {
  code: string
  hostId: string
  status: 'lobby' | 'playing'
  targetCount: number
  players: RoomPlayer[]
}

export type RoomMessage =
  | { type: 'connected' }
  | {
      type: 'joined'
      playerId: string
      reconnectToken: string
      resumed?: boolean
      room: RoomState
    }
  | { type: 'room'; room: RoomState }
  | { type: 'started'; room: RoomState }
  | {
      type: 'game-state'
      room: RoomState
      view: {
        matchId: string
        revision: number
        game: GameState
        deadline: number
        speechOrder: number[]
        speechIndex: number
        hasActed: boolean
        hasVoted: boolean
        wolfTeammates: number[]
        wolfChat: WolfChatMessage[]
      }
    }
  | { type: 'error'; code?: string; message: string }

export type WolfChatMessage = {
  id: string
  seat: number
  name: string
  text: string
  round: number
}

export type OnlineGameMeta = {
  matchId: string
  revision: number
  deadline: number
  speechOrder: number[]
  speechIndex: number
  hasActed: boolean
  hasVoted: boolean
  wolfTeammates: number[]
  wolfChat: WolfChatMessage[]
}

export type RoomSession = {
  playerId: string
  reconnectToken: string
}

const localRoomServerUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

export const ROOM_SERVER_URL =
  import.meta.env.VITE_ROOM_SERVER_URL || localRoomServerUrl()

export function createRoomSocket(
  onMessage: (message: RoomMessage) => void,
  onStatus: (status: 'connecting' | 'online' | 'offline') => void,
) {
  onStatus('connecting')
  const socket = new WebSocket(ROOM_SERVER_URL)
  socket.addEventListener('open', () => onStatus('online'))
  socket.addEventListener('close', () => onStatus('offline'))
  socket.addEventListener('error', () => onStatus('offline'))
  socket.addEventListener('message', (event) => {
    try {
      onMessage(JSON.parse(String(event.data)) as RoomMessage)
    } catch {
      onMessage({ type: 'error', message: '房间服务返回了无法识别的数据。' })
    }
  })
  return socket
}

export function sendRoomMessage(socket: WebSocket | null, message: object) {
  if (socket?.readyState !== WebSocket.OPEN) return false
  socket.send(JSON.stringify(message))
  return true
}

const roomSessionKey = (code: string) => `night-judgment-room-${code.toUpperCase()}`

export function loadRoomSession(code: string): RoomSession | null {
  try {
    const value = localStorage.getItem(roomSessionKey(code))
    return value ? JSON.parse(value) as RoomSession : null
  } catch {
    return null
  }
}

export function saveRoomSession(code: string, session: RoomSession) {
  localStorage.setItem(roomSessionKey(code), JSON.stringify(session))
}

export function clearRoomSession(code: string) {
  localStorage.removeItem(roomSessionKey(code))
}

export function roomInviteUrl(code: string) {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('room', code)
  return url.toString()
}
