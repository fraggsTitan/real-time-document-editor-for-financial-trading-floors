import { GapBuffer, PieceTable, Rope } from "./ds.js";

// ---------------------- Editor Controller ----------------------
const editor = document.getElementById("editor");
const cursorInfo = document.getElementById("cursorInfo");
const dsStatus = document.getElementById("dsStatus");

// Initialize data structures
let gapBuffer = new GapBuffer();
let pieceTable = new PieceTable();
let rope = new Rope();

let prevText = "";

// ---------------------- Undo / Redo ----------------------
function syncAllStructures(text) {
  // Reset GapBuffer
  gapBuffer = new GapBuffer();
  gapBuffer.insertAtCursor(text);

  // Reset Rope
  rope = new Rope();
  rope.insertAtCursor(text);

  // PieceTable is already updated during undo/redo
}

document.getElementById("undoBtn").addEventListener("click", () => {
  pieceTable.undo();
  const text = pieceTable.getText();
  editor.value = text;
  prevText = text;

  // Sync other structures
  syncAllStructures(text);

  dsStatus.innerText = "Current Operation: Undo via Piece Table";
});

document.getElementById("redoBtn").addEventListener("click", () => {
  pieceTable.redo();
  const text = pieceTable.getText();
  editor.value = text;
  prevText = text;

  // Sync other structures
  syncAllStructures(text);

  dsStatus.innerText = "Current Operation: Redo via Piece Table";
});

// ---------------------- Save ----------------------
document.getElementById("saveBtn").addEventListener("click", () => {
  const text = editor.value;
  fetch("/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: text }),
  })
    .then(res => res.json())
    .then(data => alert("Saved: " + data.status));
});

// ---------------------- Typing Listener ----------------------
editor.addEventListener("input", () => {
  const text = editor.value;
  const cursor = editor.selectionStart;

  let inserted = "";
  let deleted = 0;

  if (text.length > prevText.length) {
    inserted = text.slice(prevText.length);
  } else if (text.length < prevText.length) {
    deleted = prevText.length - text.length;
  }

  // ---------------------- Cursor movement ----------------------
  const insertPos = cursor - inserted.length;

  gapBuffer.moveCursor(insertPos);
  pieceTable.moveCursor(insertPos);
  rope.moveCursor(insertPos);

  // ---------------------- Insert ----------------------
  if (inserted.length > 0) {
    gapBuffer.insertAtCursor(inserted);
    pieceTable.insertAtCursor(inserted);
    rope.insertAtCursor(inserted);
    dsStatus.innerText = `Inserted "${inserted}" in all structures`;
  }

  // ---------------------- Delete ----------------------
  if (deleted > 0) {
    gapBuffer.moveCursor(cursor);
    gapBuffer.deleteAtCursor(deleted);

    pieceTable.moveCursor(cursor);
    for (let i = 0; i < deleted; i++) pieceTable.deleteAtCursor();

    rope.moveCursor(cursor);
    rope.deleteAtCursor(deleted);

    dsStatus.innerText = `Deleted ${deleted} character(s) in all structures`;
  }

  cursorInfo.innerText = `Cursor Position (Gap Buffer): ${gapBuffer.cursor}`;
  prevText = text;
});

