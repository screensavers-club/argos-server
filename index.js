const livekitApi = require("livekit-server-api");
require("dotenv").config();
const AccessToken = livekitApi.AccessToken;
const RoomServiceClient = livekitApi.RoomServiceClient;
const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());

const livekitHost = "http://localhost:7880";
const svc = new RoomServiceClient(
  livekitHost,
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET
);

app.get("/", (req, res) => {
  const roomName = "name-of-room";
  const participantName = "user-name";
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    {
      identity: participantName,
    }
  );
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: false,
    canSubscribe: true,
  });
  const token = at.toJwt();
  res.send({ token });
});

app.get("/rooms", (req, res) => {
  svc.listRooms().then((result) => res.send(result));
});

app.get("/participants", (req, res) => {
  svc
    .listParticipants("name-of-room")
    .then((result) => {
      res.send(result);
    })
    .catch((err) => res.send({ err }));
});

app.listen(3001);
