import express from "express"
import cors from "cors"
import http from "http"
import { Server } from "socket.io"
import { Redis } from "ioredis"
import "dotenv/config"

const app = express()
app.use(cors())

const redis = new Redis(process.env.REDIS_CONNECTION_STRING as string)
const subRedis = new Redis(process.env.REDIS_CONNECTION_STRING as string)

const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: [process.env.CLIENT_URL as string],
    methods: ["GET", "POST"],
    credentials: true,
  },
})

subRedis.on("message", (channel, message) => {
  try {
    const parsedMessage = JSON.parse(message)
    io.to(channel).emit("room-update", message)
  } catch (error) {
    console.error("Error parsing message:", error)
  }
})

subRedis.on("error", (err) => {
  console.error("Redis subscription error", err)
})

io.on("connection", async (socket) => {
  const { id } = socket

  socket.on("join-room", async (room: string) => {
    console.log("User joined room:", room)
    const subscribedRooms = await redis.smembers("subscribed-rooms")

    await socket.join(room)
    await redis.sadd(`rooms:${id}`, room)
    await redis.hincrby("room-connections", room, 1)

    if (!subscribedRooms.includes(room)) {
      await subRedis.subscribe(room)
      await redis.sadd("subscribed-rooms", room)
    }
  })

  socket.on("disconnect", async () => {
    const joinedRooms = await redis.smembers(`rooms:${id}`)
    await redis.del(`rooms:${id}`)

    for (const room of joinedRooms) {
      const remainingConnections = await redis.hincrby(
        `room-connections`,
        room,
        -1
      )

      if (remainingConnections <= 0) {
        await redis.hdel(`room-connections`, room)
        await subRedis.unsubscribe(room)
        await redis.srem("subscribed-rooms", room)
      }
    }
  })
})

const PORT = process.env.PORT || 8080
server.listen(PORT, () => {
  console.log(`Server is listening on port: ${PORT}`)
})