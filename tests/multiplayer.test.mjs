import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { test } from 'node:test'
import { WebSocket } from 'ws'
import {
  advanceBotSpeeches,
  createAuthoritativeGame,
  NIGHT_ACTION_MS,
  playerView,
  resolveNightStep,
  SPEECH_TURN_MS,
  submitNightAction,
  submitWolfChat,
  VOTE_MS,
} from '../server/game.mjs'

const TEST_NIGHT_MS = 300
const TEST_SPEECH_MS = 350
const TEST_VOTE_MS = 300

function createClient(url) {
  const socket = new WebSocket(url)
  const messages = []
  const waiters = []

  socket.on('message', (raw) => {
    const message = JSON.parse(String(raw))
    const waiterIndex = waiters.findIndex((waiter) => waiter.predicate(message))
    if (waiterIndex >= 0) {
      const [waiter] = waiters.splice(waiterIndex, 1)
      clearTimeout(waiter.timer)
      waiter.resolve(message)
      return
    }
    messages.push(message)
  })

  const waitFor = (predicate, timeout = 5_000) => {
    const existingIndex = messages.findIndex(predicate)
    if (existingIndex >= 0) {
      return Promise.resolve(messages.splice(existingIndex, 1)[0])
    }
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: undefined }
      waiter.timer = setTimeout(() => {
        const index = waiters.indexOf(waiter)
        if (index >= 0) waiters.splice(index, 1)
        reject(new Error(`Timed out waiting for WebSocket message after ${timeout}ms`))
      }, timeout)
      waiters.push(waiter)
    })
  }

  return { socket, waitFor }
}

async function waitForServer(port) {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`)
      if (response.ok) return
    } catch {
      // The child process may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 40))
  }
  throw new Error('Room server did not become healthy')
}

test('production countdown defaults stay at 10 seconds and 60 seconds', () => {
  assert.equal(NIGHT_ACTION_MS, 10_000)
  assert.equal(SPEECH_TURN_MS, 60_000)
  assert.equal(VOTE_MS, 60_000)
})

test('bot wolves answer private chat and follow a human kill call', () => {
  const players = Array.from({ length: 6 }, (_, index) => ({
    id: `room-${index + 1}`,
    seat: index + 1,
    name: `${index + 1}号`,
    ready: true,
    isBot: index !== 0,
    online: true,
  }))
  const room = { targetCount: 6, players }
  let seedIndex = 0
  do {
    room.game = createAuthoritativeGame(room, `wolf-chat-${seedIndex}`)
    seedIndex += 1
  } while (
    seedIndex < 500 &&
    !(room.game.players[0].role === 'werewolf' &&
      room.game.players.some((player) => player.isBot && player.role === 'werewolf'))
  )
  assert.equal(room.game.players[0].role, 'werewolf')
  const botWolf = room.game.players.find((player) => player.isBot && player.role === 'werewolf')
  assert.ok(botWolf)

  assert.equal(submitWolfChat(room, players[0], '今晚杀1号'), true)
  assert.equal(room.game.nightActions[botWolf.id].targetId, 1)
  assert.match(room.game.wolfChat.at(-1).text, /跟票袭击1号/)
})

test('wolf votes support self-kill, plurality, and random tied targets', () => {
  const players = Array.from({ length: 9 }, (_, index) => ({
    id: `human-${index + 1}`,
    seat: index + 1,
    name: `${index + 1}号`,
    ready: true,
    isBot: false,
    online: true,
  }))
  const room = { targetCount: 9, players }
  room.game = createAuthoritativeGame(room, 'wolf-vote-rules')
  const wolves = room.game.players.filter((player) => player.role === 'werewolf')
  assert.equal(wolves.length, 3)

  room.game.deadline = Date.now() + 1_000
  const firstWolfActor = players.find((player) => player.seat === wolves[0].id)
  assert.equal(
    submitNightAction(room, firstWolfActor, {
      action: 'act',
      targetId: wolves[0].id,
    }),
    true,
  )
  room.game.nightActions[wolves[1].id] = { action: 'act', targetId: wolves[0].id }
  room.game.nightActions[wolves[2].id] = { action: 'act', targetId: wolves[1].id }
  resolveNightStep(room)
  assert.equal(room.game.wolfTarget, wolves[0].id)

  room.game.nightStep = 'werewolf'
  room.game.nightActions = Object.fromEntries(
    wolves.map((wolf, index) => [wolf.id, { action: 'act', targetId: wolves[index].id }]),
  )
  resolveNightStep(room)
  assert.ok(wolves.some((wolf) => wolf.id === room.game.wolfTarget))
})

test('result view reveals every role and the complete action history', () => {
  const players = Array.from({ length: 6 }, (_, index) => ({
    id: `human-${index + 1}`,
    seat: index + 1,
    name: `${index + 1}号`,
    ready: true,
    isBot: false,
    online: true,
  }))
  const room = { targetCount: 6, players }
  room.game = createAuthoritativeGame(room, 'result-review')
  room.game.actionHistory.push({
    id: 'action-1',
    round: 1,
    phase: 'night',
    actor: '1号',
    action: '守护',
    target: '2号',
  })
  assert.deepEqual(playerView(room, players[0]).game.actionHistory, [])
  room.game.phase = 'result'
  const view = playerView(room, players[0])
  assert.deepEqual(
    view.game.players.map((player) => player.role),
    room.game.players.map((player) => player.role),
  )
  assert.deepEqual(view.game.actionHistory, room.game.actionHistory)
})

test('an offline human speaker is skipped immediately', () => {
  const players = Array.from({ length: 6 }, (_, index) => ({
    id: `human-${index + 1}`,
    seat: index + 1,
    name: `${index + 1}号`,
    ready: true,
    isBot: false,
    online: index !== 0,
  }))
  const room = { targetCount: 6, players }
  room.game = createAuthoritativeGame(room, 'offline-speaker')
  room.game.phase = 'day'
  room.game.speechOrder = [1, 2]
  room.game.speechIndex = 0
  advanceBotSpeeches(room, () => undefined)
  assert.equal(room.game.speechTurnSeat, 2)
  assert.match(room.game.logs.at(-1).text, /1号已离线/)
  clearTimeout(room.gameTimer)
})

test('room creation only accepts supported whole-player counts', {
  timeout: 8_000,
}, async () => {
  const port = 32_000 + Math.floor(Math.random() * 1_000)
  const server = spawn(process.execPath, ['server/index.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let client

  try {
    await waitForServer(port)
    client = createClient(`ws://127.0.0.1:${port}/ws`)
    await once(client.socket, 'open')
    client.socket.send(JSON.stringify({ type: 'create', targetCount: 11 }))
    const unsupportedCountRoom = await client.waitFor((message) => message.type === 'joined')
    assert.equal(unsupportedCountRoom.room.targetCount, 9)

    client.socket.send(JSON.stringify({ type: 'create', targetCount: 6.5 }))
    const fractionalCountRoom = await client.waitFor((message) => message.type === 'joined')
    assert.equal(fractionalCountRoom.room.targetCount, 9)
  } finally {
    client?.socket.close()
    server.kill()
    await once(server, 'exit').catch(() => undefined)
  }
})

test('human players and bots enter one shared match without replacing human seats', {
  timeout: 8_000,
}, async () => {
  const port = 33_000 + Math.floor(Math.random() * 1_000)
  const server = spawn(process.execPath, ['server/index.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const clients = []

  try {
    await waitForServer(port)
    const url = `ws://127.0.0.1:${port}/ws`
    for (let index = 0; index < 2; index += 1) {
      const client = createClient(url)
      clients.push(client)
      await once(client.socket, 'open')
    }

    clients[0].socket.send(JSON.stringify({ type: 'create', targetCount: 6 }))
    const hostJoin = await clients[0].waitFor((message) => message.type === 'joined')
    clients[1].socket.send(JSON.stringify({ type: 'join', code: hostJoin.room.code }))
    await clients[1].waitFor((message) => message.type === 'joined')

    clients.forEach((client) => {
      client.socket.send(JSON.stringify({ type: 'ready', ready: true }))
    })
    clients[0].socket.send(JSON.stringify({ type: 'fill-bots' }))
    await clients[0].waitFor(
      (message) =>
        message.type === 'room' &&
        message.room.players.length === 6 &&
        message.room.players.every((player) => player.ready),
    )
    clients[0].socket.send(JSON.stringify({ type: 'start' }))

    const states = await Promise.all(
      clients.map((client) => client.waitFor((message) => message.type === 'game-state')),
    )
    assert.equal(new Set(states.map((message) => message.view.matchId)).size, 1)
    states.forEach((message, viewerIndex) => {
      assert.equal(message.room.players.filter((player) => !player.isBot).length, 2)
      assert.equal(message.room.players.filter((player) => player.isBot).length, 4)
      assert.deepEqual(
        message.view.game.players.filter((player) => !player.isBot).map((player) => player.id),
        [1, 2],
      )
      assert.equal(message.view.game.players[viewerIndex].isHuman, true)
      assert.equal(message.view.game.players[1 - viewerIndex].isHuman, false)
      assert.equal(message.view.game.players[1 - viewerIndex].isBot, false)
    })
  } finally {
    clients.forEach((client) => client.socket.close())
    server.kill()
    await once(server, 'exit').catch(() => undefined)
  }
})

test('six human clients share one authoritative game and private wolf channel', {
  timeout: 12_000,
}, async () => {
  const port = 31_000 + Math.floor(Math.random() * 1_000)
  const server = spawn(process.execPath, ['server/index.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      NIGHT_ACTION_MS: String(TEST_NIGHT_MS),
      NIGHT_RESOLVE_MS: '40',
      SPEECH_TURN_MS: String(TEST_SPEECH_MS),
      BOT_SPEECH_DELAY_MS: '30',
      VOTE_MS: String(TEST_VOTE_MS),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const clients = []

  try {
    await waitForServer(port)
    const url = `ws://127.0.0.1:${port}/ws`
    for (let index = 0; index < 6; index += 1) {
      const client = createClient(url)
      clients.push(client)
      await once(client.socket, 'open')
    }

    clients[0].socket.send(JSON.stringify({ type: 'create', targetCount: 6 }))
    const hostJoin = await clients[0].waitFor((message) => message.type === 'joined')
    const joins = [hostJoin]
    for (let index = 1; index < clients.length; index += 1) {
      clients[index].socket.send(JSON.stringify({ type: 'join', code: hostJoin.room.code }))
      joins[index] = await clients[index].waitFor((message) => message.type === 'joined')
    }

    clients.forEach((client) => {
      client.socket.send(JSON.stringify({ type: 'ready', ready: true }))
    })
    await clients[0].waitFor(
      (message) =>
        message.type === 'room' &&
        message.room.players.length === 6 &&
        message.room.players.every((player) => player.ready),
    )
    clients[0].socket.send(JSON.stringify({ type: 'start' }))

    const initialStates = await Promise.all(
      clients.map((client) => client.waitFor((message) => message.type === 'game-state')),
    )
    const matchIds = new Set(initialStates.map((message) => message.view.matchId))
    const openingLogIds = new Set(
      initialStates.map((message) => message.view.game.logs[0].id),
    )
    assert.equal(matchIds.size, 1, 'all clients must receive the same server match')
    assert.equal(openingLogIds.size, 1, 'all clients must share the same game log')

    initialStates.forEach((message, index) => {
      assert.equal(message.view.game.players[index].isHuman, true)
      assert.equal(
        message.view.game.players.filter((player) => player.isBot).length,
        0,
        'other human seats must not become bots in a client view',
      )
      assert.equal(message.room.players.filter((player) => player.isBot).length, 0)
    })

    const wolfIndexes = initialStates
      .map((message, index) => (
        message.view.game.players.find((player) => player.isHuman)?.role === 'werewolf'
          ? index
          : -1
      ))
      .filter((index) => index >= 0)
    assert.equal(wolfIndexes.length, 2)
    const wolfSeats = wolfIndexes.map((index) => index + 1)
    wolfIndexes.forEach((index) => {
      assert.deepEqual(
        initialStates[index].view.wolfTeammates,
        wolfSeats.filter((seat) => seat !== index + 1),
      )
    })
    initialStates.forEach((message, index) => {
      if (!wolfIndexes.includes(index)) assert.deepEqual(message.view.wolfTeammates, [])
    })

    clients.forEach((client) => {
      client.socket.send(JSON.stringify({ type: 'enter-game' }))
    })
    const activeNightStates = await Promise.all(
      clients.map((client) =>
        client.waitFor(
          (message) => message.type === 'game-state' && message.view.deadline > Date.now(),
        )),
    )
    assert.equal(new Set(activeNightStates.map((message) => message.view.deadline)).size, 1)
    assert.ok(activeNightStates[0].view.deadline - Date.now() <= TEST_NIGHT_MS + 100)

    const chatText = '今晚统一袭击3号'
    clients[wolfIndexes[0]].socket.send(JSON.stringify({
      type: 'wolf-chat',
      text: chatText,
    }))
    const chatStates = await Promise.all(
      clients.map((client) =>
        client.waitFor(
          (message) =>
            message.type === 'game-state' &&
            message.view.revision > activeNightStates[0].view.revision,
        )),
    )
    chatStates.forEach((message, index) => {
      if (wolfIndexes.includes(index)) {
        assert.equal(message.view.wolfChat.at(-1)?.text, chatText)
      } else {
        assert.deepEqual(message.view.wolfChat, [])
      }
    })

    const replyText = '收到，我补充观察其他人的行动'
    clients[wolfIndexes[1]].socket.send(JSON.stringify({
      type: 'wolf-chat',
      text: replyText,
    }))
    const replyStates = await Promise.all(
      clients.map((client) =>
        client.waitFor(
          (message) =>
            message.type === 'game-state' &&
            message.view.revision > chatStates[0].view.revision,
        )),
    )
    replyStates.forEach((message, index) => {
      if (wolfIndexes.includes(index)) {
        assert.deepEqual(
          message.view.wolfChat.slice(-2).map((entry) => entry.text),
          [chatText, replyText],
        )
      } else {
        assert.deepEqual(message.view.wolfChat, [])
      }
    })

    const nextNightStates = await Promise.all(
      clients.map((client) =>
        client.waitFor(
          (message) =>
            message.type === 'game-state' &&
            message.view.game.phase === 'night' &&
            message.view.game.nightStep !== 'werewolf',
        )),
    )
    assert.equal(
      new Set(nextNightStates.map((message) => message.view.game.nightStep)).size,
      1,
      'the night step must advance identically for every client',
    )

    const dayStates = await Promise.all(
      clients.map((client) =>
        client.waitFor(
          (message) =>
            message.type === 'game-state' &&
            message.view.game.phase === 'day' &&
            message.view.deadline > Date.now(),
          5_000,
        )),
    )
    assert.equal(new Set(dayStates.map((message) => message.view.speechIndex)).size, 1)
    assert.ok(dayStates[0].view.deadline - Date.now() <= TEST_SPEECH_MS + 100)

    const timedOutStates = await Promise.all(
      clients.map((client) =>
        client.waitFor(
          (message) =>
            message.type === 'game-state' &&
            message.view.game.logs.some((entry) => entry.text.includes('已自动过麦')),
          2_000,
        )),
    )
    assert.equal(
      new Set(timedOutStates.map((message) => message.view.game.logs.at(-1)?.id)).size,
      1,
      'speech timeout must be one shared server event',
    )

    const reconnectIndex = 0
    clients[reconnectIndex].socket.close()
    await once(clients[reconnectIndex].socket, 'close')
    const resumedClient = createClient(url)
    clients[reconnectIndex] = resumedClient
    await once(resumedClient.socket, 'open')
    resumedClient.socket.send(JSON.stringify({
      type: 'resume',
      code: hostJoin.room.code,
      playerId: joins[reconnectIndex].playerId,
      reconnectToken: joins[reconnectIndex].reconnectToken,
    }))
    const resumed = await resumedClient.waitFor(
      (message) => message.type === 'joined' && message.resumed,
    )
    const resumedState = await resumedClient.waitFor(
      (message) => message.type === 'game-state',
    )
    assert.equal(resumed.playerId, joins[reconnectIndex].playerId)
    assert.equal(resumedState.view.matchId, initialStates[0].view.matchId)
    assert.equal(resumedState.view.game.players[reconnectIndex].isHuman, true)

    const voteStates = await Promise.all(
      clients.map((client) =>
        client.waitFor(
          (message) =>
            message.type === 'game-state' &&
            message.view.game.phase === 'vote' &&
            message.view.deadline > Date.now(),
          5_000,
        )),
    )
    assert.ok(voteStates[0].view.deadline - Date.now() <= TEST_VOTE_MS + 100)
    const nextRoundStates = await Promise.all(
      clients.map((client) =>
        client.waitFor(
          (message) =>
            message.type === 'game-state' &&
            message.view.game.phase === 'night' &&
            message.view.game.round === 2,
          2_000,
        )),
    )
    assert.equal(new Set(nextRoundStates.map((message) => message.view.deadline)).size, 1)
  } finally {
    clients.forEach((client) => client.socket.close())
    server.kill()
    await once(server, 'exit').catch(() => undefined)
  }
})
