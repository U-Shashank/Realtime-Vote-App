"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const ioredis_1 = require("ioredis");
require("dotenv/config");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.get("/", (req, res) => {
    res.send("Welcome to the server!");
});
const redis = new ioredis_1.Redis(process.env.REDIS_CONNECTION_STRING);
const subRedis = new ioredis_1.Redis(process.env.REDIS_CONNECTION_STRING);
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: ["http://localhost:3000", process.env.CLIENT_URL],
        methods: ["GET", "POST"],
        credentials: true,
    },
});
subRedis.on("message", (channel, message) => {
    io.to(channel).emit("room-update", message);
});
subRedis.on("error", (err) => {
    console.error("Redis subscription error", err);
});
io.on("connection", (socket) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = socket;
    socket.on("join-room", (room) => __awaiter(void 0, void 0, void 0, function* () {
        console.log("User joined room:", room);
        const subscribedRooms = yield redis.smembers("subscribed-rooms");
        yield socket.join(room);
        yield redis.sadd(`rooms:${id}`, room);
        yield redis.hincrby("room-connections", room, 1);
        if (!subscribedRooms.includes(room)) {
            subRedis.subscribe(room, (err) => __awaiter(void 0, void 0, void 0, function* () {
                if (err) {
                    console.error("Failed to subscribe:", err);
                }
                else {
                    yield redis.sadd("subscribed-rooms", room);
                    console.log("Subscribed to room:", room);
                }
            }));
        }
    }));
    socket.on("disconnect", () => __awaiter(void 0, void 0, void 0, function* () {
        const { id } = socket;
        const joinedRooms = yield redis.smembers(`rooms:${id}`);
        yield redis.del(`rooms:${id}`);
        joinedRooms.forEach((room) => __awaiter(void 0, void 0, void 0, function* () {
            const remainingConnections = yield redis.hincrby(`room-connections`, room, -1);
            if (remainingConnections <= 0) {
                yield redis.hdel(`room-connections`, room);
                subRedis.unsubscribe(room, (err) => __awaiter(void 0, void 0, void 0, function* () {
                    if (err) {
                        console.error("Failed to unsubscribe", err);
                    }
                    else {
                        yield redis.srem("subscribed-rooms", room);
                        console.log("Unsubscribed from room:", room);
                    }
                }));
            }
        }));
    }));
}));
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server is listening on port: ${PORT}`);
});
