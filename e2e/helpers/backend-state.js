import { ids } from "../fixtures/accounts.js";

export const notePatches = (backend, noteId) => backend.ledger.filter((entry) => entry.resource === "notes" && entry.method === "PATCH" && entry.noteId === noteId);

export const storedNote = (backend, noteId) => backend.accounts[ids.A].notes.find((note) => note.id === noteId);

export const aiRequests = (backend) => backend.ledger.filter((entry) => entry.resource === "ai");
