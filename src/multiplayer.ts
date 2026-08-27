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
  | { type: 'joined'; playerId: string; room: RoomState }
  | { type: 'room'; room: RoomState }
  | { type: 'started'; room: RoomState; seed: string }
  | { type: 'game-event'; playerId: string; event: unknown }
  | { type: 'error'; message: string }

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

export function roomInviteUrl(code: string) {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('room', code)
  return url.toString()
}
