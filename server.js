const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const rooms = new Map();

const server = http.createServer((request, response) => {
  let file = request.url === "/"
    ? "index.html"
    : request.url.slice(1);

  const filePath = path.join(__dirname, file);

  fs.readFile(filePath, (error, data) => {
    if(error){
      response.writeHead(404);
      response.end("File not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type":
        filePath.endsWith(".html")
          ? "text/html"
          : "text/plain"
    });

    response.end(data);
  });
});

const webSocketServer = new WebSocket.Server({ server });

function send(player, message){
  if(player.readyState === WebSocket.OPEN){
    player.send(JSON.stringify(message));
  }
}

function sendPlayers(room){
  const players = {};

  for(const [id, player] of room.players){
    players[id] = {
      username:player.username,
      x:player.x,
      y:player.y
    };
  }

  for(const player of room.players.values()){
    send(player.socket, {
      type:"players",
      players
    });
  }
}

function sendTown(room){
  for(const player of room.players.values()){
    send(player.socket, {
      type:"town",
      objects:room.objects
    });
  }
}

webSocketServer.on("connection", socket => {
  let player = null;
  let room = null;

  socket.on("message", raw => {
    let message;

    try{
      message = JSON.parse(raw.toString());
    }catch(error){
      send(socket,{
        type:"error",
        message:"The server received bad information."
      });
      return;
    }

    if(message.type === "create"){
      const roomCode = String(message.room || "");

      if(!/^\d{5}$/.test(roomCode)){
        send(socket,{
          type:"error",
          message:"Room codes must have five numbers."
        });
        return;
      }

      if(rooms.has(roomCode)){
        send(socket,{
          type:"error",
          message:"That room already exists."
        });
        return;
      }

      room = {
        code:roomCode,
        players:new Map(),
        objects:[]
      };

      rooms.set(roomCode, room);
    }

    if(message.type === "join"){
      const roomCode = String(message.room || "");

      if(!rooms.has(roomCode)){
        send(socket,{
          type:"error",
          message:"That room does not exist yet."
        });
        return;
      }

      room = rooms.get(roomCode);
    }

    if(
      (message.type === "create" || message.type === "join") &&
      room &&
      !player
    ){
      const id =
        Date.now().toString(36) +
        Math.random().toString(36).slice(2);

      player = {
        id,
        socket,
        username:String(message.username || "Cat").slice(0,16),
        x:Number(message.x) || 240,
        y:Number(message.y) || 486
      };

      room.players.set(id, player);

      send(socket,{
        type:"welcome",
        room:room.code,
        id
      });

      send(socket,{
        type:"town",
        objects:room.objects
      });

      sendPlayers(room);
      return;
    }

    if(!player || !room) return;

    if(message.type === "move"){
      player.x = Number(message.x) || 0;
      player.y = Number(message.y) || 0;

      sendPlayers(room);
    }

    if(message.type === "town"){
      if(Array.isArray(message.objects)){
        room.objects = message.objects.slice(0,200);
        sendTown(room);
      }
    }
  });

  socket.on("close", () => {
    if(!player || !room) return;

    room.players.delete(player.id);

    if(room.players.size === 0){
      rooms.delete(room.code);
    }else{
      sendPlayers(room);
    }
  });
});

server.listen(PORT, () => {
  console.log("Cat Explorer server is running on port " + PORT);
});
