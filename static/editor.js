import { GapBuffer, PieceTable, Rope } from "./ds.js";

// ---------------------- Editor Controller ----------------------
let editor = document.getElementById("editor");
const cursorInfo = document.getElementById("cursorInfo");
const dsStatus = document.getElementById("dsStatus");

let gapBuffer = new GapBuffer();
let pieceTable = new PieceTable();
let rope = new Rope();

let prevText = "";

// Undo/Redo via Piece Table
document.getElementById("undoBtn").addEventListener("click", () => {
  pieceTable.undo();
  const text = pieceTable.getText();
  editor.value = text;
  prevText = text;
  dsStatus.innerText = "Current Operation: Undo via Piece Table";
});

document.getElementById("redoBtn").addEventListener("click", () => {
  pieceTable.redo();
  const text = pieceTable.getText();
  editor.value = text;
  prevText = text;
  dsStatus.innerText = "Current Operation: Redo via Piece Table";
});

// Save button
document.getElementById("saveBtn").addEventListener("click", () => {
  const text = editor.value;
  fetch("/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: text }),
  }).then(res => res.json()).then(data => alert("Saved: " + data.status));
});

// Typing listener
editor.addEventListener("input", (e) => {
  const text = editor.value;
  const cursor = editor.selectionStart;

  let inserted = "";
  let deleted = 0;

  if (text.length > prevText.length) inserted = text.slice(prevText.length);
  else if (text.length < prevText.length) deleted = prevText.length - text.length;

  // Gap Buffer
  if (inserted.length > 0) {
    for (let i = 0; i < inserted.length; i++) {
      gapBuffer.moveCursor(cursor - inserted.length + i);
      gapBuffer.insertAtCursor(inserted[i]);
      dsStatus.innerText = "Current Operation: Inserting via Gap Buffer";
    }
  } else if (deleted > 0) {
    for (let i = 0; i < deleted; i++) {
      gapBuffer.moveCursor(cursor + i);
      gapBuffer.deleteAtCursor();
      dsStatus.innerText = "Current Operation: Deleting via Gap Buffer";
    }
  }

  // Piece Table
  if (inserted.length > 0) {
    for (let i = 0; i < inserted.length; i++)
      pieceTable.insertAtCursor(inserted[i], cursor - inserted.length + i);
  } else if (deleted > 0) {
    for (let i = 0; i < deleted; i++)
      pieceTable.deleteAtCursor(cursor + i);
  }

  // Rope
  if (inserted.length > 0) {
    for (let i = 0; i < inserted.length; i++) {
      rope.insertAtCursor(inserted[i], cursor - inserted.length + i);
      dsStatus.innerText += " | Rope updated";
    }
  } else if (deleted > 0) {
    for (let i = 0; i < deleted; i++) {
      rope.deleteAtCursor(cursor + i, 1);
      dsStatus.innerText += " | Rope updated";
    }
  }

  cursorInfo.innerText = `Cursor Position (Gap Buffer): ${gapBuffer.cursor}`;
  prevText = text;
});
