/*@prettier */
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const uuid = require("uuid");
const _ = require("lodash");

const LivekitSdk = require("livekit-server-sdk");
const AccessToken = LivekitSdk.AccessToken;
const RoomServiceClient = LivekitSdk.RoomServiceClient;

const generateRoomNames = require("./util/generateRoomNames");

const app = express();
app.use(cors());
app.use(express.json());

const svc = new RoomServiceClient(
  process.env.LIVEKIT_HOST,
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET
);

//TODO: Frontdesk needs persistent data layer
// e.g. save to a database

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const FrontDesk = {
  _rooms: [],

  addRoom: function ({ room, passcode }) {
    this._rooms.push({ name: room, passcode });
  },

  getMix: function ({ room, nickname }) {
    let _room = this._rooms.find((r) => r.name === room);
    return _.get(_room, `mix['${nickname}']`, null);
  },

  setMix: function ({ room, nickname, mix }) {
    let _room = this._rooms.find((r) => r.name === room);
    if (!_room.mix) {
      _room.mix = {};
    }
    _room.mix[nickname] = mix;
    return this.getMix({ room, nickname });
  },

  saveMix: function ({ room, slot }) {
    let _room = this._rooms.find((r) => r.name === room);
    let _mix = { ..._.get(_room, "mix", {}) };
    if (!_room.mixSlots) {
      _room.mixSlots = {};
    }
    _room.mixSlots[`slot${slot}`] = _mix;
  },

  loadMix: function ({ room, slot }) {
    let _room = this._rooms.find((r) => r.name === room);
    let _mix = { ..._.get(_room, `mixSlots["slot${slot}"]`, {}) };
    if (_mix === {}) {
      return;
    }
    _room.mix = _mix;
  },

  getLayout: function ({ room, nickname }) {
    let _room = this._rooms.find((r) => r.name === room);
    return _.get(_room, `layout['${nickname}']`, null);
  },

  setLayout: function ({ room, nickname, layout }) {
    let _room = this._rooms.find((r) => r.name === room);
    if (!_room.layout) {
      _room.layout = {};
    }
    _room.layout[nickname] = layout;
    return this.getLayout({ room, nickname });
  },

  saveLayout: function ({ room, slot }) {
    let _room = this._rooms.find((r) => r.name === room);
    let _layout = { ..._.get(_room, "layout", {}) };
    if (!_room.layoutSlots) {
      _room.layoutSlots = {};
    }
    _room.layoutSlots[`slot${slot}`] = _layout;
  },

  loadLayout: function ({ room, slot }) {
    let _room = this._rooms.find((r) => r.name === room);
    let _layout = { ..._.get(_room, `layoutSlots["slot${slot}"]`, {}) };
    _room.layout = _layout;
  },

  getRoomState: function ({ room }) {
    let _room = this._rooms.find((r) => r.name === room);
    return _room;
  },

  setRoomState: function ({ room, roomState }) {
    return new Promise((resolve, reject) => {
      let _room = this._rooms.find((r) => r.name === room);

      if (!_room) {
        reject({ error: "No matching room to load settings into" });
      }
      let _rooms = [...this._rooms];
      this._rooms = _rooms.map((r) => {
        if (r.name === room) {
          return { ...roomState, name: r.name, passcode: r.passcode };
        } else {
          return r;
        }
      });
      resolve({ ok: true });
    });
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

app.get("/:room/:nickname/layout", (req, res) => {
  const roomName = req.params.room;
  const nickname = req.params.nickname;

  let layout = FrontDesk.getLayout({ room: roomName, nickname });

  res.send({ layout });
});

app.post("/:room/:nickname/layout", (req, res) => {
  const roomName = req.params.room;
  const nickname = req.params.nickname;
  const layout = req.body.layout;

  res.send({
    layout: FrontDesk.setLayout({ room: roomName, nickname, layout }),
  });
});

app.post("/:room/mix/save/:slot", (req, res) => {
  const slot = req.params.slot;
  const roomName = req.params.room;
  FrontDesk.saveMix({ room: roomName, slot });
  res.send({ received: true });
});

app.post("/:room/mix/load/:slot", (req, res) => {
  const slot = req.params.slot;
  const roomName = req.params.room;
  FrontDesk.loadMix({ room: roomName, slot });
  res.send({ received: true });
});

app.post("/:room/layout/save/:slot", (req, res) => {
  const slot = req.params.slot;
  const roomName = req.params.room;
  FrontDesk.saveLayout({ room: roomName, slot });
  res.send({ received: true });
});

app.post("/:room/layout/load/:slot", (req, res) => {
  const slot = req.params.slot;
  const roomName = req.params.room;
  FrontDesk.loadLayout({ room: roomName, slot });
  res.send({ received: true });
});

app.get("/:room/state", (req, res) => {
  const roomName = req.params.room;
  const roomState = FrontDesk.getRoomState({ room: roomName });
  res.send({ roomState });
});

app.post("/:room/state", (req, res) => {
  const roomName = req.params.room;
  const roomState = req.body.roomState;
  FrontDesk.setRoomState({ room: roomName, roomState }).then(() => {
    res.send({ ok: true });
  });
});

app.get("/:room/:nickname/mix", (req, res) => {
  const roomName = req.params.room;
  const nickname = req.params.nickname;

  let mixState = FrontDesk.getMix({ room: roomName, nickname });

  res.send({ mix: mixState });
});

app.post("/:room/:nickname/mix", (req, res) => {
  const roomName = req.params.room;
  const nickname = req.params.nickname;
  const mix = req.body.mix;

  res.send({ mix: FrontDesk.setMix({ room: roomName, nickname, mix }) });
});

app.post("/session/new", (req, res) => {
  // TODO: validate with secret in header?
  let identity = uuid.v4();
  res.send({ identity });
});

app.get("/rooms", (req, res) => {
  svc.listRooms().then((result) => {
    const rooms = result.filter((room) => {
      return FrontDesk.hasRoom({ room: room.name });
    });
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
