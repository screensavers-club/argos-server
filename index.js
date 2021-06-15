const express = require("express");
const { ExpressPeerServer } = require("peer");
const cors = require("cors");

const app = express();

app.use(cors());

const server = app.listen(9000);
const peerServer = ExpressPeerServer(server, { path: "/myapp", debug: true });

app.use("/peerjs", peerServer);

peerServer.on("connection", (client) => {
  let { id, token } = client;
  console.log({ id, token });
});

peerServer.on("disconnect", (client) => {
  console.log(client.id, client.token, "disconnected");
});
