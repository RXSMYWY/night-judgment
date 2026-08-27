import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'

const PORT = Number(process.env.PORT || 3001)
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*'
const rooms = new Map()

const roomCode = () => Math.random().toString(36).slice(2, 8).toUpperCase()
const send = (socket, payload) => {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload))
}

function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    targetCount: room.targetCount,
    players: room.players.map(({ socket: _socket, ...player }) => player),
  }
}

function broadcast(room, payload = { type: 'room', room: publicRoom(room) }) {
  room.players.forEach((player) => {
    if (!player.isBot && player.socket) send(player.socket, payload)
  })
}

function normalizeSeats(room) {
  room.players.forEach((player, index) => {
    player.seat = index + 1
    player.name = `${index + 1}号`
  })
}

function createRoom(socket, requestedCount) {
  let code = roomCode()
  while (rooms.has(code)) code = roomCode()
  const playerId = randomUUID()
  const room = {
    code,
    hostId: playerId,
    status: 'lobby',
    targetCount: Math.min(15, Math.max(6, Number(requestedCount) || 9)),
    players: [{
      id: playerId,
      seat: 1,
      name: '1号',
      ready: false,
      isBot: false,
      online: true,
      socket,
    }],
  }
  rooms.set(code, room)
  socket.meta = { roomCode: code, playerId }
  send(socket, { type: 'joined', playerId, room: publicRoom(room) })
}

function joinRoom(socket, rawCode) {
  const code = String(rawCode || '').toUpperCase()
  const room = rooms.get(code)
  if (!room || room.status !== 'lobby') {
    return send(socket, { type: 'error', message: '房间不存在或游戏已经开始。' })
  }
  if (room.players.length >= room.targetCount) {
    return send(socket, { type: 'error', message: '房间已满。' })
  }
  const playerId = randomUUID()
  room.players.push({
    id: playerId,
    seat: room.players.length + 1,
    name: `${room.players.length + 1}号`,
    ready: false,
    isBot: false,
    online: true,
    socket,
  })
  socket.meta = { roomCode: code, playerId }
  send(socket, { type: 'joined', playerId, room: publicRoom(room) })
  broadcast(room)
}

function handleRoomAction(socket, message) {
  const room = rooms.get(socket.meta?.roomCode)
  const player = room?.players.find((item) => item.id === socket.meta?.playerId)
  if (!room || !player) return

  if (message.type === 'ready' && room.status === 'lobby') {
    player.ready = Boolean(message.ready)
    broadcast(room)
  }

  if (message.type === 'add-bot' && room.hostId === player.id && room.status === 'lobby') {
    if (room.players.length >= room.targetCount) return
    room.players.push({
      id: `bot-${randomUUID()}`,
      seat: room.players.length + 1,
      name: `${room.players.length + 1}号`,
      ready: true,
      isBot: true,
      online: true,
    })
    broadcast(room)
  }

  if (message.type === 'fill-bots' && room.hostId === player.id && room.status === 'lobby') {
    while (room.players.length < room.targetCount) {
      room.players.push({
        id: `bot-${randomUUID()}`,
        seat: room.players.length + 1,
        name: `${room.players.length + 1}号`,
        ready: true,
        isBot: true,
        online: true,
      })
    }
    broadcast(room)
  }

  if (message.type === 'remove-bot' && room.hostId === player.id && room.status === 'lobby') {
    room.players = room.players.filter((item) => item.id !== message.playerId || !item.isBot)
    normalizeSeats(room)
    broadcast(room)
  }

  if (message.type === 'start' && room.hostId === player.id && room.status === 'lobby') {
    const allReady = room.players.length === room.targetCount && room.players.every((item) => item.ready)
    if (!allReady) {
      return send(socket, { type: 'error', message: '房间必须满员，且所有真人玩家都已准备。' })
    }
    room.status = 'playing'
    broadcast(room, {
      type: 'started',
      room: publicRoom(room),
      seed: randomUUID(),
    })
  }

  if (message.type === 'game-event' && room.status === 'playing') {
    broadcast(room, {
      type: 'game-event',
      playerId: player.id,
      event: message.event,
    })
  }
}

function disconnect(socket) {
  const room = rooms.get(socket.meta?.roomCode)
  if (!room) return
  const leaving = room.players.find((item) => item.id === socket.meta?.playerId)
  if (!leaving) return
  if (room.status === 'lobby') {
    room.players = room.players.filter((item) => item.id !== leaving.id)
    if (room.players.length === 0) {
      rooms.delete(room.code)
      return
    }
    if (room.hostId === leaving.id) {
      room.hostId = room.players.find((item) => !item.isBot)?.id || room.players[0].id
    }
    normalizeSeats(room)
  } else {
    leaving.online = false
  }
  broadcast(room)
}

const server = createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', FRONTEND_ORIGIN)
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (request.url === '/health') {
    response.end(JSON.stringify({ ok: true, rooms: rooms.size }))
    return
  }
  response.statusCode = 404
  response.end(JSON.stringify({ error: 'Not found' }))
})

const wss = new WebSocketServer({ server, path: '/ws' })
wss.on('connection', (socket) => {
  send(socket, { type: 'connected' })
  socket.on('message', (raw) => {
    try {
      const message = JSON.parse(String(raw))
      if (message.type === 'create') return createRoom(socket, message.targetCount)
      if (message.type === 'join') return joinRoom(socket, message.code)
      handleRoomAction(socket, message)
    } catch {
      send(socket, { type: 'error', message: '无法解析房间请求。' })
    }
  })
  socket.on('close', () => disconnect(socket))
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Night Judgment room server listening on :${PORT}`)
})
