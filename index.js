/*@prettier */
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const uuid = require("uuid");
const _ = require("lodash");

const livekitApi = require("livekit-server-api");
const AccessToken = livekitApi.AccessToken;
const RoomServiceClient = livekitApi.RoomServiceClient;

const generateRoomNames = require("./util/generateRoomNames");

const app = express();
app.use(cors());
app.use(express.json());

//TODO: Frontdesk needs persistent data layer
// e.g. save to a database

const FrontDesk = {
  _rooms: [],

  addRoom: function ({ room, passcode }) {
    this._rooms.push({ name: room, passcode });
  },

  setMix: function ({ room, childSid, mix }) {
    let _room = this._rooms.find((r) => r.name === room);
    if (!_room.mix) {
      _room.mix = {};
    }
    _room.mix[childSid] = mix;
    return this.getMix({ room, childSid });
  },

  getMix: function ({ room, childSid }) {
    let _room = this._rooms.find((r) => r.name === room);
    return _.get(_room, `mix['${childSid}']`, null);
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

app.post("/:room/:child_sid/layout", (req, res) => {});

app.get("/:room/:child_sid/mix", (req, res) => {
  const roomName = req.params.room;
  const childSid = req.params.child_sid;

  let mixState = FrontDesk.getMix({ room: roomName, childSid });

  res.send({ mix: mixState });
});

app.post("/:room/:child_sid/mix", (req, res) => {
  const roomName = req.params.room;
  const childSid = req.params.child_sid;
  const mix = req.body.mix;

  res.send({ mix: FrontDesk.setMix({ room: roomName, childSid, mix }) });
});

app.post("/session/new", (req, res) => {
  // TODO: validate with secret in header?
  let identity = uuid.v4();
  res.send({ identity });
});

app.get("/rooms", (req, res) => {
  svc.listRooms().then((result) => {
    const rooms = result;
    Promise.all(
      rooms.map(({ name }) => {
        return svc.listParticipants(name).then((participants) => ({
          children: participants.filter(
            (p) => JSON.parse(p.metadata)?.type === "CHILD"
          ),
          room: name,
        }));
      })
    )
      .then((results) => {
        console.log(results);
        res.send(results);
      })
      .catch((err) => res.status(500).send({ err }));
  });
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

app.post(
  ["/parent/room/join", "/child/room/join", "/viewer/room/join"],
  (req, res) => {
    let { identity, room, passcode } = req.body;
    let isChild = req.path === "/child/room/join";
    let isViewer = req.path === "/viewer/room/join";

    if (!FrontDesk.hasRoom({ room })) {
      res.status(400).send({ err: `No such room ${room}` });
      return;
    }

    svc.listParticipants(room).then((participants) => {
      /*
    if (
      !!participants.find((participant) => participant.identity === identity)
    ) {
      res.status(400).send({
        err: `Participant of identity "${identity}" already connected. `,
      });
      return;
    }
    */

      if (!FrontDesk.accessRoom({ room, passcode })) {
        res.status(403).send({
          err: `Wrong passcode provided for room ${room}`,
        });
        return;
      }

      let token;

      if (isChild) {
        token = createChildToken(identity, room);
      } else if (isViewer) {
        token = createViewerToken(identity, room);
      } else {
        token = createParentToken(identity, room);
      }

      res.send({ token });
    });
  }
);

app.post("/parent/participant/set-delay", (req, res) => {
  let { id, delay, room } = req.body;
  console.log({ id, delay, room });
  svc
    .getParticipant(room, id)
    .then((child) => {
      let _md = JSON.parse(child.metadata);
      svc
        .updateParticipant(
          room,
          id,
          JSON.stringify({
            ..._md,
            audio_delay: delay,
          })
        )
        .then((result) => {
          console.log(result);
          res.status(200).send({ success: true });
        });
    })
    .catch((err) => res.status(400).send({ err }));
});

app.post("/child/participant/set-nickname", (req, res) => {
  let { nickname, identity, room } = req.body;
  svc
    .updateParticipant(
      room,
      identity,
      JSON.stringify({ type: "CHILD", nickname })
    )
    .then((result) => {
      if (result) {
        console.log({ type: "CHILD", nickname });
        res.status(200).send({ success: true });
        return;
      } else {
        res.status(403).send({ err: "Set nickname failed" });
        return;
      }
    })
    .catch((err) => {
      console.log(err);
      res.status(403).send({ err, message: "Set nickname failed" });
    });
});

app.get("/inspect-rooms", (req, res) => {
  res.send(FrontDesk.inspectRooms());
});

const createParentToken = (identity, room) => {
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    {
      identity,
      metadata: JSON.stringify({ type: "PARENT" }),
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
      metadata: JSON.stringify({ type: "CHILD" }),
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

const createViewerToken = (identity, room) => {
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    {
      identity: uuid.v4(),
      metadata: JSON.stringify({ type: "VIEWER" }),
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

app.listen(3001);
