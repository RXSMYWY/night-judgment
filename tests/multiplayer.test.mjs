import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { test } from 'node:test'
import { WebSocket } from 'ws'
import {
  NIGHT_ACTION_MS,
  SPEECH_TURN_MS,
} from '../server/game.mjs'

const TEST_NIGHT_MS = 300
const TEST_SPEECH_MS = 350

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
    assert.ok(activeNightStates[0].view.deadline - Date.now() <= TEST_NIGHT_MS)

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
    assert.ok(dayStates[0].view.deadline - Date.now() <= TEST_SPEECH_MS)

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
  } finally {
    clients.forEach((client) => client.socket.close())
    server.kill()
    await once(server, 'exit').catch(() => undefined)
  }
})
