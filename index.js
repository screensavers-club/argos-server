const livekitApi = require("livekit-server-api");
require("dotenv").config();
const AccessToken = livekitApi.AccessToken;
const RoomServiceClient = livekitApi.RoomServiceClient;
const express = require("express");
const cors = require("cors");
const generateRoomNames = require("./util/generateRoomNames");
const uuid = require("uuid");

const app = express();
app.use(cors());
app.use(express.json());

//TODO: Frontdesk needs persistent data layer
const FrontDesk = {
  _rooms: [],
  addRoom: function ({ room, passcode }) {
    this._rooms.push({ name: room, passcode });
  },

  hasRoom: function ({ room }) {
    return this._rooms.findIndex((r) => r.name === room) > -1;
  },

  inspectRooms: function () {
    return this._rooms;
  },
  accessRoom: function ({ room: roomName, passcode }) {
    const _room = this._rooms.find((room) => room.name === roomName);
    if (!_room) {
      return false;
    }
    return _room.passcode === passcode;
  },
};

const svc = new RoomServiceClient(
  process.env.LIVEKIT_HOST,
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET
);

app.post("/session/new", (req, res) => {
  // TODO: validate with secret in header?
  let identity = uuid.v4();
  res.send({ identity });
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

app.get("/generate-room-name", (req, res) => {
  svc.listRooms().then((rooms) => {
    const candidates = generateRoomNames();
    const firstCandidate = candidates.find(
      (c) => !rooms.find((room) => room.name === c)
    );

    if (firstCandidate) {
      res.send({ name: firstCandidate });
    } else {
      res.status(400).send({ err: "Couldn't generate a room name. Try again" });
    }
  });
});

app.post("/parent/room/new", (req, res) => {
  let { room: newRoom, passcode, identity } = req.body || {};
  if (!newRoom || !passcode || !identity) {
    res.status(400).send({
      err: "Need both room name and password, and an identity to create room.",
    });
    return;
  }

  svc
    .listRooms()
    .then((rooms) => {
      if (!!rooms.find((room) => room.name === newRoom)) {
        res.status(401).send({
          err: `Room ${newRoom} cannot be created because it already exists.`,
        });
        return;
      }

      FrontDesk.addRoom({ room: newRoom, passcode });
      const token = createParentToken(identity, newRoom);
      res.send({ token });
    })
    .catch((err) => {
      console.log({ err });
      res.status(401).send({
        err: `Problem checking existing against rooms.`,
        info: err,
      });
    });
});

app.post("/parent/room/join", (req, res) => {
  let { identity, room, passcode } = req.body;

  if (!FrontDesk.hasRoom({ room })) {
    res.status(400).send({ err: `No such room ${room}` });
    return;
  }

  svc.listParticipants(room).then((participants) => {
    if (
      !!participants.find((participant) => participant.identity === identity)
    ) {
      res.status(400).send({
        err: `Participant of identity "${identity}" already connected. `,
      });
      return;
    }

    if (!FrontDesk.accessRoom({ room, passcode })) {
      res.status(403).send({
        err: `Wrong passcode provided for room ${room}`,
      });
      return;
    }

    const token = createParentToken(identity, room);
    res.send({ token });
  });
});

app.post("/child/room/join", (req, res) => {
  let { identity, room, passcode } = req.body;

  if (!FrontDesk.hasRoom({ room })) {
    res.status(400).send({ err: `No such room ${room}` });
    return;
  }

  svc.listParticipants(room).then((participants) => {
    if (
      !!participants.find((participant) => participant.identity === identity)
    ) {
      res.status(400).send({
        err: `Participant of identity "${identity}" already connected. `,
      });
      return;
    }

    if (!FrontDesk.accessRoom({ room, passcode })) {
      res.status(403).send({
        err: `Wrong passcode provided for room ${room}`,
      });
      return;
    }

    const token = createChildToken(identity, room);
    res.send({ token });
  });
});

app.get("/inspect-rooms", (req, res) => {
  res.send(FrontDesk.inspectRooms());
});

app.listen(3001);

const createParentToken = (identity, room) => {
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    {
      identity,
    }
  );
  at.addGrant({
    roomJoin: true,
    room: room,
    canPublish: true,
    canSubscribe: true,
  });
  return (token = at.toJwt());
};

const createChildToken = (identity, room) => {
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    {
      identity,
    }
  );
  at.addGrant({
    roomJoin: true,
    room: room,
    canPublish: false,
    canSubscribe: true,
  });
  return (token = at.toJwt());
};
