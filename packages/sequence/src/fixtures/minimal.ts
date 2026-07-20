import type { SequenceDocument } from "../schema";

export const minimal: SequenceDocument = {
  version: 1,
  id: "minimal",
  participants: [
    { id: "p1", name: "client", kind: "actor" },
    { id: "p2", name: "service", kind: "participant" },
  ],
  items: [
    {
      kind: "message",
      id: "m1",
      from: "p1",
      to: "p2",
      line: "sync",
      text: "request",
    },
    {
      kind: "message",
      id: "m2",
      from: "p2",
      to: "p1",
      line: "return",
      text: "response",
    },
  ],
  style: {},
};

