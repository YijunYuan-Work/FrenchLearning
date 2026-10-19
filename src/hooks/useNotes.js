import { useCallback, useEffect, useRef, useState } from "react";
import { changedNoteFields, createNoteMutationQueue } from "../utils/noteMutations";
import {
  createNote,
  deleteNote as deleteStoredNote,
  listNotes,
  updateNote,
} from "../api/notes";

export function useNotes({ demoItems, isDemo, isCurrentAccount, setError, user }) {
  const [items, setItemsState] = useState(() => (isDemo ? demoItems : []));
  const itemsRef = useRef(items);
  const [mutateNote] = useState(() => createNoteMutationQueue(isCurrentAccount));
  const setItems = useCallback((update) => {
    const next = typeof update === "function" ? update(itemsRef.current) : update;
    itemsRef.current = next;
    setItemsState(next);
  }, []);
  const [loadState, setLoadState] = useState({ userId: null, status: "idle", error: "" });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const deletingRef = useRef(false);
  const pendingDeleteIds = useRef(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletionResult, setDeletionResult] = useState(null);
  const userId = user?.id;

  useEffect(() => {
    if (isDemo) return undefined;

    if (!userId) {
      setItems([]);
      setSelectedIds([]);
      setLoadState({ userId: null, status: "idle", error: "" });
      return undefined;
    }

    let isMounted = true;
    setItems([]);
    setSelectedIds([]);
    setLoadState({ userId, status: "loading", error: "" });
    setError("");

    listNotes(userId, { isCurrent: isCurrentAccount })
      .then((savedNotes) => {
        if (!isMounted || !isCurrentAccount()) return;
        setItems(savedNotes);
        setSelectedIds([]);
        setLoadState({ userId, status: "ready", error: "" });
      })
      .catch((error) => {
        if (isMounted && isCurrentAccount()) setLoadState({ userId, status: "error", error: error.message || "Could not load notes." });
      });

    return () => {
      isMounted = false;
    };
  }, [isCurrentAccount, isDemo, loadAttempt, setError, setItems, userId]);

  const retryLoad = useCallback(() => setLoadAttempt((current) => current + 1), []);
  const isLoaded = isDemo || (loadState.userId === userId && loadState.status === "ready");
  const loadError = !isDemo && loadState.userId === userId ? loadState.error : "";

  async function save(nextItem, editingId, originalItem) {
    if (!isCurrentAccount()) throw new Error("The account changed. Reopen the note before saving.");
    if (!userId) throw new Error("Sign in before saving notes.");

    if (editingId) {
      const patch = changedNoteFields(nextItem, originalItem ?? itemsRef.current.find((item) => item.id === editingId));
      const saved = await persistPatch(editingId, () => patch);
      setSelectedIds((current) => current.filter((id) => id !== editingId));
      setError("");
      return saved;
    }
    const savedItem = isDemo
      ? nextItem
      : await createNote(nextItem, userId);

    if (!isCurrentAccount()) throw new Error("The account changed before the note finished saving.");
    setItems((current) => [savedItem, ...current]);
    setSelectedIds((current) =>
      current.filter((id) => id !== savedItem.id)
    );
    setError("");
    return savedItem;
  }

  async function createImportedNote(nextItem) {
    if (!isCurrentAccount()) throw new Error("The account changed. Start a new import.");
    if (!userId) throw new Error("Sign in before importing notes.");

    const savedItem = isDemo
      ? { ...nextItem, id: crypto.randomUUID() }
      : await createNote(nextItem, userId);
    if (!isCurrentAccount()) throw new Error("The account changed before the import finished saving.");
    setItems((current) => [savedItem, ...current]);
    setError("");
    return savedItem;
  }

  function persistPatch(itemId, getPatch) {
    if (pendingDeleteIds.current.has(itemId)) return Promise.reject(new Error("This note is being deleted. Wait before editing it."));
    return mutateNote(itemId, async () => {
      if (pendingDeleteIds.current.has(itemId)) throw new Error("This note is being deleted. Wait before editing it.");
      const item = itemsRef.current.find((entry) => entry.id === itemId);
      if (!item) throw new Error("This note is no longer available.");
      const patch = getPatch(item);
      if (Object.keys(patch).length === 0) return item;
      const saved = isDemo ? { ...item, ...patch } : await updateNote(itemId, patch, userId, { isCurrent: isCurrentAccount });
      if (!isCurrentAccount()) throw new Error("The account changed before the note finished saving.");
      // Merge only fields owned by this operation, never a whole delayed row.
      const confirmed = Object.fromEntries(Object.keys(patch).map((key) => [key, saved[key]]));
      setItems((current) => current.map((entry) => entry.id === itemId ? { ...entry, ...confirmed } : entry));
      const result = itemsRef.current.find((entry) => entry.id === itemId);
      if (!result) throw new Error("This note is no longer available.");
      return result;
    });
  }

  async function markReviewed(item, delta) {
    if (!userId) return;

    try {
      await persistPatch(item.id, (current) => ({
        confidence: Math.min(4, Math.max(1, Number(current.confidence) + delta)), lastReviewed: "Today",
      }));
      if (isCurrentAccount()) setError("");
    } catch (error) { if (isCurrentAccount()) setError(error.message); }
  }

  async function recordQuizCorrect(itemId, targetConfidence) {
    if (!userId) throw new Error("Sign in before answering the quiz.");
    const target = Number(targetConfidence);
    if (!Number.isInteger(target) || target < 1 || target > 4) throw new Error("The quiz confidence target is invalid.");
    const saved = await persistPatch(itemId, (current) => ({
      confidence: Math.min(4, Math.max(Number(current.confidence), Number(targetConfidence))),
      lastReviewed: "Today",
    }));
    if (Number(saved.confidence) < target) throw new Error("The confidence update was not confirmed.");
    return saved;
  }

  async function setStudyConfidence(itemId, nextConfidence) {
    if (!userId) return;

    try {
      await persistPatch(itemId, () => ({
        confidence: Math.min(4, Math.max(1, Number(nextConfidence))), lastReviewed: "Today",
      }));
      if (isCurrentAccount()) setError("");
    } catch (error) { if (isCurrentAccount()) setError(error.message); }
  }

  function toggleSelected(id) {
    if (deletingRef.current) return;
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id]
    );
  }

  function selectItems(ids, shouldSelect) {
    if (deletingRef.current) return;
    setSelectedIds((current) => {
      if (!shouldSelect) {
        return current.filter((id) => !ids.includes(id));
      }

      return Array.from(new Set([...current, ...ids]));
    });
  }

  function clearSelection() {
    if (deletingRef.current) return;
    setSelectedIds([]);
  }

  function deleteOne(itemId) {
    return deleteNotes([itemId]);
  }

  function deleteSelected() {
    return deleteNotes(selectedIds);
  }

  async function deleteNotes(requestedIds) {
    if (!userId || deletingRef.current || !isCurrentAccount()) return;
    const existingIds = new Set(itemsRef.current.map((item) => item.id));
    const ids = [...new Set(requestedIds)].filter((id) => existingIds.has(id));
    if (!ids.length) return;

    deletingRef.current = true;
    pendingDeleteIds.current = new Set(ids);
    setIsDeleting(true);
    setDeletionResult(null);
    const result = { deleted: 0, failed: 0, failedIds: [] };
    // Register deletes immediately in the API's owner-scoped write queue, so
    // returning to this account also waits for already-started deletions.
    await Promise.all(ids.map(async (id) => {
      try {
        if (!isDemo) await deleteStoredNote(id, userId, { isCurrent: isCurrentAccount });
        result.deleted += 1;
        if (!isCurrentAccount()) return;
        setItems((current) => current.filter((item) => item.id !== id));
        setSelectedIds((current) => current.filter((selectedId) => selectedId !== id));
      } catch {
        result.failed += 1;
        result.failedIds.push(id);
        if (isCurrentAccount()) setSelectedIds((current) => [...new Set([...current, id])]);
      } finally {
        pendingDeleteIds.current.delete(id);
      }
    }));
    deletingRef.current = false;
    if (isCurrentAccount()) {
      setIsDeleting(false);
      setDeletionResult(result);
      setSelectedIds((current) => [...new Set([...current, ...result.failedIds])]);
    }
  }

  return {
    clearSelection,
    createImportedNote,
    deleteOne,
    deleteSelected,
    retryFailedDeletions: () => deleteNotes(deletionResult?.failedIds ?? []),
    deletionResult,
    isDeleting,
    isLoading: !isDemo && Boolean(userId) && !isLoaded && !loadError,
    isLoaded,
    loadError,
    retryLoad,
    items,
    markReviewed,
    recordQuizCorrect,
    save,
    selectedIds,
    selectItems,
    setStudyConfidence,
    toggleSelected,
  };
}
