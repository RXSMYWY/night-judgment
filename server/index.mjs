import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'
import {
  advanceBotSpeeches,
  createAuthoritativeGame,
  NIGHT_ACTION_MS,
  playerView,
  resolveNight,
  resolveNightStep,
  submitNightAction,
  submitSpeech,
  submitVote,
  submitWolfChat,
} from './game.mjs'

const PORT = Number(process.env.PORT || 3001)
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*'
const rooms = new Map()
const LOBBY_RECONNECT_GRACE_MS = 30_000

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
    players: room.players.map((player) => ({
      id: player.id,
      seat: player.seat,
      name: player.name,
      ready: player.ready,
      isBot: player.isBot,
      online: player.online,
    })),
  }
}

function broadcast(room, payload = { type: 'room', room: publicRoom(room) }) {
  room.players.forEach((player) => {
    if (!player.isBot && player.socket) send(player.socket, payload)
  })
}

function gameStatePayload(room, player) {
  return {
    type: 'game-state',
    room: publicRoom(room),
    view: playerView(room, player),
  }
}

function broadcastGame(room, changed = true) {
  if (changed) room.game.revision += 1
  room.players.forEach((player) => {
    if (!player.isBot && player.socket) {
      send(player.socket, gameStatePayload(room, player))
    }
  })
}

function scheduleNight(room) {
  clearTimeout(room.gameTimer)
  if (room.game?.phase !== 'night') return
  const delay = Math.max(0, room.game.deadline - Date.now())
  room.gameTimer = setTimeout(() => {
    if (room.game.nightStep === 'resolve') {
      resolveNight(room)
      if (room.game.phase === 'day') {
        advanceBotSpeeches(room, () => broadcastGame(room))
      } else {
        broadcastGame(room)
      }
      return
    }
    resolveNightStep(room)
    broadcastGame(room)
    scheduleNight(room)
  }, delay)
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
  const reconnectToken = randomUUID()
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
      reconnectToken,
    }],
  }
  rooms.set(code, room)
  socket.meta = { roomCode: code, playerId }
  send(socket, {
    type: 'joined',
    playerId,
    reconnectToken,
    room: publicRoom(room),
  })
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
  const reconnectToken = randomUUID()
  room.players.push({
    id: playerId,
    seat: room.players.length + 1,
    name: `${room.players.length + 1}号`,
    ready: false,
    isBot: false,
    online: true,
    socket,
    reconnectToken,
  })
  socket.meta = { roomCode: code, playerId }
  send(socket, {
    type: 'joined',
    playerId,
    reconnectToken,
    room: publicRoom(room),
  })
  broadcast(room)
}

function resumeRoom(socket, message) {
  const code = String(message.code || '').toUpperCase()
  const room = rooms.get(code)
  const player = room?.players.find(
    (item) =>
      !item.isBot &&
      item.id === message.playerId &&
      item.reconnectToken === message.reconnectToken,
  )
  if (!room || !player) {
    return send(socket, {
      type: 'error',
      code: 'resume-failed',
      message: '原席位已失效，请重新加入房间。',
    })
  }

  const previousSocket = player.socket
  clearTimeout(player.disconnectTimer)
  player.disconnectTimer = undefined
  player.socket = socket
  player.online = true
  socket.meta = { roomCode: code, playerId: player.id }
  if (previousSocket && previousSocket !== socket) {
    send(previousSocket, { type: 'error', message: '该席位已在另一个页面恢复连接。' })
    previousSocket.close(4001, 'Session resumed elsewhere')
  }
  send(socket, {
    type: 'joined',
    playerId: player.id,
    reconnectToken: player.reconnectToken,
    resumed: true,
    room: publicRoom(room),
  })
  broadcast(room)
  if (room.status === 'playing') send(socket, gameStatePayload(room, player))
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
    const allReady =
      room.players.length === room.targetCount &&
      room.players.every((item) => item.ready && (item.isBot || item.online))
    if (!allReady) {
      return send(socket, {
        type: 'error',
        message: '房间必须满员，且所有在线真人玩家都已准备。',
      })
    }
    room.status = 'playing'
    room.players.forEach((item) => {
      item.entered = item.isBot
    })
    const seed = randomUUID()
    room.game = createAuthoritativeGame(room, seed)
    broadcast(room, {
      type: 'started',
      room: publicRoom(room),
    })
    broadcastGame(room)
  }

  if (message.type === 'enter-game' && room.status === 'playing') {
    player.entered = true
    if (
      !room.game.deadline &&
      room.players.filter((item) => !item.isBot).every((item) => item.entered)
    ) {
      room.game.deadline = Date.now() + NIGHT_ACTION_MS
      scheduleNight(room)
    }
    broadcastGame(room)
  }

  if (message.type === 'night-action' && room.status === 'playing') {
    if (submitNightAction(room, player, message)) broadcastGame(room)
  }

  if (message.type === 'speech' && room.status === 'playing') {
    if (!submitSpeech(room, player, message.text, () => broadcastGame(room))) {
      send(socket, { type: 'error', message: '当前还没有轮到你发言。' })
    }
  }

  if (message.type === 'vote' && room.status === 'playing') {
    if (!submitVote(room, player, message.targetId)) {
      return send(socket, { type: 'error', message: '当前投票无效。' })
    }
    broadcastGame(room)
    if (room.game.phase === 'night') scheduleNight(room)
  }

  if (message.type === 'wolf-chat' && room.status === 'playing') {
    if (submitWolfChat(room, player, message.text)) broadcastGame(room)
  }

  if (message.type === 'sync-game' && room.status === 'playing') {
    send(socket, gameStatePayload(room, player))
  }
}

function disconnect(socket) {
  const room = rooms.get(socket.meta?.roomCode)
  if (!room) return
  const leaving = room.players.find((item) => item.id === socket.meta?.playerId)
  if (!leaving) return
  if (leaving.socket !== socket) return
  leaving.online = false
  leaving.socket = undefined
  if (room.status === 'lobby') {
    clearTimeout(leaving.disconnectTimer)
    leaving.disconnectTimer = setTimeout(() => {
      const currentRoom = rooms.get(room.code)
      const currentPlayer = currentRoom?.players.find((item) => item.id === leaving.id)
      if (!currentRoom || !currentPlayer || currentPlayer.online) return
      currentRoom.players = currentRoom.players.filter((item) => item.id !== leaving.id)
      if (currentRoom.players.length === 0) {
        clearTimeout(currentRoom.gameTimer)
        rooms.delete(currentRoom.code)
        return
      }
      if (currentRoom.hostId === leaving.id) {
        currentRoom.hostId =
          currentRoom.players.find((item) => !item.isBot)?.id ||
          currentRoom.players[0].id
      }
      normalizeSeats(currentRoom)
      broadcast(currentRoom)
    }, LOBBY_RECONNECT_GRACE_MS)
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
      if (message.type === 'resume') return resumeRoom(socket, message)
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
