import { useEffect, useState } from "react";
import {
  createNote,
  deleteNote as deleteStoredNote,
  listNotes,
  updateNote,
} from "../api/notes";

export function useNotes({ demoItems, isDemo, setError, user }) {
  const [items, setItems] = useState(() => (isDemo ? demoItems : []));
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const userId = user?.id;

  useEffect(() => {
    if (isDemo) return undefined;

    if (!userId) {
      setItems([]);
      setSelectedIds([]);
      setIsLoading(false);
      return undefined;
    }

    let isMounted = true;
    setItems([]);
    setSelectedIds([]);
    setIsLoading(true);
    setError("");

    listNotes(userId)
      .then((savedNotes) => {
        if (!isMounted) return;
        setItems(savedNotes);
        setSelectedIds([]);
      })
      .catch((error) => {
        if (isMounted) setError(error.message);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isDemo, setError, userId]);

  async function save(nextItem, editingId) {
    if (!userId) throw new Error("Sign in before saving notes.");

    const savedItem = isDemo
      ? nextItem
      : editingId
        ? await updateNote(editingId, nextItem, userId)
        : await createNote(nextItem, userId);

    setItems((current) =>
      editingId
        ? current.map((item) => (item.id === editingId ? savedItem : item))
        : [savedItem, ...current]
    );
    setSelectedIds((current) =>
      current.filter((id) => id !== savedItem.id)
    );
    setError("");
    return savedItem;
  }

  async function createImportedNote(nextItem) {
    if (!userId) throw new Error("Sign in before importing notes.");

    const savedItem = isDemo
      ? { ...nextItem, id: crypto.randomUUID() }
      : await createNote(nextItem, userId);
    setItems((current) => [savedItem, ...current]);
    setError("");
    return savedItem;
  }

  async function persistOptimisticUpdate(currentItem, nextItem) {
    setItems((current) =>
      current.map((item) => (item.id === currentItem.id ? nextItem : item))
    );

    if (isDemo) {
      setError("");
      return;
    }

    try {
      const savedItem = await updateNote(currentItem.id, nextItem, userId);
      setItems((current) =>
        current.map((item) =>
          item.id === currentItem.id ? savedItem : item
        )
      );
      setError("");
    } catch (error) {
      setError(error.message);
      setItems((current) =>
        current.map((item) =>
          item.id === currentItem.id ? currentItem : item
        )
      );
    }
  }

  async function markReviewed(item, delta) {
    if (!userId) return;

    await persistOptimisticUpdate(item, {
      ...item,
      confidence: Math.min(
        4,
        Math.max(1, Number(item.confidence) + delta)
      ),
      lastReviewed: "Today",
    });
  }

  async function recordQuizCorrect(itemId, isCorrect) {
    if (!isCorrect || !userId) return;

    const currentItem = items.find((item) => item.id === itemId);
    if (!currentItem) return;

    await persistOptimisticUpdate(currentItem, {
      ...currentItem,
      confidence: Math.min(4, Number(currentItem.confidence) + 1),
      lastReviewed: "Today",
    });
  }

  async function setStudyConfidence(itemId, nextConfidence) {
    if (!userId) return;

    const currentItem = items.find((item) => item.id === itemId);
    if (!currentItem) return;

    await persistOptimisticUpdate(currentItem, {
      ...currentItem,
      confidence: Math.min(4, Math.max(1, Number(nextConfidence))),
      lastReviewed: "Today",
    });
  }

  function toggleSelected(id) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id]
    );
  }

  function selectItems(ids, shouldSelect) {
    setSelectedIds((current) => {
      if (!shouldSelect) {
        return current.filter((id) => !ids.includes(id));
      }

      return Array.from(new Set([...current, ...ids]));
    });
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  async function deleteOne(itemId) {
    if (!userId) return;

    try {
      if (!isDemo) await deleteStoredNote(itemId, userId);
      setItems((current) => current.filter((item) => item.id !== itemId));
      setSelectedIds((current) => current.filter((id) => id !== itemId));
      setError("");
    } catch (error) {
      setError(error.message);
    }
  }

  async function deleteSelected() {
    if (!userId || selectedIds.length === 0) return;

    try {
      if (!isDemo) {
        await Promise.all(
          selectedIds.map((id) => deleteStoredNote(id, userId))
        );
      }
      setItems((current) =>
        current.filter((item) => !selectedIds.includes(item.id))
      );
      setSelectedIds([]);
      setError("");
    } catch (error) {
      setError(error.message);
    }
  }

  return {
    clearSelection,
    createImportedNote,
    deleteOne,
    deleteSelected,
    isLoading,
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
